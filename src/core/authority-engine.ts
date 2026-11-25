import path from 'node:path';
import { LessonEngine, LessonMatch } from './lesson-engine.js';
import { StreamStore } from './stream-store.js';
import {
  DecisionRecord,
  DirectiveRecord,
  StreamEvent,
  WorkspaceProjection
} from './types.js';
import { compileSafeRegex, matchGlobLinear, MAX_REGEX_INPUT_LENGTH } from '../utils/safe-regex.js';

export type AuthorityLevel =
  | 'L1_SOR_INVARIANT'
  | 'L2_NUMBER_ONE_DIRECTIVE'
  | 'L3_OFFICER_GATE'
  | 'L4_SESSION_CONTEXT';

export type ArbitrationVerdict = 'APPROVE' | 'APPROVE_WITH_CONDITIONS' | 'OVERRIDE' | 'BLOCK';

export interface ArbitrationProposal {
  action: string;
  intent: string;
  targetPaths?: string[];
  command?: string;
  proposedApproach?: string;
  sessionAssumptions?: string[];
  tags?: string[];
  harness?: string;
  sessionId?: string;
}

export interface AuthorityConflict {
  level: AuthorityLevel;
  sourceType: 'directive' | 'lesson' | 'failed_attempt' | 'decision';
  sourceId: string;
  eventId: string;
  severity: 'advisory' | 'mandatory' | 'blocking';
  message: string;
  authoritativeGuidance: string;
}

export interface ArbitrationResult {
  verdict: ArbitrationVerdict;
  supersedesSessionContext: boolean;
  precedenceOrder: AuthorityLevel[];
  conflicts: AuthorityConflict[];
  relevantLessons: LessonMatch[];
  applicableDirectives: DirectiveRecord[];
  applicableDecisions: DecisionRecord[];
  authoritativeSummary: string;
  recordedEvent?: StreamEvent;
}

function normalizeScopePath(p: string): string {
  const posix = p.replace(/\\/g, '/');
  const norm = path.posix.normalize(posix).replace(/^\.\//, '').replace(/^\/+/, '');
  return norm === '.' ? '' : norm;
}

function pathMatchesScope(targetPath: string, scopePath: string): boolean {
  const t = normalizeScopePath(targetPath);
  const s = normalizeScopePath(scopePath);
  if (s === '*' || s === '') return true;
  if (t === s) return true;
  if (s.includes('*') || s.includes('?')) {
    return matchGlobLinear(t, s);
  }
  if (t.startsWith(s.endsWith('/') ? s : s + '/')) return true;
  return false;
}

const CONTRAST_SPLIT_RX =
  /(?=\b(?:instead\s+of|rather\s+than|as\s+opposed\s+to|not\s+using|without\b)\b)|\b(?:but\s+rather|whereas)\b/i;

const LEADING_NEGATION_RX =
  /^(?:do\s+not|don't|never|avoid|avoiding|instead\s+of|rather\s+than|as\s+opposed\s+to|without|forbid|prohibit|not\s+using|no\s+longer)\b/i;

const SWITCH_BACK_AFFIRMATIVE_RX = /\b(?:by\s+using|by\s+running|by\s+calling|by\s+enabling)\b/i;

/**
 * Extracts affirmative spans while preserving dotted identifiers (`0.0.0.0/0`, `child_process.exec`,
 * `package.json`), handling contrast phrases (`X instead of Y` -> keeps `X`, drops `Y`), and
 * preventing bypasses like `"Deploy with --no-verify without waiting"` or `"Avoid boilerplate by using eval()"`.
 */
export function extractAffirmativeClauses(text: string): string[] {
  // Split ONLY on real sentence boundaries (period followed by whitespace/EOL, semicolon, newline)
  const sentences = text
    .split(/(?:\.(?=\s|$)|[;\n])+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const affirmative: string[] = [];

  for (const sentence of sentences) {
    const contrastSpans = sentence
      .split(CONTRAST_SPLIT_RX)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const span of contrastSpans) {
      if (LEADING_NEGATION_RX.test(span)) {
        // Check if negated prefix switches back to affirmative ("Avoid boilerplate by using eval(x)")
        const sw = SWITCH_BACK_AFFIRMATIVE_RX.exec(span);
        if (sw) {
          const tail = span.slice(sw.index + sw[0].length).trim();
          if (tail && !LEADING_NEGATION_RX.test(tail)) {
            affirmative.push(tail);
          }
        }
        continue;
      }
      affirmative.push(span);
    }
  }

  return affirmative;
}

function matchesPatternInAffirmativeText(fullText: string, pattern: string): boolean {
  if (!pattern) return false;
  const affirmative = extractAffirmativeClauses(fullText);
  if (affirmative.length === 0) return false;
  const safeRx = compileSafeRegex(pattern, 'i');
  return affirmative.some((clause) => {
    const bounded =
      clause.length > MAX_REGEX_INPUT_LENGTH ? clause.slice(0, MAX_REGEX_INPUT_LENGTH) : clause;
    if (safeRx) {
      return safeRx.test(bounded);
    }
    return bounded.toLowerCase().includes(pattern.toLowerCase());
  });
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'use',
  'with',
  'from',
  'that',
  'this',
  'into',
  'using',
  'used',
  'when',
  'where',
  'have',
  'will',
  'code',
  'file',
  'not',
  'run',
  'set',
  'add',
  'get'
]);

const SHORT_TECH_TOKENS = new Set(['db', 'rm', 'ci', 'cd', 'ip', 'ca', 'go', 'js', 'ts', 'py', 'sh']);

function extractSignificantTokens(phrase: string): string[] {
  const cleaned = phrase.replace(/\s*\(failed:[\s\S]*\)$/i, '');
  const raw = cleaned.toLowerCase().match(/[a-z0-9_.-]{2,}/g) ?? [];
  return raw.filter((w) => {
    if (STOP_WORDS.has(w)) return false;
    return w.length >= 3 || SHORT_TECH_TOKENS.has(w);
  });
}

/**
 * Checks whether any affirmative clause of the proposal proposes repeating a
 * historically failed approach.
 */
function affirmativelyRepeatsApproach(proposalText: string, failedApproach: string): boolean {
  const cleanedFailed = failedApproach.replace(/\s*\(failed:[\s\S]*\)$/i, '').trim();
  const targetTokens = extractSignificantTokens(cleanedFailed);
  if (targetTokens.length === 0) return false;

  const affirmativeClauses = extractAffirmativeClauses(proposalText);
  const normalizedFailed = cleanedFailed.toLowerCase();

  for (const clause of affirmativeClauses) {
    const lower = clause.toLowerCase();
    if (normalizedFailed.length >= 6 && lower.includes(normalizedFailed)) {
      return true;
    }
    const clauseTokens = new Set(extractSignificantTokens(clause));
    const matched = targetTokens.filter((t) => clauseTokens.has(t)).length;
    const required = targetTokens.length <= 2 ? targetTokens.length : Math.max(3, Math.ceil(targetTokens.length * 0.75));
    if (matched >= required) {
      return true;
    }
  }
  return false;
}

/**
 * Authoritative SoR Arbitration Engine.
 *
 * Precedence Ladder:
 *   L1: SoR Invariants & Verified Lessons Learned
 *   L2: Number One Authoritative Directives
 *   L3: Bridge Crew Officer Mandatory Gates
 *   L4: Current Ephemeral Session / Harness Context (lowest priority)
 */
export class AuthorityEngine {
  private readonly store: StreamStore;
  private readonly lessonEngine: LessonEngine;

  public static readonly PRECEDENCE: AuthorityLevel[] = [
    'L1_SOR_INVARIANT',
    'L2_NUMBER_ONE_DIRECTIVE',
    'L3_OFFICER_GATE',
    'L4_SESSION_CONTEXT'
  ];

  constructor(store: StreamStore, lessonEngine: LessonEngine) {
    this.store = store;
    this.lessonEngine = lessonEngine;
  }

  public arbitrate(
    state: WorkspaceProjection,
    proposal: ArbitrationProposal,
    options: { recordAuditEvent?: boolean } = {}
  ): ArbitrationResult {
    const conflicts: AuthorityConflict[] = [];
    const targetPaths = proposal.targetPaths ?? [];
    const approachAndCommand = [
      proposal.command ?? '',
      proposal.proposedApproach ?? '',
      ...(proposal.sessionAssumptions ?? [])
    ]
      .filter(Boolean)
      .join('\n');
    const fullProposalText = [proposal.action, proposal.intent, approachAndCommand]
      .filter(Boolean)
      .join('\n');

    const proposalTags = new Set((proposal.tags ?? []).map((t) => t.toLowerCase()));

    // 1. Check active authoritative directives (L2 / L3)
    const applicableDirectives: DirectiveRecord[] = [];
    for (const directive of Object.values(state.directives)) {
      if (!directive.active) continue;

      const hasPathScope = directive.scopePaths.length > 0;
      const hasTagScope = directive.scopeTags.length > 0;

      const pathMatch =
        hasPathScope &&
        targetPaths.some((tp) => directive.scopePaths.some((sp) => pathMatchesScope(tp, sp)));
      const tagMatch =
        hasTagScope &&
        directive.scopeTags.some((st) => proposalTags.has(st.toLowerCase()));

      // Global ONLY when both scopePaths and scopeTags are empty
      const inScope = (!hasPathScope && !hasTagScope) || pathMatch || tagMatch;

      if (inScope) {
        applicableDirectives.push(directive);

        for (const forbidden of directive.forbiddenPatterns) {
          if (matchesPatternInAffirmativeText(fullProposalText, forbidden)) {
            conflicts.push({
              level: directive.issuedBy === 'numberone' ? 'L2_NUMBER_ONE_DIRECTIVE' : 'L3_OFFICER_GATE',
              sourceType: 'directive',
              sourceId: directive.id,
              eventId: directive.eventId,
              severity: directive.severity,
              message: `Proposal violates active directive "${directive.title}" (matched forbidden pattern: ${forbidden}).`,
              authoritativeGuidance: directive.directive
            });
          }
        }

        if ((proposal.proposedApproach || proposal.command) && directive.requiredPatterns.length > 0) {
          for (const required of directive.requiredPatterns) {
            if (!matchesPatternInAffirmativeText(fullProposalText, required)) {
              conflicts.push({
                level: directive.issuedBy === 'numberone' ? 'L2_NUMBER_ONE_DIRECTIVE' : 'L3_OFFICER_GATE',
                sourceType: 'directive',
                sourceId: directive.id,
                eventId: directive.eventId,
                severity: directive.severity === 'blocking' ? 'mandatory' : directive.severity,
                message: `Proposal omits required invariant from directive "${directive.title}" (missing: ${required}).`,
                authoritativeGuidance: directive.directive
              });
            }
          }
        }
      }
    }

    // 2. Check verified lessons learned & previously failed approaches (L1)
    const relevantLessons = this.lessonEngine.findRelevantLessons(state, {
      intent: `${proposal.action} ${proposal.intent} ${proposal.proposedApproach ?? ''}`,
      targetPaths,
      command: proposal.command,
      tags: proposal.tags
    });

    for (const match of relevantLessons) {
      const lesson = match.lesson;
      for (const failed of lesson.failedApproaches) {
        if (affirmativelyRepeatsApproach(fullProposalText, failed)) {
          conflicts.push({
            level: 'L1_SOR_INVARIANT',
            sourceType: 'lesson',
            sourceId: lesson.id,
            eventId: lesson.eventId,
            severity: lesson.severity === 'critical' ? 'blocking' : 'mandatory',
            message: `Proposed approach repeats failed approach recorded in lesson "${lesson.title}": "${failed}".`,
            authoritativeGuidance: `Apply verified resolution: ${lesson.resolution || lesson.preventionRule}`
          });
        }
      }
    }

    // 3. Check raw failed attempts history (L1)
    const relevantFailedAttempts = this.lessonEngine.findRelevantFailedAttempts(state, {
      intent: `${proposal.action} ${proposal.intent} ${proposal.proposedApproach ?? ''}`,
      targetPaths,
      command: proposal.command,
      tags: proposal.tags
    });
    for (const attempt of relevantFailedAttempts) {
      if (affirmativelyRepeatsApproach(fullProposalText, attempt.approach)) {
        conflicts.push({
          level: 'L1_SOR_INVARIANT',
          sourceType: 'failed_attempt',
          sourceId: attempt.eventId,
          eventId: attempt.eventId,
          severity: 'mandatory',
          message: `Proposal retries dead-end recorded at seq #${attempt.seq}: "${attempt.approach}" (failed: ${attempt.reason}).`,
          authoritativeGuidance: `Avoid dead-end from seq #${attempt.seq}.`
        });
      }
    }

    // 4. Find applicable active architectural decisions
    const applicableDecisions = Object.values(state.decisions).filter((d) => {
      if (d.status !== 'active') return false;
      const pathHit =
        d.affectedPaths.length > 0 &&
        targetPaths.some((tp) => d.affectedPaths.some((dp) => pathMatchesScope(tp, dp)));
      const tagHit = d.tags.some((t) => proposalTags.has(t.toLowerCase()));
      return pathHit || tagHit;
    });

    const hasBlocking = conflicts.some((c) => c.severity === 'blocking');
    const hasMandatory = conflicts.some((c) => c.severity === 'mandatory');
    const hasAdvisory = conflicts.some((c) => c.severity === 'advisory');

    let verdict: ArbitrationVerdict = 'APPROVE';
    if (hasBlocking) {
      verdict = 'BLOCK';
    } else if (hasMandatory) {
      verdict = 'OVERRIDE';
    } else if (hasAdvisory || applicableDirectives.length > 0) {
      verdict = 'APPROVE_WITH_CONDITIONS';
    }

    const supersedesSessionContext = verdict === 'BLOCK' || verdict === 'OVERRIDE';

    const authoritativeSummary = this.formatVerdictSummary(
      verdict,
      conflicts,
      relevantLessons.slice(0, 5),
      applicableDirectives
    );

    let recordedEvent: StreamEvent | undefined;
    if (options.recordAuditEvent) {
      recordedEvent = this.store.append({
        type: 'arbitration.decided',
        actor: { kind: 'numberone', id: 'numberone', name: 'Number One' },
        harness: proposal.harness ?? 'cli',
        sessionId: proposal.sessionId,
        summary: `[${verdict}] Arbitrated "${proposal.action}" (${conflicts.length} conflict(s))`,
        affectedPaths: targetPaths,
        tags: Array.from(new Set(['arbitration', verdict.toLowerCase(), ...(proposal.tags ?? [])])),
        payload: {
          proposal,
          verdict,
          supersedesSessionContext,
          conflicts,
          matchedLessonIds: relevantLessons.slice(0, 5).map((m) => m.lesson.id),
          appliedDirectiveIds: applicableDirectives.map((d) => d.id)
        }
      });
    }

    return {
      verdict,
      supersedesSessionContext,
      precedenceOrder: AuthorityEngine.PRECEDENCE,
      conflicts,
      relevantLessons,
      applicableDirectives,
      applicableDecisions,
      authoritativeSummary,
      recordedEvent
    };
  }

  private formatVerdictSummary(
    verdict: ArbitrationVerdict,
    conflicts: AuthorityConflict[],
    lessons: LessonMatch[],
    directives: DirectiveRecord[]
  ): string {
    const lines: string[] = [
      `Verdict: ${verdict}`,
      `Precedence: ${AuthorityEngine.PRECEDENCE.join(' > ')}`
    ];

    if (conflicts.length > 0) {
      lines.push('', 'Conflicts (Session Context Superseded):');
      for (const c of conflicts) {
        lines.push(`- [${c.level} | ${c.severity}] ${c.message}`);
        lines.push(`  Guidance: ${c.authoritativeGuidance} (event: ${c.eventId})`);
      }
    }

    if (directives.length > 0) {
      lines.push('', 'Active Directives in Scope:');
      for (const d of directives) {
        lines.push(`- [${d.severity}] ${d.title}: ${d.directive}`);
      }
    }

    if (lessons.length > 0) {
      lines.push('', 'Relevant Lessons:');
      for (const m of lessons) {
        lines.push(
          `- ${m.lesson.title} (score ${m.score}): ${m.lesson.preventionRule} [Resolution: ${m.lesson.resolution}]`
        );
      }
    }

    return lines.join('\n');
  }

  public compileAuthoritativeBrief(state: WorkspaceProjection, focusPaths: string[] = []): string {
    const activeDirectives = Object.values(state.directives).filter((d) => d.active);
    const activeLessons = Object.values(state.lessons).filter((l) => !l.supersededBy);
    const openIssues = Object.values(state.issues).filter((i) => i.status !== 'resolved');
    const unresolvedCrashes = state.crashes.filter((c) => !c.resolvedByEventId);
    const activeDecisions = Object.values(state.decisions).filter((d) => d.status === 'active');

    const lines: string[] = [
      `# Number One — System of Record Brief`,
      '',
      `Precedence: SoR Invariants & Directives supersede local session context on conflict.`,
      '',
      `- Workspace: \`${state.workspaceRoot}\``,
      `- Stream Position: seq #${state.lastSeq} (\`${state.lastEventHash.slice(0, 12)}\`)`,
      `- Branch / Commit: \`${state.currentBranch ?? 'unknown'}\` @ \`${state.lastCommitSha?.slice(0, 8) ?? 'none'}\``,
      `- Files Tracked: ${Object.values(state.files).filter((f) => f.status === 'exists').length}`,
      `- Harnesses Observed: ${state.harnessesSeen.join(', ') || 'none'}`,
      `- Officer KPIs: Engineering=${state.officers.engineering.currentKpiScore ?? 'unmeasured'} | Security=${state.officers.security.currentKpiScore ?? 'unmeasured'} | Bridge=${state.officers.bridge.currentKpiScore ?? 'unmeasured'}`,
      ''
    ];

    if (activeDirectives.length > 0) {
      lines.push(`## Active Directives (${activeDirectives.length})`);
      for (const d of activeDirectives) {
        lines.push(`- **[${d.severity} | ${d.issuedBy}] ${d.title}**: ${d.directive}`);
        if (d.forbiddenPatterns.length > 0) {
          lines.push(`  - Forbidden: \`${d.forbiddenPatterns.join('`, `')}\``);
        }
      }
      lines.push('');
    }

    const relevantLessons =
      focusPaths.length > 0
        ? this.lessonEngine
            .findRelevantLessons(state, { targetPaths: focusPaths })
            .map((m) => m.lesson)
        : activeLessons.slice(-15);

    if (relevantLessons.length > 0) {
      lines.push(`## Lessons Learned (${relevantLessons.length}/${activeLessons.length})`);
      for (const l of relevantLessons) {
        lines.push(`- **${l.title}** [${l.severity}${l.verified ? ', verified' : ''}]`);
        lines.push(`  - Prevention Rule: ${l.preventionRule}`);
        if (l.failedApproaches.length > 0) {
          lines.push(`  - Failed Approaches: ${l.failedApproaches.join('; ')}`);
        }
      }
      lines.push('');
    }

    if (activeDecisions.length > 0) {
      lines.push(`## Active Decisions (${activeDecisions.length})`);
      for (const dec of activeDecisions.slice(-10)) {
        lines.push(`- **${dec.title}**: ${dec.decision} *(Rationale: ${dec.rationale})*`);
      }
      lines.push('');
    }

    if (unresolvedCrashes.length > 0) {
      lines.push(`## Unresolved Failures (${unresolvedCrashes.length})`);
      for (const c of unresolvedCrashes.slice(-5)) {
        lines.push(`- [seq #${c.seq}] \`${c.command}\` (exit ${c.exitCode ?? 'null'}): ${c.errorSignature}`);
      }
      lines.push('');
    }

    if (openIssues.length > 0) {
      lines.push(`## Open Issues (${openIssues.length})`);
      for (const issue of openIssues.slice(-10)) {
        lines.push(`- **[${issue.priority} | ${issue.kind}] ${issue.title}** (${issue.status})`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
