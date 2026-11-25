import { z } from 'zod';

export const EVENT_TYPES = [
  // Workspace lifecycle
  'workspace.attached',
  'workspace.snapshot',
  'workspace.detached',
  // Filesystem changes
  'fs.created',
  'fs.modified',
  'fs.deleted',
  'fs.renamed',
  // Git lifecycle
  'git.commit',
  'git.checkout',
  'git.merge',
  'git.rebase',
  'git.push',
  'git.tag',
  // Execution, tests, crashes
  'exec.started',
  'exec.completed',
  'exec.failed',
  'exec.crashed',
  // AI/Human conversation, thinking, context transitions
  'chat.turn',
  'chat.thinking',
  'attempt.failed',
  'context.compacted',
  'harness.switched',
  // Issues / Scrum work items
  'issue.opened',
  'issue.updated',
  'issue.resolved',
  'issue.reopened',
  // Institutional memory & decisions
  'lesson.captured',
  'lesson.verified',
  'lesson.applied',
  'lesson.superseded',
  'decision.recorded',
  // Authoritative oversight
  'directive.issued',
  'directive.superseded',
  'arbitration.decided',
  // Bridge Crew orchestration
  'crew.assembled',
  'crew.opinion',
  'crew.challenge',
  'crew.consensus',
  'crew.veto',
  // Continuous empirically-verified KPI evolution
  'officer.kpi.measured',
  'officer.knowledge.proposed',
  'officer.knowledge.rejected',
  'officer.knowledge.updated',
  'officer.knowledge.reverted',
  // Distributed persistence
  'sync.pushed',
  'sync.pulled',
  'sync.reconciled'
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const ActorKindSchema = z.enum([
  'human',
  'ai-agent',
  'numberone',
  'officer',
  'watcher',
  'git-hook',
  'external-sync'
]);

export type ActorKind = z.infer<typeof ActorKindSchema>;

export const ActorSchema = z.object({
  kind: ActorKindSchema,
  id: z.string().min(1),
  name: z.string().optional()
});

export type Actor = z.infer<typeof ActorSchema>;

export const BlobRefSchema = z.object({
  key: z.string().min(1),
  sha256: z.string().length(64),
  uri: z.string().startsWith('n1://fallback/'),
  sizeBytes: z.number().int().nonnegative(),
  contentType: z.string().min(1)
});

export type BlobRef = z.infer<typeof BlobRefSchema>;

export const PersistenceBackendKindSchema = z.enum(['github', 'jira', 'directory']);
export type PersistenceBackendKind = z.infer<typeof PersistenceBackendKindSchema>;

export const RemoteRecordRefSchema = z.object({
  backend: PersistenceBackendKindSchema,
  externalId: z.string().min(1),
  externalKey: z.string().optional(),
  entityType: z.string().min(1),
  url: z.string().optional(),
  syncedAt: z.string(),
  syncedHash: z.string().length(64),
  fallbackFields: z.array(z.string()).default([])
});

export type RemoteRecordRef = z.infer<typeof RemoteRecordRefSchema>;

export const StorageManifestSchema = z.object({
  local: z.literal(true),
  fallbackBlobHashes: z.array(z.string()).default([]),
  remotes: z.record(z.string(), RemoteRecordRefSchema).default({})
});

export type StorageManifest = z.infer<typeof StorageManifestSchema>;

export const StreamEventSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(10),
  seq: z.number().int().positive(),
  timestamp: z.string(),
  type: z.enum(EVENT_TYPES),
  actor: ActorSchema,
  harness: z.string().min(1),
  sessionId: z.string().min(1),
  causationId: z.string().optional(),
  correlationId: z.string().optional(),
  summary: z.string().min(1),
  tags: z.array(z.string()).default([]),
  affectedPaths: z.array(z.string()).default([]),
  payload: z.record(z.string(), z.unknown()).default({}),
  blobs: z.array(BlobRefSchema).default([]),
  storageManifest: StorageManifestSchema,
  prevHash: z.string().length(64),
  hash: z.string().length(64)
});

export type StreamEvent = z.infer<typeof StreamEventSchema>;

export interface AppendEventInput {
  type: EventType;
  actor: Actor;
  harness?: string;
  sessionId?: string;
  causationId?: string;
  correlationId?: string;
  summary: string;
  tags?: string[];
  affectedPaths?: string[];
  payload?: Record<string, unknown>;
  fallbackBlobs?: Array<{
    key: string;
    content: string | Buffer;
    contentType?: string;
  }>;
  timestamp?: string;
}

export type OfficerRole = 'engineering' | 'security' | 'bridge';

export interface LessonRecord {
  id: string;
  eventId: string;
  seq: number;
  timestamp: string;
  title: string;
  problem: string;
  rootCause: string;
  failedApproaches: string[];
  resolution: string;
  preventionRule: string;
  errorSignatures: string[];
  affectedPaths: string[];
  tags: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  verified: boolean;
  appliedCount: number;
  supersededBy?: string;
  sourceEventIds: string[];
}

export interface DecisionRecord {
  id: string;
  eventId: string;
  seq: number;
  timestamp: string;
  title: string;
  decision: string;
  rationale: string;
  alternativesRejected: string[];
  consequences: string[];
  affectedPaths: string[];
  tags: string[];
  owner: string;
  status: 'active' | 'superseded';
  supersededBy?: string;
}

export interface DirectiveRecord {
  id: string;
  eventId: string;
  seq: number;
  timestamp: string;
  title: string;
  directive: string;
  rationale: string;
  scopePaths: string[];
  scopeTags: string[];
  forbiddenPatterns: string[];
  requiredPatterns: string[];
  severity: 'advisory' | 'mandatory' | 'blocking';
  issuedBy: 'numberone' | OfficerRole;
  active: boolean;
  supersededBy?: string;
  supportingEventIds: string[];
}

export interface IssueRecord {
  id: string;
  eventId: string;
  seq: number;
  title: string;
  description: string;
  kind: 'bug' | 'crash' | 'story' | 'epic' | 'task' | 'debt' | 'security' | 'infra' | 'release';
  status: 'open' | 'in_progress' | 'blocked' | 'resolved' | 'reopened';
  priority: 'low' | 'medium' | 'high' | 'critical';
  ownerOfficer?: OfficerRole;
  affectedPaths: string[];
  tags: string[];
  openedAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolution?: string;
  relatedEventIds: string[];
  externalRefs: Record<string, RemoteRecordRef>;
}

export interface CrashRecord {
  eventId: string;
  seq: number;
  timestamp: string;
  command: string;
  exitCode: number | null;
  signal: string | null;
  errorSignature: string;
  excerpt: string;
  affectedPaths: string[];
  resolvedByEventId?: string;
}

export interface FileHistoryRecord {
  path: string;
  status: 'exists' | 'deleted';
  lastHash?: string;
  lastSnapshotBlobHash?: string;
  lastModifiedAt: string;
  lastModifiedBy: Actor;
  changeCount: number;
  recentEventIds: string[];
}

export interface KnowledgePractice {
  id: string;
  title: string;
  category: string;
  description: string;
  ruleType: 'check' | 'tool' | 'methodology' | 'process' | 'control';
  targetKpi: string;
  weight?: number;
  provenKpiDelta?: number;
  evidenceSummary: string;
  evidenceSources: string[];
  matcher?: {
    fileGlob?: string;
    contentRegex?: string;
    missingFile?: string;
    requiredContentRegex?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
  };
  addedAt?: string;
  version: number;
  active: boolean;
  revertedReason?: string;
}

export interface OfficerStateProjection {
  role: OfficerRole;
  knowledgeVersion: number;
  mainKpiName: string;
  currentKpiScore: number | null;
  kpiHistory: Array<{
    seq: number;
    timestamp: string;
    score: number;
    breakdown: Record<string, number>;
  }>;
  practices: Record<string, KnowledgePractice>;
  rejectedProposalsCount: number;
}

export interface PartySessionSummary {
  sessionId: string;
  topic: string;
  assembledAt: string;
  seq: number;
  officers: OfficerRole[];
  mode: 'roundtable' | 'specialist' | 'auto-triage';
  ruling?: string;
  directiveId?: string;
  consensusReached: boolean;
  opinionCount: number;
  challengeCount: number;
  vetoCount?: number;
  vetoOfficers?: OfficerRole[];
}

export interface WorkspaceProjection {
  projectionVersion: number;
  snapshotDigest?: string;
  workspaceRoot: string;
  rebuiltAt: string;
  lastSeq: number;
  lastEventId: string | null;
  lastEventHash: string;
  eventCountsByType: Record<string, number>;
  harnessesSeen: string[];
  actorsSeen: string[];
  sessionsSeen: string[];
  currentBranch: string | null;
  lastCommitSha: string | null;
  files: Record<string, FileHistoryRecord>;
  lessons: Record<string, LessonRecord>;
  decisions: Record<string, DecisionRecord>;
  directives: Record<string, DirectiveRecord>;
  issues: Record<string, IssueRecord>;
  crashes: CrashRecord[];
  recentExecutions?: Array<{
    seq: number;
    ok: boolean;
  }>;
  failedAttempts: Array<{
    eventId: string;
    seq: number;
    timestamp: string;
    approach: string;
    reason: string;
    affectedPaths: string[];
    tags: string[];
  }>;
  intermediateThinking: Array<{
    eventId: string;
    seq: number;
    timestamp: string;
    harness: string;
    sessionId: string;
    thought: string;
    tags: string[];
  }>;
  officers: Record<OfficerRole, OfficerStateProjection>;
  partySessions: Record<string, PartySessionSummary>;
  syncState: Record<
    string,
    {
      lastSyncedSeq: number;
      lastSyncedAt: string;
      lastPulledAt?: string;
      remoteMappingsCount: number;
    }
  >;
}

export interface NumberOneConfig {
  schemaVersion: 1;
  workspaceId: string;
  workspaceName: string;
  attachedAt: string;
  authoritativeMode: 'strict' | 'advisory';
  watcher: {
    debounceMs: number;
    ignore: string[];
    maxInlineDiffBytes: number;
  };
  persistence: {
    directory?: {
      enabled: boolean;
      targetDir: string;
      projectKey?: string;
    };
    github?: {
      enabled: boolean;
      owner: string;
      repo: string;
      projectNumber?: number;
      apiBaseUrl?: string;
      tokenEnvVar?: string;
      useGhCli?: boolean;
    };
    jira?: {
      enabled: boolean;
      baseUrl: string;
      projectKey: string;
      boardId?: number;
      emailEnvVar?: string;
      apiTokenEnvVar?: string;
    };
  };
  llm?: {
    provider: 'none' | 'openai-compatible' | 'anthropic' | 'gemini';
    baseUrl?: string;
    model?: string;
    apiKeyEnvVar?: string;
  };
  crew: {
    enabledOfficers: OfficerRole[];
    autoTriageOnCrash: boolean;
    autoTriageOnSecurityFinding: boolean;
  };
}
