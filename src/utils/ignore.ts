import path from 'node:path';
import { readTextFileSafe } from './fs-helpers.js';
import { MAX_GLOB_LENGTH, matchGlobLinear } from './safe-regex.js';

const DEFAULT_IGNORED_SEGMENTS = new Set([
  '.git',
  '.numberone',
  'node_modules',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  'dist',
  'build',
  'target',
  'coverage',
  '.idea',
  '.DS_Store'
]);

interface IgnoreRule {
  negated: boolean;
  dirOnly: boolean;
  anchored: boolean;
  pattern: string;
}

function matchesIgnoreRule(normalizedPath: string, rule: IgnoreRule): boolean {
  const candidates = rule.anchored
    ? [rule.pattern, `${rule.pattern}/**`]
    : [rule.pattern, `**/${rule.pattern}`, `${rule.pattern}/**`, `**/${rule.pattern}/**`];

  for (const glob of candidates) {
    if (glob.length <= MAX_GLOB_LENGTH && matchGlobLinear(normalizedPath, glob)) {
      return true;
    }
  }
  return false;
}

/**
 * Linear-time `.gitignore` / `.numberoneignore` matcher (zero regex backtracking).
 */
export class WorkspaceIgnore {
  private readonly rules: IgnoreRule[] = [];
  private readonly extraSegments: Set<string>;

  constructor(workspaceRoot: string, extraIgnored: string[] = []) {
    this.extraSegments = new Set([...DEFAULT_IGNORED_SEGMENTS, ...extraIgnored]);
    const gitignore = readTextFileSafe(path.join(workspaceRoot, '.gitignore'), 256_000, workspaceRoot);
    if (gitignore) {
      this.parseRules(gitignore);
    }
    const n1Ignore = readTextFileSafe(
      path.join(workspaceRoot, '.numberoneignore'),
      256_000,
      workspaceRoot
    );
    if (n1Ignore) {
      this.parseRules(n1Ignore);
    }
  }

  private parseRules(content: string): void {
    const maxRules = 500;
    for (const rawLine of content.split(/\r?\n/)) {
      if (this.rules.length >= maxRules) break;
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      let negated = false;
      let pattern = line;
      if (pattern.startsWith('!')) {
        negated = true;
        pattern = pattern.slice(1);
      }
      let dirOnly = false;
      if (pattern.endsWith('/')) {
        dirOnly = true;
        pattern = pattern.slice(0, -1);
      }
      let anchored = false;
      if (pattern.startsWith('/')) {
        anchored = true;
        pattern = pattern.slice(1);
      }
      if (!pattern || pattern.length > MAX_GLOB_LENGTH - 8) continue;
      if (pattern.includes('/')) anchored = true;

      this.rules.push({ negated, dirOnly, anchored, pattern });
    }
  }

  public shouldIgnore(relPath: string, isDir = false): boolean {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!normalized) return false;
    const segments = normalized.split('/');
    for (const seg of segments) {
      if (this.extraSegments.has(seg)) return true;
      if (seg.endsWith('.tmp') && seg.startsWith('.')) return true;
    }

    let ignored = false;
    for (const rule of this.rules) {
      if (rule.dirOnly && !isDir && !normalized.includes('/')) continue;
      if (matchesIgnoreRule(normalized, rule)) {
        ignored = !rule.negated;
      }
    }
    return ignored;
  }
}
