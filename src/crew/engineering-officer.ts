import path from 'node:path';
import { KnowledgePractice, WorkspaceProjection } from '../core/types.js';
import { readTextFileSafe } from '../utils/fs-helpers.js';
import {
  BaseBridgeOfficer,
  computeScoresFromChecks,
  SHARED_CONTAINER_FILE_RX,
  SHARED_IAC_FILE_RX
} from './base-officer.js';
import { CheckEvaluation, OfficerAssessment, OfficerFinding, PeerChallenge } from './types.js';

const MAX_ENV_SCAN_FILES = 2000;

const ENV_VAR_PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]{2,})/g,
  /process\.env\[['"]([A-Z][A-Z0-9_]{2,})['"]\]/g,
  /os\.environ(?:\.get)?\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  /os\.getenv\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  /std::env::var\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g
];

const STANDARD_SYSTEM_ENV = new Set([
  'NODE_ENV',
  'HOME',
  'PATH',
  'USER',
  'PWD',
  'CI',
  'TZ',
  'LANG',
  'TERM',
  'SHELL'
]);

/**
 * Engineering Officer — Infrastructure & Target Runtime Readiness Auditor.
 * Computes `runtime_readiness_score` strictly from explicit, inspectable checks.
 */
export class EngineeringOfficer extends BaseBridgeOfficer {
  public readonly role = 'engineering' as const;
  public readonly title = 'Engineering Officer (Infrastructure & Target Runtime)';
  public readonly mainKpiName = 'runtime_readiness_score';
  public readonly mandate =
    'Verify that runtime versions, build/start entrypoints, declarative infrastructure, environment/secret contracts, and operational documentation are complete to run the application in its target runtime.';

  public getBaselinePractices(): KnowledgePractice[] {
    return [
      {
        id: 'eng-runtime-pinning',
        title: 'Deterministic Runtime Version Pinning',
        category: 'runtime',
        description: 'Pin runtime versions via package.json#engines, .nvmrc, .python-version, .tool-versions, go.mod, or rust-toolchain.',
        ruleType: 'process',
        targetKpi: this.mainKpiName,
        weight: 15,
        evidenceSummary: 'Prevents runtime drift between local development, CI, and target deployment environments.',
        evidenceSources: ['12-Factor App II (Dependencies)'],
        version: 1,
        active: true
      },
      {
        id: 'eng-env-contract',
        title: 'Complete Environment & Secret Contract',
        category: 'configuration',
        description: 'Declare every environment variable referenced in production source code within .env.example or IaC variable specs.',
        ruleType: 'control',
        targetKpi: this.mainKpiName,
        weight: 20,
        evidenceSummary: 'Prevents startup failures from undocumented runtime configuration or missing credentials.',
        evidenceSources: ['12-Factor App III (Config)'],
        version: 1,
        active: true
      },
      {
        id: 'eng-declarative-infra',
        title: 'Declarative Container or Infrastructure Specification',
        category: 'infrastructure',
        description: 'Provide reproducible containerization (Dockerfile/Compose) or IaC (Terraform/OpenTofu/Helm/Kubernetes/Pulumi).',
        ruleType: 'methodology',
        targetKpi: this.mainKpiName,
        weight: 25,
        evidenceSummary: 'Eliminates manual target environment provisioning.',
        evidenceSources: ['CNCF Cloud Native Principles'],
        version: 1,
        active: true
      },
      {
        id: 'eng-access-and-runbooks',
        title: 'Access Specification & Operational Runbook',
        category: 'operations',
        description: 'Document required credentials/IAM permissions, build/run commands, and recovery procedures.',
        ruleType: 'process',
        targetKpi: this.mainKpiName,
        weight: 20,
        evidenceSummary: 'Ensures operators and automated agents have complete instructions and access prerequisites.',
        evidenceSources: ['Google SRE Workbook'],
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

    // 1. Application Manifest & Build/Start Entrypoint
    const manifests: string[] = [];
    let hasRuntimePin = false;
    let hasEntrypoint = false;

    if (files.includes('package.json')) {
      manifests.push('package.json');
      const pkgText = readTextFileSafe(path.join(workspaceRoot, 'package.json'), 512_000, workspaceRoot);
      if (pkgText) {
        try {
          const pkg = JSON.parse(pkgText) as {
            engines?: Record<string, string>;
            scripts?: Record<string, string>;
            bin?: unknown;
            main?: string;
          };
          if (pkg.engines && Object.keys(pkg.engines).length > 0) hasRuntimePin = true;
          if (
            pkg.bin ||
            pkg.main ||
            (pkg.scripts && Boolean(pkg.scripts.start || pkg.scripts.build || pkg.scripts.dev))
          ) {
            hasEntrypoint = true;
          }
        } catch {
          // ignore malformed JSON
        }
      }
    }

    for (const m of ['pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle']) {
      if (files.includes(m)) {
        manifests.push(m);
        hasEntrypoint = true;
        if (m === 'go.mod') {
          const goMod = readTextFileSafe(path.join(workspaceRoot, 'go.mod'), 512_000, workspaceRoot) ?? '';
          if (/^go\s+\d+\.\d+/m.test(goMod)) hasRuntimePin = true;
        }
        if (m === 'pyproject.toml') {
          const pyproj = readTextFileSafe(path.join(workspaceRoot, 'pyproject.toml'), 512_000, workspaceRoot) ?? '';
          if (/requires-python\s*=/i.test(pyproj)) hasRuntimePin = true;
        }
      }
    }

    if (files.includes('Makefile') || files.includes('Justfile')) {
      hasEntrypoint = true;
    }

    if (
      files.some((f) =>
        [
          '.nvmrc',
          '.node-version',
          '.python-version',
          '.tool-versions',
          'mise.toml',
          'rust-toolchain.toml'
        ].includes(path.basename(f))
      )
    ) {
      hasRuntimePin = true;
    }

    checks.push({
      id: 'eng-manifest-and-entrypoint',
      category: 'runtime',
      title: 'Application manifest and build/run entrypoint defined',
      weight: 15,
      applicable: true,
      passed: manifests.length > 0 && hasEntrypoint,
      evidence:
        manifests.length > 0 && hasEntrypoint
          ? `Manifests: ${manifests.join(', ')}`
          : `Manifests: ${manifests.join(', ') || 'none'}, entrypoint=${hasEntrypoint}`
    });

    if (!hasEntrypoint) {
      findings.push({
        id: 'eng-missing-entrypoint',
        severity: 'high',
        category: 'runtime',
        title: 'Missing build or start entrypoint',
        description: 'No executable build/start script or package entrypoint was found.',
        evidence: `Checked package.json, Makefile, Justfile, pyproject.toml, go.mod, Cargo.toml.`,
        affectedPaths: manifests,
        recommendation: 'Define explicit build and start scripts in your project manifest.'
      });
    }

    checks.push({
      id: 'eng-runtime-pinned',
      category: 'runtime',
      title: 'Target runtime version pinned',
      weight: 15,
      applicable: true,
      passed: hasRuntimePin,
      evidence: hasRuntimePin
        ? 'Runtime version constraint declared.'
        : 'No engines, .nvmrc, .python-version, .tool-versions, or go/python version directive found.'
    });

    if (!hasRuntimePin) {
      findings.push({
        id: 'eng-no-runtime-pin',
        severity: 'medium',
        category: 'runtime',
        title: 'Target runtime version is not pinned',
        description: 'Unpinned runtime versions risk subtle behavior drift in target environments.',
        evidence: `Manifests present: ${manifests.join(', ') || 'none'}`,
        affectedPaths: manifests,
        recommendation: 'Pin exact runtime version constraints in package.json#engines or .tool-versions.'
      });
    }

    // 2. Containerization & IaC (shared canonical regexes with BridgeOfficer)
    const containerFiles = files.filter((f) => SHARED_CONTAINER_FILE_RX.test(f));
    const validContainerFile = containerFiles.some((f) => {
      const content = readTextFileSafe(path.join(workspaceRoot, f), 512_000, workspaceRoot) ?? '';
      if (/compose/i.test(f)) return /\bservices:/i.test(content);
      return /^\s*FROM\s+\S+/im.test(content) && /^\s*(?:ENTRYPOINT|CMD)\s+/im.test(content);
    });
    const iacFiles = files.filter((f) => SHARED_IAC_FILE_RX.test(f));
    const hasDeclarativeInfra = validContainerFile || iacFiles.length > 0;

    checks.push({
      id: 'eng-declarative-infra',
      category: 'infrastructure',
      title: 'Declarative container or infrastructure specification present',
      weight: 25,
      applicable: true,
      passed: hasDeclarativeInfra,
      evidence: hasDeclarativeInfra
        ? `Container/IaC files: ${[...containerFiles, ...iacFiles].join(', ')}`
        : 'No valid Dockerfile, compose.yaml, Terraform, Helm, or Kubernetes manifest found.'
    });

    if (!hasDeclarativeInfra) {
      findings.push({
        id: 'eng-no-iac-or-container',
        severity: 'high',
        category: 'infrastructure',
        title: 'Missing declarative container or infrastructure specification',
        description: 'Target runtime cannot be reproducibly provisioned without container or IaC manifests.',
        evidence: 'No valid Dockerfile (FROM + ENTRYPOINT/CMD), compose.yaml, or IaC files detected.',
        affectedPaths: [],
        recommendation: 'Add a deterministic Dockerfile/compose.yaml or IaC definitions for target runtime provisioning.'
      });
    }

    // 3. Environment & Secret Contract Completeness
    const referencedEnvVars = new Set<string>();
    const declaredEnvVars = new Set<string>();
    const envExampleFiles = files.filter((f) => /\.env\.(example|sample|template)$/i.test(path.basename(f)));

    for (const ef of envExampleFiles) {
      const content = readTextFileSafe(path.join(workspaceRoot, ef), 512_000, workspaceRoot) ?? '';
      for (const line of content.split(/\r?\n/)) {
        const m = /^\s*([A-Z][A-Z0-9_]+)\s*=/.exec(line);
        if (m?.[1]) declaredEnvVars.add(m[1]);
      }
    }

    const prodCodeFiles = this.prioritizeTargetPaths(
      files.filter(
        (f) =>
          /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs)$/i.test(f) &&
          !/(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\./i.test(f)
      ),
      targetPaths
    );
    for (const cf of prodCodeFiles.slice(0, MAX_ENV_SCAN_FILES)) {
      const content = readTextFileSafe(path.join(workspaceRoot, cf), 200_000, workspaceRoot);
      if (!content) continue;
      for (const rx of ENV_VAR_PATTERNS) {
        rx.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = rx.exec(content)) !== null) {
          const name = m[1]!;
          if (!STANDARD_SYSTEM_ENV.has(name) && !name.startsWith('N1_SHELL_')) {
            referencedEnvVars.add(name);
          }
        }
      }
    }

    const undocumentedEnvVars = Array.from(referencedEnvVars)
      .filter((v) => !declaredEnvVars.has(v))
      .sort();

    checks.push({
      id: 'eng-env-contract',
      category: 'configuration',
      title: 'All production environment variables documented in .env.example',
      weight: 20,
      applicable: referencedEnvVars.size > 0,
      passed: undocumentedEnvVars.length === 0,
      evidence:
        referencedEnvVars.size === 0
          ? 'No custom environment variables referenced in production code.'
          : undocumentedEnvVars.length === 0
            ? `All ${referencedEnvVars.size} referenced env var(s) declared in ${envExampleFiles.join(', ')}.`
            : `Undocumented env var(s): ${undocumentedEnvVars.join(', ')}`
    });

    if (undocumentedEnvVars.length > 0) {
      findings.push({
        id: 'eng-undocumented-env-vars',
        severity: undocumentedEnvVars.length >= 3 ? 'high' : 'medium',
        category: 'configuration',
        title: `${undocumentedEnvVars.length} runtime environment variable(s) undocumented`,
        description: 'Production code reads environment variables missing from .env.example.',
        evidence: `Undocumented variables: ${undocumentedEnvVars.slice(0, 15).join(', ')}`,
        affectedPaths: envExampleFiles,
        recommendation: `Declare ${undocumentedEnvVars.slice(0, 8).join(', ')} in .env.example.`
      });
    }

    // 4. Access & Operational Documentation
    const accessOrOpsFiles = files.filter((f) =>
      /(^|\/)(README\.md|RUNBOOK\.md|OPERATIONS\.md|docs\/.*|infra\/.*|iam.*\.tf|rbac.*\.ya?ml)$/i.test(f)
    );
    const combinedOpsDocs = accessOrOpsFiles
      .slice(0, 10)
      .map((f) => readTextFileSafe(path.join(workspaceRoot, f), 100_000, workspaceRoot) ?? '')
      .join('\n');
    const hasAccessDocumentation =
      iacFiles.some((f) => /(iam|rbac|role|policy|serviceaccount)/i.test(f)) ||
      (combinedOpsDocs.length >= 200 &&
        /(credential|token|permission|iam|secret|environment|configuration)/i.test(combinedOpsDocs));
    const hasRunbookDocumentation =
      combinedOpsDocs.length >= 200 && /(build|install|usage|run|deploy|verify|recovery)/i.test(combinedOpsDocs);

    checks.push({
      id: 'eng-access-documented',
      category: 'access',
      title: 'Target runtime access/credential requirements specified',
      weight: 10,
      applicable: true,
      passed: hasAccessDocumentation,
      evidence: hasAccessDocumentation
        ? `Documented across ${accessOrOpsFiles.slice(0, 4).join(', ')}`
        : 'No IAM/RBAC manifests or credential/access documentation found.'
    });

    if (!hasAccessDocumentation) {
      findings.push({
        id: 'eng-missing-access-manifest',
        severity: 'medium',
        category: 'access',
        title: 'Missing access and credential specification',
        description: 'Required runtime credentials, tokens, or IAM roles are not documented or codified.',
        evidence: 'Scanned IaC manifests and project documentation.',
        affectedPaths: [],
        recommendation: 'Document required tokens/permissions or provide IAM/RBAC definitions.'
      });
    }

    checks.push({
      id: 'eng-operational-runbook',
      category: 'operations',
      title: 'Build, run, and operational procedures documented',
      weight: 10,
      applicable: true,
      passed: hasRunbookDocumentation,
      evidence: hasRunbookDocumentation
        ? 'Operational instructions present in repository docs.'
        : 'Missing build/run/recovery documentation.'
    });

    if (!hasRunbookDocumentation) {
      findings.push({
        id: 'eng-missing-runbook',
        severity: 'low',
        category: 'operations',
        title: 'Missing operational runbook or build/run documentation',
        description: 'Operators lack documented build, execution, and recovery steps.',
        evidence: 'README.md / docs/ missing operational commands.',
        affectedPaths: [],
        recommendation: 'Document build, startup, verification, and recovery steps in README.md or RUNBOOK.md.'
      });
    }

    // 5. Stream Runtime Stability (Unresolved Crashes)
    const unresolvedCrashes = projection.crashes.filter((c) => !c.resolvedByEventId);
    checks.push({
      id: 'eng-no-unresolved-crashes',
      category: 'operations',
      title: 'Zero unresolved execution crashes in workspace stream',
      weight: 15,
      applicable: projection.crashes.length > 0,
      passed: unresolvedCrashes.length === 0,
      evidence:
        projection.crashes.length === 0
          ? 'No crashes recorded in stream.'
          : `${unresolvedCrashes.length} unresolved of ${projection.crashes.length} recorded crash(es).`
    });

    if (unresolvedCrashes.length > 0) {
      findings.push({
        id: 'eng-unresolved-stream-crashes',
        severity: 'high',
        category: 'operations',
        title: `${unresolvedCrashes.length} unresolved crash/failure event(s) in stream`,
        description: 'Recorded command failures in the workspace stream have not yet succeeded.',
        evidence: unresolvedCrashes
          .slice(-3)
          .map((c) => `#${c.seq} ${c.command}: ${c.errorSignature}`)
          .join(' | '),
        affectedPaths: Array.from(new Set(unresolvedCrashes.flatMap((c) => c.affectedPaths))),
        recommendation: 'Resolve failing commands and verify green execution via `n1 exec`.'
      });
    }

    // Dynamic evolved practices
    const dynamic = this.evaluateDynamicPractices(workspaceRoot, files, projection);
    checks.push(...dynamic.checks);
    findings.push(...dynamic.findings);

    const { kpiScore, kpiBreakdown } = computeScoresFromChecks(checks);

    if (!hasDeclarativeInfra) {
      challenges.push({
        targetOfficer: 'bridge',
        challenge: 'Automated deployment lacks declarative container or IaC runtime specifications.',
        rationale: 'Continuous Delivery requires reproducible environment definitions.',
        relatedFindingIds: ['eng-no-iac-or-container']
      });
    }
    if (undocumentedEnvVars.length > 0) {
      challenges.push({
        targetOfficer: 'security',
        challenge: `Verify secret handling for ${undocumentedEnvVars.length} undocumented env var(s): ${undocumentedEnvVars.slice(0, 5).join(', ')}.`,
        rationale: 'Undocumented runtime variables risk ad-hoc credential exposure.',
        relatedFindingIds: ['eng-undocumented-env-vars']
      });
    }

    const effectivePractices = this.getEffectivePractices(projection);
    const officerProj = projection.officers[this.role];
    const passedCount = checks.filter((c) => c.applicable && c.passed).length;
    const applicableCount = checks.filter((c) => c.applicable).length;

    const stance = `${this.mainKpiName}=${kpiScore}/100 (${passedCount}/${applicableCount} checks passed, ${findings.length} finding(s))${topic ? ` [${topic}]` : ''}.`;

    return {
      officer: this.role,
      officerTitle: this.title,
      mainKpiName: this.mainKpiName,
      kpiScore,
      kpiBreakdown,
      checks,
      findings,
      artifacts: {
        runtimeCompletenessManifest: {
          manifests,
          hasRuntimePin,
          hasEntrypoint,
          containerFiles,
          iacFiles,
          referencedEnvVars: Array.from(referencedEnvVars).sort(),
          declaredEnvVars: Array.from(declaredEnvVars).sort(),
          undocumentedEnvVars,
          hasAccessDocumentation,
          hasRunbookDocumentation,
          unresolvedCrashCount: unresolvedCrashes.length
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
