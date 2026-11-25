import fs from 'node:fs';
import path from 'node:path';
import { RemoteRecordRef, StreamEvent } from '../core/types.js';
import {
  atomicWriteJsonSync,
  ensureDir,
  isWritablePathConfinedToRoot,
  readJsonSafe
} from '../utils/fs-helpers.js';
import { withFileLockAsync } from '../utils/lock.js';
import {
  PersistenceAdapter,
  PulledExternalEvent,
  PushEventContext,
  PushEventOutcome
} from './types.js';

export interface DirectoryAdapterConfig {
  enabled: boolean;
  targetDir: string;
  projectKey?: string;
}

export interface DirectoryScrumComment {
  id: string;
  createdAt: string;
  author: string;
  body: string;
  eventHash: string;
}

export interface DirectoryScrumIssue {
  id: string;
  key: string;
  issueType: 'Epic' | 'Story' | 'Bug' | 'Task';
  status: 'open' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  component: string;
  sprint: string | null;
  summary: string;
  description: string;
  labels: string[];
  reporter: string;
  createdAt: string;
  updatedAt: string;
  links: Array<{ type: 'Causes' | 'Relates'; targetKey: string }>;
  comments: DirectoryScrumComment[];
  numberoneEvent?: {
    schemaVersion: 1;
    eventId: string;
    seq: number;
    type: string;
    hash: string;
    prevHash: string;
    fallbackBlobs: StreamEvent['blobs'];
    fallbackFields: string[];
  };
}

const SAFE_PROJECT_KEY_RX = /^[A-Za-z0-9_-]{1,32}$/;
const SAFE_ISSUE_KEY_RX = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Shared-Directory / Git-Worktree Scrum Persistence Adapter.
 * Enforces cross-workspace targetDir locking, strict path confinement, and 0o700/0o600 permissions.
 */
export class DirectoryPersistenceAdapter implements PersistenceAdapter {
  public readonly backend = 'directory' as const;
  public readonly name: string;
  private readonly targetDir: string;
  private readonly issuesDir: string;
  private readonly lockPath: string;
  private readonly projectKey: string;
  private readonly enabled: boolean;

  constructor(config: DirectoryAdapterConfig) {
    this.targetDir = path.resolve(config.targetDir);
    this.issuesDir = path.join(this.targetDir, 'issues');
    this.lockPath = path.join(this.targetDir, '.directory.lock');
    const pk = config.projectKey ?? 'N1';
    if (!SAFE_PROJECT_KEY_RX.test(pk)) {
      throw new Error(`Invalid DirectoryPersistenceAdapter projectKey "${pk}"`);
    }
    this.projectKey = pk;
    this.name = `directory:${this.targetDir}`;
    this.enabled = config.enabled;
  }

  public isConfigured(): boolean {
    return Boolean(this.enabled && this.targetDir);
  }

  private resolveSafeIssuePath(issueKey: string): string {
    if (!SAFE_ISSUE_KEY_RX.test(issueKey)) {
      throw new Error(`Invalid external issue key format: "${issueKey}"`);
    }
    const candidate = path.join(this.issuesDir, `${issueKey}.json`);
    if (!isWritablePathConfinedToRoot(this.issuesDir, candidate)) {
      throw new Error(`Issue path escaped directory store root: "${issueKey}"`);
    }
    return candidate;
  }

  public async ensureTaxonomy(): Promise<void> {
    ensureDir(this.targetDir, 0o700);
    ensureDir(this.issuesDir, 0o700);
    const taxonomyPath = path.join(this.targetDir, 'taxonomy.json');
    if (!fs.existsSync(taxonomyPath)) {
      atomicWriteJsonSync(
        taxonomyPath,
        {
          projectKey: this.projectKey,
          components: ['Engineering Officer', 'Security Officer', 'Bridge Officer', 'Number One SoR'],
          activeSprint: `${this.projectKey}-Sprint-1`,
          createdAt: new Date().toISOString()
        },
        0o600
      );
    }
  }

  private nextIssueNumber(): number {
    if (!fs.existsSync(this.issuesDir)) return 1;
    const files = fs.readdirSync(this.issuesDir).filter((f) => f.endsWith('.json'));
    let max = 0;
    for (const f of files) {
      const m = /-(\d+)\.json$/.exec(f);
      if (m?.[1]) max = Math.max(max, Number.parseInt(m[1], 10));
    }
    return max + 1;
  }

  private resolveParentEntityKey(event: StreamEvent): string | null {
    const p = event.payload;
    if (typeof p.issueId === 'string') return `issue:${p.issueId}`;
    if (typeof p.partySessionId === 'string') return `party:${p.partySessionId}`;
    if (typeof p.lessonId === 'string') return `lesson:${p.lessonId}`;
    if (typeof p.directiveId === 'string') return `directive:${p.directiveId}`;
    if (event.correlationId) return `corr:${event.correlationId}`;
    return null;
  }

  public async pushEvent(event: StreamEvent, context: PushEventContext): Promise<PushEventOutcome> {
    await this.ensureTaxonomy();

    if (
      event.type === 'workspace.snapshot' ||
      event.type === 'fs.created' ||
      event.type === 'fs.modified' ||
      event.type === 'fs.deleted' ||
      event.type === 'fs.renamed' ||
      event.type === 'exec.started' ||
      event.type === 'sync.pushed' ||
      event.type === 'sync.pulled' ||
      event.type === 'sync.reconciled'
    ) {
      return {
        synced: false,
        fallbackFields: ['fullEvent', 'rawDiffs', 'blobs'],
        skippedReason: `Routed to .numberone fallback ledger (local event ${event.type})`
      };
    }

    return withFileLockAsync(this.lockPath, async () => {
      const fallbackFields: string[] = [];
      if (event.blobs.length > 0) fallbackFields.push('blobs');

      const entityKey = this.resolveParentEntityKey(event);
      const existingRef = entityKey ? context.ledger.entities[entityKey]?.[this.backend] : undefined;

      if (
        existingRef?.externalKey &&
        (event.type === 'issue.updated' ||
          event.type === 'issue.resolved' ||
          event.type === 'issue.reopened' ||
          event.type === 'crew.opinion' ||
          event.type === 'crew.challenge' ||
          event.type === 'crew.consensus' ||
          event.type === 'crew.veto' ||
          event.type === 'lesson.verified' ||
          event.type === 'lesson.applied' ||
          event.type === 'lesson.superseded' ||
          event.type === 'directive.superseded' ||
          event.type === 'chat.thinking')
      ) {
        const issueKey = existingRef.externalKey.split('#')[0]!;
        const issuePath = this.resolveSafeIssuePath(issueKey);
        const issue = readJsonSafe<DirectoryScrumIssue>(issuePath);
        if (issue) {
          const commentId = `c-${issue.comments.length + 1}`;
          issue.comments.push({
            id: commentId,
            createdAt: event.timestamp,
            author: `${event.actor.kind}:${event.actor.id}`,
            body: event.summary,
            eventHash: event.hash
          });
          if (
            event.type === 'issue.resolved' ||
            event.type === 'directive.superseded' ||
            event.type === 'lesson.superseded'
          ) {
            issue.status = 'done';
          } else if (event.type === 'issue.reopened') {
            issue.status = 'open';
          } else if (event.type === 'issue.updated' && event.payload.status === 'in_progress') {
            issue.status = 'in_progress';
          }
          issue.updatedAt = event.timestamp;
          atomicWriteJsonSync(issuePath, issue, 0o600);

          const ref: RemoteRecordRef = {
            backend: 'directory',
            externalId: `${issueKey}#${commentId}`,
            externalKey: `${issueKey}#${commentId}`,
            entityType: 'comment',
            url: `file://${issuePath}`,
            syncedAt: new Date().toISOString(),
            syncedHash: event.hash,
            fallbackFields
          };
          return { synced: true, ref, fallbackFields };
        }
      }

      const num = this.nextIssueNumber();
      const key = `${this.projectKey}-${num}`;
      const issuePath = this.resolveSafeIssuePath(key);
      const kind = event.payload.kind;
      const issueType: DirectoryScrumIssue['issueType'] =
        kind === 'epic'
          ? 'Epic'
          : kind === 'story'
            ? 'Story'
            : kind === 'bug' || kind === 'crash' || event.type === 'exec.crashed' || event.type === 'exec.failed'
              ? 'Bug'
              : 'Task';

      const sev = event.payload.priority ?? event.payload.severity;
      const priority: DirectoryScrumIssue['priority'] =
        sev === 'critical' || sev === 'blocking'
          ? 'critical'
          : sev === 'high' || sev === 'mandatory'
            ? 'high'
            : sev === 'low' || sev === 'advisory'
              ? 'low'
              : 'medium';

      const links: DirectoryScrumIssue['links'] = [];
      if (event.causationId) {
        const parentKey = context.ledger.events[event.causationId]?.remotes.directory?.externalKey;
        if (parentKey && !parentKey.includes('#')) {
          links.push({
            type: event.type === 'lesson.captured' ? 'Relates' : 'Causes',
            targetKey: parentKey
          });
        }
      }

      const taxonomy = readJsonSafe<{ activeSprint?: string }>(path.join(this.targetDir, 'taxonomy.json'));
      const record: DirectoryScrumIssue = {
        id: key,
        key,
        issueType,
        status: 'open',
        priority,
        component: String(event.payload.ownerOfficer ?? event.payload.officer ?? 'Number One SoR'),
        sprint: taxonomy?.activeSprint ?? null,
        summary: `[N1 #${event.seq}] ${event.summary}`,
        description: JSON.stringify(event.payload, null, 2),
        labels: ['numberone', ...event.tags],
        reporter: `${event.actor.kind}:${event.actor.id}`,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        links,
        comments: [],
        numberoneEvent: {
          schemaVersion: 1,
          eventId: event.id,
          seq: event.seq,
          type: event.type,
          hash: event.hash,
          prevHash: event.prevHash,
          fallbackBlobs: event.blobs,
          fallbackFields
        }
      };

      atomicWriteJsonSync(issuePath, record, 0o600);

      const ref: RemoteRecordRef = {
        backend: 'directory',
        externalId: key,
        externalKey: key,
        entityType: 'issue',
        url: `file://${issuePath}`,
        syncedAt: new Date().toISOString(),
        syncedHash: event.hash,
        fallbackFields
      };

      return {
        synced: true,
        ref,
        entityKey: entityKey ?? `event:${event.id}`,
        fallbackFields
      };
    });
  }

  public async pullExternalEvents(sinceTimestamp?: string): Promise<PulledExternalEvent[]> {
    if (!fs.existsSync(this.issuesDir)) return [];
    const files = fs
      .readdirSync(this.issuesDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    const sinceMs = sinceTimestamp ? Date.parse(sinceTimestamp) : NaN;
    const pulled: PulledExternalEvent[] = [];
    for (const file of files) {
      const issue = readJsonSafe<DirectoryScrumIssue>(path.join(this.issuesDir, file));
      if (!issue) continue;
      if (sinceTimestamp) {
        const updMs = Date.parse(issue.updatedAt);
        if (Number.isFinite(sinceMs) && Number.isFinite(updMs)) {
          if (updMs < sinceMs) continue;
        } else if (issue.updatedAt < sinceTimestamp) {
          continue;
        }
      }
      pulled.push({
        externalId: issue.id,
        externalKey: issue.key,
        backend: 'directory',
        type: issue.status === 'done' ? 'issue.resolved' : 'issue.opened',
        summary: issue.summary,
        actorName: issue.reporter,
        timestamp: issue.updatedAt,
        tags: issue.labels,
        payload: {
          issueId: `dir-${issue.key}`,
          externalKey: issue.key,
          title: issue.summary,
          description: issue.description,
          status: issue.status
        },
        embeddedEventId: issue.numberoneEvent?.eventId
      });
    }
    return pulled;
  }

  public async verifyRemoteRef(
    event: StreamEvent,
    ref: RemoteRecordRef
  ): Promise<{ ok: boolean; reason?: string }> {
    const issueKey = (ref.externalKey ?? ref.externalId).split('#')[0]!;
    if (!SAFE_ISSUE_KEY_RX.test(issueKey)) {
      return { ok: false, reason: `Invalid external issue key format: "${issueKey}"` };
    }
    const issuePath = path.join(this.issuesDir, `${issueKey}.json`);
    if (!isWritablePathConfinedToRoot(this.issuesDir, issuePath)) {
      return { ok: false, reason: `Issue path escapes directory store: "${issueKey}"` };
    }
    const issue = readJsonSafe<DirectoryScrumIssue>(issuePath);
    if (!issue) {
      return { ok: false, reason: `Missing directory Scrum issue file ${issuePath}` };
    }
    if (ref.entityType === 'issue') {
      if (issue.numberoneEvent?.hash !== event.hash) {
        return {
          ok: false,
          reason: `Directory Scrum issue ${issueKey} hash mismatch (expected ${event.hash}, got ${issue.numberoneEvent?.hash ?? 'none'})`
        };
      }
      return { ok: true };
    }
    if (ref.entityType === 'comment') {
      const commentId = (ref.externalKey ?? '').split('#')[1];
      const found = issue.comments.find((c) => c.id === commentId);
      if (!found || found.eventHash !== event.hash) {
        return {
          ok: false,
          reason: `Directory Scrum comment ${ref.externalKey} missing or hash mismatch`
        };
      }
      return { ok: true };
    }
    return { ok: true };
  }
}
