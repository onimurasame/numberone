#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_TYPES, EventType, OfficerRole } from './core/types.js';
import { KnowledgeUpdateProposal } from './crew/types.js';
import { NumberOneMcpServer } from './harness/mcp-server.js';
import { NumberOneAgent } from './harness/number-one.js';
import { installHarnessShims } from './harness/shims.js';
import { atomicWriteFileSync, readTextFileSafe } from './utils/fs-helpers.js';
import { redactObjectDeep, redactSecrets } from './utils/redactor.js';
import { generateShellHook } from './watchers/command-runner.js';
import { isGitRepository, recordGitHookEvent, SupportedGitHook } from './watchers/git-hooks.js';

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean | string[]>;
  passthrough: string[];
}

const FORBIDDEN_FLAG_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'toString',
  'valueOf',
  'hasOwnProperty'
]);

const BOOLEAN_FLAGS = new Set([
  'json',
  'foreground',
  'no-hooks',
  'no-shims',
  'local-only',
  'dry-run',
  'allow-exec',
  'help',
  'version',
  'force'
]);

const VALID_EVENT_TYPE_SET = new Set<string>(EVENT_TYPES);
const VALID_GIT_HOOKS = new Set<string>(['post-commit', 'post-checkout', 'post-merge', 'pre-push']);
const VALID_SEVERITIES = new Set<string>(['low', 'medium', 'high', 'critical']);
const VALID_DIRECTIVE_SEVERITIES = new Set<string>(['advisory', 'mandatory', 'blocking']);
const VALID_ISSUE_KINDS = new Set<string>([
  'bug',
  'crash',
  'story',
  'epic',
  'task',
  'debt',
  'security',
  'infra',
  'release'
]);
const VALID_PARTY_MODES = new Set<string>(['roundtable', 'specialist', 'auto-triage']);
const VALID_OFFICERS = new Set<string>(['engineering', 'security', 'bridge']);

class CliInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliInputError';
  }
}

function getPackageVersion(): string {
  try {
    const raw = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.trim()) {
      return parsed.version.trim();
    }
  } catch {
    // ignore
  }
  return '1.0.0';
}

function assertSafeFlagKey(key: string): void {
  if (!key || FORBIDDEN_FLAG_KEYS.has(key) || key.length > 64) {
    throw new CliInputError(`Rejected invalid or unsafe CLI flag name: "--${key}"`);
  }
}

function assertEnumFlag<T extends string>(
  raw: string | undefined,
  allowed: Set<string>,
  flagName: string,
  fallback: T
): T {
  if (raw === undefined) return fallback;
  if (!allowed.has(raw)) {
    throw new CliInputError(
      `Invalid value "${raw}" for --${flagName}. Allowed: ${Array.from(allowed).join(', ')}`
    );
  }
  return raw as T;
}

export function parseCliArgs(argv: string[]): ParsedArgs {
  const dashDashIdx = argv.indexOf('--');
  const mainArgs = dashDashIdx === -1 ? argv : argv.slice(0, dashDashIdx);
  const passthrough = dashDashIdx === -1 ? [] : argv.slice(dashDashIdx + 1);

  let command = '';
  const positionals: string[] = [];
  const flags = Object.create(null) as Record<string, string | boolean | string[]>;

  for (let i = 0; i < mainArgs.length; i++) {
    const tok = mainArgs[i]!;
    if (tok === '-h') {
      flags.help = true;
      continue;
    }
    if (tok === '-v' || tok === '-V') {
      flags.version = true;
      continue;
    }
    if (tok.startsWith('--')) {
      const eqIdx = tok.indexOf('=');
      if (eqIdx !== -1) {
        const k = tok.slice(2, eqIdx);
        assertSafeFlagKey(k);
        const v = tok.slice(eqIdx + 1);
        if (BOOLEAN_FLAGS.has(k)) {
          flags[k] = v !== 'false' && v !== '0';
        } else {
          pushFlag(flags, k, v);
        }
      } else {
        const k = tok.slice(2);
        assertSafeFlagKey(k);
        if (BOOLEAN_FLAGS.has(k)) {
          flags[k] = true;
        } else {
          const next = mainArgs[i + 1];
          if (next !== undefined && !next.startsWith('--')) {
            pushFlag(flags, k, next);
            i++;
          } else {
            flags[k] = true;
          }
        }
      }
    } else if (!command) {
      command = tok;
    } else {
      positionals.push(tok);
    }
  }

  if (!command) {
    command = flags.version ? 'version' : 'help';
  }

  return { command, positionals, flags, passthrough };
}

function pushFlag(
  flags: Record<string, string | boolean | string[]>,
  key: string,
  val: string
): void {
  const existing = flags[key];
  if (existing === undefined) {
    flags[key] = val;
  } else if (Array.isArray(existing)) {
    existing.push(val);
  } else if (typeof existing === 'string') {
    flags[key] = [existing, val];
  } else {
    flags[key] = val;
  }
}

function flagStr(flags: ParsedArgs['flags'], key: string): string | undefined {
  const v = flags[key];
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[v.length - 1];
  return undefined;
}

function flagList(flags: ParsedArgs['flags'], key: string): string[] {
  const v = flags[key];
  if (Array.isArray(v)) return v.flatMap((x) => x.split(',').map((s) => s.trim()).filter(Boolean));
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

function flagBool(flags: ParsedArgs['flags'], key: string): boolean {
  return flags[key] === true || flags[key] === 'true';
}

function parsePositiveIntFlag(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) {
    throw new CliInputError(`--${name} must be a positive integer (received: "${raw}")`);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CliInputError(`--${name} must be a positive integer (received: "${raw}")`);
  }
  return parsed;
}

function parseNonNegativeIntFlag(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new CliInputError(`--${name} must be a non-negative integer (received: "${raw}")`);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CliInputError(`--${name} must be a non-negative integer (received: "${raw}")`);
  }
  return parsed;
}

function parsePlainJsonObject(
  raw: string,
  label: string,
  redact = true
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CliInputError(
      `Invalid JSON for ${label}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliInputError(`${label} must be a JSON object.`);
  }
  return (redact ? redactObjectDeep(parsed) : parsed) as Record<string, unknown>;
}

function printOutput(data: unknown, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else if (typeof data === 'string') {
    process.stdout.write(data + '\n');
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
}

function printError(message: string, asJson: boolean): void {
  const safe = redactSecrets(message);
  if (asJson) {
    process.stderr.write(JSON.stringify({ error: safe }) + '\n');
  } else {
    console.error(safe);
  }
}

function requireInitialized(agent: NumberOneAgent, workspace: string, asJson: boolean): boolean {
  if (!agent.store.isInitialized()) {
    printError(`Number One is not attached to ${workspace}. Run: n1 attach`, asJson);
    return false;
  }
  return true;
}

function printHelp(): void {
  process.stdout.write(`
Number One (n1) v${getPackageVersion()} — Harness-Agnostic Event-Sourced Workspace Curator & Bridge Crew

USAGE:
  n1 <command> [options]

CORE WORKSPACE & STREAM COMMANDS:
  attach [path]          Attach Number One to a workspace (.numberone/, Git hooks, shims)
  status                 Show stream position, watcher daemon, KPIs, and sync summary
  doctor                 Diagnose toolchain, stream integrity, daemon, and persistence config
  watch [--foreground]   Watch workspace filesystem changes in real time (or 'watch stop')
  reconcile              Detect & record offline manual file edits since last projection
  exec [--timeout-ms N] -- <command> [args...]
                         Run a command while recording crashes/logs & auto-capturing fix lessons
  replay [--until-seq N] Deterministically rebuild workspace state from atomic stream events
  documentary [--out F]  Generate chronological Workspace Documentary markdown
  verify [--local-only]  Verify cryptographic hash chain, fallback blobs, and remote mirrors

INSTITUTIONAL MEMORY & AUTHORITY COMMANDS:
  brief                  Print Number One's authoritative System of Record (SoR) brief
  consult --intent "..." Query lessons learned, failed attempts, and active directives
  arbitrate --action ... Submit a proposed plan/action for authoritative Number One verdict
  think "<thought>"      Record intermediate AI/human thinking into the stream
  dead-end --approach .. Record a failed approach so it is never retried across sessions
  lesson --title ...     Capture a durable Lesson Learned
  decision --title ...   Record an Architecture/Process Decision (ADR)
  directive --title ...  Issue an authoritative Number One directive superseding local context
  issue open|resolve     Track Scrum issues synced with .numberone / GitHub / Jira
  record --type ...      Append any atomic event directly to the stream
  ingest <file>          Ingest JSONL/Markdown transcripts from any AI harness

BRIDGE CREW (BMAD PARTY MODE) & CONTINUOUS EVOLUTION:
  party --topic "..."    Convene Bridge Crew roundtable (Round 1 Audit, Round 2 Challenge Verification,
                         SoR Precedent Correlation, Decision Matrix & Ranked Remediation Plan)
  officer <role>         Invoke single specialist officer (engineering | security | bridge)
  evolve --file <json> [--allow-exec]
                         Submit a factually-proven KPI-gated expertise update proposal
  evolve audit <role> [--threshold N] [--force]
                         Audit officer KPI history for broken-practice regressions
  evolve revert <role> <practiceId> [--reason "..."]
                         Revert an evolved officer practice

DISTRIBUTED PERSISTENCE & HARNESS INTEGRATION:
  sync [push|pull|both]  Sync distributed stream with GitHub Issues/Projects v2 & Jira Scrum
  shims                  Install/refresh AGENTS.md, CLAUDE.md, Cursor, Copilot, and .mcp.json
  shell-hook [bash|zsh]  Print shell hook for capturing terminal crashes automatically
  mcp                    Start JSON-RPC 2.0 MCP Server on stdio for any AI harness

GLOBAL OPTIONS:
  --workspace <path>     Target workspace directory (defaults to current working directory)
  --json                 Emit machine-readable JSON output
  --version, -v          Print Number One version
  --help, -h             Show this help message
`);
}

export async function runCli(argv: string[]): Promise<number> {
  const wantsJson = argv.includes('--json') || argv.includes('--json=true');
  let parsed: ParsedArgs;
  try {
    parsed = parseCliArgs(argv);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err), wantsJson);
    return 1;
  }

  try {
    return await executeCliCommand(parsed);
  } catch (err) {
    if (err instanceof CliInputError) {
      printError(err.message, flagBool(parsed.flags, 'json'));
      return 1;
    }
    throw err;
  }
}

async function executeCliCommand(parsed: ParsedArgs): Promise<number> {
  const { command, positionals, flags, passthrough } = parsed;
  const asJson = flagBool(flags, 'json');

  if (flagBool(flags, 'version') || command === 'version') {
    const version = getPackageVersion();
    printOutput(asJson ? { name: 'numberone', version } : version, asJson);
    return 0;
  }

  if (flagBool(flags, 'help') || command === 'help') {
    printHelp();
    return 0;
  }

  const workspace = path.resolve(
    flagStr(flags, 'workspace') ?? (command === 'attach' && positionals[0] ? positionals[0] : process.cwd())
  );
  const agent = new NumberOneAgent(workspace);

  switch (command) {
    case 'attach': {
      const backfill = parseNonNegativeIntFlag(flagStr(flags, 'backfill'), 'backfill', 25);
      const res = agent.attach({
        workspaceName: flagStr(flags, 'name'),
        installHooks: !flagBool(flags, 'no-hooks'),
        installShims: !flagBool(flags, 'no-shims'),
        backfillGitCommits: backfill,
        harness: flagStr(flags, 'harness') ?? 'cli'
      });
      if (asJson) {
        printOutput(res, true);
      } else {
        console.log(`Attached Number One to ${workspace}`);
        console.log(`  Stream: .numberone/stream/events/ (seq #${res.attachedEvent.seq})`);
        console.log(`  Indexed files: ${res.initialFilesIndexed}`);
        console.log(`  Git hooks installed: ${res.gitHooksInstalled.join(', ') || 'none'}`);
        console.log(`  Git commits backfilled: ${res.gitCommitsBackfilled}`);
        console.log(`  Harness shims updated: ${res.shimsInstalled.join(', ') || 'none'}`);
      }
      return 0;
    }

    case 'status': {
      if (!requireInitialized(agent, workspace, asJson)) return 1;
      const state = agent.getState();
      const head = agent.store.getHead();
      const daemonStatus = agent.daemon.getStatus();
      const summary = {
        workspaceRoot: workspace,
        head,
        daemon: daemonStatus,
        harnessesSeen: state.harnessesSeen,
        counts: {
          filesTracked: Object.keys(state.files).length,
          lessons: Object.keys(state.lessons).length,
          decisions: Object.keys(state.decisions).length,
          activeDirectives: Object.values(state.directives).filter((d) => d.active).length,
          openIssues: Object.values(state.issues).filter((i) => i.status !== 'resolved').length,
          unresolvedCrashes: state.crashes.filter((c) => !c.resolvedByEventId).length,
          partySessions: Object.keys(state.partySessions).length
        },
        officerKpis: {
          engineering: state.officers.engineering.currentKpiScore,
          security: state.officers.security.currentKpiScore,
          bridge: state.officers.bridge.currentKpiScore
        },
        syncState: state.syncState
      };
      printOutput(summary, asJson);
      return 0;
    }

    case 'doctor': {
      const initialized = agent.store.isInitialized();
      let gitVersion: string | null = null;
      try {
        gitVersion = execFileSync('git', ['--version'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
      } catch {
        gitVersion = null;
      }
      const inGitRepo = isGitRepository(workspace);
      const localIntegrity = initialized ? agent.store.verifyIntegrity() : null;
      const daemon = initialized ? agent.daemon.getStatus() : null;
      const config = initialized ? agent.store.readConfig() : null;
      const backends = {
        directory: Boolean(config?.persistence.directory?.enabled),
        github: {
          enabled: Boolean(config?.persistence.github?.enabled),
          tokenPresent: Boolean(
            config?.persistence.github?.tokenEnvVar
              ? process.env[config.persistence.github.tokenEnvVar]
              : process.env.GITHUB_TOKEN || process.env.GH_TOKEN
          )
        },
        jira: {
          enabled: Boolean(config?.persistence.jira?.enabled),
          credentialsPresent: Boolean(
            (config?.persistence.jira?.emailEnvVar
              ? process.env[config.persistence.jira.emailEnvVar]
              : process.env.JIRA_EMAIL) &&
              (config?.persistence.jira?.apiTokenEnvVar
                ? process.env[config.persistence.jira.apiTokenEnvVar]
                : process.env.JIRA_API_TOKEN)
          )
        }
      };

      const healthy = !initialized || Boolean(localIntegrity?.valid);
      const report = {
        version: getPackageVersion(),
        nodeVersion: process.versions.node,
        platform: process.platform,
        workspaceRoot: workspace,
        initialized,
        gitAvailable: Boolean(gitVersion),
        gitVersion,
        isGitRepository: inGitRepo,
        streamIntegrity: localIntegrity,
        daemon,
        backends,
        healthy
      };
      printOutput(report, asJson);
      return healthy ? 0 : 2;
    }

    case 'watch': {
      if (positionals[0] === 'stop') {
        const res = agent.daemon.stop();
        printOutput(res, asJson);
        return 0;
      }
      if (!agent.store.isInitialized()) agent.attach({ installShims: false });

      if (flagBool(flags, 'foreground')) {
        const watcher = agent.createWatcher({
          persistent: true,
          onEvent: (ev) => {
            if (asJson) {
              process.stdout.write(JSON.stringify(ev) + '\n');
            } else {
              console.log(`[#${ev.seq}] ${ev.type}: ${ev.summary}`);
            }
          }
        });
        const offline = watcher.reconcileOfflineChanges(agent.getState());
        if (!asJson && offline.length > 0) {
          console.log(`Reconciled ${offline.length} offline file change(s).`);
        }
        watcher.start();
        if (!asJson) console.log(`Number One watching ${workspace}... (Ctrl+C to stop)`);

        await new Promise<void>((resolve) => {
          const keepAlive = setInterval(() => {
            // Keeps event loop alive even if all subdir watchers temporarily close
          }, 60_000);
          const shutdown = () => {
            clearInterval(keepAlive);
            process.removeListener('SIGINT', shutdown);
            process.removeListener('SIGTERM', shutdown);
            watcher.stop(true);
            resolve();
          };
          process.on('SIGINT', shutdown);
          process.on('SIGTERM', shutdown);
        });
        return 0;
      }

      const thisFile = fileURLToPath(import.meta.url);
      const status = agent.daemon.startDetached(thisFile);
      printOutput(status, asJson);
      return 0;
    }

    case 'reconcile': {
      if (!requireInitialized(agent, workspace, asJson)) return 1;
      const events = agent.reconcileOfflineChanges();
      printOutput({ reconciledCount: events.length, events }, asJson);
      return 0;
    }

    case 'exec': {
      const useDirectArgv = passthrough.length > 0;
      const cmdParts = useDirectArgv ? passthrough : positionals;
      const cmd = cmdParts.join(' ').trim();
      if (!cmd) {
        printError('Usage: n1 exec [--timeout-ms N] -- <command> [args...]', asJson);
        return 1;
      }
      const timeoutMs = parsePositiveIntFlag(flagStr(flags, 'timeout-ms'), 'timeout-ms');
      const res = await agent.runCommand({
        command: cmd,
        argv: useDirectArgv ? passthrough : undefined,
        harness: flagStr(flags, 'harness') ?? 'cli',
        sessionId: flagStr(flags, 'session'),
        tags: flagList(flags, 'tags'),
        silent: asJson,
        timeoutMs
      });
      if (asJson) {
        printOutput(
          {
            exitCode: res.exitCode,
            signal: res.signal,
            timedOut: res.timedOut,
            durationMs: res.durationMs,
            endEventId: res.endEvent.id,
            autoCapturedLessonId: res.autoCapturedLesson?.id ?? null
          },
          true
        );
      } else if (res.autoCapturedLesson) {
        console.log(`\n[Number One] Auto-captured verified Lesson Learned: ${res.autoCapturedLesson.summary}`);
      }
      return res.exitCode ?? 1;
    }

    case 'think': {
      const thought = flagStr(flags, 'thought') ?? positionals.join(' ');
      if (!thought) {
        printError('Usage: n1 think "<thought>"', asJson);
        return 1;
      }
      const ev = agent.recordThinking({
        thought,
        harness: flagStr(flags, 'harness') ?? 'cli',
        sessionId: flagStr(flags, 'session'),
        affectedPaths: flagList(flags, 'paths'),
        tags: flagList(flags, 'tags')
      });
      printOutput(ev, asJson);
      return 0;
    }

    case 'dead-end': {
      const approach = flagStr(flags, 'approach') ?? positionals[0] ?? '';
      const reason = flagStr(flags, 'reason') ?? positionals.slice(1).join(' ') ?? 'Did not work';
      if (!approach) {
        printError('Usage: n1 dead-end --approach "..." --reason "..."', asJson);
        return 1;
      }
      const ev = agent.recordFailedAttempt({
        approach,
        reason,
        harness: flagStr(flags, 'harness') ?? 'cli',
        affectedPaths: flagList(flags, 'paths'),
        tags: flagList(flags, 'tags')
      });
      printOutput(ev, asJson);
      return 0;
    }

    case 'lesson': {
      const title = flagStr(flags, 'title');
      if (!title) {
        printError(
          'Usage: n1 lesson --title "..." --problem "..." --root-cause "..." --resolution "..." --prevention "..."',
          asJson
        );
        return 1;
      }
      const severity = assertEnumFlag<'low' | 'medium' | 'high' | 'critical'>(
        flagStr(flags, 'severity'),
        VALID_SEVERITIES,
        'severity',
        'medium'
      );
      const ev = agent.captureLesson({
        title,
        problem: flagStr(flags, 'problem') ?? title,
        rootCause: flagStr(flags, 'root-cause') ?? 'Documented root cause',
        resolution: flagStr(flags, 'resolution') ?? '',
        preventionRule: flagStr(flags, 'prevention') ?? flagStr(flags, 'resolution') ?? title,
        failedApproaches: flagList(flags, 'failed'),
        errorSignatures: flagList(flags, 'error-sig'),
        affectedPaths: flagList(flags, 'paths'),
        tags: flagList(flags, 'tags'),
        severity,
        harness: flagStr(flags, 'harness') ?? 'cli'
      });
      printOutput(ev, asJson);
      return 0;
    }

    case 'decision': {
      const title = flagStr(flags, 'title');
      if (!title) {
        printError('Usage: n1 decision --title "..." --decision "..." --rationale "..."', asJson);
        return 1;
      }
      const ev = agent.recordDecision({
        title,
        decision: flagStr(flags, 'decision') ?? title,
        rationale: flagStr(flags, 'rationale') ?? '',
        alternativesRejected: flagList(flags, 'rejected'),
        consequences: flagList(flags, 'consequences'),
        affectedPaths: flagList(flags, 'paths'),
        tags: flagList(flags, 'tags'),
        harness: flagStr(flags, 'harness') ?? 'cli'
      });
      printOutput(ev, asJson);
      return 0;
    }

    case 'directive': {
      const title = flagStr(flags, 'title');
      const directive = flagStr(flags, 'directive');
      if (!title || !directive) {
        printError('Usage: n1 directive --title "..." --directive "..." --rationale "..."', asJson);
        return 1;
      }
      const severity = assertEnumFlag<'advisory' | 'mandatory' | 'blocking'>(
        flagStr(flags, 'severity'),
        VALID_DIRECTIVE_SEVERITIES,
        'severity',
        'mandatory'
      );
      const ev = agent.issueDirective({
        title,
        directive,
        rationale: flagStr(flags, 'rationale') ?? 'Authoritative Number One directive',
        scopePaths: flagList(flags, 'paths'),
        scopeTags: flagList(flags, 'tags'),
        forbiddenPatterns: flagList(flags, 'forbid'),
        requiredPatterns: flagList(flags, 'require'),
        severity,
        harness: flagStr(flags, 'harness') ?? 'cli'
      });
      printOutput(ev, asJson);
      return 0;
    }

    case 'issue': {
      const sub = positionals[0] ?? 'list';
      if (sub === 'open') {
        const title = flagStr(flags, 'title');
        if (!title) {
          printError('Usage: n1 issue open --title "..." [--kind bug|story|task|security|infra|release]', asJson);
          return 1;
        }
        const kind = assertEnumFlag<
          'bug' | 'crash' | 'story' | 'epic' | 'task' | 'debt' | 'security' | 'infra' | 'release'
        >(flagStr(flags, 'kind'), VALID_ISSUE_KINDS, 'kind', 'task');
        const priority = assertEnumFlag<'low' | 'medium' | 'high' | 'critical'>(
          flagStr(flags, 'priority'),
          VALID_SEVERITIES,
          'priority',
          'medium'
        );
        const officerRaw = flagStr(flags, 'officer');
        const ownerOfficer = officerRaw
          ? assertEnumFlag<OfficerRole>(officerRaw, VALID_OFFICERS, 'officer', 'engineering')
          : undefined;
        const ev = agent.openIssue({
          title,
          description: flagStr(flags, 'description') ?? title,
          kind,
          priority,
          ownerOfficer,
          affectedPaths: flagList(flags, 'paths'),
          tags: flagList(flags, 'tags')
        });
        printOutput(ev, asJson);
        return 0;
      }
      if (sub === 'resolve') {
        const issueId = positionals[1] ?? flagStr(flags, 'id');
        if (!issueId) {
          printError('Usage: n1 issue resolve <issueId> --resolution "..."', asJson);
          return 1;
        }
        const ev = agent.resolveIssue(issueId, flagStr(flags, 'resolution') ?? 'Resolved');
        printOutput(ev, asJson);
        return 0;
      }
      if (!requireInitialized(agent, workspace, asJson)) return 1;
      const state = agent.getState();
      printOutput(Object.values(state.issues), asJson);
      return 0;
    }

    case 'record': {
      const typeRaw = flagStr(flags, 'type');
      const summary = flagStr(flags, 'summary');
      if (!typeRaw || !summary) {
        printError('Usage: n1 record --type <EventType> --summary "..." [--payload \'{"k":"v"}\']', asJson);
        return 1;
      }
      if (!VALID_EVENT_TYPE_SET.has(typeRaw)) {
        throw new CliInputError(
          `Unknown event type "${typeRaw}". Valid types include: ${EVENT_TYPES.slice(0, 8).join(', ')}, ...`
        );
      }
      const type = typeRaw as EventType;
      const payloadRaw = flagStr(flags, 'payload');
      const payload = payloadRaw ? parsePlainJsonObject(payloadRaw, '--payload') : {};
      const ev = agent.recordEvent({
        type,
        actor: { kind: 'human', id: flagStr(flags, 'actor') ?? process.env.USER ?? 'operator' },
        harness: flagStr(flags, 'harness') ?? 'cli',
        sessionId: flagStr(flags, 'session'),
        summary,
        affectedPaths: flagList(flags, 'paths'),
        tags: flagList(flags, 'tags'),
        payload
      });
      printOutput(ev, asJson);
      return 0;
    }

    case 'brief': {
      if (!requireInitialized(agent, workspace, asJson)) return 1;
      const brief = agent.getAuthoritativeBrief(flagList(flags, 'paths'));
      printOutput(asJson ? { brief } : brief, asJson);
      return 0;
    }

    case 'consult': {
      if (!requireInitialized(agent, workspace, asJson)) return 1;
      const res = agent.consult({
        intent: flagStr(flags, 'intent') ?? positionals.join(' '),
        targetPaths: flagList(flags, 'paths'),
        errorText: flagStr(flags, 'error'),
        command: flagStr(flags, 'command'),
        tags: flagList(flags, 'tags')
      });
      printOutput(res, asJson);
      return 0;
    }

    case 'arbitrate': {
      const action = flagStr(flags, 'action') ?? positionals.join(' ');
      if (!action) {
        printError('Usage: n1 arbitrate --action "..." --intent "..." [--approach "..."] [--paths a,b]', asJson);
        return 1;
      }
      const res = agent.arbitrate(
        {
          action,
          intent: flagStr(flags, 'intent') ?? action,
          proposedApproach: flagStr(flags, 'approach'),
          command: flagStr(flags, 'command'),
          targetPaths: flagList(flags, 'paths'),
          tags: flagList(flags, 'tags'),
          harness: flagStr(flags, 'harness') ?? 'cli'
        },
        { recordAuditEvent: !flagBool(flags, 'dry-run') }
      );
      if (asJson) {
        printOutput(res, true);
      } else {
        console.log(res.authoritativeSummary);
      }
      return res.verdict === 'BLOCK' ? 2 : 0;
    }

    case 'replay': {
      if (!requireInitialized(agent, workspace, asJson)) return 1;
      const untilSeq = parsePositiveIntFlag(flagStr(flags, 'until-seq'), 'until-seq');
      const untilTimestamp = flagStr(flags, 'until-time');
      const state = agent.replay({
        untilSeq,
        untilTimestamp,
        persistSnapshot: untilSeq === undefined && !untilTimestamp
      });
      printOutput(state, asJson);
      return 0;
    }

    case 'documentary': {
      if (!requireInitialized(agent, workspace, asJson)) return 1;
      const doc = agent.buildDocumentary();
      const outPath = flagStr(flags, 'out');
      if (outPath) {
        const resolvedOut = path.resolve(outPath);
        atomicWriteFileSync(resolvedOut, doc.markdown);
        printOutput({ writtenTo: resolvedOut, chapters: doc.chapters.length }, asJson);
      } else {
        printOutput(asJson ? doc : doc.markdown, asJson);
      }
      return 0;
    }

    case 'party': {
      const topic = flagStr(flags, 'topic') ?? (positionals.join(' ') || 'Full Workspace Review');
      const rawOfficers = flagList(flags, 'officers');
      for (const o of rawOfficers) {
        if (!VALID_OFFICERS.has(o)) {
          throw new CliInputError(`Invalid officer "${o}" in --officers. Allowed: engineering, security, bridge`);
        }
      }
      const officers = rawOfficers as OfficerRole[];
      const mode = assertEnumFlag<'roundtable' | 'specialist' | 'auto-triage'>(
        flagStr(flags, 'mode'),
        VALID_PARTY_MODES,
        'mode',
        'roundtable'
      );
      const res = await agent.assembleCrew({
        topic,
        mode,
        officers: officers.length > 0 ? officers : undefined,
        targetPaths: flagList(flags, 'paths'),
        harness: flagStr(flags, 'harness') ?? 'cli'
      });
      if (asJson) {
        printOutput(res, true);
      } else {
        console.log(`Crew Session: ${res.partySessionId} | Mode: ${res.mode} | Topic: ${res.topic}`);
        console.log(`Officers: ${res.assembledOfficers.join(', ')}\n`);
        console.log('Decision Matrix:');
        for (const row of res.decisionMatrix) {
          console.log(
            `  - [${row.domainGate}] ${row.officerTitle}: ${row.mainKpiName}=${row.kpiScore}/100 (${row.checksPassed}/${row.checksApplicable} checks, ${row.blockingCount} blocker(s))`
          );
        }
        if (res.remediationPlan.length > 0) {
          console.log('\nRanked Remediation Plan:');
          for (const item of res.remediationPlan.slice(0, 8)) {
            console.log(
              `  #${item.rank} [${item.ownerOfficer}/${item.severity}${item.blocksRelease ? '/BLOCKING' : ''}] ${item.title}`
            );
            console.log(`      Action: ${item.action}`);
          }
        }
        console.log('\nRoundtable Log:');
        for (const t of res.roundtableTranscript) {
          console.log(`[Round ${t.round} | ${t.speaker} | ${t.kind}] ${t.message}`);
        }
      }
      return res.consensusReached ? 0 : 2;
    }

    case 'officer': {
      const role = positionals[0] as OfficerRole | undefined;
      if (!role || !VALID_OFFICERS.has(role)) {
        printError('Usage: n1 officer <engineering|security|bridge> [--topic "..."]', asJson);
        return 1;
      }
      const res = agent.assessOfficer(role, flagStr(flags, 'topic'), flagList(flags, 'paths'));
      printOutput(res, asJson);
      return 0;
    }

    case 'evolve': {
      const sub = positionals[0];
      if (sub === 'audit') {
        if (!requireInitialized(agent, workspace, asJson)) return 1;
        const role = positionals[1] as OfficerRole | undefined;
        if (!role || !VALID_OFFICERS.has(role)) {
          printError('Usage: n1 evolve audit <engineering|security|bridge> [--threshold N] [--force]', asJson);
          return 1;
        }
        const threshold = parsePositiveIntFlag(flagStr(flags, 'threshold'), 'threshold') ?? 5;
        const revertedIds = agent.auditOfficerRegressions(role, threshold, {
          forceRevertOnStrictnessDrop: flagBool(flags, 'force')
        });
        printOutput({ officer: role, threshold, revertedPracticeIds: revertedIds }, asJson);
        return 0;
      }
      if (sub === 'revert') {
        if (!requireInitialized(agent, workspace, asJson)) return 1;
        const role = positionals[1] as OfficerRole | undefined;
        const practiceId = positionals[2] ?? flagStr(flags, 'practice');
        if (!role || !VALID_OFFICERS.has(role) || !practiceId) {
          printError('Usage: n1 evolve revert <engineering|security|bridge> <practiceId> [--reason "..."]', asJson);
          return 1;
        }
        const reason = flagStr(flags, 'reason') ?? 'Manually reverted via CLI';
        const eventId = agent.revertOfficerPractice(role, practiceId, reason);
        printOutput({ officer: role, practiceId, reverted: true, eventId }, asJson);
        return 0;
      }

      const file = flagStr(flags, 'file') ?? positionals[0];
      if (!file) {
        printError('Usage: n1 evolve --file <proposal.json> [--allow-exec]', asJson);
        return 1;
      }
      const resolvedFile = path.resolve(file);
      const rawJson = readTextFileSafe(resolvedFile, 5_000_000);
      if (rawJson === null) {
        throw new CliInputError(`Proposal file not found or unreadable regular file: ${resolvedFile}`);
      }
      // Do NOT redact proposal test fixtures before matcher verification
      const proposal = parsePlainJsonObject(
        rawJson,
        resolvedFile,
        false
      ) as unknown as KnowledgeUpdateProposal;
      const verdict = agent.proposeKnowledgeUpdate(proposal, {
        allowCommandExecution: flagBool(flags, 'allow-exec')
      });
      printOutput(verdict, asJson);
      return verdict.accepted ? 0 : 2;
    }

    case 'sync': {
      if (!requireInitialized(agent, workspace, asJson)) return 1;
      const dir = positionals[0] ?? 'both';
      if (dir !== 'push' && dir !== 'pull' && dir !== 'both') {
        throw new CliInputError(`Invalid sync direction "${dir}". Expected push, pull, or both.`);
      }
      const push = dir === 'push' || dir === 'both' ? await agent.syncPush() : [];
      const pull = dir === 'pull' || dir === 'both' ? await agent.syncPull() : [];
      printOutput({ push, pull }, asJson);
      const hasErrors =
        push.some((r) => r.errors.length > 0) || pull.some((r) => r.errors.length > 0);
      return hasErrors ? 2 : 0;
    }

    case 'verify': {
      if (!requireInitialized(agent, workspace, asJson)) return 1;
      const report = await agent.verifyIntegrity(!flagBool(flags, 'local-only'));
      printOutput(report, asJson);
      return report.valid ? 0 : 2;
    }

    case 'ingest': {
      const file = positionals[0] ?? flagStr(flags, 'file');
      if (!file) {
        printError('Usage: n1 ingest <transcript.jsonl|notes.md> [--harness claude-code]', asJson);
        return 1;
      }
      const res = agent.ingestTranscript({
        filePath: file,
        harness: flagStr(flags, 'harness'),
        sessionId: flagStr(flags, 'session')
      });
      printOutput(res, asJson);
      return 0;
    }

    case 'git-hook': {
      const hook = positionals[0];
      if (!hook || !VALID_GIT_HOOKS.has(hook)) return 1;
      const hookArgs = passthrough.length > 0 ? passthrough : positionals.slice(1);
      const ev = recordGitHookEvent(agent.store, hook as SupportedGitHook, hookArgs);
      if (asJson) printOutput(ev, true);
      return 0;
    }

    case 'record-shell-failure': {
      const cmdRaw = process.env.N1_SHELL_CMD ?? flagStr(flags, 'command') ?? '';
      const exitCodeRaw = process.env.N1_SHELL_EXIT ?? flagStr(flags, 'exit-code') ?? '1';
      const shellName = process.env.N1_SHELL_NAME ?? 'shell';
      if (!cmdRaw) return 0;
      const cmd = redactSecrets(cmdRaw);
      const exitCode = Number.parseInt(exitCodeRaw, 10);
      const ev = agent.recordEvent({
        type: exitCode >= 128 ? 'exec.crashed' : 'exec.failed',
        actor: { kind: 'human', id: process.env.USER ?? 'operator' },
        harness: shellName,
        summary: `Command failed (exit ${exitCode}): ${cmd.slice(0, 140)}`,
        tags: ['exec', 'shell-hook', exitCode >= 128 ? 'crash' : 'failure'],
        payload: {
          command: cmd,
          exitCode: Number.isFinite(exitCode) ? exitCode : 1
        }
      });
      if (asJson) printOutput(ev, true);
      return 0;
    }

    case 'shell-hook': {
      const shell = positionals[0] === 'zsh' ? 'zsh' : 'bash';
      process.stdout.write(generateShellHook(shell) + '\n');
      return 0;
    }

    case 'shims': {
      const name = agent.store.readConfig()?.workspaceName ?? path.basename(workspace);
      const res = installHarnessShims(workspace, name);
      printOutput(res, asJson);
      return 0;
    }

    case 'mcp': {
      const server = new NumberOneMcpServer(agent);
      await server.startStdio();
      return 0;
    }

    default:
      printError(`Unknown command: ${command}`, asJson);
      if (!asJson) printHelp();
      return 1;
  }
}

function isInvokedAsCli(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  const base = path.basename(invoked);
  if (base === 'numberone' || base === 'n1') return true;
  try {
    const invokedReal = fs.realpathSync(invoked);
    const selfReal = fs.realpathSync(fileURLToPath(import.meta.url));
    return invokedReal === selfReal;
  } catch {
    return path.resolve(invoked) === fileURLToPath(import.meta.url);
  }
}

if (isInvokedAsCli()) {
  runCli(process.argv.slice(2))
    .then((code) => {
      if (code !== 0) process.exitCode = code;
    })
    .catch((err) => {
      const wantsJson = process.argv.includes('--json') || process.argv.includes('--json=true');
      printError(err instanceof Error ? err.message : String(err), wantsJson);
      process.exitCode = 1;
    });
}
