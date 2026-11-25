/**
 * Deterministic secret and credential redaction engine (OWASP ASVS V7/V8 / CWE-532 / CWE-200).
 * Prevents API keys, tokens, passwords, private keys, and credentialed URIs from being
 * persisted into `.numberone/stream/` or mirrored to external GitHub/Jira/LLM endpoints.
 */

interface RedactionRule {
  name: string;
  regex: RegExp;
  replace: (match: string, ...groups: string[]) => string;
}

const FORBIDDEN_RECORD_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'toString',
  'valueOf',
  'hasOwnProperty'
]);

/**
 * Returns true if `key` is safe to use as a dynamic lookup/write key on plain objects.
 */
export function isSafeRecordKey(key: string): boolean {
  return typeof key === 'string' && key.length > 0 && !FORBIDDEN_RECORD_KEYS.has(key);
}

// Matches both complete and truncated PEM / PGP private key blocks
const PEM_BLOCK_RX = new RegExp(
  '-----BEGIN ' +
    '(?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?' +
    'PRIVATE KEY(?: BLOCK)?-----[\\s\\S]*?(?:-----END ' +
    '(?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?' +
    'PRIVATE KEY(?: BLOCK)?-----|$)',
  'g'
);

const REDACTION_RULES: RedactionRule[] = [
  {
    name: 'pem-private-key',
    regex: PEM_BLOCK_RX,
    replace: () => '[REDACTED:PRIVATE_KEY]'
  },
  {
    name: 'aws-access-key',
    regex: new RegExp('\\b(?:AKIA|ASIA)' + '[0-9A-Z]{16}\\b', 'g'),
    replace: () => '[REDACTED:AWS_ACCESS_KEY]'
  },
  {
    name: 'github-token',
    regex: new RegExp('\\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_' + '[A-Za-z0-9_]{20,}\\b', 'g'),
    replace: () => '[REDACTED:GITHUB_TOKEN]'
  },
  {
    name: 'gitlab-token',
    regex: /\b(?:glpat|gloas|glrt)-[A-Za-z0-9_-]{20,}\b/g,
    replace: () => '[REDACTED:GITLAB_TOKEN]'
  },
  {
    name: 'npm-token',
    regex: /\bnpm_[A-Za-z0-9]{20,}\b/g,
    replace: () => '[REDACTED:NPM_TOKEN]'
  },
  {
    name: 'pypi-token',
    regex: /\bpypi-[A-Za-z0-9_-]{20,}\b/g,
    replace: () => '[REDACTED:PYPI_TOKEN]'
  },
  {
    name: 'anthropic-key',
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    replace: () => '[REDACTED:ANTHROPIC_KEY]'
  },
  {
    name: 'openai-key',
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    replace: () => '[REDACTED:OPENAI_KEY]'
  },
  {
    name: 'google-api-key',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    replace: () => '[REDACTED:GOOGLE_API_KEY]'
  },
  {
    name: 'google-oauth-token',
    regex: /\bya29\.[0-9A-Za-z_-]{20,}\b/g,
    replace: () => '[REDACTED:GOOGLE_OAUTH_TOKEN]'
  },
  {
    name: 'slack-token',
    regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
    replace: () => '[REDACTED:SLACK_TOKEN]'
  },
  {
    name: 'stripe-key',
    regex: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/g,
    replace: () => '[REDACTED:STRIPE_KEY]'
  },
  {
    name: 'azure-sas-sig',
    regex: /([?&]sig=)([A-Za-z0-9%+/=_-]{20,})/gi,
    replace: (_m, prefix) => `${prefix}[REDACTED:AZURE_SAS]`
  },
  {
    name: 'bearer-or-basic-auth',
    regex: /\b(Authorization['"]?[ \t]*[:=][ \t]*['"]?(?:Bearer|Basic)[ \t]+)([A-Za-z0-9._~+/=-]{8,})/gi,
    replace: (_m, prefix) => `${prefix}[REDACTED:AUTH_CREDENTIAL]`
  },
  {
    name: 'url-credentials',
    regex: /\b((?:postgres|postgresql|mysql|mariadb|mongodb|mongodb\+srv|redis|rediss|amqp|amqps|https?):\/\/[^/\s:@]*:)([^/\s@]+)(@)/gi,
    replace: (_m, prefix, _secret, at) => `${prefix}[REDACTED:URI_PASSWORD]${at}`
  },
  {
    name: 'jwt',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replace: () => '[REDACTED:JWT]'
  },
  {
    // Bounded prefix/suffix lengths (0..40) prevent quadratic ReDoS; supports JSON quotes & hyphenated headers
    name: 'env-or-json-secret-assignment',
    regex:
      /\b([A-Za-z0-9_-]{0,40}(?:SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE|API[-_]?KEY|PRIVATE[-_]?KEY|ACCESS[-_]?KEY|AUTH[-_]?KEY|ACCOUNT[-_]?KEY)[A-Za-z0-9_-]{0,40}['"]?[ \t]*[:=][ \t]*['"]?)([^\s'",;}{]{8,})/gi,
    replace: (_m, prefix, val) => {
      if (
        val.startsWith('[REDACTED:') ||
        val.startsWith('$') ||
        val === 'undefined' ||
        val === 'null' ||
        val === 'REDACTED'
      ) {
        return `${prefix}${val}`;
      }
      return `${prefix}[REDACTED:SECRET_VALUE]`;
    }
  }
];

const SLACK_WEBHOOK_PREFIX = 'https://hooks.slack.com/services/';

function isAsciiUpperOrDigit(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90);
}

function isAsciiAlphaNum(code: number): boolean {
  return isAsciiUpperOrDigit(code) || (code >= 97 && code <= 122);
}

function redactSlackWebhooks(input: string): string {
  let cursor = input.indexOf(SLACK_WEBHOOK_PREFIX);
  if (cursor === -1) return input;

  let out = '';
  let lastEmit = 0;

  while (cursor !== -1) {
    let i = cursor + SLACK_WEBHOOK_PREFIX.length;
    const seg1Start = i;
    while (i < input.length && isAsciiUpperOrDigit(input.charCodeAt(i))) i += 1;
    const seg1Len = i - seg1Start;

    if (seg1Len > 0 && i < input.length && input.charCodeAt(i) === 47 /* '/' */) {
      i += 1;
      const seg2Start = i;
      while (i < input.length && isAsciiUpperOrDigit(input.charCodeAt(i))) i += 1;
      const seg2Len = i - seg2Start;

      if (seg2Len > 0 && i < input.length && input.charCodeAt(i) === 47 /* '/' */) {
        i += 1;
        const seg3Start = i;
        while (i < input.length && isAsciiAlphaNum(input.charCodeAt(i))) i += 1;
        const seg3Len = i - seg3Start;

        if (seg3Len > 0) {
          out += input.slice(lastEmit, cursor) + '[REDACTED:SLACK_WEBHOOK]';
          lastEmit = i;
          cursor = input.indexOf(SLACK_WEBHOOK_PREFIX, i);
          continue;
        }
      }
    }
    cursor = input.indexOf(SLACK_WEBHOOK_PREFIX, cursor + SLACK_WEBHOOK_PREFIX.length);
  }

  return lastEmit === 0 ? input : out + input.slice(lastEmit);
}

const SENSITIVE_EXACT_BASENAMES = new Set([
  '.env',
  '.envrc',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
  'id_dsa',
  'terraform.tfstate',
  'terraform.tfstate.backup',
  '.npmrc',
  '.pypirc',
  '.netrc',
  '.pgpass',
  '.git-credentials',
  'credentials.json'
]);

const SAFE_ENV_TEMPLATE_BASENAMES = new Set(['.env.example', '.env.sample', '.env.template']);

const SENSITIVE_FILE_EXTENSIONS = ['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.tfvars'];

const SENSITIVE_RELATIVE_SUFFIXES = ['.aws/credentials', '.kube/config', '.docker/config.json'];

/**
 * Returns true if the relative path is a known secret/credential file whose raw contents
 * must NEVER be captured into stream diffs, fallback blobs, or dynamic officer probes.
 * Implemented in strictly linear O(n) time without backtracking regular expressions.
 */
export function isSensitiveSecretFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  const lastSlash = normalized.lastIndexOf('/');
  const base = lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);

  if (SENSITIVE_EXACT_BASENAMES.has(base)) return true;
  if (base.startsWith('.env.') && !SAFE_ENV_TEMPLATE_BASENAMES.has(base)) return true;
  if (SENSITIVE_FILE_EXTENSIONS.some((ext) => base.endsWith(ext))) return true;
  if (
    base.endsWith('.json') &&
    (base.startsWith('serviceaccount') ||
      base.startsWith('service-account') ||
      base.startsWith('service_account'))
  ) {
    return true;
  }
  return SENSITIVE_RELATIVE_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`/${suffix}`)
  );
}

export function redactSecrets(input: string): string {
  if (!input) return input;
  let out = redactSlackWebhooks(input);
  for (const rule of REDACTION_RULES) {
    rule.regex.lastIndex = 0;
    out = out.replace(rule.regex, rule.replace as (...args: string[]) => string);
  }
  return out;
}

/**
 * Recursively redacts all string values in an arbitrary JSON-compatible payload.
 * Enforces maxDepth cleanly (redacting beyond maxDepth instead of returning raw data),
 * preserves Date ISO values, guards against circular refs, and strips prototype-pollution keys.
 */
export function redactObjectDeep<T>(value: T, maxDepth = 12): T {
  const seen = new WeakSet<object>();

  function walk(node: unknown, depth: number): unknown {
    if (typeof node === 'string') return redactSecrets(node);
    if (node === null || typeof node !== 'object') return node;
    if (node instanceof Date) return node.toISOString();
    if (depth >= maxDepth) return '[REDACTED:MAX_DEPTH]';
    if (seen.has(node)) return '[Circular]';
    seen.add(node);

    if (Array.isArray(node)) {
      return node.map((item) => walk(item, depth + 1));
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (!isSafeRecordKey(k)) continue;
      out[k] = walk(v, depth + 1);
    }
    return out;
  }

  return walk(value, 0) as T;
}

const ALLOWED_CHILD_ENV_KEYS = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'TZ',
  'TERM',
  'NODE_ENV',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT'
]);

/**
 * Strict allowlist environment sanitizer for benchmark child processes.
 * Only forwards standard POSIX/Node runtime variables (never tokens, URLs, sockets, or DSNs).
 */
export function buildSanitizedChildEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(baseEnv)) {
    if (v === undefined) continue;
    const upper = k.toUpperCase();
    if (ALLOWED_CHILD_ENV_KEYS.has(upper) || upper.startsWith('LC_')) {
      sanitized[k] = v;
    }
  }
  return sanitized;
}
