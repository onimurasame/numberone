import { StreamStore } from './stream-store.js';
import { LessonRecord, StreamEvent, WorkspaceProjection } from './types.js';

export interface LessonMatch {
  lesson: LessonRecord;
  score: number;
  reasons: string[];
}

export interface ConsultationQuery {
  intent?: string;
  targetPaths?: string[];
  errorText?: string;
  command?: string;
  tags?: string[];
}

export interface FailureFixCorrelation {
  crashEvent: StreamEvent;
  fixEvent: StreamEvent;
  modifiedPaths: string[];
  intermediateThoughts: string[];
  failedApproaches: string[];
  suggestedLesson: {
    title: string;
    problem: string;
    rootCause: string;
    resolution: string;
    preventionRule: string;
    errorSignatures: string[];
    affectedPaths: string[];
    tags: string[];
    sourceEventIds: string[];
    failedApproaches: string[];
  };
}

function tokenize(text: string): Set<string> {
  const matches = text.toLowerCase().match(/[a-z0-9_.-]{3,}/g) ?? [];
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'from',
    'have',
    'been',
    'were',
    'will',
    'into',
    'about',
    'error',
    'failed',
    'command'
  ]);
  return new Set(matches.filter((t) => !stopWords.has(t)));
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Institutional memory engine designed to inhibit reinventing the wheel:
 *  - Matches active work against historical lessons, failed attempts, and crashes
 *  - Automatically correlates failure -> edits/thinking -> fix sequences into durable lessons
 */
export class LessonEngine {
  private readonly store: StreamStore;

  constructor(store: StreamStore) {
    this.store = store;
  }

  /**
   * Scores and retrieves relevant historical lessons for a proposed task, path, command, or error.
   */
  public findRelevantLessons(state: WorkspaceProjection, query: ConsultationQuery): LessonMatch[] {
    const queryPaths = (query.targetPaths ?? []).map(normalizePath);
    const queryText = [query.intent ?? '', query.errorText ?? '', query.command ?? ''].join(' ');
    const queryTokens = tokenize(queryText);
    const queryTags = new Set((query.tags ?? []).map((t) => t.toLowerCase()));

    const matches: LessonMatch[] = [];

    for (const lesson of Object.values(state.lessons)) {
      if (lesson.supersededBy) continue;
      let score = 0;
      const reasons: string[] = [];

      // 1. Exact or prefix path overlap
      for (const lp of lesson.affectedPaths.map(normalizePath)) {
        for (const qp of queryPaths) {
          if (lp === qp) {
            score += 45;
            reasons.push(`Direct file match: ${lp}`);
          } else if (lp.startsWith(qp + '/') || qp.startsWith(lp + '/')) {
            score += 22;
            reasons.push(`Directory overlap: ${lp} <-> ${qp}`);
          }
        }
      }

      // 2. Error signature matching (against errorText, command, AND intent)
      if (query.errorText || query.command || query.intent) {
        const haystack = `${query.errorText ?? ''} ${query.command ?? ''} ${query.intent ?? ''}`.toLowerCase();
        for (const sig of lesson.errorSignatures) {
          const cleanSig = sig.trim().toLowerCase();
          if (cleanSig.length >= 4 && haystack.includes(cleanSig)) {
            score += 55;
            reasons.push(`Matched historical error signature: "${sig}"`);
          }
        }
      }

      // 3. Tag overlap
      for (const tag of lesson.tags) {
        if (queryTags.has(tag.toLowerCase())) {
          score += 18;
          reasons.push(`Shared tag: #${tag}`);
        }
      }

      // 4. Semantic token overlap across title, problem, rootCause, resolution, preventionRule
      if (queryTokens.size > 0) {
        const lessonTokens = tokenize(
          [
            lesson.title,
            lesson.problem,
            lesson.rootCause,
            lesson.resolution,
            lesson.preventionRule,
            ...lesson.failedApproaches
          ].join(' ')
        );
        let shared = 0;
        const sharedWords: string[] = [];
        for (const tok of queryTokens) {
          if (lessonTokens.has(tok)) {
            shared++;
            if (sharedWords.length < 5) sharedWords.push(tok);
          }
        }
        if (shared > 0) {
          const ratio = shared / Math.max(1, Math.min(queryTokens.size, 8));
          const tokenPoints = Math.round(ratio * 40);
          if (tokenPoints >= 8) {
            score += tokenPoints;
            reasons.push(`Keyword alignment (${sharedWords.join(', ')})`);
          }
        }
      }

      if (score > 0) {
        if (lesson.verified) score += 8;
        if (lesson.severity === 'critical') score += 12;
        else if (lesson.severity === 'high') score += 6;
        matches.push({ lesson, score, reasons: Array.from(new Set(reasons)) });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Finds prior failed attempts matching the proposed work so the agent or human
   * does not retry dead ends already explored in previous sessions/harnesses.
   */
  public findRelevantFailedAttempts(state: WorkspaceProjection, query: ConsultationQuery) {
    const queryPaths = (query.targetPaths ?? []).map(normalizePath);
    const queryTokens = tokenize([query.intent ?? '', query.command ?? '', query.errorText ?? ''].join(' '));
    const queryTags = new Set((query.tags ?? []).map((t) => t.toLowerCase()));

    return state.failedAttempts.filter((attempt) => {
      if (
        attempt.affectedPaths.some((p) => {
          const ap = normalizePath(p);
          return queryPaths.some((qp) => ap === qp || ap.startsWith(qp + '/') || qp.startsWith(ap + '/'));
        })
      ) {
        return true;
      }
      if (attempt.tags.some((t) => queryTags.has(t.toLowerCase()))) return true;
      if (queryTokens.size > 0) {
        const attemptTokens = tokenize(`${attempt.approach} ${attempt.reason}`);
        let overlap = 0;
        for (const tok of queryTokens) {
          if (attemptTokens.has(tok)) overlap++;
        }
        if (overlap >= 2) return true;
      }
      return false;
    });
  }

  /**
   * Inspects the event stream around a successful command completion to see if it
   * resolved a recent failure/crash for the same command — automatically extracting
   * the intermediate edits, thinking, and failed attempts into a structured lesson!
   */
  public detectFailureToFixCorrelation(fixEvent: StreamEvent): FailureFixCorrelation | null {
    if (fixEvent.type !== 'exec.completed') return null;
    const command = typeof fixEvent.payload.command === 'string' ? fixEvent.payload.command : '';
    if (!command) return null;

    const lookbackWindow = 500;
    const priorEvents = this.store.query({
      sinceSeq: Math.max(1, fixEvent.seq - lookbackWindow),
      untilSeq: fixEvent.seq - 1
    });
    let crashEvent: StreamEvent | null = null;

    for (let i = priorEvents.length - 1; i >= 0; i--) {
      const ev = priorEvents[i]!;
      const evCmd = typeof ev.payload.command === 'string' ? ev.payload.command : '';
      if (ev.type === 'exec.completed' && evCmd === command) {
        // Already succeeded before without an intervening crash
        return null;
      }
      if ((ev.type === 'exec.failed' || ev.type === 'exec.crashed') && evCmd === command) {
        crashEvent = ev;
        break;
      }
    }

    if (!crashEvent) return null;

    const intervening = priorEvents.filter((e) => e.seq > crashEvent!.seq && e.seq < fixEvent.seq);
    const modifiedPaths = Array.from(
      new Set(
        intervening
          .filter((e) => e.type === 'fs.modified' || e.type === 'fs.created' || e.type === 'fs.deleted')
          .flatMap((e) => e.affectedPaths)
      )
    );
    const intermediateThoughts = intervening
      .filter((e) => e.type === 'chat.thinking')
      .map((e) => String(e.payload.thought ?? e.summary));
    const failedApproaches = intervening
      .filter((e) => e.type === 'attempt.failed')
      .map((e) => String(e.payload.approach ?? e.summary).trim())
      .filter(Boolean);

    const errorSig = String(
      crashEvent.payload.errorSignature ?? crashEvent.payload.stderrExcerpt ?? crashEvent.summary
    )
      .split(/\r?\n/)[0]!
      .trim()
      .slice(0, 140);

    const affectedPaths = Array.from(new Set([...crashEvent.affectedPaths, ...modifiedPaths])).sort();

    return {
      crashEvent,
      fixEvent,
      modifiedPaths,
      intermediateThoughts,
      failedApproaches,
      suggestedLesson: {
        title: `Resolved failure in \`${command}\`: ${errorSig.slice(0, 80)}`,
        problem: `Command \`${command}\` failed with exit code ${String(crashEvent.payload.exitCode ?? 'unknown')}: ${errorSig}`,
        rootCause:
          intermediateThoughts.length > 0
            ? intermediateThoughts.join(' | ')
            : `Failure observed at seq #${crashEvent.seq}; resolved after modifying ${modifiedPaths.join(', ') || 'workspace state'}.`,
        resolution:
          modifiedPaths.length > 0
            ? `Modified ${modifiedPaths.join(', ')} and verified \`${command}\` succeeded at seq #${fixEvent.seq}.`
            : `Verified \`${command}\` succeeded at seq #${fixEvent.seq}.`,
        preventionRule: `When encountering "${errorSig}" on \`${command}\`, inspect ${modifiedPaths.join(', ') || 'recent changes'} and avoid previously failed approaches.`,
        errorSignatures: errorSig ? [errorSig] : [],
        affectedPaths,
        tags: Array.from(new Set(['auto-correlated', 'crash-fix', ...crashEvent.tags, ...fixEvent.tags])),
        sourceEventIds: [crashEvent.id, ...intervening.map((e) => e.id), fixEvent.id],
        failedApproaches
      }
    };
  }
}
