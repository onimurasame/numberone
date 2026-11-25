import fs, { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export function ensureDir(dirPath: string, mode = 0o755): void {
  fs.mkdirSync(dirPath, { recursive: true, mode });
}

function fsyncDirBestEffort(dirPath: string): void {
  let fd: number | null = null;
  try {
    fd = fs.openSync(dirPath, 'r');
    fs.fsyncSync(fd);
  } catch {
    // Some virtual/network filesystems return EINVAL/EBADF on directory fsync
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Crash-consistent atomic file write (POSIX durability pattern):
 *   1. Ensure parent dir (0o700 when mode is owner-only 0o600)
 *   2. Open unique temp file in same directory with `wx`
 *   3. Write all bytes + `fsyncSync(fd)` to flush data to disk
 *   4. `closeSync(fd)`
 *   5. `renameSync(tmpPath, targetPath)` atomically replaces target
 *   6. `fsyncSync` parent directory to persist rename metadata
 *   7. Unlink temp file on any error so partial files never remain
 */
export function atomicWriteFileSync(
  targetPath: string,
  data: string | Buffer,
  mode = 0o644
): void {
  const dir = path.dirname(targetPath);
  ensureDir(dir, (mode & 0o077) === 0 ? 0o700 : 0o755);
  const tmpName = `.${path.basename(targetPath)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  const tmpPath = path.join(dir, tmpName);
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

  let fd: number | null = null;
  try {
    fd = fs.openSync(tmpPath, 'wx', mode);
    let offset = 0;
    while (offset < buf.length) {
      const written = fs.writeSync(fd, buf, offset, buf.length - offset);
      if (written <= 0) {
        throw new Error(`Short write to ${tmpPath}`);
      }
      offset += written;
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, targetPath);
    fsyncDirBestEffort(dir);
  } catch (err) {
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
    throw err;
  }
}

export function atomicWriteJsonSync(targetPath: string, value: unknown, mode = 0o644): void {
  atomicWriteFileSync(targetPath, JSON.stringify(value, null, 2) + '\n', mode);
}

/**
 * Verifies that `targetPath` (resolving symlinks if present) stays strictly inside `rootDir`.
 * Defends against symlink escape (CWE-59) and path traversal (CWE-22).
 */
export function isPathConfinedToRoot(rootDir: string, targetPath: string): boolean {
  try {
    const realRoot = fs.realpathSync(rootDir);
    const realTarget = fs.realpathSync(targetPath);
    const rel = path.relative(realRoot, realTarget);
    return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
  } catch {
    return false;
  }
}

/**
 * Verifies that a target path (which may not exist yet) has its deepest existing ancestor
 * strictly confined inside `rootDir`, with no symlink components along the path.
 */
export function isWritablePathConfinedToRoot(rootDir: string, targetPath: string): boolean {
  try {
    const realRoot = fs.realpathSync(rootDir);
    const resolved = path.resolve(targetPath);
    const rel = path.relative(realRoot, resolved);
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      // Also check relative to non-realpath rootDir in case rootDir contains symlink prefix (e.g. /tmp -> /private/tmp)
      const relRaw = path.relative(path.resolve(rootDir), resolved);
      if (relRaw === '..' || relRaw.startsWith(`..${path.sep}`) || path.isAbsolute(relRaw)) {
        return false;
      }
    }

    // Walk every existing segment from rootDir down to targetPath and reject symlinks
    let current = path.resolve(rootDir);
    const relParts = path.relative(current, resolved).split(path.sep).filter(Boolean);
    for (const part of relParts) {
      if (part === '..') return false;
      current = path.join(current, part);
      if (fs.existsSync(current)) {
        const st = fs.lstatSync(current);
        if (st.isSymbolicLink()) return false;
      } else {
        break;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * FD-based TOCTOU-safe regular file reader:
 *  - Opens with `O_RDONLY | O_NONBLOCK | O_NOFOLLOW` (prevents FIFO blocking & symlink swap)
 *  - Validates `fstatSync(fd).isFile()` and `size <= maxBytes` on the open descriptor
 *  - Reads at most `maxBytes + 1` bytes in a bounded loop (guards growing files)
 */
export function readFileBufferSafe(
  filePath: string,
  maxBytes = 512_000,
  confineToRoot?: string
): Buffer | null {
  if (confineToRoot && !isPathConfinedToRoot(confineToRoot, filePath)) {
    return null;
  }
  const openFlags =
    fsConstants.O_RDONLY |
    (fsConstants.O_NONBLOCK ?? 0) |
    (fsConstants.O_NOFOLLOW ?? 0);

  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, openFlags);
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.size > maxBytes) {
      return null;
    }

    const chunks: Buffer[] = [];
    let total = 0;
    const chunkSize = Math.min(65_536, Math.max(1024, maxBytes));
    const scratch = Buffer.allocUnsafe(chunkSize);

    while (true) {
      const remainingAllowance = maxBytes - total + 1;
      const toRead = Math.min(scratch.length, remainingAllowance);
      const bytesRead = fs.readSync(fd, scratch, 0, toRead, null);
      if (bytesRead <= 0) break;
      total += bytesRead;
      if (total > maxBytes) {
        return null;
      }
      chunks.push(Buffer.from(scratch.subarray(0, bytesRead)));
    }

    return chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks, total);
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

export function readJsonSafe<T>(filePath: string, maxBytes = 10_000_000): T | null {
  const buf = readFileBufferSafe(filePath, maxBytes);
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function isBinaryBuffer(buf: Buffer): boolean {
  const len = Math.min(buf.length, 4096);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export function readTextFileSafe(
  filePath: string,
  maxBytes = 512_000,
  confineToRoot?: string
): string | null {
  const buf = readFileBufferSafe(filePath, maxBytes, confineToRoot);
  if (!buf || isBinaryBuffer(buf)) return null;
  return buf.toString('utf8');
}

/**
 * Deterministic A->Z workspace file walk (never traverses symlinks).
 * Pushes subdirectories in reverse sorted order onto LIFO stack so traversal proceeds A->Z
 * (ensuring `.github/`, `app/`, `src/` are always visited first even in large repos).
 */
export function walkWorkspaceFiles(
  rootDir: string,
  shouldIgnore: (relPath: string, isDir: boolean) => boolean,
  maxFiles = 5000
): string[] {
  const results: string[] = [];
  const stack: string[] = [''];

  while (stack.length > 0 && results.length < maxFiles) {
    const rel = stack.pop()!;
    const abs = rel ? path.join(rootDir, rel) : rootDir;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    const subdirs: string[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const isDir = entry.isDirectory();
      if (shouldIgnore(childRel, isDir)) continue;
      if (isDir) {
        subdirs.push(childRel);
      } else if (entry.isFile()) {
        results.push(childRel);
        if (results.length >= maxFiles) break;
      }
    }
    // Reverse push so LIFO pop visits subdirs in deterministic A->Z order
    for (let i = subdirs.length - 1; i >= 0; i--) {
      stack.push(subdirs[i]!);
    }
  }
  return results.sort();
}
