import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NumberOneAgent } from '../src/harness/number-one.js';

const tmpDirs: string[] = [];

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-crew-test-'));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Bridge Crew Officers & Evidence-Backed Multi-Officer Coordination', () => {
  it('blocks vulnerable/unready workspaces and emits zero canned puppet rebuttals', async () => {
    const ws = createTempWorkspace();
    writeFile(ws, 'package.json', JSON.stringify({ name: 'vuln-app', dependencies: { lodash: '*' } }, null, 2));
    writeFile(ws, 'Dockerfile', 'FROM node:latest\nCOPY . /app\nCMD ["node", "index.js"]\n');
    writeFile(
      ws,
      'src/app.js',
      `const key = "${'AKIA' + 'IOSFODNN7EXAMPLE'}";\nconst db = process.env.PROD_DB_SECRET;\nconst out = eval(req.body.expr);\n`
    );

    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    const session = await agent.assembleCrew({
      topic: 'Production release readiness audit',
      mode: 'roundtable'
    });

    expect(session.assembledOfficers).toEqual(['engineering', 'security', 'bridge']);
    expect(session.consensusReached).toBe(false);
    expect(session.vetoes.length).toBeGreaterThanOrEqual(2);
    expect(session.issuedDirectiveId).toBeDefined();
    expect(session.numberOneRuling).toContain('HOLD');

    // Verify ZERO theatrical canned rebuttals exist
    expect(
      session.roundtableTranscript.some((t) => t.message.includes('Acknowledged'))
    ).toBe(false);

    const eng = session.assessments.find((a) => a.officer === 'engineering')!;
    const sec = session.assessments.find((a) => a.officer === 'security')!;
    const br = session.assessments.find((a) => a.officer === 'bridge')!;

    expect(eng.checks.length).toBeGreaterThanOrEqual(5);
    expect(eng.findings.some((f) => f.id === 'eng-undocumented-env-vars')).toBe(true);
    expect(sec.findings.some((f) => f.id.includes('sec-aws-access-key'))).toBe(true);
    expect(sec.findings.some((f) => f.id.includes('sec-eval-sink'))).toBe(true);
    expect(sec.findings.some((f) => f.id.includes('sec-docker-root'))).toBe(true);
    expect(sec.findings.some((f) => f.id === 'sec-wildcard-dependencies')).toBe(true);
    expect(br.findings.some((f) => f.id === 'cd-no-tests')).toBe(true);
    expect(br.findings.some((f) => f.id === 'cd-no-pipeline')).toBe(true);
  });

  it('is immune to echo-gaming in CI workflows and requires zero filename self-exemptions', () => {
    const ws = createTempWorkspace();
    // Copy Number One's own security-officer.ts into an arbitrary filename (`src/scanner.ts`)
    // to prove zero filename self-exemption is needed!
    const ownSecuritySource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/crew/security-officer.ts'),
      'utf8'
    );
    writeFile(ws, 'src/scanner.ts', ownSecuritySource);
    writeFile(
      ws,
      '.github/workflows/fake-cd.yml',
      [
        'name: Fake CD',
        'on: [push]',
        'permissions:',
        '  contents: read',
        'jobs:',
        '  fake:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: npm run build',
        '      - run: npm test',
        '      - run: echo "npm publish gh release create helm upgrade --atomic canary rollback"'
      ].join('\n')
    );

    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    const sec = agent.assessOfficer('security');
    expect(
      sec.findings.filter((f) => f.affectedPaths.includes('src/scanner.ts'))
    ).toEqual([]);

    const br = agent.assessOfficer('bridge');
    const matrix = br.artifacts.continuousDeliveryMatrix as {
      hasRealDeployOrReleaseInCi: boolean;
      hasRealRollback: boolean;
    };
    expect(matrix.hasRealDeployOrReleaseInCi).toBe(false);
    expect(matrix.hasRealRollback).toBe(false);
  });

  it('reaches consensus with zero phantom challenges on a compliant CD-enabled workspace', async () => {
    const ws = createTempWorkspace();
    writeFile(
      ws,
      'package.json',
      JSON.stringify(
        {
          name: 'compliant-service',
          engines: { node: '>=22.0.0' },
          scripts: { build: 'tsc', test: 'vitest run', start: 'node dist/server.js' },
          dependencies: { zod: '^4.6.7' }
        },
        null,
        2
      )
    );
    writeFile(ws, 'package-lock.json', '{ "lockfileVersion": 3 }\n');
    writeFile(ws, 'tsconfig.json', JSON.stringify({ compilerOptions: { strict: true } }));
    writeFile(ws, '.env.example', 'DATABASE_URL=postgres://localhost/app\nPORT=3000\n');
    writeFile(ws, 'SECURITY.md', '# Security Policy\nTrust boundaries, secret rotation, and vulnerability disclosure.\n');
    writeFile(
      ws,
      'README.md',
      '# Service Operations & Access\nBuild with `npm run build`, run with `npm start`, deploy via Helm, credentials injected via IAM role and secret manager (`DATABASE_URL`), verify and recovery documented.\n'.repeat(
        2
      )
    );
    writeFile(ws, 'infra/iam.tf', 'resource "aws_iam_role" "app" { name = "app-least-priv" }\n');
    writeFile(
      ws,
      'Dockerfile',
      'FROM node:22.22-alpine3.24\nUSER node\nENTRYPOINT ["node", "dist/server.js"]\n'
    );
    writeFile(
      ws,
      'src/server.ts',
      'export const dbUrl = process.env.DATABASE_URL;\nexport const port = process.env.PORT;\n'
    );
    writeFile(ws, 'tests/unit.test.ts', 'export const ok = true;\n');
    writeFile(ws, 'tests/e2e.test.ts', 'export const ok = true;\n');
    writeFile(ws, 'CHANGELOG.md', '# Changelog\n');
    writeFile(
      ws,
      '.github/workflows/cd.yml',
      [
        'name: CD',
        'on: [push, pull_request]',
        'permissions:',
        '  contents: read',
        'jobs:',
        '  deliver:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: npm run build',
        '      - run: npm test',
        '      - run: npm audit --audit-level=high',
        '      - run: helm upgrade --install svc ./chart --atomic'
      ].join('\n')
    );

    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    const session = await agent.assembleCrew({
      topic: 'Release v1.0.0 promotion',
      mode: 'roundtable'
    });

    expect(session.consensusReached).toBe(true);
    expect(session.vetoes).toHaveLength(0);
    for (const a of session.assessments) {
      expect(a.kpiScore).toBe(100);
      expect(a.challengesToPeers).toEqual([]);
    }
  });
});
