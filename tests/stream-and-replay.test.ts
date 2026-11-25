import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReplayEngine } from '../src/core/replay-engine.js';
import { StreamStore } from '../src/core/stream-store.js';

const tmpDirs: string[] = [];
const CLI_BIN = path.resolve(process.cwd(), 'dist/cli.js');

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-stream-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('StreamStore, Cross-Process Locking & Deterministic ReplayEngine', () => {
  it('stores discrete atomic hash-chained event files and content-addressed fallback blobs', () => {
    const ws = createTempWorkspace();
    const store = new StreamStore(ws);
    store.init({ workspaceName: 'alpha-project' });

    const e1 = store.append({
      type: 'workspace.attached',
      actor: { kind: 'numberone', id: 'numberone' },
      harness: 'cli',
      summary: 'Attached workspace'
    });

    const e2 = store.append({
      type: 'fs.created',
      actor: { kind: 'watcher', id: 'fs-watcher' },
      harness: 'watcher',
      summary: 'Created src/app.ts',
      affectedPaths: ['src/app.ts'],
      payload: { path: 'src/app.ts', contentHash: 'abc123' },
      fallbackBlobs: [
        { key: 'snapshot', content: 'export const x = 42;\n', contentType: 'text/plain' }
      ]
    });

    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(e2.prevHash).toBe(e1.hash);
    expect(e2.blobs).toHaveLength(1);
    expect(e2.blobs[0]!.uri).toMatch(/^n1:\/\/fallback\/[a-f0-9]{64}$/);
    expect(store.readBlobUtf8(e2.blobs[0]!.sha256)).toBe('export const x = 42;\n');

    const integrity = store.verifyIntegrity();
    expect(integrity.valid).toBe(true);
    expect(integrity.totalEvents).toBe(2);
    expect(integrity.verifiedBlobs).toBe(1);
  });

  it('maintains contiguous sequence numbers and unbroken SHA-256 hash chain under parallel multi-process writes', async () => {
    const ws = createTempWorkspace();
    const store = new StreamStore(ws);
    store.init({ workspaceName: 'concurrent-project' });

    const workerCount = 6;
    const eventsPerWorker = 4;

    await Promise.all(
      Array.from({ length: workerCount }, (_, wIdx) =>
        new Promise<void>((resolve, reject) => {
          const script = `
            for (let i = 0; i < ${eventsPerWorker}; i++) {
              const r = require('node:child_process').spawnSync(
                process.execPath,
                [${JSON.stringify(CLI_BIN)}, 'think', 'Worker ${wIdx} event ' + i, '--workspace', ${JSON.stringify(ws)}],
                { encoding: 'utf8' }
              );
              if (r.status !== 0) {
                console.error(r.stderr);
                process.exit(1);
              }
            }
          `;
          const child = spawn(process.execPath, ['-e', script], { stdio: 'pipe' });
          let err = '';
          child.stderr.on('data', (d) => (err += d.toString()));
          child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Worker ${wIdx} failed: ${err}`));
          });
        })
      )
    );

    const check = store.verifyIntegrity();
    expect(check.valid).toBe(true);
    expect(check.errors).toEqual([]);
    expect(check.totalEvents).toBe(workerCount * eventsPerWorker);
  });

  it('detects tampering in event files and missing fallback blobs', () => {
    const ws = createTempWorkspace();
    const store = new StreamStore(ws);
    store.init();

    const e1 = store.append({
      type: 'lesson.captured',
      actor: { kind: 'numberone', id: 'numberone' },
      summary: 'Never disable TLS',
      payload: { title: 'TLS rule', preventionRule: 'Keep TLS on' },
      fallbackBlobs: [{ key: 'rawLog', content: 'TLS error trace' }]
    });

    expect(store.verifyIntegrity().valid).toBe(true);

    const file = path.join(store.eventsDir, store.listEventFiles()[0]!);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    parsed.summary = 'TAMPERED SUMMARY';
    fs.writeFileSync(file, JSON.stringify(parsed, null, 2));

    const tamperedCheck = store.verifyIntegrity();
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.errors.some((e) => e.includes('Tampered event'))).toBe(true);

    const blobPath = path.join(store.blobsDir, e1.blobs[0]!.sha256);
    fs.unlinkSync(blobPath);
    const missingBlobCheck = store.verifyIntegrity();
    expect(missingBlobCheck.valid).toBe(false);
    expect(missingBlobCheck.missingBlobs).toHaveLength(1);
  });

  it('rebuilds identical state deterministically from zero and supports time-travel replay', () => {
    const ws = createTempWorkspace();
    const store = new StreamStore(ws);
    const replay = new ReplayEngine(store);
    store.init();

    store.append({
      type: 'fs.created',
      actor: { kind: 'human', id: 'alice' },
      harness: 'cursor',
      sessionId: 'sess-1',
      summary: 'Created index.ts',
      affectedPaths: ['src/index.ts'],
      payload: { path: 'src/index.ts', contentHash: 'h1' }
    });

    store.append({
      type: 'issue.opened',
      actor: { kind: 'human', id: 'alice' },
      harness: 'cursor',
      sessionId: 'sess-1',
      summary: 'Memory leak in worker',
      payload: { issueId: 'iss-1', title: 'Memory leak', kind: 'bug', priority: 'high' }
    });

    store.append({
      type: 'issue.resolved',
      actor: { kind: 'ai-agent', id: 'claude' },
      harness: 'claude-code',
      sessionId: 'sess-2',
      summary: 'Fixed memory leak',
      payload: { issueId: 'iss-1', resolution: 'Cleared interval on shutdown' }
    });

    const full1 = replay.replay({ persistSnapshot: true });
    expect(full1.lastSeq).toBe(3);
    expect(full1.issues['iss-1']?.status).toBe('resolved');
    expect(full1.harnessesSeen).toEqual(['cursor', 'claude-code']);

    fs.rmSync(store.projectionsDir, { recursive: true, force: true });
    const full2 = replay.replay();
    expect(full2).toEqual(full1);

    const past = replay.replay({ untilSeq: 2 });
    expect(past.lastSeq).toBe(2);
    expect(past.issues['iss-1']?.status).toBe('open');
    expect(past.harnessesSeen).toEqual(['cursor']);
  });
});
