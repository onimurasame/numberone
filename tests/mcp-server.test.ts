import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { afterEach, describe, expect, it } from 'vitest';

const tmpDirs: string[] = [];
const CLI_BIN = path.resolve(process.cwd(), 'dist/cli.js');

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-mcp-stdio-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('NumberOneMcpServer (Real Subprocess Stdio Wire Transport)', () => {
  it('communicates over real stdin/stdout pipes with serialized JSON-RPC 2.0 responses', async () => {
    const ws = createTempWorkspace();
    fs.writeFileSync(
      path.join(ws, 'package.json'),
      JSON.stringify({ name: 'mcp-wire-test', scripts: { test: 'echo ok' } })
    );

    const child = spawn(process.execPath, [CLI_BIN, 'mcp', '--workspace', ws], {
      cwd: ws,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    const pending = new Map<number, (msg: any) => void>();

    rl.on('line', (line) => {
      const parsed = JSON.parse(line);
      if (typeof parsed.id === 'number' && pending.has(parsed.id)) {
        const resolve = pending.get(parsed.id)!;
        pending.delete(parsed.id);
        resolve(parsed);
      }
    });

    const sendRpc = (id: number, method: string, params?: Record<string, unknown>) =>
      new Promise<any>((resolve) => {
        pending.set(id, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });

    try {
      const init = await sendRpc(1, 'initialize');
      expect(init.result.serverInfo.name).toBe('numberone');

      // Send notification (must not produce an error or break framing)
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

      // Send concurrent burst of tool & resource calls over the wire to verify sequential queue safety
      const [toolsRes, lessonRes, arbRes, briefRes, verifyRes] = await Promise.all([
        sendRpc(2, 'tools/list'),
        sendRpc(3, 'tools/call', {
          name: 'capture_lesson',
          arguments: {
            title: 'Enable SQLite WAL mode',
            problem: 'SQLITE_BUSY under concurrent writes',
            rootCause: 'Default rollback journal',
            failedApproaches: ['adding random sleep retries in query wrapper'],
            resolution: 'PRAGMA journal_mode=WAL',
            preventionRule: 'Enable WAL mode on connection open',
            affectedPaths: ['src/db.ts'],
            severity: 'high'
          }
        }),
        sendRpc(4, 'tools/call', {
          name: 'arbitrate_action',
          arguments: {
            action: 'Fix SQLITE_BUSY',
            intent: 'Stop busy errors',
            targetPaths: ['src/db.ts'],
            proposedApproach: 'Fix by adding random sleep retries in query wrapper'
          }
        }),
        sendRpc(5, 'resources/read', { uri: 'numberone://brief' }),
        sendRpc(6, 'tools/call', {
          name: 'verify_integrity',
          arguments: { verifyRemotes: false }
        })
      ]);

      expect(toolsRes.result.tools.map((t: any) => t.name)).toContain('arbitrate_action');
      expect(JSON.parse(lessonRes.result.content[0].text).type).toBe('lesson.captured');
      expect(JSON.parse(arbRes.result.content[0].text).verdict).toBe('OVERRIDE');
      expect(briefRes.result.contents[0].text).toContain('Enable SQLite WAL mode');
      expect(JSON.parse(verifyRes.result.content[0].text).valid).toBe(true);
    } finally {
      rl.close();
      child.kill('SIGTERM');
    }
  });
});
