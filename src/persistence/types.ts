import { PersistenceBackendKind, RemoteRecordRef, StreamEvent } from '../core/types.js';

export interface SyncLedgerEntry {
  eventId: string;
  seq: number;
  eventHash: string;
  remotes: Record<string, RemoteRecordRef>;
  fallbackOnlyFields: string[];
  fallbackOnlyFieldsByBackend?: Record<string, string[]>;
  updatedAt: string;
}

export interface SyncLedger {
  schemaVersion: 1;
  entities: Record<string, Record<string, RemoteRecordRef>>;
  events: Record<string, SyncLedgerEntry>;
  lastSyncedSeqByBackend: Record<string, number>;
  lastPulledAtByBackend?: Record<string, string>;
  pulledStateByExternalId?: Record<string, { type: string; updatedAt: string; issueId: string }>;
  updatedAt: string;
}

export interface PushEventContext {
  ledger: SyncLedger;
  workspaceName: string;
  getBlobUtf8: (sha256: string) => string | null;
}

export interface PushEventOutcome {
  synced: boolean;
  ref?: RemoteRecordRef;
  entityKey?: string;
  fallbackFields: string[];
  skippedReason?: string;
}

export interface PulledExternalEvent {
  externalId: string;
  externalKey?: string;
  backend: PersistenceBackendKind;
  type: StreamEvent['type'];
  summary: string;
  actorName: string;
  timestamp: string;
  tags: string[];
  payload: Record<string, unknown>;
  embeddedEventId?: string;
}

export interface PersistenceAdapter {
  readonly backend: PersistenceBackendKind;
  readonly name: string;
  isConfigured(): boolean;
  ensureTaxonomy(): Promise<void>;
  pushEvent(event: StreamEvent, context: PushEventContext): Promise<PushEventOutcome>;
  pullExternalEvents(sinceTimestamp?: string): Promise<PulledExternalEvent[]>;
  verifyRemoteRef(event: StreamEvent, ref: RemoteRecordRef): Promise<{ ok: boolean; reason?: string }>;
}

export interface SyncPushReport {
  backend: string;
  pushedCount: number;
  fallbackOnlyCount: number;
  failedCount: number;
  errors: string[];
  syncedUpToSeq: number;
}

export interface SyncPullReport {
  backend: string;
  ingestedCount: number;
  skippedDuplicates: number;
  errors: string[];
}

export interface DistributedIntegrityReport {
  valid: boolean;
  localValid: boolean;
  localErrors: string[];
  totalEvents: number;
  verifiedBlobs: number;
  remoteChecks: Array<{
    backend: string;
    checkedCount: number;
    validCount: number;
    driftErrors: string[];
  }>;
  fallbackCoverageValid: boolean;
}
