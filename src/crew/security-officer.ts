import path from 'node:path';
import { KnowledgePractice, WorkspaceProjection } from '../core/types.js';
import { readTextFileSafe } from '../utils/fs-helpers.js';
import { isSensitiveSecretFile } from '../utils/redactor.js';
import {
  BaseBridgeOfficer,
  computeScoresFromChecks,
  stripShellEchoAndComments
} from './base-officer.js';
import { CheckEvaluation, OfficerAssessment, OfficerFinding, PeerChallenge } from './types.js';

interface CodeSecurityPattern {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'secrets' | 'code' | 'architecture';
  title: string;
  regex: RegExp;
  recommendation: string;
  blocksRelease?: boolean;
}

const MAX_SCAN_FILES = 2000;

// Constructed without embedding literal secret headers or self-matching tokens
const PEM_HEADER_RX = new RegExp(
  '-----BEGIN ' + '(?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?' + 'PRIVATE KEY(?: BLOCK)?-----'
);
const AWS_KEY_RX = new RegExp('\\b(?:AKIA|ASIA)' + '[0-9A-Z]{16}\\b');
const GITHUB_PAT_RX = new RegExp(
  '\\b(?:(?:ghp|gho|ghu|ghs|ghr)_' + '[A-Za-z0-9_]{30,}|github_pat_' + '[A-Za-z0-9_]{20,})\\b'
);
const GITLAB_TOKEN_RX = new RegExp('\\b(?:glpat|gloas|glrt)-' + '[A-Za-z0-9_-]{20,}\\b');
const PROVIDER_API_KEY_RX = new RegExp(
  '\\b(?:' +
    'sk-(?:ant-|proj-)[A-Za-z0-9_-]{20,}|' +
    'sk-[A-Za-z0-9]{24,}|' +
    'AIza[0-9A-Za-z_-]{35}|' +
    'xox[baprs]-[0-9A-Za-z-]{10,}|' +
    'sk_(?:live|test)_[0-9A-Za-z]{20,}' +
    ')\\b'
);
const HARDCODED_SECRET_RX = new RegExp(
  '(?:password|passphrase|api_?secret|jwt_?secret|private_?key)\\s*[:=]\\s*[\'"][A-Za-z0-9!@#$%^&*_+=-]{12,}[\'"]',
  'i'
);
// Matches actual eval(...) / new Function(...) calls at expression boundaries, not regex literals like /\beval\s*\(/
const EVAL_CALL_RX = new RegExp('(?:^|[=({,;:\\s])(?:eval\\s*\\(|new\\s+Function\\s*\\()', 'm');
const TLS_DISABLED_RX = new RegExp(
  'rejectUnauthorized\\s*:\\s*false|NODE_TLS_REJECT_UNAUTHORIZED\\s*=\\s*[\'"]?0[\'"]?'
);
const SQLI_INTERP_RX = new RegExp(
  '(?:\\bSELECT\\b[^\\n;]*\\bFROM\\b|\\bINSERT\\s+INTO\\b|\\bUPDATE\\s+[a-zA-Z_][a-zA-Z0-9_]*\\s+SET\\b|\\bDELETE\\s+FROM\\b)[^\\n;]*\\$\\{[^}]+\\}',
  'i'
);
const CORS_WILDCARD_RX = new RegExp(
  'Access-Control-Allow-Origin[\'":\\s=]+[\'"]\\*[\'"]|origin\\s*:\\s*[\'"]\\*[\'"]'
);

const CODE_SECURITY_PATTERNS: CodeSecurityPattern[] = [
  {
    id: 'sec-aws-access-key',
    severity: 'critical',
    category: 'secrets',
    title: 'Hardcoded AWS Access Key ID',
    regex: AWS_KEY_RX,
    recommendation: 'Revoke AWS key immediately and load credentials via IAM Role or secret store.',
    blocksRelease: true
  },
  {
    id: 'sec-github-pat',
    severity: 'critical',
    category: 'secrets',
    title: 'Hardcoded GitHub token',
    regex: GITHUB_PAT_RX,
    recommendation: 'Revoke token immediately and use short-lived OIDC or environment secrets.',
    blocksRelease: true
  },
  {
    id: 'sec-gitlab-token',
    severity: 'critical',
    category: 'secrets',
    title: 'Hardcoded GitLab token',
    regex: GITLAB_TOKEN_RX,
    recommendation: 'Revoke GitLab token immediately and load credentials from CI secret variables.',
    blocksRelease: true
  },
  {
    id: 'sec-provider-api-key',
    severity: 'critical',
    category: 'secrets',
    title: 'Hardcoded third-party API key/token',
    regex: PROVIDER_API_KEY_RX,
    recommendation: 'Revoke exposed API key immediately and inject it via managed runtime secrets.',
    blocksRelease: true
  },
  {
    id: 'sec-private-key',
    severity: 'critical',
    category: 'secrets',
    title: 'Embedded private key material',
    regex: PEM_HEADER_RX,
    recommendation: 'Purge private key from repository history and load keys from KMS/secret manager.',
    blocksRelease: true
  },
  {
    id: 'sec-hardcoded-password',
    severity: 'high',
    category: 'secrets',
    title: 'Hardcoded password or API secret literal',
    regex: HARDCODED_SECRET_RX,
    recommendation: 'Move secret literals out of source code into managed runtime secrets.',
    blocksRelease: true
  },
  {
    id: 'sec-eval-sink',
    severity: 'high',
    category: 'code',
    title: 'Dynamic code execution via eval() or new Function()',
    regex: EVAL_CALL_RX,
    recommendation: 'Eliminate eval()/new Function() sinks to prevent code injection (CWE-95).',
    blocksRelease: true
  },
  {
    id: 'sec-tls-disabled',
    severity: 'high',
    category: 'architecture',
    title: 'TLS certificate verification disabled',
    regex: TLS_DISABLED_RX,
    recommendation: 'Enable strict TLS verification and configure CA trust bundles (CWE-295).',
    blocksRelease: true
  },
  {
    id: 'sec-sql-concat',
    severity: 'high',
    category: 'code',
    title: 'SQL query string interpolation',
    regex: SQLI_INTERP_RX,
    recommendation: 'Use parameterized queries / prepared statements (CWE-89).',
    blocksRelease: true
  },
  {
    id: 'sec-cors-wildcard',
    severity: 'medium',
    category: 'architecture',
    title: 'Wildcard CORS policy',
    regex: CORS_WILDCARD_RX,
    recommendation: 'Restrict CORS origins to an explicit allowlist.'
  }
];

function stripLineComments(code: string): string {
  return code
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('#') && !t.startsWith('*');
    })
    .join('\n');
}

function stripStringsForCallScan(code: string): string {
  return code
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

/**
 * Evaluates the FINAL stage of a single- or multi-stage Dockerfile and checks
 * that its final effective USER instruction is non-root (neither `root` nor UID `0`).
 */
function hasNonRootFinalStageUser(content: string): boolean {
  const lines = content.split(/\r?\n/);
  let lastFromIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*FROM\s+\S+/i.test(lines[i]!)) {
      lastFromIdx = i;
    }
  }
  const finalStageLines = lastFromIdx >= 0 ? lines.slice(lastFromIdx + 1) : lines;
  let lastUser: string | null = null;
  for (const line of finalStageLines) {
    const m = /^\s*USER\s+(\S+)/i.exec(line);
    if (m?.[1]) {
      lastUser = m[1].trim();
    }
  }
  if (!lastUser) return false;
  const userPart = lastUser.split(':')[0]!.toLowerCase();
  return userPart !== 'root' && userPart !== '0';
}

function findUnpinnedGithubActions(workflowContent: string): string[] {
  const unpinned: string[] = [];
  const lines = workflowContent.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = /\buses\s*:\s*['"]?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)@([^\s'"]+)['"]?/.exec(
      trimmed
    );
    if (!m) continue;
    const action = m[1]!;
    const ref = m[2]!;
    if (!/^[0-9a-f]{40}$/i.test(ref)) {
      unpinned.push(`${action}@${ref}`);
    }
  }
  return Array.from(new Set(unpinned));
}

/**
 * Security Officer — Architecture, Infrastructure, Code Quality & Supply Chain Auditor.
 * Zero filename self-exemptions; computes `security_posture_score` strictly from explicit checks.
 */
export class SecurityOfficer extends BaseBridgeOfficer {
  public readonly role = 'security' as const;
  public readonly title = 'Security Officer (AppSec, InfraSec, Supply Chain & Code Quality)';
  public readonly mainKpiName = 'security_posture_score';
  public readonly mandate =
    'Verify absence of vulnerabilities across Architecture, Infrastructure, Code, and Dependencies using static security rules, container/IaC hardening, lockfile integrity, and CI security gates.';

  public getBaselinePractices(): KnowledgePractice[] {
    return [
      {
        id: 'sec-zero-hardcoded-secrets',
        title: 'Zero Embedded Secrets or Committed Secret Files',
        category: 'secrets',
        description: 'Ensure zero hardcoded API keys, private keys, passwords, or committed .env/key files.',
        ruleType: 'control',
        targetKpi: this.mainKpiName,
        weight: 25,
        evidenceSummary: 'Prevents credential leakage in source control (OWASP ASVS V2).',
        evidenceSources: ['OWASP ASVS 4.0'],
        version: 1,
        active: true
      },
      {
        id: 'sec-code-injection-and-quality',
        title: 'Injection Defense & Static Type/Lint Quality Gate',
        category: 'code',
        description: 'Eliminate eval/SQLi sinks and enforce strict static compiler or linter checks.',
        ruleType: 'tool',
        targetKpi: this.mainKpiName,
        weight: 25,
        evidenceSummary: 'Blocks CWE-89/CWE-95 injection flaws and unchecked type defects pre-merge.',
        evidenceSources: ['OWASP Top 10 A03', 'NIST SSDF PW.7'],
        version: 1,
        active: true
      },
      {
        id: 'sec-infra-and-workflow-hardening',
        title: 'Least-Privilege Containers, IaC & CI Permissions',
        category: 'infrastructure',
        description: 'Run containers as non-root with pinned tags, avoid 0.0.0.0/0 ingress or privileged pods, pin third-party CI Actions by commit SHA, and scope CI token permissions.',
        ruleType: 'control',
        targetKpi: this.mainKpiName,
        weight: 25,
        evidenceSummary: 'Reduces blast radius of runtime or CI workflow compromise.',
        evidenceSources: ['CIS Docker Benchmark', 'SLSA Build Requirements'],
        version: 1,
        active: true
      },
      {
        id: 'sec-supply-chain-integrity',
        title: 'Deterministic Lockfiles, Pinned Versions & Automated SCA',
        category: 'dependencies',
        description: 'Commit dependency lockfiles, avoid wildcard dependency ranges, and run automated vulnerability audits in CI.',
        ruleType: 'methodology',
        targetKpi: this.mainKpiName,
        weight: 25,
        evidenceSummary: 'Prevents unvetted dependency drift and known CVE deployment.',
        evidenceSources: ['OWASP Top 10 A06', 'SLSA v1.0'],
        version: 1,
        active: true
      }
    ];
  }

  public assess(
    workspaceRoot: string,
    projection: WorkspaceProjection,
    topic?: string,
    targetPaths?: string[]
  ): OfficerAssessment {
    const files = this.listWorkspaceFiles(workspaceRoot);
    const checks: CheckEvaluation[] = [];
    const findings: OfficerFinding[] = [];
    const challenges: PeerChallenge[] = [];

    // ------------------------------------------------------------------
    // 1. Secret Scanning (Production Source + Committed Key/.env Files)
    // ------------------------------------------------------------------
    const committedSecretFiles = files.filter((f) => isSensitiveSecretFile(f));
    for (const sf of committedSecretFiles) {
      findings.push({
        id: `sec-committed-secret-file-${sf.replace(/[^a-z0-9]/gi, '_')}`,
        severity: 'critical',
        category: 'secrets',
        title: `Sensitive secret/key file present in workspace (${sf})`,
        description: `File ${sf} appears to contain environment secrets or private key material.`,
        evidence: `Found ${sf} in non-ignored workspace tree.`,
        affectedPaths: [sf],
        recommendation: `Add ${sf} to .gitignore, remove from version control, and rotate any exposed credentials.`,
        blocksRelease: true
      });
    }

    // Scan all non-test source files (ZERO self-exemption for any production file!)
    const allProdCodeFiles = files.filter(
      (f) =>
        /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|sh)$/i.test(f) &&
        !/(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\./i.test(f)
    );
    const prioritizedProdFiles = this.prioritizeTargetPaths(allProdCodeFiles, targetPaths);
    const scannedProdFiles = prioritizedProdFiles.slice(0, MAX_SCAN_FILES);

    let secretPatternHits = 0;
    let codeVulnHits = 0;
    let archVulnHits = 0;

    for (const f of scannedProdFiles) {
      const rawContent = readTextFileSafe(path.join(workspaceRoot, f), 200_000, workspaceRoot);
      if (!rawContent) continue;
      const codeOnly = stripLineComments(rawContent);
      const callOnly = stripStringsForCallScan(codeOnly);

      for (const pat of CODE_SECURITY_PATTERNS) {
        // Scan raw content (including comments!) for secrets so commented-out keys never slip through
        const targetText =
          pat.category === 'secrets'
            ? rawContent
            : pat.id === 'sec-eval-sink'
              ? callOnly
              : codeOnly;
        if (pat.regex.test(targetText)) {
          if (pat.category === 'secrets') secretPatternHits++;
          else if (pat.category === 'code') codeVulnHits++;
          else archVulnHits++;

          findings.push({
            id: `${pat.id}-${f.replace(/[^a-z0-9]/gi, '_')}`,
            severity: pat.severity,
            category: pat.category,
            title: `${pat.title} (${f})`,
            description: `Static security rule "${pat.id}" matched in ${f}.`,
            evidence: `Rule ${pat.id} triggered in ${f}.`,
            affectedPaths: [f],
            recommendation: pat.recommendation,
            blocksRelease: pat.blocksRelease
          });
        }
      }
    }

    const scanCoverageNote =
      scannedProdFiles.length < allProdCodeFiles.length
        ? `${scannedProdFiles.length}/${allProdCodeFiles.length} source file(s) (truncated at ${MAX_SCAN_FILES})`
        : `${scannedProdFiles.length} source file(s)`;

    const noSecretsLeak = committedSecretFiles.length === 0 && secretPatternHits === 0;
    checks.push({
      id: 'sec-no-hardcoded-secrets',
      category: 'secrets',
      title: 'Zero hardcoded secrets or committed credential files',
      weight: 25,
      applicable: true,
      passed: noSecretsLeak,
      evidence: noSecretsLeak
        ? `Scanned ${scanCoverageNote} including comments; 0 secret patterns or committed .env/key files.`
        : `${secretPatternHits} inline secret match(es), ${committedSecretFiles.length} secret file(s).`
    });

    // ------------------------------------------------------------------
    // 2. Code Injection Defense & Static Quality Gate
    // ------------------------------------------------------------------
    checks.push({
      id: 'sec-no-injection-or-eval',
      category: 'code',
      title: 'Zero dynamic code execution (eval) or SQL string interpolation sinks',
      weight: 15,
      applicable: allProdCodeFiles.length > 0,
      passed: codeVulnHits === 0,
      evidence:
        codeVulnHits === 0
          ? `0 eval/SQLi sinks across ${scanCoverageNote}.`
          : `${codeVulnHits} unsafe code sink(s) detected.`
    });

    const hasStrictTs = (() => {
      const tsconfig = readTextFileSafe(path.join(workspaceRoot, 'tsconfig.json'), 512_000, workspaceRoot);
      return tsconfig ? /"strict"\s*:\s*true/.test(tsconfig) : false;
    })();
    const hasLinterOrTypedCompiler =
      hasStrictTs ||
      files.includes('Cargo.toml') ||
      files.includes('go.mod') ||
      files.some((f) =>
        /(eslint|biome|ruff|flake8|pylint|golangci|mypy)/i.test(path.basename(f))
      );

    checks.push({
      id: 'sec-static-quality-gate',
      category: 'code',
      title: 'Strict static compiler or linter configured',
      weight: 10,
      applicable: allProdCodeFiles.length > 0,
      passed: hasLinterOrTypedCompiler,
      evidence: hasLinterOrTypedCompiler
        ? `Static gate active (strictTs=${hasStrictTs}).`
        : 'No strict compiler or static linter config found.'
    });

    if (!hasLinterOrTypedCompiler && allProdCodeFiles.length > 0) {
      findings.push({
        id: 'sec-no-static-quality-gate',
        severity: 'medium',
        category: 'code',
        title: 'Missing strict static compiler or linter configuration',
        description: 'Codebase lacks strict typechecking or static lint enforcement.',
        evidence: 'No tsconfig strict mode or ESLint/Biome/Ruff/mypy configuration detected.',
        affectedPaths: [],
        recommendation: 'Enable strict compiler mode and configure static analysis.'
      });
    }

    // ------------------------------------------------------------------
    // 3. Architecture Security (Transport TLS, CORS, Threat Model/Policy)
    // ------------------------------------------------------------------
    const hasSecurityPolicy = files.some((f) => /(^|\/)(SECURITY\.md|threat[-_]?model)/i.test(f));
    const archClean = archVulnHits === 0 && hasSecurityPolicy;

    checks.push({
      id: 'sec-architecture-and-transport',
      category: 'architecture',
      title: 'Strict TLS/CORS posture and documented security policy',
      weight: 15,
      applicable: true,
      passed: archClean,
      evidence: archClean
        ? 'TLS/CORS clean and SECURITY.md present.'
        : `archVulnHits=${archVulnHits}, hasSecurityPolicy=${hasSecurityPolicy}`
    });

    if (!hasSecurityPolicy) {
      findings.push({
        id: 'sec-no-security-policy',
        severity: 'low',
        category: 'architecture',
        title: 'Missing SECURITY.md / threat model documentation',
        description: 'Trust boundaries and vulnerability handling policy are not documented.',
        evidence: 'SECURITY.md not found in workspace.',
        affectedPaths: [],
        recommendation: 'Add SECURITY.md documenting trust boundaries, secret handling, and disclosure policy.'
      });
    }

    // ------------------------------------------------------------------
    // 4. Infrastructure & Workflow Hardening
    // ------------------------------------------------------------------
    const dockerfiles = files.filter((f) => /(^|\/)(Dockerfile|Containerfile)$/i.test(f));
    const iacFiles = files.filter((f) => /\.(tf|ya?ml)$/i.test(f));
    const workflowFiles = files.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/i.test(f));
    let infraIssues = 0;

    for (const df of dockerfiles) {
      const content = readTextFileSafe(path.join(workspaceRoot, df), 512_000, workspaceRoot) ?? '';
      if (!hasNonRootFinalStageUser(content)) {
        infraIssues++;
        findings.push({
          id: `sec-docker-root-${df.replace(/[^a-z0-9]/gi, '_')}`,
          severity: 'high',
          category: 'infrastructure',
          title: `Container runs as root in ${df}`,
          description: 'Final Dockerfile stage lacks a non-root USER instruction (or resets to root/0).',
          evidence: `Final stage of ${df} has no effective non-root USER instruction.`,
          affectedPaths: [df],
          recommendation: 'Switch to an unprivileged non-zero USER in the final stage prior to ENTRYPOINT/CMD.',
          blocksRelease: true
        });
      }
      if (/^\s*FROM\s+\S+:latest\b/im.test(content)) {
        infraIssues++;
        findings.push({
          id: `sec-docker-latest-${df.replace(/[^a-z0-9]/gi, '_')}`,
          severity: 'medium',
          category: 'infrastructure',
          title: `Mutable ":latest" base image in ${df}`,
          description: 'Using :latest breaks build determinism and supply-chain pinning.',
          evidence: `FROM ...:latest detected in ${df}.`,
          affectedPaths: [df],
          recommendation: 'Pin container base image to explicit version and digest.'
        });
      }
    }

    for (const f of iacFiles) {
      const content = readTextFileSafe(path.join(workspaceRoot, f), 150_000, workspaceRoot) ?? '';
      if (/0\.0\.0\.0\/0/.test(content) && /(ingress|cidr|security_group|port)/i.test(content)) {
        infraIssues++;
        findings.push({
          id: `sec-iac-open-ingress-${f.replace(/[^a-z0-9]/gi, '_')}`,
          severity: 'high',
          category: 'infrastructure',
          title: `Unrestricted 0.0.0.0/0 network ingress in ${f}`,
          description: 'Network rule exposes ingress to 0.0.0.0/0.',
          evidence: `0.0.0.0/0 found alongside ingress/port rule in ${f}.`,
          affectedPaths: [f],
          recommendation: 'Scope CIDR blocks to private subnets or load balancers.',
          blocksRelease: true
        });
      }
      if (/privileged\s*:\s*true/i.test(content)) {
        infraIssues++;
        findings.push({
          id: `sec-k8s-privileged-${f.replace(/[^a-z0-9]/gi, '_')}`,
          severity: 'critical',
          category: 'infrastructure',
          title: `Privileged container enabled in ${f}`,
          description: 'privileged: true grants host-equivalent capabilities.',
          evidence: `privileged: true found in ${f}.`,
          affectedPaths: [f],
          recommendation: 'Disable privileged mode and drop Linux capabilities.',
          blocksRelease: true
        });
      }
    }

    for (const wf of workflowFiles) {
      const content = readTextFileSafe(path.join(workspaceRoot, wf), 512_000, workspaceRoot) ?? '';
      if (!/^\s*permissions\s*:/m.test(content)) {
        infraIssues++;
        findings.push({
          id: `sec-gha-missing-permissions-${wf.replace(/[^a-z0-9]/gi, '_')}`,
          severity: 'medium',
          category: 'infrastructure',
          title: `Missing explicit GITHUB_TOKEN permissions block in ${wf}`,
          description: 'Workflow omits explicit least-privilege permissions declaration.',
          evidence: `No permissions: block in ${wf}.`,
          affectedPaths: [wf],
          recommendation: 'Add top-level `permissions: contents: read` (or minimal required scopes).'
        });
      } else if (/^\s*permissions\s*:\s*write-all\b/im.test(content)) {
        infraIssues++;
        findings.push({
          id: `sec-gha-write-all-${wf.replace(/[^a-z0-9]/gi, '_')}`,
          severity: 'high',
          category: 'infrastructure',
          title: `Overly permissive GITHUB_TOKEN (write-all) in ${wf}`,
          description: 'Workflow grants write-all permissions to GITHUB_TOKEN.',
          evidence: `permissions: write-all detected in ${wf}.`,
          affectedPaths: [wf],
          recommendation: 'Replace write-all with minimal explicit per-scope permissions.',
          blocksRelease: true
        });
      }

      const unpinnedActions = findUnpinnedGithubActions(content);
      if (unpinnedActions.length > 0) {
        infraIssues++;
        findings.push({
          id: `sec-gha-unpinned-actions-${wf.replace(/[^a-z0-9]/gi, '_')}`,
          severity: 'medium',
          category: 'infrastructure',
          title: `GitHub Actions not pinned to full commit SHA in ${wf}`,
          description: 'Mutable action tags can be silently retargeted in a supply-chain compromise.',
          evidence: `Unpinned action ref(s): ${unpinnedActions.slice(0, 6).join(', ')}`,
          affectedPaths: [wf],
          recommendation: 'Pin third-party GitHub Actions to immutable 40-char commit SHAs.'
        });
      }
    }

    const hasInfraOrWorkflows = dockerfiles.length > 0 || iacFiles.length > 0 || workflowFiles.length > 0;
    checks.push({
      id: 'sec-infra-hardening',
      category: 'infrastructure',
      title: 'Containers, IaC, and CI workflows enforce least privilege & SHA pinning',
      weight: 20,
      applicable: hasInfraOrWorkflows,
      passed: infraIssues === 0,
      evidence:
        infraIssues === 0
          ? 'All container, IaC, and workflow privilege/pinning checks passed.'
          : `${infraIssues} infrastructure/workflow hardening issue(s) found.`
    });

    // ------------------------------------------------------------------
    // 5. Dependencies & Supply Chain
    // ------------------------------------------------------------------
    const hasPkgManifest =
      files.includes('package.json') ||
      files.includes('pyproject.toml') ||
      files.includes('requirements.txt') ||
      files.includes('Cargo.toml') ||
      files.includes('go.mod');
    const hasLockfile = files.some((f) =>
      [
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
        'poetry.lock',
        'uv.lock',
        'Cargo.lock',
        'go.sum'
      ].includes(path.basename(f))
    );

    let wildcardDeps: string[] = [];
    if (files.includes('package.json')) {
      const pkgText = readTextFileSafe(path.join(workspaceRoot, 'package.json'), 512_000, workspaceRoot);
      if (pkgText) {
        try {
          const pkg = JSON.parse(pkgText) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
          };
          const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
          wildcardDeps = Object.entries(allDeps)
            .filter(([, ver]) => ver === '*' || ver === 'latest')
            .map(([name]) => name);
        } catch {
          // ignore
        }
      }
    }

    if (hasPkgManifest && !hasLockfile) {
      findings.push({
        id: 'sec-missing-lockfile',
        severity: 'high',
        category: 'dependencies',
        title: 'Missing dependency lockfile',
        description: 'Transitive dependencies are not locked to deterministic versions.',
        evidence: 'Package manifest present without lockfile.',
        affectedPaths: files.includes('package.json') ? ['package.json'] : [],
        recommendation: 'Commit package-lock.json, pnpm-lock.yaml, poetry.lock, Cargo.lock, or go.sum.'
      });
    }

    if (wildcardDeps.length > 0) {
      findings.push({
        id: 'sec-wildcard-dependencies',
        severity: 'high',
        category: 'dependencies',
        title: `Unpinned wildcard/latest dependency version(s): ${wildcardDeps.join(', ')}`,
        description: 'Using "*" or "latest" allows unreviewed breaking/malicious releases.',
        evidence: `Wildcard versions in package.json: ${wildcardDeps.join(', ')}`,
        affectedPaths: ['package.json'],
        recommendation: 'Pin explicit semver ranges backed by a lockfile.',
        blocksRelease: true
      });
    }

    const hasAutomatedSecScan = files.some((f) => {
      if (
        /^(\.github\/dependabot\.ya?ml|renovate\.json5?|\.renovaterc(\.json)?|\.gitleaks\.toml|\.semgrep\.ya?ml|\.trivy\.ya?ml)$/i.test(
          f
        )
      ) {
        return true;
      }
      if (/^\.github\/workflows\/.+\.ya?ml$/i.test(f)) {
        const wf = stripShellEchoAndComments(
          readTextFileSafe(path.join(workspaceRoot, f), 512_000, workspaceRoot) ?? ''
        );
        return /\b(npm audit|pnpm audit|yarn npm audit|trivy|semgrep|codeql|gitleaks|osv-scanner|cargo audit|govulncheck)\b/i.test(
          wf
        );
      }
      return false;
    });

    if (!hasAutomatedSecScan) {
      findings.push({
        id: 'sec-no-automated-sca-sast',
        severity: 'medium',
        category: 'dependencies',
        title: 'Missing automated SCA / SAST security check in CI',
        description: 'Dependencies and code are not automatically audited for vulnerabilities in CI.',
        evidence: 'No non-echo audit/scanner command found in CI workflows or Dependabot/Renovate configs.',
        affectedPaths: workflowFiles,
        recommendation: 'Add automated SCA (`npm audit`/Trivy/OSV-Scanner) and SAST/secret scanning in CI.'
      });
    }

    const supplyChainClean =
      (!hasPkgManifest || hasLockfile) && wildcardDeps.length === 0 && hasAutomatedSecScan;
    checks.push({
      id: 'sec-supply-chain-integrity',
      category: 'dependencies',
      title: 'Lockfile committed, dependencies pinned, and automated security audit configured',
      weight: 15,
      applicable: true,
      passed: supplyChainClean,
      evidence: supplyChainClean
        ? 'Lockfile present, versions pinned, automated audit active.'
        : `hasLockfile=${hasLockfile}, wildcardDeps=${wildcardDeps.length}, hasAutomatedSecScan=${hasAutomatedSecScan}`
    });

    // Dynamic evolved practices
    const dynamic = this.evaluateDynamicPractices(workspaceRoot, files, projection);
    checks.push(...dynamic.checks);
    findings.push(...dynamic.findings);

    const { kpiScore, kpiBreakdown } = computeScoresFromChecks(checks);

    const blockingFindings = findings.filter((f) => f.blocksRelease);
    if (blockingFindings.length > 0) {
      challenges.push({
        targetOfficer: 'bridge',
        challenge: `Block release until ${blockingFindings.length} critical/high security finding(s) are remediated.`,
        rationale: blockingFindings.map((b) => b.title).slice(0, 3).join('; '),
        relatedFindingIds: blockingFindings.map((b) => b.id)
      });
    } else if (!hasAutomatedSecScan) {
      challenges.push({
        targetOfficer: 'bridge',
        challenge: 'Add automated SCA/SAST verification step to CI pipeline.',
        rationale: 'Continuous Delivery pipelines require automated vulnerability gates.',
        relatedFindingIds: ['sec-no-automated-sca-sast']
      });
    }

    const effectivePractices = this.getEffectivePractices(projection);
    const officerProj = projection.officers[this.role];
    const passedCount = checks.filter((c) => c.applicable && c.passed).length;
    const applicableCount = checks.filter((c) => c.applicable).length;

    const stance =
      blockingFindings.length > 0
        ? `Release blocked: ${this.mainKpiName}=${kpiScore}/100 (${blockingFindings.length} blocking finding(s), ${passedCount}/${applicableCount} checks passed)${topic ? ` [${topic}]` : ''}.`
        : `${this.mainKpiName}=${kpiScore}/100 (${passedCount}/${applicableCount} checks passed, ${findings.length} finding(s), 0 blockers)${topic ? ` [${topic}]` : ''}.`;

    return {
      officer: this.role,
      officerTitle: this.title,
      mainKpiName: this.mainKpiName,
      kpiScore,
      kpiBreakdown,
      checks,
      findings,
      artifacts: {
        securityPostureLedger: {
          layers: kpiBreakdown,
          scannedProdFiles: scannedProdFiles.length,
          totalProdFiles: allProdCodeFiles.length,
          blockingCount: blockingFindings.length,
          committedSecretFiles,
          hasSecurityPolicy,
          hasLockfile,
          hasStrictTs,
          hasLinterOrTypedCompiler,
          hasAutomatedSecScan
        }
      },
      stance,
      challengesToPeers: challenges,
      activePracticeCount: effectivePractices.length,
      knowledgeVersion: officerProj?.knowledgeVersion ?? 1,
      evaluatedAt: new Date().toISOString()
    };
  }
}
