import path from 'node:path';
import { StreamStore } from '../core/stream-store.js';
import { NumberOneConfig, StreamEvent } from '../core/types.js';
import { atomicWriteJsonSync, readJsonSafe } from '../utils/fs-helpers.js';
import { withFileLockAsync } from '../utils/lock.js';
import { DirectoryPersistenceAdapter } from './directory-adapter.js';
import { GitHubPersistenceAdapter } from './github-adapter.js';
import { JiraPersistenceAdapter } from './jira-adapter.js';
import {
  DistributedIntegrityReport,
  PersistenceAdapter,
  SyncLedger,
  SyncPullReport,
  SyncPushReport
} from './types.js';

function createEmptyLedger(): SyncLedger {
  return {
    schemaVersion: 1,
    entities: {},
    events: {},
    lastSyncedSeqByBackend: {},
    updatedAt: new Date().toISOString()
  };
}

/**
 * Distributed Persistence Fabric coordinating `.numberone/` local stream + fallback blobs
 * with external Scrum/Issue stores (Directory/Worktree, GitHub Projects/Issues, Jira Scrum).
 * Uses cross-process locking (`sync/.sync.lock`) and per-event ledger checkpointing to
 * prevent duplicate remote issues under concurrency or mid-sync crash recovery.
 */
export class PersistenceFabric {
  private readonly store: StreamStore;
  private readonly ledgerPath: string;
  private readonly syncLockPath: string;
  private readonly adapters: PersistenceAdapter[] = [];

  constructor(store: StreamStore, adapters?: PersistenceAdapter[]) {
    this.store = store;
    this.ledgerPath = path.join(store.syncDir, 'ledger.json');
    this.syncLockPath = path.join(store.syncDir, '.sync.lock');
    if (adapters) {
      this.adapters.push(...adapters);
    } else {
      this.loadAdaptersFromConfig(store.readConfig());
    }
  }

  public loadAdaptersFromConfig(config: NumberOneConfig | null): void {
    this.adapters.length = 0;
    if (!config) return;
    if (config.persistence.directory?.enabled) {
      this.adapters.push(new DirectoryPersistenceAdapter(config.persistence.directory));
    }
    if (config.persistence.github?.enabled) {
      this.adapters.push(new GitHubPersistenceAdapter(config.persistence.github));
    }
    if (config.persistence.jira?.enabled) {
      this.adapters.push(new JiraPersistenceAdapter(config.persistence.jira));
    }
  }

  public registerAdapter(adapter: PersistenceAdapter): void {
    this.adapters.push(adapter);
  }

  public getAdapters(): PersistenceAdapter[] {
    return [...this.adapters];
  }

  public readLedger(): SyncLedger {
    return readJsonSafe<SyncLedger>(this.ledgerPath) ?? createEmptyLedger();
  }

  private writeLedger(ledger: SyncLedger): void {
    ledger.updatedAt = new Date().toISOString();
    atomicWriteJsonSync(this.ledgerPath, ledger, 0o600);
  }

  public async syncPush(): Promise<SyncPushReport[]> {
    return withFileLockAsync(this.syncLockPath, async () => {
      const reports: SyncPushReport[] = [];
      const ledger = this.readLedger();
      const events = this.store.readAllEvents();
      const workspaceName =
        this.store.readConfig()?.workspaceName ?? path.basename(this.store.workspaceRoot);

      for (const adapter of this.adapters) {
        if (!adapter.isConfigured()) {
          reports.push({
            backend: adapter.name,
            pushedCount: 0,
            fallbackOnlyCount: 0,
            failedCount: 0,
            errors: [`Adapter ${adapter.name} is not configured or missing credentials.`],
            syncedUpToSeq: ledger.lastSyncedSeqByBackend[adapter.backend] ?? 0
          });
          continue;
        }

        const report: SyncPushReport = {
          backend: adapter.name,
          pushedCount: 0,
          fallbackOnlyCount: 0,
          failedCount: 0,
          errors: [],
          syncedUpToSeq: ledger.lastSyncedSeqByBackend[adapter.backend] ?? 0
        };

        let sawFailure = false;
        const failedEntityKeys = new Set<string>();

        const resolveEntityKeyForEvent = (ev: StreamEvent): string | null => {
          const p = ev.payload;
          if (typeof p.issueId === 'string') return `issue:${p.issueId}`;
          if (typeof p.partySessionId === 'string') return `party:${p.partySessionId}`;
          if (typeof p.lessonId === 'string') return `lesson:${p.lessonId}`;
          if (typeof p.directiveId === 'string') return `directive:${p.directiveId}`;
          return ev.correlationId ? `corr:${ev.correlationId}` : null;
        };

        for (const ev of events) {
          const existingEntry = ledger.events[ev.id];
          if (existingEntry?.remotes[adapter.backend]?.syncedHash === ev.hash) {
            if (!sawFailure) report.syncedUpToSeq = Math.max(report.syncedUpToSeq, ev.seq);
            continue;
          }
          const backendFallbackFields =
            existingEntry?.fallbackOnlyFieldsByBackend?.[adapter.backend] ??
            existingEntry?.fallbackOnlyFields ??
            [];
          if (
            existingEntry &&
            backendFallbackFields.includes('fullEvent') &&
            ev.seq <= (ledger.lastSyncedSeqByBackend[adapter.backend] ?? 0)
          ) {
            continue;
          }

          const entityKey = resolveEntityKeyForEvent(ev);
          if (entityKey && failedEntityKeys.has(entityKey)) {
            // Skip dependent events whose parent entity failed in this run so we never create orphan issues
            sawFailure = true;
            continue;
          }

          try {
            const outcome = await adapter.pushEvent(ev, {
              ledger,
              workspaceName,
              getBlobUtf8: (sha) => this.store.readBlobUtf8(sha)
            });

            const entry = ledger.events[ev.id] ?? {
              eventId: ev.id,
              seq: ev.seq,
              eventHash: ev.hash,
              remotes: {},
              fallbackOnlyFields: [],
              fallbackOnlyFieldsByBackend: {},
              updatedAt: new Date().toISOString()
            };

            entry.fallbackOnlyFieldsByBackend = entry.fallbackOnlyFieldsByBackend ?? {};
            entry.fallbackOnlyFieldsByBackend[adapter.backend] = Array.from(
              new Set([...(entry.fallbackOnlyFieldsByBackend[adapter.backend] ?? []), ...outcome.fallbackFields])
            );
            entry.fallbackOnlyFields = Array.from(
              new Set([...entry.fallbackOnlyFields, ...outcome.fallbackFields])
            );
            entry.updatedAt = new Date().toISOString();

            if (outcome.synced && outcome.ref) {
              entry.remotes[adapter.backend] = outcome.ref;
              this.store.attachRemoteRef(ev.id, adapter.backend, outcome.ref);
              if (outcome.entityKey) {
                ledger.entities[outcome.entityKey] = ledger.entities[outcome.entityKey] ?? {};
                ledger.entities[outcome.entityKey]![adapter.backend] = outcome.ref;
              }
              report.pushedCount++;
            } else {
              report.fallbackOnlyCount++;
            }

            ledger.events[ev.id] = entry;
            if (!sawFailure) {
              report.syncedUpToSeq = Math.max(report.syncedUpToSeq, ev.seq);
              ledger.lastSyncedSeqByBackend[adapter.backend] = report.syncedUpToSeq;
            }

            // Checkpoint immediately after every synced remote mutation to prevent crash duplicates
            if (outcome.synced) {
              this.writeLedger(ledger);
            }
          } catch (err) {
            sawFailure = true;
            if (entityKey) failedEntityKeys.add(entityKey);
            report.failedCount++;
            report.errors.push(
              `Event #${ev.seq} (${ev.id}): ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        this.writeLedger(ledger);

        if (report.pushedCount > 0) {
          this.store.append({
            type: 'sync.pushed',
            actor: { kind: 'numberone', id: 'persistence-fabric', name: 'Persistence Fabric' },
            harness: 'sync',
            summary: `Synced ${report.pushedCount} event(s) to ${adapter.name} (${report.fallbackOnlyCount} routed to .numberone fallback)`,
            tags: ['sync', adapter.backend],
            payload: {
              backend: adapter.backend,
              adapterName: adapter.name,
              pushedCount: report.pushedCount,
              fallbackOnlyCount: report.fallbackOnlyCount,
              syncedUpToSeq: report.syncedUpToSeq,
              remoteMappingsCount: Object.values(ledger.events).filter((e) =>
                Boolean(e.remotes[adapter.backend])
              ).length
            }
          });
        }

        reports.push(report);
      }

      return reports;
    });
  }

  public async syncPull(): Promise<SyncPullReport[]> {
    return withFileLockAsync(this.syncLockPath, async () => {
      const reports: SyncPullReport[] = [];
      const ledger = this.readLedger();
      ledger.lastPulledAtByBackend = ledger.lastPulledAtByBackend ?? {};
      ledger.pulledStateByExternalId = ledger.pulledStateByExternalId ?? {};

      // Rebuild known remote refs from both ledger AND stream storageManifest.remotes (survives ledger loss)
      const knownExternalIds = new Set<string>();
      for (const entry of Object.values(ledger.events)) {
        for (const ref of Object.values(entry.remotes)) {
          knownExternalIds.add(`${ref.backend}:${ref.externalId}`);
        }
      }
      for (const ev of this.store.readEventsResilient().events) {
        for (const ref of Object.values(ev.storageManifest.remotes)) {
          knownExternalIds.add(`${ref.backend}:${ref.externalId}`);
        }
      }

      for (const adapter of this.adapters) {
        if (!adapter.isConfigured()) continue;
        const report: SyncPullReport = {
          backend: adapter.name,
          ingestedCount: 0,
          skippedDuplicates: 0,
          errors: []
        };

        try {
          const cursor = ledger.lastPulledAtByBackend[adapter.backend];
          const externalEvents = await adapter.pullExternalEvents(cursor);
          let maxTimestampSeen = cursor ?? '';

          for (const ext of externalEvents) {
            const normTs = Number.isFinite(Date.parse(ext.timestamp))
              ? new Date(ext.timestamp).toISOString()
              : new Date().toISOString();
            if (!maxTimestampSeen || normTs > maxTimestampSeen) {
              maxTimestampSeen = normTs;
            }

            const extCompositeKey = `${ext.backend}:${ext.externalId}`;
            const prevPulled = ledger.pulledStateByExternalId[extCompositeKey];

            // Skip events that originated from our own Number One stream unless remote status changed
            if (ext.embeddedEventId && this.store.getEventById(ext.embeddedEventId)) {
              report.skippedDuplicates++;
              continue;
            }

            let eventTypeToAppend = ext.type;
            if (prevPulled) {
              // Detect external state transition or update instead of silently dropping!
              if (prevPulled.type === ext.type && prevPulled.updatedAt >= normTs) {
                report.skippedDuplicates++;
                continue;
              }
              if (prevPulled.type !== 'issue.resolved' && ext.type === 'issue.resolved') {
                eventTypeToAppend = 'issue.resolved';
              } else if (prevPulled.type === 'issue.resolved' && ext.type === 'issue.opened') {
                eventTypeToAppend = 'issue.reopened';
              } else {
                eventTypeToAppend = 'issue.updated';
              }
            } else if (knownExternalIds.has(extCompositeKey)) {
              report.skippedDuplicates++;
              continue;
            }

            const issueId =
              prevPulled?.issueId ??
              (typeof ext.payload.issueId === 'string'
                ? ext.payload.issueId
                : `${ext.backend}-${ext.externalKey ?? ext.externalId}`);

            const appended = this.store.append({
              type: eventTypeToAppend,
              actor: { kind: 'external-sync', id: ext.actorName, name: ext.actorName },
              harness: ext.backend,
              summary: `[From ${ext.backend} ${ext.externalKey ?? ext.externalId}] ${ext.summary}`,
              tags: Array.from(new Set(['external-sync', ext.backend, ...ext.tags])),
              payload: { ...ext.payload, issueId },
              timestamp: normTs
            });

            const ref = {
              backend: ext.backend,
              externalId: ext.externalId,
              externalKey: ext.externalKey,
              entityType: 'external_issue',
              syncedAt: new Date().toISOString(),
              syncedHash: appended.hash,
              fallbackFields: []
            };
            this.store.attachRemoteRef(appended.id, ext.backend, ref);
            ledger.events[appended.id] = {
              eventId: appended.id,
              seq: appended.seq,
              eventHash: appended.hash,
              remotes: { [ext.backend]: ref },
              fallbackOnlyFields: [],
              updatedAt: new Date().toISOString()
            };
            ledger.entities[`issue:${issueId}`] = ledger.entities[`issue:${issueId}`] ?? {};
            ledger.entities[`issue:${issueId}`]![ext.backend] = ref;
            ledger.pulledStateByExternalId[extCompositeKey] = {
              type: ext.type,
              updatedAt: normTs,
              issueId
            };
            knownExternalIds.add(extCompositeKey);
            report.ingestedCount++;
            this.writeLedger(ledger);
          }

          if (maxTimestampSeen) {
            ledger.lastPulledAtByBackend[adapter.backend] = maxTimestampSeen;
            this.writeLedger(ledger);
          }

          if (report.ingestedCount > 0) {
            this.store.append({
              type: 'sync.pulled',
              actor: { kind: 'numberone', id: 'persistence-fabric', name: 'Persistence Fabric' },
              harness: 'sync',
              summary: `Pulled ${report.ingestedCount} external event(s) from ${adapter.name}`,
              tags: ['sync', adapter.backend],
              payload: {
                backend: adapter.backend,
                ingestedCount: report.ingestedCount,
                skippedDuplicates: report.skippedDuplicates,
                remoteMappingsCount: Object.values(ledger.events).filter((e) =>
                  Boolean(e.remotes[adapter.backend])
                ).length
              }
            });
          }
        } catch (err) {
          report.errors.push(err instanceof Error ? err.message : String(err));
        }

        reports.push(report);
      }

      return reports;
    });
  }

  public async verifyDistributedIntegrity(verifyRemotes = true): Promise<DistributedIntegrityReport> {
    const local = this.store.verifyIntegrity();
    const ledger = this.readLedger();
    const { events } = this.store.readEventsResilient();
    const eventsById = new Map<string, StreamEvent>(events.map((e) => [e.id, e]));

    const remoteChecks: DistributedIntegrityReport['remoteChecks'] = [];
    let allRemotesValid = true;

    if (verifyRemotes) {
      for (const adapter of this.adapters) {
        if (!adapter.isConfigured()) continue;
        let checkedCount = 0;
        let validCount = 0;
        const driftErrors: string[] = [];

        for (const entry of Object.values(ledger.events)) {
          const ref = entry.remotes[adapter.backend];
          if (!ref) continue;
          const ev = eventsById.get(entry.eventId);
          if (!ev) {
            driftErrors.push(`Ledger references missing local event ${entry.eventId}`);
            continue;
          }
          checkedCount++;
          const res = await adapter.verifyRemoteRef(ev, ref);
          if (res.ok) {
            validCount++;
          } else {
            driftErrors.push(res.reason ?? `Remote verification failed for ${ev.id}`);
          }
        }

        if (driftErrors.length > 0) allRemotesValid = false;
        remoteChecks.push({
          backend: adapter.name,
          checkedCount,
          validCount,
          driftErrors
        });
      }
    }

    return {
      valid: local.valid && allRemotesValid,
      localValid: local.valid,
      localErrors: local.errors,
      totalEvents: local.totalEvents,
      verifiedBlobs: local.verifiedBlobs,
      remoteChecks,
      fallbackCoverageValid: local.missingBlobs.length === 0
    };
  }
}
