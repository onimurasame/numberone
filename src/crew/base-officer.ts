import path from 'node:path';
import { KnowledgePractice, OfficerRole, WorkspaceProjection } from '../core/types.js';
import { readTextFileSafe, walkWorkspaceFiles } from '../utils/fs-helpers.js';
import { WorkspaceIgnore } from '../utils/ignore.js';
import { isSensitiveSecretFile } from '../utils/redactor.js';
import { compileSafeRegex, matchGlobLinear, MAX_REGEX_INPUT_LENGTH } from '../utils/safe-regex.js';
import {
  CheckEvaluation,
  CrewOfficer,
  OfficerAssessment,
  OfficerFinding,
  VerificationSample
} from './types.js';

/**
 * Canonical declarative container & IaC detection patterns shared across
 * EngineeringOfficer and BridgeOfficer so cross-officer assessments never contradict.
 */
export const SHARED_CONTAINER_FILE_RX =
  /(^|\/)(Dockerfile|Containerfile|docker-compose\.ya?ml|compose\.ya?ml)$/i;

export const SHARED_IAC_FILE_RX =
  /(\.tf$|Pulumi\.ya?ml$|cdk\.json$|Chart\.ya?ml$|kustomization\.ya?ml$|(^|\/)(k8s|helm|terraform|infra)\/)/i;

const MAX_DYNAMIC_FILES_PER_PRACTICE = 400;

export function matchesSimpleGlob(filePath: string, glob: string): boolean {
  const normPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const normGlob = glob.replace(/\\/g, '/').replace(/^\.\//, '');
  return matchGlobLinear(normPath, normGlob, true);
}

/**
 * Evaluates a single `KnowledgePractice['matcher']` against an in-memory file set
 * using linear-time DP glob matching, ReDoS-safe regex compilation, and bounded input lengths.
 */
export function evaluatePracticeMatcherOnVirtualFiles(
  practice: Pick<KnowledgePractice, 'id' | 'title' | 'category' | 'description' | 'matcher'>,
  files: VerificationSample[],
  allFilePaths?: string[]
): { violated: boolean; evidence: string; matchedPaths: string[] } {
  const matcher = practice.matcher;
  if (!matcher) {
    return { violated: false, evidence: 'No executable matcher attached.', matchedPaths: [] };
  }

  if (matcher.missingFile) {
    const target = matcher.missingFile;
    const candidatePaths = allFilePaths ?? files.map((f) => f.path);
    const exists = candidatePaths.some((p) => p === target || matchesSimpleGlob(p, target));
    if (!exists) {
      return {
        violated: true,
        evidence: `Required file matching "${target}" is absent.`,
        matchedPaths: []
      };
    }
  }

  if (matcher.requiredContentRegex) {
    const rx = compileSafeRegex(matcher.requiredContentRegex, 'im');
    if (!rx) {
      return {
        violated: false,
        evidence: `Skipped unsafe requiredContentRegex pattern.`,
        matchedPaths: []
      };
    }
    const scoped = matcher.fileGlob
      ? files.filter((f) => matchesSimpleGlob(f.path, matcher.fileGlob!))
      : files;
    if (
      scoped.length === 0 ||
      !scoped.some((f) => rx.test(f.content.slice(0, MAX_REGEX_INPUT_LENGTH)))
    ) {
      return {
        violated: true,
        evidence: `Required pattern /${matcher.requiredContentRegex}/ not found${matcher.fileGlob ? ` in ${matcher.fileGlob}` : ''}.`,
        matchedPaths: scoped.map((s) => s.path)
      };
    }
  }

  if (matcher.contentRegex) {
    const rx = compileSafeRegex(matcher.contentRegex, 'im');
    if (!rx) {
      return {
        violated: false,
        evidence: `Skipped unsafe contentRegex pattern.`,
        matchedPaths: []
      };
    }
    const matchedPaths: string[] = [];
    for (const f of files) {
      if (matcher.fileGlob && !matchesSimpleGlob(f.path, matcher.fileGlob)) continue;
      if (rx.test(f.content.slice(0, MAX_REGEX_INPUT_LENGTH))) {
        matchedPaths.push(f.path);
      }
    }
    if (matchedPaths.length > 0) {
      return {
        violated: true,
        evidence: `Forbidden pattern /${matcher.contentRegex}/ matched in ${matchedPaths.slice(0, 5).join(', ')}.`,
        matchedPaths
      };
    }
  }

  return {
    violated: false,
    evidence: `Satisfied practice "${practice.title}".`,
    matchedPaths: []
  };
}

/**
 * Strips comments and echo/printf lines from CI YAML or shell scripts so naive
 * `echo "deploy canary rollback"` lines are never mistaken for real automation.
 */
export function stripShellEchoAndComments(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return false;
      const afterDash = trimmed.replace(/^-\s*/, '').replace(/^run:\s*\|?\s*/i, '').trim();
      if (/^(?:echo|printf)\b/i.test(afterDash)) return false;
      return true;
    })
    .join('\n');
}

/**
 * Computes transparent weighted pass score and per-category breakdown strictly
 * from explicit `CheckEvaluation[]` entries — zero arbitrary baseline constants.
 */
export function computeScoresFromChecks(checks: CheckEvaluation[]): {
  kpiScore: number;
  kpiBreakdown: Record<string, number>;
} {
  const applicable = checks.filter((c) => c.applicable && c.weight > 0);
  if (applicable.length === 0) {
    return { kpiScore: 100, kpiBreakdown: {} };
  }

  const totalWeight = applicable.reduce((sum, c) => sum + c.weight, 0);
  const earnedWeight = applicable
    .filter((c) => c.passed)
    .reduce((sum, c) => sum + c.weight, 0);

  const kpiScore = Math.round((earnedWeight / totalWeight) * 1000) / 10;

  const byCat = new Map<string, { earned: number; total: number }>();
  for (const c of applicable) {
    const curr = byCat.get(c.category) ?? { earned: 0, total: 0 };
    curr.total += c.weight;
    if (c.passed) curr.earned += c.weight;
    byCat.set(c.category, curr);
  }

  const kpiBreakdown: Record<string, number> = {};
  for (const [cat, { earned, total }] of byCat.entries()) {
    kpiBreakdown[cat] = total > 0 ? Math.round((earned / total) * 1000) / 10 : 100;
  }

  return { kpiScore, kpiBreakdown };
}

/**
 * Base class for Bridge Crew expert officers.
 */
export abstract class BaseBridgeOfficer implements CrewOfficer {
  public abstract readonly role: OfficerRole;
  public abstract readonly title: string;
  public abstract readonly mainKpiName: string;
  public abstract readonly mandate: string;

  public abstract getBaselinePractices(): KnowledgePractice[];
  public abstract assess(
    workspaceRoot: string,
    projection: WorkspaceProjection,
    topic?: string,
    targetPaths?: string[]
  ): OfficerAssessment;

  protected listWorkspaceFiles(workspaceRoot: string): string[] {
    const ignore = new WorkspaceIgnore(workspaceRoot);
    return walkWorkspaceFiles(workspaceRoot, (p, d) => ignore.shouldIgnore(p, d));
  }

  protected prioritizeTargetPaths(files: string[], targetPaths?: string[]): string[] {
    if (!targetPaths || targetPaths.length === 0) return files;
    const normalizedTargets = new Set(targetPaths.map((p) => p.replace(/\\/g, '/').replace(/^\.\//, '')));
    const targetPrefixes = Array.from(normalizedTargets, (t) => {
      let end = t.length;
      while (end > 0 && t.charCodeAt(end - 1) === 47 /* '/' */) {
        end -= 1;
      }
      return `${end === t.length ? t : t.slice(0, end)}/`;
    });
    const priority: string[] = [];
    const rest: string[] = [];
    for (const f of files) {
      if (normalizedTargets.has(f) || targetPrefixes.some((prefix) => f.startsWith(prefix))) {
        priority.push(f);
      } else {
        rest.push(f);
      }
    }
    return [...priority, ...rest];
  }

  protected getEffectivePractices(projection: WorkspaceProjection): KnowledgePractice[] {
    const map = new Map<string, KnowledgePractice>();
    for (const p of this.getBaselinePractices()) {
      map.set(p.id, p);
    }
    const evolved = projection.officers[this.role]?.practices ?? {};
    for (const [id, practice] of Object.entries(evolved)) {
      if (practice.active) {
        map.set(id, practice);
      } else {
        map.delete(id);
      }
    }
    return Array.from(map.values());
  }

  /**
   * Evaluates dynamically promoted practices as first-class `CheckEvaluation` items.
   * Filters by `fileGlob` BEFORE slicing, skips reading sensitive secret file bodies,
   * and evaluates `missingFile` against the complete workspace file inventory.
   */
  protected evaluateDynamicPractices(
    workspaceRoot: string,
    files: string[],
    projection: WorkspaceProjection
  ): { checks: CheckEvaluation[]; findings: OfficerFinding[] } {
    const checks: CheckEvaluation[] = [];
    const findings: OfficerFinding[] = [];
    const evolved = Object.values(projection.officers[this.role]?.practices ?? {}).filter(
      (p) => p.active && p.matcher
    );
    if (evolved.length === 0) return { checks, findings };

    const contentCache = new Map<string, string>();
    const loadSamplesForPractice = (practice: KnowledgePractice): VerificationSample[] => {
      const matcher = practice.matcher;
      if (!matcher || (!matcher.contentRegex && !matcher.requiredContentRegex)) {
        return [];
      }
      const candidates = files.filter((f) => {
        if (isSensitiveSecretFile(f)) return false;
        if (matcher.fileGlob && !matchesSimpleGlob(f, matcher.fileGlob)) return false;
        return true;
      });
      const samples: VerificationSample[] = [];
      for (const f of candidates.slice(0, MAX_DYNAMIC_FILES_PER_PRACTICE)) {
        let text = contentCache.get(f);
        if (text === undefined) {
          text = readTextFileSafe(path.join(workspaceRoot, f), 200_000, workspaceRoot) ?? '';
          contentCache.set(f, text);
        }
        samples.push({ path: f, content: text });
      }
      return samples;
    };

    for (const practice of evolved) {
      const sev = practice.matcher?.severity ?? 'medium';
      const weight = practice.weight ?? (sev === 'critical' ? 20 : sev === 'high' ? 15 : 10);
      const samples = loadSamplesForPractice(practice);
      const evalRes = evaluatePracticeMatcherOnVirtualFiles(practice, samples, files);

      checks.push({
        id: `evolved-${practice.id}`,
        category: practice.category,
        title: practice.title,
        weight,
        applicable: true,
        passed: !evalRes.violated,
        evidence: evalRes.evidence
      });

      if (evalRes.violated) {
        findings.push({
          id: `evolved-${practice.id}`,
          severity: sev,
          category: practice.category,
          title: practice.title,
          description: practice.description,
          evidence: evalRes.evidence,
          affectedPaths: evalRes.matchedPaths.slice(0, 10),
          recommendation: `Satisfy evolved practice "${practice.title}" (${practice.evidenceSummary}).`,
          blocksRelease: sev === 'critical'
        });
      }
    }

    return { checks, findings };
  }
}
