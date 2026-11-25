import { KnowledgePractice, OfficerRole, WorkspaceProjection } from '../core/types.js';

export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CheckEvaluation {
  id: string;
  category: string;
  title: string;
  weight: number;
  applicable: boolean;
  passed: boolean;
  evidence: string;
}

export interface OfficerFinding {
  id: string;
  severity: FindingSeverity;
  category: string;
  title: string;
  description: string;
  evidence: string;
  affectedPaths: string[];
  recommendation: string;
  blocksRelease?: boolean;
}

export interface PeerChallenge {
  targetOfficer: OfficerRole | 'workspace';
  challenge: string;
  rationale: string;
  relatedFindingIds?: string[];
}

export interface OfficerAssessment {
  officer: OfficerRole;
  officerTitle: string;
  mainKpiName: string;
  kpiScore: number;
  kpiBreakdown: Record<string, number>;
  checks: CheckEvaluation[];
  findings: OfficerFinding[];
  artifacts: Record<string, unknown>;
  stance: string;
  challengesToPeers: PeerChallenge[];
  activePracticeCount: number;
  knowledgeVersion: number;
  evaluatedAt: string;
}

export type ChallengeResolutionStatus = 'CONFIRMED' | 'REBUTTED_BY_EVIDENCE' | 'ESCALATED';

export interface ChallengeResolution {
  fromOfficer: OfficerRole;
  targetOfficer: OfficerRole | 'workspace';
  challenge: string;
  rationale: string;
  relatedFindingIds: string[];
  status: ChallengeResolutionStatus;
  respondingOfficer: OfficerRole | 'numberone';
  evidenceCheckIds: string[];
  responseSummary: string;
}

export interface OfficerDecisionRow {
  officer: OfficerRole;
  officerTitle: string;
  mainKpiName: string;
  kpiScore: number;
  checksPassed: number;
  checksApplicable: number;
  blockingCount: number;
  highCount: number;
  confirmedIncomingChallenges: number;
  rebuttedIncomingChallenges: number;
  domainGate: 'PASS' | 'CONDITIONAL' | 'BLOCK';
}

export interface RemediationItem {
  rank: number;
  id: string;
  findingIds: string[];
  ownerOfficer: OfficerRole;
  supportingOfficers: OfficerRole[];
  affectedPaths: string[];
  blocksRelease: boolean;
  severity: FindingSeverity;
  title: string;
  action: string;
  verificationCheckIds: string[];
  relatedLessonIds: string[];
  existingIssueIds: string[];
}

export interface CrewOfficer {
  readonly role: OfficerRole;
  readonly title: string;
  readonly mainKpiName: string;
  readonly mandate: string;
  assess(
    workspaceRoot: string,
    projection: WorkspaceProjection,
    topic?: string,
    targetPaths?: string[]
  ): OfficerAssessment;
  getBaselinePractices(): KnowledgePractice[];
}

export interface RoundtableTurn {
  round: number;
  speaker: OfficerRole | 'numberone';
  kind: 'assessment' | 'dependency' | 'rebuttal' | 'precedent' | 'ruling';
  message: string;
}

export interface PartyModeOptions {
  topic: string;
  mode?: 'roundtable' | 'specialist' | 'auto-triage';
  officers?: OfficerRole[];
  targetPaths?: string[];
  issueDirectiveOnBlockers?: boolean;
  harness?: string;
  sessionId?: string;
}

export interface PartyModeSessionResult {
  partySessionId: string;
  topic: string;
  mode: 'roundtable' | 'specialist' | 'auto-triage';
  assembledOfficers: OfficerRole[];
  assessments: OfficerAssessment[];
  challengeResolutions: ChallengeResolution[];
  decisionMatrix: OfficerDecisionRow[];
  remediationPlan: RemediationItem[];
  correlatedPrecedents: {
    lessonIds: string[];
    failedAttemptIds: string[];
    openIssueIds: string[];
  };
  roundtableTranscript: RoundtableTurn[];
  consensusReached: boolean;
  vetoes: Array<{ officer: OfficerRole; reason: string }>;
  numberOneRuling: string;
  issuedDirectiveId?: string;
  supersededDirectiveIds: string[];
}

export interface VerificationSample {
  path: string;
  content: string;
}

export type ProofKind = 'counterfactual_replay' | 'empirical_benchmark';

export interface KnowledgeProof {
  kind: ProofKind;
  sources: string[];
  methodology: string;
  /**
   * Required for `counterfactual_replay`: real event IDs in `.numberone/stream/`
   * whose incident context/blobs or accompanying samples are caught by the proposed matcher.
   */
  counterfactualEventIds?: string[];
  /**
   * Defective/non-compliant workspace samples that MUST be detected by the proposed practice matcher.
   */
  positiveSamples?: VerificationSample[];
  /**
   * Compliant/clean workspace samples that MUST NOT trigger false positives.
   */
  negativeSamples?: VerificationSample[];
  /**
   * Required for `empirical_benchmark` when no matcher corpus is supplied:
   * an executable command run by KnowledgeEvolutionEngine that outputs JSON
   * `{"kpiBefore": <number>, "kpiAfter": <number>, "sampleSize": <number>}` with exit code 0.
   */
  reproducibleCommand?: string;
}

export interface KnowledgeUpdateProposal {
  officer: OfficerRole;
  practice: Omit<KnowledgePractice, 'addedAt' | 'version' | 'active' | 'provenKpiDelta'>;
  proof: KnowledgeProof;
  allowCrossKpiTradeoff?: boolean;
}

export interface EvolutionVerdict {
  accepted: boolean;
  officer: OfficerRole;
  practiceId: string;
  measuredKpiDelta: number;
  reasons: string[];
  eventId: string;
  verificationMetrics: {
    truePositivesBefore: number;
    truePositivesAfter: number;
    falsePositivesAfter: number;
    commandExecuted?: string;
  };
  crossKpiImpact: Record<OfficerRole, number>;
}
