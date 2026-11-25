import path from 'node:path';
import {
  ArbitrationProposal,
  ArbitrationResult,
  AuthorityEngine
} from '../core/authority-engine.js';
import { buildWorkspaceDocumentary, WorkspaceDocumentary } from '../core/documentary.js';
import { ConsultationQuery, LessonEngine, LessonMatch } from '../core/lesson-engine.js';
import { ReplayEngine, ReplayOptions } from '../core/replay-engine.js';
import { StreamStore } from '../core/stream-store.js';
import {
  AppendEventInput,
  NumberOneConfig,
  OfficerRole,
  StreamEvent,
  WorkspaceProjection
} from '../core/types.js';
import { generateUlid } from '../core/ulid.js';
import { KnowledgeEvolutionEngine } from '../crew/evolution-engine.js';
import { createDefaultCrewRoster, PartyModeOrchestrator } from '../crew/party-mode.js';
import {
  CrewOfficer,
  EvolutionVerdict,
  KnowledgeUpdateProposal,
  OfficerAssessment,
  PartyModeOptions,
  PartyModeSessionResult
} from '../crew/types.js';
import { PersistenceFabric } from '../persistence/fabric.js';
import {
  DistributedIntegrityReport,
  PersistenceAdapter,
  SyncPullReport,
  SyncPushReport
} from '../persistence/types.js';
import { CommandRunOptions, CommandRunResult, runWatchedCommand } from '../watchers/command-runner.js';
import { WatcherDaemonManager } from '../watchers/daemon.js';
import { FsWatcherOptions, WorkspaceFsWatcher } from '../watchers/fs-watcher.js';
import { importGitHistory, installGitHooks, isGitRepository } from '../watchers/git-hooks.js';
import {
  IngestResult,
  IngestTranscriptOptions,
  ingestTranscriptFile
} from '../watchers/transcript-ingestor.js';
import { installHarnessShims, ShimInstallResult } from './shims.js';

export interface AttachOptions {
  workspaceName?: string;
  installHooks?: boolean;
  installShims?: boolean;
  backfillGitCommits?: number;
  config?: Partial<NumberOneConfig>;
  harness?: string;
}

export interface AttachResult {
  config: NumberOneConfig;
  attachedEvent: StreamEvent;
  gitHooksInstalled: string[];
  gitCommitsBackfilled: number;
  shimsInstalled: string[];
  initialFilesIndexed: number;
}

/**
 * NumberOneAgent — High-level authoritative workspace curator, event-sourced
 * System of Record (SoR), distributed persistence coordinator, and Bridge Crew commander.
 */
export class NumberOneAgent {
  public readonly workspaceRoot: string;
  public readonly store: StreamStore;
  public readonly replayEngine: ReplayEngine;
  public readonly lessonEngine: LessonEngine;
  public readonly authority: AuthorityEngine;
  public readonly persistence: PersistenceFabric;
  public readonly roster: Record<OfficerRole, CrewOfficer>;
  public readonly partyMode: PartyModeOrchestrator;
  public readonly evolution: KnowledgeEvolutionEngine;
  public readonly daemon: WatcherDaemonManager;

  private readonly hasCustomAdapters: boolean;

  constructor(workspaceRoot: string, customAdapters?: PersistenceAdapter[]) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.store = new StreamStore(this.workspaceRoot);
    this.replayEngine = new ReplayEngine(this.store);
    this.lessonEngine = new LessonEngine(this.store);
    this.authority = new AuthorityEngine(this.store, this.lessonEngine);
    this.hasCustomAdapters = Boolean(customAdapters && customAdapters.length > 0);
    this.persistence = new PersistenceFabric(this.store, customAdapters);
    this.roster = createDefaultCrewRoster();
    this.partyMode = new PartyModeOrchestrator(this.store, this.replayEngine, this.roster);
    this.evolution = new KnowledgeEvolutionEngine(this.store, this.replayEngine, this.roster);
    this.daemon = new WatcherDaemonManager(this.store);
  }

  /**
   * Attaches Number One to a workspace: initializes `.numberone/`, records the
   * genesis attachment event, optionally installs Git hooks & universal harness shims,
   * backfills Git commit history, and snapshots existing files.
   */
  public attach(options: AttachOptions = {}): AttachResult {
    const config = this.store.init({
      ...(options.config ?? {}),
      workspaceName: options.workspaceName ?? options.config?.workspaceName
    });
    if (!this.hasCustomAdapters) {
      this.persistence.loadAdaptersFromConfig(config);
    }

    const attachedEvent = this.store.append({
      type: 'workspace.attached',
      actor: { kind: 'numberone', id: 'numberone', name: 'Number One' },
      harness: options.harness ?? 'cli',
      summary: `Number One attached as authoritative System of Record for ${config.workspaceName}`,
      tags: ['lifecycle', 'attach'],
      payload: {
        workspaceId: config.workspaceId,
        workspaceName: config.workspaceName,
        workspaceRoot: this.workspaceRoot,
        authoritativeMode: config.authoritativeMode
      }
    });

    let gitHooksInstalled: string[] = [];
    let gitCommitsBackfilled = 0;
    if (isGitRepository(this.workspaceRoot)) {
      if (options.installHooks !== false) {
        gitHooksInstalled = installGitHooks(this.workspaceRoot).installed;
      }
      const backfillCount = options.backfillGitCommits ?? 25;
      if (backfillCount > 0) {
        gitCommitsBackfilled = importGitHistory(this.store, backfillCount).length;
      }
    }

    let shimsInstalled: string[] = [];
    if (options.installShims) {
      const shimRes: ShimInstallResult = installHarnessShims(this.workspaceRoot, config.workspaceName);
      shimsInstalled = shimRes.updatedFiles;
    }

    const watcher = new WorkspaceFsWatcher(this.store);
    const snapEv = watcher.recordBaselineSnapshot(attachedEvent.id, options.harness ?? 'cli');
    const initialFilesIndexed = Number(snapEv.payload.fileCount ?? 0);

    this.replayEngine.replay({ persistSnapshot: true });

    return {
      config,
      attachedEvent,
      gitHooksInstalled,
      gitCommitsBackfilled,
      shimsInstalled,
      initialFilesIndexed
    };
  }

  public recordEvent(input: AppendEventInput): StreamEvent {
    return this.store.append(input);
  }

  public recordThinking(input: {
    thought: string;
    harness?: string;
    sessionId?: string;
    affectedPaths?: string[];
    tags?: string[];
  }): StreamEvent {
    return this.store.append({
      type: 'chat.thinking',
      actor: { kind: 'ai-agent', id: input.harness ?? 'session-agent' },
      harness: input.harness ?? 'cli',
      sessionId: input.sessionId,
      summary: `Thinking: ${input.thought.slice(0, 140)}`,
      affectedPaths: input.affectedPaths,
      tags: ['thinking', ...(input.tags ?? [])],
      payload: { thought: input.thought }
    });
  }

  public recordFailedAttempt(input: {
    approach: string;
    reason: string;
    harness?: string;
    sessionId?: string;
    affectedPaths?: string[];
    tags?: string[];
  }): StreamEvent {
    return this.store.append({
      type: 'attempt.failed',
      actor: { kind: 'human', id: process.env.USER ?? 'operator' },
      harness: input.harness ?? 'cli',
      sessionId: input.sessionId,
      summary: `Dead-end recorded: ${input.approach.slice(0, 100)} (${input.reason.slice(0, 80)})`,
      affectedPaths: input.affectedPaths,
      tags: ['dead-end', 'failed-attempt', ...(input.tags ?? [])],
      payload: { approach: input.approach, reason: input.reason }
    });
  }

  public captureLesson(input: {
    title: string;
    problem: string;
    rootCause: string;
    resolution: string;
    preventionRule: string;
    failedApproaches?: string[];
    errorSignatures?: string[];
    affectedPaths?: string[];
    tags?: string[];
    severity?: 'low' | 'medium' | 'high' | 'critical';
    verified?: boolean;
    harness?: string;
    sessionId?: string;
    causationId?: string;
  }): StreamEvent {
    const lessonId = `lesson-${generateUlid()}`;
    return this.store.append({
      type: 'lesson.captured',
      actor: { kind: 'numberone', id: 'numberone', name: 'Number One' },
      harness: input.harness ?? 'cli',
      sessionId: input.sessionId,
      causationId: input.causationId,
      summary: `Lesson: ${input.title}`,
      affectedPaths: input.affectedPaths,
      tags: ['lesson', ...(input.tags ?? [])],
      payload: {
        lessonId,
        title: input.title,
        problem: input.problem,
        rootCause: input.rootCause,
        resolution: input.resolution,
        preventionRule: input.preventionRule,
        failedApproaches: input.failedApproaches ?? [],
        errorSignatures: input.errorSignatures ?? [],
        severity: input.severity ?? 'medium',
        verified: input.verified ?? true
      }
    });
  }

  public recordDecision(input: {
    title: string;
    decision: string;
    rationale: string;
    alternativesRejected?: string[];
    consequences?: string[];
    affectedPaths?: string[];
    tags?: string[];
    owner?: string;
    supersedes?: string;
    harness?: string;
    sessionId?: string;
  }): StreamEvent {
    const decisionId = `adr-${generateUlid()}`;
    return this.store.append({
      type: 'decision.recorded',
      actor: { kind: 'human', id: input.owner ?? process.env.USER ?? 'architect' },
      harness: input.harness ?? 'cli',
      sessionId: input.sessionId,
      summary: `Decision: ${input.title}`,
      affectedPaths: input.affectedPaths,
      tags: ['decision', 'adr', ...(input.tags ?? [])],
      payload: {
        decisionId,
        title: input.title,
        decision: input.decision,
        rationale: input.rationale,
        alternativesRejected: input.alternativesRejected ?? [],
        consequences: input.consequences ?? [],
        owner: input.owner ?? 'numberone',
        supersedes: input.supersedes
      }
    });
  }

  public issueDirective(input: {
    title: string;
    directive: string;
    rationale: string;
    scopePaths?: string[];
    scopeTags?: string[];
    forbiddenPatterns?: string[];
    requiredPatterns?: string[];
    severity?: 'advisory' | 'mandatory' | 'blocking';
    issuedBy?: 'numberone' | OfficerRole;
    actor?: AppendEventInput['actor'];
    supersedes?: string;
    harness?: string;
    sessionId?: string;
  }): StreamEvent {
    const directiveId = `dir-${generateUlid()}`;
    return this.store.append({
      type: 'directive.issued',
      actor: input.actor ?? { kind: 'numberone', id: input.issuedBy ?? 'numberone', name: 'Number One' },
      harness: input.harness ?? 'cli',
      sessionId: input.sessionId,
      summary: `Directive [${(input.severity ?? 'mandatory').toUpperCase()}]: ${input.title}`,
      affectedPaths: input.scopePaths,
      tags: ['directive', input.severity ?? 'mandatory', ...(input.scopeTags ?? [])],
      payload: {
        directiveId,
        title: input.title,
        directive: input.directive,
        rationale: input.rationale,
        scopePaths: input.scopePaths ?? [],
        scopeTags: input.scopeTags ?? [],
        forbiddenPatterns: input.forbiddenPatterns ?? [],
        requiredPatterns: input.requiredPatterns ?? [],
        severity: input.severity ?? 'mandatory',
        issuedBy: input.issuedBy ?? 'numberone',
        supersedes: input.supersedes
      }
    });
  }

  public openIssue(input: {
    title: string;
    description: string;
    kind?: 'bug' | 'crash' | 'story' | 'epic' | 'task' | 'debt' | 'security' | 'infra' | 'release';
    priority?: 'low' | 'medium' | 'high' | 'critical';
    ownerOfficer?: OfficerRole;
    affectedPaths?: string[];
    tags?: string[];
    harness?: string;
    sessionId?: string;
  }): StreamEvent {
    const issueId = `iss-${generateUlid()}`;
    return this.store.append({
      type: 'issue.opened',
      actor: { kind: 'human', id: process.env.USER ?? 'operator' },
      harness: input.harness ?? 'cli',
      sessionId: input.sessionId,
      correlationId: issueId,
      summary: `Issue [${input.kind ?? 'task'}]: ${input.title}`,
      affectedPaths: input.affectedPaths,
      tags: ['issue', input.kind ?? 'task', ...(input.tags ?? [])],
      payload: {
        issueId,
        title: input.title,
        description: input.description,
        kind: input.kind ?? 'task',
        priority: input.priority ?? 'medium',
        ownerOfficer: input.ownerOfficer
      }
    });
  }

  public resolveIssue(issueId: string, resolution: string, harness = 'cli'): StreamEvent {
    return this.store.append({
      type: 'issue.resolved',
      actor: { kind: 'human', id: process.env.USER ?? 'operator' },
      harness,
      correlationId: issueId,
      summary: `Resolved issue ${issueId}: ${resolution}`,
      tags: ['issue', 'resolved'],
      payload: { issueId, resolution }
    });
  }

  public replay(options?: ReplayOptions): WorkspaceProjection {
    return this.replayEngine.replay(options);
  }

  public getState(): WorkspaceProjection {
    return this.replayEngine.getCurrentState();
  }

  public consult(query: ConsultationQuery): {
    lessons: LessonMatch[];
    failedAttempts: WorkspaceProjection['failedAttempts'];
    activeDirectives: WorkspaceProjection['directives'][string][];
    unresolvedCrashes: WorkspaceProjection['crashes'];
  } {
    const state = this.getState();
    return {
      lessons: this.lessonEngine.findRelevantLessons(state, query),
      failedAttempts: this.lessonEngine.findRelevantFailedAttempts(state, query),
      activeDirectives: Object.values(state.directives).filter((d) => d.active),
      unresolvedCrashes: state.crashes.filter((c) => !c.resolvedByEventId)
    };
  }

  public arbitrate(
    proposal: ArbitrationProposal,
    options?: { recordAuditEvent?: boolean }
  ): ArbitrationResult {
    const state = this.getState();
    return this.authority.arbitrate(state, proposal, options);
  }

  public getAuthoritativeBrief(focusPaths: string[] = []): string {
    return this.authority.compileAuthoritativeBrief(this.getState(), focusPaths);
  }

  public buildDocumentary(): WorkspaceDocumentary {
    return buildWorkspaceDocumentary(this.store.readAllEvents(), this.getState());
  }

  public assessOfficer(
    role: OfficerRole,
    topic?: string,
    targetPaths?: string[]
  ): OfficerAssessment {
    const state = this.getState();
    const officer = this.roster[role];
    const assessment = officer.assess(this.workspaceRoot, state, topic, targetPaths);
    this.store.append({
      type: 'officer.kpi.measured',
      actor: { kind: 'officer', id: role, name: officer.title },
      harness: 'officer-audit',
      summary: `${officer.title} measured ${assessment.mainKpiName} = ${assessment.kpiScore}/100`,
      tags: ['kpi', role],
      payload: {
        officer: role,
        kpiName: assessment.mainKpiName,
        score: assessment.kpiScore,
        breakdown: assessment.kpiBreakdown,
        findingCount: assessment.findings.length
      }
    });
    return assessment;
  }

  public async assembleCrew(options: PartyModeOptions): Promise<PartyModeSessionResult> {
    return this.partyMode.convene(options);
  }

  public proposeKnowledgeUpdate(
    proposal: KnowledgeUpdateProposal,
    options?: { allowCommandExecution?: boolean }
  ): EvolutionVerdict {
    return this.evolution.proposeUpdate(proposal, options);
  }

  public auditOfficerRegressions(
    role: OfficerRole,
    regressionThreshold = 5,
    options?: { forceRevertOnStrictnessDrop?: boolean }
  ): string[] {
    return this.evolution.auditLiveRegressions(role, regressionThreshold, options);
  }

  public revertOfficerPractice(role: OfficerRole, practiceId: string, reason: string): string {
    return this.evolution.revertPractice(role, practiceId, reason);
  }

  public async syncPush(): Promise<SyncPushReport[]> {
    return this.persistence.syncPush();
  }

  public async syncPull(): Promise<SyncPullReport[]> {
    return this.persistence.syncPull();
  }

  public async verifyIntegrity(verifyRemotes = true): Promise<DistributedIntegrityReport> {
    return this.persistence.verifyDistributedIntegrity(verifyRemotes);
  }

  public async runCommand(options: CommandRunOptions): Promise<CommandRunResult> {
    return runWatchedCommand(this.store, options);
  }

  public ingestTranscript(options: IngestTranscriptOptions): IngestResult {
    return ingestTranscriptFile(this.store, options);
  }

  public createWatcher(options?: FsWatcherOptions): WorkspaceFsWatcher {
    return new WorkspaceFsWatcher(this.store, options);
  }

  public reconcileOfflineChanges(): StreamEvent[] {
    const watcher = new WorkspaceFsWatcher(this.store);
    return watcher.reconcileOfflineChanges(this.getState());
  }
}
