#!/usr/bin/env node
/**
 * Advanced Technical Sample 2: BMAD Party Mode Bridge Crew,
 * KPI-Gated Counterfactual Self-Evolution & Distributed Scrum Persistence Fabric
 *
 * Exercises Number One's multi-officer governance & continuous evolution pipeline:
 *   - Phase 1: Unhardened microservice workspace -> 3-Round BMAD Party Mode
 *              produces findings, Round 2 peer challenge verification, and a
 *              real `crew.veto` + automatic L2 blocking directive
 *   - Phase 2: `KnowledgeEvolutionEngine.proposeUpdate()` evaluates two real
 *              candidate Security Officer practices via counterfactual virtual-file
 *              replay: rejects an overbroad false-positive rule, promotes a crisp
 *              CWE-78 rule with delta > 0 and 0 false positives
 *   - Phase 3: Applies full hardening (pinned Dockerfile USER, CI tests, rollback
 *              runbook, Dependabot, lockfile, SECURITY.md) -> re-runs Party Mode ->
 *              reaches `crew.consensus` and auto-supersedes remediation veto gates
 *   - Phase 4: Syncs all events & directives via `DirectoryPersistenceAdapter` +
 *              `PersistenceFabric` and verifies lossless distributed integrity
 *
 * Run locally from the repo root (after `npm run build`):
 *   node examples/advanced-bmad-crew-evolution/run.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DirectoryPersistenceAdapter, NumberOneAgent } from '../../dist/index.js';

function parseOutFlag(argv) {
  const idx = argv.indexOf('--out');
  if (idx !== -1 && argv[idx + 1]) return path.resolve(argv[idx + 1]);
  return null;
}

function summarizeParty(session) {
  return {
    partySessionId: session.partySessionId,
    topic: session.topic,
    consensusReached: session.consensusReached,
    vetoed: !session.consensusReached,
    vetoDirectiveEventId: session.vetoDirectiveEventId ?? null,
    officers: session.decisionMatrix.map((row) => ({
      role: row.officer,
      title: row.officerTitle,
      kpiName: row.mainKpiName,
      kpiScore: row.kpiScore,
      checksPassed: row.checksPassed,
      checksApplicable: row.checksApplicable,
      blockingCount: row.blockingCount,
      gate: row.domainGate
    })),
    peerChallenges: session.challengeResolutions.map((ch) => ({
      from: ch.fromOfficer,
      to: ch.targetOfficer,
      status: ch.status,
      question: ch.question,
      evidence: ch.evidence
    })),
    topRemediations: session.remediationPlan.slice(0, 6).map((r) => ({
      rank: r.rank,
      officer: r.ownerOfficer,
      severity: r.severity,
      blocksRelease: r.blocksRelease,
      title: r.title,
      action: r.action
    }))
  };
}

export async function runBmadCrewEvolutionSample(outJsonPath = null) {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-adv-bmad-'));
  const scrumBoardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-adv-scrum-'));

  try {
    // ------------------------------------------------------------------
    // PHASE 1: Unhardened workspace (triggers real BMAD Party Mode VETO)
    // ------------------------------------------------------------------
    fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir, 'package.json'),
      JSON.stringify({ name: 'demo-payments-api', version: '1.0.0', scripts: { start: 'node src/server.js' } }, null, 2)
    );
    fs.writeFileSync(
      path.join(workspaceDir, 'Dockerfile'),
      'FROM node:latest\nWORKDIR /app\nCOPY . .\nUSER root\nCMD ["node", "src/server.js"]\n'
    );
    fs.writeFileSync(
      path.join(workspaceDir, 'src', 'server.js'),
      'export function start() { return "running"; }\n'
    );

    const directoryAdapter = new DirectoryPersistenceAdapter({
      enabled: true,
      targetDir: scrumBoardDir,
      projectKey: 'PAY'
    });
    const agent = new NumberOneAgent(workspaceDir, [directoryAdapter]);
    agent.attach({
      workspaceName: 'Payments API Hardening Pipeline',
      installHooks: false,
      installShims: false,
      backfillGitCommits: 0,
      harness: 'ci-pipeline'
    });

    const phase1Session = await agent.assembleCrew({
      topic: 'Phase 1: Pre-hardening baseline production readiness audit',
      mode: 'roundtable',
      harness: 'ci-pipeline'
    });

    // ------------------------------------------------------------------
    // PHASE 2: Empirically Verified KPI-Gated Officer Self-Evolution
    // ------------------------------------------------------------------
    const incidentEvent = agent.recordEvent({
      type: 'exec.crashed',
      actor: { kind: 'watcher', id: 'runner' },
      harness: 'ci-pipeline',
      affectedPaths: ['src/deploy.ts'],
      summary: 'Shell interpolation CWE-78 incident in deploy helper',
      payload: { command: 'node src/deploy.ts', exitCode: 1 },
      fallbackBlobs: [
        {
          key: 'defectiveSource',
          content: 'import cp from "node:child_process";\ncp.execSync(`tar -czf ${req.query.name}.tgz dist`);\n'
        }
      ]
    });

    // 2A. Overbroad rule triggers false positive on clean sample -> REJECTED!
    const rejectedEvolution = agent.proposeKnowledgeUpdate({
      officer: 'security',
      practice: {
        id: 'sec-overbroad-exec-word',
        title: 'Flag any identifier containing "exec"',
        category: 'code',
        description: 'Overly broad rule that falsely triggers on safe functions like executeHealthCheck.',
        ruleType: 'check',
        targetKpi: 'security_posture_score',
        evidenceSummary: 'Rejected because it causes false positives on clean code.',
        evidenceSources: [`stream:${incidentEvent.id}`],
        matcher: {
          fileGlob: 'src/**/*.ts',
          contentRegex: 'exec',
          severity: 'high'
        }
      },
      proof: {
        kind: 'counterfactual_replay',
        sources: [`stream:${incidentEvent.id}`],
        methodology: 'Evaluated candidate regex against defective incident blob and clean sample.',
        counterfactualEventIds: [incidentEvent.id],
        negativeSamples: [{ path: 'src/health.ts', content: 'export function executeHealthCheck() { return true; }' }]
      }
    });

    // 2B. Precise CWE-78 rule catches incident with 0 false positives (delta > 0) -> PROMOTED!
    const promotedEvolution = agent.proposeKnowledgeUpdate({
      officer: 'security',
      practice: {
        id: 'sec-forbid-interpolated-execsync',
        title: 'Forbid template interpolation inside execSync()',
        category: 'code',
        description: 'Blocks CWE-78 OS command injection via interpolated template strings in execSync.',
        ruleType: 'check',
        targetKpi: 'security_posture_score',
        evidenceSummary: 'Verified 0% -> 100% recall with zero false positives via counterfactual replay.',
        evidenceSources: [`stream:${incidentEvent.id}`, 'CWE-78'],
        matcher: {
          fileGlob: 'src/**/*.ts',
          contentRegex: 'execSync\\s*\\(\\s*`[^`]*\\$\\{',
          severity: 'critical'
        }
      },
      proof: {
        kind: 'counterfactual_replay',
        sources: [`stream:${incidentEvent.id}`, 'CWE-78'],
        methodology: 'Executed candidate matcher against incident blob and safe execFileSync sample.',
        counterfactualEventIds: [incidentEvent.id],
        negativeSamples: [{ path: 'src/safe.ts', content: 'execFileSync("tar", ["-czf", "bundle.tgz", "dist"]);' }]
      }
    });

    // ------------------------------------------------------------------
    // PHASE 3: Remediate findings -> Re-run Party Mode -> CONSENSUS!
    // ------------------------------------------------------------------
    fs.mkdirSync(path.join(workspaceDir, '.github', 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, 'scripts'), { recursive: true });

    fs.writeFileSync(
      path.join(workspaceDir, 'package.json'),
      JSON.stringify(
        {
          name: 'demo-payments-api',
          version: '1.0.0',
          engines: { node: '>=22.0.0' },
          scripts: {
            build: 'tsc --noEmit',
            typecheck: 'tsc --noEmit',
            test: 'vitest run'
          }
        },
        null,
        2
      )
    );
    fs.writeFileSync(path.join(workspaceDir, 'package-lock.json'), '{"name":"demo-payments-api","lockfileVersion":3}\n');
    fs.writeFileSync(path.join(workspaceDir, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}\n');
    fs.writeFileSync(path.join(workspaceDir, '.gitignore'), '.env\nnode_modules/\n');
    fs.writeFileSync(path.join(workspaceDir, '.env.example'), 'PORT=3000\n');
    fs.writeFileSync(path.join(workspaceDir, '.dockerignore'), 'node_modules\n.git\n.env\n');
    fs.writeFileSync(
      path.join(workspaceDir, 'Dockerfile'),
      'FROM node:22.22-alpine AS build\nWORKDIR /app\nCOPY . .\nFROM node:22.22-alpine\nUSER node\nWORKDIR /app\nCOPY --from=build /app .\nCMD ["node", "src/server.js"]\n'
    );
    fs.writeFileSync(
      path.join(workspaceDir, 'src', 'server.js'),
      'process.on("SIGTERM", () => process.exit(0));\nexport function start() { return "hardened"; }\n'
    );
    fs.writeFileSync(
      path.join(workspaceDir, 'tests', 'server.test.ts'),
      'import { expect, it } from "vitest";\nit("handles health checks", () => expect(true).toBe(true));\n'
    );
    fs.writeFileSync(
      path.join(workspaceDir, 'tests', 'server.e2e.test.ts'),
      'import { expect, it } from "vitest";\nit("starts", () => expect(true).toBe(true));\n'
    );
    fs.writeFileSync(path.join(workspaceDir, 'SECURITY.md'), '# Security Policy\nReport vulnerabilities privately to security@example.invalid.\n');
    fs.writeFileSync(path.join(workspaceDir, 'CHANGELOG.md'), '# Changelog\n## 1.0.0\nInitial hardened release.\n');
    fs.writeFileSync(
      path.join(workspaceDir, 'README.md'),
      [
        '# Demo Payments API — Operations & Access Runbook',
        '',
        '## Build, Install, Run & Recovery',
        '1. Install dependencies cleanly with `npm ci`.',
        '2. Build and verify with `npm run build && npm test`.',
        '3. Runtime environment variables, tokens, credentials, and least-privilege IAM permissions are documented in `.env.example`.',
        '4. For emergency recovery or release rollback, execute `./scripts/rollback.sh`.'
      ].join('\n') + '\n'
    );
    fs.writeFileSync(
      path.join(workspaceDir, 'scripts', 'rollback.sh'),
      '#!/usr/bin/env bash\nset -euo pipefail\necho "Rolling back to previous verified release"\n',
      { mode: 0o755 }
    );
    fs.writeFileSync(
      path.join(workspaceDir, '.github', 'dependabot.yml'),
      'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: "/"\n    schedule:\n      interval: weekly\n'
    );
    fs.writeFileSync(
      path.join(workspaceDir, '.github', 'workflows', 'ci.yml'),
      [
        'name: CI',
        'on: [push, pull_request]',
        'permissions:',
        '  contents: read',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
        '      - run: npm run build && npm test && npm audit --audit-level=high'
      ].join('\n') + '\n'
    );
    fs.writeFileSync(
      path.join(workspaceDir, '.github', 'workflows', 'release.yml'),
      [
        'name: Release',
        'on:',
        '  push:',
        '    tags: ["v*"]',
        'permissions:',
        '  contents: write',
        '  id-token: write',
        'jobs:',
        '  publish:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
        '      - run: npm publish --provenance'
      ].join('\n') + '\n'
    );

    // Resolve earlier crash and log passing test suite runs for DORA stability
    agent.recordEvent({
      type: 'exec.completed',
      actor: { kind: 'watcher', id: 'runner' },
      harness: 'ci-pipeline',
      causationId: incidentEvent.id,
      summary: 'Hardened deploy script verified cleanly',
      payload: { command: 'node src/deploy.ts', exitCode: 0 }
    });
    agent.recordEvent({
      type: 'exec.completed',
      actor: { kind: 'watcher', id: 'runner' },
      harness: 'ci-pipeline',
      summary: 'Automated vitest suite passed (100%)',
      payload: { command: 'npm test', exitCode: 0 }
    });

    const phase3Session = await agent.assembleCrew({
      topic: 'Phase 3: Post-remediation production & CD release gate',
      mode: 'roundtable',
      harness: 'ci-pipeline'
    });

    // ------------------------------------------------------------------
    // PHASE 4: Sync to Distributed Scrum Persistence Fabric & Verify Parity
    // ------------------------------------------------------------------
    const pushReports = await agent.syncPush();
    const distributedIntegrity = await agent.verifyIntegrity(true);

    const sceneData = {
      sampleId: 'advanced-bmad-crew-evolution',
      title: 'BMAD Bridge Crew, KPI Evolution & Distributed Scrum Command Bridge',
      audience: 'advanced',
      phases: {
        phase1Veto: summarizeParty(phase1Session),
        phase2Evolution: {
          rejected: {
            practiceId: 'sec-overbroad-exec-word',
            accepted: rejectedEvolution.accepted,
            delta: rejectedEvolution.measuredKpiDelta,
            falsePositivesAfter: rejectedEvolution.verificationMetrics.falsePositivesAfter,
            reasons: rejectedEvolution.reasons
          },
          promoted: {
            practiceId: 'sec-forbid-interpolated-execsync',
            accepted: promotedEvolution.accepted,
            delta: promotedEvolution.measuredKpiDelta,
            truePositivesBefore: promotedEvolution.verificationMetrics.truePositivesBefore,
            truePositivesAfter: promotedEvolution.verificationMetrics.truePositivesAfter,
            falsePositivesAfter: promotedEvolution.verificationMetrics.falsePositivesAfter,
            reasons: promotedEvolution.reasons
          }
        },
        phase3Consensus: summarizeParty(phase3Session),
        phase4Sync: {
          adapter: pushReports[0]?.backend ?? 'directory',
          pushedCount: pushReports[0]?.pushedCount ?? 0,
          fallbackOnlyCount: pushReports[0]?.fallbackOnlyCount ?? 0,
          syncedUpToSeq: pushReports[0]?.syncedUpToSeq ?? 0,
          distributedValid: distributedIntegrity.valid,
          totalEvents: distributedIntegrity.totalEvents,
          verifiedBlobs: distributedIntegrity.verifiedBlobs,
          remoteChecked: distributedIntegrity.remoteChecks[0]?.checkedCount ?? 0,
          remoteValid: distributedIntegrity.remoteChecks[0]?.validCount ?? 0
        }
      }
    };

    if (outJsonPath) {
      fs.mkdirSync(path.dirname(outJsonPath), { recursive: true });
      fs.writeFileSync(outJsonPath, JSON.stringify(sceneData, null, 2) + '\n', 'utf8');
    }

    return { sceneData };
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    fs.rmSync(scrumBoardDir, { recursive: true, force: true });
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  const outPath = parseOutFlag(process.argv.slice(2));
  const { sceneData } = await runBmadCrewEvolutionSample(outPath);
  const p1 = sceneData.phases.phase1Veto;
  const p2 = sceneData.phases.phase2Evolution;
  const p3 = sceneData.phases.phase3Consensus;
  const p4 = sceneData.phases.phase4Sync;
  console.log(`[BMAD Crew & Evolution Sample]`);
  console.log(`  Phase 1: consensus=${p1.consensusReached} | KPIs: ${p1.officers.map((o) => `${o.role}=${o.kpiScore}`).join(', ')}`);
  console.log(`  Phase 2: rejected accepted=${p2.rejected.accepted} (fp=${p2.rejected.falsePositivesAfter}) | promoted accepted=${p2.promoted.accepted} (delta=+${p2.promoted.delta})`);
  console.log(`  Phase 3: consensus=${p3.consensusReached} | KPIs: ${p3.officers.map((o) => `${o.role}=${o.kpiScore}`).join(', ')}`);
  console.log(`  Phase 4: pushed=${p4.pushedCount}, remoteValid=${p4.remoteValid}/${p4.remoteChecked}, distributedValid=${p4.distributedValid}`);
  if (outPath) {
    console.log(`  Wrote 3D visualization telemetry to: ${outPath}`);
  }
}
