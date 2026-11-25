import { LessonEngine } from '../core/lesson-engine.js';
import { ReplayEngine } from '../core/replay-engine.js';
import { StreamStore } from '../core/stream-store.js';
import { DirectiveRecord, OfficerRole, WorkspaceProjection } from '../core/types.js';
import { generateUlid } from '../core/ulid.js';
import { BridgeOfficer } from './bridge-officer.js';
import { EngineeringOfficer } from './engineering-officer.js';
import { LlmProvider, PluggableLlmProvider } from './llm-provider.js';
import { SecurityOfficer } from './security-officer.js';
import {
  ChallengeResolution,
  CrewOfficer,
  FindingSeverity,
  OfficerAssessment,
  OfficerDecisionRow,
  OfficerFinding,
  PartyModeOptions,
  PartyModeSessionResult,
  PeerChallenge,
  RemediationItem,
  RoundtableTurn
} from './types.js';

export function createDefaultCrewRoster(): Record<OfficerRole, CrewOfficer> {
  return {
    engineering: new EngineeringOfficer(),
    security: new SecurityOfficer(),
    bridge: new BridgeOfficer()
  };
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

const TOPIC_KEYWORDS: Record<OfficerRole, RegExp[]> = {
  engineering: [
    /\b(infra|docker|container|k8s|kubernetes|helm|terraform|pulumi|env|runtime|deploy|port|server|crash|boot|config|runbook|iam|access)\b/gi
  ],
  security: [
    /\b(sec|security|vuln|cve|auth|token|key|password|secret|sast|sca|sbom|cors|tls|sql|xss|injection|audit|quality|lint|compliance|ssrf|redos)\b/gi
  ],
  bridge: [
    /\b(release|ci|cd|pipeline|workflow|test|tests|rollback|canary|deploy|version|changelog|dora|ship|merge|publish|delivery)\b/gi
  ]
};

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

function countKeywordHits(text: string, patterns: RegExp[]): number {
  let total = 0;
  for (const rx of patterns) {
    rx.lastIndex = 0;
    const matches = text.match(rx);
    if (matches) total += matches.length;
  }
  return total;
}

function deriveContextualForbiddenPatterns(blockingFindings: OfficerFinding[]): string[] {
  const patterns = new Set<string>(['skip.*security', '--no-verify', 'force-deploy']);
  for (const f of blockingFindings) {
    const id = f.id.toLowerCase();
    if (id.includes('eval')) patterns.add('\\beval\\s*\\(');
    if (id.includes('tls-disabled')) patterns.add('rejectUnauthorized\\s*:\\s*false');
    if (id.includes('docker-root')) patterns.add('^\\s*USER\\s+(?:root|0)\\b');
    if (id.includes('k8s-privileged')) patterns.add('privileged\\s*:\\s*true');
    if (id.includes('iac-open-ingress')) patterns.add('0\\.0\\.0\\.0/0');
    if (id.includes('gha-write-all')) patterns.add('permissions\\s*:\\s*write-all');
    if (id.includes('no-tests')) patterns.add('--skip-tests|skip.*tests');
  }
  return Array.from(patterns);
}

/**
 * Deterministic Round 2 Peer Challenge Verification.
 * Cross-checks every peer challenge emitted in Round 1 against the target officer's
 * concrete `CheckEvaluation[]` and `OfficerFinding[]` evidence (zero canned puppet text).
 */
export function resolvePeerChallenges(
  assessments: OfficerAssessment[]
): ChallengeResolution[] {
  const byRole = new Map<OfficerRole, OfficerAssessment>();
  for (const a of assessments) {
    byRole.set(a.officer, a);
  }

  const resolutions: ChallengeResolution[] = [];

  for (const source of assessments) {
    for (const ch of source.challengesToPeers) {
      const relatedIds = ch.relatedFindingIds ?? [];
      if (ch.targetOfficer !== 'workspace' && !byRole.has(ch.targetOfficer)) {
        continue;
      }

      if (ch.targetOfficer === 'workspace') {
        const failedChecks = source.checks
          .filter((c) => c.applicable && !c.passed)
          .map((c) => c.id);
        resolutions.push({
          fromOfficer: source.officer,
          targetOfficer: 'workspace',
          challenge: ch.challenge,
          rationale: ch.rationale,
          relatedFindingIds: relatedIds,
          status: 'ESCALATED',
          respondingOfficer: 'numberone',
          evidenceCheckIds: failedChecks.slice(0, 5),
          responseSummary: `Escalated workspace action from ${source.officer}: ${ch.challenge} (backed by ${relatedIds.join(', ') || failedChecks.join(', ') || 'officer assessment'}).`
        });
        continue;
      }

      const target = byRole.get(ch.targetOfficer)!;
      resolutions.push(resolveSinglePeerChallenge(source, target, ch));
    }
  }

  return resolutions;
}

function resolveSinglePeerChallenge(
  source: OfficerAssessment,
  target: OfficerAssessment,
  ch: PeerChallenge
): ChallengeResolution {
  const relatedIds = ch.relatedFindingIds ?? [];

  // Bridge -> Engineering: declarative container/IaC packaging check
  if (source.officer === 'bridge' && target.officer === 'engineering') {
    const infraCheck = target.checks.find((c) => c.id === 'eng-declarative-infra');
    if (infraCheck) {
      if (infraCheck.passed) {
        return {
          fromOfficer: source.officer,
          targetOfficer: target.officer,
          challenge: ch.challenge,
          rationale: ch.rationale,
          relatedFindingIds: relatedIds,
          status: 'REBUTTED_BY_EVIDENCE',
          respondingOfficer: target.officer,
          evidenceCheckIds: [infraCheck.id],
          responseSummary: `Rebutted via passing check ${infraCheck.id}: ${infraCheck.evidence}`
        };
      }
      return {
        fromOfficer: source.officer,
        targetOfficer: target.officer,
        challenge: ch.challenge,
        rationale: ch.rationale,
        relatedFindingIds: relatedIds,
        status: 'CONFIRMED',
        respondingOfficer: target.officer,
        evidenceCheckIds: [infraCheck.id],
        responseSummary: `Confirmed via failing check ${infraCheck.id}: ${infraCheck.evidence}`
      };
    }
  }

  // Engineering -> Bridge: automated deployment/IaC dependency
  if (source.officer === 'engineering' && target.officer === 'bridge') {
    const deployCheck = target.checks.find((c) => c.id === 'cd-release-automation');
    const ciCheck = target.checks.find((c) => c.id === 'cd-ci-verification');
    const failed = [deployCheck, ciCheck].filter((c): c is NonNullable<typeof c> => Boolean(c && !c.passed));
    if (failed.length > 0) {
      return {
        fromOfficer: source.officer,
        targetOfficer: target.officer,
        challenge: ch.challenge,
        rationale: ch.rationale,
        relatedFindingIds: relatedIds,
        status: 'CONFIRMED',
        respondingOfficer: target.officer,
        evidenceCheckIds: failed.map((c) => c.id),
        responseSummary: `Confirmed deployment gap (${failed.map((c) => `${c.id}: ${c.evidence}`).join('; ')}).`
      };
    }
    const passed = [deployCheck, ciCheck].filter((c): c is NonNullable<typeof c> => Boolean(c && c.passed));
    return {
      fromOfficer: source.officer,
      targetOfficer: target.officer,
      challenge: ch.challenge,
      rationale: ch.rationale,
      relatedFindingIds: relatedIds,
      status: 'ESCALATED',
      respondingOfficer: target.officer,
      evidenceCheckIds: passed.map((c) => c.id),
      responseSummary: `Bridge CI/CD checks pass (${passed.map((c) => c.id).join(', ')}), but target runtime still lacks declarative container/IaC packaging.`
    };
  }

  // Engineering -> Security: undocumented env vars secret-handling verification
  if (source.officer === 'engineering' && target.officer === 'security') {
    const secretCheck = target.checks.find((c) => c.id === 'sec-no-hardcoded-secrets');
    if (secretCheck) {
      if (!secretCheck.passed) {
        return {
          fromOfficer: source.officer,
          targetOfficer: target.officer,
          challenge: ch.challenge,
          rationale: ch.rationale,
          relatedFindingIds: relatedIds,
          status: 'CONFIRMED',
          respondingOfficer: target.officer,
          evidenceCheckIds: [secretCheck.id],
          responseSummary: `Confirmed secret exposure risk via failing check ${secretCheck.id}: ${secretCheck.evidence}`
        };
      }
      return {
        fromOfficer: source.officer,
        targetOfficer: target.officer,
        challenge: ch.challenge,
        rationale: ch.rationale,
        relatedFindingIds: relatedIds,
        status: 'REBUTTED_BY_EVIDENCE',
        respondingOfficer: target.officer,
        evidenceCheckIds: [secretCheck.id],
        responseSummary: `No hardcoded secrets detected (${secretCheck.id}: ${secretCheck.evidence}); undocumented env vars remain an engineering contract gap.`
      };
    }
  }

  // Security -> Bridge: release block or automated SCA/SAST gate in CI
  if (source.officer === 'security' && target.officer === 'bridge') {
    const sourceBlocking = source.findings.filter(
      (f) => f.blocksRelease && (relatedIds.length === 0 || relatedIds.includes(f.id))
    );
    const bridgeFailedChecks = target.checks.filter((c) => c.applicable && !c.passed).map((c) => c.id);
    if (sourceBlocking.length > 0) {
      return {
        fromOfficer: source.officer,
        targetOfficer: target.officer,
        challenge: ch.challenge,
        rationale: ch.rationale,
        relatedFindingIds: relatedIds,
        status: 'CONFIRMED',
        respondingOfficer: target.officer,
        evidenceCheckIds: bridgeFailedChecks.length > 0 ? bridgeFailedChecks : ['cd-ci-verification'],
        responseSummary: `Bridge Officer acknowledges release hold for ${sourceBlocking.length} blocking security finding(s): ${sourceBlocking.map((b) => b.id).slice(0, 4).join(', ')}.`
      };
    }
    const ciCheck = target.checks.find((c) => c.id === 'cd-ci-verification');
    return {
      fromOfficer: source.officer,
      targetOfficer: target.officer,
      challenge: ch.challenge,
      rationale: ch.rationale,
      relatedFindingIds: relatedIds,
      status: 'CONFIRMED',
      respondingOfficer: target.officer,
      evidenceCheckIds: ciCheck ? [ciCheck.id] : [],
      responseSummary: `Confirmed CI security gate gap (${ciCheck ? ciCheck.evidence : 'no CI workflow verified'}).`
    };
  }

  // General evidence correlation for evolved/custom officer challenges
  const sourceFindings = source.findings.filter((f) => relatedIds.includes(f.id));
  const sourcePaths = new Set(sourceFindings.flatMap((f) => f.affectedPaths.map(normalizePath)));
  const targetFailed = target.checks.filter((c) => c.applicable && !c.passed);
  const targetOverlappingFindings = target.findings.filter((f) =>
    f.affectedPaths.some((p) => sourcePaths.has(normalizePath(p)))
  );

  if (targetOverlappingFindings.length > 0 || targetFailed.length > 0) {
    return {
      fromOfficer: source.officer,
      targetOfficer: target.officer,
      challenge: ch.challenge,
      rationale: ch.rationale,
      relatedFindingIds: relatedIds,
      status: 'CONFIRMED',
      respondingOfficer: target.officer,
      evidenceCheckIds: targetFailed.map((c) => c.id).slice(0, 5),
      responseSummary: `Confirmed by ${target.officer}: ${targetOverlappingFindings.length} overlapping finding(s) and ${targetFailed.length} failing check(s).`
    };
  }

  const targetPassed = target.checks.filter((c) => c.applicable && c.passed);
  return {
    fromOfficer: source.officer,
    targetOfficer: target.officer,
    challenge: ch.challenge,
    rationale: ch.rationale,
    relatedFindingIds: relatedIds,
    status: targetPassed.length > 0 ? 'REBUTTED_BY_EVIDENCE' : 'ESCALATED',
    respondingOfficer: target.officer,
    evidenceCheckIds: targetPassed.map((c) => c.id).slice(0, 5),
    responseSummary:
      targetPassed.length > 0
        ? `Rebutted by ${target.officer}: all ${targetPassed.length} applicable domain check(s) passed.`
        : `Escalated to Number One: insufficient target check coverage.`
  };
}

/**
 * Multi-Officer Crew Coordinator (BMAD Party Mode).
 *
 * Executes concrete officer check suites (Round 1), performs deterministic evidence-backed
 * peer challenge verification and SoR precedent correlation (Round 2), synthesizes a
 * per-officer decision matrix and cross-domain ranked remediation plan (Round 3), and
 * manages authoritative remediation gate directives (issuing on HOLD, auto-superseding on APPROVE).
 */
export class PartyModeOrchestrator {
  private readonly store: StreamStore;
  private readonly replay: ReplayEngine;
  private readonly roster: Record<OfficerRole, CrewOfficer>;
  private readonly customLlm?: LlmProvider;

  constructor(
    store: StreamStore,
    replay: ReplayEngine,
    roster?: Record<OfficerRole, CrewOfficer>,
    llm?: LlmProvider
  ) {
    this.store = store;
    this.replay = replay;
    this.roster = roster ?? createDefaultCrewRoster();
    this.customLlm = llm;
  }

  private getLlmProvider(): LlmProvider {
    return this.customLlm ?? new PluggableLlmProvider(this.store.readConfig()?.llm);
  }

  public getOfficer(role: OfficerRole): CrewOfficer {
    return this.roster[role];
  }

  public getAllOfficers(): CrewOfficer[] {
    return Object.values(this.roster);
  }

  public selectOfficersForTopic(topic: string, targetPaths: string[] = []): OfficerRole[] {
    const text = `${topic} ${targetPaths.join(' ')}`;
    if (/\b(full|all officers|party mode|production launch|release readiness|full review)\b/i.test(text)) {
      return ['engineering', 'security', 'bridge'];
    }

    const scored: Array<{ role: OfficerRole; hits: number }> = (
      ['engineering', 'security', 'bridge'] as const
    ).map((role) => ({
      role,
      hits: countKeywordHits(text, TOPIC_KEYWORDS[role])
    }));

    const matched = scored
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .map((s) => s.role);

    if (matched.length === 0) {
      return ['engineering', 'security', 'bridge'];
    }
    return matched;
  }

  public async convene(options: PartyModeOptions): Promise<PartyModeSessionResult> {
    const mode = options.mode ?? 'roundtable';
    const partySessionId = `party-${generateUlid()}`;
    const harness = options.harness ?? 'numberone-crew';
    const sessionId = options.sessionId ?? partySessionId;
    const rawEnabled = this.store.readConfig()?.crew.enabledOfficers;
    const enabledInConfig: OfficerRole[] =
      rawEnabled && rawEnabled.length > 0 ? rawEnabled : ['engineering', 'security', 'bridge'];

    let assembledOfficers: OfficerRole[];
    if (options.officers && options.officers.length > 0) {
      assembledOfficers = options.officers.filter((o) => enabledInConfig.includes(o));
      if (mode === 'specialist' && assembledOfficers.length > 1) {
        assembledOfficers = [assembledOfficers[0]!];
      }
    } else if (mode === 'specialist') {
      const ranked = this.selectOfficersForTopic(options.topic, options.targetPaths).filter((o) =>
        enabledInConfig.includes(o)
      );
      assembledOfficers = ranked.length > 0 ? [ranked[0]!] : [enabledInConfig[0]!];
    } else if (mode === 'auto-triage') {
      assembledOfficers = this.selectOfficersForTopic(options.topic, options.targetPaths).filter((o) =>
        enabledInConfig.includes(o)
      );
    } else {
      assembledOfficers = [...enabledInConfig];
    }

    if (assembledOfficers.length === 0) {
      assembledOfficers = [...enabledInConfig];
    }

    const state: WorkspaceProjection = this.replay.getCurrentState();

    const assembledEvent = this.store.append({
      type: 'crew.assembled',
      actor: { kind: 'numberone', id: 'numberone', name: 'Number One' },
      harness,
      sessionId,
      correlationId: partySessionId,
      summary: `Assembled crew (${assembledOfficers.join(', ')}) [${mode}] for: ${options.topic}`,
      affectedPaths: options.targetPaths ?? [],
      tags: ['party-mode', mode, ...assembledOfficers],
      payload: {
        partySessionId,
        topic: options.topic,
        mode,
        officers: assembledOfficers,
        targetPaths: options.targetPaths ?? []
      }
    });

    const assessments: OfficerAssessment[] = [];
    const transcript: RoundtableTurn[] = [];
    const vetoes: Array<{ officer: OfficerRole; reason: string }> = [];
    const vetoEventIds: string[] = [];

    // Round 1: Concrete Officer Check Evaluations
    for (const role of assembledOfficers) {
      const officer = this.roster[role];
      const assessment = officer.assess(
        this.store.workspaceRoot,
        state,
        options.topic,
        options.targetPaths
      );
      assessments.push(assessment);

      this.store.append({
        type: 'officer.kpi.measured',
        actor: { kind: 'officer', id: role, name: officer.title },
        harness,
        sessionId,
        causationId: assembledEvent.id,
        correlationId: partySessionId,
        summary: `${officer.title}: ${assessment.mainKpiName}=${assessment.kpiScore}/100`,
        tags: ['kpi', role],
        payload: {
          officer: role,
          kpiName: assessment.mainKpiName,
          score: assessment.kpiScore,
          breakdown: assessment.kpiBreakdown,
          findingCount: assessment.findings.length
        }
      });

      const summaryMessage = await this.maybeSummarizeWithLlm(
        officer.title,
        officer.mandate,
        options.topic,
        assessment.stance,
        assessment.findings.map((f) => `[${f.severity}] ${f.title}: ${f.recommendation}`)
      );

      transcript.push({
        round: 1,
        speaker: role,
        kind: 'assessment',
        message: summaryMessage
      });

      this.store.append({
        type: 'crew.opinion',
        actor: { kind: 'officer', id: role, name: officer.title },
        harness,
        sessionId,
        causationId: assembledEvent.id,
        correlationId: partySessionId,
        summary: `[${role}] ${assessment.stance}`,
        affectedPaths: Array.from(new Set(assessment.findings.flatMap((f) => f.affectedPaths))).slice(0, 20),
        tags: ['party-mode', 'opinion', role],
        payload: {
          partySessionId,
          officer: role,
          kpiName: assessment.mainKpiName,
          kpiScore: assessment.kpiScore,
          stance: summaryMessage,
          checks: assessment.checks,
          findings: assessment.findings,
          artifacts: assessment.artifacts
        }
      });

      const blockers = assessment.findings.filter((f) => f.blocksRelease);
      if (blockers.length > 0) {
        const vetoReason = blockers.map((b) => `${b.title} (${b.severity})`).join('; ');
        vetoes.push({ officer: role, reason: vetoReason });
        const vetoEv = this.store.append({
          type: 'crew.veto',
          actor: { kind: 'officer', id: role, name: officer.title },
          harness,
          sessionId,
          causationId: assembledEvent.id,
          correlationId: partySessionId,
          summary: `Release block by ${role}: ${vetoReason}`,
          affectedPaths: Array.from(new Set(blockers.flatMap((b) => b.affectedPaths))),
          tags: ['party-mode', 'veto', role],
          payload: {
            partySessionId,
            officer: role,
            reason: vetoReason,
            blockingFindings: blockers
          }
        });
        vetoEventIds.push(vetoEv.id);
      }
    }

    // Round 2A: Deterministic Evidence-Backed Peer Challenges & Rebuttals
    const challengeResolutions =
      assembledOfficers.length > 1 ? resolvePeerChallenges(assessments) : [];

    for (const res of challengeResolutions) {
      const sourceOfficer = this.roster[res.fromOfficer];
      const dependencyMsg = `Dependency on ${res.targetOfficer}: ${res.challenge} (${res.rationale})`;
      transcript.push({
        round: 2,
        speaker: res.fromOfficer,
        kind: 'dependency',
        message: dependencyMsg
      });
      transcript.push({
        round: 2,
        speaker: res.respondingOfficer,
        kind: 'rebuttal',
        message: `[${res.status}] ${res.responseSummary}`
      });

      this.store.append({
        type: 'crew.challenge',
        actor: { kind: 'officer', id: res.fromOfficer, name: sourceOfficer.title },
        harness,
        sessionId,
        causationId: assembledEvent.id,
        correlationId: partySessionId,
        summary: `[${res.fromOfficer} -> ${res.targetOfficer}] (${res.status}) ${res.challenge}`,
        tags: ['party-mode', 'challenge', res.fromOfficer, res.targetOfficer, res.status.toLowerCase()],
        payload: {
          partySessionId,
          fromOfficer: res.fromOfficer,
          targetOfficer: res.targetOfficer,
          challenge: res.challenge,
          rationale: res.rationale,
          relatedFindingIds: res.relatedFindingIds,
          resolution: {
            status: res.status,
            respondingOfficer: res.respondingOfficer,
            evidenceCheckIds: res.evidenceCheckIds,
            responseSummary: res.responseSummary
          }
        }
      });
    }

    // Round 2B: System of Record Precedent Correlation (Lessons, Failed Attempts, Open Issues)
    const allFindingPaths = Array.from(
      new Set([
        ...(options.targetPaths ?? []),
        ...assessments.flatMap((a) => a.findings.flatMap((f) => f.affectedPaths))
      ])
    );
    const precedentIntent = [
      options.topic,
      ...assessments.flatMap((a) => a.findings.slice(0, 5).map((f) => `${f.title} ${f.category}`))
    ].join(' ');
    const lessonEngine = new LessonEngine(this.store);
    const matchedLessons = lessonEngine
      .findRelevantLessons(state, { intent: precedentIntent, targetPaths: allFindingPaths })
      .slice(0, 5);
    const matchedFailedAttempts = lessonEngine
      .findRelevantFailedAttempts(state, { intent: precedentIntent, targetPaths: allFindingPaths })
      .slice(0, 5);
    const normalizedFindingPaths = new Set(allFindingPaths.map(normalizePath));
    const topicTokens = new Set(
      precedentIntent
        .toLowerCase()
        .replace(/[^a-z0-9/_-]+/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 4)
    );
    const openIssues = Object.values(state.issues).filter((iss) => {
      if (iss.status === 'resolved') return false;
      if (iss.affectedPaths.some((p) => normalizedFindingPaths.has(normalizePath(p)))) return true;
      const issText = `${iss.title} ${iss.description}`.toLowerCase();
      let overlap = 0;
      for (const tok of topicTokens) {
        if (issText.includes(tok)) overlap++;
      }
      return overlap >= 2;
    });

    const correlatedPrecedents = {
      lessonIds: matchedLessons.map((m) => m.lesson.id),
      failedAttemptIds: matchedFailedAttempts.map((a) => a.eventId),
      openIssueIds: openIssues.map((i) => i.id)
    };

    if (
      correlatedPrecedents.lessonIds.length > 0 ||
      correlatedPrecedents.failedAttemptIds.length > 0 ||
      correlatedPrecedents.openIssueIds.length > 0
    ) {
      const parts: string[] = [];
      if (matchedLessons.length > 0) {
        parts.push(
          `Lessons: ${matchedLessons.map((m) => `${m.lesson.id} (${m.lesson.title})`).join(', ')}`
        );
      }
      if (matchedFailedAttempts.length > 0) {
        parts.push(
          `Dead-ends: ${matchedFailedAttempts.map((a) => `${a.eventId} (${a.approach.slice(0, 60)})`).join(', ')}`
        );
      }
      if (openIssues.length > 0) {
        parts.push(`Open issues: ${openIssues.map((i) => `${i.id} (${i.title})`).join(', ')}`);
      }
      transcript.push({
        round: 2,
        speaker: 'numberone',
        kind: 'precedent',
        message: `SoR precedent correlation — ${parts.join(' | ')}`
      });
    }

    // Round 3: Decision Matrix, Cross-Domain Ranked Remediation Plan & Ruling
    const decisionMatrix: OfficerDecisionRow[] = assessments.map((a) => {
      const applicable = a.checks.filter((c) => c.applicable);
      const passed = applicable.filter((c) => c.passed);
      const blockingCount = a.findings.filter((f) => f.blocksRelease).length;
      const highCount = a.findings.filter((f) => f.severity === 'high' || f.severity === 'critical').length;
      const incoming = challengeResolutions.filter((r) => r.targetOfficer === a.officer);
      const confirmedIncoming = incoming.filter((r) => r.status === 'CONFIRMED').length;
      const rebuttedIncoming = incoming.filter((r) => r.status === 'REBUTTED_BY_EVIDENCE').length;
      const domainGate: OfficerDecisionRow['domainGate'] =
        blockingCount > 0
          ? 'BLOCK'
          : highCount > 0 || confirmedIncoming > 0
            ? 'CONDITIONAL'
            : 'PASS';
      return {
        officer: a.officer,
        officerTitle: a.officerTitle,
        mainKpiName: a.mainKpiName,
        kpiScore: a.kpiScore,
        checksPassed: passed.length,
        checksApplicable: applicable.length,
        blockingCount,
        highCount,
        confirmedIncomingChallenges: confirmedIncoming,
        rebuttedIncomingChallenges: rebuttedIncoming,
        domainGate
      };
    });

    const remediationPlan = this.buildRankedRemediationPlan(
      assessments,
      matchedLessons.map((m) => m.lesson),
      openIssues
    );

    const avgKpi =
      Math.round(
        (assessments.reduce((sum, a) => sum + a.kpiScore, 0) / Math.max(1, assessments.length)) * 10
      ) / 10;
    const consensusReached = vetoes.length === 0;

    const topRemediationSummary = remediationPlan
      .slice(0, 5)
      .map(
        (r) =>
          `#${r.rank} [${r.ownerOfficer}/${r.severity}${r.blocksRelease ? '/BLOCKING' : ''}] ${r.title}: ${r.action}`
      );

    const numberOneRuling = consensusReached
      ? `APPROVE (Avg KPI ${avgKpi}/100): 0 release blockers for "${options.topic}".${topRemediationSummary.length > 0 ? ` Prioritized actions: ${topRemediationSummary.join(' | ')}` : ''}`
      : `HOLD (Avg KPI ${avgKpi}/100, ${vetoes.length} blocker(s)): Release blocked on "${options.topic}" until resolved: ${vetoes.map((v) => `[${v.officer}] ${v.reason}`).join(' | ')}`;

    transcript.push({
      round: 3,
      speaker: 'numberone',
      kind: 'ruling',
      message: numberOneRuling
    });

    // Authoritative Directive Lifecycle: issue fresh gate on HOLD (superseding stale gate for same topic),
    // and auto-supersede stale Crew Remediation Gate directives on APPROVE!
    const gateTitle = `Crew Remediation Gate: ${options.topic}`;
    const priorActiveGates: DirectiveRecord[] = Object.values(state.directives).filter(
      (d) =>
        d.active &&
        d.issuedBy === 'numberone' &&
        d.title.startsWith('Crew Remediation Gate:') &&
        (d.title === gateTitle ||
          (consensusReached &&
            (d.scopePaths.length === 0 ||
              d.scopePaths.every(
                (sp) =>
                  !assessments.some((a) =>
                    a.findings.some(
                      (f) => f.blocksRelease && f.affectedPaths.includes(sp)
                    )
                  )
              ))))
    );

    let issuedDirectiveId: string | undefined;
    const supersededDirectiveIds: string[] = [];

    if (!consensusReached && options.issueDirectiveOnBlockers !== false) {
      const directiveId = `dir-${generateUlid()}`;
      issuedDirectiveId = directiveId;
      const blockingFindings = assessments.flatMap((a) => a.findings.filter((f) => f.blocksRelease));
      const blockingPaths = Array.from(
        new Set(blockingFindings.flatMap((f) => f.affectedPaths))
      );
      const blockingCategories = Array.from(new Set(blockingFindings.map((f) => f.category)));
      const sameTopicPrior = priorActiveGates.filter((d) => d.title === gateTitle);

      this.store.append({
        type: 'directive.issued',
        actor: { kind: 'numberone', id: 'numberone', name: 'Number One' },
        harness,
        sessionId,
        causationId: assembledEvent.id,
        correlationId: partySessionId,
        summary: `Blocking remediation gate: ${options.topic}`,
        affectedPaths: blockingPaths,
        tags: ['directive', 'party-mode', 'blocking', ...blockingCategories],
        payload: {
          directiveId,
          title: gateTitle,
          directive: numberOneRuling,
          rationale: vetoes.map((v) => `${v.officer}: ${v.reason}`).join('; '),
          scopePaths: blockingPaths,
          scopeTags: Array.from(new Set(['release', 'deploy', ...blockingCategories])),
          forbiddenPatterns: deriveContextualForbiddenPatterns(blockingFindings),
          requiredPatterns: [],
          severity: 'blocking',
          issuedBy: 'numberone',
          supersedes: sameTopicPrior[0]?.id,
          supportingEventIds: [assembledEvent.id, ...vetoEventIds]
        }
      });

      for (const prior of sameTopicPrior) {
        supersededDirectiveIds.push(prior.id);
        // Emit explicit supersede for any additional prior gates beyond the first linked via `supersedes`
        if (prior.id !== sameTopicPrior[0]?.id) {
          this.store.append({
            type: 'directive.superseded',
            actor: { kind: 'numberone', id: 'numberone', name: 'Number One' },
            harness,
            sessionId,
            causationId: assembledEvent.id,
            correlationId: partySessionId,
            summary: `Superseded prior crew remediation gate ${prior.id} with ${directiveId}`,
            tags: ['directive', 'superseded', 'party-mode'],
            payload: {
              directiveId: prior.id,
              supersededBy: directiveId,
              reason: `Replaced by refreshed Party Mode session ${partySessionId}.`
            }
          });
        }
      }
    } else if (consensusReached && priorActiveGates.length > 0) {
      for (const prior of priorActiveGates) {
        this.store.append({
          type: 'directive.superseded',
          actor: { kind: 'numberone', id: 'numberone', name: 'Number One' },
          harness,
          sessionId,
          causationId: assembledEvent.id,
          correlationId: partySessionId,
          summary: `Cleared crew remediation gate ${prior.id}: Party Mode verified APPROVE`,
          tags: ['directive', 'superseded', 'party-mode', 'resolved'],
          payload: {
            directiveId: prior.id,
            supersededBy: partySessionId,
            reason: `Party Mode session ${partySessionId} verified 0 release blockers (${numberOneRuling}).`
          }
        });
        supersededDirectiveIds.push(prior.id);
      }
    }

    this.store.append({
      type: 'crew.consensus',
      actor: { kind: 'numberone', id: 'numberone', name: 'Number One' },
      harness,
      sessionId,
      causationId: assembledEvent.id,
      correlationId: partySessionId,
      summary: numberOneRuling,
      tags: ['party-mode', consensusReached ? 'consensus' : 'hold'],
      payload: {
        partySessionId,
        topic: options.topic,
        consensusReached,
        averageKpiScore: avgKpi,
        vetoes,
        challengeResolutions,
        decisionMatrix,
        remediationPlan,
        correlatedPrecedents,
        ruling: numberOneRuling,
        directiveId: issuedDirectiveId,
        supersededDirectiveIds,
        transcript
      }
    });

    return {
      partySessionId,
      topic: options.topic,
      mode,
      assembledOfficers,
      assessments,
      challengeResolutions,
      decisionMatrix,
      remediationPlan,
      correlatedPrecedents,
      roundtableTranscript: transcript,
      consensusReached,
      vetoes,
      numberOneRuling,
      issuedDirectiveId,
      supersededDirectiveIds
    };
  }

  private buildRankedRemediationPlan(
    assessments: OfficerAssessment[],
    matchedLessons: WorkspaceProjection['lessons'][string][],
    openIssues: WorkspaceProjection['issues'][string][]
  ): RemediationItem[] {
    interface Cluster {
      key: string;
      ownerOfficer: OfficerRole;
      supportingOfficers: Set<OfficerRole>;
      findingIds: string[];
      affectedPaths: Set<string>;
      blocksRelease: boolean;
      severity: FindingSeverity;
      title: string;
      actions: string[];
      verificationCheckIds: Set<string>;
    }

    const clusters = new Map<string, Cluster>();

    for (const assessment of assessments) {
      const failedChecksByCat = new Map<string, string[]>();
      for (const c of assessment.checks) {
        if (c.applicable && !c.passed) {
          const list = failedChecksByCat.get(c.category) ?? [];
          list.push(c.id);
          failedChecksByCat.set(c.category, list);
        }
      }

      for (const finding of assessment.findings) {
        const primaryPath = finding.affectedPaths[0] ? normalizePath(finding.affectedPaths[0]) : '';
        const clusterKey = primaryPath
          ? `path:${primaryPath}`
          : `finding:${assessment.officer}:${finding.id}`;

        const existing = clusters.get(clusterKey);
        const checkIds = failedChecksByCat.get(finding.category) ?? [];

        if (!existing) {
          clusters.set(clusterKey, {
            key: clusterKey,
            ownerOfficer: assessment.officer,
            supportingOfficers: new Set<OfficerRole>(),
            findingIds: [finding.id],
            affectedPaths: new Set(finding.affectedPaths.map(normalizePath)),
            blocksRelease: Boolean(finding.blocksRelease),
            severity: finding.severity,
            title: finding.title,
            actions: [finding.recommendation],
            verificationCheckIds: new Set(checkIds)
          });
        } else {
          existing.findingIds.push(finding.id);
          for (const p of finding.affectedPaths) existing.affectedPaths.add(normalizePath(p));
          for (const cid of checkIds) existing.verificationCheckIds.add(cid);
          if (!existing.actions.includes(finding.recommendation)) {
            existing.actions.push(finding.recommendation);
          }

          const shouldTakeOwnership =
            (Boolean(finding.blocksRelease) && !existing.blocksRelease) ||
            (Boolean(finding.blocksRelease) === existing.blocksRelease &&
              SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing.severity]);

          if (shouldTakeOwnership) {
            if (existing.ownerOfficer !== assessment.officer) {
              existing.supportingOfficers.add(existing.ownerOfficer);
            }
            existing.ownerOfficer = assessment.officer;
            existing.supportingOfficers.delete(assessment.officer);
            existing.blocksRelease = Boolean(finding.blocksRelease);
            existing.severity = finding.severity;
            existing.title = finding.title;
          } else if (existing.ownerOfficer !== assessment.officer) {
            existing.supportingOfficers.add(assessment.officer);
          }
        }
      }
    }

    const sorted = Array.from(clusters.values()).sort((a, b) => {
      if (a.blocksRelease !== b.blocksRelease) return a.blocksRelease ? -1 : 1;
      if (SEVERITY_RANK[b.severity] !== SEVERITY_RANK[a.severity]) {
        return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      }
      if (b.supportingOfficers.size !== a.supportingOfficers.size) {
        return b.supportingOfficers.size - a.supportingOfficers.size;
      }
      return (a.findingIds[0] ?? '').localeCompare(b.findingIds[0] ?? '');
    });

    return sorted.map((c, idx) => {
      const paths = Array.from(c.affectedPaths);
      const relatedLessonIds = matchedLessons
        .filter(
          (l) =>
            paths.some((p) => l.affectedPaths.map(normalizePath).includes(p)) ||
            l.title.toLowerCase().includes(c.title.toLowerCase().slice(0, 12))
        )
        .map((l) => l.id);
      const existingIssueIds = openIssues
        .filter((i) => paths.some((p) => i.affectedPaths.map(normalizePath).includes(p)))
        .map((i) => i.id);

      return {
        rank: idx + 1,
        id: `rem-${idx + 1}-${(c.findingIds[0] ?? 'item').replace(/[^a-z0-9_-]/gi, '_')}`,
        findingIds: c.findingIds,
        ownerOfficer: c.ownerOfficer,
        supportingOfficers: Array.from(c.supportingOfficers),
        affectedPaths: paths,
        blocksRelease: c.blocksRelease,
        severity: c.severity,
        title: c.title,
        action: c.actions.slice(0, 3).join(' | '),
        verificationCheckIds: Array.from(c.verificationCheckIds),
        relatedLessonIds,
        existingIssueIds
      };
    });
  }

  private async maybeSummarizeWithLlm(
    officerTitle: string,
    mandate: string,
    topic: string,
    deterministicStance: string,
    findings: string[]
  ): Promise<string> {
    const llm = this.getLlmProvider();
    if (!llm.isAvailable) return deterministicStance;
    const response = await llm.complete(
      [
        {
          role: 'system',
          content: `You are ${officerTitle}. Mandate: ${mandate}. Summarize only the verified workspace findings provided. Never invent findings or theatrical dialogue.`
        },
        {
          role: 'user',
          content: `Topic: ${topic}\nScore Summary: ${deterministicStance}\nFindings:\n${findings.join('\n') || 'None'}\nProvide a factual 2-sentence summary.`
        }
      ],
      200
    );
    return response || deterministicStance;
  }
}
