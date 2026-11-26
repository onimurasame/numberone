#!/usr/bin/env node
/**
 * Kids & Coding Club Sample 2: RoboHawks Safety Arena & Time-Travel Inspector
 *
 * Uses Number One (`NumberOneAgent`) to manage robotics team build tasks,
 * enforce an L2 blocking indoor motor-speed safety directive via
 * `AuthorityEngine.arbitrate()`, capture a light-sensor calibration lesson,
 * replay exact historical states via `replay({ untilSeq })`, and verify
 * the cryptographic Engineering Notebook seal.
 *
 * Run locally from the repo root (after `npm run build`):
 *   node examples/kids-robotics-arena/run.mjs
 *
 * In your own project after `npm install numberone`, replace the import below
 * with:  import { NumberOneAgent } from 'numberone';
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NumberOneAgent } from '../../dist/index.js';

function parseOutFlag(argv) {
  const idx = argv.indexOf('--out');
  if (idx !== -1 && argv[idx + 1]) return path.resolve(argv[idx + 1]);
  return null;
}

export async function runRoboticsArenaSample(outJsonPath = null) {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-kids-robotics-'));
  try {
    // 1. Initialize the RoboHawks Engineering Notebook
    const robot = new NumberOneAgent(workspaceDir);
    robot.attach({
      workspaceName: 'RoboHawks Line-Follower Arena',
      installHooks: false,
      installShims: false,
      backfillGitCommits: 0,
      harness: 'robotics-club'
    });

    // 2. Open two club build tasks for teammates
    const sensorTask = robot.openIssue({
      title: 'Calibrate line-following light sensor for gym overhead lamps',
      description: 'Measure white foam board vs black electrical tape threshold',
      kind: 'task',
      priority: 'high',
      tags: ['sensors', 'robotics'],
      harness: 'robotics-club'
    });

    const bumperTask = robot.openIssue({
      title: 'Attach foam bumper rails around test table',
      description: 'Protect the rover wheels during speed trials',
      kind: 'task',
      priority: 'medium',
      tags: ['safety', 'mechanics'],
      harness: 'robotics-club'
    });

    // 3. Record last week's skid as a Dead-End so nobody repeats it
    robot.recordFailedAttempt({
      approach: 'Ran motors at setSpeed(100) on smooth classroom table',
      reason: 'Rear wheels spun out at Turn 2 and the rover slid toward the table edge!',
      tags: ['motors', 'safety'],
      harness: 'robotics-club'
    });

    // 4. Issue an authoritative L2 Blocking Safety Directive
    const safetyDirective = robot.issueDirective({
      title: 'Indoor motor power safety cap (<= 80%)',
      directive: 'Keep motor power at or below 80% during indoor classroom table tests.',
      rationale: 'Prevents table-edge skids while keeping lap times fast and predictable.',
      forbiddenPatterns: ['MOTOR_POWER=100', 'setSpeed\\(100\\)'],
      severity: 'blocking',
      scopeTags: ['motors'],
      harness: 'robotics-club'
    });

    // 5. Arbitrate three real driver plans against the L2 Safety Directive!
    const unsafePlan = robot.arbitrate({
      action: 'Run lap trials using setSpeed(100) on the classroom test table',
      intent: 'Full-speed straightaway lap test',
      tags: ['motors'],
      harness: 'student-driver'
    });

    const safePlan = robot.arbitrate({
      action: 'Run smooth cornering lap with setSpeed(75) and calibrated light sensor',
      intent: 'Controlled indoor lap test',
      tags: ['motors'],
      harness: 'student-driver'
    });

    const compliantNegativePlan = robot.arbitrate({
      action: 'Do not use setSpeed(100); instead run at setSpeed(68) for precision tracking',
      intent: 'Precision line-following run',
      tags: ['motors'],
      harness: 'student-driver'
    });

    // 6. Capture sensor calibration lesson and resolve both team tasks
    robot.captureLesson({
      title: 'Re-calibrate light sensor whenever gym lights change',
      problem: 'Rover lost the black track line when classroom blinds opened',
      rootCause: 'Sunlight raised ambient reflectance from 310 to 420',
      resolution: 'Added automatic 3-second startup calibration averaging white and black readings',
      preventionRule: 'Run sensor calibration routine at the start of every practice session.',
      tags: ['sensors', 'calibration'],
      severity: 'high',
      harness: 'robotics-club'
    });

    robot.resolveIssue(String(sensorTask.payload.issueId), 'Auto-calibration threshold locked at 420!', 'robotics-club');
    robot.resolveIssue(String(bumperTask.payload.issueId), 'Foam guardrails mounted around all 4 table edges!', 'robotics-club');

    // 7. Time-travel snapshots across every event sequence in the notebook
    const events = robot.store.readAllEvents();
    const snapshots = events.map((ev) => {
      const state = robot.replay({ untilSeq: ev.seq });
      const issuesList = Object.values(state.issues);
      const openIssues = issuesList.filter((i) => i.status !== 'resolved').length;
      const resolvedIssues = issuesList.filter((i) => i.status === 'resolved').length;
      const activeDirectives = Object.values(state.directives).filter((d) => d.active).length;
      return {
        seq: ev.seq,
        id: ev.id,
        type: ev.type,
        summary: ev.summary,
        hashShort: ev.hash.slice(0, 12),
        openIssues,
        resolvedIssues,
        activeDirectives,
        lessonsCount: Object.keys(state.lessons).length,
        deadEndsCount: state.failedAttempts.length
      };
    });

    const integrity = await robot.verifyIntegrity(false);
    const documentary = robot.buildDocumentary();

    const plans = [
      {
        id: 'unsafe-100',
        label: 'Plan A: setSpeed(100) Full Throttle',
        requestedSpeedPct: 100,
        verdict: unsafePlan.verdict,
        supersedesSession: unsafePlan.supersedesSessionContext,
        blocked: unsafePlan.verdict === 'BLOCK',
        color: '#ef4444',
        conflicts: unsafePlan.conflicts.map((c) => ({
          level: c.level,
          severity: c.severity,
          message: c.message,
          guidance: c.authoritativeGuidance
        })),
        summary: unsafePlan.authoritativeSummary
      },
      {
        id: 'safe-75',
        label: 'Plan B: setSpeed(75) Smooth Cornering',
        requestedSpeedPct: 75,
        verdict: safePlan.verdict,
        supersedesSession: safePlan.supersedesSessionContext,
        blocked: safePlan.verdict === 'BLOCK',
        color: '#22c55e',
        conflicts: safePlan.conflicts.map((c) => ({
          level: c.level,
          severity: c.severity,
          message: c.message,
          guidance: c.authoritativeGuidance
        })),
        summary: safePlan.authoritativeSummary
      },
      {
        id: 'precision-68',
        label: 'Plan C: Negation-Aware Safe Plan (68%)',
        requestedSpeedPct: 68,
        verdict: compliantNegativePlan.verdict,
        supersedesSession: compliantNegativePlan.supersedesSessionContext,
        blocked: compliantNegativePlan.verdict === 'BLOCK',
        color: '#38bdf8',
        conflicts: compliantNegativePlan.conflicts.map((c) => ({
          level: c.level,
          severity: c.severity,
          message: c.message,
          guidance: c.authoritativeGuidance
        })),
        summary: compliantNegativePlan.authoritativeSummary
      }
    ];

    const sceneData = {
      sampleId: 'kids-robotics-arena',
      title: 'RoboHawks Safety Arena & Time-Travel Inspector',
      audience: 'kids',
      workspaceName: 'RoboHawks Line-Follower Arena',
      safetyDirectiveSeq: safetyDirective.seq,
      integrity: {
        valid: integrity.valid,
        totalEvents: integrity.totalEvents,
        verifiedBlobs: integrity.verifiedBlobs
      },
      documentaryChapters: documentary.chapters.length,
      plans,
      snapshots
    };

    if (outJsonPath) {
      fs.mkdirSync(path.dirname(outJsonPath), { recursive: true });
      fs.writeFileSync(outJsonPath, JSON.stringify(sceneData, null, 2) + '\n', 'utf8');
    }

    return { sceneData, documentaryMarkdown: documentary.markdown };
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  const outPath = parseOutFlag(process.argv.slice(2));
  const { sceneData } = await runRoboticsArenaSample(outPath);
  console.log(`[Robotics Arena Sample] Verified ${sceneData.integrity.totalEvents} hash-chained events (valid=${sceneData.integrity.valid}).`);
  for (const p of sceneData.plans) {
    console.log(`  - ${p.label} -> ${p.verdict} (speed=${p.requestedSpeedPct}%, conflicts=${p.conflicts.length})`);
  }
  if (outPath) {
    console.log(`  Wrote 3D visualization telemetry to: ${outPath}`);
  }
}
