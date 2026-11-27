import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createInitialProjection } from '../src/core/replay-engine.js';
import { BridgeOfficer } from '../src/crew/bridge-officer.js';
import { EngineeringOfficer } from '../src/crew/engineering-officer.js';
import { SecurityOfficer } from '../src/crew/security-officer.js';

const REPO_ROOT = process.cwd();
const VERIFY_SCRIPT = path.resolve(REPO_ROOT, 'scripts/verify-workflows.mjs');
const PR_AUTOMATION_SCRIPT = path.resolve(REPO_ROOT, 'scripts/pr-automation.mjs');
const tmpDirs: string[] = [];

function createTempDir(prefix = 'n1-pr-auto-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

function runNodeScript(scriptPath: string, args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      status: err.status ?? 1,
      stdout: String(err.stdout ?? ''),
      stderr: String(err.stderr ?? '')
    };
  }
}

function evalPolicyPayload(payload: Record<string, unknown>, extraArgs: string[] = []) {
  const dir = createTempDir('n1-policy-');
  const file = path.join(dir, 'payload.json');
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  const res = runNodeScript(PR_AUTOMATION_SCRIPT, ['evaluate-json', file, ...extraArgs]);
  return { status: res.status, result: JSON.parse(res.stdout) };
}

const VALID_CHECKS = [
  { name: 'verify', status: 'COMPLETED', conclusion: 'SUCCESS' },
  { name: 'Analyze (javascript-typescript)', status: 'COMPLETED', conclusion: 'SUCCESS' },
  { name: 'dependency-review', status: 'COMPLETED', conclusion: 'SUCCESS' }
];

const VALID_COMMITS = [
  {
    oid: 'abcdef1234567890abcdef1234567890abcdef12',
    authorLogin: 'dependabot[bot]',
    authorEmail: '49699333+dependabot[bot]@users.noreply.github.com',
    signatureValid: true,
    signatureState: 'VALID'
  }
];

const REPO_PKG = {
  dependencies: { zod: '^4.6.7' },
  devDependencies: { typescript: '^7.0.2', vitest: '^5.1.1' }
};

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Workflow & Supply-Chain Integrity Verifier (scripts/verify-workflows.mjs)', () => {
  it('passes on the live repository with zero errors across all workflows, dependabot.yml, and Pages bundle', () => {
    const res = runNodeScript(VERIFY_SCRIPT, ['--root', REPO_ROOT, '--json']);
    expect(res.status).toBe(0);
    const report = JSON.parse(res.stdout);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.auditedWorkflows).toContain('.github/workflows/ci.yml');
    expect(report.auditedWorkflows).toContain('.github/workflows/codeql.yml');
    expect(report.auditedWorkflows).toContain('.github/workflows/dependabot-triage.yml');
    expect(report.pagesBundleFilesChecked).toBeGreaterThanOrEqual(7);
  });

  it('catches github/codeql-action/* step version skew and missing Dependabot codeql-action group', () => {
    const ws = createTempDir('n1-wf-skew-');
    writeFile(
      ws,
      '.github/workflows/codeql.yml',
      [
        'name: CodeQL',
        'on: [pull_request]',
        'permissions:',
        '  contents: read',
        '  security-events: write',
        'jobs:',
        '  analyze:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
        '      - uses: github/codeql-action/init@d2aacf54c2fbc910db8d7ec338fdb54ea48c692d # v3',
        '      - uses: github/codeql-action/autobuild@d2aacf54c2fbc910db8d7ec338fdb54ea48c692d # v3',
        '      - uses: github/codeql-action/analyze@1bd86f2fdb4b86187fa4059f16f31a3202acc9ea # v4.39.4'
      ].join('\n')
    );
    writeFile(
      ws,
      '.github/dependabot.yml',
      [
        'version: 2',
        'updates:',
        '  - package-ecosystem: github-actions',
        '    directory: /',
        '    schedule:',
        '      interval: weekly'
      ].join('\n')
    );

    const res = runNodeScript(VERIFY_SCRIPT, ['--root', ws, '--json']);
    expect(res.status).toBe(1);
    const report = JSON.parse(res.stdout);
    expect(report.valid).toBe(false);
    const codes = report.errors.map((e: { code: string }) => e.code);
    expect(codes).toContain('subaction-version-skew');
    expect(codes).toContain('missing-codeql-dependabot-group');
  });

  it('catches unpinned actions, write-all permissions, unsafe pull_request_target checkout, and missing Pages files', () => {
    const ws = createTempDir('n1-wf-unsafe-');
    writeFile(
      ws,
      '.github/workflows/bad.yml',
      [
        'name: Unsafe',
        'on:',
        '  pull_request_target:',
        'permissions: write-all',
        'jobs:',
        '  pwn:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v7',
        '        with:',
        '          ref: ${{ github.event.pull_request.head.sha }}'
      ].join('\n')
    );
    writeFile(
      ws,
      '.github/workflows/pages.yml',
      [
        'name: Pages',
        'on: [push]',
        'permissions:',
        '  contents: read',
        'jobs:',
        '  build:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: |',
        '          test -f docs/site/index.html'
      ].join('\n')
    );
    writeFile(
      ws,
      '.github/dependabot.yml',
      'version: 2\nupdates:\n  - package-ecosystem: github-actions\n    directory: /\n'
    );

    const res = runNodeScript(VERIFY_SCRIPT, ['--root', ws, '--json']);
    expect(res.status).toBe(1);
    const report = JSON.parse(res.stdout);
    const codes = report.errors.map((e: { code: string }) => e.code);
    expect(codes).toContain('write-all-permissions');
    expect(codes).toContain('unpinned-action');
    expect(codes).toContain('unsafe-pull-request-target-checkout');
    expect(codes).toContain('missing-pages-bundle-file');
  });
});

describe('Dependabot PR Triage & Merge Policy Engine (scripts/pr-automation.mjs)', () => {
  it('marks github-actions major/minor/patch/grouped PRs as READY_TO_MERGE when checks & signatures pass', () => {
    for (const [title, updateType] of [
      ['build(deps): bump actions/checkout from 4.2.2 to 7.0.1', 'version-update:semver-major'],
      ['build(deps): bump actions/setup-node from 7.0.0 to 7.1.0', 'version-update:semver-minor'],
      ['build(deps): bump actions/deploy-pages from 5.0.0 to 5.0.1', 'version-update:semver-patch'],
      ['build(deps): bump the codeql-action group with 3 updates', '']
    ] as const) {
      const { status, result } = evalPolicyPayload({
        pr: {
          number: 42,
          title,
          authorLogin: 'dependabot[bot]',
          headRefName: 'dependabot/github_actions/example',
          files: ['.github/workflows/ci.yml'],
          commits: VALID_COMMITS,
          checks: VALID_CHECKS,
          mergeable: 'MERGEABLE',
          packageEcosystem: 'github-actions',
          updateType
        },
        pkgJson: REPO_PKG
      });
      expect(status).toBe(0);
      expect(result.policyEligible).toBe(true);
      expect(result.status).toBe('READY_TO_MERGE');
      expect(result.recommendedLabel).toBe('automerge-eligible');
    }
  });

  it('marks npm patch & minor updates as READY_TO_MERGE but holds major npm runtime updates for manual review', () => {
    const minorRun = evalPolicyPayload({
      pr: {
        number: 51,
        title: 'build(deps): bump zod from 4.6.7 to 4.7.0',
        authorLogin: 'dependabot[bot]',
        headRefName: 'dependabot/npm_and_yarn/zod-4.7.0',
        files: ['package.json', 'package-lock.json'],
        commits: VALID_COMMITS,
        checks: VALID_CHECKS,
        mergeable: 'MERGEABLE',
        packageEcosystem: 'npm',
        updateType: 'version-update:semver-minor',
        dependencyType: 'direct:production',
        dependencyNames: ['zod']
      },
      pkgJson: REPO_PKG
    });
    expect(minorRun.status).toBe(0);
    expect(minorRun.result.policyEligible).toBe(true);
    expect(minorRun.result.status).toBe('READY_TO_MERGE');

    const majorRuntime = evalPolicyPayload({
      pr: {
        number: 52,
        title: 'build(deps): bump zod from 4.6.7 to 5.0.0',
        authorLogin: 'dependabot[bot]',
        headRefName: 'dependabot/npm_and_yarn/zod-5.0.0',
        files: ['package.json', 'package-lock.json'],
        commits: VALID_COMMITS,
        checks: VALID_CHECKS,
        mergeable: 'MERGEABLE',
        packageEcosystem: 'npm',
        updateType: 'version-update:semver-major',
        dependencyType: 'direct:production',
        dependencyNames: ['zod']
      },
      pkgJson: REPO_PKG
    });
    expect(majorRuntime.status).toBe(0);
    expect(majorRuntime.result.policyEligible).toBe(false);
    expect(majorRuntime.result.status).toBe('HELD_POLICY');
    expect(majorRuntime.result.recommendedLabel).toBe('manual-review-required');
    expect(majorRuntime.result.policyHoldReasons.join(' ')).toContain('runtime dependency');

    const majorDevDefault = evalPolicyPayload({
      pr: {
        number: 53,
        title: 'build(deps-dev): bump typescript from 7.0.2 to 8.0.0',
        authorLogin: 'dependabot[bot]',
        headRefName: 'dependabot/npm_and_yarn/typescript-8.0.0',
        files: ['package.json', 'package-lock.json'],
        commits: VALID_COMMITS,
        checks: VALID_CHECKS,
        mergeable: 'MERGEABLE',
        packageEcosystem: 'npm',
        updateType: 'version-update:semver-major',
        dependencyType: 'direct:development',
        dependencyNames: ['typescript']
      },
      pkgJson: REPO_PKG
    });
    expect(majorDevDefault.result.status).toBe('HELD_POLICY');

    const majorDevOptIn = evalPolicyPayload(
      {
        pr: {
          number: 53,
          title: 'build(deps-dev): bump typescript from 7.0.2 to 8.0.0',
          authorLogin: 'dependabot[bot]',
          headRefName: 'dependabot/npm_and_yarn/typescript-8.0.0',
          files: ['package.json', 'package-lock.json'],
          commits: VALID_COMMITS,
          checks: VALID_CHECKS,
          mergeable: 'MERGEABLE',
          packageEcosystem: 'npm',
          updateType: 'version-update:semver-major',
          dependencyType: 'direct:development',
          dependencyNames: ['typescript']
        },
        pkgJson: REPO_PKG
      },
      ['--allow-npm-dev-major']
    );
    expect(majorDevOptIn.result.status).toBe('READY_TO_MERGE');
  });

  it('blocks tampered commits, disallowed files, tag-to-SHA mismatches, pending checks, conflicts, and maintainer changes', () => {
    const unsignedCommit = evalPolicyPayload({
      pr: {
        number: 60,
        title: 'build(deps): bump actions/checkout from 7.0.1 to 7.0.2',
        authorLogin: 'dependabot[bot]',
        headRefName: 'dependabot/github_actions/actions/checkout-7.0.2',
        files: ['.github/workflows/ci.yml'],
        commits: [{ ...VALID_COMMITS[0], signatureValid: false, signatureState: 'UNSIGNED' }],
        checks: VALID_CHECKS,
        mergeable: 'MERGEABLE'
      }
    });
    expect(unsignedCommit.status).toBe(1);
    expect(unsignedCommit.result.status).toBe('BLOCKED_INTEGRITY');

    const disallowedFile = evalPolicyPayload({
      pr: {
        number: 61,
        title: 'build(deps): bump zod from 4.6.7 to 4.6.8',
        authorLogin: 'dependabot[bot]',
        headRefName: 'dependabot/npm_and_yarn/zod-4.6.8',
        files: ['package.json', 'src/cli.ts'],
        commits: VALID_COMMITS,
        checks: VALID_CHECKS,
        mergeable: 'MERGEABLE'
      }
    });
    expect(disallowedFile.status).toBe(1);
    expect(disallowedFile.result.status).toBe('BLOCKED_INTEGRITY');

    const shaMismatch = evalPolicyPayload({
      pr: {
        number: 62,
        title: 'build(deps): bump actions/checkout from 7.0.1 to 7.0.2',
        authorLogin: 'dependabot[bot]',
        headRefName: 'dependabot/github_actions/actions/checkout-7.0.2',
        files: ['.github/workflows/ci.yml'],
        commits: VALID_COMMITS,
        checks: VALID_CHECKS,
        mergeable: 'MERGEABLE',
        remoteTagChecks: [
          {
            repo: 'actions/checkout',
            tag: 'v7.0.2',
            pinnedSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            resolvedSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            matched: false
          }
        ]
      }
    });
    expect(shaMismatch.status).toBe(1);
    expect(shaMismatch.result.status).toBe('BLOCKED_INTEGRITY');

    const failedCheck = evalPolicyPayload({
      pr: {
        number: 63,
        title: 'build(deps): bump actions/checkout from 7.0.1 to 7.0.2',
        authorLogin: 'dependabot[bot]',
        headRefName: 'dependabot/github_actions/actions/checkout-7.0.2',
        files: ['.github/workflows/ci.yml'],
        commits: VALID_COMMITS,
        checks: [
          { name: 'verify', status: 'COMPLETED', conclusion: 'SUCCESS' },
          { name: 'Analyze (javascript-typescript)', status: 'COMPLETED', conclusion: 'FAILURE' },
          { name: 'dependency-review', status: 'COMPLETED', conclusion: 'SUCCESS' }
        ],
        mergeable: 'MERGEABLE'
      }
    });
    expect(failedCheck.status).toBe(0);
    expect(failedCheck.result.status).toBe('BLOCKED_CHECKS');

    const conflictingPr = evalPolicyPayload({
      pr: {
        number: 64,
        title: 'build(deps): bump actions/checkout from 7.0.1 to 7.0.2',
        authorLogin: 'dependabot[bot]',
        headRefName: 'dependabot/github_actions/actions/checkout-7.0.2',
        files: ['.github/workflows/ci.yml'],
        commits: VALID_COMMITS,
        checks: VALID_CHECKS,
        mergeable: 'CONFLICTING'
      }
    });
    expect(conflictingPr.result.status).toBe('CONFLICT');

    const maintainerChange = evalPolicyPayload({
      pr: {
        number: 65,
        title: 'build(deps): bump zod from 4.6.7 to 4.6.8',
        authorLogin: 'dependabot[bot]',
        headRefName: 'dependabot/npm_and_yarn/zod-4.6.8',
        files: ['package.json', 'package-lock.json'],
        commits: VALID_COMMITS,
        checks: VALID_CHECKS,
        mergeable: 'MERGEABLE',
        maintainerChanges: true
      }
    });
    expect(maintainerChange.result.status).toBe('HELD_POLICY');
  });
});

describe('Bridge Crew Self-Audit on Live Repository', () => {
  it('maintains 100/100 KPI scores across Engineering, Security, and Bridge officers with the new PR automation', () => {
    const projection = createInitialProjection(REPO_ROOT);
    const eng = new EngineeringOfficer().assess(REPO_ROOT, projection);
    const sec = new SecurityOfficer().assess(REPO_ROOT, projection);
    const bridge = new BridgeOfficer().assess(REPO_ROOT, projection);

    expect(eng.findings).toEqual([]);
    expect(eng.kpiScore).toBe(100);
    expect(sec.findings).toEqual([]);
    expect(sec.kpiScore).toBe(100);
    expect(bridge.findings).toEqual([]);
    expect(bridge.kpiScore).toBe(100);
  });
});

describe('npm Release Pipeline & Package Publishability', () => {
  it('configures package.json and package-lock.json for scoped public npm publishing with matching provenance repo URL', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8'));

    expect(pkg.name).toBe('@onimurasame/numberone');
    expect(lock.name).toBe('@onimurasame/numberone');
    expect(lock.packages?.['']?.name).toBe('@onimurasame/numberone');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
    expect(pkg.publishConfig).toEqual({ access: 'public' });
    expect(pkg.repository?.url).toBe('git+https://github.com/onimurasame/numberone.git');
    expect(pkg.bin).toEqual({
      numberone: 'dist/cli.js',
      n1: 'dist/cli.js'
    });
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'README.md', 'LICENSE', 'NOTICE']));
  });

  it('hardens .github/workflows/release.yml for OIDC Trusted Publishing, NPM_TOKEN bootstrap, dry-run dispatch, and zero script injection', () => {
    const wf = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');

    expect(wf).toContain("tags:\n      - 'v*.*.*'");
    expect(wf).toContain('workflow_dispatch:');
    expect(wf).toContain('dry_run:');
    expect(wf).toContain('id-token: write');
    expect(wf).toContain('name: npm');
    expect(wf).toContain("node-version: '24'");
    expect(wf).toContain('package-manager-cache: false');
    expect(wf).toContain('npm ci --ignore-scripts');
    expect(wf).toContain('npm publish --provenance --access public');
    expect(wf).toContain('npm publish --dry-run --access public');
    expect(wf).toContain('gh release create');
    expect(wf).not.toMatch(/registry-url\s*:/);

    // Ensure no direct ${{ inputs.* }} interpolation inside shell `run:` commands
    const runBlocks = wf.split(/^\s*run:\s*\|$/m).slice(1);
    for (const block of runBlocks) {
      for (const line of block.split(/\r?\n/)) {
        if (/^\s{0,6}[a-z_-]+:/i.test(line)) break;
        expect(line).not.toMatch(/\$\{\{\s*inputs\./);
      }
    }
  });

  it('executes scripts/rollback.sh --dry-run targeting @onimurasame/numberone', () => {
    const out = execFileSync(
      'bash',
      [
        path.resolve(REPO_ROOT, 'scripts/rollback.sh'),
        '--good-version',
        '1.0.0',
        '--bad-version',
        '1.0.1',
        '--reason',
        'Verification dry-run',
        '--dry-run'
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    expect(out).toContain('Rolling back @onimurasame/numberone: 1.0.1 -> 1.0.0');
    expect(out).toContain('@onimurasame/numberone@1.0.0');
    expect(out).toContain('@onimurasame/numberone@1.0.1');
  });
});

