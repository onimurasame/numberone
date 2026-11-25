import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NumberOneAgent } from '../src/harness/number-one.js';
import { generateShellHook } from '../src/watchers/command-runner.js';

const tmpDirs: string[] = [];
const CLI_BIN = path.resolve(process.cwd(), 'dist/cli.js');

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-watch-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Workspace Watchers, Real Git Hooks, Safe Shell Hooks & Transcript Ingestor', () => {
  it('populates baseline file hashes, captures live edits/renames/crashes, and computes genuine offline diffs', async () => {
    const ws = createTempWorkspace();
    fs.writeFileSync(path.join(ws, 'app.ts'), 'export const v = 1;\nexport const keep = true;\n');

    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    // Baseline snapshot immediately populates projection.files
    const initialState = agent.getState();
    expect(initialState.files['app.ts']?.status).toBe('exists');
    expect(initialState.files['app.ts']?.lastSnapshotBlobHash).toBeDefined();

    const watcher = agent.createWatcher({ debounceMs: 50 });
    watcher.start();

    // Live edit + crash log + rename
    fs.writeFileSync(path.join(ws, 'to-rename.ts'), 'export const moved = 99;\n');
    await new Promise((r) => setTimeout(r, 150));
    watcher.flushPending();

    fs.renameSync(path.join(ws, 'to-rename.ts'), path.join(ws, 'renamed.ts'));
    fs.writeFileSync(path.join(ws, 'crash-worker.log'), 'FATAL ERROR: Out of memory in worker pool\n');

    await new Promise((r) => setTimeout(r, 180));
    watcher.flushPending();
    watcher.stop();

    const liveEvents = agent.store.readAllEvents();
    const renameEv = liveEvents.find((e) => e.type === 'fs.renamed');
    expect(renameEv).toBeDefined();
    expect(renameEv?.payload.fromPath).toBe('to-rename.ts');
    expect(renameEv?.payload.toPath).toBe('renamed.ts');

    const crashEv = liveEvents.find((e) => e.type === 'exec.crashed');
    expect(crashEv?.summary).toContain('Out of memory');

    // Offline manual modification to baseline file while watcher is stopped
    fs.writeFileSync(path.join(ws, 'app.ts'), 'export const v = 2;\nexport const keep = true;\n');
    const reconciled = agent.reconcileOfflineChanges();
    const offlineMod = reconciled.find(
      (e) => e.type === 'fs.modified' && e.affectedPaths.includes('app.ts')
    );
    expect(offlineMod).toBeDefined();
    // Verifies diff was computed against the stored baseline snapshot, NOT against empty string!
    expect(offlineMod?.payload.linesAdded).toBe(1);
    expect(offlineMod?.payload.linesRemoved).toBe(1);
    expect(String(offlineMod?.payload.diff)).toContain('-export const v = 1;');
    expect(String(offlineMod?.payload.diff)).toContain('+export const v = 2;');
  });

  it('executes real installed .git/hooks/post-commit automatically during git commit', () => {
    const ws = createTempWorkspace();
    execFileSync('git', ['init'], { cwd: ws, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'dev@example.com'], { cwd: ws });
    execFileSync('git', ['config', 'user.name', 'Test Dev'], { cwd: ws });
    fs.writeFileSync(path.join(ws, 'README.md'), '# Demo\n');
    execFileSync('git', ['add', '.'], { cwd: ws });
    execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: ws, stdio: 'ignore' });

    const agent = new NumberOneAgent(ws);
    const attached = agent.attach({ installHooks: true, installShims: true, backfillGitCommits: 10 });
    expect(attached.gitHooksInstalled).toContain('post-commit');
    expect(attached.gitCommitsBackfilled).toBe(1);

    // Run a REAL `git commit` subprocess — the installed shell hook itself must record the commit!
    fs.writeFileSync(path.join(ws, 'feature.ts'), 'export const f = 1;\n');
    execFileSync('git', ['add', 'feature.ts'], { cwd: ws });
    execFileSync('git', ['commit', '-m', 'Add feature via real git hook'], { cwd: ws, stdio: 'ignore' });

    const commitEvents = agent.store.query({ types: ['git.commit'] });
    const hookRecorded = commitEvents.find((e) => e.harness === 'git');
    expect(hookRecorded).toBeDefined();
    expect(hookRecorded?.summary).toContain('Add feature via real git hook');
    expect(hookRecorded?.affectedPaths).toContain('feature.ts');
  });

  it('handles quotes, backslashes, and dollar signs safely in Bash shell hook without repeat firing on empty prompt', () => {
    const ws = createTempWorkspace();
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    const hookScript = generateShellHook('bash', [process.execPath, CLI_BIN]);

    const testScript = [
      hookScript,
      // Prompt 0: passing command
      'true',
      '__n1_prompt_command',
      // Failing command with tricky quotes, backslashes, and $ literal
      `node -e 'const x = "tricky \\"quotes\\" & \\\\backslash $PATH"; process.exit(7);'`,
      '__n1_prompt_command',
      // Empty Enter prompt: no user command ran before __n1_prompt_command -> must NOT re-emit!
      '__n1_prompt_command'
    ].join('\n');

    execFileSync('bash', ['-c', testScript], { cwd: ws, stdio: 'ignore' });

    const failedEvents = agent.store.query({ types: ['exec.failed'] });
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0]!.payload.exitCode).toBe(7);
    expect(String(failedEvents[0]!.payload.command)).toContain('tricky \\"quotes\\" & \\\\backslash $PATH');
  });

  it('ingests JSONL and Markdown transcripts preserving intermediate thinking, dead-ends, lessons, and decisions', () => {
    const ws = createTempWorkspace();
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    const jsonlPath = path.join(ws, 'claude-session.jsonl');
    const jsonlLines = [
      JSON.stringify({
        role: 'assistant',
        thinking: 'Checking src/db.ts pool limits; hypothesis is connection leak under concurrent transactions.',
        content: 'Tried increasing max pool size to 500 but it failed and crashed Postgres memory.'
      }),
      JSON.stringify({
        role: 'assistant',
        content: 'Lesson learned: always release client in finally block in src/db.ts. Decision: adopt pg-pool idle timeout 30s.'
      })
    ].join('\n');
    fs.writeFileSync(jsonlPath, jsonlLines);

    const res = agent.ingestTranscript({ filePath: jsonlPath });
    expect(res.detectedFormat).toBe('jsonl');
    expect(res.thinkingCount).toBe(1);
    expect(res.failedAttemptCount).toBeGreaterThanOrEqual(1);
    expect(res.lessonCount).toBe(1);
    expect(res.decisionCount).toBe(1);
  });
});
