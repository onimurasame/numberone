import fs from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '../core/hash.js';
import { StreamStore } from '../core/stream-store.js';
import { StreamEvent, WorkspaceProjection } from '../core/types.js';
import { computeUnifiedDiff } from '../utils/diff.js';
import {
  isBinaryBuffer,
  readFileBufferSafe,
  readTextFileSafe,
  walkWorkspaceFiles
} from '../utils/fs-helpers.js';
import { WorkspaceIgnore } from '../utils/ignore.js';
import { isSensitiveSecretFile, redactSecrets } from '../utils/redactor.js';

interface CachedFile {
  hash: string;
  size: number;
  text: string | null;
  sensitiveRedacted: boolean;
}

const CRASH_FILE_PATTERNS = [
  /^hs_err_pid\d+\.log$/i,
  /crash[-_.]?.*\.log$/i,
  /npm-debug\.log$/i,
  /yarn-error\.log$/i,
  /panic\.log$/i
];

function isCrashLogFile(relPath: string): boolean {
  const base = path.basename(relPath);
  return CRASH_FILE_PATTERNS.some((rx) => rx.test(base));
}

export interface FsWatcherOptions {
  debounceMs?: number;
  maxInlineDiffBytes?: number;
  maxWatchedDirs?: number;
  /** Whether fs.watch handles keep the Node.js event loop alive (default false for embedded use, true for daemon). */
  persistent?: boolean;
  extraIgnore?: string[];
  sessionId?: string;
  onEvent?: (event: StreamEvent) => void;
}

const MAX_TOTAL_CACHED_TEXT_BYTES = 64 * 1024 * 1024;

/**
 * Hardened recursive workspace filesystem watcher:
 *  - Symlink-escape & non-regular file safe (rejects symlinks leaving workspaceRoot & FIFOs)
 *  - Never captures raw diffs or blobs for sensitive secret files (.env, *.pem, *.key, id_rsa, etc.)
 *  - Caps max inotify directory watches to avoid OS ENOSPC exhaustion and caps cached text at 64 MB
 *  - Prunes full deleted directory subtrees and schedules descendant deletion events
 *  - Flushes debounced changes cleanly on shutdown without crashing on transient store errors
 */
export class WorkspaceFsWatcher {
  private readonly store: StreamStore;
  private readonly ignore: WorkspaceIgnore;
  private readonly debounceMs: number;
  private readonly maxInlineDiffBytes: number;
  private readonly maxWatchedDirs: number;
  private readonly persistent: boolean;
  private readonly sessionId: string;
  private readonly onEvent?: (event: StreamEvent) => void;

  private readonly snapshot = new Map<string, CachedFile>();
  private cachedTextBytes = 0;
  private readonly dirWatchers = new Map<string, fs.FSWatcher>();
  private readonly pendingPaths = new Set<string>();
  private flushTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(store: StreamStore, options: FsWatcherOptions = {}) {
    this.store = store;
    const cfg = store.readConfig();
    this.debounceMs = options.debounceMs ?? cfg?.watcher.debounceMs ?? 200;
    this.maxInlineDiffBytes =
      options.maxInlineDiffBytes ?? cfg?.watcher.maxInlineDiffBytes ?? 16_384;
    this.maxWatchedDirs = options.maxWatchedDirs ?? 2_000;
    this.persistent = options.persistent ?? false;
    this.ignore = new WorkspaceIgnore(store.workspaceRoot, [
      ...(cfg?.watcher.ignore ?? []),
      ...(options.extraIgnore ?? [])
    ]);
    this.sessionId = options.sessionId ?? `watcher-${Date.now()}`;
    this.onEvent = options.onEvent;
  }

  private setSnapshotEntry(relPath: string, entry: CachedFile): void {
    const prev = this.snapshot.get(relPath);
    if (prev?.text !== null && prev?.text !== undefined) {
      this.cachedTextBytes = Math.max(0, this.cachedTextBytes - Buffer.byteLength(prev.text, 'utf8'));
    }
    let stored = entry;
    if (entry.text !== null) {
      const nextBytes = Buffer.byteLength(entry.text, 'utf8');
      if (this.cachedTextBytes + nextBytes > MAX_TOTAL_CACHED_TEXT_BYTES) {
        // Retain metadata/hash so changes & deletions are still detected without OOM
        stored = { ...entry, text: null };
      } else {
        this.cachedTextBytes += nextBytes;
      }
    }
    this.snapshot.set(relPath, stored);
  }

  private deleteSnapshotEntry(relPath: string): void {
    const prev = this.snapshot.get(relPath);
    if (prev?.text !== null && prev?.text !== undefined) {
      this.cachedTextBytes = Math.max(0, this.cachedTextBytes - Buffer.byteLength(prev.text, 'utf8'));
    }
    this.snapshot.delete(relPath);
  }

  private readFileState(relPath: string): CachedFile | null {
    const abs = path.join(this.store.workspaceRoot, relPath);
    const buf = readFileBufferSafe(abs, 512_000, this.store.workspaceRoot);
    if (!buf) return null;

    const hash = sha256Hex(buf);
    const sensitive = isSensitiveSecretFile(relPath);
    if (sensitive) {
      // Never retain plaintext content of secret files in memory, diffs, or blobs!
      return { hash, size: buf.length, text: null, sensitiveRedacted: true };
    }
    const text = !isBinaryBuffer(buf) ? buf.toString('utf8') : null;
    return { hash, size: buf.length, text, sensitiveRedacted: false };
  }

  public primeSnapshot(): number {
    this.snapshot.clear();
    this.cachedTextBytes = 0;
    const files = walkWorkspaceFiles(this.store.workspaceRoot, (p, d) =>
      this.ignore.shouldIgnore(p, d)
    );
    for (const rel of files) {
      const info = this.readFileState(rel);
      if (info) {
        this.setSnapshotEntry(rel, info);
      }
    }
    return this.snapshot.size;
  }

  public recordBaselineSnapshot(causationId?: string, harness = 'cli'): StreamEvent {
    this.primeSnapshot();
    const fileEntries: Array<{
      path: string;
      contentHash: string;
      sizeBytes: number;
      snapshotBlobHash?: string;
      sensitiveRedacted?: boolean;
    }> = [];

    for (const [rel, info] of Array.from(this.snapshot.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      let snapshotBlobHash: string | undefined;
      if (!info.sensitiveRedacted && info.text !== null && info.size <= 256_000) {
        const blob = this.store.storeBlob('snapshot', info.text, 'text/plain; charset=utf-8');
        snapshotBlobHash = blob.sha256;
      }
      fileEntries.push({
        path: rel,
        contentHash: info.hash,
        sizeBytes: info.size,
        snapshotBlobHash,
        sensitiveRedacted: info.sensitiveRedacted || undefined
      });
    }

    return this.store.append({
      type: 'workspace.snapshot',
      actor: { kind: 'watcher', id: 'fs-watcher', name: 'Workspace Watcher' },
      harness,
      sessionId: this.sessionId,
      causationId,
      summary: `Indexed workspace baseline (${fileEntries.length} files)`,
      affectedPaths: fileEntries.map((f) => f.path).slice(0, 200),
      tags: ['snapshot', 'baseline'],
      payload: {
        fileCount: fileEntries.length,
        files: fileEntries
      }
    });
  }

  public reconcileOfflineChanges(projection: WorkspaceProjection): StreamEvent[] {
    const emitted: StreamEvent[] = [];
    const currentFiles = new Set(
      walkWorkspaceFiles(this.store.workspaceRoot, (p, d) => this.ignore.shouldIgnore(p, d))
    );

    const newlyAppeared = new Map<string, CachedFile>();
    const modifiedFiles: Array<{ rel: string; prev: CachedFile | null; curr: CachedFile }> = [];

    for (const rel of currentFiles) {
      const disk = this.readFileState(rel);
      if (!disk) continue;
      this.setSnapshotEntry(rel, disk);

      const projected = projection.files[rel];
      if (!projected || projected.status === 'deleted') {
        newlyAppeared.set(rel, disk);
      } else if (projected.lastHash && projected.lastHash !== disk.hash) {
        const prevText =
          !disk.sensitiveRedacted && projected.lastSnapshotBlobHash
            ? this.store.readBlobUtf8(projected.lastSnapshotBlobHash)
            : null;
        const prevCached: CachedFile | null =
          prevText !== null
            ? {
                hash: projected.lastHash,
                size: Buffer.byteLength(prevText, 'utf8'),
                text: prevText,
                sensitiveRedacted: false
              }
            : null;
        modifiedFiles.push({ rel, prev: prevCached, curr: disk });
      }
    }

    const disappeared = new Map<string, { lastHash?: string }>();
    for (const [rel, rec] of Object.entries(projection.files)) {
      if (rec.status === 'exists' && !currentFiles.has(rel) && !this.ignore.shouldIgnore(rel, false)) {
        // Confirm entry is genuinely absent on disk before recording fs.deleted
        const abs = path.join(this.store.workspaceRoot, rel);
        if (fs.existsSync(abs)) continue;
        this.deleteSnapshotEntry(rel);
        disappeared.set(rel, { lastHash: rec.lastHash });
      }
    }

    for (const [oldPath, oldInfo] of Array.from(disappeared.entries())) {
      if (!oldInfo.lastHash) continue;
      const matchingNew = Array.from(newlyAppeared.entries()).find(
        ([, newInfo]) => newInfo.hash === oldInfo.lastHash
      );
      if (matchingNew) {
        const [newPath, newInfo] = matchingNew;
        disappeared.delete(oldPath);
        newlyAppeared.delete(newPath);
        emitted.push(this.emitRenameEvent(oldPath, newPath, newInfo, 'offline-reconcile'));
      }
    }

    for (const [rel, disk] of newlyAppeared.entries()) {
      emitted.push(this.emitFileEvent('fs.created', rel, null, disk, 'offline-reconcile'));
    }

    for (const mod of modifiedFiles) {
      emitted.push(this.emitFileEvent('fs.modified', mod.rel, mod.prev, mod.curr, 'offline-reconcile'));
    }

    for (const [rel, rec] of disappeared.entries()) {
      const ev = this.store.append({
        type: 'fs.deleted',
        actor: { kind: 'watcher', id: 'fs-watcher', name: 'Workspace Watcher' },
        harness: 'manual',
        sessionId: this.sessionId,
        summary: `Deleted ${rel} (detected on offline reconciliation)`,
        affectedPaths: [rel],
        tags: ['fs', 'offline-reconcile'],
        payload: { path: rel, previousHash: rec.lastHash }
      });
      emitted.push(ev);
      this.onEvent?.(ev);
    }

    return emitted;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    if (this.snapshot.size === 0) {
      this.primeSnapshot();
    }
    this.watchDirectoryRecursive('');
  }

  public stop(flush = true): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (flush && this.pendingPaths.size > 0) {
      try {
        this.flushPending();
      } catch {
        // best-effort final flush on shutdown
      }
    }
    this.running = false;
    for (const watcher of this.dirWatchers.values()) {
      try {
        watcher.close();
      } catch {
        // ignore
      }
    }
    this.dirWatchers.clear();
  }

  private pruneDeletedDirWatcher(relDir: string): void {
    const prefix = relDir ? `${relDir}/` : '';
    for (const [dirKey, watcher] of Array.from(this.dirWatchers.entries())) {
      if (dirKey === relDir || (prefix && dirKey.startsWith(prefix))) {
        try {
          watcher.close();
        } catch {
          // ignore
        }
        this.dirWatchers.delete(dirKey);
      }
    }
    // Schedule all snapshot files that lived inside the removed/renamed directory
    if (prefix) {
      for (const fileKey of this.snapshot.keys()) {
        if (fileKey === relDir || fileKey.startsWith(prefix)) {
          this.schedulePath(fileKey);
        }
      }
    }
  }

  private watchDirectoryRecursive(relDir: string): void {
    if (!this.running) return;
    if (relDir && this.ignore.shouldIgnore(relDir, true)) return;
    if (this.dirWatchers.has(relDir)) return;
    if (this.dirWatchers.size >= this.maxWatchedDirs) return;

    const absDir = relDir ? path.join(this.store.workspaceRoot, relDir) : this.store.workspaceRoot;
    try {
      const lstat = fs.lstatSync(absDir);
      if (lstat.isSymbolicLink() || !lstat.isDirectory()) return;
    } catch {
      return;
    }

    try {
      const watcher = fs.watch(absDir, { persistent: this.persistent }, (_eventType, filename) => {
        if (!filename) return;
        const name = filename.toString();
        const childRel = relDir ? `${relDir}/${name}` : name;
        const normalized = childRel.replace(/\\/g, '/');
        const absChild = path.join(this.store.workspaceRoot, normalized);

        let isDir = false;
        let isSymlink = false;
        try {
          const st = fs.lstatSync(absChild);
          isSymlink = st.isSymbolicLink();
          isDir = !isSymlink && st.isDirectory();
        } catch {
          // Entry vanished: prune its entire watched directory subtree and schedule child deletions
          this.pruneDeletedDirWatcher(normalized);
        }

        if (isSymlink || this.ignore.shouldIgnore(normalized, isDir)) return;

        if (isDir) {
          this.watchDirectoryRecursive(normalized);
          const nested = walkWorkspaceFiles(absChild, (p, d) =>
            this.ignore.shouldIgnore(`${normalized}/${p}`, d)
          );
          for (const f of nested) {
            this.schedulePath(`${normalized}/${f}`);
          }
          return;
        }

        this.schedulePath(normalized);
      });

      watcher.on('error', () => {
        this.pruneDeletedDirWatcher(relDir);
      });
      this.dirWatchers.set(relDir, watcher);

      const entries = fs.readdirSync(absDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
        const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
        this.watchDirectoryRecursive(childRel);
      }
    } catch {
      // Directory vanished or inaccessible
    }
  }

  private schedulePath(relPath: string): void {
    this.pendingPaths.add(relPath);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      try {
        this.flushPending();
      } catch (err) {
        // Keep long-running daemon alive on transient I/O or lock errors
        console.error(
          `[numberone-watcher] Flush error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }, this.debounceMs);
  }

  public flushPending(): StreamEvent[] {
    const paths = Array.from(this.pendingPaths).sort();
    this.pendingPaths.clear();
    const emitted: StreamEvent[] = [];

    const created = new Map<string, CachedFile>();
    const deleted = new Map<string, CachedFile>();
    const modified: Array<{ rel: string; prev: CachedFile; curr: CachedFile }> = [];

    for (const rel of paths) {
      if (this.ignore.shouldIgnore(rel, false)) continue;
      const prev = this.snapshot.get(rel) ?? null;
      const curr = this.readFileState(rel);

      if (!prev && curr) {
        created.set(rel, curr);
      } else if (prev && !curr) {
        deleted.set(rel, prev);
      } else if (prev && curr && prev.hash !== curr.hash) {
        modified.push({ rel, prev, curr });
      }
    }

    for (const [oldPath, oldInfo] of Array.from(deleted.entries())) {
      const match = Array.from(created.entries()).find(([, newInfo]) => newInfo.hash === oldInfo.hash);
      if (match) {
        const [newPath, newInfo] = match;
        deleted.delete(oldPath);
        created.delete(newPath);
        const ev = this.emitRenameEvent(oldPath, newPath, newInfo, 'live-watch');
        // Mutate snapshot ONLY after store.append() succeeded
        this.deleteSnapshotEntry(oldPath);
        this.setSnapshotEntry(newPath, newInfo);
        emitted.push(ev);
      }
    }

    for (const [rel, curr] of created.entries()) {
      const ev = this.emitFileEvent('fs.created', rel, null, curr, 'live-watch');
      this.setSnapshotEntry(rel, curr);
      emitted.push(ev);
    }

    for (const mod of modified) {
      const ev = this.emitFileEvent('fs.modified', mod.rel, mod.prev, mod.curr, 'live-watch');
      this.setSnapshotEntry(mod.rel, mod.curr);
      emitted.push(ev);
    }

    for (const [rel, prev] of deleted.entries()) {
      const ev = this.store.append({
        type: 'fs.deleted',
        actor: { kind: 'watcher', id: 'fs-watcher', name: 'Workspace Watcher' },
        harness: 'watcher',
        sessionId: this.sessionId,
        summary: `Deleted ${rel}`,
        affectedPaths: [rel],
        tags: ['fs', 'live-watch'],
        payload: { path: rel, previousHash: prev.hash, previousSize: prev.size }
      });
      this.deleteSnapshotEntry(rel);
      emitted.push(ev);
      this.onEvent?.(ev);
    }

    return emitted;
  }

  private emitRenameEvent(
    fromPath: string,
    toPath: string,
    curr: CachedFile,
    sourceTag: string
  ): StreamEvent {
    const fallbackBlobs: Array<{ key: string; content: string | Buffer; contentType?: string }> = [];
    if (!curr.sensitiveRedacted && curr.text !== null && curr.size <= 256_000) {
      fallbackBlobs.push({
        key: 'snapshot',
        content: curr.text,
        contentType: 'text/plain; charset=utf-8'
      });
    }
    const ev = this.store.append({
      type: 'fs.renamed',
      actor: { kind: 'watcher', id: 'fs-watcher', name: 'Workspace Watcher' },
      harness: sourceTag === 'offline-reconcile' ? 'manual' : 'watcher',
      sessionId: this.sessionId,
      summary: `Renamed ${fromPath} -> ${toPath}`,
      affectedPaths: [fromPath, toPath],
      tags: ['fs', 'rename', sourceTag],
      payload: {
        fromPath,
        toPath,
        contentHash: curr.hash,
        sizeBytes: curr.size,
        sensitiveRedacted: curr.sensitiveRedacted || undefined
      },
      fallbackBlobs
    });
    this.onEvent?.(ev);
    return ev;
  }

  private emitFileEvent(
    type: 'fs.created' | 'fs.modified',
    relPath: string,
    prev: CachedFile | null,
    curr: CachedFile,
    sourceTag: string
  ): StreamEvent {
    const fallbackBlobs: Array<{ key: string; content: string | Buffer; contentType?: string }> = [];
    const payload: Record<string, unknown> = {
      path: relPath,
      contentHash: curr.hash,
      sizeBytes: curr.size,
      previousHash: prev?.hash ?? null
    };

    if (curr.sensitiveRedacted) {
      payload.sensitiveRedacted = true;
      payload.note = 'Sensitive credential/key file content excluded from stream diffs and blobs.';
    } else if (curr.text !== null) {
      if (type === 'fs.created' || prev !== null) {
        const beforeText = prev?.text ?? '';
        const diff = computeUnifiedDiff(relPath, beforeText, curr.text);
        const safeDiff = redactSecrets(diff.unified);
        payload.linesAdded = diff.added;
        payload.linesRemoved = diff.removed;
        if (Buffer.byteLength(safeDiff, 'utf8') <= this.maxInlineDiffBytes) {
          payload.diff = safeDiff;
        } else {
          payload.diffTruncated = true;
          fallbackBlobs.push({
            key: 'diff',
            content: safeDiff,
            contentType: 'text/x-diff; charset=utf-8'
          });
        }
      }
      if (curr.size <= 256_000) {
        fallbackBlobs.push({
          key: 'snapshot',
          content: curr.text,
          contentType: 'text/plain; charset=utf-8'
        });
      }
    }

    const verb = type === 'fs.created' ? 'Created' : 'Modified';
    const delta = curr.sensitiveRedacted
      ? ' (metadata only; sensitive file redacted)'
      : typeof payload.linesAdded === 'number'
        ? ` (+${payload.linesAdded}/-${payload.linesRemoved})`
        : ` (${curr.size}B)`;

    const ev = this.store.append({
      type,
      actor: { kind: 'watcher', id: 'fs-watcher', name: 'Workspace Watcher' },
      harness: sourceTag === 'offline-reconcile' ? 'manual' : 'watcher',
      sessionId: this.sessionId,
      summary: `${verb} ${relPath}${delta}`,
      affectedPaths: [relPath],
      tags: ['fs', sourceTag, ...(curr.sensitiveRedacted ? ['sensitive-redacted'] : [])],
      payload,
      fallbackBlobs
    });
    this.onEvent?.(ev);

    if (!curr.sensitiveRedacted && isCrashLogFile(relPath)) {
      const content =
        readTextFileSafe(path.join(this.store.workspaceRoot, relPath), 512_000, this.store.workspaceRoot) ?? '';
      const safeContent = redactSecrets(content);
      const firstErrorLine =
        safeContent
          .split(/\r?\n/)
          .find((l) => /error|exception|fatal|panic|segfault/i.test(l))
          ?.trim() ?? `Crash log detected: ${relPath}`;
      const crashEv = this.store.append({
        type: 'exec.crashed',
        actor: { kind: 'watcher', id: 'fs-watcher', name: 'Workspace Watcher' },
        harness: 'watcher',
        sessionId: this.sessionId,
        causationId: ev.id,
        summary: `Crash log detected in ${relPath}: ${firstErrorLine.slice(0, 120)}`,
        affectedPaths: [relPath],
        tags: ['crash', 'crash-log'],
        payload: {
          command: `crash-log:${relPath}`,
          exitCode: null,
          errorSignature: firstErrorLine.slice(0, 180),
          stderrExcerpt: safeContent.slice(0, 1000)
        },
        fallbackBlobs: safeContent
          ? [{ key: 'crashLog', content: safeContent, contentType: 'text/plain; charset=utf-8' }]
          : []
      });
      this.onEvent?.(crashEv);
    }

    return ev;
  }
}
