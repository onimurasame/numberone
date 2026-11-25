import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { GENESIS_HASH, hashObject, sha256Hex } from './hash.js';
import { generateUlid } from './ulid.js';
import {
  AppendEventInput,
  BlobRef,
  NumberOneConfig,
  RemoteRecordRef,
  StreamEvent,
  StreamEventSchema
} from './types.js';
import {
  atomicWriteFileSync,
  atomicWriteJsonSync,
  ensureDir,
  isBinaryBuffer,
  readFileBufferSafe,
  readJsonSafe
} from '../utils/fs-helpers.js';
import { withFileLockSync } from '../utils/lock.js';
import { redactObjectDeep, redactSecrets } from '../utils/redactor.js';

export const StreamHeadSchema = z.object({
  schemaVersion: z.literal(1),
  lastSeq: z.number().int().nonnegative(),
  lastEventId: z.string().nullable(),
  lastHash: z.string().length(64),
  updatedAt: z.string()
});

export type StreamHead = z.infer<typeof StreamHeadSchema>;

export interface IntegrityCheckResult {
  valid: boolean;
  totalEvents: number;
  verifiedBlobs: number;
  missingBlobs: string[];
  errors: string[];
  headSeq: number;
  headHash: string;
}

export interface StreamQuery {
  types?: StreamEvent['type'][];
  sinceSeq?: number;
  untilSeq?: number;
  sinceTimestamp?: string;
  untilTimestamp?: string;
  harness?: string;
  sessionId?: string;
  tag?: string;
  pathPrefix?: string;
  search?: string;
  limit?: number;
}

export const NUMBERONE_DIR = '.numberone';

const EVENT_FILENAME_RX = /^(\d+)-([^/]+)\.json$/;

function padSeq(seq: number): string {
  return String(seq).padStart(8, '0');
}

function parseEventFilename(filename: string): { seq: number; id: string } | null {
  const m = EVENT_FILENAME_RX.exec(filename);
  if (!m?.[1] || !m[2]) return null;
  const seq = Number.parseInt(m[1], 10);
  if (!Number.isSafeInteger(seq) || seq <= 0) return null;
  return { seq, id: m[2] };
}

function isRedactableContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase().split(';')[0]!.trim();
  return (
    ct.startsWith('text/') ||
    ct === 'application/json' ||
    ct === 'application/xml' ||
    ct === 'application/yaml' ||
    ct === 'application/x-yaml' ||
    ct.endsWith('+json') ||
    ct.endsWith('+xml')
  );
}

function normalizeIsoTimestamp(raw?: string): string {
  if (!raw) return new Date().toISOString();
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function compareTimestampMs(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isFinite(ta) && Number.isFinite(tb)) {
    return ta - tb;
  }
  return a.localeCompare(b);
}

/**
 * Atomic, crash-consistent, cross-process locked event-sourced stream store rooted at `<workspace>/.numberone/`.
 */
export class StreamStore {
  public readonly workspaceRoot: string;
  public readonly rootDir: string;
  public readonly streamDir: string;
  public readonly eventsDir: string;
  public readonly blobsDir: string;
  public readonly syncDir: string;
  public readonly projectionsDir: string;
  public readonly configPath: string;
  public readonly headPath: string;
  public readonly lockPath: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.rootDir = path.join(this.workspaceRoot, NUMBERONE_DIR);
    this.streamDir = path.join(this.rootDir, 'stream');
    this.eventsDir = path.join(this.streamDir, 'events');
    this.blobsDir = path.join(this.streamDir, 'blobs');
    this.syncDir = path.join(this.rootDir, 'sync');
    this.projectionsDir = path.join(this.rootDir, 'projections');
    this.configPath = path.join(this.rootDir, 'config.json');
    this.headPath = path.join(this.streamDir, 'head.json');
    this.lockPath = path.join(this.streamDir, '.stream.lock');
  }

  public isInitialized(): boolean {
    return fs.existsSync(this.configPath) && fs.existsSync(this.eventsDir);
  }

  public withStreamLock<T>(fn: () => T): T {
    return withFileLockSync(this.lockPath, fn);
  }

  private readHeadStrict(): StreamHead | null {
    const raw = readJsonSafe<unknown>(this.headPath);
    if (!raw) return null;
    const parsed = StreamHeadSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  private readEventFile(filename: string): StreamEvent {
    const fullPath = path.join(this.eventsDir, filename);
    const buf = readFileBufferSafe(fullPath, 20_000_000, this.eventsDir);
    if (!buf) {
      throw new Error(`Unable to safely read event file ${filename}`);
    }
    return StreamEventSchema.parse(JSON.parse(buf.toString('utf8')));
  }

  /**
   * Fail-closed head resolution:
   *  - Heals `head.json` ONLY when a prior crash wrote the exact next valid chained event
   *    (`lastEvent.seq === cachedHead.lastSeq + 1 && prevHash === cachedHead.lastHash && hash valid`)
   *    or when `head.json` is absent and the tip event's self-hash is valid.
   *  - Refuses (throws) on tip tampering, sequence gaps, truncation, or corrupt tip files.
   */
  private resolveAuthoritativeHeadLocked(): StreamHead {
    const rawHeadExists = fs.existsSync(this.headPath);
    const cachedHead = this.readHeadStrict();
    const files = this.listEventFiles();

    if (files.length === 0) {
      if (cachedHead && cachedHead.lastSeq > 0) {
        throw new Error(
          `Stream integrity violation: head.json expects seq=${cachedHead.lastSeq}, but events/ directory is empty.`
        );
      }
      if (rawHeadExists && !cachedHead) {
        throw new Error('Stream integrity violation: head.json is corrupt.');
      }
      return (
        cachedHead ?? {
          schemaVersion: 1,
          lastSeq: 0,
          lastEventId: null,
          lastHash: GENESIS_HASH,
          updatedAt: new Date().toISOString()
        }
      );
    }

    const lastFile = files[files.length - 1]!;
    let lastEvent: StreamEvent;
    try {
      lastEvent = this.readEventFile(lastFile);
    } catch (err) {
      throw new Error(
        `Stream integrity violation: corrupt tip event file "${lastFile}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const expectedFilename = `${padSeq(lastEvent.seq)}-${lastEvent.id}.json`;
    if (lastFile !== expectedFilename) {
      throw new Error(
        `Stream integrity violation: tip filename "${lastFile}" does not match event metadata "${expectedFilename}".`
      );
    }

    const recomputedHash = this.computeEventHash(lastEvent);
    if (recomputedHash !== lastEvent.hash) {
      throw new Error(
        `Stream integrity violation: tip event seq=${lastEvent.seq} (${lastEvent.id}) failed SHA-256 verification; refusing to update head.json.`
      );
    }

    if (cachedHead) {
      if (lastEvent.seq < cachedHead.lastSeq) {
        throw new Error(
          `Stream integrity violation: stream truncated (head.json seq=${cachedHead.lastSeq}, tip file seq=${lastEvent.seq}).`
        );
      }
      if (lastEvent.seq === cachedHead.lastSeq) {
        if (lastEvent.hash !== cachedHead.lastHash || lastEvent.id !== cachedHead.lastEventId) {
          throw new Error(
            `Stream integrity violation: tip event seq=${lastEvent.seq} hash/id disagrees with head.json.`
          );
        }
        return cachedHead;
      }
      // Forward crash recovery: allow healing ONLY if tip chains cleanly from cachedHead
      if (lastEvent.seq !== cachedHead.lastSeq + 1 || lastEvent.prevHash !== cachedHead.lastHash) {
        throw new Error(
          `Stream integrity violation: unchained tip seq=${lastEvent.seq} cannot heal from head seq=${cachedHead.lastSeq}.`
        );
      }
      const healed: StreamHead = {
        schemaVersion: 1,
        lastSeq: lastEvent.seq,
        lastEventId: lastEvent.id,
        lastHash: lastEvent.hash,
        updatedAt: lastEvent.timestamp
      };
      atomicWriteJsonSync(this.headPath, healed, 0o600);
      return healed;
    }

    // head.json was absent or partial: recover only if rawHead didn't exist with incompatible schema
    const recovered: StreamHead = {
      schemaVersion: 1,
      lastSeq: lastEvent.seq,
      lastEventId: lastEvent.id,
      lastHash: lastEvent.hash,
      updatedAt: lastEvent.timestamp
    };
    atomicWriteJsonSync(this.headPath, recovered, 0o600);
    return recovered;
  }

  public init(config?: Partial<NumberOneConfig>): NumberOneConfig {
    ensureDir(this.rootDir, 0o700);
    ensureDir(this.eventsDir, 0o700);
    ensureDir(this.blobsDir, 0o700);
    ensureDir(this.syncDir, 0o700);
    ensureDir(this.projectionsDir, 0o700);

    return this.withStreamLock(() => {
      const existing = this.readConfig();
      const workspaceName =
        config?.workspaceName ?? existing?.workspaceName ?? path.basename(this.workspaceRoot);
      const merged: NumberOneConfig = {
        schemaVersion: 1,
        workspaceId: config?.workspaceId ?? existing?.workspaceId ?? generateUlid(),
        workspaceName,
        attachedAt: config?.attachedAt ?? existing?.attachedAt ?? new Date().toISOString(),
        authoritativeMode: config?.authoritativeMode ?? existing?.authoritativeMode ?? 'strict',
        watcher: {
          debounceMs: config?.watcher?.debounceMs ?? existing?.watcher?.debounceMs ?? 250,
          ignore: config?.watcher?.ignore ?? existing?.watcher?.ignore ?? [],
          maxInlineDiffBytes:
            config?.watcher?.maxInlineDiffBytes ?? existing?.watcher?.maxInlineDiffBytes ?? 16_384
        },
        persistence: {
          directory: config?.persistence?.directory ?? existing?.persistence?.directory,
          github: config?.persistence?.github ?? existing?.persistence?.github,
          jira: config?.persistence?.jira ?? existing?.persistence?.jira
        },
        llm: config?.llm ?? existing?.llm ?? { provider: 'none' },
        crew: {
          enabledOfficers: config?.crew?.enabledOfficers ??
            existing?.crew?.enabledOfficers ?? ['engineering', 'security', 'bridge'],
          autoTriageOnCrash:
            config?.crew?.autoTriageOnCrash ?? existing?.crew?.autoTriageOnCrash ?? true,
          autoTriageOnSecurityFinding:
            config?.crew?.autoTriageOnSecurityFinding ??
            existing?.crew?.autoTriageOnSecurityFinding ??
            true
        }
      };

      atomicWriteJsonSync(this.configPath, merged, 0o600);

      if (!fs.existsSync(this.headPath)) {
        const head = this.resolveAuthoritativeHeadLocked();
        atomicWriteJsonSync(this.headPath, head, 0o600);
      }

      return merged;
    });
  }

  public readConfig(): NumberOneConfig | null {
    return readJsonSafe<NumberOneConfig>(this.configPath);
  }

  public writeConfig(config: NumberOneConfig): void {
    this.withStreamLock(() => {
      atomicWriteJsonSync(this.configPath, config, 0o600);
    });
  }

  public getHead(): StreamHead {
    const head = this.readHeadStrict();
    if (head) return head;

    // Fast O(1) fallback reading only the final event file rather than the full stream
    const files = this.listEventFiles();
    if (files.length > 0) {
      try {
        const last = this.readEventFile(files[files.length - 1]!);
        return {
          schemaVersion: 1,
          lastSeq: last.seq,
          lastEventId: last.id,
          lastHash: last.hash,
          updatedAt: last.timestamp
        };
      } catch {
        // fall through to genesis if unreadable
      }
    }
    return {
      schemaVersion: 1,
      lastSeq: 0,
      lastEventId: null,
      lastHash: GENESIS_HASH,
      updatedAt: new Date().toISOString()
    };
  }

  public storeBlob(
    key: string,
    content: string | Buffer,
    contentType = 'text/plain; charset=utf-8',
    options: { redactText?: boolean } = {}
  ): BlobRef {
    ensureDir(this.blobsDir, 0o700);
    const shouldRedact = options.redactText !== false && isRedactableContentType(contentType);
    let buf: Buffer;
    if (typeof content === 'string') {
      buf = Buffer.from(shouldRedact ? redactSecrets(content) : content, 'utf8');
    } else if (shouldRedact && !isBinaryBuffer(content)) {
      buf = Buffer.from(redactSecrets(content.toString('utf8')), 'utf8');
    } else {
      buf = content;
    }

    const hash = sha256Hex(buf);
    const blobPath = path.join(this.blobsDir, hash);
    if (!fs.existsSync(blobPath)) {
      atomicWriteFileSync(blobPath, buf, 0o600);
    }
    return {
      key,
      sha256: hash,
      uri: `n1://fallback/${hash}`,
      sizeBytes: buf.length,
      contentType
    };
  }

  public readBlob(sha256: string, maxBytes = 50_000_000): Buffer | null {
    const clean = sha256.replace(/^n1:\/\/fallback\//, '');
    if (!/^[a-f0-9]{64}$/.test(clean)) return null;
    const blobPath = path.join(this.blobsDir, clean);
    return readFileBufferSafe(blobPath, maxBytes, this.blobsDir);
  }

  public readBlobUtf8(sha256: string): string | null {
    const buf = this.readBlob(sha256);
    return buf ? buf.toString('utf8') : null;
  }

  public append(input: AppendEventInput): StreamEvent {
    if (!this.isInitialized()) {
      this.init();
    }

    return this.withStreamLock(() => {
      const head = this.resolveAuthoritativeHeadLocked();
      const nextSeq = head.lastSeq + 1;
      const id = generateUlid();
      const timestamp = normalizeIsoTimestamp(input.timestamp);

      const blobs: BlobRef[] = [];
      for (const blobInput of input.fallbackBlobs ?? []) {
        blobs.push(
          this.storeBlob(
            blobInput.key,
            blobInput.content,
            blobInput.contentType ?? 'text/plain; charset=utf-8'
          )
        );
      }

      const sanitizedSummary = redactSecrets(input.summary);
      const sanitizedPayload = redactObjectDeep(input.payload ?? {});

      const baseEvent = {
        schemaVersion: 1 as const,
        id,
        seq: nextSeq,
        timestamp,
        type: input.type,
        actor: input.actor,
        harness: input.harness ?? 'cli',
        sessionId: input.sessionId ?? `session-${id.slice(0, 10)}`,
        causationId: input.causationId,
        correlationId: input.correlationId,
        summary: sanitizedSummary,
        tags: Array.from(new Set(input.tags ?? [])).sort(),
        affectedPaths: Array.from(
          new Set((input.affectedPaths ?? []).map((p) => p.replace(/\\/g, '/')))
        ).sort(),
        payload: sanitizedPayload,
        blobs,
        storageManifest: {
          local: true as const,
          fallbackBlobHashes: blobs.map((b) => b.sha256),
          remotes: {} as Record<string, RemoteRecordRef>
        },
        prevHash: head.lastHash
      };

      const hash = this.computeEventHash(baseEvent);
      const fullEvent: StreamEvent = StreamEventSchema.parse({
        ...baseEvent,
        hash
      });

      const filename = `${padSeq(nextSeq)}-${id}.json`;
      const filePath = path.join(this.eventsDir, filename);
      atomicWriteJsonSync(filePath, fullEvent, 0o600);

      const nextHead: StreamHead = {
        schemaVersion: 1,
        lastSeq: nextSeq,
        lastEventId: id,
        lastHash: hash,
        updatedAt: timestamp
      };
      atomicWriteJsonSync(this.headPath, nextHead, 0o600);

      return fullEvent;
    });
  }

  public computeEventHash(event: Omit<StreamEvent, 'hash'>): string {
    return hashObject({
      schemaVersion: event.schemaVersion,
      id: event.id,
      seq: event.seq,
      timestamp: event.timestamp,
      type: event.type,
      actor: event.actor,
      harness: event.harness,
      sessionId: event.sessionId,
      causationId: event.causationId ?? null,
      correlationId: event.correlationId ?? null,
      summary: event.summary,
      tags: event.tags,
      affectedPaths: event.affectedPaths,
      payload: event.payload,
      blobs: event.blobs,
      prevHash: event.prevHash
    });
  }

  public listEventFiles(): string[] {
    if (!fs.existsSync(this.eventsDir)) return [];
    return fs
      .readdirSync(this.eventsDir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
      .sort((a, b) => {
        const pa = parseEventFilename(a);
        const pb = parseEventFilename(b);
        if (pa && pb && pa.seq !== pb.seq) return pa.seq - pb.seq;
        return a.localeCompare(b);
      });
  }

  public readAllEvents(): StreamEvent[] {
    const files = this.listEventFiles();
    const events: StreamEvent[] = [];
    for (const file of files) {
      events.push(this.readEventFile(file));
    }
    return events;
  }

  /**
   * Resilient read used by distributed integrity verification so a corrupt local file
   * is reported cleanly instead of crashing remote verification.
   */
  public readEventsResilient(): { events: StreamEvent[]; errors: string[] } {
    const files = this.listEventFiles();
    const events: StreamEvent[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        events.push(this.readEventFile(file));
      } catch (err) {
        errors.push(`Corrupt event file ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { events, errors };
  }

  public getEventById(eventId: string): StreamEvent | null {
    if (!eventId) return null;
    const files = this.listEventFiles();
    const match = files.find((f) => parseEventFilename(f)?.id === eventId);
    if (!match) return null;
    return this.readEventFile(match);
  }

  /**
   * O(K) range-filtered stream query: filters filenames by numeric sequence prefix BEFORE
   * opening or parsing files on disk so incremental replay and lookbacks stay fast at scale.
   */
  public query(filter: StreamQuery = {}): StreamEvent[] {
    let files = this.listEventFiles();

    if (filter.sinceSeq !== undefined || filter.untilSeq !== undefined) {
      files = files.filter((f) => {
        const parsed = parseEventFilename(f);
        if (!parsed) return true;
        if (filter.sinceSeq !== undefined && parsed.seq < filter.sinceSeq) return false;
        if (filter.untilSeq !== undefined && parsed.seq > filter.untilSeq) return false;
        return true;
      });
    }

    const hasContentFilters = Boolean(
      filter.sinceTimestamp ||
        filter.untilTimestamp ||
        (filter.types && filter.types.length > 0) ||
        filter.harness ||
        filter.sessionId ||
        filter.tag ||
        filter.pathPrefix ||
        filter.search
    );

    if (!hasContentFilters && filter.limit !== undefined && filter.limit > 0 && files.length > filter.limit) {
      files = files.slice(-filter.limit);
    }

    const typeSet = filter.types && filter.types.length > 0 ? new Set(filter.types) : null;
    const normPrefix = filter.pathPrefix ? filter.pathPrefix.replace(/\\/g, '/') : null;
    const needle = filter.search ? filter.search.toLowerCase() : null;

    const events: StreamEvent[] = [];
    for (const file of files) {
      const e = this.readEventFile(file);
      if (filter.sinceSeq !== undefined && e.seq < filter.sinceSeq) continue;
      if (filter.untilSeq !== undefined && e.seq > filter.untilSeq) continue;
      if (filter.sinceTimestamp && compareTimestampMs(e.timestamp, filter.sinceTimestamp) < 0) continue;
      if (filter.untilTimestamp && compareTimestampMs(e.timestamp, filter.untilTimestamp) > 0) continue;
      if (typeSet && !typeSet.has(e.type)) continue;
      if (filter.harness && e.harness !== filter.harness) continue;
      if (filter.sessionId && e.sessionId !== filter.sessionId) continue;
      if (filter.tag && !e.tags.includes(filter.tag)) continue;
      if (normPrefix && !e.affectedPaths.some((p) => p.startsWith(normPrefix))) continue;
      if (
        needle &&
        !(
          e.summary.toLowerCase().includes(needle) ||
          JSON.stringify(e.payload).toLowerCase().includes(needle) ||
          e.tags.some((t) => t.toLowerCase().includes(needle))
        )
      ) {
        continue;
      }
      events.push(e);
    }

    if (filter.limit !== undefined && filter.limit > 0) {
      return events.slice(-filter.limit);
    }
    return events;
  }

  public attachRemoteRef(
    eventId: string,
    backendKey: string,
    ref: RemoteRecordRef
  ): StreamEvent | null {
    return this.withStreamLock(() => {
      const files = this.listEventFiles();
      const match = files.find((f) => parseEventFilename(f)?.id === eventId);
      if (!match) return null;
      const fullPath = path.join(this.eventsDir, match);
      const parsed = this.readEventFile(match);
      parsed.storageManifest.remotes[backendKey] = ref;
      atomicWriteJsonSync(fullPath, parsed, 0o600);
      return parsed;
    });
  }

  public verifyIntegrity(): IntegrityCheckResult {
    return this.withStreamLock(() => {
      const errors: string[] = [];
      const missingBlobs: string[] = [];
      let verifiedBlobs = 0;

      // Check for unexpected non-event artifacts in eventsDir
      if (fs.existsSync(this.eventsDir)) {
        for (const entry of fs.readdirSync(this.eventsDir)) {
          if (entry.startsWith('.')) continue;
          if (!parseEventFilename(entry)) {
            errors.push(`Unexpected non-event file in stream/events/: ${entry}`);
          }
        }
      }

      const files = this.listEventFiles();
      let expectedPrevHash = GENESIS_HASH;
      let expectedSeq = 1;
      let lastHash = GENESIS_HASH;
      let lastSeq = 0;
      let lastEventId: string | null = null;

      for (const file of files) {
        let event: StreamEvent;
        try {
          event = this.readEventFile(file);
        } catch (err) {
          errors.push(`Corrupt event file ${file}: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }

        const expectedFile = `${padSeq(event.seq)}-${event.id}.json`;
        if (file !== expectedFile) {
          errors.push(`Filename mismatch: "${file}" does not match "${expectedFile}"`);
        }
        if (event.seq !== expectedSeq) {
          errors.push(`Sequence gap at ${file}: expected seq ${expectedSeq}, got ${event.seq}`);
        }
        if (event.prevHash !== expectedPrevHash) {
          errors.push(`Broken hash chain at seq ${event.seq} (${event.id}): prevHash mismatch`);
        }

        const recomputed = this.computeEventHash(event);
        if (recomputed !== event.hash) {
          errors.push(`Tampered event detected at seq ${event.seq} (${event.id}): hash mismatch`);
        }

        const expectedManifestHashes = event.blobs.map((b) => b.sha256);
        const manifestHashes = event.storageManifest.fallbackBlobHashes ?? [];
        if (
          manifestHashes.length !== expectedManifestHashes.length ||
          manifestHashes.some((h, idx) => h !== expectedManifestHashes[idx])
        ) {
          errors.push(`Fallback blob manifest mismatch on event seq ${event.seq} (${event.id})`);
        }

        for (const blob of event.blobs) {
          if (blob.uri !== `n1://fallback/${blob.sha256}`) {
            errors.push(`Malformed fallback blob URI "${blob.uri}" on event ${event.id}`);
          }
          const data = this.readBlob(blob.sha256);
          if (!data) {
            missingBlobs.push(`${event.id}:${blob.sha256}`);
            errors.push(`Missing fallback blob ${blob.uri} referenced by event ${event.id}`);
          } else {
            const actualHash = sha256Hex(data);
            if (actualHash !== blob.sha256) {
              errors.push(`Corrupted fallback blob ${blob.uri}: expected ${blob.sha256}, got ${actualHash}`);
            } else if (data.length !== blob.sizeBytes) {
              errors.push(
                `Blob size mismatch for ${blob.uri}: expected ${blob.sizeBytes} bytes, got ${data.length}`
              );
            } else {
              verifiedBlobs++;
            }
          }
        }

        expectedPrevHash = event.hash;
        lastHash = event.hash;
        lastSeq = event.seq;
        lastEventId = event.id;
        expectedSeq = event.seq + 1;
      }

      // Verify head.json strictly (never mask missing or corrupt head.json)
      if (!fs.existsSync(this.headPath)) {
        errors.push('Missing stream/head.json file.');
      } else {
        const head = this.readHeadStrict();
        if (!head) {
          errors.push('Corrupt or schema-invalid stream/head.json file.');
        } else if (
          head.lastSeq !== lastSeq ||
          head.lastHash !== lastHash ||
          head.lastEventId !== lastEventId
        ) {
          errors.push(
            `Head pointer drift: head.json says seq=${head.lastSeq} id=${head.lastEventId ?? 'null'} (${head.lastHash.slice(0, 8)}), actual stream ends at seq=${lastSeq} id=${lastEventId ?? 'null'} (${lastHash.slice(0, 8)})`
          );
        }
      }

      return {
        valid: errors.length === 0,
        totalEvents: files.length,
        verifiedBlobs,
        missingBlobs,
        errors,
        headSeq: lastSeq,
        headHash: lastHash
      };
    });
  }
}
