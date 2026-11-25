/**
 * ReDoS-resistant regex validator, safe compiler, and linear-time DP glob matcher
 * (OWASP ASVS V5.1.4 / CWE-1333).
 */

export const MAX_REGEX_LENGTH = 512;
export const MAX_REGEX_INPUT_LENGTH = 100_000;
export const MAX_GLOB_LENGTH = 256;

export interface SafeRegexValidation {
  safe: boolean;
  reason?: string;
}

/**
 * Statically inspects a regex pattern for catastrophic backtracking risks:
 *  - Exceeds MAX_REGEX_LENGTH
 *  - Numeric (\1..\9) or named (\k<name>) backreferences
 *  - Lookarounds ((?=...), (?!...), (?<=...), (?<!...))
 *  - Nested quantifiers including optional `?` inside repeated groups (e.g., `(a+)+`, `(a?a?)+`, `([a-z]{1,5})+`)
 *  - Repeated alternation groups (`(a|b)+`)
 *  - Adjacent unbounded wildcards (`.*.*`, `.+.+`, `.*.+`, `.+.*`) or consecutive overlapping token quantifiers (`\w+\w+`)
 */
export function validateRegexSafety(pattern: string): SafeRegexValidation {
  if (!pattern || typeof pattern !== 'string') {
    return { safe: false, reason: 'Regex pattern must be a non-empty string.' };
  }
  if (pattern.length > MAX_REGEX_LENGTH) {
    return { safe: false, reason: `Regex pattern exceeds max length (${MAX_REGEX_LENGTH}).` };
  }
  if (/\\[1-9]|\\k<[^>]+>/.test(pattern)) {
    return {
      safe: false,
      reason: 'Numeric or named backreferences (\\1..\\9, \\k<name>) are disallowed due to backtracking risk.'
    };
  }
  if (/\(\?[=!<]/.test(pattern)) {
    return {
      safe: false,
      reason: 'Lookahead and lookbehind assertions are disallowed in dynamic regex patterns.'
    };
  }
  if (/\.[*+]\s*\.[*+]/.test(pattern)) {
    return { safe: false, reason: 'Adjacent unbounded wildcards (.*.*, .+.*, etc.) are disallowed.' };
  }
  if (/(\\[wdsWDS])[*+]\s*\1[*+]/.test(pattern)) {
    return {
      safe: false,
      reason: 'Adjacent identical unbounded character-class quantifiers are disallowed (polynomial ReDoS risk).'
    };
  }

  interface GroupFrame {
    hasQuantifier: boolean;
    hasAlternation: boolean;
  }
  const stack: GroupFrame[] = [];
  let inCharClass = false;
  let escaped = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (inCharClass) {
      if (ch === ']') inCharClass = false;
      continue;
    }
    if (ch === '[') {
      inCharClass = true;
      continue;
    }
    if (ch === '(') {
      stack.push({ hasQuantifier: false, hasAlternation: false });
      continue;
    }
    if (ch === '|') {
      if (stack.length > 0) {
        stack[stack.length - 1]!.hasAlternation = true;
      }
      continue;
    }
    if (ch === ')') {
      const frame = stack.pop();
      if (!frame) continue;
      const next = pattern[i + 1];
      const isRepeatedGroup =
        next === '+' || next === '*' || (next === '{' && /^\{\d+(?:,\d*)?\}/.test(pattern.slice(i + 1)));
      if (isRepeatedGroup && frame.hasQuantifier) {
        return {
          safe: false,
          reason: 'Nested quantifiers inside repeated group detected (ReDoS risk).'
        };
      }
      if (isRepeatedGroup && frame.hasAlternation) {
        return {
          safe: false,
          reason: 'Repeated alternation group detected (potential polynomial/exponential ReDoS risk).'
        };
      }
      if (stack.length > 0 && (frame.hasQuantifier || isRepeatedGroup || next === '?')) {
        stack[stack.length - 1]!.hasQuantifier = true;
      }
      continue;
    }

    if (ch === '+' || ch === '*' || ch === '?' || ch === '{') {
      const prev = i > 0 ? pattern[i - 1] : '';
      // Ignore `(?:` non-capturing group prefix and lazy `?` immediately following `+`/`*`/`}`/`?`
      if (ch === '?' && (prev === '(' || prev === '+' || prev === '*' || prev === '}' || prev === '?')) {
        continue;
      }
      const isQuantifier =
        ch === '+' ||
        ch === '*' ||
        ch === '?' ||
        /^\{\d+(?:,\d*)?\}/.test(pattern.slice(i));
      if (isQuantifier && stack.length > 0) {
        stack[stack.length - 1]!.hasQuantifier = true;
      }
    }
  }

  try {
    new RegExp(pattern, 'i');
  } catch (err) {
    return {
      safe: false,
      reason: `Invalid regex syntax: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  return { safe: true };
}

export function compileSafeRegex(pattern: string, flags = 'i'): RegExp | null {
  const check = validateRegexSafety(pattern);
  if (!check.safe) return null;
  return new RegExp(pattern, flags);
}

export function testSafeRegex(pattern: string, input: string, flags = 'i'): boolean {
  const rx = compileSafeRegex(pattern, flags);
  if (!rx) return false;
  const bounded =
    input.length > MAX_REGEX_INPUT_LENGTH ? input.slice(0, MAX_REGEX_INPUT_LENGTH) : input;
  return rx.test(bounded);
}

/**
 * Linear-time O(N * M) dynamic-programming path glob matcher (zero regex backtracking).
 * Supports:
 *  - `**\/` (zero or more directory segments)
 *  - `**` (any characters including `/`)
 *  - `*` (any characters except `/`)
 *  - `?` (single character except `/`)
 */
export function matchGlobLinear(inputPath: string, rawGlob: string, caseInsensitive = false): boolean {
  if (!rawGlob || rawGlob.length > MAX_GLOB_LENGTH) return false;
  const normPath = inputPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const normGlob = rawGlob.replace(/\\/g, '/').replace(/^\.\//, '');
  const text = caseInsensitive ? normPath.toLowerCase() : normPath;
  const pat = caseInsensitive ? normGlob.toLowerCase() : normGlob;

  // Tokenize glob into linear atoms: 'GLOBSTAR_SLASH' | 'GLOBSTAR' | 'STAR' | 'QMARK' | literal char
  type Atom =
    | { kind: 'globstar_slash' }
    | { kind: 'globstar' }
    | { kind: 'star' }
    | { kind: 'qmark' }
    | { kind: 'lit'; ch: string };

  const atoms: Atom[] = [];
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i]!;
    if (ch === '*' && pat[i + 1] === '*') {
      // Collapse consecutive **
      while (pat[i + 1] === '*') i++;
      if (pat[i + 1] === '/') {
        if (atoms[atoms.length - 1]?.kind !== 'globstar_slash') {
          atoms.push({ kind: 'globstar_slash' });
        }
        i++;
      } else if (atoms[atoms.length - 1]?.kind !== 'globstar') {
        atoms.push({ kind: 'globstar' });
      }
    } else if (ch === '*') {
      if (atoms[atoms.length - 1]?.kind !== 'star' && atoms[atoms.length - 1]?.kind !== 'globstar') {
        atoms.push({ kind: 'star' });
      }
    } else if (ch === '?') {
      atoms.push({ kind: 'qmark' });
    } else {
      atoms.push({ kind: 'lit', ch });
    }
  }

  const m = atoms.length;
  const n = text.length;
  // dp[j] = whether atoms[0..i-1] matches text[0..j-1]
  let prev = new Uint8Array(n + 1);
  prev[0] = 1;

  for (let i = 0; i < m; i++) {
    const atom = atoms[i]!;
    const curr = new Uint8Array(n + 1);

    if (atom.kind === 'globstar') {
      let seen = 0;
      for (let j = 0; j <= n; j++) {
        if (prev[j]) seen = 1;
        curr[j] = seen;
      }
    } else if (atom.kind === 'globstar_slash') {
      // Matches empty string OR any prefix ending at a '/'
      let anyReachable = 0;
      for (let j = 0; j <= n; j++) {
        if (prev[j]) {
          curr[j] = 1;
          anyReachable = 1;
        }
        if (j > 0 && text[j - 1] === '/' && anyReachable) {
          curr[j] = 1;
        }
      }
    } else if (atom.kind === 'star') {
      for (let j = 0; j <= n; j++) {
        if (prev[j]) {
          curr[j] = 1;
        } else if (j > 0 && curr[j - 1] && text[j - 1] !== '/') {
          curr[j] = 1;
        }
      }
    } else if (atom.kind === 'qmark') {
      for (let j = 1; j <= n; j++) {
        if (prev[j - 1] && text[j - 1] !== '/') {
          curr[j] = 1;
        }
      }
    } else {
      for (let j = 1; j <= n; j++) {
        if (prev[j - 1] && text[j - 1] === atom.ch) {
          curr[j] = 1;
        }
      }
    }
    prev = curr;
  }

  return prev[n] === 1;
}
