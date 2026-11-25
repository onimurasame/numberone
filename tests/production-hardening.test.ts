import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCliArgs, runCli } from '../src/cli.js';
import { canonicalJson } from '../src/core/hash.js';
import { PROJECTION_VERSION } from '../src/core/replay-engine.js';
import { generateUlid } from '../src/core/ulid.js';
import { sanitizeModelIdentifier } from '../src/crew/llm-provider.js';
import { NumberOneAgent } from '../src/harness/number-one.js';
import { DirectoryPersistenceAdapter } from '../src/persistence/directory-adapter.js';
import { buildGitHubIssueBody, parseGitHubEmbeddedMeta } from '../src/persistence/github-adapter.js';
import { resilientFetch, validateHttpUrl } from '../src/utils/http.js';
import { isSensitiveSecretFile, redactSecrets } from '../src/utils/redactor.js';
import { matchGlobLinear, validateRegexSafety } from '../src/utils/safe-regex.js';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.resolve(THIS_DIR, '../dist/cli.js');

const tmpDirs: string[] = [];

function createTempDir(prefix = 'n1-prod-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Production Security, Durability & Operational Hardening (Zero Mocks)', () => {
  it('redacts secrets across StreamStore, watched commands, outbound GitHub bodies, and records .env metadata-only with 0o600/0o700 permissions', async () => {
    const ws = createTempDir();
    // Dynamically assemble fake credential shapes so test file contains zero literal tokens
    const fakeAws = 'AKIA' + 'IOSFODNN7EXAMPLE';
    const fakeGhp = 'ghp_' + '1234567890abcdef1234567890abcdef1234';
    const fakePem = '-----BEGIN ' + 'PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIB\n-----END ' + 'PRIVATE KEY-----';

    fs.writeFileSync(path.join(ws, '.env'), `AWS_ACCESS_KEY_ID=${fakeAws}\nGITHUB_TOKEN=${fakeGhp}\n`);
    fs.writeFileSync(path.join(ws, '.env.example'), 'AWS_ACCESS_KEY_ID=\nGITHUB_TOKEN=\n');

    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    // Restrictive permissions on .numberone directories & files
    if (process.platform !== 'win32') {
      const rootMode = fs.statSync(agent.store.rootDir).mode & 0o777;
      const headMode = fs.statSync(path.join(agent.store.streamDir, 'head.json')).mode & 0o777;
      expect(rootMode).toBe(0o700);
      expect(headMode).toBe(0o600);
    }

    // 1. StreamStore redacts summary, payload, and text fallback blobs
    const ev = agent.recordEvent({
      type: 'chat.thinking',
      actor: { kind: 'human', id: 'dev' },
      summary: `Debugging auth with ${fakeGhp} and ${fakeAws}`,
      payload: {
        note: `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c`,
        url: 'https://alice:supersecretpass123@api.example.com/v1'
      },
      fallbackBlobs: [{ key: 'trace', content: fakePem, contentType: 'text/plain' }]
    });

    expect(ev.summary).not.toContain(fakeGhp);
    expect(ev.summary).not.toContain(fakeAws);
    expect(JSON.stringify(ev.payload)).not.toContain('supersecretpass123');
    expect(JSON.stringify(ev.payload)).not.toContain('eyJhbGciOiJIUzI1NiIs');

    const blobText = agent.store.readBlob(ev.blobs[0]!.sha256)?.toString('utf8') ?? '';
    expect(blobText).not.toContain('MIIEvQIBADANBgkqhkiG9w0');
    expect(blobText).toContain('[REDACTED:PRIVATE_KEY]');

    // 2. CommandRunner redacts secrets from command & stdout
    const cmdRes = await agent.runCommand({
      command: `node -e 'console.log("${fakeGhp} ${fakeAws}")'`,
      silent: true
    });
    expect(cmdRes.stdout).not.toContain(fakeGhp);
    expect(cmdRes.stdout).not.toContain(fakeAws);
    expect(String(cmdRes.endEvent.payload.stdoutExcerpt)).not.toContain(fakeGhp);

    // 3. Filesystem reconciliation records .env as metadata-only (zero plaintext in stream or blobs!)
    expect(isSensitiveSecretFile('.env')).toBe(true);
    expect(isSensitiveSecretFile('.env.local')).toBe(true);
    expect(isSensitiveSecretFile('.env.example')).toBe(false);

    fs.writeFileSync(path.join(ws, '.env'), `AWS_ACCESS_KEY_ID=${fakeAws}\nNEW_SECRET=topsecret999999\n`);
    const reconciled = agent.reconcileOfflineChanges();
    const envEv = reconciled.find((e) => e.affectedPaths.includes('.env'));
    expect(envEv).toBeDefined();
    expect(envEv?.payload.sensitiveRedacted).toBe(true);
    expect(envEv?.blobs).toHaveLength(0);

    // Scan EVERY file inside .numberone/ to prove zero secret plaintext landed on disk
    const numberoneFiles: string[] = [];
    const stack = [agent.store.rootDir];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
        const full = path.join(cur, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) numberoneFiles.push(full);
      }
    }
    for (const f of numberoneFiles) {
      const raw = fs.readFileSync(f, 'utf8');
      expect(raw).not.toContain(fakeAws);
      expect(raw).not.toContain(fakeGhp);
      expect(raw).not.toContain('topsecret999999');
      expect(raw).not.toContain('MIIEvQIBADANBgkqhkiG9w0');
    }

    // 4. Outbound GitHub body formatter scrubs secrets as defense-in-depth even if an unredacted event reached it
    const rawEventWithLeak = {
      ...ev,
      payload: { leakedToken: fakeGhp }
    };
    const ghBody = buildGitHubIssueBody(rawEventWithLeak, ['payload.raw']);
    expect(ghBody).not.toContain(fakeGhp);
    expect(ghBody).toContain('[REDACTED:GITHUB_TOKEN]');
    expect(redactSecrets(`x ${fakeAws}`)).toContain('[REDACTED:AWS_ACCESS_KEY]');

    // Hash chain remains 100% valid after redaction
    const integrity = await agent.verifyIntegrity(false);
    expect(integrity.valid).toBe(true);
  });

  it('blocks symlink escapes (CWE-59), path traversal in DirectoryPersistenceAdapter (CWE-22), and Git hook path shell injection (CWE-78)', async () => {
    const outsideDir = createTempDir('n1-outside-');
    const secretOutside = path.join(outsideDir, 'host-secret.txt');
    const canary = 'OUTSIDE_HOST_CANARY_987654321';
    fs.writeFileSync(secretOutside, canary);

    const ws = createTempDir('n1-symlink-ws-');
    fs.writeFileSync(path.join(ws, 'normal.ts'), 'export const ok = true;\n');
    fs.symlinkSync(secretOutside, path.join(ws, 'symlink-escape.txt'));

    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });
    agent.reconcileOfflineChanges();

    // Symlink target must NEVER appear in projection files or any blob
    const state = agent.getState();
    expect(state.files['normal.ts']).toBeDefined();
    expect(state.files['symlink-escape.txt']).toBeUndefined();

    const blobsDir = agent.store.blobsDir;
    for (const b of fs.readdirSync(blobsDir)) {
      expect(fs.readFileSync(path.join(blobsDir, b), 'utf8')).not.toContain(canary);
    }

    // DirectoryPersistenceAdapter blocks path traversal in issue keys
    const dirStore = createTempDir('n1-dir-adapter-');
    const adapter = new DirectoryPersistenceAdapter({ enabled: true, targetDir: dirStore, projectKey: 'SEC' });
    const latestEv = agent.store.query()[0]!;
    const traversalVerify = await adapter.verifyRemoteRef(latestEv, {
      backend: 'directory',
      externalId: '../../etc/passwd',
      externalKey: '../../etc/passwd',
      entityType: 'issue',
      syncedAt: new Date().toISOString(),
      syncedHash: latestEv.hash,
      fallbackFields: []
    });
    expect(traversalVerify.ok).toBe(false);
    expect(traversalVerify.reason).toContain('Invalid external issue key format');

    // Git hook installation safely single-quotes workspace paths containing shell metacharacters
    const pwnMarker = path.join(outsideDir, 'pwned-by-hook');
    const trickyWs = path.join(outsideDir, `repo-$(touch ${path.basename(pwnMarker)})`);
    fs.mkdirSync(trickyWs, { recursive: true });
    execFileSync('git', ['init'], { cwd: trickyWs, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: trickyWs, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: trickyWs, stdio: 'ignore' });

    const trickyAgent = new NumberOneAgent(trickyWs);
    trickyAgent.attach({ installHooks: true, installShims: false, backfillGitCommits: 0 });
    fs.writeFileSync(path.join(trickyWs, 'hello.txt'), 'safe\n');
    execFileSync('git', ['add', 'hello.txt'], { cwd: trickyWs, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'Safe commit in metacharacter path'], {
      cwd: trickyWs,
      stdio: 'ignore'
    });

    expect(fs.existsSync(pwnMarker)).toBe(false);
    expect(fs.existsSync(path.join(trickyWs, path.basename(pwnMarker)))).toBe(false);
  });

  it('rejects ReDoS patterns in SafeRegex, AuthorityEngine, and KnowledgeEvolutionEngine (CWE-1333)', () => {
    const evilNestedQuantifier = ['(a+', ')+$'].join('');
    expect(validateRegexSafety(evilNestedQuantifier).safe).toBe(false);
    expect(validateRegexSafety('(a|aa)+').safe).toBe(false);
    expect(validateRegexSafety('([a-z]+)*').safe).toBe(false);
    expect(validateRegexSafety('(foo)\\1+').safe).toBe(false);
    expect(validateRegexSafety('a'.repeat(600)).safe).toBe(false);
    expect(validateRegexSafety('execSync\\s*\\(').safe).toBe(true);

    const ws = createTempDir();
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    // Even if a malicious directive contains a ReDoS regex, arbitration completes immediately (<250ms) without hanging
    agent.issueDirective({
      title: 'Evil regex directive',
      directive: 'Never match evil regex',
      rationale: 'Adversarial ReDoS test',
      forbiddenPatterns: [evilNestedQuantifier],
      severity: 'blocking'
    });
    const start = Date.now();
    const arb = agent.arbitrate({
      action: 'a'.repeat(40) + '!',
      intent: 'test redos resilience'
    });
    expect(Date.now() - start).toBeLessThan(250);
    expect(arb.verdict).not.toBe('BLOCK');

    // Evolution engine rejects ReDoS matcher at proposal time
    const incident = agent.recordEvent({
      type: 'exec.crashed',
      actor: { kind: 'watcher', id: 'runner' },
      summary: 'Test crash'
    });
    const verdict = agent.proposeKnowledgeUpdate({
      officer: 'security',
      practice: {
        id: 'sec-redos-matcher',
        title: 'Evil ReDoS matcher',
        category: 'code',
        description: 'Nested quantifier regex',
        ruleType: 'check',
        targetKpi: 'security_posture_score',
        evidenceSummary: 'Should be rejected',
        evidenceSources: [`stream:${incident.id}`],
        matcher: {
          contentRegex: '(a+)+$'
        }
      },
      proof: {
        kind: 'counterfactual_replay',
        sources: [`stream:${incident.id}`],
        methodology: 'Adversarial test for catastrophic backtracking rejection',
        counterfactualEventIds: [incident.id],
        positiveSamples: [{ path: 'src/a.ts', content: 'aaaaa' }],
        negativeSamples: [{ path: 'src/b.ts', content: 'bbbbb' }]
      }
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reasons.some((r) => r.includes('Unsafe practice.matcher.contentRegex'))).toBe(true);
  });

  it('blocks RCE via MCP propose_officer_evolution and strips credentials from opted-in benchmark environments', async () => {
    const ws = createTempDir();
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    const rceMarker = path.join(ws, 'rce-pwned.txt');

    // 1. Real MCP stdio subprocess MUST permanently deny shell benchmark execution
    const child = spawn(process.execPath, [CLI_BIN, 'mcp', '--workspace', ws], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const rl = readline.createInterface({ input: child.stdout });
    const responses: Array<Record<string, unknown>> = [];
    const pending = new Map<number, (msg: Record<string, unknown>) => void>();

    rl.on('line', (line) => {
      if (!line.trim()) return;
      const parsed = JSON.parse(line) as Record<string, unknown>;
      responses.push(parsed);
      const id = parsed.id as number | undefined;
      if (id !== undefined && pending.has(id)) {
        pending.get(id)!(parsed);
        pending.delete(id);
      }
    });

    const rpc = (id: number, method: string, params?: Record<string, unknown>) =>
      new Promise<Record<string, unknown>>((resolve) => {
        pending.set(id, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });

    try {
      await rpc(1, 'initialize', { protocolVersion: '2024-11-05' });
      const res = await rpc(2, 'tools/call', {
        name: 'propose_officer_evolution',
        arguments: {
          officer: 'engineering',
          practice: {
            id: 'eng-rce-attempt',
            title: 'Attempt shell exec via MCP',
            category: 'operations',
            description: 'Should never execute',
            ruleType: 'process',
            targetKpi: 'runtime_readiness_score',
            evidenceSummary: 'RCE test',
            evidenceSources: ['mcp-adversarial']
          },
          proof: {
            kind: 'empirical_benchmark',
            sources: ['mcp-adversarial'],
            methodology: 'Attempt to spawn shell command via MCP tool',
            reproducibleCommand: `node -e 'require("fs").writeFileSync(${JSON.stringify(rceMarker)}, "pwned"); console.log(JSON.stringify({kpiBefore:50,kpiAfter:90}))'`
          }
        }
      });

      const content = (res.result as { content: Array<{ text: string }> }).content[0]!.text;
      const verdict = JSON.parse(content) as { accepted: boolean; reasons: string[] };
      expect(verdict.accepted).toBe(false);
      expect(verdict.reasons.some((r) => r.includes('disabled by default'))).toBe(true);
      expect(fs.existsSync(rceMarker)).toBe(false);
    } finally {
      rl.close();
      child.kill();
    }

    // 2. Opted-in benchmark execution strips secret env vars from child process
    const envCheckScript = path.join(ws, 'check-env.mjs');
    fs.writeFileSync(
      envCheckScript,
      `const leaked = Boolean(process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY || process.env.JIRA_API_TOKEN);
       console.log(JSON.stringify({ kpiBefore: 60, kpiAfter: leaked ? 50 : 85 }));\n`
    );

    const prevGh = process.env.GITHUB_TOKEN;
    const prevOpenAi = process.env.OPENAI_API_KEY;
    process.env.GITHUB_TOKEN = 'ghp_testsecretvalue12345678901234567890';
    process.env.OPENAI_API_KEY = 'sk-testsecretvalue12345678901234567890';
    try {
      const verdict = agent.proposeKnowledgeUpdate(
        {
          officer: 'engineering',
          practice: {
            id: 'eng-sanitized-env-verified',
            title: 'Verify benchmark runs with credential-stripped env',
            category: 'operations',
            description: 'Ensures secrets are not inherited by benchmark subprocesses',
            ruleType: 'process',
            targetKpi: 'runtime_readiness_score',
            evidenceSummary: 'Verified clean child env',
            evidenceSources: ['check-env.mjs']
          },
          proof: {
            kind: 'empirical_benchmark',
            sources: ['check-env.mjs'],
            methodology: 'Inspects child process env for stripped credentials',
            reproducibleCommand: `"${process.execPath}" "${envCheckScript}"`
          }
        },
        { allowCommandExecution: true }
      );
      expect(verdict.accepted).toBe(true);
      expect(verdict.measuredKpiDelta).toBe(25);
    } finally {
      if (prevGh === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = prevGh;
      if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevOpenAi;
    }
  });

  it('self-heals crashed head.json lags, invalidates stale projection schemas, and guarantees ULID monotonicity under backward clock skew', async () => {
    const ws = createTempDir();
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    const ev1 = agent.recordThinking({ thought: 'Before crash' });
    const ev2 = agent.recordThinking({ thought: 'Written right before power loss' });

    // Simulate crash window: roll back head.json to ev1 while ev2 already exists on disk!
    const headPath = path.join(agent.store.streamDir, 'head.json');
    fs.writeFileSync(
      headPath,
      JSON.stringify({ lastSeq: ev1.seq, lastEventId: ev1.id, lastHash: ev1.hash }, null, 2)
    );

    // Next append MUST self-heal head from ev2 and chain ev3 off ev2.hash!
    const ev3 = agent.recordThinking({ thought: 'After crash recovery' });
    expect(ev3.seq).toBe(ev2.seq + 1);
    expect(ev3.prevHash).toBe(ev2.hash);

    const integrity = await agent.verifyIntegrity(false);
    expect(integrity.valid).toBe(true);

    // Projection schema version check: stale cached projection (version 1) rebuilds cleanly
    const state = agent.getState();
    expect(state.projectionVersion).toBe(PROJECTION_VERSION);
    const snapshotPath = path.join(agent.store.projectionsDir, 'state.json');
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify({ ...state, projectionVersion: 1, harnessesSeen: ['stale-corrupt'] })
    );
    const rebuilt = agent.getState();
    expect(rebuilt.projectionVersion).toBe(PROJECTION_VERSION);
    expect(rebuilt.harnessesSeen).not.toContain('stale-corrupt');

    // Backward NTP clock skew still yields strictly monotonically increasing ULIDs
    const u1 = generateUlid(1_700_000_010_000);
    const u2 = generateUlid(1_700_000_000_000); // 10 seconds backwards!
    const u3 = generateUlid(1_699_999_999_000);
    expect(u2 > u1).toBe(true);
    expect(u3 > u2).toBe(true);
  });

  it('bounds multi-MB command output, kills timed-out process trees, serializes concurrent syncPush, and prevents PID-reuse daemon kills', async () => {
    const ws = createTempDir();
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    // 1. Bounded stdout capture prevents OOM
    const bigRes = await agent.runCommand({
      command: `node -e 'process.stdout.write("A".repeat(250_000))'`,
      silent: true,
      maxCaptureBytes: 8192
    });
    expect(bigRes.exitCode).toBe(0);
    expect(bigRes.stdoutTruncatedBytes).toBeGreaterThan(200_000);
    expect(bigRes.stdout.length).toBeLessThan(12_000);

    // 2. Process-group timeout kills hanging command quickly instead of stalling
    const t0 = Date.now();
    const timedOutRes = await agent.runCommand({
      command: `node -e 'setTimeout(() => {}, 30000)'`,
      silent: true,
      timeoutMs: 250
    });
    expect(timedOutRes.timedOut).toBe(true);
    expect(timedOutRes.endEvent.type).toBe('exec.crashed');
    expect(Date.now() - t0).toBeLessThan(5000);

    // 3. Concurrent PersistenceFabric.syncPush calls serialize cleanly with zero duplicate remote issues
    const dirStore = createTempDir('n1-concurrent-sync-');
    const cfg = agent.store.readConfig()!;
    cfg.persistence.directory = { enabled: true, targetDir: dirStore, projectKey: 'LOCK' };
    agent.store.writeConfig(cfg);
    agent.persistence.loadAdaptersFromConfig(cfg);
    agent.openIssue({ title: 'Issue for concurrent sync test', description: 'Must not duplicate', kind: 'bug', priority: 'high' });

    const [r1, r2] = await Promise.all([agent.syncPush(), agent.syncPush()]);
    const c1 = r1[0]?.pushedCount ?? 0;
    const c2 = r2[0]?.pushedCount ?? 0;
    const issueFiles = fs.readdirSync(path.join(dirStore, 'issues')).filter((f) => f.endsWith('.json'));
    expect(issueFiles.length).toBeGreaterThan(0);
    // One call pushed all unsynced primary events, the serialized second call pushed 0 duplicates
    expect(Math.max(c1, c2)).toBeGreaterThan(0);
    expect(Math.min(c1, c2)).toBe(0);
    expect(issueFiles.length).toBe(c1 + c2);

    // 4. WatcherDaemonManager real detached start -> status -> stop lifecycle
    const started = agent.daemon.startDetached(CLI_BIN);
    try {
      expect(started.running).toBe(true);
      expect(started.pid).toBeGreaterThan(0);
      await new Promise((r) => setTimeout(r, 250));
      const liveStatus = agent.daemon.getStatus();
      expect(liveStatus.running).toBe(true);
      expect(liveStatus.pid).toBe(started.pid);
    } finally {
      const stopped = agent.daemon.stop();
      expect(stopped.stopped).toBe(true);
    }

    // 5. WatcherDaemonManager refuses to kill an unrelated PID on PID reuse
    const pidFile = path.join(agent.store.rootDir, 'daemon.pid');
    fs.writeFileSync(
      pidFile,
      JSON.stringify({
        pid: process.pid, // current vitest worker, NOT Number One watch daemon!
        workspaceRoot: ws,
        startedAt: new Date().toISOString(),
        marker: 'numberone-watch-daemon'
      })
    );
    const status = agent.daemon.getStatus();
    expect(status.running).toBe(false);
    const stopRes = agent.daemon.stop();
    expect(stopRes.stopped).toBe(false);
    expect(stopRes.reason).toContain('not a Number One watcher');
  });

  it('blocks CLI prototype pollution, validates flags, and retries transient HTTP failures against a real local server', async () => {
    const ws = createTempDir();
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    // CLI prototype pollution & input validation
    const protoCode = await runCli(['status', '--workspace', ws, '--__proto__=polluted']);
    expect(protoCode).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    expect(await runCli(['replay', '--workspace', ws, '--until-seq', 'notanumber'])).toBe(1);
    expect(await runCli(['record', '--workspace', ws, '--type', 'fake.event', '--summary', 'bad'])).toBe(1);
    expect(
      await runCli([
        'record',
        '--workspace',
        ws,
        '--type',
        'chat.thinking',
        '--summary',
        'bad payload',
        '--payload',
        '[1,2,3]'
      ])
    ).toBe(1);

    // URL scheme validation
    expect(() => validateHttpUrl('file:///etc/passwd')).toThrow(/Unsupported URL protocol/);
    expect(() => validateHttpUrl('javascript:alert(1)')).toThrow();

    // Real local HTTP server testing 503 retry + timeout abort (zero fetch mocks!)
    let retryAttempts = 0;
    const server = http.createServer((req, res) => {
      if (req.url === '/flaky') {
        retryAttempts++;
        if (retryAttempts === 1) {
          res.writeHead(503, { 'Retry-After': '0' });
          res.end('temporary overload');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, attempts: retryAttempts }));
        return;
      }
      if (req.url === '/slow') {
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200);
            res.end('too late');
          }
        }, 1000);
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    try {
      // SSRF protection: private/loopback/metadata hosts and redirects MUST be blocked by default!
      await expect(
        resilientFetch(`http://127.0.0.1:${port}/flaky`, { maxRetries: 0, timeoutMs: 1000 })
      ).rejects.toThrow(/HTTPS|SSRF|private|loopback/i);
      expect(() => validateHttpUrl('https://169.254.169.254/latest/meta-data/')).toThrow(
        /SSRF|private|metadata/i
      );

      // Explicit local opt-in works cleanly for local dev/test servers
      const okRes = await resilientFetch(`http://127.0.0.1:${port}/flaky`, {
        method: 'GET',
        allowPrivateHosts: true,
        maxRetries: 2,
        baseDelayMs: 25,
        timeoutMs: 2000
      });
      expect(okRes.status).toBe(200);
      const body = (await okRes.json()) as { ok: boolean; attempts: number };
      expect(body.ok).toBe(true);
      expect(body.attempts).toBe(2);

      await expect(
        resilientFetch(`http://127.0.0.1:${port}/slow`, {
          method: 'GET',
          allowPrivateHosts: true,
          maxRetries: 0,
          timeoutMs: 120
        })
      ).rejects.toThrow();
    } finally {
      server.close();
    }
  });

  it('enforces Round 2 BMAD security, SoR durability, AuthorityEngine, MCP, and CLI guarantees', async () => {
    // 1. Canonical JSON matches JSON.stringify semantics for arrays, Dates, and undefined/function values
    const dt = new Date('2026-11-22T00:00:00.000Z');
    expect(canonicalJson({ arr: [1, undefined, Number.NaN, dt], drop: undefined })).toBe(
      JSON.stringify({ arr: [1, null, null, dt.toISOString()] })
    );

    // 2. Linear-time DP glob matching & tightened ReDoS detection
    expect(matchGlobLinear('a'.repeat(40) + 'b', '*a*a*a*a*a*a*a*a*c')).toBe(false);
    expect(matchGlobLinear('src/core/hash.ts', 'src/**/*.ts')).toBe(true);
    expect(validateRegexSafety('(a?a?)+').safe).toBe(false);
    expect(validateRegexSafety('(?<=foo)bar').safe).toBe(false);
    expect(validateRegexSafety('.*.+').safe).toBe(false);

    // 3. Expanded secret redaction (JSON quoted password, truncated PEM, GitLab, npm, Azure SAS)
    const fakeJsonSecret = JSON.stringify({ 'api-key': 'superSecretValue987654321' });
    expect(redactSecrets(fakeJsonSecret)).not.toContain('superSecretValue987654321');
    expect(redactSecrets('-----BEGIN ' + 'PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEF')).toContain(
      '[REDACTED:PRIVATE_KEY]'
    );
    expect(redactSecrets('token glpat-abcdefghijklmnopqrstuvwx')).toContain('[REDACTED:GITLAB_TOKEN]');
    expect(
      redactSecrets('https://acct.blob.core.windows.net/c/b?sv=2022&sig=abcDEF123456789012345678%3D')
    ).toContain('[REDACTED:AZURE_SAS]');

    // 4. Fail-closed tip validation + Object.prototype pollution immunity + L4 actor privilege boundaries
    const ws = createTempDir('n1-round2-sec-');
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    const dirEv = agent.issueDirective({
      title: 'No open ingress or eval',
      directive: 'Never expose 0.0.0.0/0 or call child_process.exec or eval()',
      rationale: 'Security invariant',
      scopePaths: ['src/server.ts'],
      forbiddenPatterns: ['0\\.0\\.0\\.0/0', 'eval\\s*\\('],
      severity: 'blocking'
    });
    const dirId = String(dirEv.payload.directiveId);

    // Attempt Object.prototype pollution via malicious directiveId/lessonId
    agent.recordEvent({
      type: 'lesson.captured',
      actor: { kind: 'human', id: 'tester' },
      summary: 'Proto key attempt',
      payload: { lessonId: '__proto__', title: 'evil' }
    });
    // Attempt L4 ai-agent trying to supersede an authoritative L2 directive
    agent.recordEvent({
      type: 'directive.superseded',
      actor: { kind: 'ai-agent', id: 'rogue-session' },
      summary: 'Attempt to disable blocking directive',
      payload: { directiveId: dirId, supersededBy: 'fake' }
    });
    const state = agent.replay({ persistSnapshot: true });
    expect(({} as Record<string, unknown>).title).toBeUndefined();
    expect(state.directives[dirId]?.active).toBe(true);

    // 5. AuthorityEngine: dots in 0.0.0.0/0 preserved; "Avoid X by using eval()" NOT bypassed!
    const bypassAttempt = agent.arbitrate(
      {
        action: 'Patch server',
        intent: 'Avoid crashes by using eval(req.body)',
        targetPaths: ['src/server.ts'],
        proposedApproach: 'Avoid crashes by using eval(req.body) and bind 0.0.0.0/0'
      },
      { recordAuditEvent: false }
    );
    expect(bypassAttempt.verdict).toBe('BLOCK');

    const safeCompliance = agent.arbitrate(
      {
        action: 'Harden server',
        intent: 'Use parameterized handler instead of eval()',
        targetPaths: ['src/server.ts'],
        proposedApproach: 'Use strict JSON schema parser instead of eval() and bind 127.0.0.1'
      },
      { recordAuditEvent: false }
    );
    expect(safeCompliance.verdict).not.toBe('BLOCK');

    // 6. Fail-closed tampered tip refusal on next append (both corrupt JSON AND valid-JSON hash tamper!)
    const eventsDir = path.join(ws, '.numberone/stream/events');
    const eventFiles = fs.readdirSync(eventsDir).sort();
    const tipPath = path.join(eventsDir, eventFiles[eventFiles.length - 1]!);
    const tipOriginal = fs.readFileSync(tipPath, 'utf8');
    fs.writeFileSync(tipPath, tipOriginal.replace('"summary":', '"summary": INVALID'));
    expect(() =>
      agent.recordThinking({ thought: 'Should refuse appending onto corrupt tip' })
    ).toThrow(/Stream integrity violation/i);
    // Valid JSON with tampered summary (invalid SHA-256 hash) must ALSO fail closed!
    const parsedTip = JSON.parse(tipOriginal) as Record<string, unknown>;
    parsedTip.summary = 'SILENTLY TAMPERED SUMMARY';
    fs.writeFileSync(tipPath, JSON.stringify(parsedTip, null, 2));
    expect(() =>
      agent.recordThinking({ thought: 'Should refuse appending onto hash-tampered tip' })
    ).toThrow(/Stream integrity violation/i);
    // Restore tip so subsequent checks stay valid
    fs.writeFileSync(tipPath, tipOriginal);

    // 7. CLI boolean flag parsing: `attach --json /path` MUST NOT swallow `/path` into `--json`!
    const parsedAttach = parseCliArgs(['attach', '--json', '/tmp/my-workspace']);
    expect(parsedAttach.flags.json).toBe(true);
    expect(parsedAttach.positionals).toEqual(['/tmp/my-workspace']);

    // 8. CLI shell-free `exec -- node -e ...` preserves quotes/spaces without double-shell expansion
    const execCode = await runCli([
      'exec',
      '--workspace',
      ws,
      '--json',
      '--',
      process.execPath,
      '-e',
      'console.log("hello $USER && safe")'
    ]);
    expect(execCode).toBe(0);
    const lastEv = agent.store.readAllEvents().at(-1);
    expect(String(lastEv?.payload.stdoutExcerpt ?? '')).toContain('hello $USER && safe');

    // 9. MCP L4 privilege boundary + pre-newline >maxLineBytes frame drop
    const child = spawn(process.execPath, [CLI_BIN, 'mcp', '--workspace', ws], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const rl = readline.createInterface({ input: child.stdout });
    const responses: Array<Record<string, unknown>> = [];
    const pending = new Map<number, (msg: Record<string, unknown>) => void>();
    rl.on('line', (line) => {
      if (!line.trim()) return;
      const parsed = JSON.parse(line) as Record<string, unknown>;
      responses.push(parsed);
      const id = parsed.id as number | undefined;
      if (typeof id === 'number' && pending.has(id)) {
        pending.get(id)!(parsed);
        pending.delete(id);
      }
    });
    const rpc = (id: number, method: string, params?: Record<string, unknown>) =>
      new Promise<Record<string, unknown>>((resolve) => {
        pending.set(id, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    try {
      const forged = await rpc(1, 'tools/call', {
        name: 'record_stream_event',
        arguments: { type: 'directive.superseded', summary: 'forged supersede' }
      });
      expect(forged.error).toBeDefined();
      expect(String((forged.error as { message: string }).message)).toContain('privileged');

      const advisoryDir = await rpc(2, 'tools/call', {
        name: 'issue_directive',
        arguments: {
          title: 'MCP attempt',
          directive: 'Try to block',
          rationale: 'Session note',
          severity: 'blocking'
        }
      });
      const issuedText = (advisoryDir.result as { content: Array<{ text: string }> }).content[0]!.text;
      const issuedEvent = JSON.parse(issuedText) as { actor: { kind: string }; payload: { severity: string } };
      expect(issuedEvent.actor.kind).toBe('ai-agent');
      expect(issuedEvent.payload.severity).toBe('advisory');
    } finally {
      rl.close();
      child.kill('SIGTERM');
    }
  });

  it('executes BMAD Party Mode Round 2 peer challenge verification, decisionMatrix, ranked remediationPlan, and auto-supersedes remediation gates on APPROVE', async () => {
    const ws = createTempDir('n1-bmad-round2-');
    fs.mkdirSync(path.join(ws, 'src'), { recursive: true });
    fs.mkdirSync(path.join(ws, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(ws, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(ws, 'package.json'),
      JSON.stringify({
        name: 'bmad-test-app',
        engines: { node: '>=22.0.0' },
        scripts: { build: 'echo build', test: 'echo test' }
      })
    );
    fs.writeFileSync(path.join(ws, 'package-lock.json'), '{"lockfileVersion":3}');
    fs.writeFileSync(path.join(ws, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}');
    fs.writeFileSync(path.join(ws, 'SECURITY.md'), '# Security Policy\nTrust boundaries.\n');
    fs.writeFileSync(path.join(ws, 'CHANGELOG.md'), '# Changelog\n## 1.0.0\n');
    fs.writeFileSync(
      path.join(ws, 'README.md'),
      '# App\n'.repeat(20) + '\nBuild, install, run, deploy, verify, recovery. Credentials and environment tokens.\n'
    );
    fs.writeFileSync(path.join(ws, 'tests/unit.test.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(ws, 'tests/e2e.test.ts'), 'export const b = 1;\n');
    // Intentionally insecure Dockerfile (runs as root) + unpinned GHA workflow -> triggers HOLD + blocking directive!
    fs.writeFileSync(path.join(ws, 'Dockerfile'), 'FROM node:22-alpine\nCMD ["node", "index.js"]\n');
    fs.writeFileSync(
      path.join(ws, '.github/workflows/ci.yml'),
      'on:\n  push:\n    branches: [main]\npermissions:\n  contents: read\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\n      - run: npm run build && npm test && npm audit\n'
    );
    fs.writeFileSync(path.join(ws, 'src/app.ts'), 'export const x = process.env.CUSTOM_API_URL;\n');

    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    // Record a related lesson & open issue on Dockerfile to verify SoR precedent correlation
    agent.captureLesson({
      title: 'Always run Docker containers as non-root USER',
      problem: 'Container ran as root',
      rootCause: 'Missing USER directive in Dockerfile',
      resolution: 'Added USER node',
      preventionRule: 'Always specify USER node in final Dockerfile stage',
      affectedPaths: ['Dockerfile'],
      severity: 'high'
    });

    // Session 1: HOLD — Security blocks root Dockerfile, Engineering challenges Security on undocumented env var,
    // Security REBUTS secret exposure via passing sec-no-hardcoded-secrets check!
    const holdSession = await agent.assembleCrew({
      topic: 'Release readiness check',
      mode: 'roundtable'
    });
    expect(holdSession.consensusReached).toBe(false);
    expect(holdSession.issuedDirectiveId).toBeTruthy();
    expect(holdSession.decisionMatrix).toHaveLength(3);
    expect(holdSession.decisionMatrix.find((r) => r.officer === 'security')?.domainGate).toBe('BLOCK');
    expect(holdSession.remediationPlan.length).toBeGreaterThan(0);
    expect(holdSession.remediationPlan[0]!.blocksRelease).toBe(true);
    expect(holdSession.correlatedPrecedents.lessonIds.length).toBeGreaterThanOrEqual(1);
    expect(
      holdSession.challengeResolutions.some(
        (r) =>
          r.fromOfficer === 'engineering' &&
          r.targetOfficer === 'security' &&
          r.status === 'REBUTTED_BY_EVIDENCE'
      )
    ).toBe(true);
    expect(
      holdSession.challengeResolutions.some(
        (r) =>
          r.fromOfficer === 'security' &&
          r.targetOfficer === 'bridge' &&
          r.status === 'CONFIRMED'
      )
    ).toBe(true);

    // Verify specialist mode returns strictly 1 specialist officer
    const specSession = await agent.assembleCrew({
      topic: 'Security audit for secrets and TLS',
      mode: 'specialist'
    });
    expect(specSession.assembledOfficers).toEqual(['security']);

    // Now remediate the blocking Dockerfile root issue -> Session 2 reaches APPROVE and AUTO-SUPERSEDES the blocking gate!
    fs.writeFileSync(
      path.join(ws, 'Dockerfile'),
      'FROM node:22-alpine\nUSER node\nCMD ["node", "index.js"]\n'
    );
    const approveSession = await agent.assembleCrew({
      topic: 'Release readiness check',
      mode: 'roundtable'
    });
    expect(approveSession.consensusReached).toBe(true);
    expect(approveSession.vetoes).toHaveLength(0);
    expect(approveSession.supersededDirectiveIds).toContain(holdSession.issuedDirectiveId);
    const finalState = agent.getState();
    expect(finalState.directives[holdSession.issuedDirectiveId!]?.active).toBe(false);
  });

  it('enforces linear-time redaction, HTML comment neutralization, embedded meta parsing, and LLM model sanitization', () => {
    // 1. Slack webhook redaction works in linear time without unanchored URL regexes
    const syntheticWebhook = ['https://hooks.slack.com/services/', 'T0001/', 'B0002/', 'abcDEF123'].join('');
    expect(redactSecrets(`notify=${syntheticWebhook} ok`)).toBe('notify=[REDACTED:SLACK_WEBHOOK] ok');
    expect(redactSecrets('https://hooks.slack.com/services/incomplete')).toBe(
      'https://hooks.slack.com/services/incomplete'
    );

    // 2. isSensitiveSecretFile covers all secret classes and runs in O(n) on pathological paths
    expect(isSensitiveSecretFile('certs/prod.pem')).toBe(true);
    expect(isSensitiveSecretFile('keys/service-account-prod.json')).toBe(true);
    expect(isSensitiveSecretFile('home/.aws/credentials')).toBe(true);
    expect(isSensitiveSecretFile('.kube/config')).toBe(true);
    expect(isSensitiveSecretFile('.docker/config.json')).toBe(true);
    expect(isSensitiveSecretFile('.env.sample')).toBe(false);
    expect(isSensitiveSecretFile('.env.template')).toBe(false);
    const tSens = Date.now();
    expect(isSensitiveSecretFile('/a'.repeat(50_000))).toBe(false);
    expect(Date.now() - tSens).toBeLessThan(150);

    // 3. GitHub issue body escapes both --> and --!> and parseGitHubEmbeddedMeta runs in O(n)
    const ws = createTempDir('n1-codeql-reg-');
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });
    const ev = agent.recordEvent({
      type: 'chat.thinking',
      actor: { kind: 'ai-agent', id: 'tester' },
      summary: 'Test HTML comment terminator neutralization',
      payload: { note: 'close1 --> and close2 --!> inside payload' }
    });
    const body = buildGitHubIssueBody(ev, []);
    expect(body).toContain('--\\>');
    expect(body).toContain('--!\\>');
    const parsed = parseGitHubEmbeddedMeta(
      `<!-- noise <!-- numberone:event {"eventId":"spoof"} -->\n${body}`
    );
    expect(parsed?.eventId).toBe(ev.id);

    const tMeta = Date.now();
    expect(parseGitHubEmbeddedMeta('<!--numberone:event {{'.repeat(10_000))).toBeNull();
    expect(Date.now() - tMeta).toBeLessThan(150);

    // 4. AuthorityEngine strips trailing (failed: ...) notes in linear time
    agent.recordFailedAttempt({
      approach: 'retry old approach (failed: timeout)',
      reason: 'timeout'
    });
    const tAuth = Date.now();
    const arb = agent.arbitrate({
      action: `${' '.repeat(20_000)}${'(failed:'.repeat(5_000)}`,
      intent: 'verify linear authority parsing'
    });
    expect(Date.now() - tAuth).toBeLessThan(250);
    expect(arb.verdict).toBe('APPROVE');

    // 5. LLM model identifier allowlist accepts valid models and falls back on unsafe values
    expect(sanitizeModelIdentifier('Qwen/Qwen2.5-Coder-32B-Instruct', 'fallback')).toBe(
      'Qwen/Qwen2.5-Coder-32B-Instruct'
    );
    expect(sanitizeModelIdentifier('llama3.2:latest', 'fallback')).toBe('llama3.2:latest');
    expect(sanitizeModelIdentifier('bad\nmodel;injection', 'gpt-4o-mini')).toBe('gpt-4o-mini');
    expect(sanitizeModelIdentifier('../etc/passwd', 'gpt-4o-mini')).toBe('gpt-4o-mini');
    expect(sanitizeModelIdentifier('a'.repeat(200), 'gpt-4o-mini')).toBe('gpt-4o-mini');
  });
});
