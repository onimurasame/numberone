import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamStore } from '../core/stream-store.js';
import { StreamEvent } from '../core/types.js';
import { atomicWriteFileSync, isWritablePathConfinedToRoot } from '../utils/fs-helpers.js';

const HOOK_MARKER = '# NUMBERONE-MANAGED-HOOK';
const SUPPORTED_HOOKS = ['post-commit', 'post-checkout', 'post-merge', 'pre-push'] as const;
export type SupportedGitHook = (typeof SUPPORTED_HOOKS)[number];

/**
 * Strict POSIX single-quote escaping: neutralizes $, backticks, quotes, newlines, and globs.
 */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function assertSafeCliCommand(cliCommand: string): string {
  if (!/^[A-Za-z0-9._/-]+$/.test(cliCommand)) {
    throw new Error(`Unsafe CLI command name for hook generation: ${cliCommand}`);
  }
  return cliCommand;
}

function runGit(workspaceRoot: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

export function isGitRepository(workspaceRoot: string): boolean {
  return runGit(workspaceRoot, ['rev-parse', '--is-inside-work-tree']) === 'true';
}

function resolveLocalCliInvocation(): string | null {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  // Check compiled dist/cli.js relative to dist/watchers/git-hooks.js or package root
  const candidates = [
    path.resolve(thisDir, '../cli.js'),
    path.resolve(thisDir, '../../dist/cli.js')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return `${shellSingleQuote(process.execPath)} ${shellSingleQuote(candidate)}`;
    }
  }
  return null;
}

/**
 * Installs non-destructive Git hooks that forward commit, checkout, merge, and push
 * events to Number One while preserving any pre-existing user hooks.
 * Uses `git rev-parse --git-path hooks` (worktree & core.hooksPath safe),
 * refuses symlink hook targets, and uses strict POSIX single-quoting with `--workspace` before `-- "$@"`.
 */
export function installGitHooks(workspaceRoot: string, cliCommand = 'numberone'): {
  installed: string[];
  skippedReason?: string;
} {
  const safeCli = assertSafeCliCommand(cliCommand);
  const hooksPathRel =
    runGit(workspaceRoot, ['rev-parse', '--git-path', 'hooks']) ??
    (() => {
      const gitDirRel = runGit(workspaceRoot, ['rev-parse', '--git-dir']);
      return gitDirRel ? path.join(gitDirRel, 'hooks') : null;
    })();
  if (!hooksPathRel) {
    return { installed: [], skippedReason: 'Workspace is not a git repository' };
  }
  const hooksDir = path.resolve(workspaceRoot, hooksPathRel);
  const resolvedRoot = path.resolve(workspaceRoot);
  const hooksInsideWorkspace =
    hooksDir === resolvedRoot || hooksDir.startsWith(`${resolvedRoot}${path.sep}`);

  if (hooksInsideWorkspace && !isWritablePathConfinedToRoot(resolvedRoot, hooksDir)) {
    throw new Error(`Refusing to write git hooks through symlinked path: ${hooksDir}`);
  }
  if (fs.existsSync(hooksDir) && fs.lstatSync(hooksDir).isSymbolicLink()) {
    throw new Error(`Refusing to write into symlinked hooks directory: ${hooksDir}`);
  }

  fs.mkdirSync(hooksDir, { recursive: true });

  const localFallback = resolveLocalCliInvocation();
  const quotedWorkspace = shellSingleQuote(workspaceRoot);
  const quotedCli = shellSingleQuote(safeCli);

  const installed: string[] = [];
  for (const hook of SUPPORTED_HOOKS) {
    const hookPath = path.join(hooksDir, hook);
    if (hooksInsideWorkspace && !isWritablePathConfinedToRoot(resolvedRoot, hookPath)) {
      throw new Error(`Refusing to write git hook outside workspace confinement: ${hookPath}`);
    }
    try {
      if (fs.lstatSync(hookPath).isSymbolicLink()) {
        throw new Error(`Refusing to overwrite symlinked git hook: ${hookPath}`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
    }

    const runnerLines = localFallback
      ? [
          `if command -v ${quotedCli} >/dev/null 2>&1; then`,
          `  ${quotedCli} git-hook ${hook} --workspace ${quotedWorkspace} -- "$@" >/dev/null 2>&1 || true`,
          `else`,
          `  ${localFallback} git-hook ${hook} --workspace ${quotedWorkspace} -- "$@" >/dev/null 2>&1 || true`,
          `fi`
        ]
      : [
          `if command -v ${quotedCli} >/dev/null 2>&1; then`,
          `  ${quotedCli} git-hook ${hook} --workspace ${quotedWorkspace} -- "$@" >/dev/null 2>&1 || true`,
          `fi`
        ];

    const snippet = ['', HOOK_MARKER, ...runnerLines, ''].join('\n');

    if (fs.existsSync(hookPath)) {
      const existing = fs.readFileSync(hookPath, 'utf8');
      if (!existing.includes(HOOK_MARKER)) {
        atomicWriteFileSync(hookPath, existing.trimEnd() + '\n' + snippet, 0o755);
      }
    } else {
      atomicWriteFileSync(hookPath, `#!/usr/bin/env sh\n${snippet}`, 0o755);
    }
    fs.chmodSync(hookPath, 0o755);
    installed.push(hook);
  }

  return { installed };
}

/**
 * Records a live Git hook invocation as an atomic Number One stream event.
 */
export function recordGitHookEvent(
  store: StreamStore,
  hook: SupportedGitHook,
  hookArgs: string[] = []
): StreamEvent | null {
  const root = store.workspaceRoot;
  if (!isGitRepository(root)) return null;

  const branch = runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'detached';
  const sha = runGit(root, ['rev-parse', 'HEAD']) ?? '';
  const authorName = runGit(root, ['log', '-1', '--format=%an']) ?? 'git-user';
  const authorEmail = runGit(root, ['log', '-1', '--format=%ae']) ?? '';

  if (hook === 'post-commit') {
    const subject = runGit(root, ['log', '-1', '--format=%s']) ?? 'Commit';
    const body = runGit(root, ['log', '-1', '--format=%b']) ?? '';
    // `--root` handles initial commit in a brand-new repository as well as subsequent commits
    const filesRaw = runGit(root, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', sha]) ?? '';
    const changedFiles = filesRaw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const diffStat = runGit(root, ['show', '--stat', '--format=', sha]) ?? '';

    return store.append({
      type: 'git.commit',
      actor: { kind: 'git-hook', id: authorEmail || authorName, name: authorName },
      harness: 'git',
      summary: `Commit ${sha.slice(0, 8)} on ${branch}: ${subject}`,
      affectedPaths: changedFiles,
      tags: ['git', 'commit', branch],
      payload: {
        sha,
        branch,
        subject,
        body,
        authorName,
        authorEmail,
        changedFiles,
        diffStat
      }
    });
  }

  if (hook === 'post-checkout') {
    const [prevHead, newHead, branchFlag] = hookArgs;
    if (branchFlag === '0') return null;
    return store.append({
      type: 'git.checkout',
      actor: { kind: 'git-hook', id: authorEmail || authorName, name: authorName },
      harness: 'git',
      summary: `Checked out branch ${branch} (${(newHead ?? sha).slice(0, 8)})`,
      tags: ['git', 'checkout', branch],
      payload: {
        branch,
        fromSha: prevHead ?? null,
        toSha: newHead ?? sha
      }
    });
  }

  if (hook === 'post-merge') {
    const subject = runGit(root, ['log', '-1', '--format=%s']) ?? 'Merge';
    return store.append({
      type: 'git.merge',
      actor: { kind: 'git-hook', id: authorEmail || authorName, name: authorName },
      harness: 'git',
      summary: `Merged into ${branch}: ${subject}`,
      tags: ['git', 'merge', branch],
      payload: {
        branch,
        sha,
        subject,
        isSquash: hookArgs[0] === '1'
      }
    });
  }

  if (hook === 'pre-push') {
    const [remoteName, remoteUrl] = hookArgs;
    return store.append({
      type: 'git.push',
      actor: { kind: 'git-hook', id: authorEmail || authorName, name: authorName },
      harness: 'git',
      summary: `Pushing ${branch} (${sha.slice(0, 8)}) to ${remoteName ?? 'origin'}`,
      tags: ['git', 'push', branch],
      payload: {
        branch,
        sha,
        remoteName: remoteName ?? 'origin',
        remoteUrl: remoteUrl ?? ''
      }
    });
  }

  return null;
}

/**
 * Backfills existing Git commit history into the Number One stream on initial attachment.
 */
export function importGitHistory(store: StreamStore, limit = 50): StreamEvent[] {
  const root = store.workspaceRoot;
  if (!isGitRepository(root)) return [];

  const existingShas = new Set(
    store
      .query({ types: ['git.commit'] })
      .map((e) => String(e.payload.sha ?? ''))
      .filter(Boolean)
  );

  const raw = runGit(root, [
    'log',
    '-n',
    String(limit),
    '--reverse',
    '--format=%H%x1f%aI%x1f%an%x1f%ae%x1f%s'
  ]);
  if (!raw) return [];

  const branch = runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'main';
  const imported: StreamEvent[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [sha, isoDate, authorName, authorEmail, subject] = line.split('\x1f');
    if (!sha || existingShas.has(sha)) continue;

    const filesRaw = runGit(root, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', sha]) ?? '';
    const changedFiles = filesRaw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const ev = store.append({
      type: 'git.commit',
      actor: { kind: 'git-hook', id: authorEmail || authorName || 'git', name: authorName },
      harness: 'git-backfill',
      summary: `Historical commit ${sha.slice(0, 8)}: ${subject ?? ''}`,
      affectedPaths: changedFiles,
      tags: ['git', 'commit', 'backfill'],
      timestamp: isoDate || undefined,
      payload: {
        sha,
        branch,
        subject: subject ?? '',
        authorName,
        authorEmail,
        changedFiles
      }
    });
    imported.push(ev);
  }

  return imported;
}
