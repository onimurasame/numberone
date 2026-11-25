import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  atomicWriteFileSync,
  ensureDir,
  isWritablePathConfinedToRoot
} from '../utils/fs-helpers.js';

const BEGIN_MARKER = '<!-- NUMBERONE:BEGIN -->';
const END_MARKER = '<!-- NUMBERONE:END -->';

export interface ShimInstallResult {
  updatedFiles: string[];
}

function resolveMcpCommand(workspaceRoot: string): { command: string; args: string[] } {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(thisDir, '../cli.js'),
    path.resolve(thisDir, '../../dist/cli.js')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return {
        command: process.execPath,
        args: [candidate, 'mcp', '--workspace', workspaceRoot]
      };
    }
  }
  return {
    command: 'numberone',
    args: ['mcp', '--workspace', workspaceRoot]
  };
}

function buildAuthoritativeShimBlock(workspaceName: string): string {
  return [
    BEGIN_MARKER,
    `## Number One — System of Record (${workspaceName})`,
    '',
    'This workspace maintains an event-sourced System of Record in `.numberone/`.',
    '',
    '### Precedence & Workflow Rules',
    '1. **SoR Invariants (`L1`) and Active Directives (`L2`) supersede local session context (`L4`)** whenever they conflict.',
    '2. **Consult institutional memory before changing files**: run `n1 brief` / `n1 consult` (or MCP `get_authoritative_brief` / `consult_number_one`) to avoid repeating documented dead ends.',
    '3. **Arbitrate high-impact changes**: run `n1 arbitrate` (or MCP `arbitrate_action`) and `n1 party` before architectural, security, infrastructure, or release changes.',
    '4. **Record intermediate context**: log rejected approaches (`n1 dead-end`), reasoning (`n1 think`), lessons (`n1 lesson`), and decisions (`n1 decision`).',
    '5. **Run verification commands via `n1 exec -- <cmd>`** so crashes and subsequent fixes are correlated into verified lessons.',
    END_MARKER
  ].join('\n');
}

function upsertManagedSection(
  workspaceRoot: string,
  filePath: string,
  section: string,
  headerIfNew: string
): void {
  if (!isWritablePathConfinedToRoot(workspaceRoot, filePath)) {
    throw new Error(`Refusing to write shim through symlink or outside workspace: ${filePath}`);
  }
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) {
    atomicWriteFileSync(filePath, `${headerIfNew}\n\n${section}\n`);
    return;
  }
  const existing = fs.readFileSync(filePath, 'utf8');
  const beginIdx = existing.indexOf(BEGIN_MARKER);
  const endIdx = existing.indexOf(END_MARKER);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const updated =
      existing.slice(0, beginIdx) + section + existing.slice(endIdx + END_MARKER.length);
    atomicWriteFileSync(filePath, updated);
  } else {
    atomicWriteFileSync(filePath, existing.trimEnd() + '\n\n' + section + '\n');
  }
}

export function installHarnessShims(
  workspaceRoot: string,
  workspaceName: string,
  targets: Array<'agents' | 'claude' | 'cursor' | 'copilot' | 'mcp'> = [
    'agents',
    'claude',
    'cursor',
    'copilot',
    'mcp'
  ]
): ShimInstallResult {
  const resolvedRoot = path.resolve(workspaceRoot);
  const updatedFiles: string[] = [];
  const block = buildAuthoritativeShimBlock(workspaceName);

  if (targets.includes('agents')) {
    const p = path.join(resolvedRoot, 'AGENTS.md');
    upsertManagedSection(resolvedRoot, p, block, '# Workspace Agent Instructions');
    updatedFiles.push('AGENTS.md');
  }

  if (targets.includes('claude')) {
    const p = path.join(resolvedRoot, 'CLAUDE.md');
    upsertManagedSection(resolvedRoot, p, block, '# Claude Code Workspace Instructions');
    updatedFiles.push('CLAUDE.md');
  }

  if (targets.includes('cursor')) {
    const p = path.join(resolvedRoot, '.cursor', 'rules', 'numberone.mdc');
    const frontmatter = [
      '---',
      'description: Number One System of Record & Crew Governance',
      'alwaysApply: true',
      '---'
    ].join('\n');
    upsertManagedSection(resolvedRoot, p, block, frontmatter);
    updatedFiles.push('.cursor/rules/numberone.mdc');
  }

  if (targets.includes('copilot')) {
    const p = path.join(resolvedRoot, '.github', 'copilot-instructions.md');
    upsertManagedSection(resolvedRoot, p, block, '# GitHub Copilot Workspace Instructions');
    updatedFiles.push('.github/copilot-instructions.md');
  }

  if (targets.includes('mcp')) {
    const p = path.join(resolvedRoot, '.mcp.json');
    if (!isWritablePathConfinedToRoot(resolvedRoot, p)) {
      throw new Error(`Refusing to write .mcp.json through symlink or outside workspace: ${p}`);
    }
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(p)) {
      try {
        existing = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
      } catch {
        existing = {};
      }
    }
    const mcpServers =
      existing.mcpServers && typeof existing.mcpServers === 'object'
        ? { ...(existing.mcpServers as Record<string, unknown>) }
        : {};
    mcpServers.numberone = resolveMcpCommand(resolvedRoot);
    existing.mcpServers = mcpServers;
    atomicWriteFileSync(p, JSON.stringify(existing, null, 2) + '\n');
    updatedFiles.push('.mcp.json');
  }

  return { updatedFiles };
}
