import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NumberOneAgent } from '../src/harness/number-one.js';

const tmpDirs: string[] = [];

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-authority-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('LessonEngine & Negation-Aware AuthorityEngine', () => {
  it('auto-correlates command failure -> workspace edit -> fix into a verified Lesson Learned', async () => {
    const ws = createTempWorkspace();
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    const flagFile = path.join(ws, 'ready.txt');
    const cmd = `node -e "const fs=require('fs'); if(!fs.existsSync('ready.txt')){ console.error('ERR_MISSING_READY_FLAG'); process.exit(1); } console.log('OK');"`;

    const failRes = await agent.runCommand({ command: cmd, silent: true, harness: 'claude-code' });
    expect(failRes.exitCode).toBe(1);
    expect(failRes.endEvent.type).toBe('exec.failed');

    agent.recordThinking({
      thought: 'Missing ready.txt causes startup check to abort with ERR_MISSING_READY_FLAG',
      harness: 'claude-code'
    });
    agent.recordFailedAttempt({
      approach: 'setting READY=1 environment variable without creating ready.txt',
      reason: 'Script checks filesystem directly, not env var',
      affectedPaths: ['ready.txt'],
      harness: 'claude-code'
    });

    fs.writeFileSync(flagFile, 'ready\n');
    agent.recordEvent({
      type: 'fs.created',
      actor: { kind: 'human', id: 'dev' },
      harness: 'cursor',
      summary: 'Created ready.txt',
      affectedPaths: ['ready.txt'],
      payload: { path: 'ready.txt' }
    });

    const passRes = await agent.runCommand({ command: cmd, silent: true, harness: 'cursor' });
    expect(passRes.exitCode).toBe(0);
    expect(passRes.autoCapturedLesson).toBeDefined();
    expect(passRes.autoCapturedLesson?.type).toBe('lesson.captured');

    const consult = agent.consult({
      errorText: 'ERR_MISSING_READY_FLAG',
      targetPaths: ['ready.txt']
    });
    expect(consult.lessons.length).toBeGreaterThanOrEqual(1);
    expect(consult.lessons[0]!.lesson.affectedPaths).toContain('ready.txt');
  });

  it('blocks repeating failed approaches while NOT falsely blocking negated statements ("Do NOT use...")', () => {
    const ws = createTempWorkspace();
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    agent.captureLesson({
      title: 'Never use raw SQL string interpolation in auth repository',
      problem: 'SQL injection vulnerability found in src/auth/repo.ts',
      rootCause: 'Template literals used for SQL query',
      failedApproaches: ['escaping quotes manually with regex replace'],
      resolution: 'Use parameterized queries ($1, $2)',
      preventionRule: 'Always use parameterized queries in src/auth/repo.ts',
      affectedPaths: ['src/auth/repo.ts'],
      severity: 'critical'
    });

    agent.issueDirective({
      title: 'Mandatory Parameterized Auth Queries',
      directive: 'All database queries under src/auth MUST use parameterized bindings.',
      rationale: 'Prevents CWE-89 SQL injection regressions.',
      scopePaths: ['src/auth'],
      forbiddenPatterns: ['regex.*escap', 'string interpolation'],
      requiredPatterns: ['parameterized'],
      severity: 'blocking'
    });

    // 1. Affirmative attempt to repeat failed approach -> BLOCK
    const badProposal = agent.arbitrate(
      {
        action: 'Fix login query',
        intent: 'Handle apostrophes in emails',
        targetPaths: ['src/auth/repo.ts'],
        proposedApproach: 'Fix by escaping quotes manually with regex replace on email input',
        harness: 'ephemeral-chat'
      },
      { recordAuditEvent: true }
    );

    expect(badProposal.verdict).toBe('BLOCK');
    expect(badProposal.supersedesSessionContext).toBe(true);
    expect(badProposal.conflicts.length).toBeGreaterThanOrEqual(2);

    // 2. Negated warning ("Do NOT use escaping quotes manually with regex replace; use parameterized queries") -> MUST NOT FALSE-BLOCK!
    const negatedCompliantProposal = agent.arbitrate({
      action: 'Fix login query',
      intent: 'Handle apostrophes safely',
      targetPaths: ['src/auth/repo.ts'],
      proposedApproach:
        'Do NOT use escaping quotes manually with regex replace and avoid string interpolation; instead use parameterized query bindings ($1)',
      harness: 'ephemeral-chat'
    });

    expect(negatedCompliantProposal.supersedesSessionContext).toBe(false);
    expect(negatedCompliantProposal.conflicts).toHaveLength(0);
    expect(['APPROVE', 'APPROVE_WITH_CONDITIONS']).toContain(negatedCompliantProposal.verdict);
  });
});
