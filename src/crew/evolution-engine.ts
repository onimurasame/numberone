import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { ReplayEngine } from '../core/replay-engine.js';
import { StreamStore } from '../core/stream-store.js';
import { KnowledgePractice, OfficerRole, WorkspaceProjection } from '../core/types.js';
import { buildSanitizedChildEnv } from '../utils/redactor.js';
import { validateRegexSafety } from '../utils/safe-regex.js';
import { evaluatePracticeMatcherOnVirtualFiles } from './base-officer.js';
import { createDefaultCrewRoster } from './party-mode.js';
import {
  CrewOfficer,
  EvolutionVerdict,
  KnowledgeUpdateProposal,
  VerificationSample
} from './types.js';

export const KnowledgeUpdateProposalSchema = z.object({
  officer: z.enum(['engineering', 'security', 'bridge']),
  practice: z.object({
    id: z.string().min(2).max(120).regex(/^[a-zA-Z0-9._-]+$/),
    title: z.string().min(3).max(200),
    category: z.string().min(2).max(80),
    description: z.string().min(3).max(1000),
    ruleType: z.enum(['check', 'tool', 'methodology', 'process', 'control']),
    targetKpi: z.string().min(2).max(80),
    weight: z.number().min(1).max(100).optional(),
    evidenceSummary: z.string().min(3).max(1000),
    evidenceSources: z.array(z.string().min(1)).default([]),
    matcher: z
      .object({
        fileGlob: z.string().min(1).max(256).refine((s) => !s.includes('\0'), 'null byte disallowed').optional(),
        contentRegex: z.string().min(1).max(512).optional(),
        missingFile: z.string().min(1).max(256).refine((s) => !s.includes('\0'), 'null byte disallowed').optional(),
        requiredContentRegex: z.string().min(1).max(512).optional(),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional()
      })
      .optional()
  }),
  proof: z.object({
    kind: z.enum(['counterfactual_replay', 'empirical_benchmark']),
    sources: z.array(z.string().min(1)),
    methodology: z.string(),
    counterfactualEventIds: z.array(z.string().min(1)).optional(),
    positiveSamples: z.array(z.object({ path: z.string().min(1), content: z.string() })).optional(),
    negativeSamples: z.array(z.object({ path: z.string().min(1), content: z.string() })).optional(),
    reproducibleCommand: z.string().max(1000).optional()
  }),
  allowCrossKpiTradeoff: z.boolean().optional()
});

export interface ProposeUpdateOptions {
  /**
   * Security gate (CWE-78): defaults to `false`.
   * Shell execution of `proof.reproducibleCommand` is ONLY permitted when explicitly
   * opted in by a trusted local operator (never over untrusted MCP inputs).
   */
  allowCommandExecution?: boolean;
}

export interface AuditRegressionOptions {
  /**
   * By default, valid stricter rules that genuinely catch new workspace defects are NOT
   * auto-reverted just because the workspace's live score dropped when a defect appeared.
   * Set true to explicitly force reverting on any live score drop.
   */
  forceRevertOnStrictnessDrop?: boolean;
}

/**
 * Empirically Verified KPI-Gated Knowledge Evolution Engine.
 *
 * Security & Verification Guarantees:
 *  - Full Zod schema validation of proposals
 *  - Static ReDoS safety validation of all proposed matcher regexes
 *  - Shell command execution (`empirical_benchmark`) disabled by default (`allowCommandExecution: false`);
 *    when explicitly opted in, executes with credential-stripped environment (`buildSanitizedChildEnv`)
 *    and strict timeout/buffer caps
 *  - Real counterfactual matcher corpus execution & real cross-officer KPI regression simulation
 */
export class KnowledgeEvolutionEngine {
  private readonly store: StreamStore;
  private readonly replay: ReplayEngine;
  private readonly roster: Record<OfficerRole, CrewOfficer>;
  private readonly minProvenDelta: number;

  constructor(
    store: StreamStore,
    replay: ReplayEngine,
    roster?: Record<OfficerRole, CrewOfficer>,
    minProvenDelta = 0.5
  ) {
    this.store = store;
    this.replay = replay;
    this.roster = roster ?? createDefaultCrewRoster();
    this.minProvenDelta = minProvenDelta;
  }

  public proposeUpdate(
    rawProposal: KnowledgeUpdateProposal,
    options: ProposeUpdateOptions = {}
  ): EvolutionVerdict {
    const proposal = KnowledgeUpdateProposalSchema.parse(rawProposal) as KnowledgeUpdateProposal;
    const officer = this.roster[proposal.officer];
    const reasons: string[] = [];

    const proposedEv = this.store.append({
      type: 'officer.knowledge.proposed',
      actor: { kind: 'officer', id: proposal.officer, name: officer.title },
      harness: 'evolution-engine',
      summary: `Proposed expertise update for ${proposal.officer}: ${proposal.practice.title}`,
      tags: ['evolution', 'proposal', proposal.officer],
      payload: {
        officer: proposal.officer,
        practiceId: proposal.practice.id,
        targetKpi: proposal.practice.targetKpi,
        proofKind: proposal.proof.kind
      }
    });

    // Gate 1: Target KPI must match the officer's main KPI and not collide with baseline IDs
    if (proposal.practice.targetKpi !== officer.mainKpiName) {
      reasons.push(
        `Target KPI mismatch: ${proposal.officer} main KPI is "${officer.mainKpiName}", got "${proposal.practice.targetKpi}".`
      );
    }
    const baselineIds = new Set(officer.getBaselinePractices().map((b) => b.id));
    if (baselineIds.has(proposal.practice.id)) {
      reasons.push(
        `Practice ID "${proposal.practice.id}" collides with a built-in baseline practice for ${proposal.officer}; use a distinct evolved practice ID.`
      );
    }

    // Gate 2: Methodology and source references required
    if (!proposal.proof.methodology || proposal.proof.methodology.trim().length < 15) {
      reasons.push('Proof requires a concrete verification methodology (>=15 chars).');
    }
    if (!proposal.proof.sources || proposal.proof.sources.length === 0) {
      reasons.push('Proof must cite at least one verifiable empirical source or stream event.');
    }

    // Gate 2b: Static ReDoS safety verification on any proposed regex matchers
    if (proposal.practice.matcher?.contentRegex) {
      const safety = validateRegexSafety(proposal.practice.matcher.contentRegex);
      if (!safety.safe) {
        reasons.push(`Unsafe practice.matcher.contentRegex rejected: ${safety.reason}`);
      }
    }
    if (proposal.practice.matcher?.requiredContentRegex) {
      const safety = validateRegexSafety(proposal.practice.matcher.requiredContentRegex);
      if (!safety.safe) {
        reasons.push(`Unsafe practice.matcher.requiredContentRegex rejected: ${safety.reason}`);
      }
    }

    const stateBefore = this.replay.getCurrentState();
    const existingActiveMatchers = Object.values(
      stateBefore.officers[proposal.officer]?.practices ?? {}
    ).filter((p) => p.active && p.matcher);

    let truePositivesBefore = 0;
    let truePositivesAfter = 0;
    let falsePositivesAfter = 0;
    let measuredDelta = 0;
    let commandExecuted: string | undefined;

    // Gate 3: Actual Empirical / Counterfactual Execution
    if (proposal.proof.kind === 'counterfactual_replay') {
      const eventIds = proposal.proof.counterfactualEventIds ?? [];
      if (eventIds.length === 0) {
        reasons.push(
          'Counterfactual replay proof must reference at least one real event ID in .numberone/stream.'
        );
      }
      const eventDerivedSamples: VerificationSample[] = [];
      for (const id of eventIds) {
        const ev = this.store.getEventById(id);
        if (!ev) {
          reasons.push(`Counterfactual replay references nonexistent stream event: ${id}`);
          continue;
        }
        for (const blob of ev.blobs) {
          const text = this.store.readBlobUtf8(blob.sha256);
          if (text !== null) {
            eventDerivedSamples.push({
              path: ev.affectedPaths[0] ?? `${ev.id}-${blob.key}`,
              content: text
            });
          }
        }
      }

      if (!proposal.practice.matcher) {
        reasons.push(
          'Counterfactual replay proof requires an executable `practice.matcher` to verify detection on historical cases.'
        );
      } else if (reasons.length === 0) {
        const positiveCases: VerificationSample[][] = [];
        for (const sample of proposal.proof.positiveSamples ?? []) {
          positiveCases.push([sample]);
        }
        // Always include event-derived blobs when present so unrelated stream event IDs with blobs
        // cannot be cited to rubber-stamp synthetic positiveSamples!
        if (eventDerivedSamples.length > 0) {
          positiveCases.push(eventDerivedSamples);
        }
        if (
          positiveCases.length === 0 &&
          proposal.practice.matcher.missingFile &&
          eventIds.length > 0
        ) {
          positiveCases.push([]);
        }

        if (positiveCases.length === 0) {
          reasons.push(
            'Counterfactual replay requires defective `positiveSamples` or stream event blobs to measure detection gain.'
          );
        } else {
          const negativeSamples = proposal.proof.negativeSamples ?? [];
          if (negativeSamples.length === 0) {
            reasons.push(
              'Counterfactual replay requires at least one clean `negativeSamples` entry to verify 0% false-positive rate.'
            );
          }

          for (const caseFiles of positiveCases) {
            const caughtBefore = existingActiveMatchers.some(
              (p) => evaluatePracticeMatcherOnVirtualFiles(p, caseFiles).violated
            );
            const caughtByCandidate = evaluatePracticeMatcherOnVirtualFiles(
              proposal.practice,
              caseFiles
            ).violated;
            if (caughtBefore) truePositivesBefore++;
            if (caughtBefore || caughtByCandidate) truePositivesAfter++;
          }

          // If event-derived blobs existed alongside synthetic positiveSamples, ensure the candidate
          // actually caught at least one event-derived blob rather than ignoring the referenced incident
          if (
            eventDerivedSamples.length > 0 &&
            (proposal.proof.positiveSamples?.length ?? 0) > 0 &&
            !evaluatePracticeMatcherOnVirtualFiles(proposal.practice, eventDerivedSamples).violated
          ) {
            reasons.push(
              'Candidate matcher did not detect any defect in the blobs of the referenced counterfactualEventIds.'
            );
          }

          if (negativeSamples.length > 0) {
            const fp = evaluatePracticeMatcherOnVirtualFiles(proposal.practice, negativeSamples);
            if (fp.violated) {
              falsePositivesAfter = 1;
              reasons.push(
                `Candidate matcher produced false positive on clean negativeSamples: ${fp.evidence}`
              );
            }
          }

          const recallBefore = (truePositivesBefore / positiveCases.length) * 100;
          const recallAfter = (truePositivesAfter / positiveCases.length) * 100;
          measuredDelta = Math.round((recallAfter - recallBefore) * 100) / 100;

          if (measuredDelta < this.minProvenDelta) {
            reasons.push(
              `Counterfactual verification showed zero new defect detection: recallBefore=${recallBefore.toFixed(1)}%, recallAfter=${recallAfter.toFixed(1)}% (delta=${measuredDelta}).`
            );
          }
        }
      }
    } else if (proposal.proof.kind === 'empirical_benchmark') {
      if (!proposal.proof.reproducibleCommand) {
        reasons.push(
          'Empirical benchmark proof requires an executable `reproducibleCommand` outputting {"kpiBefore": number, "kpiAfter": number}.'
        );
      } else if (options.allowCommandExecution !== true) {
        reasons.push(
          'Benchmark shell command execution is disabled by default for security (CWE-78). Re-run with explicit local opt-in (`--allow-exec` / `allowCommandExecution: true`) or use `counterfactual_replay`.'
        );
      } else if (proposal.proof.reproducibleCommand.includes('\0')) {
        reasons.push('Benchmark command contains disallowed null byte.');
      } else {
        commandExecuted = proposal.proof.reproducibleCommand;
        const proc = spawnSync(proposal.proof.reproducibleCommand, {
          cwd: this.store.workspaceRoot,
          shell: true,
          encoding: 'utf8',
          env: buildSanitizedChildEnv(process.env),
          timeout: 15_000,
          maxBuffer: 1_048_576
        });
        if (proc.status !== 0) {
          reasons.push(
            `Benchmark command exited with status ${proc.status ?? 'null'}: ${(proc.stderr || proc.stdout || '').trim().slice(0, 200)}`
          );
        } else {
          try {
            const lines = (proc.stdout ?? '')
              .trim()
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean);
            const jsonLine = lines.reverse().find((l) => l.startsWith('{') && l.endsWith('}'));
            if (!jsonLine) {
              throw new Error('No JSON metric object found on stdout');
            }
            const parsed = JSON.parse(jsonLine) as {
              kpiBefore?: unknown;
              kpiAfter?: unknown;
            };
            if (
              typeof parsed.kpiBefore !== 'number' ||
              typeof parsed.kpiAfter !== 'number' ||
              !Number.isFinite(parsed.kpiBefore) ||
              !Number.isFinite(parsed.kpiAfter)
            ) {
              throw new Error('JSON output must contain finite numeric kpiBefore and kpiAfter');
            }
            measuredDelta = Math.round((parsed.kpiAfter - parsed.kpiBefore) * 100) / 100;
            if (measuredDelta < this.minProvenDelta) {
              reasons.push(
                `Executed benchmark command measured insufficient KPI delta: ${measuredDelta} (before=${parsed.kpiBefore}, after=${parsed.kpiAfter}; min=+${this.minProvenDelta}).`
              );
            }
          } catch (err) {
            reasons.push(
              `Invalid benchmark output from "${proposal.proof.reproducibleCommand}": ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }
    }

    // Gate 4: Real Cross-Officer KPI Simulation
    const scoresBefore: Record<OfficerRole, number> = {
      engineering: this.roster.engineering.assess(this.store.workspaceRoot, stateBefore).kpiScore,
      security: this.roster.security.assess(this.store.workspaceRoot, stateBefore).kpiScore,
      bridge: this.roster.bridge.assess(this.store.workspaceRoot, stateBefore).kpiScore
    };

    const existingPractice = stateBefore.officers[proposal.officer]?.practices[proposal.practice.id];
    const nextVersion = (existingPractice?.version ?? 0) + 1;
    const candidatePractice: KnowledgePractice = {
      ...proposal.practice,
      provenKpiDelta: measuredDelta,
      evidenceSources: Array.from(
        new Set([...proposal.practice.evidenceSources, ...proposal.proof.sources])
      ),
      addedAt: new Date().toISOString(),
      version: nextVersion,
      active: true
    };

    const simulatedState: WorkspaceProjection = structuredClone(stateBefore);
    simulatedState.officers[proposal.officer].practices[candidatePractice.id] = candidatePractice;
    simulatedState.officers[proposal.officer].knowledgeVersion += 1;

    const scoresAfter: Record<OfficerRole, number> = {
      engineering: this.roster.engineering.assess(this.store.workspaceRoot, simulatedState).kpiScore,
      security: this.roster.security.assess(this.store.workspaceRoot, simulatedState).kpiScore,
      bridge: this.roster.bridge.assess(this.store.workspaceRoot, simulatedState).kpiScore
    };

    const crossKpiImpact: Record<OfficerRole, number> = {
      engineering: Math.round((scoresAfter.engineering - scoresBefore.engineering) * 10) / 10,
      security: Math.round((scoresAfter.security - scoresBefore.security) * 10) / 10,
      bridge: Math.round((scoresAfter.bridge - scoresBefore.bridge) * 10) / 10
    };

    for (const role of ['engineering', 'security', 'bridge'] as const) {
      if (role !== proposal.officer && crossKpiImpact[role] < 0 && !proposal.allowCrossKpiTradeoff) {
        reasons.push(
          `Candidate practice caused cross-officer KPI regression on ${role} (${crossKpiImpact[role]}).`
        );
      }
    }

    const verificationMetrics = {
      truePositivesBefore,
      truePositivesAfter,
      falsePositivesAfter,
      commandExecuted
    };

    if (reasons.length > 0) {
      const rejectEv = this.store.append({
        type: 'officer.knowledge.rejected',
        actor: { kind: 'numberone', id: 'evolution-engine', name: 'Number One Evolution Gate' },
        harness: 'evolution-engine',
        causationId: proposedEv.id,
        summary: `Rejected knowledge update "${proposal.practice.title}" for ${proposal.officer}: ${reasons[0]}`,
        tags: ['evolution', 'rejected', proposal.officer],
        payload: {
          officer: proposal.officer,
          practiceId: proposal.practice.id,
          measuredDelta,
          verificationMetrics,
          crossKpiImpact,
          reasons
        }
      });

      return {
        accepted: false,
        officer: proposal.officer,
        practiceId: proposal.practice.id,
        measuredKpiDelta: measuredDelta,
        reasons,
        eventId: rejectEv.id,
        verificationMetrics,
        crossKpiImpact
      };
    }

    const updateEv = this.store.append({
      type: 'officer.knowledge.updated',
      actor: { kind: 'numberone', id: 'evolution-engine', name: 'Number One Evolution Gate' },
      harness: 'evolution-engine',
      causationId: proposedEv.id,
      summary: `Promoted verified practice for ${proposal.officer}: "${candidatePractice.title}" (+${measuredDelta} ${
        proposal.proof.kind === 'counterfactual_replay' ? 'detection recall' : officer.mainKpiName
      })`,
      tags: ['evolution', 'promoted', proposal.officer, officer.mainKpiName],
      payload: {
        officer: proposal.officer,
        practice: candidatePractice,
        proof: {
          kind: proposal.proof.kind,
          sources: proposal.proof.sources,
          methodology: proposal.proof.methodology,
          counterfactualEventIds: proposal.proof.counterfactualEventIds,
          reproducibleCommand: proposal.proof.reproducibleCommand
        },
        measuredDelta,
        verificationMetrics,
        scoresBefore,
        scoresAfter,
        crossKpiImpact
      }
    });

    return {
      accepted: true,
      officer: proposal.officer,
      practiceId: candidatePractice.id,
      measuredKpiDelta: measuredDelta,
      reasons: [
        `Verified via ${proposal.proof.kind}: measured gain +${measuredDelta} with 0 false positives.`
      ],
      eventId: updateEv.id,
      verificationMetrics,
      crossKpiImpact
    };
  }

  public revertPractice(officerRole: OfficerRole, practiceId: string, reason: string): string {
    const ev = this.store.append({
      type: 'officer.knowledge.reverted',
      actor: { kind: 'numberone', id: 'evolution-engine', name: 'Number One Evolution Gate' },
      harness: 'evolution-engine',
      summary: `Reverted practice "${practiceId}" for ${officerRole}: ${reason}`,
      tags: ['evolution', 'reverted', officerRole],
      payload: {
        officer: officerRole,
        practiceId,
        reason
      }
    });
    return ev.id;
  }

  public auditLiveRegressions(
    officerRole: OfficerRole,
    regressionThreshold = 5,
    options: AuditRegressionOptions = {}
  ): string[] {
    const state = this.replay.getCurrentState();
    const officerState = state.officers[officerRole];
    const history = officerState.kpiHistory;
    if (history.length < 2) return [];

    const latest = history[history.length - 1]!;
    const previous = history[history.length - 2]!;
    const drop = previous.score - latest.score;
    if (drop < regressionThreshold) return [];

    const activeEvolved = Object.values(officerState.practices)
      .filter((p) => p.active)
      .sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''));

    if (activeEvolved.length === 0) return [];
    const newest = activeEvolved[0]!;

    // Guard: do NOT auto-revert a valid stricter practice simply because it caught real defects
    // in the workspace! Re-evaluate the officer to distinguish broken matchers from valid detections.
    const liveAssessment = this.roster[officerRole].assess(this.store.workspaceRoot, state);
    const evolvedCheck = liveAssessment.checks.find((c) => c.id === `evolved-${newest.id}`);
    const isBrokenMatcher = Boolean(evolvedCheck?.evidence.startsWith('Skipped unsafe'));
    const causedValidDetectionDrop = Boolean(
      evolvedCheck && !evolvedCheck.passed && !isBrokenMatcher
    );

    if (causedValidDetectionDrop && !options.forceRevertOnStrictnessDrop) {
      return [];
    }

    this.revertPractice(
      officerRole,
      newest.id,
      isBrokenMatcher
        ? `Evolved practice matcher skipped as unsafe during live audit (KPI dropped ${previous.score} -> ${latest.score}).`
        : `Live ${officerState.mainKpiName} dropped by ${drop.toFixed(1)} points (${previous.score} -> ${latest.score}).`
    );
    return [newest.id];
  }
}
