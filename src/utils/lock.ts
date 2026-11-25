import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from './fs-helpers.js';

const SLEEP_ARRAY = new Int32Array(new SharedArrayBuffer(4));
const CURRENT_INSTANCE_ID = randomBytes(12).toString('hex');

interface LockMetadata {
  pid: number;
  instanceId: string;
  procStartTicks: string | null;
  acquiredAt: number;
}

interface AcquiredLock {
  lockPath: string;
  dev: number;
  ino: number;
}

function sleepSyncMs(ms: number): void {
  Atomics.wait(SLEEP_ARRAY, 0, 0, ms);
}

function sleepAsyncMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && (err as { code?: string }).code === 'EPERM') {
      return true;
    }
    return false;
  }
}

/**
 * Reads process start time ticks (field 22) from Linux `/proc/<pid>/stat`
 * to distinguish OS-recycled PIDs and container PID-1 restarts.
 */
export function readProcStartTicks(pid: number): string | null {
  try {
    const statText = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const closeParen = statText.lastIndexOf(')');
    if (closeParen === -1) return null;
    const fields = statText.slice(closeParen + 2).trim().split(/\s+/);
    // Field 3 is index 0 after ')'; field 22 (starttime) is index 19
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

function isLockStale(lockPath: string, staleAfterMs: number): { stale: boolean; dev: number; ino: number } {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(lockPath);
  } catch {
    return { stale: false, dev: 0, ino: 0 };
  }

  let parsed: Partial<LockMetadata> | null = null;
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    if (raw.trim().length > 0) {
      parsed = JSON.parse(raw) as Partial<LockMetadata>;
    }
  } catch {
    parsed = null;
  }

  const mtimeAge = Date.now() - st.mtimeMs;

  // Corrupt or 0-byte lockfile: reclaim after brief 2s grace window
  if (!parsed || typeof parsed.pid !== 'number' || !Number.isFinite(parsed.pid)) {
    return { stale: mtimeAge > 2000, dev: st.dev, ino: st.ino };
  }

  // Container PID-1 restart (or same PID from prior process image): different instanceId!
  if (parsed.pid === process.pid && parsed.instanceId && parsed.instanceId !== CURRENT_INSTANCE_ID) {
    return { stale: true, dev: st.dev, ino: st.ino };
  }

  // Owner process is dead
  if (!isProcessAlive(parsed.pid)) {
    return { stale: true, dev: st.dev, ino: st.ino };
  }

  // Linux OS PID reuse: PID is alive, but /proc/<pid>/stat start ticks changed
  if (parsed.procStartTicks) {
    const currentTicks = readProcStartTicks(parsed.pid);
    if (currentTicks !== null && currentTicks !== parsed.procStartTicks) {
      return { stale: true, dev: st.dev, ino: st.ino };
    }
  }

  // Legacy lockfile without instanceId/procStartTicks: allow age-based fallback only if pid missing
  if (!parsed.instanceId && mtimeAge > staleAfterMs && !isProcessAlive(parsed.pid)) {
    return { stale: true, dev: st.dev, ino: st.ino };
  }

  // Never evict a proven-alive holder purely on wall-clock age
  return { stale: false, dev: st.dev, ino: st.ino };
}

/**
 * Coordinates stale lock reclamation using a short-lived `.reclaim` guard
 * verifying `(dev, ino)` did not change, preventing two waiters from unlinking a winner's live lock.
 */
function tryReclaimStaleLock(lockPath: string, staleAfterMs: number): boolean {
  const initial = isLockStale(lockPath, staleAfterMs);
  if (!initial.stale) return false;

  const reclaimGuard = `${lockPath}.reclaim`;
  let guardFd: number | null = null;
  try {
    guardFd = fs.openSync(reclaimGuard, 'wx', 0o600);
  } catch (err: unknown) {
    const code = err && typeof err === 'object' ? (err as { code?: string }).code : undefined;
    if (code === 'EEXIST') {
      try {
        const gst = fs.lstatSync(reclaimGuard);
        if (Date.now() - gst.mtimeMs > 5000) {
          fs.unlinkSync(reclaimGuard);
        }
      } catch {
        // ignore
      }
    }
    return false;
  }

  try {
    const current = isLockStale(lockPath, staleAfterMs);
    if (current.stale && current.dev === initial.dev && current.ino === initial.ino) {
      try {
        fs.unlinkSync(lockPath);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  } finally {
    try {
      fs.closeSync(guardFd);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(reclaimGuard);
    } catch {
      // ignore
    }
  }
}

/**
 * Atomically publishes a fully populated, fsynced lockfile using temp-file + `fs.linkSync`
 * (eliminating 0-byte lockfile deadlocks and FD leaks).
 */
function tryAcquireLockOnce(lockPath: string): AcquiredLock | null {
  const dir = path.dirname(lockPath);
  const tmpPath = path.join(
    dir,
    `.${path.basename(lockPath)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  );
  const meta: LockMetadata = {
    pid: process.pid,
    instanceId: CURRENT_INSTANCE_ID,
    procStartTicks: readProcStartTicks(process.pid),
    acquiredAt: Date.now()
  };
  const payload = Buffer.from(JSON.stringify(meta), 'utf8');

  let fd: number | null = null;
  try {
    fd = fs.openSync(tmpPath, 'wx', 0o600);
    let offset = 0;
    while (offset < payload.length) {
      const n = fs.writeSync(fd, payload, offset, payload.length - offset);
      if (n <= 0) throw new Error(`Short write to lock temp file ${tmpPath}`);
      offset += n;
    }
    fs.fsyncSync(fd);
    const st = fs.fstatSync(fd);
    fs.closeSync(fd);
    fd = null;

    try {
      fs.linkSync(tmpPath, lockPath);
    } catch (err: unknown) {
      const code = err && typeof err === 'object' ? (err as { code?: string }).code : undefined;
      if (code === 'EEXIST') {
        return null;
      }
      // Fallback for rare filesystems without hardlink support
      if (code === 'EPERM' || code === 'EXDEV' || code === 'ENOTSUP') {
        let fallbackFd: number | null = null;
        try {
          fallbackFd = fs.openSync(lockPath, 'wx', 0o600);
          fs.writeSync(fallbackFd, payload);
          fs.fsyncSync(fallbackFd);
          const fst = fs.fstatSync(fallbackFd);
          fs.closeSync(fallbackFd);
          fallbackFd = null;
          return { lockPath, dev: fst.dev, ino: fst.ino };
        } catch (ferr: unknown) {
          if (fallbackFd !== null) {
            try {
              fs.closeSync(fallbackFd);
            } catch {
              // ignore
            }
          }
          const fcode = ferr && typeof ferr === 'object' ? (ferr as { code?: string }).code : undefined;
          if (fcode === 'EEXIST') return null;
          throw ferr;
        }
      }
      throw err;
    }
    return { lockPath, dev: st.dev, ino: st.ino };
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
  }
}

function releaseLock(lock: AcquiredLock): void {
  try {
    const cur = fs.lstatSync(lock.lockPath);
    if (cur.dev === lock.dev && cur.ino === lock.ino) {
      fs.unlinkSync(lock.lockPath);
    }
  } catch {
    // Already removed or vanished
  }
}

/**
 * Synchronous cross-process exclusive lock with TOCTOU-free reclaim & inode-verified release.
 */
export function withFileLockSync<T>(
  lockPath: string,
  fn: () => T,
  timeoutMs = 10_000,
  staleAfterMs = 30_000
): T {
  ensureDir(path.dirname(lockPath), 0o700);
  const deadline = Date.now() + timeoutMs;
  let acquired: AcquiredLock | null = null;

  while (acquired === null) {
    acquired = tryAcquireLockOnce(lockPath);
    if (acquired !== null) break;
    if (tryReclaimStaleLock(lockPath, staleAfterMs)) continue;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting ${timeoutMs}ms for lock at ${lockPath}`);
    }
    sleepSyncMs(5 + Math.floor(Math.random() * 10));
  }

  try {
    return fn();
  } finally {
    releaseLock(acquired);
  }
}

/**
 * Async cross-process exclusive lock for distributed sync and daemon coordination.
 */
export async function withFileLockAsync<T>(
  lockPath: string,
  fn: () => Promise<T>,
  timeoutMs = 15_000,
  staleAfterMs = 120_000
): Promise<T> {
  ensureDir(path.dirname(lockPath), 0o700);
  const deadline = Date.now() + timeoutMs;
  let acquired: AcquiredLock | null = null;

  while (acquired === null) {
    acquired = tryAcquireLockOnce(lockPath);
    if (acquired !== null) break;
    if (tryReclaimStaleLock(lockPath, staleAfterMs)) continue;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting ${timeoutMs}ms for async lock at ${lockPath}`);
    }
    await sleepAsyncMs(15 + Math.floor(Math.random() * 25));
  }

  try {
    return await fn();
  } finally {
    releaseLock(acquired);
  }
}
