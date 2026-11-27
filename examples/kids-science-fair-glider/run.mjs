#!/usr/bin/env node
/**
 * Kids & School Project Sample 1: Paper Airplane Science Fair Flight Lab
 *
 * Uses Number One (`NumberOneAgent`) to record hypotheses, failed flight trials,
 * verified discoveries, design decisions, deterministic time-travel snapshots,
 * and a printable Science Fair Documentary — exporting real telemetry for the
 * Three.js 3D Flight Lab visualization.
 *
 * Run locally from the repo root (after `npm run build`):
 *   node examples/kids-science-fair-glider/run.mjs
 *
 * In your own school project after `npm install @onimurasame/numberone`, replace the import
 * below with:  import { NumberOneAgent } from '@onimurasame/numberone';
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

export async function runScienceFairGliderSample(outJsonPath = null) {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-kids-glider-'));
  try {
    // 1. Attach Number One to our Science Fair project folder
    const agent = new NumberOneAgent(workspaceDir);
    agent.attach({
      workspaceName: 'Paper Airplane Science Fair Flight Lab',
      installHooks: false,
      installShims: false,
      backfillGitCommits: 0,
      harness: 'kids-science-fair'
    });

    // 2. Write down our starting Science Fair hypothesis
    const hypEvent = agent.recordThinking({
      thought:
        'Hypothesis: Shifting balance slightly toward the nose and folding 1cm upturned wingtips will keep a dart glider flying straight and past 9 meters.',
      tags: ['science-fair', 'hypothesis', 'aerodynamics'],
      harness: 'kids-science-fair'
    });

    // 3. Trial 1 — Baseline flat glider (wobbled at 5.8m)
    const trial1Event = agent.recordThinking({
      thought: 'Trial #1 (Baseline Classic Fold): Flew 5.8 meters, drifted left at 3.2m because wings were uneven.',
      tags: ['flight-test', 'trial-1'],
      harness: 'kids-science-fair'
    });

    // 4. Trial 2 — Dead-End! Tail-weighted dart stalled & dropped at 1.4m
    const deadEndEvent = agent.recordFailedAttempt({
      approach: 'Taped two pennies near the tail fin hoping it would glide upward',
      reason: 'Stalled immediately! Nose pitched up at 1.1m and dropped backward at 1.4m.',
      tags: ['flight-test', 'trial-2', 'dead-end'],
      harness: 'kids-science-fair'
    });

    // 5. Capture our first big Lesson Learned from the stalled trial!
    const lessonNose = agent.captureLesson({
      title: 'Weight belongs near the nose, never the tail',
      problem: 'Tail-weighted paper airplane stalled and dropped at 1.4 meters in Trial #2',
      rootCause: 'Center of gravity sat behind the center of lift on the wings',
      resolution: 'Removed tail pennies and clipped 1 small paperclip to the front nose crease',
      preventionRule: 'Always test balance point near the front third of the wing before throwing!',
      failedApproaches: ['Taping two pennies near the tail fin'],
      tags: ['flight-test', 'aerodynamics', 'balance'],
      severity: 'high',
      harness: 'kids-science-fair',
      causationId: deadEndEvent.id
    });

    // 6. Trial 3 — Nose-weighted dart flew straight to 9.4m!
    const trial3Event = agent.recordThinking({
      thought: 'Trial #3 (1 Paperclip on Nose): Smooth, straight glide all the way to 9.4 meters!',
      tags: ['flight-test', 'trial-3', 'breakthrough'],
      harness: 'kids-science-fair'
    });

    // 7. Trial 4 — Winner! Nose paperclip + 1cm upturned wingtips flew 10.6m!
    const lessonWingtips = agent.captureLesson({
      title: '1cm upturned wingtips stop side-to-side wobble',
      problem: 'High-speed dart still rolled slightly right after 7 meters',
      rootCause: 'Wingtip air vortices caused gentle roll instability late in flight',
      resolution: 'Folded symmetrical 1cm upturned winglets on both wingtips; flight hit 10.6 meters!',
      preventionRule: 'Measure both winglets with a ruler so left and right folds match symmetrically.',
      tags: ['flight-test', 'trial-4', 'winglets'],
      severity: 'medium',
      harness: 'kids-science-fair'
    });

    // 8. Record the final Science Fair design decision & rejected designs
    const decisionEvent = agent.recordDecision({
      title: 'Submit the Nose-Balanced Wingtip Dart for Science Fair Finals',
      decision: 'Use classic dart crease + 1 nose paperclip + symmetrical 1cm upturned wingtips',
      rationale: 'Averaged 10.6 meters across 10 gym throws — 82% farther than baseline and 0 stalls.',
      alternativesRejected: ['Tail-weighted penny dart (stalled at 1.4m)', 'Unweighted classic fold (5.8m)'],
      consequences: ['Easy to fold consistently in 90 seconds', 'Works reliably in indoor gym air'],
      tags: ['science-fair', 'finals'],
      owner: 'student-scientist',
      harness: 'kids-science-fair'
    });

    // 9. Consult Number One before a new classmate tries modifying the plane
    const consultation = agent.consult({
      intent: 'test tail weight on paper airplane flight',
      tags: ['flight-test', 'aerodynamics']
    });

    // 10. Verify tamper-evident stream seal & generate printable Documentary
    const integrity = await agent.verifyIntegrity(false);
    const documentary = agent.buildDocumentary();
    const events = agent.store.readAllEvents();

    // Build deterministic time-travel checkpoints for every sequence in the stream
    const timelineSteps = events.map((ev) => {
      const snap = agent.replay({ untilSeq: ev.seq });
      return {
        seq: ev.seq,
        id: ev.id,
        type: ev.type,
        summary: ev.summary,
        hashShort: ev.hash.slice(0, 12),
        prevHashShort: ev.prevHash.slice(0, 12),
        lessonsCount: Object.keys(snap.lessons).length,
        deadEndsCount: snap.failedAttempts.length,
        decisionsCount: Object.keys(snap.decisions).length,
        tags: ev.tags
      };
    });

    // Flight trajectory curves linked directly to real Number One stream events
    const trials = [
      {
        id: 'trial-1',
        name: 'Trial #1: Baseline Classic Fold',
        status: 'baseline',
        distanceMeters: 5.8,
        peakHeightMeters: 2.0,
        lateralDriftMeters: -0.9,
        color: '#eab308',
        eventSeq: trial1Event.seq,
        eventId: trial1Event.id,
        eventHash: trial1Event.hash.slice(0, 16),
        note: 'Flew 5.8m with a gentle left drift because the wings lacked upturned winglets.'
      },
      {
        id: 'trial-2',
        name: 'Trial #2: Tail-Weighted Pennies (DEAD END)',
        status: 'dead-end',
        distanceMeters: 1.4,
        peakHeightMeters: 2.35,
        lateralDriftMeters: 0.25,
        stalled: true,
        color: '#ef4444',
        eventSeq: deadEndEvent.seq,
        eventId: deadEndEvent.id,
        eventHash: deadEndEvent.hash.slice(0, 16),
        note: 'Recorded via recordFailedAttempt(): nose pitched straight up, stalled, and dropped at 1.4m!'
      },
      {
        id: 'trial-3',
        name: 'Trial #3: 1 Paperclip on Nose (Breakthrough)',
        status: 'breakthrough',
        distanceMeters: 9.4,
        peakHeightMeters: 2.5,
        lateralDriftMeters: 0.35,
        color: '#38bdf8',
        eventSeq: trial3Event.seq,
        eventId: trial3Event.id,
        eventHash: trial3Event.hash.slice(0, 16),
        note: 'Applied Lesson #1 (nose balance): straight, steady glide to 9.4 meters!'
      },
      {
        id: 'trial-4',
        name: 'Trial #4: Nose Paperclip + 1cm Wingtips (WINNER)',
        status: 'winner',
        distanceMeters: 10.6,
        peakHeightMeters: 2.75,
        lateralDriftMeters: 0.05,
        color: '#22c55e',
        eventSeq: decisionEvent.seq,
        eventId: decisionEvent.id,
        eventHash: decisionEvent.hash.slice(0, 16),
        note: 'Winner chosen in ADR Decision: laser-straight flight to 10.6 meters with zero roll!'
      }
    ];

    const sceneData = {
      sampleId: 'kids-science-fair-glider',
      title: 'Paper Airplane Science Fair Flight Lab',
      audience: 'kids',
      workspaceName: 'Paper Airplane Science Fair Flight Lab',
      hypothesisEventSeq: hypEvent.seq,
      integrity: {
        valid: integrity.valid,
        totalEvents: integrity.totalEvents,
        verifiedBlobs: integrity.verifiedBlobs
      },
      consultationPreview: {
        query: 'test tail weight on paper airplane flight',
        matchedLessons: consultation.lessons.map((m) => ({
          title: m.lesson.title,
          preventionRule: m.lesson.preventionRule,
          score: m.score
        })),
        surfacedDeadEnds: consultation.failedAttempts.map((d) => ({
          approach: d.approach,
          reason: d.reason
        }))
      },
      documentaryChapters: documentary.chapters.length,
      lessonsCaptured: [
        { seq: lessonNose.seq, title: 'Weight belongs near the nose, never the tail' },
        { seq: lessonWingtips.seq, title: '1cm upturned wingtips stop side-to-side wobble' }
      ],
      trials,
      timelineSteps
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
  const { sceneData } = await runScienceFairGliderSample(outPath);
  console.log(`[Science Fair Glider Sample] Verified ${sceneData.integrity.totalEvents} hash-chained events (valid=${sceneData.integrity.valid}).`);
  console.log(`  Trials logged: ${sceneData.trials.length} | Lessons: ${sceneData.lessonsCaptured.length} | Documentary chapters: ${sceneData.documentaryChapters}`);
  console.log(`  Consultation surfaced ${sceneData.consultationPreview.matchedLessons.length} lesson(s) & ${sceneData.consultationPreview.surfacedDeadEnds.length} dead-end warning(s).`);
  if (outPath) {
    console.log(`  Wrote 3D visualization telemetry to: ${outPath}`);
  }
}
