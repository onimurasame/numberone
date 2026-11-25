import path from 'node:path';
import { KnowledgePractice, WorkspaceProjection } from '../core/types.js';
import { readTextFileSafe } from '../utils/fs-helpers.js';
import {
  BaseBridgeOfficer,
  computeScoresFromChecks,
  SHARED_CONTAINER_FILE_RX,
  SHARED_IAC_FILE_RX,
  stripShellEchoAndComments
} from './base-officer.js';
import { CheckEvaluation, OfficerAssessment, OfficerFinding, PeerChallenge } from './types.js';

/**
 * Real deployment/release action patterns (evaluated ONLY after stripping comments and echo/printf!).
 */
const REAL_DEPLOY_OR_RELEASE_RX =
  /\b(?:npm\s+publish|pnpm\s+publish|yarn\s+npm\s+publish|gh\s+release\s+create|semantic-release|changesets\/action|googleapis\/release-please-action|softprops\/action-gh-release|docker\/build-push-action|docker\s+push|helm\s+upgrade|kubectl\s+apply|kubectl\s+rollout|terraform\s+apply|tofu\s+apply|pulumi\s+up|aws\s+ecs\s+update-service|gcloud\s+run\s+deploy|flyctl\s+deploy)\b/i;

const REAL_ROLLBACK_OR_PROGRESSIVE_RX =
  /\b(?:helm\s+upgrade\s+[^\n]*--atomic|kubectl\s+rollout\s+undo|argoproj\.io\/v1alpha1|flagger\.app\/v1beta1|aws\s+deploy|npm\s+dist-tag\s+add|npm\s+deprecate|gh\s+release\s+(?:delete|edit)|rollback\.sh|canary|blue[-_]?green)\b/i;

/**
 * Bridge Officer — Release & Continuous Delivery Auditor.
 * Zero unconditional hardcoded challenges, zero `|| 1` phantom constraints,
 * per-workflow CI trigger evaluation, shared IaC/container detection with EngineeringOfficer,
 * and strips shell `echo`/`printf` statements so fake CI echo steps cannot game CD scores.
 */
export class BridgeOfficer extends BaseBridgeOfficer {
  public readonly role = 'bridge' as const;
  public readonly title = 'Bridge Officer (Release & Continuous Delivery)';
  public readonly mainKpiName = 'continuous_delivery_score';
  public readonly mandate =
    'Evaluate and challenge release pipelines, automated test suites, deployment automation, rollback safety, and stream execution stability toward Continuous Delivery.';

  public getBaselinePractices(): KnowledgePractice[] {
    return [
      {
        id: 'cd-automated-ci',
        title: 'Automated Build & Test CI Pipeline',
        category: 'processes',
        description: 'Execute automated build and test verification on every push and pull request.',
        ruleType: 'process',
        targetKpi: this.mainKpiName,
        weight: 25,
        evidenceSummary: 'Automated commit verification is the foundational prerequisite for Continuous Delivery.',
        evidenceSources: ['Continuous Delivery (Humble & Farley)'],
        version: 1,
        active: true
      },
      {
        id: 'cd-automated-test-suite',
        title: 'Comprehensive Automated Test Suite',
        category: 'tests',
        description: 'Maintain unit, integration, and end-to-end automated tests executable via a single command.',
        ruleType: 'methodology',
        targetKpi: this.mainKpiName,
        weight: 25,
        evidenceSummary: 'Fast deterministic tests replace manual QA bottlenecks.',
        evidenceSources: ['DORA Capabilities: Continuous Testing'],
        version: 1,
        active: true
      },
      {
        id: 'cd-automated-release-promotion',
        title: 'Automated Artifact Publishing or Deployment',
        category: 'processes',
        description: 'Automate package publishing, release creation, or environment deployment from verified main builds.',
        ruleType: 'tool',
        targetKpi: this.mainKpiName,
        weight: 20,
        evidenceSummary: 'Eliminates manual release toil and human error.',
        evidenceSources: ['DORA Capabilities: Deployment Automation'],
        version: 1,
        active: true
      },
      {
        id: 'cd-rollback-and-progressive-safety',
        title: 'Automated Rollback or Progressive Delivery Controls',
        category: 'infra',
        description: 'Provide atomic rollback, canary/blue-green manifests, or feature-flag decoupling.',
        ruleType: 'control',
        targetKpi: this.mainKpiName,
        weight: 15,
        evidenceSummary: 'Minimizes mean time to recovery (MTTR) when defects reach production.',
        evidenceSources: ['DORA Metrics: Failed Deployment Recovery Time'],
        version: 1,
        active: true
      }
    ];
  }

  public assess(
    workspaceRoot: string,
    projection: WorkspaceProjection,
    topic?: string,
    _targetPaths?: string[]
  ): OfficerAssessment {
    const files = this.listWorkspaceFiles(workspaceRoot);
    const checks: CheckEvaluation[] = [];
    const findings: OfficerFinding[] = [];
    const challenges: PeerChallenge[] = [];
    const cdChallengeBacklog: string[] = [];

    // 1. CI Pipeline — evaluate triggers PER WORKFLOW so having a manual/tag release workflow
    // alongside an automatic push/PR CI workflow never falsely invalidates automatic CI!
    const ciFiles = files.filter((f) =>
      /^(\.github\/workflows\/.+\.ya?ml|\.gitlab-ci\.yml|Jenkinsfile|\.circleci\/config\.yml|azure-pipelines\.yml)$/i.test(
        f
      )
    );
    const autoCiFiles: string[] = [];
    let hasBuildInAutoCi = false;
    let hasTestInAutoCi = false;
    let hasBuildInAnyCi = false;
    let hasTestInAnyCi = false;
    let hasRealDeployOrReleaseInCi = false;

    for (const cf of ciFiles) {
      const rawContent = readTextFileSafe(path.join(workspaceRoot, cf), 512_000, workspaceRoot) ?? '';
      const stripped = stripShellEchoAndComments(rawContent);

      const wfHasBuild = /\b(npm run build|pnpm build|yarn build|tsc\b|cargo build|go build|docker build)\b/i.test(
        stripped
      );
      const wfHasTest =
        /\b(npm test|npm run test|vitest|jest|pytest|go test|cargo test|playwright|cypress)\b/i.test(
          stripped
        );
      if (wfHasBuild) hasBuildInAnyCi = true;
      if (wfHasTest) hasTestInAnyCi = true;

      if (REAL_DEPLOY_OR_RELEASE_RX.test(stripped)) {
        hasRealDeployOrReleaseInCi = true;
      }

      const isGithubWorkflow = /^\.github\/workflows\//i.test(cf);
      const triggersOnPushOrPr =
        !isGithubWorkflow ||
        /\b(push|pull_request)\s*:/i.test(rawContent) ||
        /^\s*on\s*:\s*(?:push|pull_request)\b/im.test(rawContent) ||
        /^\s*on\s*:\s*\[[^\]]*\b(?:push|pull_request)\b/im.test(rawContent);
      const isTagOnlyPush =
        isGithubWorkflow &&
        !/\bpull_request\b/i.test(rawContent) &&
        /\bpush\s*:\s*[\r\n]+\s+tags\s*:/i.test(rawContent) &&
        !/\bbranches\s*:/i.test(rawContent);

      if (triggersOnPushOrPr && !isTagOnlyPush) {
        autoCiFiles.push(cf);
        if (wfHasBuild) hasBuildInAutoCi = true;
        if (wfHasTest) hasTestInAutoCi = true;
      }
    }

    const isManualOnlyTrigger = ciFiles.length > 0 && autoCiFiles.length === 0;
    const ciVerifiesEveryChange = autoCiFiles.length > 0 && hasBuildInAutoCi && hasTestInAutoCi;

    checks.push({
      id: 'cd-ci-verification',
      category: 'processes',
      title: 'Automated push/PR CI pipeline executes build and tests',
      weight: 25,
      applicable: true,
      passed: ciVerifiesEveryChange,
      evidence:
        ciFiles.length === 0
          ? 'No CI workflow configuration found.'
          : `CI files: ${ciFiles.join(', ')} (autoCi=${autoCiFiles.join(', ') || 'none'}, build=${hasBuildInAutoCi}, test=${hasTestInAutoCi}, manualOnly=${isManualOnlyTrigger})`
    });

    if (ciFiles.length === 0) {
      cdChallengeBacklog.push('No automated CI pipeline configured.');
      findings.push({
        id: 'cd-no-pipeline',
        severity: 'high',
        category: 'processes',
        title: 'No CI/CD pipeline configuration found',
        description: 'Commits and pull requests are not automatically built and tested.',
        evidence: 'Checked .github/workflows, .gitlab-ci.yml, Jenkinsfile, CircleCI, Azure Pipelines.',
        affectedPaths: [],
        recommendation: 'Configure a trunk-based CI workflow running build, test, and security audits on push and PR.'
      });
    } else if (!ciVerifiesEveryChange) {
      cdChallengeBacklog.push(
        isManualOnlyTrigger
          ? 'All CI workflows are manual/tag-only; none trigger automatically on push/PR.'
          : `Automated push/PR CI workflow missing ${!hasBuildInAutoCi ? 'build' : 'test'} execution step.`
      );
      findings.push({
        id: 'cd-incomplete-ci',
        severity: 'medium',
        category: 'processes',
        title: isManualOnlyTrigger
          ? 'CI workflows only trigger manually (no automatic push/PR verification)'
          : 'Automated push/PR CI pipeline omits build or test execution',
        description: `Detected CI workflow(s) (${ciFiles.join(', ')}) do not automatically run both build and test commands on push/PR.`,
        evidence: `autoCiFiles=${autoCiFiles.length}, hasBuildInAutoCi=${hasBuildInAutoCi}, hasTestInAutoCi=${hasTestInAutoCi}`,
        affectedPaths: ciFiles,
        recommendation: 'Ensure an automatic push/pull_request CI workflow runs full build and automated test suite on every commit.'
      });
    }

    // 2. Automated Test Suite
    const testDirRx = /(?:^|\/)(?:tests?|__tests__|spec|e2e)\//i;
    const testFileSuffixRx = /\.(?:test|spec)\.(?:ts|tsx|js|jsx|py|go|rs)$/i;
    const testFiles = files.filter((f) => testDirRx.test(f) || testFileSuffixRx.test(f));
    const hasE2eOrIntegration = testFiles.some((f) => /(e2e|integration)/i.test(f));
    const hasTestScript = (() => {
      const pkgText = readTextFileSafe(path.join(workspaceRoot, 'package.json'), 512_000, workspaceRoot);
      if (!pkgText) {
        return (
          files.includes('Makefile') ||
          files.includes('pytest.ini') ||
          files.includes('Cargo.toml') ||
          files.includes('go.mod')
        );
      }
      try {
        const pkg = JSON.parse(pkgText) as { scripts?: Record<string, string> };
        return Boolean(pkg.scripts?.test && !pkg.scripts.test.includes('no test specified'));
      } catch {
        return false;
      }
    })();

    const testsComprehensive = hasTestScript && testFiles.length >= 2 && hasE2eOrIntegration;
    checks.push({
      id: 'cd-automated-tests',
      category: 'tests',
      title: 'Executable automated unit and integration/E2E test suite present',
      weight: 25,
      applicable: true,
      passed: testsComprehensive,
      evidence: `testScript=${hasTestScript}, testFiles=${testFiles.length}, hasE2eOrIntegration=${hasE2eOrIntegration}`
    });

    if (testFiles.length === 0 || !hasTestScript) {
      cdChallengeBacklog.push('Missing executable automated test suite.');
      findings.push({
        id: 'cd-no-tests',
        severity: 'critical',
        category: 'tests',
        title: 'No executable automated test suite detected',
        description: 'Continuous Delivery is unsafe without automated verification.',
        evidence: `testScript=${hasTestScript}, testFiles=${testFiles.length}`,
        affectedPaths: [],
        recommendation: 'Add automated unit and integration/E2E tests wired to `npm test`.',
        blocksRelease: true
      });
    } else if (!hasE2eOrIntegration) {
      cdChallengeBacklog.push('Unit tests exist without integration/E2E tests.');
      findings.push({
        id: 'cd-missing-e2e-tests',
        severity: 'medium',
        category: 'tests',
        title: 'No integration or end-to-end tests detected',
        description: 'Only unit-level test files were detected; release confidence requires integration/E2E coverage.',
        evidence: `Found ${testFiles.length} test file(s), none matching integration/e2e.`,
        affectedPaths: testFiles.slice(0, 5),
        recommendation: 'Add end-to-end or integration tests exercising full CLI/runtime workflows.'
      });
    }

    // 3. Automated Release / Deployment Stage (Genuine commands/actions ONLY — echo stripped!)
    const hasReleaseConfig = files.some((f) =>
      /(\.changeset\/config\.json|release-please-config\.json|\.releaserc(\.json|\.js|\.yml)?)$/i.test(f)
    );
    const releaseAutomated = hasRealDeployOrReleaseInCi || hasReleaseConfig;

    checks.push({
      id: 'cd-release-automation',
      category: 'processes',
      title: 'Automated release publishing or deployment step configured',
      weight: 20,
      applicable: true,
      passed: releaseAutomated,
      evidence: releaseAutomated
        ? 'Real release/publish/deploy automation detected.'
        : 'CI verifies builds/tests but lacks a concrete publish, release, or deploy command.'
    });

    if (ciFiles.length > 0 && !releaseAutomated) {
      cdChallengeBacklog.push('CI stops at verification; artifact release/deployment is still manual.');
      findings.push({
        id: 'cd-ci-without-cd',
        severity: 'low',
        category: 'processes',
        title: 'CI configured without automated release or deployment step',
        description: 'Build and tests are automated, but artifact publishing/deployment remains manual.',
        evidence: `Inspected ${ciFiles.join(', ')} (ignoring echo/comments); no publish/release/deploy step found.`,
        affectedPaths: ciFiles,
        recommendation: 'Add automated package publishing, GitHub Release action, or target environment deployment.'
      });
    }

    // 4. Rollback & Progressive Delivery Controls (Genuine manifests/scripts ONLY — echo stripped!)
    const hasRealRollback = files.some((f) => {
      if (/(^|\/)(rollback\.sh|argo-rollout|flagger|feature[-_]?flags?\.(ts|js|py|go|json))$/i.test(f)) {
        return true;
      }
      if (/\.(ya?ml|sh)$/i.test(f)) {
        const stripped = stripShellEchoAndComments(
          readTextFileSafe(path.join(workspaceRoot, f), 512_000, workspaceRoot) ?? ''
        );
        return REAL_ROLLBACK_OR_PROGRESSIVE_RX.test(stripped);
      }
      return false;
    });

    checks.push({
      id: 'cd-rollback-safety',
      category: 'infra',
      title: 'Automated rollback or progressive delivery mechanism present',
      weight: 15,
      applicable: hasRealDeployOrReleaseInCi,
      passed: hasRealRollback,
      evidence: !hasRealDeployOrReleaseInCi
        ? 'Not applicable until automated deployment is configured.'
        : hasRealRollback
          ? 'Progressive delivery or automated rollback mechanism detected.'
          : 'Automated deploy exists without rollback/canary controls.'
    });

    if (hasRealDeployOrReleaseInCi && !hasRealRollback) {
      cdChallengeBacklog.push('Automated deployment lacks automated rollback or progressive rollout controls.');
      findings.push({
        id: 'cd-missing-rollback-strategy',
        severity: 'medium',
        category: 'infra',
        title: 'Automated deployment lacks rollback or progressive delivery controls',
        description: 'Deployments run automatically without atomic rollback, canary, or feature-flag controls.',
        evidence: 'No helm --atomic, kubectl rollout undo, Argo Rollouts, Flagger, npm dist-tag rollback, or rollback.sh script detected.',
        affectedPaths: ciFiles,
        recommendation: 'Configure atomic rollback on health failure, progressive canary rollout, or scripted release rollback.'
      });
    }

    // 5. Changelog / Versioning Hygiene & Stream Execution Stability (Sliding Window of last 50 executions)
    const hasChangelog = files.includes('CHANGELOG.md') || hasReleaseConfig;
    checks.push({
      id: 'cd-versioning-hygiene',
      category: 'controls',
      title: 'Release changelog or automated versioning configured',
      weight: 10,
      applicable: true,
      passed: hasChangelog,
      evidence: hasChangelog ? 'CHANGELOG.md or release config present.' : 'No CHANGELOG.md or release config found.'
    });

    const recentExecs = projection.recentExecutions;
    let windowExecs: number;
    let windowFailed: number;
    if (recentExecs && recentExecs.length > 0) {
      windowExecs = recentExecs.length;
      windowFailed = recentExecs.filter((e) => !e.ok).length;
    } else {
      windowExecs =
        (projection.eventCountsByType['exec.completed'] ?? 0) +
        (projection.eventCountsByType['exec.failed'] ?? 0) +
        (projection.eventCountsByType['exec.crashed'] ?? 0);
      windowFailed =
        (projection.eventCountsByType['exec.failed'] ?? 0) +
        (projection.eventCountsByType['exec.crashed'] ?? 0);
    }

    const changeFailureRate = windowExecs > 0 ? Math.round((windowFailed / windowExecs) * 100) : 0;
    const unresolvedCrashes = projection.crashes.filter((c) => !c.resolvedByEventId).length;

    checks.push({
      id: 'cd-stream-dora-stability',
      category: 'controls',
      title: 'Recent execution failure rate <= 20% (last 50 runs) with zero unresolved crashes',
      weight: 15,
      applicable: windowExecs > 0 || projection.crashes.length > 0,
      passed: changeFailureRate <= 20 && unresolvedCrashes === 0,
      evidence: `windowExecs=${windowExecs}, failureRate=${changeFailureRate}%, unresolvedCrashes=${unresolvedCrashes}`
    });

    // Dynamic evolved practices
    const dynamic = this.evaluateDynamicPractices(workspaceRoot, files, projection);
    checks.push(...dynamic.checks);
    findings.push(...dynamic.findings);

    const { kpiScore, kpiBreakdown } = computeScoresFromChecks(checks);

    // Emit peer challenges ONLY when concrete workspace conditions warrant them,
    // using the exact same canonical container/IaC detection regex as EngineeringOfficer!
    const hasContainerOrIaC = files.some(
      (f) => SHARED_CONTAINER_FILE_RX.test(f) || SHARED_IAC_FILE_RX.test(f)
    );
    if (!hasContainerOrIaC) {
      challenges.push({
        targetOfficer: 'engineering',
        challenge: 'Provide declarative container or IaC manifests so CI can package and deploy reproducibly.',
        rationale: 'Automated delivery pipelines require deterministic runtime packaging.',
        relatedFindingIds: ['cd-release-automation']
      });
    }
    if (ciFiles.length > 0 && !releaseAutomated) {
      challenges.push({
        targetOfficer: 'workspace',
        challenge: 'Automate package publishing or deployment from verified main-branch CI builds.',
        rationale: 'Eliminates manual release steps between green CI and artifact delivery.',
        relatedFindingIds: ['cd-ci-without-cd']
      });
    }

    const effectivePractices = this.getEffectivePractices(projection);
    const officerProj = projection.officers[this.role];
    const passedCount = checks.filter((c) => c.applicable && c.passed).length;
    const applicableCount = checks.filter((c) => c.applicable).length;

    const stance = `${this.mainKpiName}=${kpiScore}/100 (${passedCount}/${applicableCount} checks passed, ${cdChallengeBacklog.length} CD gap(s))${topic ? ` [${topic}]` : ''}.`;

    return {
      officer: this.role,
      officerTitle: this.title,
      mainKpiName: this.mainKpiName,
      kpiScore,
      kpiBreakdown,
      checks,
      findings,
      artifacts: {
        continuousDeliveryMatrix: {
          ciFiles,
          autoCiFiles,
          testFileCount: testFiles.length,
          hasTestScript,
          hasE2eOrIntegration,
          hasBuildInCi: hasBuildInAnyCi,
          hasTestInCi: hasTestInAnyCi,
          hasBuildInAutoCi,
          hasTestInAutoCi,
          hasRealDeployOrReleaseInCi,
          isManualOnlyTrigger,
          hasReleaseConfig,
          hasRealRollback,
          doraSnapshot: {
            commitsObserved: projection.eventCountsByType['git.commit'] ?? 0,
            execWindowSize: windowExecs,
            execChangeFailureRatePct: changeFailureRate,
            unresolvedCrashes
          },
          cdChallengeBacklog
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
