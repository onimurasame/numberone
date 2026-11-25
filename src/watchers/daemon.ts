import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { StreamStore } from '../core/stream-store.js';
import { atomicWriteJsonSync, ensureDir, readJsonSafe } from '../utils/fs-helpers.js';
import { isProcessAlive, readProcStartTicks, withFileLockSync } from '../utils/lock.js';

export interface DaemonPidRecord {
  pid: number;
  startedAt: string;
  workspaceRoot: string;
  cliEntryScript: string;
  procStartTicks?: string | null;
}

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  pidFile: string;
  logFile: string;
}

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const SLEEP_ARR = new Int32Array(new SharedArrayBuffer(4));

function sleepSyncMs(ms: number): void {
  Atomics.wait(SLEEP_ARR, 0, 0, Math.max(1, ms));
}

/**
 * Verifies on Linux (`/proc/<pid>/cmdline` and `/proc/<pid>/stat` start ticks) that a PID
 * still belongs to our Number One watcher process for the EXACT `workspaceRoot`
 * (preventing prefix collisions like `/workspace` matching `/workspace-other` and OS PID reuse).
 */
function verifyPidMatchesWatcher(
  pid: number,
  workspaceRoot: string,
  expectedStartTicks?: string | null
): boolean {
  if (!isProcessAlive(pid)) return false;

  if (expectedStartTicks) {
    const liveTicks = readProcStartTicks(pid);
    if (liveTicks !== null && liveTicks !== expectedStartTicks) {
      return false;
    }
  }

  const cmdlinePath = `/proc/${pid}/cmdline`;
  if (fs.existsSync(cmdlinePath)) {
    try {
      const raw = fs.readFileSync(cmdlinePath, 'utf8');
      const args = raw.split('\0').filter((s) => s.length > 0);
      const hasWatch = args.includes('watch');
      const wsIdx = args.indexOf('--workspace');
      const exactWsMatch =
        (wsIdx !== -1 && args[wsIdx + 1] === workspaceRoot) ||
        args.includes(`--workspace=${workspaceRoot}`);
      return hasWatch && exactWsMatch;
    } catch {
      return false;
    }
  }
  // On non-Linux platforms without /proc, fall back to process existence check
  return true;
}

export class WatcherDaemonManager {
  private readonly pidFile: string;
  private readonly logFile: string;
  private readonly lockFile: string;
  private readonly workspaceRoot: string;

  constructor(store: StreamStore) {
    this.workspaceRoot = store.workspaceRoot;
    this.pidFile = path.join(store.rootDir, 'daemon.pid');
    this.logFile = path.join(store.rootDir, 'daemon.log');
    this.lockFile = path.join(store.rootDir, '.daemon.lock');
  }

  private readPidRecord(): DaemonPidRecord | null {
    const json = readJsonSafe<DaemonPidRecord>(this.pidFile);
    if (json && typeof json.pid === 'number' && Number.isFinite(json.pid)) {
      return json;
    }
    // Backward compatibility with legacy bare-integer pidfile
    try {
      if (!fs.existsSync(this.pidFile)) return null;
      const raw = fs.readFileSync(this.pidFile, 'utf8').trim();
      const pid = Number.parseInt(raw, 10);
      if (Number.isFinite(pid)) {
        return {
          pid,
          startedAt: '',
          workspaceRoot: this.workspaceRoot,
          cliEntryScript: ''
        };
      }
    } catch {
      // ignore
    }
    return null;
  }

  private rotateLogIfOversized(): void {
    try {
      const stat = fs.lstatSync(this.logFile);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing to write daemon log to symlink: ${this.logFile}`);
      }
      if (stat.isFile() && stat.size > MAX_LOG_BYTES) {
        fs.renameSync(this.logFile, `${this.logFile}.1`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return;
      throw err;
    }
  }

  public getStatus(): DaemonStatus {
    const record = this.readPidRecord();
    if (!record) {
      return {
        running: false,
        pid: null,
        startedAt: null,
        pidFile: this.pidFile,
        logFile: this.logFile
      };
    }

    if (verifyPidMatchesWatcher(record.pid, this.workspaceRoot, record.procStartTicks)) {
      return {
        running: true,
        pid: record.pid,
        startedAt: record.startedAt || null,
        pidFile: this.pidFile,
        logFile: this.logFile
      };
    }

    return {
      running: false,
      pid: null,
      startedAt: null,
      pidFile: this.pidFile,
      logFile: this.logFile
    };
  }

  public startDetached(cliEntryScript: string): DaemonStatus {
    ensureDir(path.dirname(this.logFile), 0o700);
    return withFileLockSync(this.lockFile, () => {
      const existing = this.getStatus();
      if (existing.running) return existing;

      this.rotateLogIfOversized();

      const openFlags =
        fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_APPEND |
        (fs.constants.O_NOFOLLOW ?? 0);
      const outFd = fs.openSync(this.logFile, openFlags, 0o600);
      let childPid: number | undefined;
      try {
        const child = spawn(
          process.execPath,
          [cliEntryScript, 'watch', '--foreground', '--workspace', this.workspaceRoot],
          {
            cwd: this.workspaceRoot,
            detached: true,
            stdio: ['ignore', outFd, outFd]
          }
        );
        child.unref();
        childPid = child.pid;
      } finally {
        // Always close inherited FD in parent process to prevent FD leak
        try {
          fs.closeSync(outFd);
        } catch {
          // ignore
        }
      }

      const startedAt = new Date().toISOString();
      if (childPid) {
        const record: DaemonPidRecord = {
          pid: childPid,
          startedAt,
          workspaceRoot: this.workspaceRoot,
          cliEntryScript,
          procStartTicks: readProcStartTicks(childPid)
        };
        atomicWriteJsonSync(this.pidFile, record, 0o600);
      }

      return {
        running: Boolean(childPid && isProcessAlive(childPid)),
        pid: childPid ?? null,
        startedAt: childPid ? startedAt : null,
        pidFile: this.pidFile,
        logFile: this.logFile
      };
    });
  }

  public stop(): { stopped: boolean; pid: number | null; reason?: string } {
    ensureDir(path.dirname(this.lockFile), 0o700);
    return withFileLockSync(this.lockFile, () => {
      const record = this.readPidRecord();
      if (!record) {
        return { stopped: false, pid: null, reason: 'No daemon PID file found.' };
      }
      if (!verifyPidMatchesWatcher(record.pid, this.workspaceRoot, record.procStartTicks)) {
        if (fs.existsSync(this.pidFile)) {
          try {
            fs.unlinkSync(this.pidFile);
          } catch {
            // ignore
          }
        }
        const alive = isProcessAlive(record.pid);
        return {
          stopped: false,
          pid: null,
          reason: alive
            ? `PID ${record.pid} is alive but is not a Number One watcher for ${this.workspaceRoot}; refused to kill (PID reuse guard).`
            : `Stale PID ${record.pid} is no longer running; cleaned up daemon.pid.`
        };
      }

      try {
        process.kill(record.pid, 'SIGTERM');
      } catch {
        // already stopped
      }

      // Wait briefly (up to 3s) for graceful flush & exit before removing daemon.pid
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && verifyPidMatchesWatcher(record.pid, this.workspaceRoot, record.procStartTicks)) {
        sleepSyncMs(50);
      }

      const stillRunning = verifyPidMatchesWatcher(
        record.pid,
        this.workspaceRoot,
        record.procStartTicks
      );
      if (!stillRunning) {
        try {
          if (fs.existsSync(this.pidFile)) fs.unlinkSync(this.pidFile);
        } catch {
          // ignore
        }
      }
      return {
        stopped: !stillRunning,
        pid: record.pid,
        reason: stillRunning ? `Sent SIGTERM to PID ${record.pid}, still flushing.` : undefined
      };
    });
  }
}
