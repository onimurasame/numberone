(function () {
  'use strict';

  const ARCHIFY_ARTIFACTS = [
    {
      id: 'arch-overview',
      badge: 'architecture',
      label: 'System Overview',
      path: './archify/system-overview.html',
      caption: 'Master System of Record topology with 19 pinned src/ citations, Semantic Passports, and cross-diagram drilldowns.'
    },
    {
      id: 'arch-explainer',
      badge: 'explainer (4 styles)',
      label: '1-Page Explainer',
      path: './archify/how-numberone-works-explainer.html',
      caption: 'Conclusion-first interactive Explainer with live Clean / Editorial / Product / Swiss style switcher, @code tour, KPI chart, and checklist.'
    },
    {
      id: 'arch-story',
      badge: 'story + video',
      label: 'Narrated Walkthrough',
      path: './archify/system-overview-story.html',
      caption: 'Guided 3-scene audio/caption walkthrough with live edge tracing, pinned code highlights, and 1080p60 WebM/MP4 video export.'
    },
    {
      id: 'arch-stage',
      badge: 'choreography',
      label: 'Multi-View Stage',
      path: './archify/choreography-stage.html',
      caption: 'Declarative multi-diagram choreography morphing shared components across Architecture -> Party Workflow -> Dataflow with KPI deltas.'
    },
    {
      id: 'arch-workflow',
      badge: 'workflow v2',
      label: 'BMAD Party Workflow',
      path: './archify/bmad-party-workflow.html',
      caption: '3-Round BMAD Party Mode audit, deterministic Round 2 peer challenge verification, precedent correlation, and automatic L2 veto.'
    },
    {
      id: 'arch-sequence',
      badge: 'sequence',
      label: 'MCP Arbitration',
      path: './archify/mcp-arbitration-sequence.html',
      caption: 'Stdio JSON-RPC 2.0 MCP consultation, L1-L4 precedence arbitration, SHA-256 append, and Scrum sync with JSON payload samples.'
    },
    {
      id: 'arch-dataflow',
      badge: 'dataflow',
      label: 'Stream & Redaction',
      path: './archify/stream-sync-dataflow.html',
      caption: '5-stage data lineage from workspace sensors through O(n) secret redaction into events.jsonl, CAS blobs, and Scrum mirrors.'
    },
    {
      id: 'arch-lifecycle',
      badge: 'lifecycle v3',
      label: 'KPI Evolution',
      path: './archify/directive-evolution-lifecycle.html',
      caption: 'State machine of KPI-gated officer practice promotion (delta > 0), live regression auditing, and clean rollback.'
    },
    {
      id: 'arch-erd',
      badge: 'erd',
      label: 'Physical Data ERD',
      path: './archify/sor-data-model-erd.html',
      caption: 'Entity-relationship schema of stream_events, fallback_blobs, lessons, directives, issues, and sync_ledger.'
    },
    {
      id: 'arch-class',
      badge: 'class',
      label: 'TypeScript Classes',
      path: './archify/core-classes.html',
      caption: 'Object-oriented composition across NumberOneAgent, NumberOneMcpServer, StreamStore, PartyModeOrchestrator, and PersistenceFabric.'
    },
    {
      id: 'arch-tree',
      badge: 'tree',
      label: 'Capability Tree',
      path: './archify/repository-capability-tree.html',
      caption: 'Strict 6-package containment hierarchy of src/core, persistence, watchers, crew, harness, and utils.'
    },
    {
      id: 'arch-timeline',
      badge: 'timeline',
      label: 'Crash-to-Lesson',
      path: './archify/crash-to-lesson-timeline.html',
      caption: 'Proportional multi-lane timeline showing cross-harness crash capture, dead-end logging, harness handoff, and auto-lesson synthesis.'
    },
    {
      id: 'arch-waterfall',
      badge: 'waterfall',
      label: 'Execution Spans',
      path: './archify/party-sync-waterfall.html',
      caption: 'Millisecond span breakdown of ReplayEngine digest verification, 3 officer audits, Scrum push, and cryptographic verification.'
    },
    {
      id: 'arch-compare',
      badge: 'compare',
      label: 'Architecture Diff',
      path: './archify/architecture-comparison.html',
      caption: 'Before/after architectural comparison contrasting a local-only baseline curator with Number One v1.0.0.'
    },
    {
      id: 'arch-diagnosis',
      badge: 'code-analysis',
      label: 'Code Diagnosis & 3D Atlas',
      path: './archify/code-analysis/repo.analysis.html',
      caption: 'Source-backed TypeScript repository diagnosis workbench with coupling metrics, radial star map, 3D dependency Atlas, and AI tasks.'
    }
  ];

  const HARNESS_GUIDES = [
    {
      id: 'generic',
      name: 'Generic / Harness-Agnostic (Zero MCP)',
      category: 'Universal',
      configFile: '.numberone/config.json + AGENTS.md + Git/Shell Hooks',
      summary: 'Works with ANY past, present, or future AI agent, web chat copy-paste workflow, or raw human terminal without requiring MCP.',
      snippet: '# 1. Attach workspace (creates .numberone/, chained Git hooks & shims)\nn1 attach .\n\n# 2. Start detached real-time filesystem watcher\nn1 watch\n\n# 3. Enable automatic terminal crash capture in ~/.bashrc or ~/.zshrc\neval "$(n1 shell-hook bash)"\n\n# 4. Wrap builds/tests for automatic Crash -> Fix lesson synthesis\nn1 exec -- npm test\n\n# 5. Ingest exported JSONL/Markdown chat transcripts anytime\nn1 ingest ./session-transcript.jsonl --harness custom-agent'
    },
    {
      id: 'claude-code',
      name: 'Claude Code (CLI & Desktop)',
      category: 'CLI / Desktop',
      configFile: '.mcp.json + CLAUDE.md + .claude/settings.json',
      summary: 'Native project-scoped MCP server registration plus automatic CLAUDE.md System of Record instructions.',
      snippet: '# Attach workspace & register project-scoped stdio MCP server\nn1 attach .\nclaude mcp add --scope project numberone -- n1 mcp --workspace .'
    },
    {
      id: 'codex',
      name: 'OpenAI Codex CLI',
      category: 'CLI',
      configFile: '~/.codex/config.toml + AGENTS.md',
      summary: 'Codex CLI loads AGENTS.md automatically and connects to Number One over stdio MCP.',
      snippet: '[mcp_servers.numberone]\ncommand = "n1"\nargs = ["mcp", "--workspace", "."]\nstartup_timeout_sec = 10\ntool_timeout_sec = 60'
    },
    {
      id: 'cursor',
      name: 'Cursor',
      category: 'IDE',
      configFile: '.cursor/mcp.json + .cursor/rules/numberone.mdc',
      summary: 'n1 attach creates always-applied .cursor/rules/numberone.mdc; add .cursor/mcp.json for all 12 MCP tools.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "${workspaceFolder}"]\n    }\n  }\n}'
    },
    {
      id: 'windsurf',
      name: 'Windsurf (Codeium)',
      category: 'IDE',
      configFile: '~/.codeium/windsurf/mcp_config.json + AGENTS.md',
      summary: 'Connects Windsurf Cascade directly to Number One stdio MCP tools and AGENTS.md rules.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "/absolute/path/to/workspace"]\n    }\n  }\n}'
    },
    {
      id: 'antigravity',
      name: 'Google Antigravity',
      category: 'Agentic IDE',
      configFile: 'mcpServers + AGENTS.md',
      summary: 'Antigravity discovers AGENTS.md automatically and pairs stdio MCP with background n1 watch.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "/absolute/path/to/workspace"]\n    }\n  }\n}'
    },
    {
      id: 'gemini-cli',
      name: 'Google Gemini CLI',
      category: 'CLI',
      configFile: '.gemini/settings.json + AGENTS.md',
      summary: 'Configure Gemini CLI settings.json to load AGENTS.md and trust the local Number One stdio server.',
      snippet: '{\n  "contextFileName": ["AGENTS.md", "GEMINI.md"],\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "."],\n      "trust": true\n    }\n  }\n}'
    },
    {
      id: 'copilot',
      name: 'GitHub Copilot (VS Code, JB & Coding Agent)',
      category: 'IDE / Cloud',
      configFile: '.vscode/mcp.json + .github/copilot-instructions.md',
      summary: 'n1 attach populates .github/copilot-instructions.md; .vscode/mcp.json wires Copilot Agent Mode.',
      snippet: '{\n  "servers": {\n    "numberone": {\n      "type": "stdio",\n      "command": "n1",\n      "args": ["mcp", "--workspace", "${workspaceFolder}"]\n    }\n  }\n}'
    },
    {
      id: 'cline',
      name: 'Cline',
      category: 'VS Code Ext',
      configFile: 'cline_mcp_settings.json + .clinerules',
      summary: 'Auto-approve read/arbitration tools in Cline while keeping L1-L3 stream protection active.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "/absolute/path/to/workspace"],\n      "autoApprove": ["get_authoritative_brief", "consult_number_one", "arbitrate_action", "verify_integrity"]\n    }\n  }\n}'
    },
    {
      id: 'roo-code',
      name: 'Roo Code',
      category: 'VS Code Ext',
      configFile: '.roo/mcp.json + AGENTS.md',
      summary: 'Workspace-scoped Roo Code MCP configuration with AGENTS.md rule discovery.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "${workspaceFolder}"]\n    }\n  }\n}'
    },
    {
      id: 'continue',
      name: 'Continue.dev',
      category: 'VS Code / JB',
      configFile: '.continue/config.yaml',
      summary: 'YAML MCP server block and authoritative rule enforcement for VS Code and JetBrains.',
      snippet: 'mcpServers:\n  - name: numberone\n    command: n1\n    args:\n      - mcp\n      - --workspace\n      - .'
    },
    {
      id: 'zed',
      name: 'Zed Editor',
      category: 'IDE',
      configFile: '.zed/settings.json + AGENTS.md',
      summary: 'Registers Number One as a custom Zed context_server alongside automatic AGENTS.md rules.',
      snippet: '{\n  "context_servers": {\n    "numberone": {\n      "source": "custom",\n      "command": "n1",\n      "args": ["mcp", "--workspace", "."]\n    }\n  }\n}'
    },
    {
      id: 'aider',
      name: 'Aider',
      category: 'CLI',
      configFile: '.aider.conf.yml',
      summary: 'Pairs .aider.conf.yml read rules with n1 watch and n1 exec for complete Git + test curation.',
      snippet: '# .aider.conf.yml\nread:\n  - AGENTS.md\nauto-commits: true\n\n# Launch Aider under Number One curation:\nn1 attach . && n1 watch && n1 exec -- aider'
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      category: 'CLI / TUI',
      configFile: 'opencode.json + AGENTS.md',
      summary: 'Native local MCP integration in opencode.json with automatic AGENTS.md loading.',
      snippet: '{\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": {\n    "numberone": {\n      "type": "local",\n      "command": ["n1", "mcp", "--workspace", "."],\n      "enabled": true\n    }\n  }\n}'
    },
    {
      id: 'goose',
      name: 'Goose (Block)',
      category: 'CLI / Desktop',
      configFile: '~/.config/goose/config.yaml',
      summary: 'Registers Number One as a stdio Goose extension.',
      snippet: 'extensions:\n  numberone:\n    name: Number One SoR\n    type: stdio\n    cmd: n1\n    args: [mcp, --workspace, .]\n    enabled: true'
    },
    {
      id: 'devin',
      name: 'Devin',
      category: 'Autonomous VM',
      configFile: 'AGENTS.md + Custom Stdio MCP',
      summary: 'Run n1 attach . && n1 watch in VM setup and connect Devin custom stdio MCP to n1 mcp.',
      snippet: '# Devin VM setup command:\nnpm install -g numberone && n1 attach . && n1 watch\n\n# Devin MCP Server:\n# Command: n1\n# Args: mcp --workspace /home/ubuntu/repos/<repo>'
    },
    {
      id: 'amazon-q',
      name: 'Amazon Q Developer',
      category: 'CLI / IDE',
      configFile: '.amazonq/mcp.json + .amazonq/rules/numberone.md',
      summary: 'Workspace MCP configuration and rule symlink for Amazon Q Developer.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "."],\n      "timeout": 60000\n    }\n  }\n}'
    },
    {
      id: 'amp',
      name: 'Sourcegraph Amp',
      category: 'CLI / VS Code',
      configFile: 'settings.json (amp.mcpServers) + AGENTS.md',
      summary: 'Amp loads AGENTS.md natively and connects via amp.mcpServers.',
      snippet: '{\n  "amp.mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "."]\n    }\n  }\n}'
    },
    {
      id: 'junie',
      name: 'JetBrains AI & Junie',
      category: 'JetBrains IDE',
      configFile: '.junie/guidelines.md + JetBrains MCP',
      summary: 'Symlink .junie/guidelines.md to AGENTS.md and add Number One in JetBrains MCP settings.',
      snippet: 'mkdir -p .junie && ln -sf ../AGENTS.md .junie/guidelines.md\n# Then add n1 mcp --workspace <path> in Settings -> Tools -> AI Assistant -> MCP'
    },
    {
      id: 'trae-void-kilo',
      name: 'Trae / PearAI / Void / Kilo Code',
      category: 'IDE',
      configFile: '.trae/mcp.json | .kilocode/mcp.json | Void MCP',
      summary: 'Standard mcpServers stdio configuration shared across Trae, Void, PearAI, and Kilo Code.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "."]\n    }\n  }\n}'
    },
    {
      id: 'neovim-emacs',
      name: 'Neovim & Emacs (mcphub.nvim / mcp.el)',
      category: 'Editor',
      configFile: '~/.config/mcphub/servers.json | init.el',
      summary: 'Works natively with mcphub.nvim, codecompanion.nvim, avante.nvim, and Emacs mcp.el + gptel.',
      snippet: '// ~/.config/mcphub/servers.json\n{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "."]\n    }\n  }\n}'
    },
    {
      id: 'onprem-airgap',
      name: 'On-Premises: Air-Gapped Offline Bundle',
      category: 'On-Premises',
      configFile: '/opt/numberone + SHA-256 Manifest',
      summary: 'Zero-network offline deployment bundling compiled dist/ and vendored zod across an air-gap diode.',
      snippet: '# Verify SHA-256 digest & install into /opt/numberone\nsha256sum -c numberone-1.0.0-airgap-bundle.tar.gz.sha256\nsudo mkdir -p /opt/numberone\nsudo tar -xzf numberone-1.0.0-airgap-bundle.tar.gz -C /opt/numberone\nsudo ln -sf /opt/numberone/dist/cli.js /usr/local/bin/n1\nn1 --version'
    },
    {
      id: 'onprem-docker',
      name: 'On-Premises: Hardened Docker / Rootless Podman',
      category: 'On-Premises',
      configFile: 'Dockerfile (--read-only --cap-drop=ALL --network=none)',
      summary: 'Runs under UID/GID mapping, read-only rootfs, zero Linux capabilities, tini PID 1, and zero network egress.',
      snippet: 'docker run --rm --network=none \\\n  --user "$(id -u):$(id -g)" \\\n  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \\\n  --cap-drop=ALL --security-opt=no-new-privileges \\\n  -v "$(pwd):/workspace" \\\n  numberone:1.0.0 party --workspace /workspace --topic "Enclave readiness"'
    },
    {
      id: 'onprem-ghes-jira',
      name: 'On-Premises: GHES + Jira DC + Self-Hosted vLLM',
      category: 'On-Premises',
      configFile: '.numberone/config.json + NODE_EXTRA_CA_CERTS',
      summary: 'Connects to internal GitHub Enterprise Server, Jira Data Center, and self-hosted vLLM/Ollama behind corporate PKI.',
      snippet: 'export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/corp-root-ca.pem\n# .numberone/config.json excerpt:\n{\n  "persistence": {\n    "github": { "enabled": true, "owner": "eng", "repo": "core", "apiBaseUrl": "https://github.internal.example/api/v3", "tokenEnvVar": "GHES_PAT", "useGhCli": false },\n    "jira": { "enabled": true, "baseUrl": "https://jira.internal.example", "projectKey": "CORE", "emailEnvVar": "JIRA_EMAIL", "apiTokenEnvVar": "JIRA_PAT" }\n  },\n  "llm": { "provider": "openai-compatible", "baseUrl": "https://vllm.internal.example/v1", "model": "Qwen/Qwen2.5-Coder-32B-Instruct", "apiKeyEnvVar": "VLLM_API_KEY" }\n}'
    }
  ];

  const CODE_MODULES = [
    { group: 'core', path: 'src/core/types.ts', symbol: 'EVENT_TYPES, StreamEvent, WorkspaceProjection, NumberOneConfig', desc: '47 typed atomic event schemas, Zod runtime validators, projection entities, and configuration interfaces.' },
    { group: 'core', path: 'src/core/ulid.ts', symbol: 'generateUlid(now?)', desc: 'Monotonic 26-char Crockford Base32 ULID generator (48-bit ms timestamp + 80-bit CSPRNG entropy).' },
    { group: 'core', path: 'src/core/hash.ts', symbol: 'canonicalJson, sha256Hex, hashObject, GENESIS_HASH', desc: 'Deterministic sorted-key JSON serialization (prototype-key safe) and SHA-256 hashing.' },
    { group: 'core', path: 'src/core/stream-store.ts', symbol: 'StreamStore', desc: 'Append-only JSONL event store (0o700/0o600), CAS fallback blobs, advisory locking, fsync durability, and chain verifier.' },
    { group: 'core', path: 'src/core/replay-engine.ts', symbol: 'ReplayEngine, applyEventToProjection, computeProjectionDigest', desc: 'Pure functional fold reconstructing WorkspaceProjection with snapshotDigest cache verification and time-travel.' },
    { group: 'core', path: 'src/core/lesson-engine.ts', symbol: 'LessonEngine', desc: 'Multi-signal lesson relevance scorer, dead-end matcher, and automatic crash-to-fix lesson correlator.' },
    { group: 'core', path: 'src/core/authority-engine.ts', symbol: 'AuthorityEngine, extractAffirmativeClauses', desc: 'Four-tier L1-L4 precedence arbitrator with affirmative-clause negation filtering and ReDoS-safe pattern checks.' },
    { group: 'core', path: 'src/core/documentary.ts', symbol: 'buildWorkspaceDocumentary', desc: 'Compiles chronological session chapters into a human-readable engineering documentary.' },
    { group: 'persistence', path: 'src/persistence/fabric.ts', symbol: 'PersistenceFabric', desc: 'Coordinates idempotent push/pull Scrum sync and distributed integrity checks across all adapters.' },
    { group: 'persistence', path: 'src/persistence/directory-adapter.ts', symbol: 'DirectoryPersistenceAdapter', desc: 'Air-gapped local, NFS, or Git-worktree Scrum/Kanban board adapter.' },
    { group: 'persistence', path: 'src/persistence/github-adapter.ts', symbol: 'GitHubPersistenceAdapter', desc: 'GitHub Issues + Projects v2 GraphQL + GHES adapter with lossless <!-- n1-meta --> footers.' },
    { group: 'persistence', path: 'src/persistence/jira-adapter.ts', symbol: 'JiraPersistenceAdapter', desc: 'Jira Cloud & Data Center REST v3 adapter with ADF rich text, Agile Sprints, and JQL search.' },
    { group: 'watchers', path: 'src/watchers/fs-watcher.ts', symbol: 'WorkspaceFsWatcher', desc: 'Debounced live filesystem watcher, unified diff generator, CAS snapshotting, and offline reconcile.' },
    { group: 'watchers', path: 'src/watchers/daemon.ts', symbol: 'WatcherDaemonManager', desc: 'Detached daemon lifecycle manager binding PIDs to /proc/<pid>/stat field-22 start ticks.' },
    { group: 'watchers', path: 'src/watchers/git-hooks.ts', symbol: 'installGitHooks, recordGitHookEvent, importGitHistory', desc: 'Worktree-safe non-clobbering chained Git lifecycle hooks and commit history bootstrap.' },
    { group: 'watchers', path: 'src/watchers/command-runner.ts', symbol: 'runWatchedCommand, generateShellHook', desc: 'Sanitized child command runner, UTF-8 ring buffers, crash signature extractor, and bash/zsh hooks.' },
    { group: 'watchers', path: 'src/watchers/transcript-ingestor.ts', symbol: 'ingestTranscriptFile', desc: 'Parses Claude Code, Codex, JSON, and Markdown transcripts into chat.turn, chat.thinking, and attempt.failed.' },
    { group: 'crew', path: 'src/crew/party-mode.ts', symbol: 'PartyModeOrchestrator, resolvePeerChallenges', desc: '3-Round BMAD Party Mode roundtable, deterministic peer challenge verifier, decision matrix, and L2 veto issuer.' },
    { group: 'crew', path: 'src/crew/engineering-officer.ts', symbol: 'EngineeringOfficer', desc: 'Audits runtime pinning, lockfiles, container hardening, .env.example, shutdown signals, and crash debt.' },
    { group: 'crew', path: 'src/crew/security-officer.ts', symbol: 'SecurityOfficer', desc: 'Audits secret leaks, SHA-pinned Actions, workflow permissions, code sinks, containers, and Dependabot.' },
    { group: 'crew', path: 'src/crew/bridge-officer.ts', symbol: 'BridgeOfficer', desc: 'Audits automated tests, stream pass rate, CI triggers, release automation, typecheck gates, and rollback scripts.' },
    { group: 'crew', path: 'src/crew/evolution-engine.ts', symbol: 'KnowledgeEvolutionEngine', desc: 'Promotes candidate officer practices ONLY when counterfactual or empirical proof shows KPI delta > 0.' },
    { group: 'harness', path: 'src/harness/number-one.ts', symbol: 'NumberOneAgent', desc: 'Unified programmatic facade orchestrating stream, replay, authority, crew, watchers, and persistence.' },
    { group: 'harness', path: 'src/harness/mcp-server.ts', symbol: 'NumberOneMcpServer', desc: 'Zero-dependency stdio JSON-RPC 2.0 MCP server (12 tools, 4 resources, 2 MB pre-decode cap, L4 boundary).' },
    { group: 'harness', path: 'src/harness/shims.ts', symbol: 'installHarnessShims', desc: 'Idempotently injects marker-fenced SoR instructions into AGENTS.md, CLAUDE.md, Cursor, Copilot, and .mcp.json.' },
    { group: 'utils', path: 'src/utils/redactor.ts', symbol: 'redactSecrets, redactObjectDeep, buildSanitizedChildEnv', desc: 'Linear-time O(n) secret token scrubber, prototype-key guard, and child environment sanitizer.' },
    { group: 'utils', path: 'src/utils/safe-regex.ts', symbol: 'validateRegexSafety, testSafeRegex, matchGlobLinear', desc: 'Static ReDoS detector rejecting nested quantifiers/backreferences plus O(N*M) linear glob matcher.' },
    { group: 'utils', path: 'src/utils/http.ts', symbol: 'validateHttpUrl, resolveScopedEnvVar, resilientFetch', desc: 'SSRF private/metadata IP blocker, origin-bound credential resolver, bounded reads, and jittered retries.' },
    { group: 'utils', path: 'src/utils/lock.ts', symbol: 'withFileLockSync, withFileLockAsync, readProcStartTicks', desc: 'Cross-process advisory locking via linkSync/O_EXCL, Atomics.wait sleep, and PID start-tick checks.' },
    { group: 'cli', path: 'src/cli.ts', symbol: 'parseCliArgs, runCli', desc: '24-subcommand POSIX CLI supporting human output and machine-readable --json envelopes.' }
  ];

  const GLOSSARY_TERMS = [
    { term: 'ADF (Atlassian Document Format)', cat: 'Persistence', def: 'Structured JSON rich-text schema required by Jira REST API v3; generated deterministically by toAdfDocument.' },
    { term: 'ADR (Architecture Decision Record)', cat: 'Memory', def: 'Immutable DecisionRecord capturing an architectural choice, rationale, rejected alternatives, and consequences.' },
    { term: 'Advisory Lock', cat: 'Concurrency', def: 'Cross-process lockfile in .numberone/locks/ acquired via atomic linkSync or O_CREAT|O_EXCL to serialize writers.' },
    { term: 'Affirmative Clause Extraction', cat: 'Authority', def: 'Parser in AuthorityEngine that strips negated compliance statements ("do not use eval") before checking forbiddenPatterns.' },
    { term: 'Append-Only Log', cat: 'Event Sourcing', def: 'Immutable storage pattern in .numberone/stream/events.jsonl where facts are only appended, never overwritten.' },
    { term: 'Arbitration', cat: 'Authority', def: 'Deterministic evaluation of a proposed action against L1-L4 precedence yielding APPROVE, APPROVE_WITH_CONDITIONS, OVERRIDE, or BLOCK.' },
    { term: 'Archify', cat: 'Visualization', def: 'Schema-validated visual compiler generating 10 native diagram types, 4-style Explainers, Story choreographies, Code Analysis, and PR Packs.' },
    { term: 'Artifact Provenance', cat: 'Supply Chain', def: 'SLSA OIDC cryptographic attestation (npm publish --provenance) linking a published package to its exact commit and CI workflow.' },
    { term: 'Atomic File Write', cat: 'POSIX', def: 'Crash-safe write pattern: unique temp file -> fsyncSync -> chmodSync -> atomic renameSync.' },
    { term: 'Atomics.wait', cat: 'Concurrency', def: 'SharedArrayBuffer sleep primitive used during lock contention to avoid CPU-burning spin loops.' },
    { term: 'Authority Hierarchy (L1 > L2 > L3 > L4)', cat: 'Authority', def: 'L1 Stream Invariants > L2 Number One Directives > L3 Officer Gates & Verified Lessons > L4 Ephemeral AI Session Context.' },
    { term: 'BMAD Party Mode', cat: 'Bridge Crew', def: '3-round collaborative protocol where Engineering, Security, and Bridge Officers audit, cross-verify peer challenges, and issue a joint ruling.' },
    { term: 'Bridge Officer', cat: 'Bridge Crew', def: 'Continuous Delivery specialist auditing tests, CI triggers, stream stability, release workflows, static gates, and rollback automation.' },
    { term: 'Canonical JSON', cat: 'Cryptography', def: 'Recursively key-sorted JSON serialization ensuring identical logical objects produce byte-identical SHA-256 hashes.' },
    { term: 'Capability Dropping (--cap-drop=ALL)', cat: 'Containers', def: 'Linux kernel control removing all privileged root capabilities from a container process.' },
    { term: 'Challenge Resolution', cat: 'Bridge Crew', def: 'Round 2 outcome in PartyModeOrchestrator classifying peer challenges as CONFIRMED, REBUTTED_BY_EVIDENCE, or ESCALATED.' },
    { term: 'Compaction (context.compacted)', cat: 'Harnesses', def: 'Truncation of an AI chat window at token limits; solved by persisting intermediate thinking, dead-ends, and lessons in .numberone.' },
    { term: 'Content-Addressed Storage (CAS)', cat: 'Storage', def: 'Blob store (.numberone/fallback/blobs/<sha256>.blob) where filename equals the SHA-256 hash of content.' },
    { term: 'Counterfactual Replay', cat: 'Evolution', def: 'Testing candidate officer practices on labeled compliant/violating virtual file maps to prove positive KPI delta > 0 before activation.' },
    { term: 'Crockford Base32', cat: 'Cryptography', def: '32-character unambiguous alphabet used to encode 128-bit ULIDs into 26 sortable characters.' },
    { term: 'Dead-End (attempt.failed)', cat: 'Memory', def: 'Recorded failed hypothesis or approach surfaced during consultation so future AI sessions never repeat it.' },
    { term: 'Deterministic Replay', cat: 'Event Sourcing', def: 'Property of ReplayEngine guaranteeing events[1..k] always fold to the exact same WorkspaceProjection and snapshotDigest.' },
    { term: 'Directive (DirectiveRecord)', cat: 'Authority', def: 'Scoped advisory, mandatory, or blocking rule carrying forbiddenPatterns and requiredPatterns enforced by AuthorityEngine.' },
    { term: 'Documentary (WorkspaceDocumentary)', cat: 'Memory', def: 'Chronological, chapter-structured Markdown narrative compiled from raw atomic stream events.' },
    { term: 'Drilldown', cat: 'Visualization', def: 'Archify cross-diagram navigation linking overview nodes to child HTML diagrams with automatic Back controls.' },
    { term: 'Engineering Officer', cat: 'Bridge Crew', def: 'Infrastructure & runtime specialist auditing version pinning, lockfiles, containers, config docs, shutdown handling, and crash debt.' },
    { term: 'EPIPE', cat: 'POSIX', def: 'Broken pipe signal/error handled gracefully in NumberOneMcpServer when an IDE closes stdio pipes.' },
    { term: 'Fallback Fields', cat: 'Persistence', def: 'Large blobs or rich SoR fields exceeding GitHub/Jira limits that remain intact in .numberone/fallback/blobs/ via n1://fallback/<sha256>.' },
    { term: 'fsync', cat: 'POSIX', def: 'Kernel system call flushing buffered file writes from volatile RAM to persistent disk media.' },
    { term: 'Genesis Hash (GENESIS_HASH)', cat: 'Cryptography', def: '64-zero hex string used as prevHash for sequence event #1 (workspace.attached).' },
    { term: 'GitHub Projects v2', cat: 'Persistence', def: 'GraphQL Scrum planning board integrated by GitHubPersistenceAdapter for automated item enrollment and status updates.' },
    { term: 'Harness-Agnostic', cat: 'Harnesses', def: 'Zero lock-in to any IDE or vendor; operates identically across 24+ harnesses via .numberone/, CLI, hooks, shims, and stdio MCP.' },
    { term: 'Hash Chain', cat: 'Cryptography', def: 'Tamper-evident chain where event k embeds prevHash = event[k-1].hash and computes SHA-256 over canonicalJson.' },
    { term: 'Intermediate Thinking (chat.thinking)', cat: 'Memory', def: 'Mid-task reasoning steps persisted to the stream so downstream sessions inherit why decisions were made.' },
    { term: 'JQL (Jira Query Language)', cat: 'Persistence', def: 'Query syntax used by JiraPersistenceAdapter to pull external Jira Scrum changes into the stream.' },
    { term: 'JSON-RPC 2.0', cat: 'Protocols', def: 'Stateless request/response framing protocol underlying MCP over newline-delimited stdio.' },
    { term: 'KPI (Key Performance Indicator)', cat: 'Evolution', def: '0..100 quantitative score per officer (runtime_readiness_score, security_posture_score, continuous_delivery_score).' },
    { term: 'L4 Privilege Boundary', cat: 'Security', def: 'MCP server enforcement blocking AI clients from forging privileged L1-L3 directives, officer promotions, or shell benchmarks.' },
    { term: 'Lesson Learned (LessonRecord)', cat: 'Memory', def: 'Structured record of problem, rootCause, failedApproaches, resolution, preventionRule, and errorSignatures.' },
    { term: 'MCP (Model Context Protocol)', cat: 'Protocols', def: 'Open standard connecting AI harnesses to Number One 12 tools and 4 numberone:// resources over stdio.' },
    { term: 'O_NOFOLLOW', cat: 'POSIX', def: 'POSIX open(2) flag rejecting symbolic links at the target path to prevent symlink-swap TOCTOU escapes.' },
    { term: 'PID Start Ticks (/proc/<pid>/stat)', cat: 'POSIX', def: 'Linux kernel clock-tick timestamp (field 22) bound to daemon.pid and lockfiles to prevent recycled-PID collisions.' },
    { term: 'Prototype Pollution', cat: 'Security', def: 'JavaScript object injection (__proto__, constructor, prototype) blocked globally by isSafeRecordKey.' },
    { term: 'Reconcile (n1 reconcile)', cat: 'Watchers', def: 'Diffing live workspace files against WorkspaceProjection to record manual edits made while n1 watch was stopped.' },
    { term: 'ReDoS (CWE-1333)', cat: 'Security', def: 'Catastrophic regex backtracking attack prevented by validateRegexSafety and O(N*M) matchGlobLinear.' },
    { term: 'Scoped Environment Variable', cat: 'Security', def: 'Origin-bound credential lookup (resolveScopedEnvVar) preventing config files from exfiltrating unrelated host env secrets.' },
    { term: 'Security Officer', cat: 'Bridge Crew', def: 'AppSec & supply-chain specialist auditing secrets, 40-char Action SHAs, permissions, code sinks, containers, and Dependabot.' },
    { term: 'Semantic Passport', cat: 'Visualization', def: 'Interactive Archify inspector showing node explanations, verified Git file/line citations, payloads, and child drilldowns.' },
    { term: 'Snapshot Digest (snapshotDigest)', cat: 'Cryptography', def: 'Canonical SHA-256 checksum inside projections/state.json verifying cache integrity before skipping full replay.' },
    { term: 'SoR (System of Record)', cat: 'Event Sourcing', def: 'Authoritative source of truth for workspace history, lessons, directives, issues, and officer posture.' },
    { term: 'SSRF (CWE-918)', cat: 'Security', def: 'Server-Side Request Forgery mitigated in resilientFetch by blocking RFC 1918, loopback, CGNAT, and 169.254.169.254 metadata IPs.' },
    { term: 'Sync Ledger', cat: 'Persistence', def: 'Local mapping table (.numberone/sync/ledger.json) linking local event ULIDs to remote Directory, GitHub, and Jira IDs.' },
    { term: 'Time-Travel Replay', cat: 'Event Sourcing', def: 'Rebuilding WorkspaceProjection at any historical --until-seq or --until-timestamp without mutating current state.' },
    { term: 'ULID', cat: 'Cryptography', def: '128-bit Universally Unique Lexicographically Sortable Identifier ordering stream events chronologically.' },
    { term: 'Veto (crew.veto)', cat: 'Bridge Crew', def: 'Critical officer block during Party Mode that automatically issues an active L2 blocking directive.' }
  ];

  // 1. Theme Toggle
  const themeBtn = document.getElementById('theme-toggle-btn');
  const savedTheme = localStorage.getItem('n1-docs-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
  function syncThemeLabel() {
    if (!themeBtn) return;
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    themeBtn.textContent = cur === 'dark' ? 'Light Theme' : 'Dark Theme';
  }
  syncThemeLabel();
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('n1-docs-theme', next);
      syncThemeLabel();
    });
  }

  // 2. Archify Interactive Theater
  const tabsContainer = document.getElementById('archify-tabs');
  const stageFrame = document.getElementById('archify-stage-frame');
  const stageCaption = document.getElementById('archify-stage-caption');
  const stageOpenLink = document.getElementById('archify-open-full');
  let activeArtifactId = ARCHIFY_ARTIFACTS[0].id;

  function selectArtifact(art) {
    activeArtifactId = art.id;
    if (stageFrame) stageFrame.src = art.path;
    if (stageCaption) stageCaption.textContent = art.caption;
    if (stageOpenLink) stageOpenLink.href = art.path;
    if (tabsContainer) {
      Array.from(tabsContainer.children).forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-art-id') === art.id);
      });
    }
  }

  if (tabsContainer) {
    ARCHIFY_ARTIFACTS.forEach(function (art) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'artifact-tab' + (art.id === activeArtifactId ? ' active' : '');
      btn.setAttribute('data-art-id', art.id);
      btn.textContent = art.label + ' [' + art.badge + ']';
      btn.addEventListener('click', function () {
        selectArtifact(art);
      });
      tabsContainer.appendChild(btn);
    });
    selectArtifact(ARCHIFY_ARTIFACTS[0]);
  }

  // 3. Harness & On-Prem Configurator
  const harnessListEl = document.getElementById('harness-list');
  const harnessSearchEl = document.getElementById('harness-search');
  const harnessDetailEl = document.getElementById('harness-detail');
  let selectedHarness = HARNESS_GUIDES[0];

  function copyText(text, btn) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(function () {
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () {
        btn.textContent = prev;
      }, 1400);
    });
  }

  function renderHarnessDetail(item) {
    if (!harnessDetailEl) return;
    harnessDetailEl.textContent = '';

    const kicker = document.createElement('span');
    kicker.className = 'section-kicker';
    kicker.textContent = item.category + ' · ' + item.configFile;

    const title = document.createElement('h3');
    title.style.marginTop = '0.2rem';
    title.textContent = item.name;

    const desc = document.createElement('p');
    desc.style.color = 'var(--text-secondary)';
    desc.textContent = item.summary;

    const codePanel = document.createElement('div');
    codePanel.className = 'code-panel';

    const header = document.createElement('div');
    header.className = 'code-panel-header';
    const fileLabel = document.createElement('span');
    fileLabel.textContent = item.configFile;
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy Snippet';
    copyBtn.addEventListener('click', function () {
      copyText(item.snippet, copyBtn);
    });
    header.appendChild(fileLabel);
    header.appendChild(copyBtn);

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = item.snippet;
    pre.appendChild(code);

    codePanel.appendChild(header);
    codePanel.appendChild(pre);

    const verifyNote = document.createElement('p');
    verifyNote.style.fontSize = '0.86rem';
    verifyNote.style.color = 'var(--text-muted)';
    verifyNote.textContent = 'Verify after setup: run "n1 doctor && n1 verify --local-only && n1 brief" inside your attached workspace.';

    harnessDetailEl.appendChild(kicker);
    harnessDetailEl.appendChild(title);
    harnessDetailEl.appendChild(desc);
    harnessDetailEl.appendChild(codePanel);
    harnessDetailEl.appendChild(verifyNote);
  }

  function renderHarnessList(filterText) {
    if (!harnessListEl) return;
    harnessListEl.textContent = '';
    const q = (filterText || '').trim().toLowerCase();
    HARNESS_GUIDES.filter(function (h) {
      return !q || h.name.toLowerCase().includes(q) || h.category.toLowerCase().includes(q) || h.configFile.toLowerCase().includes(q);
    }).forEach(function (h) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'harness-btn' + (h.id === selectedHarness.id ? ' active' : '');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = h.name;
      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'harness-badge';
      badgeSpan.textContent = h.category;
      btn.appendChild(nameSpan);
      btn.appendChild(badgeSpan);
      btn.addEventListener('click', function () {
        selectedHarness = h;
        renderHarnessList(harnessSearchEl ? harnessSearchEl.value : '');
        renderHarnessDetail(h);
      });
      harnessListEl.appendChild(btn);
    });
  }

  if (harnessSearchEl) {
    harnessSearchEl.addEventListener('input', function () {
      renderHarnessList(harnessSearchEl.value);
    });
  }
  renderHarnessList('');
  renderHarnessDetail(selectedHarness);

  // 4. Code Reference Explorer
  const codeTableBody = document.getElementById('code-ref-tbody');
  const codeSearchEl = document.getElementById('code-ref-search');
  const codePillsEl = document.getElementById('code-ref-pills');
  let activeCodeGroup = 'all';

  function renderCodeTable() {
    if (!codeTableBody) return;
    codeTableBody.textContent = '';
    const q = (codeSearchEl ? codeSearchEl.value : '').trim().toLowerCase();
    CODE_MODULES.filter(function (m) {
      const groupOk = activeCodeGroup === 'all' || m.group === activeCodeGroup;
      const textOk = !q || m.path.toLowerCase().includes(q) || m.symbol.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q);
      return groupOk && textOk;
    }).forEach(function (m) {
      const tr = document.createElement('tr');
      const tdPath = document.createElement('td');
      const codePath = document.createElement('code');
      codePath.textContent = m.path;
      tdPath.appendChild(codePath);

      const tdSym = document.createElement('td');
      const codeSym = document.createElement('code');
      codeSym.textContent = m.symbol;
      tdSym.appendChild(codeSym);

      const tdDesc = document.createElement('td');
      tdDesc.textContent = m.desc;

      tr.appendChild(tdPath);
      tr.appendChild(tdSym);
      tr.appendChild(tdDesc);
      codeTableBody.appendChild(tr);
    });
  }

  if (codePillsEl) {
    ['all', 'core', 'persistence', 'watchers', 'crew', 'harness', 'utils', 'cli'].forEach(function (grp) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-pill' + (grp === activeCodeGroup ? ' active' : '');
      btn.textContent = grp;
      btn.addEventListener('click', function () {
        activeCodeGroup = grp;
        Array.from(codePillsEl.children).forEach(function (c) {
          c.classList.toggle('active', c.textContent === grp);
        });
        renderCodeTable();
      });
      codePillsEl.appendChild(btn);
    });
  }
  if (codeSearchEl) {
    codeSearchEl.addEventListener('input', renderCodeTable);
  }
  renderCodeTable();

  // 5. Live Searchable Glossary
  const glossaryListEl = document.getElementById('glossary-grid');
  const glossarySearchEl = document.getElementById('glossary-search');
  const glossaryCountEl = document.getElementById('glossary-count');

  function renderGlossary() {
    if (!glossaryListEl) return;
    glossaryListEl.textContent = '';
    const q = (glossarySearchEl ? glossarySearchEl.value : '').trim().toLowerCase();
    const filtered = GLOSSARY_TERMS.filter(function (g) {
      return !q || g.term.toLowerCase().includes(q) || g.cat.toLowerCase().includes(q) || g.def.toLowerCase().includes(q);
    });
    if (glossaryCountEl) {
      glossaryCountEl.textContent = filtered.length + ' terms shown';
    }
    filtered.forEach(function (g) {
      const card = document.createElement('article');
      card.className = 'glossary-item';

      const h4 = document.createElement('h4');
      h4.className = 'glossary-term';
      const tSpan = document.createElement('span');
      tSpan.textContent = g.term;
      const cSpan = document.createElement('span');
      cSpan.className = 'glossary-cat';
      cSpan.textContent = g.cat;
      h4.appendChild(tSpan);
      h4.appendChild(cSpan);

      const p = document.createElement('p');
      p.className = 'glossary-def';
      p.textContent = g.def;

      card.appendChild(h4);
      card.appendChild(p);
      glossaryListEl.appendChild(card);
    });
  }

  if (glossarySearchEl) {
    glossarySearchEl.addEventListener('input', renderGlossary);
  }
  renderGlossary();
})();
