import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NumberOneAgent } from '../src/harness/number-one.js';

const tmpDirs: string[] = [];

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-evolve-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('KnowledgeEvolutionEngine — Empirically Executed Verification', () => {
  it('rejects proposals with wrong KPI, missing counterfactual events, false positives on clean samples, or failing benchmark commands', () => {
    const ws = createTempWorkspace();
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    // 1. Default-deny blocks shell execution for empirical_benchmark unless explicitly opted in
    const defaultDenied = agent.proposeKnowledgeUpdate({
      officer: 'security',
      practice: {
        id: 'sec-default-denied-bench',
        title: 'Unopted benchmark execution',
        category: 'code',
        description: 'Must be blocked by default-deny execution gate',
        ruleType: 'tool',
        targetKpi: 'security_posture_score',
        evidenceSummary: 'Should not execute without opt-in',
        evidenceSources: ['local-benchmark']
      },
      proof: {
        kind: 'empirical_benchmark',
        sources: ['local-benchmark'],
        methodology: 'Attempts to run benchmark command without allowCommandExecution opt-in',
        reproducibleCommand: `node -e 'console.log(JSON.stringify({kpiBefore: 70, kpiAfter: 95}))'`
      }
    });
    expect(defaultDenied.accepted).toBe(false);
    expect(defaultDenied.reasons.some((r) => r.includes('disabled by default'))).toBe(true);

    // 2. Opted-in failing benchmark command & wrong target KPI
    const rejectedBench = agent.proposeKnowledgeUpdate(
      {
        officer: 'security',
        practice: {
          id: 'sec-unproven-rule',
          title: 'Unverified scanner rule',
          category: 'code',
          description: 'Fails empirical benchmark',
          ruleType: 'tool',
          targetKpi: 'runtime_readiness_score',
          evidenceSummary: 'No gain measured',
          evidenceSources: ['local-benchmark']
        },
        proof: {
          kind: 'empirical_benchmark',
          sources: ['local-benchmark'],
          methodology: 'Executed local benchmark suite comparing before and after scores',
          reproducibleCommand: `node -e 'console.log(JSON.stringify({kpiBefore: 85, kpiAfter: 80}))'`
        }
      },
      { allowCommandExecution: true }
    );

    expect(rejectedBench.accepted).toBe(false);
    expect(rejectedBench.reasons.some((r) => r.includes('Target KPI mismatch'))).toBe(true);
    expect(rejectedBench.reasons.some((r) => r.includes('insufficient KPI delta'))).toBe(true);

    // 3. Counterfactual matcher that triggers false positives on clean negativeSamples
    const incidentEv = agent.recordEvent({
      type: 'exec.crashed',
      actor: { kind: 'watcher', id: 'runner' },
      summary: 'Incident caused by child_process exec injection',
      payload: { command: 'server', exitCode: 1 }
    });

    const rejectedFalsePositive = agent.proposeKnowledgeUpdate({
      officer: 'security',
      practice: {
        id: 'sec-overbroad-regex',
        title: 'Overly broad exec regex',
        category: 'code',
        description: 'Flags every word containing exec',
        ruleType: 'check',
        targetKpi: 'security_posture_score',
        evidenceSummary: 'Overbroad rule',
        evidenceSources: [`stream:${incidentEv.id}`],
        matcher: {
          fileGlob: 'src/**/*.ts',
          contentRegex: 'exec',
          severity: 'high'
        }
      },
      proof: {
        kind: 'counterfactual_replay',
        sources: [`stream:${incidentEv.id}`],
        methodology: 'Evaluated candidate regex against defective incident sample and clean codebase sample',
        counterfactualEventIds: [incidentEv.id],
        positiveSamples: [{ path: 'src/bad.ts', content: 'child_process.exec(userInput);' }],
        negativeSamples: [{ path: 'src/clean.ts', content: 'export function executeSafeTask() { return true; }' }]
      }
    });

    expect(rejectedFalsePositive.accepted).toBe(false);
    expect(rejectedFalsePositive.verificationMetrics.falsePositivesAfter).toBe(1);
    expect(rejectedFalsePositive.reasons.some((r) => r.includes('false positive'))).toBe(true);
  });

  it('promotes practices verified by real counterfactual matcher execution AND real benchmark commands, plus rolls back on live regression', () => {
    const ws = createTempWorkspace();
    fs.mkdirSync(path.join(ws, 'src'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'src/clean.ts'), 'export const safe = 1;\n');
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    // Record real incident with defective file stored as stream blob
    const incidentEv = agent.recordEvent({
      type: 'exec.crashed',
      actor: { kind: 'watcher', id: 'runner' },
      affectedPaths: ['src/shell.ts'],
      summary: 'Command injection in shell wrapper',
      fallbackBlobs: [
        { key: 'defectiveSource', content: 'import cp from "child_process";\ncp.execSync(`rm -rf ${req.query.dir}`);\n' }
      ]
    });

    // 1. Promote via real counterfactual stream blob evaluation (0% -> 100% recall, 0 false positives)
    const promoted = agent.proposeKnowledgeUpdate({
      officer: 'security',
      practice: {
        id: 'sec-no-interpolated-execsync',
        title: 'Forbid template interpolation inside execSync()',
        category: 'code',
        description: 'Prevent shell command injection (CWE-78) in child_process.execSync.',
        ruleType: 'check',
        targetKpi: 'security_posture_score',
        evidenceSummary: 'Catches interpolated shell execution recorded in stream incident.',
        evidenceSources: [`stream:${incidentEv.id}`, 'CWE-78'],
        matcher: {
          fileGlob: 'src/**/*.ts',
          contentRegex: 'execSync\\s*\\(\\s*`[^`]*\\$\\{',
          severity: 'critical'
        }
      },
      proof: {
        kind: 'counterfactual_replay',
        sources: [`stream:${incidentEv.id}`, 'CWE-78'],
        methodology: 'Executed matcher against stream incident blob and clean source sample.',
        counterfactualEventIds: [incidentEv.id],
        negativeSamples: [{ path: 'src/clean.ts', content: 'execFileSync("git", ["status"]);' }]
      }
    });

    expect(promoted.accepted).toBe(true);
    expect(promoted.verificationMetrics.truePositivesBefore).toBe(0);
    expect(promoted.verificationMetrics.truePositivesAfter).toBe(1);
    expect(promoted.verificationMetrics.falsePositivesAfter).toBe(0);
    expect(promoted.measuredKpiDelta).toBe(100);

    // Compliant workspace passes the newly promoted check!
    const cleanAudit = agent.assessOfficer('security');
    expect(cleanAudit.knowledgeVersion).toBe(2);
    expect(cleanAudit.checks.find((c) => c.id === 'evolved-sec-no-interpolated-execsync')?.passed).toBe(true);

    // Introduce the CWE-78 defect into workspace -> evolved check catches it and drops live KPI!
    fs.writeFileSync(path.join(ws, 'src/vuln.ts'), 'execSync(`ls ${userInput}`);\n');
    const failingAudit = agent.assessOfficer('security');
    expect(
      failingAudit.findings.some((f) => f.id === 'evolved-sec-no-interpolated-execsync')
    ).toBe(true);
    expect(failingAudit.kpiScore).toBeLessThan(cleanAudit.kpiScore);

    // 2. Promote an Engineering Officer practice via real executed benchmark script (`empirical_benchmark`)
    const benchScript = path.join(ws, 'run-bench.mjs');
    fs.writeFileSync(
      benchScript,
      `const before = 75; const after = 92.5; console.log(JSON.stringify({ kpiBefore: before, kpiAfter: after }));\n`
    );
    const benchVerdict = agent.proposeKnowledgeUpdate(
      {
        officer: 'engineering',
        practice: {
          id: 'eng-graceful-sigterm-check',
          title: 'Verify SIGTERM listener registration',
          category: 'operations',
          description: 'Ensure long-running servers handle SIGTERM cleanly.',
          ruleType: 'process',
          targetKpi: 'runtime_readiness_score',
          evidenceSummary: 'Measured +17.5 runtime readiness improvement across boot/shutdown suite.',
          evidenceSources: ['run-bench.mjs']
        },
        proof: {
          kind: 'empirical_benchmark',
          sources: ['run-bench.mjs'],
          methodology: 'Executed run-bench.mjs to measure startup/shutdown readiness score.',
          reproducibleCommand: `"${process.execPath}" "${benchScript}"`
        }
      },
      { allowCommandExecution: true }
    );
    expect(benchVerdict.accepted).toBe(true);
    expect(benchVerdict.measuredKpiDelta).toBe(17.5);
  });
});
