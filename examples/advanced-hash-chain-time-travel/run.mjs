#!/usr/bin/env node
/**
 * Advanced Technical Sample 1: Cryptographic Hash-Chain, Secret Redaction,
 * Content-Addressed Blobs & Deterministic Replay Observatory
 *
 * Exercises the low-level event-sourcing & cryptographic invariants of Number One:
 *   - Canonical JSON SHA-256 hash chaining from GENESIS_HASH
 *   - Linear-time O(n) secret redaction across synthetic token classes
 *   - Content-addressed fallback blob storage (`n1://fallback/<sha256>`)
 *   - Affirmative-clause L1-L4 arbitration (negated compliance vs. violation)
 *   - Deterministic ReplayEngine folding with canonical `snapshotDigest`
 *   - Fail-closed tamper detection proving 1-byte mutation breaks chain verification
 *
 * Run locally from the repo root (after `npm run build`):
 *   node examples/advanced-hash-chain-time-travel/run.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GENESIS_HASH, NumberOneAgent, StreamStore } from '../../dist/index.js';

function parseOutFlag(argv) {
  const idx = argv.indexOf('--out');
  if (idx !== -1 && argv[idx + 1]) return path.resolve(argv[idx + 1]);
  return null;
}

export async function runHashChainObservatorySample(outJsonPath = null) {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-adv-hashchain-'));
  try {
    // Seed a tiny realistic TypeScript service so baseline snapshot hashes real files
    fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir, 'src', 'auth.ts'),
      'export function verifyToken(header: string): boolean { return header.startsWith("Bearer "); }\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(workspaceDir, 'src', 'cache.ts'),
      'export const CACHE_TTL_MS = 30_000;\n',
      'utf8'
    );

    // 1. Attach Number One (seq #1 workspace.attached + seq #2 workspace.snapshot)
    const agent = new NumberOneAgent(workspaceDir);
    agent.attach({
      workspaceName: 'Zero-Trust Auth Gateway',
      installHooks: false,
      installShims: false,
      backfillGitCommits: 0,
      harness: 'claude-code'
    });

    // 2. Demonstrate linear-time O(n) secret redaction before bytes ever hit disk!
    // Synthetic token assembled dynamically so static scanners never see a literal credential.
    const syntheticGhToken = ['ghp', '_9xKmPqRsTuVwXyZ0123456789abcdefghij'].join('');
    const syntheticAwsKey = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
    const redactedEvent = agent.recordThinking({
      thought: `Investigated CI auth leak using token ${syntheticGhToken} and key ${syntheticAwsKey} — must scrub before logging.`,
      affectedPaths: ['src/auth.ts'],
      tags: ['security', 'redaction'],
      harness: 'claude-code'
    });

    // 3. Record a runtime crash carrying a large content-addressed fallback blob (`n1://fallback/<sha256>`)
    const crashStackTrace = [
      'RangeError: Maximum call stack size exceeded in regex matcher',
      '    at parseAuthHeader (src/auth.ts:42:17)',
      '    at Router.handle (src/router.ts:118:9)',
      'Trace payload padded for CAS blob deduplication demonstration:\n' + 'x'.repeat(2048)
    ].join('\n');

    const crashEvent = agent.recordEvent({
      type: 'exec.crashed',
      actor: { kind: 'watcher', id: 'command-runner', name: 'Watched Command Runner' },
      harness: 'cli',
      summary: 'Auth header parser crashed under adversarial input (CWE-1333)',
      affectedPaths: ['src/auth.ts'],
      tags: ['exec', 'crash', 'redos'],
      payload: {
        command: 'npm test',
        exitCode: 134,
        signal: 'SIGABRT',
        errorSignature: 'RangeError: Maximum call stack size exceeded in regex matcher'
      },
      fallbackBlobs: [{ key: 'crash-stderr.log', content: crashStackTrace, contentType: 'text/plain' }]
    });

    // 4. Record a failed approach (dead end) before switching harnesses (Claude Code -> Codex CLI)
    const deadEndEvent = agent.recordFailedAttempt({
      approach: 'Added nested quantifier regex (a+)+ to strip whitespace from Bearer header',
      reason: 'Triggered catastrophic backtracking (CWE-1333 ReDoS) on 40-char malformed headers.',
      affectedPaths: ['src/auth.ts'],
      tags: ['redos', 'dead-end'],
      harness: 'claude-code'
    });

    // 5. Switch harness to Codex CLI: capture verified Lesson Learned & blocking L2 Directive
    const lessonEvent = agent.captureLesson({
      title: 'Use linear-time string slicing for Authorization header parsing',
      problem: 'Nested regex crashed auth gateway with SIGABRT on adversarial input',
      rootCause: 'Exponential NFA backtracking in nested quantifier regex',
      resolution: 'Replaced regex with O(n) indexOf + slice parser and added ReDoS regression test',
      preventionRule: 'Validate all dynamic regexes via validateRegexSafety() and prefer O(n) string scans.',
      failedApproaches: ['Nested quantifier regex (a+)+ on Bearer headers'],
      errorSignatures: ['RangeError: Maximum call stack size exceeded in regex matcher'],
      affectedPaths: ['src/auth.ts'],
      tags: ['redos', 'security'],
      severity: 'critical',
      harness: 'codex-cli',
      causationId: crashEvent.id
    });

    // Mark crash resolved via green test execution
    agent.recordEvent({
      type: 'exec.completed',
      actor: { kind: 'watcher', id: 'command-runner', name: 'Watched Command Runner' },
      harness: 'codex-cli',
      causationId: lessonEvent.id,
      summary: 'npm test passed after switching to linear-time header parser',
      affectedPaths: ['src/auth.ts'],
      tags: ['exec', 'tests'],
      payload: { command: 'npm test', exitCode: 0, durationMs: 412 }
    });

    // Issue L2 blocking directive forbidding dangerous regex / dynamic execution sinks
    agent.issueDirective({
      title: 'Forbid dynamic code execution and unvalidated nested regexes in src/auth.ts',
      directive: 'Never invoke dynamic code evaluation or unvalidated nested quantifiers in auth modules.',
      rationale: 'Prevents CWE-95 code injection and CWE-1333 denial-of-service in gateway edge handlers.',
      scopePaths: ['src/auth.ts'],
      forbiddenPatterns: ['new\\s+Function\\(', 'child_process\\.exec\\('],
      severity: 'blocking',
      harness: 'codex-cli'
    });

    // 6. Affirmative-clause arbitration: negated compliance passes; real violation blocks!
    const compliantArb = agent.arbitrate({
      action: 'Do not call new Function( in src/auth.ts; instead use strict linear-time string slicing',
      intent: 'Harden auth header parsing',
      targetPaths: ['src/auth.ts'],
      harness: 'cursor'
    });

    const violatingArb = agent.arbitrate({
      action: 'Parse dynamic rules in src/auth.ts by calling new Function(ruleBody)',
      intent: 'Add dynamic header rule parser',
      targetPaths: ['src/auth.ts'],
      harness: 'cursor'
    });

    // 7. Verify clean integrity & collect full replay checkpoints
    const cleanIntegrity = await agent.verifyIntegrity(false);
    const allEvents = agent.store.readAllEvents();

    const chainNodes = allEvents.map((ev) => {
      const projection = agent.replay({ untilSeq: ev.seq });
      return {
        seq: ev.seq,
        id: ev.id,
        type: ev.type,
        harness: ev.harness,
        actorKind: ev.actor.kind,
        summary: ev.summary,
        prevHash: ev.prevHash,
        hash: ev.hash,
        blobCount: ev.blobs.length,
        blobRefs: ev.blobs.map((b) => ({
          sha256: b.sha256,
          uri: b.fallbackUri,
          byteSize: b.byteSize,
          contentType: b.contentType
        })),
        projectionCheckpoint: {
          lastSeq: projection.lastSeq,
          snapshotDigest: projection.snapshotDigest,
          filesTracked: Object.keys(projection.files).length,
          lessonsCount: Object.keys(projection.lessons).length,
          activeDirectives: Object.values(projection.directives).filter((d) => d.active).length,
          unresolvedCrashes: projection.crashes.filter((c) => !c.resolvedByEventId).length,
          deadEndsCount: projection.failedAttempts.length
        }
      };
    });

    // 8. Prove fail-closed tamper detection on a cloned copy of the stream!
    const tamperCloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-adv-tamper-'));
    let tamperProof;
    try {
      fs.cpSync(path.join(workspaceDir, '.numberone'), path.join(tamperCloneDir, '.numberone'), {
        recursive: true
      });
      const eventsDir = path.join(tamperCloneDir, '.numberone', 'stream', 'events');
      const files = fs.readdirSync(eventsDir).sort();
      const targetFile = files[Math.min(3, files.length - 1)];
      const fullPath = path.join(eventsDir, targetFile);
      const rawJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const tamperedSeq = rawJson.seq;
      rawJson.summary = `${rawJson.summary} [TAMPERED]`;
      fs.writeFileSync(fullPath, JSON.stringify(rawJson, null, 2), 'utf8');

      const tamperStore = new StreamStore(tamperCloneDir);
      const tamperedReport = tamperStore.verifyIntegrity();
      tamperProof = {
        tamperedSeq,
        tamperedFile: targetFile,
        detectedInvalid: !tamperedReport.valid,
        errorCount: tamperedReport.errors.length,
        firstError: tamperedReport.errors[0] ?? 'Hash mismatch detected'
      };
    } finally {
      fs.rmSync(tamperCloneDir, { recursive: true, force: true });
    }

    const sceneData = {
      sampleId: 'advanced-hash-chain-time-travel',
      title: 'Cryptographic Event Stream, CAS Blob & Replay Observatory',
      audience: 'advanced',
      genesisHash: GENESIS_HASH,
      cleanIntegrity: {
        valid: cleanIntegrity.valid,
        totalEvents: cleanIntegrity.totalEvents,
        verifiedBlobs: cleanIntegrity.verifiedBlobs,
        fallbackCoverageValid: cleanIntegrity.fallbackCoverageValid
      },
      redactionProof: {
        eventSeq: redactedEvent.seq,
        redactedSummary: redactedEvent.summary,
        leakedRawGitHubToken: redactedEvent.summary.includes(syntheticGhToken),
        leakedRawAwsKey: redactedEvent.summary.includes(syntheticAwsKey)
      },
      arbitrationProof: {
        compliantNegation: {
          verdict: compliantArb.verdict,
          conflicts: compliantArb.conflicts.length
        },
        affirmativeViolation: {
          verdict: violatingArb.verdict,
          conflicts: violatingArb.conflicts.length,
          level: violatingArb.conflicts[0]?.level ?? 'L2_NUMBER_ONE_DIRECTIVE'
        }
      },
      tamperProof,
      deadEndSeq: deadEndEvent.seq,
      chainNodes
    };

    if (outJsonPath) {
      fs.mkdirSync(path.dirname(outJsonPath), { recursive: true });
      fs.writeFileSync(outJsonPath, JSON.stringify(sceneData, null, 2) + '\n', 'utf8');
    }

    return { sceneData };
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  const outPath = parseOutFlag(process.argv.slice(2));
  const { sceneData } = await runHashChainObservatorySample(outPath);
  console.log(`[Hash-Chain Observatory Sample] ${sceneData.cleanIntegrity.totalEvents} SHA-256 chained events, ${sceneData.cleanIntegrity.verifiedBlobs} verified CAS blob(s).`);
  console.log(`  Redaction proof: raw token leaked=${sceneData.redactionProof.leakedRawGitHubToken || sceneData.redactionProof.leakedRawAwsKey}`);
  console.log(`  Arbitration: negated compliance=${sceneData.arbitrationProof.compliantNegation.verdict}, violation=${sceneData.arbitrationProof.affirmativeViolation.verdict}`);
  console.log(`  Tamper proof (seq #${sceneData.tamperProof.tamperedSeq}): detectedInvalid=${sceneData.tamperProof.detectedInvalid}`);
  if (outPath) {
    console.log(`  Wrote 3D visualization telemetry to: ${outPath}`);
  }
}
