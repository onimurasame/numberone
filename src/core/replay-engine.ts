import path from 'node:path';
import { GENESIS_HASH, hashObject } from './hash.js';
import { StreamStore } from './stream-store.js';
import {
  DecisionRecord,
  DirectiveRecord,
  IssueRecord,
  KnowledgePractice,
  LessonRecord,
  OfficerRole,
  OfficerStateProjection,
  StreamEvent,
  WorkspaceProjection
} from './types.js';
import { atomicWriteJsonSync, readJsonSafe } from '../utils/fs-helpers.js';
import { isSafeRecordKey } from '../utils/redactor.js';

export interface ReplayOptions {
  untilSeq?: number;
  untilTimestamp?: string;
  persistSnapshot?: boolean;
}

const OFFICER_DEFAULT_KPIS: Record<OfficerRole, string> = {
  engineering: 'runtime_readiness_score',
  security: 'security_posture_score',
  bridge: 'continuous_delivery_score'
};

export const PROJECTION_VERSION = 3;

const MAX_THINKING_RECORDS = 250;
const MAX_FAILED_ATTEMPTS = 250;
const MAX_RESOLVED_CRASHES = 250;
const MAX_KPI_HISTORY = 250;
const MAX_SESSIONS_SEEN = 500;
const MAX_RELATED_EVENT_IDS = 100;

function nullRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function hydrateNullRecord<T>(src: unknown): Record<string, T> {
  const out = nullRecord<T>();
  if (src && typeof src === 'object' && !Array.isArray(src)) {
    for (const [k, v] of Object.entries(src as Record<string, T>)) {
      if (isSafeRecordKey(k)) {
        out[k] = v;
      }
    }
  }
  return out;
}

function hasOwnSafe<T>(map: Record<string, T>, key: string): boolean {
  return isSafeRecordKey(key) && Object.prototype.hasOwnProperty.call(map, key);
}

function createEmptyOfficerProjection(role: OfficerRole): OfficerStateProjection {
  return {
    role,
    knowledgeVersion: 1,
    mainKpiName: OFFICER_DEFAULT_KPIS[role],
    currentKpiScore: null,
    kpiHistory: [],
    practices: nullRecord<KnowledgePractice>(),
    rejectedProposalsCount: 0
  };
}

export function createInitialProjection(workspaceRoot: string, rebuiltAt?: string): WorkspaceProjection {
  return {
    projectionVersion: PROJECTION_VERSION,
    workspaceRoot,
    rebuiltAt: rebuiltAt ?? new Date().toISOString(),
    lastSeq: 0,
    lastEventId: null,
    lastEventHash: GENESIS_HASH,
    eventCountsByType: nullRecord<number>(),
    harnessesSeen: [],
    actorsSeen: [],
    sessionsSeen: [],
    currentBranch: null,
    lastCommitSha: null,
    files: nullRecord(),
    lessons: nullRecord(),
    decisions: nullRecord(),
    directives: nullRecord(),
    issues: nullRecord(),
    crashes: [],
    recentExecutions: [],
    failedAttempts: [],
    intermediateThinking: [],
    officers: {
      engineering: createEmptyOfficerProjection('engineering'),
      security: createEmptyOfficerProjection('security'),
      bridge: createEmptyOfficerProjection('bridge')
    },
    partySessions: nullRecord(),
    syncState: nullRecord()
  };
}

export function computeProjectionDigest(state: WorkspaceProjection): string {
  const { snapshotDigest: _ignored, ...rest } = state;
  return hashObject(rest);
}

function hydrateCachedProjection(raw: WorkspaceProjection): WorkspaceProjection {
  return {
    ...raw,
    eventCountsByType: hydrateNullRecord(raw.eventCountsByType),
    files: hydrateNullRecord(raw.files),
    lessons: hydrateNullRecord(raw.lessons),
    decisions: hydrateNullRecord(raw.decisions),
    directives: hydrateNullRecord(raw.directives),
    issues: hydrateNullRecord(raw.issues),
    partySessions: hydrateNullRecord(raw.partySessions),
    syncState: hydrateNullRecord(raw.syncState),
    officers: {
      engineering: {
        ...raw.officers.engineering,
        practices: hydrateNullRecord(raw.officers.engineering?.practices)
      },
      security: {
        ...raw.officers.security,
        practices: hydrateNullRecord(raw.officers.security?.practices)
      },
      bridge: {
        ...raw.officers.bridge,
        practices: hydrateNullRecord(raw.officers.bridge?.practices)
      }
    }
  };
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isOfficerRole(value: unknown): value is OfficerRole {
  return value === 'engineering' || value === 'security' || value === 'bridge';
}

function addUnique(list: string[], item: string, maxLen?: number): void {
  if (item && !list.includes(item)) {
    list.push(item);
    if (maxLen && list.length > maxLen) {
      list.splice(0, list.length - maxLen);
    }
  }
}

function trimCrashesWindow(crashes: WorkspaceProjection['crashes']): void {
  const resolved = crashes.filter((c) => Boolean(c.resolvedByEventId));
  if (resolved.length <= MAX_RESOLVED_CRASHES) return;
  const unresolved = crashes.filter((c) => !c.resolvedByEventId);
  const keptResolved = resolved.slice(-MAX_RESOLVED_CRASHES);
  crashes.length = 0;
  crashes.push(...[...unresolved, ...keptResolved].sort((a, b) => a.seq - b.seq));
}

const GENERIC_DIRECTIVE_TAGS = new Set(['directive', 'advisory', 'mandatory', 'blocking']);

/**
 * Pure deterministic reducer: applies a single atomic StreamEvent to a WorkspaceProjection.
 * Enforces prototype-pollution guards (`isSafeRecordKey` + `Object.hasOwn`) and actor privilege boundaries.
 */
export function applyEventToProjection(state: WorkspaceProjection, event: StreamEvent): WorkspaceProjection {
  state.lastSeq = event.seq;
  state.lastEventId = event.id;
  state.lastEventHash = event.hash;
  if (isSafeRecordKey(event.type)) {
    state.eventCountsByType[event.type] =
      (hasOwnSafe(state.eventCountsByType, event.type) ? state.eventCountsByType[event.type]! : 0) + 1;
  }
  addUnique(state.harnessesSeen, event.harness, 100);
  addUnique(state.actorsSeen, `${event.actor.kind}:${event.actor.id}`, 200);
  addUnique(state.sessionsSeen, event.sessionId, MAX_SESSIONS_SEEN);

  const p = event.payload;
  const snapshotBlob = event.blobs.find((b) => b.key === 'snapshot');

  switch (event.type) {
    case 'workspace.snapshot': {
      if (Array.isArray(p.files)) {
        const seenPaths = new Set<string>();
        for (const item of p.files) {
          if (item && typeof item === 'object') {
            const rec = item as {
              path?: unknown;
              contentHash?: unknown;
              snapshotBlobHash?: unknown;
            };
            const filePath = asString(rec.path);
            if (!isSafeRecordKey(filePath)) continue;
            seenPaths.add(filePath);
            const existing = hasOwnSafe(state.files, filePath) ? state.files[filePath] : undefined;
            const nextHash = asString(rec.contentHash) || undefined;
            const unchanged = existing && existing.status === 'exists' && existing.lastHash === nextHash;
            state.files[filePath] = {
              path: filePath,
              status: 'exists',
              lastHash: nextHash ?? existing?.lastHash,
              lastSnapshotBlobHash: asString(rec.snapshotBlobHash) || existing?.lastSnapshotBlobHash,
              lastModifiedAt: unchanged ? existing.lastModifiedAt : event.timestamp,
              lastModifiedBy: unchanged ? existing.lastModifiedBy : event.actor,
              changeCount: unchanged ? existing.changeCount : (existing?.changeCount ?? 0) + 1,
              recentEventIds: unchanged
                ? existing.recentEventIds
                : existing
                  ? [...existing.recentEventIds, event.id].slice(-20)
                  : [event.id]
            };
          }
        }
        // Mark previously existing files absent from the new full snapshot as deleted
        for (const [existingPath, rec] of Object.entries(state.files)) {
          if (rec.status === 'exists' && !seenPaths.has(existingPath)) {
            rec.status = 'deleted';
            rec.lastModifiedAt = event.timestamp;
            rec.recentEventIds = [...rec.recentEventIds, event.id].slice(-20);
          }
        }
      }
      break;
    }

    case 'fs.created':
    case 'fs.modified': {
      const filePath = asString(p.path, event.affectedPaths[0] ?? '');
      if (isSafeRecordKey(filePath)) {
        const existing = hasOwnSafe(state.files, filePath) ? state.files[filePath] : undefined;
        const recent = existing ? [...existing.recentEventIds, event.id].slice(-20) : [event.id];
        state.files[filePath] = {
          path: filePath,
          status: 'exists',
          lastHash: asString(p.contentHash) || existing?.lastHash,
          lastSnapshotBlobHash: snapshotBlob?.sha256 ?? existing?.lastSnapshotBlobHash,
          lastModifiedAt: event.timestamp,
          lastModifiedBy: event.actor,
          changeCount: (existing?.changeCount ?? 0) + 1,
          recentEventIds: recent
        };
      }
      break;
    }

    case 'fs.deleted': {
      const filePath = asString(p.path, event.affectedPaths[0] ?? '');
      if (isSafeRecordKey(filePath)) {
        const existing = hasOwnSafe(state.files, filePath) ? state.files[filePath] : undefined;
        state.files[filePath] = {
          path: filePath,
          status: 'deleted',
          lastHash: existing?.lastHash,
          lastSnapshotBlobHash: existing?.lastSnapshotBlobHash,
          lastModifiedAt: event.timestamp,
          lastModifiedBy: event.actor,
          changeCount: (existing?.changeCount ?? 0) + 1,
          recentEventIds: existing ? [...existing.recentEventIds, event.id].slice(-20) : [event.id]
        };
      }
      break;
    }

    case 'fs.renamed': {
      const fromPath = asString(p.fromPath);
      const toPath = asString(p.toPath);
      const prevEntry = isSafeRecordKey(fromPath) && hasOwnSafe(state.files, fromPath) ? state.files[fromPath] : undefined;
      if (fromPath && prevEntry) {
        prevEntry.status = 'deleted';
        prevEntry.lastModifiedAt = event.timestamp;
        prevEntry.recentEventIds = [...prevEntry.recentEventIds, event.id].slice(-20);
      }
      if (isSafeRecordKey(toPath)) {
        const existing = hasOwnSafe(state.files, toPath) ? state.files[toPath] : undefined;
        state.files[toPath] = {
          path: toPath,
          status: 'exists',
          lastHash: asString(p.contentHash) || prevEntry?.lastHash || existing?.lastHash,
          lastSnapshotBlobHash:
            snapshotBlob?.sha256 ?? prevEntry?.lastSnapshotBlobHash ?? existing?.lastSnapshotBlobHash,
          lastModifiedAt: event.timestamp,
          lastModifiedBy: event.actor,
          changeCount: (existing?.changeCount ?? 0) + 1,
          recentEventIds: existing ? [...existing.recentEventIds, event.id].slice(-20) : [event.id]
        };
      }
      break;
    }

    case 'git.commit': {
      const sha = asString(p.sha);
      const branch = asString(p.branch);
      if (sha) state.lastCommitSha = sha;
      if (branch) state.currentBranch = branch;
      break;
    }

    case 'git.checkout':
    case 'git.merge':
    case 'git.rebase': {
      const branch = asString(p.branch, asString(p.toBranch));
      if (branch) state.currentBranch = branch;
      break;
    }

    case 'exec.failed':
    case 'exec.crashed': {
      state.crashes.push({
        eventId: event.id,
        seq: event.seq,
        timestamp: event.timestamp,
        command: asString(p.command, event.summary),
        exitCode: typeof p.exitCode === 'number' ? p.exitCode : null,
        signal: typeof p.signal === 'string' ? p.signal : null,
        errorSignature: asString(p.errorSignature, asString(p.stderrExcerpt, event.summary).slice(0, 180)),
        excerpt: asString(p.stderrExcerpt, asString(p.stdoutExcerpt, event.summary)).slice(0, 500),
        affectedPaths: event.affectedPaths
      });
      trimCrashesWindow(state.crashes);
      if (!state.recentExecutions) state.recentExecutions = [];
      state.recentExecutions.push({ seq: event.seq, ok: false });
      if (state.recentExecutions.length > 50) {
        state.recentExecutions.splice(0, state.recentExecutions.length - 50);
      }
      break;
    }

    case 'exec.completed': {
      // Do not allow unprivileged L4 AI sessions to forge exec.completed to clear real crashes
      if (event.actor.kind === 'ai-agent') break;
      if (!state.recentExecutions) state.recentExecutions = [];
      state.recentExecutions.push({ seq: event.seq, ok: true });
      if (state.recentExecutions.length > 50) {
        state.recentExecutions.splice(0, state.recentExecutions.length - 50);
      }
      const command = asString(p.command);
      if (command) {
        // Resolve ALL preceding unresolved crashes for this command (stopping at any prior resolved entry)
        for (let i = state.crashes.length - 1; i >= 0; i--) {
          const c = state.crashes[i]!;
          if (c.command !== command) continue;
          if (c.resolvedByEventId) break;
          c.resolvedByEventId = event.id;
        }
        trimCrashesWindow(state.crashes);
      }
      break;
    }

    case 'attempt.failed': {
      state.failedAttempts.push({
        eventId: event.id,
        seq: event.seq,
        timestamp: event.timestamp,
        approach: asString(p.approach, event.summary).slice(0, 500),
        reason: asString(p.reason, 'Failed without explicit reason').slice(0, 500),
        affectedPaths: event.affectedPaths,
        tags: event.tags
      });
      if (state.failedAttempts.length > MAX_FAILED_ATTEMPTS) {
        state.failedAttempts.splice(0, state.failedAttempts.length - MAX_FAILED_ATTEMPTS);
      }
      break;
    }

    case 'chat.thinking': {
      state.intermediateThinking.push({
        eventId: event.id,
        seq: event.seq,
        timestamp: event.timestamp,
        harness: event.harness,
        sessionId: event.sessionId,
        thought: asString(p.thought, event.summary).slice(0, 600),
        tags: event.tags
      });
      if (state.intermediateThinking.length > MAX_THINKING_RECORDS) {
        state.intermediateThinking.splice(0, state.intermediateThinking.length - MAX_THINKING_RECORDS);
      }
      break;
    }

    case 'lesson.captured': {
      const lessonId = asString(p.lessonId, event.id);
      if (!isSafeRecordKey(lessonId)) break;
      const sev = p.severity;
      const severity: LessonRecord['severity'] =
        sev === 'low' || sev === 'medium' || sev === 'high' || sev === 'critical' ? sev : 'medium';
      state.lessons[lessonId] = {
        id: lessonId,
        eventId: event.id,
        seq: event.seq,
        timestamp: event.timestamp,
        title: asString(p.title, event.summary),
        problem: asString(p.problem, event.summary),
        rootCause: asString(p.rootCause, 'Recorded from workspace stream'),
        failedApproaches: asStringArray(p.failedApproaches),
        resolution: asString(p.resolution, ''),
        preventionRule: asString(p.preventionRule, asString(p.resolution, event.summary)),
        errorSignatures: asStringArray(p.errorSignatures),
        affectedPaths: event.affectedPaths,
        tags: event.tags,
        severity,
        verified: Boolean(p.verified),
        appliedCount: 0,
        sourceEventIds: asStringArray(p.sourceEventIds)
      };
      break;
    }

    case 'lesson.verified': {
      const lessonId = asString(p.lessonId);
      if (hasOwnSafe(state.lessons, lessonId)) {
        state.lessons[lessonId]!.verified = true;
      }
      break;
    }

    case 'lesson.applied': {
      const lessonId = asString(p.lessonId);
      if (hasOwnSafe(state.lessons, lessonId)) {
        state.lessons[lessonId]!.appliedCount += 1;
      }
      break;
    }

    case 'lesson.superseded': {
      if (event.actor.kind === 'ai-agent') break;
      const lessonId = asString(p.lessonId);
      const supersededBy = asString(p.supersededBy, event.id);
      if (hasOwnSafe(state.lessons, lessonId)) {
        state.lessons[lessonId]!.supersededBy = supersededBy;
      }
      break;
    }

    case 'decision.recorded': {
      const decisionId = asString(p.decisionId, event.id);
      if (!isSafeRecordKey(decisionId)) break;
      const supersedes = asString(p.supersedes);
      if (hasOwnSafe(state.decisions, supersedes)) {
        state.decisions[supersedes]!.status = 'superseded';
        state.decisions[supersedes]!.supersededBy = decisionId;
      }
      const record: DecisionRecord = {
        id: decisionId,
        eventId: event.id,
        seq: event.seq,
        timestamp: event.timestamp,
        title: asString(p.title, event.summary),
        decision: asString(p.decision, event.summary),
        rationale: asString(p.rationale, ''),
        alternativesRejected: asStringArray(p.alternativesRejected),
        consequences: asStringArray(p.consequences),
        affectedPaths: event.affectedPaths,
        tags: event.tags,
        owner: asString(p.owner, event.actor.id),
        status: 'active'
      };
      state.decisions[decisionId] = record;
      break;
    }

    case 'directive.issued': {
      const directiveId = asString(p.directiveId, event.id);
      if (!isSafeRecordKey(directiveId)) break;
      const isPrivileged =
        event.actor.kind === 'numberone' || event.actor.kind === 'officer' || event.actor.kind === 'human';
      const supersedes = asString(p.supersedes);
      if (isPrivileged && hasOwnSafe(state.directives, supersedes)) {
        state.directives[supersedes]!.active = false;
        state.directives[supersedes]!.supersededBy = directiveId;
      }
      const sev = p.severity;
      let severity: DirectiveRecord['severity'] =
        sev === 'advisory' || sev === 'mandatory' || sev === 'blocking' ? sev : 'mandatory';
      if (!isPrivileged) {
        // L4 sessions cannot escalate to mandatory/blocking L2 directives
        severity = 'advisory';
      }
      const issuedBy: DirectiveRecord['issuedBy'] = isOfficerRole(p.issuedBy) ? p.issuedBy : 'numberone';
      const explicitScopeTags = p.scopeTags !== undefined ? asStringArray(p.scopeTags) : null;
      const fallbackTags = event.tags.filter((t) => !GENERIC_DIRECTIVE_TAGS.has(t.toLowerCase()));
      state.directives[directiveId] = {
        id: directiveId,
        eventId: event.id,
        seq: event.seq,
        timestamp: event.timestamp,
        title: asString(p.title, event.summary),
        directive: asString(p.directive, event.summary),
        rationale: asString(p.rationale, ''),
        scopePaths: asStringArray(p.scopePaths).length > 0 ? asStringArray(p.scopePaths) : event.affectedPaths,
        scopeTags: explicitScopeTags !== null ? explicitScopeTags : fallbackTags,
        forbiddenPatterns: asStringArray(p.forbiddenPatterns),
        requiredPatterns: asStringArray(p.requiredPatterns),
        severity,
        issuedBy,
        active: true,
        supportingEventIds: asStringArray(p.supportingEventIds)
      };
      break;
    }

    case 'directive.superseded': {
      // L4 AI sessions cannot unilaterally disable Number One directives
      if (event.actor.kind === 'ai-agent') break;
      const directiveId = asString(p.directiveId);
      if (hasOwnSafe(state.directives, directiveId)) {
        state.directives[directiveId]!.active = false;
        state.directives[directiveId]!.supersededBy = asString(p.supersededBy, event.id);
      }
      break;
    }

    case 'issue.opened': {
      const issueId = asString(p.issueId, event.id);
      if (!isSafeRecordKey(issueId)) break;
      const kindRaw = p.kind;
      const kind: IssueRecord['kind'] =
        kindRaw === 'bug' ||
        kindRaw === 'crash' ||
        kindRaw === 'story' ||
        kindRaw === 'epic' ||
        kindRaw === 'task' ||
        kindRaw === 'debt' ||
        kindRaw === 'security' ||
        kindRaw === 'infra' ||
        kindRaw === 'release'
          ? kindRaw
          : 'task';
      const prioRaw = p.priority;
      const priority: IssueRecord['priority'] =
        prioRaw === 'low' || prioRaw === 'medium' || prioRaw === 'high' || prioRaw === 'critical'
          ? prioRaw
          : 'medium';
      state.issues[issueId] = {
        id: issueId,
        eventId: event.id,
        seq: event.seq,
        title: asString(p.title, event.summary),
        description: asString(p.description, event.summary),
        kind,
        status: 'open',
        priority,
        ownerOfficer: isOfficerRole(p.ownerOfficer) ? p.ownerOfficer : undefined,
        affectedPaths: event.affectedPaths,
        tags: event.tags,
        openedAt: event.timestamp,
        updatedAt: event.timestamp,
        relatedEventIds: [event.id, ...asStringArray(p.relatedEventIds)].slice(-MAX_RELATED_EVENT_IDS),
        externalRefs: { ...event.storageManifest.remotes }
      };
      break;
    }

    case 'issue.updated': {
      const issueId = asString(p.issueId);
      const existing = hasOwnSafe(state.issues, issueId) ? state.issues[issueId] : undefined;
      if (existing) {
        const statusRaw = p.status;
        if (
          statusRaw === 'open' ||
          statusRaw === 'in_progress' ||
          statusRaw === 'blocked' ||
          statusRaw === 'resolved' ||
          statusRaw === 'reopened'
        ) {
          existing.status = statusRaw;
        }
        if (typeof p.title === 'string') existing.title = p.title;
        if (typeof p.description === 'string') existing.description = p.description;
        if (isOfficerRole(p.ownerOfficer)) existing.ownerOfficer = p.ownerOfficer;
        existing.updatedAt = event.timestamp;
        existing.relatedEventIds = [...existing.relatedEventIds, event.id].slice(-MAX_RELATED_EVENT_IDS);
      }
      break;
    }

    case 'issue.resolved': {
      const issueId = asString(p.issueId);
      if (!isSafeRecordKey(issueId)) break;
      const existing = hasOwnSafe(state.issues, issueId) ? state.issues[issueId] : undefined;
      if (existing) {
        existing.status = 'resolved';
        existing.resolvedAt = event.timestamp;
        existing.updatedAt = event.timestamp;
        existing.resolution = asString(p.resolution, event.summary);
        existing.relatedEventIds = [...existing.relatedEventIds, event.id].slice(-MAX_RELATED_EVENT_IDS);
      } else if (typeof p.title === 'string') {
        // Materialize externally pulled already-closed issues so they are never silently dropped
        state.issues[issueId] = {
          id: issueId,
          eventId: event.id,
          seq: event.seq,
          title: p.title,
          description: asString(p.description, event.summary),
          kind: 'task',
          status: 'resolved',
          priority: 'medium',
          affectedPaths: event.affectedPaths,
          tags: event.tags,
          openedAt: event.timestamp,
          updatedAt: event.timestamp,
          resolvedAt: event.timestamp,
          resolution: asString(p.resolution, 'Closed externally'),
          relatedEventIds: [event.id],
          externalRefs: { ...event.storageManifest.remotes }
        };
      }
      break;
    }

    case 'issue.reopened': {
      const issueId = asString(p.issueId);
      const existing = hasOwnSafe(state.issues, issueId) ? state.issues[issueId] : undefined;
      if (existing) {
        existing.status = 'reopened';
        existing.updatedAt = event.timestamp;
        existing.relatedEventIds = [...existing.relatedEventIds, event.id].slice(-MAX_RELATED_EVENT_IDS);
      }
      break;
    }

    case 'crew.assembled': {
      const partyId = asString(p.partySessionId, event.correlationId ?? event.id);
      if (!isSafeRecordKey(partyId)) break;
      const officers = asStringArray(p.officers).filter(isOfficerRole);
      const modeRaw = p.mode;
      const mode: 'roundtable' | 'specialist' | 'auto-triage' =
        modeRaw === 'roundtable' || modeRaw === 'specialist' || modeRaw === 'auto-triage'
          ? modeRaw
          : 'roundtable';
      state.partySessions[partyId] = {
        sessionId: partyId,
        topic: asString(p.topic, event.summary),
        assembledAt: event.timestamp,
        seq: event.seq,
        officers,
        mode,
        consensusReached: false,
        opinionCount: 0,
        challengeCount: 0,
        vetoCount: 0,
        vetoOfficers: []
      };
      break;
    }

    case 'crew.opinion': {
      const partyId = asString(p.partySessionId, event.correlationId ?? '');
      if (hasOwnSafe(state.partySessions, partyId)) {
        state.partySessions[partyId]!.opinionCount += 1;
      }
      break;
    }

    case 'crew.challenge': {
      const partyId = asString(p.partySessionId, event.correlationId ?? '');
      if (hasOwnSafe(state.partySessions, partyId)) {
        state.partySessions[partyId]!.challengeCount += 1;
      }
      break;
    }

    case 'crew.veto': {
      if (event.actor.kind !== 'officer' && event.actor.kind !== 'numberone') break;
      const partyId = asString(p.partySessionId, event.correlationId ?? '');
      if (hasOwnSafe(state.partySessions, partyId)) {
        const ps = state.partySessions[partyId]!;
        ps.vetoCount = (ps.vetoCount ?? 0) + 1;
        ps.vetoOfficers = ps.vetoOfficers ?? [];
        if (isOfficerRole(p.officer) && !ps.vetoOfficers.includes(p.officer)) {
          ps.vetoOfficers.push(p.officer);
        }
      }
      break;
    }

    case 'crew.consensus': {
      if (event.actor.kind !== 'numberone') break;
      const partyId = asString(p.partySessionId, event.correlationId ?? '');
      if (hasOwnSafe(state.partySessions, partyId)) {
        state.partySessions[partyId]!.consensusReached = Boolean(p.consensusReached ?? true);
        state.partySessions[partyId]!.ruling = asString(p.ruling, event.summary);
        if (typeof p.directiveId === 'string') {
          state.partySessions[partyId]!.directiveId = p.directiveId;
        }
      }
      break;
    }

    case 'officer.kpi.measured': {
      if (event.actor.kind !== 'officer' && event.actor.kind !== 'numberone') break;
      if (isOfficerRole(p.officer)) {
        const officer = state.officers[p.officer];
        const score = Math.max(0, Math.min(100, asNumber(p.score, 0)));
        const breakdown =
          p.breakdown && typeof p.breakdown === 'object' && !Array.isArray(p.breakdown)
            ? (p.breakdown as Record<string, number>)
            : {};
        officer.currentKpiScore = score;
        if (typeof p.kpiName === 'string') officer.mainKpiName = p.kpiName;
        officer.kpiHistory.push({
          seq: event.seq,
          timestamp: event.timestamp,
          score,
          breakdown
        });
        if (officer.kpiHistory.length > MAX_KPI_HISTORY) {
          officer.kpiHistory.splice(0, officer.kpiHistory.length - MAX_KPI_HISTORY);
        }
      }
      break;
    }

    case 'officer.knowledge.updated': {
      // Only Number One / EvolutionEngine may promote officer practices
      if (event.actor.kind !== 'numberone' && event.actor.kind !== 'officer') break;
      if (isOfficerRole(p.officer) && p.practice && typeof p.practice === 'object') {
        const officer = state.officers[p.officer];
        const practice = p.practice as KnowledgePractice;
        if (isSafeRecordKey(practice.id)) {
          const clampedWeight =
            typeof practice.weight === 'number' && Number.isFinite(practice.weight)
              ? Math.max(1, Math.min(100, practice.weight))
              : 15;
          officer.practices[practice.id] = {
            ...practice,
            weight: clampedWeight,
            active: true
          };
          officer.knowledgeVersion += 1;
        }
      }
      break;
    }

    case 'officer.knowledge.rejected': {
      if (event.actor.kind !== 'numberone' && event.actor.kind !== 'officer') break;
      if (isOfficerRole(p.officer)) {
        state.officers[p.officer].rejectedProposalsCount += 1;
      }
      break;
    }

    case 'officer.knowledge.reverted': {
      if (event.actor.kind !== 'numberone' && event.actor.kind !== 'officer') break;
      if (isOfficerRole(p.officer)) {
        const officer = state.officers[p.officer];
        const practiceId = asString(p.practiceId);
        if (hasOwnSafe(officer.practices, practiceId)) {
          officer.practices[practiceId]!.active = false;
          officer.practices[practiceId]!.revertedReason = asString(p.reason, 'KPI regression detected');
          officer.knowledgeVersion += 1;
        }
      }
      break;
    }

    case 'sync.pushed':
    case 'sync.reconciled': {
      const backend = asString(p.backend);
      if (isSafeRecordKey(backend)) {
        const prev = hasOwnSafe(state.syncState, backend) ? state.syncState[backend] : undefined;
        state.syncState[backend] = {
          lastSyncedSeq: Math.max(prev?.lastSyncedSeq ?? 0, asNumber(p.syncedUpToSeq, event.seq)),
          lastSyncedAt: event.timestamp,
          lastPulledAt: prev?.lastPulledAt,
          remoteMappingsCount: asNumber(p.remoteMappingsCount, prev?.remoteMappingsCount ?? 0)
        };
      }
      break;
    }

    case 'sync.pulled': {
      const backend = asString(p.backend);
      if (isSafeRecordKey(backend)) {
        const prev = hasOwnSafe(state.syncState, backend) ? state.syncState[backend] : undefined;
        state.syncState[backend] = {
          lastSyncedSeq: prev?.lastSyncedSeq ?? 0,
          lastSyncedAt: prev?.lastSyncedAt ?? event.timestamp,
          lastPulledAt: event.timestamp,
          remoteMappingsCount: asNumber(p.remoteMappingsCount, prev?.remoteMappingsCount ?? 0)
        };
      }
      break;
    }

    default:
      break;
  }

  return state;
}

/**
 * Deterministic event-sourced replay engine with tamper-checked projection caching.
 */
export class ReplayEngine {
  private readonly store: StreamStore;
  private readonly snapshotPath: string;

  constructor(store: StreamStore) {
    this.store = store;
    this.snapshotPath = path.join(store.projectionsDir, 'state.json');
  }

  private persistState(state: WorkspaceProjection): void {
    state.snapshotDigest = computeProjectionDigest(state);
    atomicWriteJsonSync(this.snapshotPath, state, 0o600);
  }

  public replay(options: ReplayOptions = {}): WorkspaceProjection {
    const events = this.store.query({
      untilSeq: options.untilSeq,
      untilTimestamp: options.untilTimestamp
    });

    const lastTs = events.length > 0 ? events[events.length - 1]!.timestamp : new Date(0).toISOString();
    const state = createInitialProjection(this.store.workspaceRoot, lastTs);
    for (const event of events) {
      applyEventToProjection(state, event);
    }
    state.snapshotDigest = computeProjectionDigest(state);

    if (
      options.persistSnapshot &&
      options.untilSeq === undefined &&
      !options.untilTimestamp &&
      this.store.isInitialized()
    ) {
      this.persistState(state);
    }

    return state;
  }

  public getCurrentState(): WorkspaceProjection {
    if (!this.store.isInitialized()) {
      return createInitialProjection(this.store.workspaceRoot);
    }

    const head = this.store.getHead();
    const rawCached = readJsonSafe<WorkspaceProjection>(this.snapshotPath);
    if (
      rawCached &&
      rawCached.projectionVersion === PROJECTION_VERSION &&
      rawCached.workspaceRoot === this.store.workspaceRoot &&
      rawCached.lastSeq <= head.lastSeq &&
      typeof rawCached.snapshotDigest === 'string' &&
      rawCached.snapshotDigest === computeProjectionDigest(rawCached) &&
      (rawCached.lastSeq === 0 ||
        this.store.getEventById(rawCached.lastEventId ?? '')?.hash === rawCached.lastEventHash)
    ) {
      const cached = hydrateCachedProjection(rawCached);
      if (cached.lastSeq === head.lastSeq) {
        return cached;
      }
      const tail = this.store.query({ sinceSeq: cached.lastSeq + 1, untilSeq: head.lastSeq });
      for (const ev of tail) {
        applyEventToProjection(cached, ev);
      }
      if (tail.length > 0) {
        cached.rebuiltAt = tail[tail.length - 1]!.timestamp;
      }
      this.persistState(cached);
      return cached;
    }

    return this.replay({ persistSnapshot: true });
  }
}
