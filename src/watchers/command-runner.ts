import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { LessonEngine } from '../core/lesson-engine.js';
import { StreamStore } from '../core/stream-store.js';
import { StreamEvent } from '../core/types.js';
import { redactSecrets } from '../utils/redactor.js';
import { shellSingleQuote } from './git-hooks.js';

export interface CommandRunOptions {
  /** Human-readable command string (and shell command when `argv` is not provided). */
  command: string;
  /**
   * Optional direct executable + argument vector (spawns with `shell: false`,
   * avoiding double-shell quoting bugs and shell metacharacter injection).
   */
  argv?: string[];
  cwd?: string;
  harness?: string;
  sessionId?: string;
  actorId?: string;
  tags?: string[];
  silent?: boolean;
  env?: NodeJS.ProcessEnv;
  /** Maximum bytes buffered in memory per stream (stdout/stderr). Default 2 MB. */
  maxCaptureBytes?: number;
  /** Optional command timeout in milliseconds (sends SIGTERM then SIGKILL). */
  timeoutMs?: number;
}

export interface CommandRunResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  stdoutTruncatedBytes: number;
  stderrTruncatedBytes: number;
  startEvent: StreamEvent;
  endEvent: StreamEvent;
  autoCapturedLesson?: StreamEvent;
}

/**
 * O(1)-amortized byte-bounded head+tail accumulator using Buffers + UTF-8 StringDecoder
 * so noisy commands emitting hundreds of megabytes never trigger OOM or O(N^2) byte counts.
 */
class BoundedOutputBuffer {
  private readonly maxBytes: number;
  private readonly headLimit: number;
  private readonly tailLimit: number;
  private headChunks: Buffer[] = [];
  private headBytes = 0;
  private tailChunks: Buffer[] = [];
  private tailBytes = 0;
  private totalBytes = 0;
  private overflowed = false;

  constructor(maxBytes: number) {
    this.maxBytes = Math.max(4096, maxBytes);
    this.headLimit = Math.floor(this.maxBytes * 0.4);
    this.tailLimit = this.maxBytes - this.headLimit;
  }

  public appendBuffer(buf: Buffer): void {
    if (buf.length === 0) return;
    this.totalBytes += buf.length;

    if (!this.overflowed) {
      if (this.headBytes + buf.length <= this.maxBytes) {
        this.headChunks.push(buf);
        this.headBytes += buf.length;
        return;
      }
      // Transition cleanly into head + rolling tail mode
      this.overflowed = true;
      const combined = Buffer.concat([...this.headChunks, buf], this.headBytes + buf.length);
      const headSlice = combined.subarray(0, this.headLimit);
      const tailSlice = combined.subarray(Math.max(this.headLimit, combined.length - this.tailLimit));
      this.headChunks = [Buffer.from(headSlice)];
      this.headBytes = headSlice.length;
      this.tailChunks = [Buffer.from(tailSlice)];
      this.tailBytes = tailSlice.length;
      return;
    }

    this.tailChunks.push(buf);
    this.tailBytes += buf.length;
    if (this.tailBytes > this.tailLimit * 2) {
      const merged = Buffer.concat(this.tailChunks, this.tailBytes);
      const trimmed = Buffer.from(merged.subarray(merged.length - this.tailLimit));
      this.tailChunks = [trimmed];
      this.tailBytes = trimmed.length;
    }
  }

  public appendText(text: string): void {
    if (!text) return;
    this.appendBuffer(Buffer.from(text, 'utf8'));
  }

  public get omittedBytes(): number {
    if (!this.overflowed) return 0;
    const keptTail = Math.min(this.tailBytes, this.tailLimit);
    return Math.max(0, this.totalBytes - (this.headBytes + keptTail));
  }

  public toString(): string {
    const decoder = new StringDecoder('utf8');
    if (!this.overflowed) {
      const buf = Buffer.concat(this.headChunks, this.headBytes);
      return decoder.write(buf) + decoder.end();
    }
    const headBuf = Buffer.concat(this.headChunks, this.headBytes);
    const tailFull = Buffer.concat(this.tailChunks, this.tailBytes);
    const tailBuf =
      tailFull.length > this.tailLimit
        ? tailFull.subarray(tailFull.length - this.tailLimit)
        : tailFull;
    const headText = new StringDecoder('utf8').end(headBuf);
    const tailText = new StringDecoder('utf8').end(tailBuf);
    return `${headText}\n... [${this.omittedBytes} bytes omitted due to capture limit] ...\n${tailText}`;
  }
}

function extractErrorSignature(stderr: string, stdout: string, command: string): string {
  const combined = `${stderr}\n${stdout}`;
  const lines = combined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const errorLine = lines.find((l) =>
    /(error|exception|failed|fatal|panic|syntaxerror|typeerror|referenceerror|enoent|eaddrinuse|assertion)/i.test(
      l
    )
  );
  return (errorLine ?? lines[lines.length - 1] ?? `Command failed: ${command}`).slice(0, 200);
}

function extractReferencedPaths(output: string): string[] {
  const matches =
    output.match(
      /(?:^|[\s("'])([a-zA-Z0-9_./-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|yml|yaml|json|sh|dockerfile))/gi
    ) ?? [];
  const cleaned = matches
    .map((m) => m.replace(/^[\s("']+/, '').replace(/^\.\//, ''))
    .filter((p) => !p.startsWith('node_modules/') && !p.startsWith('/usr/') && !p.startsWith('/opt/'));
  return Array.from(new Set(cleaned)).slice(0, 15);
}

/**
 * Executes a workspace command with bounded stdout/stderr memory capture, optional timeout,
 * parent signal forwarding, shell-free `argv` support, automatic secret redaction,
 * and crash -> fix lesson correlation.
 */
export async function runWatchedCommand(
  store: StreamStore,
  options: CommandRunOptions
): Promise<CommandRunResult> {
  const cwd = options.cwd ?? store.workspaceRoot;
  const harness = options.harness ?? 'cli';
  const sessionId = options.sessionId ?? `exec-${Date.now()}`;
  const actor = { kind: 'human' as const, id: options.actorId ?? process.env.USER ?? 'operator' };
  const safeCommand = redactSecrets(options.command);
  const maxCaptureBytes = options.maxCaptureBytes ?? 2_000_000;

  const startEvent = store.append({
    type: 'exec.started',
    actor,
    harness,
    sessionId,
    summary: `Running command: ${safeCommand}`,
    tags: ['exec', ...(options.tags ?? [])],
    payload: { command: safeCommand, cwd }
  });

  const startedAt = Date.now();
  const stdoutBuf = new BoundedOutputBuffer(maxCaptureBytes);
  const stderrBuf = new BoundedOutputBuffer(maxCaptureBytes);
  let timedOut = false;

  const useProcessGroup = Boolean(options.timeoutMs && options.timeoutMs > 0 && process.platform !== 'win32');
  const useDirectArgv = Boolean(options.argv && options.argv.length > 0);

  const { exitCode, signal } = await new Promise<{ exitCode: number | null; signal: string | null }>(
    (resolve) => {
      const spawnOpts = {
        cwd,
        detached: useProcessGroup,
        env: options.env ?? process.env,
        stdio: [useProcessGroup ? 'ignore' : 'inherit', 'pipe', 'pipe'] as ['ignore' | 'inherit', 'pipe', 'pipe']
      };
      const child = useDirectArgv
        ? spawn(options.argv![0]!, options.argv!.slice(1), { ...spawnOpts, shell: false })
        : spawn(options.command, { ...spawnOpts, shell: true });

      const killTree = (sig: NodeJS.Signals) => {
        if (useProcessGroup && child.pid) {
          try {
            process.kill(-child.pid, sig);
            return;
          } catch {
            // fall through to direct kill
          }
        }
        try {
          child.kill(sig);
        } catch {
          // ignore
        }
      };

      const onParentSigInt = () => killTree('SIGINT');
      const onParentSigTerm = () => killTree('SIGTERM');
      process.on('SIGINT', onParentSigInt);
      process.on('SIGTERM', onParentSigTerm);

      let timeoutHandle: NodeJS.Timeout | null = null;
      let killHandle: NodeJS.Timeout | null = null;
      if (options.timeoutMs && options.timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          killTree('SIGTERM');
          killHandle = setTimeout(() => {
            killTree('SIGKILL');
          }, 1500);
        }, options.timeoutMs);
      }

      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (killHandle) clearTimeout(killHandle);
        process.removeListener('SIGINT', onParentSigInt);
        process.removeListener('SIGTERM', onParentSigTerm);
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuf.appendBuffer(chunk);
        if (!options.silent) process.stdout.write(chunk);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf.appendBuffer(chunk);
        if (!options.silent) process.stderr.write(chunk);
      });

      child.on('close', (code, sig) => {
        cleanup();
        resolve({ exitCode: code, signal: sig });
      });

      child.on('error', (err) => {
        cleanup();
        stderrBuf.appendText(`\nSpawn error: ${err.message}`);
        resolve({ exitCode: 127, signal: null });
      });
    }
  );

  const durationMs = Date.now() - startedAt;
  const stdout = redactSecrets(stdoutBuf.toString());
  const stderr = redactSecrets(stderrBuf.toString());

  const succeeded = exitCode === 0 && !signal && !timedOut;
  const crashed = timedOut || Boolean(signal) || (exitCode !== null && exitCode >= 128);
  const type = succeeded ? 'exec.completed' : crashed ? 'exec.crashed' : 'exec.failed';
  const affectedPaths = extractReferencedPaths(`${stderr}\n${stdout}`);
  const errorSignature = succeeded
    ? ''
    : timedOut
      ? `Command timed out after ${options.timeoutMs}ms: ${safeCommand}`
      : extractErrorSignature(stderr, stdout, safeCommand);

  const fallbackBlobs: Array<{ key: string; content: string; contentType: string }> = [];
  if (stdout.length > 2000) {
    fallbackBlobs.push({ key: 'stdout', content: stdout, contentType: 'text/plain; charset=utf-8' });
  }
  if (stderr.length > 1000) {
    fallbackBlobs.push({ key: 'stderr', content: stderr, contentType: 'text/plain; charset=utf-8' });
  }

  const endEvent = store.append({
    type,
    actor,
    harness,
    sessionId,
    causationId: startEvent.id,
    correlationId: startEvent.id,
    summary: succeeded
      ? `Succeeded (${durationMs}ms): ${safeCommand}`
      : `${crashed ? 'Crashed' : 'Failed'} (exit ${exitCode ?? signal ?? 'timeout'}, ${durationMs}ms): ${safeCommand} — ${errorSignature.slice(0, 100)}`,
    affectedPaths,
    tags: [
      'exec',
      succeeded ? 'success' : crashed ? 'crash' : 'failure',
      ...(timedOut ? ['timeout'] : []),
      ...(options.tags ?? [])
    ],
    payload: {
      command: safeCommand,
      exitCode,
      signal,
      timedOut: timedOut || undefined,
      durationMs,
      stdoutTruncatedBytes: stdoutBuf.omittedBytes || undefined,
      stderrTruncatedBytes: stderrBuf.omittedBytes || undefined,
      errorSignature: errorSignature || undefined,
      stdoutExcerpt: stdout.slice(-1500),
      stderrExcerpt: stderr.slice(-1500)
    },
    fallbackBlobs
  });

  let autoCapturedLesson: StreamEvent | undefined;
  if (succeeded) {
    const lessonEngine = new LessonEngine(store);
    const correlation = lessonEngine.detectFailureToFixCorrelation(endEvent);
    if (correlation) {
      autoCapturedLesson = store.append({
        type: 'lesson.captured',
        actor: { kind: 'numberone', id: 'lesson-engine', name: 'Number One Curator' },
        harness,
        sessionId,
        causationId: endEvent.id,
        correlationId: correlation.crashEvent.id,
        summary: correlation.suggestedLesson.title,
        affectedPaths: correlation.suggestedLesson.affectedPaths,
        tags: correlation.suggestedLesson.tags,
        payload: {
          ...correlation.suggestedLesson,
          severity: 'medium',
          verified: true
        }
      });
    }
  }

  return {
    exitCode,
    signal,
    timedOut,
    durationMs,
    stdout,
    stderr,
    stdoutTruncatedBytes: stdoutBuf.omittedBytes,
    stderrTruncatedBytes: stderrBuf.omittedBytes,
    startEvent,
    endEvent,
    autoCapturedLesson
  };
}

function formatSafeShellHookCommand(cliCommand: string | string[]): string {
  if (Array.isArray(cliCommand)) {
    if (cliCommand.length === 0) {
      throw new Error('CLI command array for shell hook cannot be empty.');
    }
    for (const part of cliCommand) {
      if (!part || /[\r\n\0]/.test(part)) {
        throw new Error(`Unsafe CLI command token for shell hook: ${part}`);
      }
    }
    return cliCommand.map((p) => shellSingleQuote(p)).join(' ');
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(cliCommand)) {
    throw new Error(`Unsafe CLI command for shell hook: ${cliCommand}`);
  }
  return shellSingleQuote(cliCommand);
}

/**
 * Generates injection-safe bash/zsh shell hooks using environment variables
 * (`N1_SHELL_CMD` and `N1_SHELL_EXIT`), strict POSIX single-quoting, and command-activity guards.
 */
export function generateShellHook(
  shell: 'bash' | 'zsh' = 'bash',
  cliCommand: string | string[] = 'numberone'
): string {
  const safeInvocation = formatSafeShellHookCommand(cliCommand);
  if (shell === 'zsh') {
    return [
      '# Number One Zsh Integration — add to ~/.zshrc',
      '__N1_CMD_ACTIVE=0',
      '__N1_LAST_CMD=""',
      '__n1_preexec() {',
      '  __N1_LAST_CMD="$1"',
      '  __N1_CMD_ACTIVE=1',
      '}',
      '__n1_precmd() {',
      '  local ec=$?',
      '  if [ "$__N1_CMD_ACTIVE" -eq 1 ] && [ "$ec" -ne 0 ] && [ -n "$__N1_LAST_CMD" ] && [ -d ".numberone" ]; then',
      `    N1_SHELL_CMD="$__N1_LAST_CMD" N1_SHELL_EXIT="$ec" N1_SHELL_NAME="zsh" ${safeInvocation} record-shell-failure >/dev/null 2>&1 || true`,
      '  fi',
      '  __N1_CMD_ACTIVE=0',
      '  __N1_LAST_CMD=""',
      '}',
      'autoload -Uz add-zsh-hook',
      'add-zsh-hook preexec __n1_preexec',
      'add-zsh-hook precmd __n1_precmd'
    ].join('\n');
  }
  return [
    '# Number One Bash Integration — add to ~/.bashrc',
    '__N1_CMD_ACTIVE=0',
    '__N1_LAST_CMD=""',
    '__n1_preexec() {',
    '  case "$1" in',
    '    __n1_prompt_command*|__n1_preexec*) return 0 ;;',
    '  esac',
    '  __N1_LAST_CMD="$1"',
    '  __N1_CMD_ACTIVE=1',
    '}',
    '__n1_prompt_command() {',
    '  local ec=$?',
    '  if [ "$__N1_CMD_ACTIVE" -eq 1 ] && [ "$ec" -ne 0 ] && [ -n "$__N1_LAST_CMD" ] && [ -d ".numberone" ]; then',
    `    N1_SHELL_CMD="$__N1_LAST_CMD" N1_SHELL_EXIT="$ec" N1_SHELL_NAME="bash" ${safeInvocation} record-shell-failure >/dev/null 2>&1 || true`,
    '  fi',
    '  __N1_CMD_ACTIVE=0',
    '  __N1_LAST_CMD=""',
    '}',
    'trap \'__n1_preexec "$BASH_COMMAND"\' DEBUG',
    'PROMPT_COMMAND="__n1_prompt_command${PROMPT_COMMAND:+; $PROMPT_COMMAND}"'
  ].join('\n');
}
