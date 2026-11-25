import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tmpDirs: string[] = [];
const CLI_BIN = path.resolve(process.cwd(), 'dist/cli.js');

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-cli-e2e-'));
  tmpDirs.push(dir);
  return dir;
}

function runCliCmd(ws: string, args: string[]): { status: number; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI_BIN, ...args, '--workspace', ws], {
      cwd: ws,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { status: 0, stdout };
  } catch (err: any) {
    return { status: err.status ?? 1, stdout: String(err.stdout ?? '') + String(err.stderr ?? '') };
  }
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Number One CLI End-to-End Lifecycle', () => {
  it('runs attach -> think -> dead-end -> lesson -> directive -> arbitrate -> party -> documentary -> replay -> verify', () => {
    const ws = createTempWorkspace();
    fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ name: 'e2e-app', scripts: { test: 'echo ok' } }));

    // 1. Attach
    const attach = runCliCmd(ws, ['attach', '--json']);
    expect(attach.status).toBe(0);
    expect(fs.existsSync(path.join(ws, '.numberone/config.json'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws, '.mcp.json'))).toBe(true);

    // 2. Record thinking, dead-end, lesson, directive
    expect(runCliCmd(ws, ['think', 'Investigating retry storm in queue consumer', '--harness', 'claude-code']).status).toBe(0);
    expect(
      runCliCmd(ws, [
        'dead-end',
        '--approach',
        'infinite retry loop without backoff',
        '--reason',
        'amplified outage',
        '--paths',
        'src/queue.ts'
      ]).status
    ).toBe(0);
    expect(
      runCliCmd(ws, [
        'lesson',
        '--title',
        'Always cap retry attempts with jitter',
        '--problem',
        'Queue retry storm exhausted broker connections',
        '--root-cause',
        'Unbounded retry loop in src/queue.ts',
        '--resolution',
        'Added capped exponential backoff with jitter',
        '--prevention',
        'Use bounded exponential backoff with maxRetries <= 5',
        '--failed',
        'infinite retry loop without backoff',
        '--paths',
        'src/queue.ts',
        '--severity',
        'high'
      ]).status
    ).toBe(0);
    expect(
      runCliCmd(ws, [
        'directive',
        '--title',
        'Bounded Exponential Backoff Required',
        '--directive',
        'All queue consumers MUST use bounded exponential backoff with jitter.',
        '--forbid',
        'infinite retry',
        '--paths',
        'src/queue.ts',
        '--severity',
        'blocking'
      ]).status
    ).toBe(0);

    // 3. Arbitrate violating proposal -> returns exit code 2 (BLOCK)
    const arb = runCliCmd(ws, [
      'arbitrate',
      '--action',
      'Add retry to queue',
      '--approach',
      'Use an infinite retry loop for transient errors',
      '--paths',
      'src/queue.ts',
      '--json'
    ]);
    expect(arb.status).toBe(2);
    expect(JSON.parse(arb.stdout).verdict).toBe('BLOCK');

    // 4. Party Mode (BMAD Round 2 structured decisionMatrix + remediationPlan)
    const party = runCliCmd(ws, ['party', '--topic', 'E2E release check', '--json']);
    const partyJson = JSON.parse(party.stdout);
    expect(partyJson.assembledOfficers).toEqual(['engineering', 'security', 'bridge']);
    expect(partyJson.decisionMatrix).toHaveLength(3);
    expect(Array.isArray(partyJson.remediationPlan)).toBe(true);
    expect(Array.isArray(partyJson.challengeResolutions)).toBe(true);

    // 5. Documentary
    const docPath = path.join(ws, 'DOCUMENTARY.md');
    expect(runCliCmd(ws, ['documentary', '--out', docPath]).status).toBe(0);
    const docText = fs.readFileSync(docPath, 'utf8');
    expect(docText).toContain('Bounded Exponential Backoff Required');
    expect(docText).toContain('Always cap retry attempts with jitter');

    // 6. Real Replay (delete state.json and rebuild deterministically via CLI) & Verify Integrity
    fs.rmSync(path.join(ws, '.numberone/projections/state.json'), { force: true });
    const replay = runCliCmd(ws, ['replay', '--json']);
    expect(replay.status).toBe(0);
    const replayedState = JSON.parse(replay.stdout);
    expect(Object.keys(replayedState.lessons).length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(replayedState.directives).length).toBeGreaterThanOrEqual(1);

    const verify = runCliCmd(ws, ['verify', '--local-only', '--json']);
    expect(verify.status).toBe(0);
    expect(JSON.parse(verify.stdout).valid).toBe(true);

    const doctor = runCliCmd(ws, ['doctor', '--json']);
    expect(doctor.status).toBe(0);
    expect(JSON.parse(doctor.stdout).healthy).toBe(true);

    const status = runCliCmd(ws, ['status', '--json']);
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout).head.lastSeq).toBeGreaterThanOrEqual(9);
  });
});
