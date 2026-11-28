#!/usr/bin/env node
/**
 * Number One (n1) — Dependabot PR Verification, Triage & Batch Merge Automation
 *
 * Implements the repository's Dependabot PR governance policy:
 *   - Eligible for automated merge readiness / batch merge:
 *       * `github-actions`: semver-patch, semver-minor, semver-major (and grouped updates)
 *       * `npm`: semver-patch, semver-minor
 *   - Held for manual review:
 *       * `npm`: semver-major (especially runtime dependencies such as `zod`)
 *       * Any PR with maintainer-change warnings, disallowed file paths, unverified/non-bot
 *         commits, unpinned actions, CodeQL sub-action skew, or SHA-to-tag mismatch.
 *
 * In GitHub Actions (`triage-pr`), this runs with least-privilege `GITHUB_TOKEN` only —
 * it tests, verifies provenance, labels, and posts an idempotent triage summary while
 * keeping final CODEOWNERS approval and merge manual.
 *
 * Locally (`sweep --apply` / `npm run pr:merge`), the CODEOWNER runs it with their
 * authenticated `gh` CLI to verify, approve, and squash-merge all green eligible PRs
 * in a single deterministic command.
 *
 * Usage:
 *   node scripts/pr-automation.mjs sweep [--repo owner/repo] [--dry-run|--apply] [--pr <N>]
 *                                        [--verify-remote-tags] [--local-test]
 *                                        [--rebase-conflicts] [--allow-npm-dev-major] [--json]
 *   node scripts/pr-automation.mjs triage-pr --repo owner/repo --pr <N>
 *                                        [--ecosystem <e>] [--update-type <t>]
 *                                        [--dependency-type <d>] [--dependency-names <n>]
 *                                        [--maintainer-changes <true|false>]
 *                                        [--verify-remote-tags] [--post-comment] [--sync-labels] [--json]
 *   node scripts/pr-automation.mjs evaluate-json <path-to-json>
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditWorkflowContent,
  EXACT_SEMVER_TAG_RX,
  resolveRemoteTagCommitSha,
  verifyRemoteCommitExists
} from './verify-workflows.mjs';

export const TRIAGE_COMMENT_MARKER = '<!-- n1-dependabot-triage -->';
export const REQUIRED_CHECK_NAMES = ['verify', 'Analyze (javascript-typescript)', 'dependency-review'];
export const DEFAULT_REPO = 'Shadow-Software-Platform/numberone';

const DEPENDABOT_LOGINS = new Set(['dependabot[bot]', 'app/dependabot', 'dependabot']);
const ALLOWED_GHA_FILE_RX = /^\.github\/(?:workflows\/[^/]+\.ya?ml|actions\/.+|dependabot\.ya?ml)$/;
const ALLOWED_NPM_FILES = new Set(['package.json', 'package-lock.json']);

function defaultGhExec(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

/**
 * Normalize semver update type strings from Dependabot metadata or PR title/versions.
 * Returns 'patch' | 'minor' | 'major' | 'unknown'.
 */
export function normalizeSemverUpdateType(rawUpdateType, title = '') {
  const lowered = String(rawUpdateType ?? '').trim().toLowerCase();
  if (lowered.includes('semver-patch') || lowered === 'patch') return 'patch';
  if (lowered.includes('semver-minor') || lowered === 'minor') return 'minor';
  if (lowered.includes('semver-major') || lowered === 'major') return 'major';

  // Fallback: parse `from X.Y.Z to A.B.C` from Dependabot PR title
  const bumpMatch = /\bfrom\s+v?(\d+)(?:\.(\d+))?(?:\.(\d+))?\s+to\s+v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i.exec(
    title
  );
  if (bumpMatch) {
    const oldMaj = Number(bumpMatch[1]);
    const oldMin = Number(bumpMatch[2] ?? 0);
    const oldPat = Number(bumpMatch[3] ?? 0);
    const newMaj = Number(bumpMatch[4]);
    const newMin = Number(bumpMatch[5] ?? 0);
    const newPat = Number(bumpMatch[6] ?? 0);
    if (newMaj !== oldMaj) return 'major';
    if (newMin !== oldMin) return 'minor';
    if (newPat !== oldPat) return 'patch';
  }

  // Grouped minor-and-patch PR title/branch heuristic
  if (/\bminor-and-patch\b/i.test(title)) return 'minor';
  // General Dependabot grouped PR (e.g. `bump the codeql-action group with 3 updates`)
  if (/\bbump the [^\s]+ group\b/i.test(title)) return 'grouped';
  return 'unknown';
}

/**
 * Infer package ecosystem ('github-actions' | 'npm' | 'unknown') from metadata, branch, or files.
 */
export function inferEcosystem(rawEcosystem, headRefName = '', files = []) {
  const eco = String(rawEcosystem ?? '').trim().toLowerCase();
  if (eco === 'github-actions' || eco === 'github_actions') return 'github-actions';
  if (eco === 'npm' || eco === 'npm_and_yarn') return 'npm';

  if (/^dependabot\/github_actions\//i.test(headRefName)) return 'github-actions';
  if (/^dependabot\/npm_and_yarn\//i.test(headRefName)) return 'npm';

  if (files.length > 0 && files.every((f) => ALLOWED_GHA_FILE_RX.test(f))) return 'github-actions';
  if (files.length > 0 && files.every((f) => ALLOWED_NPM_FILES.has(f))) return 'npm';
  return 'unknown';
}

/**
 * Infer npm dependency scope ('production' | 'development' | 'unknown') using metadata
 * and optionally `package.json` dependency maps.
 */
export function inferNpmDependencyScope(rawDependencyType, dependencyNames = [], title = '', pkgJson = null) {
  const depType = String(rawDependencyType ?? '').trim().toLowerCase();
  if (depType.includes('production')) return 'production';
  if (depType.includes('development')) return 'development';

  if (pkgJson && typeof pkgJson === 'object') {
    const prodDeps = new Set(Object.keys(pkgJson.dependencies ?? {}));
    const devDeps = new Set(Object.keys(pkgJson.devDependencies ?? {}));
    const names = [...dependencyNames];
    if (names.length === 0) {
      const m = /\bbump\s+(@?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)\s+from\b/i.exec(title);
      if (m?.[1]) names.push(m[1]);
    }
    if (names.length > 0) {
      if (names.some((n) => prodDeps.has(n))) return 'production';
      if (names.every((n) => devDeps.has(n))) return 'development';
    }
  }
  return 'unknown';
}

/**
 * Validate that every commit on the PR is authored by Dependabot and cryptographically signed.
 */
export function verifyDependabotCommits(commits = []) {
  const issues = [];
  if (!Array.isArray(commits) || commits.length === 0) {
    issues.push('PR contains no inspectable commits.');
    return { valid: false, commitCount: 0, issues };
  }
  for (const c of commits) {
    const oid = String(c.oid ?? '').slice(0, 12) || 'unknown';
    const authorLogin = String(c.authorLogin ?? '').toLowerCase();
    const authorEmail = String(c.authorEmail ?? '').toLowerCase();
    const isDependabotAuthor =
      DEPENDABOT_LOGINS.has(authorLogin) ||
      authorEmail === '49699333+dependabot[bot]@users.noreply.github.com';
    if (!isDependabotAuthor) {
      issues.push(`Commit ${oid} was authored by "${c.authorLogin || c.authorEmail || 'unknown'}", not dependabot[bot].`);
    }
    if (!c.signatureValid) {
      issues.push(`Commit ${oid} does not have a verified GitHub commit signature (state=${c.signatureState ?? 'UNKNOWN'}).`);
    }
  }
  return { valid: issues.length === 0, commitCount: commits.length, issues };
}

/**
 * Validate that every required status check has completed with SUCCESS and no check failed.
 */
export function evaluateRequiredChecks(checks = [], requiredNames = REQUIRED_CHECK_NAMES) {
  const byName = new Map();
  for (const check of checks) {
    if (!check?.name) continue;
    byName.set(check.name, check);
  }

  const missing = [];
  const pending = [];
  const failed = [];

  for (const req of requiredNames) {
    const entry = byName.get(req);
    if (!entry) {
      missing.push(req);
      continue;
    }
    const status = String(entry.status ?? '').toUpperCase();
    const conclusion = String(entry.conclusion ?? '').toUpperCase();
    if (status !== 'COMPLETED') {
      pending.push(req);
    } else if (conclusion !== 'SUCCESS') {
      failed.push(`${req} (${conclusion || 'UNKNOWN'})`);
    }
  }

  // Also detect any non-required failing check (e.g., CodeQL summary or workflow check)
  for (const check of checks) {
    if (!check?.name || requiredNames.includes(check.name)) continue;
    const status = String(check.status ?? '').toUpperCase();
    const conclusion = String(check.conclusion ?? '').toUpperCase();
    if (status === 'COMPLETED' && ['FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(conclusion)) {
      failed.push(`${check.name} (${conclusion})`);
    }
  }

  return {
    allPassed: missing.length === 0 && pending.length === 0 && failed.length === 0,
    missing,
    pending,
    failed
  };
}

/**
 * Evaluate full Dependabot PR eligibility, trust, workflow integrity, and check readiness.
 */
export function evaluateDependabotPr(input, options = {}) {
  const allowNpmDevMajor = Boolean(options.allowNpmDevMajor);
  const pkgJson = options.pkgJson ?? null;
  const authorLogin = String(input.authorLogin ?? '').toLowerCase();
  const files = Array.isArray(input.files) ? input.files : [];
  const dependencyNames = Array.isArray(input.dependencyNames)
    ? input.dependencyNames.filter(Boolean)
    : [];

  const ecosystem = inferEcosystem(input.packageEcosystem, input.headRefName, files);
  const updateType = normalizeSemverUpdateType(input.updateType, input.title);
  const npmScope =
    ecosystem === 'npm'
      ? inferNpmDependencyScope(input.dependencyType, dependencyNames, input.title, pkgJson)
      : 'n/a';

  const securityBlockers = [];
  const policyHoldReasons = [];

  // 1. Author & draft check
  if (!DEPENDABOT_LOGINS.has(authorLogin)) {
    securityBlockers.push(`PR author is "${input.authorLogin || 'unknown'}", not dependabot[bot].`);
  }
  if (input.isDraft) {
    policyHoldReasons.push('PR is still a draft.');
  }

  // 2. Commit authorship & cryptographic signature check
  const commitCheck = verifyDependabotCommits(input.commits ?? []);
  if (!commitCheck.valid) {
    securityBlockers.push(...commitCheck.issues);
  }

  // 3. Allowed file confinement check
  if (files.length === 0) {
    securityBlockers.push('PR modifies no files.');
  } else if (ecosystem === 'github-actions') {
    const disallowed = files.filter((f) => !ALLOWED_GHA_FILE_RX.test(f));
    if (disallowed.length > 0) {
      securityBlockers.push(`github-actions PR touches unexpected file(s): ${disallowed.join(', ')}.`);
    }
  } else if (ecosystem === 'npm') {
    const disallowed = files.filter((f) => !ALLOWED_NPM_FILES.has(f));
    if (disallowed.length > 0) {
      securityBlockers.push(`npm PR touches unexpected file(s): ${disallowed.join(', ')}.`);
    }
  } else {
    policyHoldReasons.push(`Unsupported or unrecognized dependency ecosystem "${ecosystem}".`);
  }

  // 4. Workflow content integrity & remote tag provenance (if provided)
  const workflowIntegrityErrors = [];
  const remoteTagChecks = [];
  if (Array.isArray(input.workflowAudits)) {
    for (const wa of input.workflowAudits) {
      for (const e of wa.errors ?? []) {
        workflowIntegrityErrors.push(`${e.file}${e.line ? `:${e.line}` : ''} [${e.code}] ${e.message}`);
      }
    }
  }
  if (Array.isArray(input.remoteTagChecks)) {
    const seenMismatchKeys = new Set();
    for (const rtc of input.remoteTagChecks) {
      remoteTagChecks.push(rtc);
      if (!rtc.matched) {
        const key = `${rtc.repo}@${rtc.tag}@${rtc.pinnedSha}`;
        if (seenMismatchKeys.has(key)) continue;
        seenMismatchKeys.add(key);
        workflowIntegrityErrors.push(
          `Tag provenance mismatch for ${rtc.repo}@${rtc.tag}: pinned ${rtc.pinnedSha}, upstream ${rtc.resolvedSha ?? 'NOT_FOUND'}`
        );
      }
    }
  }
  if (workflowIntegrityErrors.length > 0) {
    securityBlockers.push(...workflowIntegrityErrors);
  }

  // 5. Maintainer changes guard (Dependabot supply-chain signal)
  if (input.maintainerChanges === true) {
    policyHoldReasons.push('Dependabot flagged upstream package maintainer changes; manual security review required.');
  }

  // 6. A2 Semver & Ecosystem Policy
  if (ecosystem === 'github-actions') {
    if (!['patch', 'minor', 'major', 'grouped'].includes(updateType)) {
      policyHoldReasons.push(
        `Could not determine semver update type for github-actions PR (parsed="${updateType}"); holding for manual review.`
      );
    }
  } else if (ecosystem === 'npm') {
    if (updateType === 'major') {
      if (npmScope === 'development' && allowNpmDevMajor) {
        // Explicitly opted in by maintainer CLI flag for devDependencies
      } else {
        const scopeLabel =
          npmScope === 'production'
            ? 'runtime dependency'
            : npmScope === 'development'
              ? 'devDependency (major bump held by default; pass --allow-npm-dev-major to include)'
              : 'dependency (runtime scope unconfirmed)';
        policyHoldReasons.push(`Major npm ${scopeLabel} update requires manual review per repository policy.`);
      }
    } else if (updateType !== 'patch' && updateType !== 'minor') {
      policyHoldReasons.push(
        `Could not confirm npm update is semver-patch or semver-minor (parsed="${updateType}"); holding for manual review.`
      );
    }
  }

  // 7. Status check & mergeability evaluation
  const checkStatus = evaluateRequiredChecks(input.checks ?? [], options.requiredChecks ?? REQUIRED_CHECK_NAMES);
  const hasConflict = String(input.mergeable ?? '').toUpperCase() === 'CONFLICTING';

  const policyEligible = securityBlockers.length === 0 && policyHoldReasons.length === 0;
  let status;
  if (securityBlockers.length > 0) {
    status = 'BLOCKED_INTEGRITY';
  } else if (!policyEligible) {
    status = 'HELD_POLICY';
  } else if (hasConflict) {
    status = 'CONFLICT';
  } else if (!checkStatus.allPassed) {
    status = 'BLOCKED_CHECKS';
  } else {
    status = 'READY_TO_MERGE';
  }

  return {
    number: input.number,
    title: input.title,
    url: input.url ?? '',
    ecosystem,
    updateType,
    npmScope,
    dependencyNames,
    policyEligible,
    recommendedLabel: policyEligible ? 'automerge-eligible' : 'manual-review-required',
    status,
    commitCheck,
    remoteTagChecks,
    checkStatus,
    securityBlockers,
    policyHoldReasons
  };
}

/**
 * Fetch full PR metadata, commits (with signature status), files, and status checks via GraphQL.
 */
export function fetchPrDetailsGraphQL(repo, prNumber, ghExec = defaultGhExec) {
  const [owner, name] = repo.split('/');
  const query = `
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          number
          title
          url
          state
          isDraft
          headRefName
          headRefOid
          mergeable
          mergeStateStatus
          author { login }
          files(first: 100) { nodes { path } }
          commits(first: 50) {
            nodes {
              commit {
                oid
                author { email user { login } }
                signature { isValid state }
              }
            }
          }
          statusCheckRollup {
            contexts(first: 50) {
              nodes {
                __typename
                ... on CheckRun { name status conclusion }
                ... on StatusContext { context state }
              }
            }
          }
          comments(first: 50) {
            nodes {
              databaseId
              body
              author { login }
            }
          }
        }
      }
    }
  `;
  const raw = ghExec([
    'api',
    'graphql',
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
    '-F',
    `number=${prNumber}`,
    '-f',
    `query=${query}`
  ]);
  const pr = JSON.parse(raw)?.data?.repository?.pullRequest;
  if (!pr) {
    throw new Error(`Pull request #${prNumber} not found in ${repo}`);
  }
  return normalizeGraphqlPr(pr);
}

function normalizeGraphqlPr(pr) {
  const checks = [];
  for (const node of pr.statusCheckRollup?.contexts?.nodes ?? []) {
    if (node.__typename === 'CheckRun') {
      checks.push({ name: node.name, status: node.status, conclusion: node.conclusion });
    } else if (node.__typename === 'StatusContext') {
      const state = String(node.state ?? '').toUpperCase();
      checks.push({
        name: node.context,
        status: state === 'PENDING' ? 'IN_PROGRESS' : 'COMPLETED',
        conclusion: state === 'SUCCESS' ? 'SUCCESS' : state
      });
    }
  }
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    isDraft: Boolean(pr.isDraft),
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    mergeable: pr.mergeable,
    mergeStateStatus: pr.mergeStateStatus,
    authorLogin: pr.author?.login ?? '',
    files: (pr.files?.nodes ?? []).map((f) => f.path),
    commits: (pr.commits?.nodes ?? []).map((n) => ({
      oid: n.commit.oid,
      authorLogin: n.commit.author?.user?.login ?? '',
      authorEmail: n.commit.author?.email ?? '',
      signatureValid: Boolean(n.commit.signature?.isValid),
      signatureState: n.commit.signature?.state ?? 'UNSIGNED'
    })),
    checks,
    comments: pr.comments?.nodes ?? []
  };
}

/**
 * Audit all modified `.github/workflows/*.yml` files at the PR's head SHA via the GitHub Contents API
 * (zero checkout of untrusted PR code) and optionally verify remote tag-to-SHA provenance.
 */
export function auditPrWorkflowFiles(repo, prData, verifyRemoteTags = false, ghExec = defaultGhExec) {
  const workflowFiles = (prData.files ?? []).filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f));
  const workflowAudits = [];
  const remoteTagChecks = [];
  const seenTagLookups = new Map();
  const seenCommitLookups = new Map();

  for (const wfPath of workflowFiles) {
    const contentB64 = ghExec([
      'api',
      `repos/${repo}/contents/${wfPath}?ref=${prData.headRefOid}`,
      '--jq',
      '.content'
    ]);
    const content = Buffer.from(contentB64.replace(/\s+/g, ''), 'base64').toString('utf8');
    const audit = auditWorkflowContent(wfPath, content);
    workflowAudits.push(audit);

    if (verifyRemoteTags) {
      for (const u of audit.uses) {
        if (!u.isPinnedSha || !u.tagComment) continue;
        const pinnedSha = u.ref.toLowerCase();
        if (!EXACT_SEMVER_TAG_RX.test(u.tagComment)) {
          const commitKey = `${u.repo}@${pinnedSha}`;
          let exists = seenCommitLookups.get(commitKey);
          if (exists === undefined) {
            try {
              exists = verifyRemoteCommitExists(u.repo, pinnedSha, ghExec);
            } catch {
              exists = false;
            }
            seenCommitLookups.set(commitKey, exists);
          }
          remoteTagChecks.push({
            file: wfPath,
            action: u.action,
            repo: u.repo,
            tag: u.tagComment,
            pinnedSha,
            resolvedSha: exists ? pinnedSha : null,
            matched: exists,
            floatingTag: true
          });
          continue;
        }
        const key = `${u.repo}@${u.tagComment}`;
        let resolvedSha = seenTagLookups.get(key);
        if (resolvedSha === undefined) {
          try {
            resolvedSha = resolveRemoteTagCommitSha(u.repo, u.tagComment, ghExec);
          } catch {
            resolvedSha = null;
          }
          seenTagLookups.set(key, resolvedSha);
        }
        remoteTagChecks.push({
          file: wfPath,
          action: u.action,
          repo: u.repo,
          tag: u.tagComment,
          pinnedSha,
          resolvedSha,
          matched: resolvedSha !== null && resolvedSha === pinnedSha
        });
      }
    }
  }

  return { workflowAudits, remoteTagChecks };
}

/**
 * Render an idempotent markdown triage report for a Dependabot PR.
 */
export function formatTriageComment(result) {
  const badge =
    result.securityBlockers.length > 0
      ? '❌ **Blocked — Security / Workflow Integrity Failure**'
      : result.policyEligible
        ? '✅ **Eligible — Ready for CODEOWNER Approval & Squash-Merge**'
        : '⏸️ **Held — Manual Review Required**';

  const lines = [
    TRIAGE_COMMENT_MARKER,
    `### Number One Dependabot PR Triage`,
    '',
    `${badge}`,
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| Ecosystem | \`${result.ecosystem}\` |`,
    `| Update Type | \`${result.updateType}\` |`,
    ...(result.ecosystem === 'npm' ? [`| Dependency Scope | \`${result.npmScope}\` |`] : []),
    `| Commits Verified | ${result.commitCheck.valid ? `✅ ${result.commitCheck.commitCount} signed \`dependabot[bot]\` commit(s)` : `❌ Failed`} |`,
    `| Policy Label | \`${result.recommendedLabel}\` |`
  ];

  if (result.remoteTagChecks.length > 0) {
    lines.push('', '#### Upstream Action Tag-to-SHA Provenance', '');
    lines.push('| Action | Tag | Pinned SHA | Status |');
    lines.push('| --- | --- | --- | --- |');
    const dedup = new Set();
    for (const rtc of result.remoteTagChecks) {
      const k = `${rtc.action}@${rtc.pinnedSha}@${rtc.tag}`;
      if (dedup.has(k)) continue;
      dedup.add(k);
      lines.push(
        `| \`${rtc.action}\` | \`${rtc.tag}\` | \`${rtc.pinnedSha.slice(0, 12)}\` | ${rtc.matched ? '✅ Verified' : `❌ Mismatch (\`${rtc.resolvedSha ?? 'not found'}\`)`} |`
      );
    }
  }

  if (result.securityBlockers.length > 0) {
    lines.push('', '#### Integrity / Security Blockers', '');
    for (const b of result.securityBlockers) {
      lines.push(`- ❌ ${b}`);
    }
  }

  if (result.policyHoldReasons.length > 0) {
    lines.push('', '#### Manual Review Notes', '');
    for (const r of result.policyHoldReasons) {
      lines.push(`- ⏸️ ${r}`);
    }
  }

  if (result.policyEligible) {
    lines.push(
      '',
      '#### Maintainer Approval & Merge Commands',
      '',
      'Final CODEOWNERS approval remains manual per `Number One Default Branch Governance`. Once all required checks pass:',
      '',
      '```bash',
      `# Approve and squash-merge PR #${result.number} directly`,
      `gh pr review ${result.number} --approve && gh pr merge ${result.number} --squash --delete-branch`,
      '',
      '# Or batch-verify, approve, and squash-merge all eligible green Dependabot PRs',
      'npm run pr:merge',
      '```'
    );
  }

  return lines.join('\n');
}

function upsertTriageComment(repo, prNumber, existingComments, body, ghExec = defaultGhExec) {
  const existing = existingComments.find((c) => typeof c.body === 'string' && c.body.includes(TRIAGE_COMMENT_MARKER));
  if (existing?.databaseId) {
    ghExec(['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${existing.databaseId}`, '-f', `body=${body}`]);
  } else {
    ghExec(['pr', 'comment', String(prNumber), '-R', repo, '--body', body]);
  }
}

function syncPolicyLabels(repo, prNumber, recommendedLabel, ghExec = defaultGhExec) {
  const opposite =
    recommendedLabel === 'automerge-eligible' ? 'manual-review-required' : 'automerge-eligible';
  // Ensure the target label exists (safe idempotent create)
  const labelColor = recommendedLabel === 'automerge-eligible' ? '0e8a16' : 'd93f0b';
  const labelDesc =
    recommendedLabel === 'automerge-eligible'
      ? 'Dependabot PR passed policy & provenance checks; ready for CODEOWNER approval and squash-merge'
      : 'PR requires explicit manual review before merge';
  try {
    ghExec(['label', 'create', recommendedLabel, '-R', repo, '--color', labelColor, '--description', labelDesc, '--force']);
  } catch {
    // Label creation requires issues:write; continue attempting PR label edit if already provisioned
  }
  ghExec(['pr', 'edit', String(prNumber), '-R', repo, '--add-label', recommendedLabel]);
  try {
    ghExec(['pr', 'edit', String(prNumber), '-R', repo, '--remove-label', opposite]);
  } catch {
    // Opposite label was not present
  }
}

/**
 * Run local typecheck + build + Vitest + workflow integrity check on a PR head commit
 * in an isolated temporary git worktree (never mutates the caller's working tree).
 */
function runLocalVerificationOnRef(headOid) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n1-pr-verify-'));
  try {
    execFileSync('git', ['fetch', 'origin', headOid], { stdio: 'inherit' });
    execFileSync('git', ['worktree', 'add', '--detach', tmpDir, headOid], { stdio: 'inherit' });
    execFileSync('npm', ['ci'], { cwd: tmpDir, stdio: 'inherit' });
    execFileSync('npm', ['run', 'typecheck'], { cwd: tmpDir, stdio: 'inherit' });
    execFileSync('npm', ['run', 'build'], { cwd: tmpDir, stdio: 'inherit' });
    execFileSync('npm', ['test'], { cwd: tmpDir, stdio: 'inherit' });
    execFileSync('node', ['scripts/verify-workflows.mjs'], { cwd: tmpDir, stdio: 'inherit' });
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', tmpDir], { stdio: 'ignore' });
    } catch {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

function loadLocalPackageJson() {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function handleTriagePr(args) {
  const repo = args.repo ?? DEFAULT_REPO;
  const prNumber = Number(args.pr);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error('--pr <number> must be a positive integer');
  }

  const prData = fetchPrDetailsGraphQL(repo, prNumber);
  const { workflowAudits, remoteTagChecks } = auditPrWorkflowFiles(repo, prData, Boolean(args.verifyRemoteTags));
  const pkgJson = loadLocalPackageJson();

  const depNames = args.dependencyNames
    ? args.dependencyNames
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const result = evaluateDependabotPr(
    {
      ...prData,
      packageEcosystem: args.ecosystem,
      updateType: args.updateType,
      dependencyType: args.dependencyType,
      dependencyNames: depNames,
      maintainerChanges: args.maintainerChanges === 'true',
      workflowAudits,
      remoteTagChecks
    },
    { pkgJson, allowNpmDevMajor: Boolean(args.allowNpmDevMajor) }
  );

  if (args.syncLabels) {
    syncPolicyLabels(repo, prNumber, result.recommendedLabel);
  }
  if (args.postComment) {
    const comment = formatTriageComment(result);
    upsertTriageComment(repo, prNumber, prData.comments, comment);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatTriageComment(result));
  }

  // Exit non-zero only on hard security/integrity blockers; policy holds exit 0 cleanly
  process.exit(result.securityBlockers.length > 0 ? 1 : 0);
}

function handleSweep(args) {
  const repo = args.repo ?? DEFAULT_REPO;
  const apply = Boolean(args.apply);
  const pkgJson = loadLocalPackageJson();

  let prNumbers = [];
  if (args.pr) {
    const n = Number(args.pr);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('--pr <number> must be a positive integer');
    }
    prNumbers = [n];
  } else {
    const listRaw = defaultGhExec([
      'pr',
      'list',
      '-R',
      repo,
      '--state',
      'open',
      '--limit',
      '30',
      '--json',
      'number,author'
    ]);
    const list = JSON.parse(listRaw);
    prNumbers = list
      .filter((item) => DEPENDABOT_LOGINS.has(String(item.author?.login ?? '').toLowerCase()))
      .map((item) => item.number)
      .sort((a, b) => a - b);
  }

  if (prNumbers.length === 0) {
    if (args.json) {
      console.log(JSON.stringify({ repo, mode: apply ? 'apply' : 'dry-run', prs: [] }, null, 2));
    } else {
      console.log(`[pr-automation] No open Dependabot PRs found in ${repo}.`);
    }
    return;
  }

  const results = [];
  let mergedCount = 0;

  for (const prNumber of prNumbers) {
    // Re-fetch live PR state before each evaluation (mergeability can change after earlier merges)
    let prData = fetchPrDetailsGraphQL(repo, prNumber);
    for (let attempt = 0; attempt < 3 && String(prData.mergeable ?? '').toUpperCase() === 'UNKNOWN'; attempt++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
      prData = fetchPrDetailsGraphQL(repo, prNumber);
    }
    const { workflowAudits, remoteTagChecks } = auditPrWorkflowFiles(repo, prData, Boolean(args.verifyRemoteTags));
    const evaluation = evaluateDependabotPr(
      { ...prData, workflowAudits, remoteTagChecks },
      { pkgJson, allowNpmDevMajor: Boolean(args.allowNpmDevMajor) }
    );

    const record = { ...evaluation, actionTaken: 'none' };

    if (apply && evaluation.status === 'READY_TO_MERGE') {
      if (args.localTest) {
        console.log(`[pr-automation] Running isolated local verification on PR #${prNumber} (${prData.headRefOid.slice(0, 10)})...`);
        runLocalVerificationOnRef(prData.headRefOid);
      }
      const approvalNote = `Automated CODEOWNER verification passed via scripts/pr-automation.mjs (ecosystem=${evaluation.ecosystem}, update=${evaluation.updateType}, commits=${evaluation.commitCheck.commitCount} verified, checks=all green).`;
      defaultGhExec(['pr', 'review', String(prNumber), '-R', repo, '--approve', '--body', approvalNote]);
      defaultGhExec(['pr', 'merge', String(prNumber), '-R', repo, '--squash', '--delete-branch']);
      record.actionTaken = 'approved-and-squash-merged';
      mergedCount++;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    } else if (apply && evaluation.status === 'CONFLICT' && args.rebaseConflicts) {
      defaultGhExec(['pr', 'comment', String(prNumber), '-R', repo, '--body', '@dependabot rebase']);
      record.actionTaken = 'requested-dependabot-rebase';
    } else if (!apply && evaluation.status === 'READY_TO_MERGE') {
      record.actionTaken = 'dry-run-would-approve-and-merge';
    }

    results.push(record);
  }

  if (args.json) {
    console.log(JSON.stringify({ repo, mode: apply ? 'apply' : 'dry-run', mergedCount, prs: results }, null, 2));
    return;
  }

  console.log(`[pr-automation] Evaluated ${results.length} Dependabot PR(s) in ${repo} (mode=${apply ? 'apply' : 'dry-run'}):`);
  for (const r of results) {
    const reasons = [...r.securityBlockers, ...r.policyHoldReasons];
    if (r.status === 'BLOCKED_CHECKS') {
      if (r.checkStatus.failed.length > 0) reasons.push(`failed checks: ${r.checkStatus.failed.join(', ')}`);
      if (r.checkStatus.pending.length > 0) reasons.push(`pending checks: ${r.checkStatus.pending.join(', ')}`);
      if (r.checkStatus.missing.length > 0) reasons.push(`missing checks: ${r.checkStatus.missing.join(', ')}`);
    }
    const detail = reasons.length > 0 ? ` — ${reasons.join('; ')}` : '';
    console.log(
      `  #${r.number} [${r.status}] (${r.ecosystem}/${r.updateType}) -> ${r.actionTaken}: ${r.title}${detail}`
    );
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const parsed = { command: command ?? 'sweep' };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--repo' && i + 1 < rest.length) parsed.repo = rest[++i];
    else if (a === '--pr' && i + 1 < rest.length) parsed.pr = rest[++i];
    else if (a === '--ecosystem' && i + 1 < rest.length) parsed.ecosystem = rest[++i];
    else if (a === '--update-type' && i + 1 < rest.length) parsed.updateType = rest[++i];
    else if (a === '--dependency-type' && i + 1 < rest.length) parsed.dependencyType = rest[++i];
    else if (a === '--dependency-names' && i + 1 < rest.length) parsed.dependencyNames = rest[++i];
    else if (a === '--maintainer-changes' && i + 1 < rest.length) parsed.maintainerChanges = rest[++i];
    else if (a === '--verify-remote-tags') parsed.verifyRemoteTags = true;
    else if (a === '--post-comment') parsed.postComment = true;
    else if (a === '--sync-labels') parsed.syncLabels = true;
    else if (a === '--dry-run') parsed.apply = false;
    else if (a === '--apply') parsed.apply = true;
    else if (a === '--local-test') parsed.localTest = true;
    else if (a === '--rebase-conflicts') parsed.rebaseConflicts = true;
    else if (a === '--allow-npm-dev-major') parsed.allowNpmDevMajor = true;
    else if (a === '--json') parsed.json = true;
    else if (a === '-h' || a === '--help') parsed.help = true;
    else if (!a.startsWith('-') && !parsed.positional) parsed.positional = a;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return parsed;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || args.command === '-h' || args.command === '--help') {
      console.log(
        [
          'Usage:',
          '  node scripts/pr-automation.mjs sweep [--repo owner/repo] [--dry-run|--apply] [--pr <N>] [--verify-remote-tags] [--local-test] [--rebase-conflicts] [--allow-npm-dev-major] [--json]',
          '  node scripts/pr-automation.mjs triage-pr --repo owner/repo --pr <N> [--ecosystem <e>] [--update-type <t>] [--dependency-type <d>] [--dependency-names <n>] [--verify-remote-tags] [--post-comment] [--sync-labels] [--json]',
          '  node scripts/pr-automation.mjs evaluate-json <path-to-json> [--allow-npm-dev-major]'
        ].join('\n')
      );
      process.exit(0);
    }

    if (args.command === 'evaluate-json') {
      if (!args.positional) throw new Error('evaluate-json requires a JSON file path');
      const payload = JSON.parse(fs.readFileSync(args.positional, 'utf8'));
      const out = evaluateDependabotPr(payload.pr ?? payload, {
        pkgJson: payload.pkgJson ?? null,
        allowNpmDevMajor: Boolean(args.allowNpmDevMajor || payload.allowNpmDevMajor)
      });
      console.log(JSON.stringify(out, null, 2));
      process.exit(out.securityBlockers.length > 0 ? 1 : 0);
    } else if (args.command === 'triage-pr') {
      handleTriagePr(args);
    } else if (args.command === 'sweep') {
      handleSweep(args);
    } else {
      throw new Error(`Unknown command: ${args.command}`);
    }
  } catch (err) {
    console.error(`[pr-automation] Error: ${err.message}`);
    process.exit(2);
  }
}
