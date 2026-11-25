#!/usr/bin/env node
/**
 * Number One (n1) — GitHub Actions & Supply-Chain Integrity Verifier
 *
 * Deterministically validates every workflow under `.github/workflows/`:
 *   1. Explicit least-privilege `permissions:` block (forbids `write-all`).
 *   2. Immutable 40-character hexadecimal commit SHA pinning on all `uses:`.
 *   3. `pull_request_target` safety (forbids checking out untrusted PR head refs).
 *   4. Lockstep SHA & version-comment pinning for multi-subaction repos
 *      (e.g., `github/codeql-action/{init,autobuild,analyze}`).
 *   5. `.github/dependabot.yml` schema presence & `github/codeql-action*` group guard.
 *   6. GitHub Pages static bundle completeness (extracted from `pages.yml`).
 *   7. Optional `--verify-remote-tags`: resolves `# vX.Y.Z` tag comments via `gh api`
 *      and verifies each pinned 40-char SHA actually matches the upstream Git tag.
 *
 * Usage:
 *   node scripts/verify-workflows.mjs [--root <dir>] [--files a,b] [--verify-remote-tags] [--skip-pages-bundle] [--json]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA40_RX = /^[0-9a-f]{40}$/i;
const USES_RX =
  /\buses\s*:\s*['"]?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)@([^\s'"]+)['"]?(?:\s*#\s*([^\r\n]+))?/;
const TAG_COMMENT_RX = /^(v?\d+(?:\.\d+){0,2}(?:[-+][A-Za-z0-9._-]+)?)\b/;
export const EXACT_SEMVER_TAG_RX = /^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?$/;

/**
 * Parse every third-party GitHub Action `uses:` reference in a workflow file.
 * Skips local (`./...`) and Docker (`docker://...`) references because `USES_RX`
 * only matches `owner/repo[/subpath]@ref`.
 */
export function extractActionUses(content, filePath = '') {
  const uses = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = USES_RX.exec(trimmed);
    if (!match) continue;
    const fullAction = match[1];
    const ref = match[2];
    const rawComment = (match[3] ?? '').trim();
    const tagMatch = TAG_COMMENT_RX.exec(rawComment);
    const parts = fullAction.split('/');
    const repo = `${parts[0]}/${parts[1]}`;
    const subpath = parts.length > 2 ? parts.slice(2).join('/') : '';
    uses.push({
      file: filePath,
      line: i + 1,
      action: fullAction,
      repo,
      subpath,
      ref,
      isPinnedSha: SHA40_RX.test(ref),
      tagComment: tagMatch ? tagMatch[1] : null,
      rawComment
    });
  }
  return uses;
}

/**
 * Resolve an upstream GitHub tag to its underlying commit SHA via `gh api`.
 */
export function resolveRemoteTagCommitSha(repo, tag, ghExec = defaultGhExec) {
  const refJson = JSON.parse(ghExec(['api', `repos/${repo}/git/ref/tags/${tag}`]));
  const obj = refJson?.object;
  if (!obj?.sha) {
    throw new Error(`Tag ${tag} not found on ${repo}`);
  }
  if (obj.type === 'tag') {
    const tagObj = JSON.parse(ghExec(['api', `repos/${repo}/git/tags/${obj.sha}`]));
    if (!tagObj?.object?.sha) {
      throw new Error(`Annotated tag ${tag} on ${repo} could not be dereferenced`);
    }
    return String(tagObj.object.sha).toLowerCase();
  }
  return String(obj.sha).toLowerCase();
}

/**
 * Verify that a 40-char commit SHA exists in an upstream GitHub repository.
 * Used when an action carries a floating major/minor comment (e.g. `# v4`) rather
 * than an immutable full semver tag (`# v4.39.5`).
 */
export function verifyRemoteCommitExists(repo, sha, ghExec = defaultGhExec) {
  const commitJson = JSON.parse(ghExec(['api', `repos/${repo}/git/commits/${sha}`]));
  return String(commitJson?.sha ?? '').toLowerCase() === sha.toLowerCase();
}

function defaultGhExec(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

/**
 * Audit a single workflow file's content.
 */
export function auditWorkflowContent(relPath, content) {
  const errors = [];
  const warnings = [];
  const uses = extractActionUses(content, relPath);

  if (!content.trim()) {
    errors.push({ file: relPath, code: 'empty-workflow', message: 'Workflow file is empty.' });
    return { file: relPath, uses, errors, warnings };
  }

  if (!/^\s*on\s*:/m.test(content)) {
    errors.push({ file: relPath, code: 'missing-trigger', message: 'Missing top-level `on:` trigger.' });
  }
  if (!/^\s*jobs\s*:/m.test(content)) {
    errors.push({ file: relPath, code: 'missing-jobs', message: 'Missing top-level `jobs:` block.' });
  }

  // 1. Explicit least-privilege permissions
  if (!/^\s*permissions\s*:/m.test(content)) {
    errors.push({
      file: relPath,
      code: 'missing-permissions',
      message: 'Missing explicit `permissions:` block.'
    });
  } else if (/^\s*permissions\s*:\s*write-all\b/im.test(content)) {
    errors.push({
      file: relPath,
      code: 'write-all-permissions',
      message: 'Workflow declares overly permissive `permissions: write-all`.'
    });
  }

  // 2. Immutable 40-char commit SHA pinning
  for (const u of uses) {
    if (!u.isPinnedSha) {
      errors.push({
        file: relPath,
        line: u.line,
        code: 'unpinned-action',
        message: `Action \`${u.action}@${u.ref}\` is not pinned to a 40-character commit SHA.`
      });
    }
  }

  // 3. `pull_request_target` untrusted checkout safety
  const hasPullRequestTarget =
    /^\s*pull_request_target\b/m.test(content) ||
    /^\s*on\s*:\s*\[[^\]]*\bpull_request_target\b/m.test(content);
  if (hasPullRequestTarget) {
    const unsafeRefCheckout =
      /\bref\s*:\s*['"]?\$\{\{\s*github\.(?:event\.pull_request\.head\.(?:sha|ref)|head_ref)\b/.test(
        content
      );
    if (unsafeRefCheckout) {
      errors.push({
        file: relPath,
        code: 'unsafe-pull-request-target-checkout',
        message:
          'Workflow uses `pull_request_target` and checks out untrusted PR head code, risking secret/token exfiltration.'
      });
    }
  }

  // 4. Multi-subaction lockstep pinning (e.g. github/codeql-action/{init,autobuild,analyze})
  const byRepoSubpaths = new Map();
  for (const u of uses) {
    if (!u.subpath) continue;
    const list = byRepoSubpaths.get(u.repo) ?? [];
    list.push(u);
    byRepoSubpaths.set(u.repo, list);
  }
  for (const [repo, entries] of byRepoSubpaths.entries()) {
    const uniqueSubpaths = new Set(entries.map((e) => e.subpath));
    if (uniqueSubpaths.size < 2) continue;
    const uniqueShas = new Set(entries.map((e) => e.ref.toLowerCase()));
    if (uniqueShas.size > 1) {
      const details = entries.map((e) => `${e.action}@${e.ref.slice(0, 12)} (line ${e.line})`).join(', ');
      errors.push({
        file: relPath,
        code: 'subaction-version-skew',
        message: `Multi-subaction suite \`${repo}/*\` has mismatched versions in the same workflow: ${details}. All steps must use the exact same commit SHA.`
      });
    }
    const tagComments = new Set(entries.map((e) => e.tagComment).filter(Boolean));
    if (tagComments.size > 1) {
      warnings.push({
        file: relPath,
        code: 'subaction-comment-skew',
        message: `Multi-subaction suite \`${repo}/*\` has inconsistent inline version comments (${Array.from(tagComments).join(', ')}).`
      });
    }
  }

  return { file: relPath, uses, errors, warnings };
}

/**
 * Audit `.github/dependabot.yml` and ensure multi-subaction suites like
 * `github/codeql-action/*` are grouped together.
 */
export function auditDependabotConfig(rootDir, allUses) {
  const relPath = '.github/dependabot.yml';
  const absPath = path.join(rootDir, relPath);
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(absPath)) {
    errors.push({
      file: relPath,
      code: 'missing-dependabot-config',
      message: 'Missing `.github/dependabot.yml` supply-chain update configuration.'
    });
    return { file: relPath, errors, warnings };
  }

  const content = fs.readFileSync(absPath, 'utf8');
  if (!/^\s*version\s*:\s*2\b/m.test(content)) {
    errors.push({ file: relPath, code: 'invalid-dependabot-version', message: 'Expected `version: 2`.' });
  }
  if (!/package-ecosystem\s*:\s*['"]?github-actions['"]?/m.test(content)) {
    errors.push({
      file: relPath,
      code: 'missing-github-actions-ecosystem',
      message: 'Dependabot config does not monitor `github-actions`.'
    });
  }

  const codeqlSubpaths = new Set(
    allUses.filter((u) => u.repo === 'github/codeql-action' && u.subpath).map((u) => u.subpath)
  );
  if (codeqlSubpaths.size >= 2) {
    const hasGroupsBlock = /^\s*groups\s*:/m.test(content);
    const hasCodeqlPattern = /github\/codeql-action\*/.test(content);
    if (!hasGroupsBlock || !hasCodeqlPattern) {
      errors.push({
        file: relPath,
        code: 'missing-codeql-dependabot-group',
        message:
          'Workflows use multiple `github/codeql-action/*` steps, so `.github/dependabot.yml` must define a `groups:` pattern matching `github/codeql-action*` to prevent step version skew.'
      });
    }
  }

  return { file: relPath, errors, warnings };
}

/**
 * Extract `test -f <path>` assertions from `.github/workflows/pages.yml` and verify
 * every required static bundle file exists in the repository.
 */
export function auditPagesBundle(rootDir) {
  const pagesWorkflowRel = '.github/workflows/pages.yml';
  const pagesWorkflowAbs = path.join(rootDir, pagesWorkflowRel);
  const errors = [];
  const checkedPaths = [];

  if (!fs.existsSync(pagesWorkflowAbs)) {
    return { checkedPaths, errors };
  }

  const content = fs.readFileSync(pagesWorkflowAbs, 'utf8');
  const testFileRx = /^\s*test\s+-f\s+([^\s;|&]+)/gm;
  let m;
  while ((m = testFileRx.exec(content)) !== null) {
    const targetRel = m[1].replace(/^['"]|['"]$/g, '');
    checkedPaths.push(targetRel);
    const targetAbs = path.resolve(rootDir, targetRel);
    const relFromRoot = path.relative(rootDir, targetAbs);
    if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
      errors.push({
        file: pagesWorkflowRel,
        code: 'pages-path-escape',
        message: `Pages bundle check path escapes repository root: ${targetRel}`
      });
      continue;
    }
    if (!fs.existsSync(targetAbs) || !fs.statSync(targetAbs).isFile()) {
      errors.push({
        file: targetRel,
        code: 'missing-pages-bundle-file',
        message: `Required GitHub Pages bundle file referenced in ${pagesWorkflowRel} is missing: ${targetRel}`
      });
    }
  }

  return { checkedPaths, errors };
}

/**
 * Run the full workflow and supply-chain integrity audit on a repository root.
 */
export function verifyRepositoryWorkflows(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const verifyRemoteTags = Boolean(options.verifyRemoteTags);
  const skipPagesBundle = Boolean(options.skipPagesBundle);
  const filterFiles = Array.isArray(options.files) && options.files.length > 0
    ? new Set(options.files.map((f) => f.replace(/\\/g, '/')))
    : null;
  const ghExec = options.ghExec ?? defaultGhExec;

  const workflowsDir = path.join(rootDir, '.github', 'workflows');
  const errors = [];
  const warnings = [];
  const allUses = [];
  const auditedWorkflows = [];
  const remoteTagChecks = [];

  if (!fs.existsSync(workflowsDir)) {
    errors.push({
      file: '.github/workflows',
      code: 'missing-workflows-dir',
      message: 'No `.github/workflows` directory found.'
    });
  } else {
    const entries = fs
      .readdirSync(workflowsDir)
      .filter((name) => /\.ya?ml$/i.test(name))
      .sort();

    for (const entry of entries) {
      const relPath = `.github/workflows/${entry}`;
      if (filterFiles && !filterFiles.has(relPath)) continue;
      const content = fs.readFileSync(path.join(workflowsDir, entry), 'utf8');
      const result = auditWorkflowContent(relPath, content);
      auditedWorkflows.push(relPath);
      allUses.push(...result.uses);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
  }

  // Always check dependabot config unless explicitly filtering to a non-dependabot subset
  if (!filterFiles || filterFiles.has('.github/dependabot.yml') || auditedWorkflows.length > 0) {
    const allRepoUses = filterFiles ? collectAllRepoWorkflowUses(rootDir) : allUses;
    const depAudit = auditDependabotConfig(rootDir, allRepoUses);
    errors.push(...depAudit.errors);
    warnings.push(...depAudit.warnings);
  }

  // Verify GitHub Pages bundle files exist
  let pagesCheckedPaths = [];
  if (!skipPagesBundle) {
    const pagesAudit = auditPagesBundle(rootDir);
    pagesCheckedPaths = pagesAudit.checkedPaths;
    errors.push(...pagesAudit.errors);
  }

  // Optional remote GitHub tag-to-SHA provenance verification
  if (verifyRemoteTags) {
    const seenTags = new Map();
    const seenCommits = new Map();
    for (const u of allUses) {
      if (!u.isPinnedSha) continue;
      if (!u.tagComment) {
        warnings.push({
          file: u.file,
          line: u.line,
          code: 'missing-version-comment',
          message: `Pinned action \`${u.action}@${u.ref}\` has no trailing \`# vX.Y.Z\` version comment to verify against upstream tags.`
        });
        continue;
      }
      const pinnedSha = u.ref.toLowerCase();
      if (!EXACT_SEMVER_TAG_RX.test(u.tagComment)) {
        const commitKey = `${u.repo}@${pinnedSha}`;
        let exists = seenCommits.get(commitKey);
        if (exists === undefined) {
          try {
            exists = verifyRemoteCommitExists(u.repo, pinnedSha, ghExec);
          } catch {
            exists = false;
          }
          seenCommits.set(commitKey, exists);
        }
        remoteTagChecks.push({
          repo: u.repo,
          tag: u.tagComment,
          pinnedSha,
          resolvedSha: exists ? pinnedSha : null,
          matched: exists,
          floatingTag: true
        });
        warnings.push({
          file: u.file,
          line: u.line,
          code: 'floating-version-comment',
          message: `Action \`${u.action}\` uses floating comment \`# ${u.tagComment}\`; prefer an exact \`# vX.Y.Z\` tag comment.`
        });
        if (!exists) {
          errors.push({
            file: u.file,
            line: u.line,
            code: 'remote-commit-not-found',
            message: `Pinned commit \`${u.ref}\` does not exist in \`${u.repo}\`.`
          });
        }
        continue;
      }
      const key = `${u.repo}@${u.tagComment}`;
      let resolvedSha = seenTags.get(key);
      if (resolvedSha === undefined) {
        try {
          resolvedSha = resolveRemoteTagCommitSha(u.repo, u.tagComment, ghExec);
          seenTags.set(key, resolvedSha);
        } catch (err) {
          seenTags.set(key, null);
          errors.push({
            file: u.file,
            line: u.line,
            code: 'remote-tag-lookup-failed',
            message: `Failed to resolve upstream tag \`${u.repo}@${u.tagComment}\`: ${err.message}`
          });
          remoteTagChecks.push({
            repo: u.repo,
            tag: u.tagComment,
            pinnedSha,
            resolvedSha: null,
            matched: false
          });
          continue;
        }
      }
      if (resolvedSha === null) continue;
      const matched = resolvedSha === pinnedSha;
      remoteTagChecks.push({
        repo: u.repo,
        tag: u.tagComment,
        pinnedSha,
        resolvedSha,
        matched
      });
      if (!matched) {
        errors.push({
          file: u.file,
          line: u.line,
          code: 'remote-tag-sha-mismatch',
          message: `Action \`${u.action}\` pins SHA \`${u.ref}\` with comment \`# ${u.tagComment}\`, but upstream tag \`${u.repo}@${u.tagComment}\` resolves to \`${resolvedSha}\`.`
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    rootDir,
    auditedWorkflows,
    actionCount: allUses.length,
    pagesBundleFilesChecked: pagesCheckedPaths.length,
    remoteTagChecks,
    errors,
    warnings
  };
}

function collectAllRepoWorkflowUses(rootDir) {
  const workflowsDir = path.join(rootDir, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(workflowsDir).filter((n) => /\.ya?ml$/i.test(n))) {
    const rel = `.github/workflows/${entry}`;
    out.push(...extractActionUses(fs.readFileSync(path.join(workflowsDir, entry), 'utf8'), rel));
  }
  return out;
}

function parseCliArgs(argv) {
  const opts = {
    rootDir: process.cwd(),
    files: [],
    verifyRemoteTags: false,
    skipPagesBundle: false,
    json: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root' && i + 1 < argv.length) {
      opts.rootDir = argv[++i];
    } else if (arg === '--files' && i + 1 < argv.length) {
      opts.files = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === '--verify-remote-tags') {
      opts.verifyRemoteTags = true;
    } else if (arg === '--skip-pages-bundle') {
      opts.skipPagesBundle = true;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '-h' || arg === '--help') {
      console.log(
        'Usage: node scripts/verify-workflows.mjs [--root <dir>] [--files a,b] [--verify-remote-tags] [--skip-pages-bundle] [--json]'
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return opts;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const opts = parseCliArgs(process.argv.slice(2));
  const report = verifyRepositoryWorkflows(opts);
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `[verify-workflows] Audited ${report.auditedWorkflows.length} workflow(s), ${report.actionCount} action pin(s), ${report.pagesBundleFilesChecked} Pages bundle file(s).`
    );
    if (report.remoteTagChecks.length > 0) {
      const ok = report.remoteTagChecks.filter((c) => c.matched).length;
      console.log(`[verify-workflows] Verified ${ok}/${report.remoteTagChecks.length} upstream tag-to-SHA pin(s).`);
    }
    for (const w of report.warnings) {
      console.warn(`[WARN] ${w.file}${w.line ? `:${w.line}` : ''} [${w.code}] ${w.message}`);
    }
    for (const e of report.errors) {
      console.error(`[FAIL] ${e.file}${e.line ? `:${e.line}` : ''} [${e.code}] ${e.message}`);
    }
    if (report.valid) {
      console.log('[verify-workflows] PASS — all workflow and supply-chain integrity checks passed.');
    }
  }
  process.exit(report.valid ? 0 : 1);
}
