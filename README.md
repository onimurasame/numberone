# Number One (`n1`)

**Harness-Agnostic, Event-Sourced Authoritative Workspace Curator, System of Record (SoR) & BMAD Party Mode Bridge Crew**

[![CI](https://github.com/onimurasame/numberone/actions/workflows/ci.yml/badge.svg)](https://github.com/onimurasame/numberone/actions/workflows/ci.yml)
[![CodeQL](https://github.com/onimurasame/numberone/actions/workflows/codeql.yml/badge.svg)](https://github.com/onimurasame/numberone/actions/workflows/codeql.yml)
[![Deploy Docs & Archify](https://github.com/onimurasame/numberone/actions/workflows/pages.yml/badge.svg)](https://onimurasame.github.io/numberone/)
[![License: MIT](https://img.shields.io/badge/License-MIT-059669.svg)](./LICENSE)
[![Node.js >= 22](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-d97706.svg)](./package.json)

> **Interactive Documentation & Archify Architecture Portal (GitHub Pages):**  
> **[https://onimurasame.github.io/numberone/](https://onimurasame.github.io/numberone/)**  
> Explore all 10 interactive Archify diagram viewers, the 4-style One-Page Explainer, Narrated Story Walkthrough (with 1080p60 WebM/MP4 export), Multi-View Choreography Stage, Source-Backed Code Analysis Workbench, Harness Configurator, Code Reference, and Live Searchable Glossary.

---

## Documentation Navigation

| Document | Scope |
|---|---|
| **[Interactive GitHub Pages Portal](https://onimurasame.github.io/numberone/)** | Hosted documentation + embedded Archify viewers, harness configurator, API browser & live glossary search |
| **[All-Harness & Generic Installation (`docs/INSTALLATION.md`)](./docs/INSTALLATION.md)** | Copy-paste setup for **24 AI coding harnesses** (Claude Code, Codex CLI, Cursor, Windsurf, Antigravity, Gemini CLI, Copilot, Cline, Roo Code, Continue, Zed, Aider, OpenCode, Goose, Devin, Amazon Q, Amp, Junie, Trae, PearAI/Void, Kilo Code, Neovim, Emacs, Kimi Work) + **Generic Harness-Agnostic** setup |
| **[On-Premises & Air-Gapped Guide (`docs/ONPREM.md`)](./docs/ONPREM.md)** | Offline tarball bundles, Artifactory/Nexus/Verdaccio, hardened Docker & rootless Podman (`--read-only --cap-drop=ALL`), `systemd`, Kubernetes `StatefulSet`/sidecars, GitHub Enterprise Server, Jira Data Center, vLLM/Ollama & corporate PKI |
| **[Complete Code & API Reference (`docs/CODE_REFERENCE.md`)](./docs/CODE_REFERENCE.md)** | Every module, class, method, interface, CLI subcommand/flag, MCP tool/resource, and all 47 `EventType` schemas across `src/` |
| **[Exhaustive Technical Glossary (`docs/GLOSSARY.md`)](./docs/GLOSSARY.md)** | Complete A–Z glossary defining every technical word, cryptographic primitive, POSIX flag, CWE/standard, Scrum concept, Archify term, and Number One primitive |
| **[Archify Visual Suite Guide (`docs/ARCHIFY_GUIDE.md`)](./docs/ARCHIFY_GUIDE.md)** | Guide to all 10 native Archify diagram types + Explainer, Story Walkthrough, Choreography Stage, Architecture Compare, Code Analysis & PR Pack |

---

## Table of Contents

1. [Why Number One Exists](#1-why-number-one-exists)
2. [Master System Architecture (Archify Overview)](#2-master-system-architecture-archify-overview)
3. [How Everything Works — Deep Architectural Specification](#3-how-everything-works--deep-architectural-specification)
   - [3.1 Physical `.numberone/` Layout, POSIX Confinement & Advisory Locking](#31-physical-numberone-layout-posix-confinement--advisory-locking)
   - [3.2 Cryptographic Append-Only Event Stream (`StreamStore`)](#32-cryptographic-append-only-event-stream-streamstore)
   - [3.3 Linear-Time Secret Redaction & Content-Addressed Fallback Blobs](#33-linear-time-secret-redaction--content-addressed-fallback-blobs)
   - [3.4 Deterministic Event Replay, Snapshot Digests & Time-Travel (`ReplayEngine`)](#34-deterministic-event-replay-snapshot-digests--time-travel-replayengine)
   - [3.5 Authoritative Precedence (`L1`–`L4`) & Affirmative Arbitration (`AuthorityEngine`)](#35-authoritative-precedence-l1l4--affirmative-arbitration-authorityengine)
   - [3.6 Institutional Memory & Automatic Crash-to-Fix Lesson Synthesis (`LessonEngine`)](#36-institutional-memory--automatic-crash-to-fix-lesson-synthesis-lessonengine)
   - [3.7 Live Workspace Sensors: FS Watcher, Daemon, Git Hooks, `n1 exec` & Transcript Ingestor](#37-live-workspace-sensors-fs-watcher-daemon-git-hooks-n1-exec--transcript-ingestor)
   - [3.8 Model Context Protocol (`stdio` MCP) Server & `L4` Privilege Boundary](#38-model-context-protocol-stdio-mcp-server--l4-privilege-boundary)
   - [3.9 BMAD Party Mode Bridge Crew (`Engineering`, `Security` & `Bridge` Officers)](#39-bmad-party-mode-bridge-crew-engineering-security--bridge-officers)
   - [3.10 Empirically Verified KPI-Gated Continuous Evolution (`KnowledgeEvolutionEngine`)](#310-empirically-verified-kpi-gated-continuous-evolution-knowledgeevolutionengine)
   - [3.11 Distributed Scrum Persistence Fabric (`.numberone` + Directory + GitHub Projects v2 + Jira)](#311-distributed-scrum-persistence-fabric-numberone--directory--github-projects-v2--jira)
4. [Complete Archify Visual Gallery (All 10 Native Diagrams + Advanced Deliverables)](#4-complete-archify-visual-gallery-all-10-native-diagrams--advanced-deliverables)
5. [Installation: Quick Start, All 24 Harnesses, Generic & On-Premises](#5-installation-quick-start-all-24-harnesses-generic--on-premises)
6. [CLI Command & MCP Protocol Reference](#6-cli-command--mcp-protocol-reference)
7. [Core Codebase Map](#7-core-codebase-map)
8. [Essential Technical Glossary (Quick Reference)](#8-essential-technical-glossary-quick-reference)
9. [GitHub Platform Governance & Provisioning](#9-github-platform-governance--provisioning)

---

## 1. Why Number One Exists

Modern software engineering spans dozens of ephemeral AI chat windows, context compactions, competing coding harnesses (Claude Code, Codex, Cursor, Windsurf, Antigravity, Copilot, Zed, Aider), CI runners, and human developers. Whenever a session compacts or an engineer switches tools:
- **Intermediate reasoning (`chat.thinking`) vanishes** — only the final Git diff survives, erasing *why* alternatives were rejected.
- **Failed experiments (`attempt.failed`) are forgotten** — causing subsequent AI sessions to waste hours re-attempting the exact same broken polyfill, flag, or migration.
- **Crash root causes (`exec.crashed`) decouple from their fixes** — losing reusable prevention rules.
- **Prompt context (`L4`) drifts from architectural reality** — allowing compacted sessions to violate critical security, infrastructure, or release invariants.

**Number One (`n1`)** solves this permanently by attaching directly to the workspace as an **event-sourced System of Record (SoR)** and **authoritative overseer**:
1. **Watches Everything Like a Documentary**: Captures manual file saves, unified diffs, Git commits/merges/rebases, terminal crashes, AI transcripts, intermediate thoughts, dead-ends, Scrum issues, ADRs, and crew rulings as immutable, SHA-256 hash-chained `StreamEvent`s.
2. **Replays State Deterministically**: Any harness or human at any point in time can replay `.numberone/stream/events.jsonl` from event `#1` to reconstruct the exact `WorkspaceProjection` (or time-travel to any historical sequence/timestamp).
3. **Supersedes Ephemeral Session Context (`L1` > `L2` > `L3` > `L4`)**: Number One is authoritative. Blocking directives, verified institutional lessons, and unresolved crashes override conflicting chat assumptions.
4. **Assembles an Expert Bridge Crew (BMAD Party Mode)**: Convenes the **Engineering Officer**, **Security Officer**, and **Bridge Officer** to audit live workspace telemetry, cross-examine peer challenges against concrete evidence, and evolve their own rulebooks **only when factually proven (`delta > 0`) to increase each officer's main KPI**.
5. **Synchronizes Distributed Scrum Without Losing Fidelity**: Mirrors work items bidirectionally with **Directory/Worktree boards**, **GitHub Issues + Projects v2**, and **Jira Scrum** while preserving unsupported or oversized payloads in `.numberone/fallback/blobs/`.

---

## 2. Master System Architecture (Archify Overview)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/archify/system-overview-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/assets/archify/system-overview-light.svg">
  <img alt="Number One Master System Architecture" src="./docs/assets/archify/system-overview-light.svg" width="100%">
</picture>

> **Interactive Explorers**:  
> [Open Interactive Architecture Viewer](https://onimurasame.github.io/numberone/archify/system-overview.html) · [Open 4-Style One-Page Explainer](https://onimurasame.github.io/numberone/archify/how-numberone-works-explainer.html) · [Open Narrated Story + Video Exporter](https://onimurasame.github.io/numberone/archify/system-overview-story.html) · [Open Multi-View Choreography Stage](https://onimurasame.github.io/numberone/archify/choreography-stage.html) · [Open Source-Backed Code Analysis](https://onimurasame.github.io/numberone/archify/code-analysis/repo.analysis.html)

---

## 3. How Everything Works — Deep Architectural Specification

### 3.1 Physical `.numberone/` Layout, POSIX Confinement & Advisory Locking

When `n1 attach .` runs, `StreamStore.init()` initializes a confined `.numberone/` hierarchy at the workspace root:

```text
.numberone/                       # Mode 0o700 (owner rwx only)
├── config.json                   # Mode 0o600 — NumberOneConfig (mode, watcher, persistence, crew, llm)
├── daemon.pid                    # Detached watcher PID + Linux /proc/<pid>/stat field-22 startTicks
├── daemon.log                    # Background watcher operational log (gitignored)
├── locks/                        # Cross-process advisory lockfiles (stream-append.lock, sync-ledger.lock)
├── stream/
│   ├── events.jsonl              # Mode 0o600 — Append-only NDJSON log of SHA-256 chained StreamEvents
│   └── head.json                 # Mode 0o600 — Atomic StreamHead { seq, lastEventId, lastHash, updatedAt }
├── fallback/
│   └── blobs/
│       └── <sha256>.blob         # Mode 0o600 — Content-addressed snapshots, full diffs & crash logs
├── projections/
│   └── state.json                # Cached WorkspaceProjection guarded by canonical snapshotDigest (gitignored)
└── sync/
    └── ledger.json               # Mode 0o600 — Bidirectional mapping between event ULIDs and remote IDs
```

**Filesystem & Concurrency Hardening (`src/utils/fs-helpers.ts`, `src/utils/lock.ts`)**:
- **Symlink Escape Prevention**: Every read and write verifies `isPathConfinedToRoot` / `isWritablePathConfinedToRoot` via `fs.realpathSync` and opens descriptors with `fs.constants.O_NOFOLLOW` where supported by the OS kernel, neutralizing symlink-swap Time-of-Check to Time-of-Use (`TOCTOU`) attacks.
- **Crash-Safe Atomic Writes (`atomicWriteFileSync`)**: Metadata files (`config.json`, `head.json`, `state.json`, `ledger.json`) write to a unique sibling temporary file (`O_CREAT | O_EXCL`), flush kernel page buffers via `fs.fsyncSync(fd)`, apply mode bits, and atomically replace the destination via `fs.renameSync`.
- **PID-Reuse-Safe Advisory Locks (`withFileLockSync` / `withFileLockAsync`)**: Concurrent writers (for example, `n1 watch` running alongside an IDE `n1 mcp` server and a `post-commit` Git hook) serialize cleanly using atomic hardlink lock acquisition (`fs.linkSync` with `wx` fallback), zero-CPU thread sleep via `Atomics.wait`, and stale-lock eviction verified against both `process.kill(pid, 0)` and field 22 (`starttime` ticks) of `/proc/<pid>/stat`.

---

### 3.2 Cryptographic Append-Only Event Stream (`StreamStore`)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/archify/sor-data-model-erd-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/assets/archify/sor-data-model-erd-light.svg">
  <img alt="Number One Physical Stream and Projection ERD" src="./docs/assets/archify/sor-data-model-erd-light.svg" width="100%">
</picture>

Every workspace occurrence is recorded as one of **47 typed `StreamEvent`s** (`src/core/types.ts`). When `StreamStore.append(input)` executes:
1. **Monotonic ULID Assignment (`generateUlid`)**: Generates a 26-character Crockford Base32 ULID combining a 48-bit millisecond timestamp with 80 bits of `crypto.randomBytes` entropy. Within the same millisecond, the 80-bit random payload increments monotonically so lexicographical sort order always matches causal arrival order.
2. **Tip Cross-Verification (`getHead`)**: Reads `stream/head.json` and cross-checks it against the physical final line of `stream/events.jsonl`. If a prior process crashed after appending to `events.jsonl` but before renaming `head.json`, `getHead()` self-heals `head.json` after verifying the tail event's `prevHash` and `hash`. If the tail line is corrupted JSON or fails SHA-256 verification, `StreamStore` **fails closed** with `Stream integrity violation` rather than building on tampered history.
3. **Canonical SHA-256 Hash Chaining (`computeEventHash`)**:
   - Event `#1` (`workspace.attached`) sets `prevHash = "0".repeat(64)` (`GENESIS_HASH`).
   - Event `#k` sets `prevHash = event[k - 1].hash`.
   - `canonicalJson(eventWithoutHash)` recursively sorts all object keys (filtering out `__proto__`, `constructor`, `prototype`) and computes `hash = SHA-256(canonicalJson(...))`.
   - Crucially, `storageManifest.remotes` is excluded from the hash input and stored in `sync/ledger.json`, so pushing an event to GitHub or Jira later **never alters historical event hashes**.
4. **Full Chain Verification (`n1 verify`)**: `StreamStore.verifyIntegrity()` streams `events.jsonl` from line 1 to tip, validating Zod schemas, contiguous `seq = 1..N`, unbroken `prevHash -> hash` links, `head.json` parity, and the SHA-256 digest of every referenced `.blob` file.

---

### 3.3 Linear-Time Secret Redaction & Content-Addressed Fallback Blobs

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/archify/stream-sync-dataflow-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/assets/archify/stream-sync-dataflow-light.svg">
  <img alt="Stream Ingestion, Secret Redaction and Distributed Sync Dataflow" src="./docs/assets/archify/stream-sync-dataflow-light.svg" width="100%">
</picture>

Before any `StreamEvent` or text `BlobRef` touches disk, `redactSecrets` and `redactObjectDeep` (`src/utils/redactor.ts`) scrub sensitive credentials in guaranteed `O(n)` linear time:
- **Scrubbed Token Classes**: AWS Access Keys (`AKIA*`, `ASIA*`), GitHub PATs (`ghp_*`, `github_pat_*`, `gho_*`, `ghs_*`, `ghu_*`), Slack tokens (`xox[baprs]-*`), Anthropic keys (`sk-ant-*`), OpenAI keys (`sk-*`), Google API keys (`AIza*`), Stripe live/restricted keys (`sk_live_*`, `rk_live_*`), three-part JWTs (`eyJ...`), PEM private keys (`-----BEGIN * PRIVATE KEY-----`), HTTP `Authorization: Bearer/Basic` headers, URL userinfo (`https://user:pass@host`), generic password/secret/token key-value pairs, and Azure Shared Access Signatures (`sig=...`).
- **Sensitive Filename Suppression (`isSensitiveSecretFile`)**: Files matching `.env*` (except `.env.example`/`.env.sample`/`.env.template`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `.npmrc`, `.pypirc`, `.netrc`, or `.aws/credentials` have their metadata tracked without ever snapshotting or diffing their raw contents.
- **Content-Addressed Storage (`storeBlob`)**: Large command logs, full unified diffs exceeding `maxInlineDiffBytes` (`16 KB` default), and file snapshots are stored once under `.numberone/fallback/blobs/<sha256>.blob` and addressed via `n1://fallback/<sha256>`.

---

### 3.4 Deterministic Event Replay, Snapshot Digests & Time-Travel (`ReplayEngine`)

`ReplayEngine` (`src/core/replay-engine.ts`) implements pure functional event sourcing:
- **Pure Reducer (`applyEventToProjection`)**: Takes `(state: WorkspaceProjection, event: StreamEvent)` and deterministically folds all 47 event types without reading wall-clock time, randomness, or live disk state.
- **Tamper-Evident Projection Cache (`computeProjectionDigest`)**: Cached `.numberone/projections/state.json` embeds `projectionVersion: 3` and `snapshotDigest` (canonical SHA-256 of the entire projection minus `rebuiltAt`). `getCurrentState()` returns the cached projection in `O(1)` **only** when `lastSeq` and `lastEventHash` match `StreamStore.getHead()` *and* recomputing `computeProjectionDigest` matches `snapshotDigest`. Any drift triggers a clean full replay from `seq #1`.
- **Forensic Time-Travel**: Run `n1 replay --until-seq 25` or `n1 replay --until-timestamp 2026-11-23T09:05:00Z` to inspect the exact state of files, open issues, active directives, and officer KPIs at any moment in project history.

---

### 3.5 Authoritative Precedence (`L1`–`L4`) & Affirmative Arbitration (`AuthorityEngine`)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/archify/mcp-arbitration-sequence-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/assets/archify/mcp-arbitration-sequence-light.svg">
  <img alt="MCP Consultation and L1-L4 Arbitration Sequence" src="./docs/assets/archify/mcp-arbitration-sequence-light.svg" width="100%">
</picture>

Number One resolves conflicts between ephemeral chat instructions and institutional truth using a strict four-tier hierarchy (`AuthorityEngine.PRECEDENCE` in `src/core/authority-engine.ts`):

1. **`L1_SOR_INVARIANT`**: Immutable cryptographic stream facts and unresolved critical runtime/test crashes on target files.
2. **`L2_NUMBER_ONE_DIRECTIVE`**: Active directives (`blocking`, `mandatory`, `advisory`) issued by `numberone` or Bridge Crew Party Mode vetoes.
3. **`L3_OFFICER_GATE`**: Specialist officer directives, verified `high`/`critical` Lesson Learned prevention rules, and active ADRs (`DecisionRecord`s).
4. **`L4_SESSION_CONTEXT`**: Ephemeral AI prompt assumptions, compacted chat summaries, or unverified plans.

**Affirmative Clause Analysis & ReDoS Immunity**:
- When an agent submits `n1 arbitrate --action "..."` (or calls MCP `arbitrate_action`), `extractAffirmativeClauses` splits the proposal into grammatical clauses and strips pure negative compliance statements (such as *"ensure we never call eval("*), while retaining mixed affirmative clauses (*"do not use helper X, instead call eval(input)"*).
- Every `forbiddenPatterns` and `requiredPatterns` expression is validated through `validateRegexSafety` (`src/utils/safe-regex.ts`), rejecting nested quantifiers (`(a+)+`), overlapping quantified alternations, backreferences, and lookbehinds so user- or AI-authored patterns execute in linear time with zero ReDoS risk.
- Verdict outcomes:
  - `APPROVE` (exit `0`) — No `L1`–`L3` conflicts.
  - `APPROVE_WITH_CONDITIONS` (exit `0`) — Approved with mandatory lessons/advisory warnings surfaced.
  - `OVERRIDE` (exit `3` in `strict` mode) — Mandatory `L2`/`L3` rule or repeated dead-end overrides the proposed approach.
  - `BLOCK` (exit `3`) — Blocked by an active `blocking` directive or unresolved critical `L1` crash.

---

### 3.6 Institutional Memory & Automatic Crash-to-Fix Lesson Synthesis (`LessonEngine`)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/archify/crash-to-lesson-timeline-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/assets/archify/crash-to-lesson-timeline-light.svg">
  <img alt="Cross-Harness Crash-to-Lesson Correlation Timeline" src="./docs/assets/archify/crash-to-lesson-timeline-light.svg" width="100%">
</picture>

`LessonEngine` (`src/core/lesson-engine.ts`) prevents teams and AI harnesses from ever reinventing the wheel:
- **Multi-Signal Lesson Retrieval (`findRelevantLessons`)**: Scores every non-superseded `LessonRecord` against a `ConsultationQuery` (`intent`, `targetPaths`, `errorText`, `command`, `tags`) using exact path matches (`+6`), directory prefix matches (`+3`), error-signature substring matches (`+8`), tag overlap (`+4`), normalized keyword overlap (`+1..+5`), verification bonus (`+2`), and severity weighting.
- **Dead-End Shield (`findRelevantFailedAttempts`)**: Surfaces prior `attempt.failed` entries touching the same files or problem space so a new session immediately sees what already failed and why.
- **Automatic Failure-to-Fix Correlation (`detectFailureToFixCorrelation`)**: Whenever `n1 exec -- <test/build>` transitions from an earlier `exec.failed` / `exec.crashed` to `exec.completed` (`exitCode === 0`), `LessonEngine` scans the causal window between the crash and the green run, collects all intermediate `fs.modified`/`fs.created`/`git.commit` paths and `attempt.failed` dead-ends, marks the crash resolved, and **automatically synthesizes a `lesson.captured` event** preserving the error signature and fix files!
- **Workspace Documentary (`buildWorkspaceDocumentary`)**: `n1 documentary` compiles raw stream events into chronological session chapters reading like an engineering documentary of every milestone, crash, dead-end, harness handoff, and ruling.

---

### 3.7 Live Workspace Sensors: FS Watcher, Daemon, Git Hooks, `n1 exec` & Transcript Ingestor

- **`WorkspaceFsWatcher` (`src/watchers/fs-watcher.ts`)**: Recursively monitors the workspace (honoring `.gitignore` + `.numberone` exclusions via linear-time `WorkspaceIgnore`), coalesces burst writes (`debounceMs: 250`), detects creations/modifications/deletions, computes bounded unified diffs (`computeUnifiedDiff`), snapshots text files into CAS blobs, and supports `n1 reconcile` to record edits made while the daemon was offline.
- **`WatcherDaemonManager` (`src/watchers/daemon.ts`)**: Manages detached background `n1 watch` processes, binding `.numberone/daemon.pid` to `/proc/<pid>/stat` start ticks and flushing pending file events cleanly on `SIGTERM` / `SIGINT`.
- **Chained Git Hooks (`src/watchers/git-hooks.ts`)**: Resolves `git rev-parse --git-path hooks` (compatible with standard repos, Git worktrees, and custom `core.hooksPath`) and chains `post-commit`, `post-checkout`, `post-merge`, `post-rewrite`, and `pre-push` without overwriting existing Husky or Lefthook scripts.
- **Watched Command Runner (`src/watchers/command-runner.ts`)**: `n1 exec -- <cmd>` strips leaked Number One/cloud tokens from child environments (`buildSanitizedChildEnv`), collects stdout/stderr in multi-byte UTF-8-safe bounded ring buffers (`BoundedOutputCollector`), handles timeouts with `SIGTERM` -> `SIGKILL` escalation, and pairs with `n1 shell-hook bash|zsh` for automatic interactive terminal crash capture.
- **Transcript Ingestor (`src/watchers/transcript-ingestor.ts`)**: `n1 ingest <file>` imports Claude Code JSONL, OpenAI/Codex JSONL, generic JSON arrays, and Markdown chat exports into `chat.turn`, `chat.thinking`, and `attempt.failed` events.

---

### 3.8 Model Context Protocol (`stdio` MCP) Server & `L4` Privilege Boundary

`NumberOneMcpServer` (`src/harness/mcp-server.ts`) implements **MCP `2024-11-05`** over `stdio` JSON-RPC 2.0 with zero external SDK bloat:
- **Memory & Pipe Safety**: Enforces `maxLineBytes = 2,000,000` on raw `Buffer` chunks *prior* to UTF-8 string decoding (preventing OOM DoS from malformed frames), pauses `stdin` during async request execution for backpressure, and traps `stdout` `EPIPE` cleanly when an IDE disconnects.
- **Strict `L4` Privilege Boundary**: An AI model connected over MCP operates at tier `L4`. Therefore:
  1. `record_stream_event` only accepts non-privileged telemetry types (`chat.turn`, `chat.thinking`, `attempt.failed`, `issue.opened`, `issue.updated`, `decision.recorded`) — preventing a prompt-injected model from forging raw `officer.knowledge.updated` or `directive.superseded` events.
  2. `issue_directive` over MCP is restricted to `severity: 'advisory'` (mandatory/blocking `L2` directives require Bridge Crew veto consensus or local operator CLI).
  3. `propose_officer_evolution` unconditionally sets `allowBenchmarkExec: false`, preventing arbitrary shell execution via MCP evolution payloads.

---

### 3.9 BMAD Party Mode Bridge Crew (`Engineering`, `Security` & `Bridge` Officers)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/archify/bmad-party-workflow-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/assets/archify/bmad-party-workflow-light.svg">
  <img alt="BMAD Party Mode 3-Round Audit and Challenge Workflow" src="./docs/assets/archify/bmad-party-workflow-light.svg" width="100%">
</picture>

When `n1 party --topic "..."` (or MCP `assemble_crew`) runs, `PartyModeOrchestrator` (`src/crew/party-mode.ts`) convenes three domain-specialist officers:

| Officer | Main KPI (`0..100`) | Audited Controls & Methodologies |
|---|---|---|
| **Engineering Officer** (`EngineeringOfficer`) | `runtime_readiness_score` | Runtime/engine version pinning (`engines`, `.nvmrc`, `rust-toolchain`, `go.mod`, `.python-version`), lockfile determinism, hardened multi-stage `Dockerfile` (`USER`, digest/tag pin, `.dockerignore`), `.env.example` config contract, graceful `SIGTERM`/`SIGINT`/`tini` handling, and zero unresolved runtime crash debt |
| **Security Officer** (`SecurityOfficer`) | `security_posture_score` | Source/config hardcoded credential scanning (skipping test fixtures & shell echo comments cleanly), `.gitignore` secret hygiene, dependency lockfile integrity, dangerous code execution sinks (`eval`, `new Function`), GitHub Actions **40-character commit SHA pinning** & minimal explicit `permissions:`, non-root/unprivileged containers, `SECURITY.md`, and Dependabot/Renovate automation (OWASP ASVS, SLSA, NIST SSDF) |
| **Bridge Officer** (`BridgeOfficer`) | `continuous_delivery_score` | Automated test suite & runner configuration, recent stream test pass rate, CI workflow triggered on `push`/`pull_request` executing real tests, automated release workflow or `CHANGELOG.md`, static typecheck/lint gates, executable rollback runbook/script (`scripts/rollback.sh`), and zero open release-blocking issues (DORA / Continuous Delivery) |

**Three-Round Party Mode Execution**:
1. **Round 1 — Independent Telemetry Assessment**: Each officer inspects real workspace files and `WorkspaceProjection`, computing weighted check scores, concrete `OfficerFinding[]` items, and cross-officer `PeerChallenge[]` questions (persisted as `crew.opinion` + `officer.kpi.measured`).
2. **Round 2 — Deterministic Peer Challenge Verification (`resolvePeerChallenges`)**: Every `PeerChallenge` is adjudicated against the challenged officer's actual check telemetry and findings:
   - `CONFIRMED` — Target officer's failed check or finding corroborates the risk.
   - `REBUTTED_BY_EVIDENCE` — Target officer's passing domain controls disprove the concern with named check IDs.
   - `ESCALATED` — Cross-cutting architectural concern flagged for explicit human/lead review.
3. **Round 3 — Precedent Correlation, Matrix & Veto Ruling**: Correlates findings with historical `LessonRecord`s and `failedAttempts`, builds the `OfficerDecisionRow[]` matrix and prioritized `P0`–`P3` `RemediationItem[]` plan, and emits `crew.consensus` — or, if any officer found a `critical` defect, emits `crew.veto` and **automatically issues an active `L2` `blocking` directive** scoped to the affected paths!

---

### 3.10 Empirically Verified KPI-Gated Continuous Evolution (`KnowledgeEvolutionEngine`)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/archify/directive-evolution-lifecycle-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/assets/archify/directive-evolution-lifecycle-light.svg">
  <img alt="KPI-Gated Officer Knowledge Evolution Lifecycle" src="./docs/assets/archify/directive-evolution-lifecycle-light.svg" width="100%">
</picture>

Bridge Crew officers continuously upgrade their rulebooks **without hallucination or prompt drift** via `KnowledgeEvolutionEngine` (`src/crew/evolution-engine.ts`):
1. **Safety Validation**: Candidate `KnowledgePractice` proposals must pass `KnowledgeUpdateProposalSchema` and linear-time `validateRegexSafety`.
2. **Counterfactual Virtual-File Proof (`counterfactual_replay`)**: Proposals include `VerificationSample[]` containing both **compliant** (`expectedViolation: false`) and **violating** (`expectedViolation: true`) virtual workspace file maps. `evaluatePracticeMatcherOnVirtualFiles` computes the officer's KPI discrimination score before and after adding the practice:
   - **Zero False Positives Required**: Must pass 100% of compliant samples.
   - **Positive KPI Delta Required (`delta > 0`)**: Must demonstrably catch violating samples that baseline practices missed, strictly increasing KPI sensitivity/score.
3. **Live Regression Auditing & Rollback**: `n1 evolve audit <role>` inspects `kpiHistory` in `WorkspaceProjection` to detect live score drops (`>= threshold`), and `n1 evolve revert <role> <practiceId>` cleanly deactivates regressed practices via `officer.knowledge.reverted`.

---

### 3.11 Distributed Scrum Persistence Fabric (`.numberone` + Directory + GitHub Projects v2 + Jira)

`PersistenceFabric` (`src/persistence/fabric.ts`) turns `.numberone/` and external Scrum trackers into **one distributed, always-integral System of Record**:
- **`.numberone/` Primary Fallback**: Every event and binary/log blob is persisted locally first. Fields that cannot fit remote schemas (`fallbackFields`, such as 50 MB crash logs, intermediate thinking arrays, or raw SHA-256 blob payloads) remain intact in `.numberone/fallback/blobs/` and are referenced inside remote tickets via `n1://fallback/<sha256>`.
- **Directory / Git-Worktree / NFS Scrum (`DirectoryPersistenceAdapter`)**: Writes atomic JSON + Markdown cards across `backlog/`, `in-progress/`, `blocked/`, `done/`, `lessons/`, `directives/`, `decisions/`, plus a rendered Kanban `board.md` — ideal for air-gapped teams or shared Git orphan worktrees.
- **GitHub Issues + Projects v2 (`GitHubPersistenceAdapter`)**: Auto-provisions 14 structured `n1:*` labels, embeds lossless `<!-- n1-meta:{...} -->` metadata footers in Issue bodies, adds issues to **GitHub Projects v2** boards via GraphQL (`addProjectV2ItemById`), and synchronizes Single-Select `Status` columns (`Todo` / `In Progress` / `Done`). Supports both `github.com` and **GitHub Enterprise Server (`apiBaseUrl`)**.
- **Jira Cloud & Data Center (`JiraPersistenceAdapter`)**: Formats descriptions in **Atlassian Document Format (`ADF`)**, maps `IssueRecord.kind` and `priority` to native Jira Issue Types and Priorities, tags officer components (`n1-engineering`, `n1-security`, `n1-bridge`), attaches issues to active Agile Sprints (`/rest/agile/1.0/board/{boardId}/sprint`), and pulls external human edits via JQL (`/rest/api/3/search/jql`).
- **Hardened HTTP Transport (`resilientFetch` in `src/utils/http.ts`)**: Blocks SSRF against RFC 1918 private IPs, loopback, CGNAT, and cloud metadata (`169.254.169.254`), binds credentials strictly to their configured HTTPS origin (`resolveScopedEnvVar`), caps response payloads (`maxResponseBytes`), and retries `429`/`502`/`503`/`504` with `Retry-After` + jittered exponential backoff.

---

## 4. Complete Archify Visual Gallery (All 10 Native Diagrams + Advanced Deliverables)

Every diagram below is generated from real committed TypeScript source in `docs/archify/specs/` and verified via Archify v3.3.0 `showcase` checks.

### Core TypeScript Class & Interface Composition (`class`)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/archify/core-classes-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/assets/archify/core-classes-light.svg">
  <img alt="Number One Core TypeScript Class Diagram" src="./docs/assets/archify/core-classes-light.svg" width="100%">
</picture>

### Repository & Capability Containment Hierarchy (`tree`)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/archify/repository-capability-tree-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/assets/archify/repository-capability-tree-light.svg">
  <img alt="Number One Repository Capability Tree" src="./docs/assets/archify/repository-capability-tree-light.svg" width="100%">
</picture>

### End-to-End Governance, Sync & Verification Span Timing (`waterfall`)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/archify/party-sync-waterfall-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/assets/archify/party-sync-waterfall-light.svg">
  <img alt="Governance Pipeline Execution Waterfall" src="./docs/assets/archify/party-sync-waterfall-light.svg" width="100%">
</picture>

### Multi-View Declarative Component Choreography (`story`)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/archify/choreography-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./docs/assets/archify/choreography-light.svg">
  <img alt="Number One Multi-View Story Choreography" src="./docs/assets/archify/choreography-light.svg" width="100%">
</picture>

### Interactive Archify Portal Index (`https://onimurasame.github.io/numberone/`)

| Archify Feature | Interactive Artifact | Highlights |
|---|---|---|
| **1. Architecture (`architecture`)** | [`system-overview.html`](https://onimurasame.github.io/numberone/archify/system-overview.html) | Trust boundaries, 19 source pins, Semantic Passports & cross-diagram drilldowns |
| **2. Workflow (`workflow` v2)** | [`bmad-party-workflow.html`](https://onimurasame.github.io/numberone/archify/bmad-party-workflow.html) | 3-Round BMAD Party Mode + `semanticChecks` reachability proof |
| **3. Sequence (`sequence`)** | [`mcp-arbitration-sequence.html`](https://onimurasame.github.io/numberone/archify/mcp-arbitration-sequence.html) | MCP `stdio` JSON-RPC consultation, arbitration & sample payloads |
| **4. Data Flow (`dataflow`)** | [`stream-sync-dataflow.html`](https://onimurasame.github.io/numberone/archify/stream-sync-dataflow.html) | `O(n)` redaction -> SHA-256 JSONL -> CAS blobs -> Scrum mirrors |
| **5. Lifecycle (`lifecycle` v3)** | [`directive-evolution-lifecycle.html`](https://onimurasame.github.io/numberone/archify/directive-evolution-lifecycle.html) | KPI-gated practice promotion, regression detection & rollback |
| **6. Data Model (`erd`)** | [`sor-data-model-erd.html`](https://onimurasame.github.io/numberone/archify/sor-data-model-erd.html) | `stream_events`, `fallback_blobs`, `lessons`, `directives`, `issues`, `sync_ledger` |
| **7. Class Model (`class`)** | [`core-classes.html`](https://onimurasame.github.io/numberone/archify/core-classes.html) | `NumberOneAgent` composition & `BaseBridgeOfficer` / `PersistenceAdapter` contracts |
| **8. Capability Tree (`tree`)** | [`repository-capability-tree.html`](https://onimurasame.github.io/numberone/archify/repository-capability-tree.html) | 6-package `src/` containment hierarchy |
| **9. Incident Timeline (`timeline`)** | [`crash-to-lesson-timeline.html`](https://onimurasame.github.io/numberone/archify/crash-to-lesson-timeline.html) | Cross-harness crash -> dead-end -> fix -> auto-lesson timeline |
| **10. Span Waterfall (`waterfall`)** | [`party-sync-waterfall.html`](https://onimurasame.github.io/numberone/archify/party-sync-waterfall.html) | `n1 party` + `n1 sync` + `n1 verify` span timing breakdown |
| **11. 4-Style Explainer (`explainer`)** | [`how-numberone-works-explainer.html`](https://onimurasame.github.io/numberone/archify/how-numberone-works-explainer.html) | Live `clean` / `editorial` / `product` / `swiss` switcher, `@code` tour & checklist |
| **12. Guided Story + Video (`story attach`)** | [`system-overview-story.html`](https://onimurasame.github.io/numberone/archify/system-overview-story.html) | Narrated 3-scene walkthrough + 1080p60 WebM/MP4 video export |
| **13. Choreography Stage (`story stage`)** | [`choreography-stage.html`](https://onimurasame.github.io/numberone/archify/choreography-stage.html) | Cross-diagram morphing (`architecture` -> `workflow` -> `dataflow`) + KPI deltas |
| **14. Architecture Diff (`compare`)** | [`architecture-comparison.html`](https://onimurasame.github.io/numberone/archify/architecture-comparison.html) | Before/after diff vs. local-only baseline curator |
| **15. Code Analysis (`code-analysis`)** | [`code-analysis/repo.analysis.html`](https://onimurasame.github.io/numberone/archify/code-analysis/repo.analysis.html) | Source-backed TypeScript coupling, radial star map, 3D Atlas & AI tasks |
| **16. PR Walkthrough Pack (`archify-pr`)** | [`pr-pack/views/topology.html`](https://onimurasame.github.io/numberone/archify/pr-pack/views/topology.html) | Change-marked PR architecture, sequence & schema review pack |

---

## 5. Installation: Quick Start, All 24 Harnesses, Generic & On-Premises

### 60-Second Quick Start

```bash
# 1. Install globally (Node.js >= 22.0.0)
npm install -g numberone

# 2. Attach Number One to any project workspace
cd /path/to/your/workspace
n1 attach .

# 3. Start real-time background filesystem watcher
n1 watch

# 4. Inspect authoritative SoR brief & run 3-officer BMAD Party Mode audit
n1 brief
n1 party --topic "Production, security & continuous delivery readiness"
```

### Market AI Harness Quick-Configuration Matrix (Full Details in [`docs/INSTALLATION.md`](./docs/INSTALLATION.md))

Every `n1 attach .` run automatically installs universal instruction shims (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/numberone.mdc`, `.github/copilot-instructions.md`, `.mcp.json`). Connect any harness to `n1 mcp --workspace <path>`:

| Harness | MCP Configuration File / Command | Rule / Shim File |
|---|---|---|
| **Claude Code (CLI & Desktop)** | `claude mcp add --scope project numberone -- n1 mcp --workspace .` (`.mcp.json`) | `CLAUDE.md` |
| **OpenAI Codex CLI** | `codex mcp add numberone -- n1 mcp --workspace .` (`~/.codex/config.toml`) | `AGENTS.md` |
| **Cursor** | `.cursor/mcp.json` (`"command": "n1", "args": ["mcp", "--workspace", "${workspaceFolder}"]`) | `.cursor/rules/numberone.mdc` |
| **Windsurf (Codeium)** | `~/.codeium/windsurf/mcp_config.json` | `AGENTS.md` / `.windsurfrules` |
| **Google Antigravity** | MCP `mcpServers.numberone` (`n1 mcp --workspace <dir>`) | `AGENTS.md` |
| **Google Gemini CLI** | `~/.gemini/settings.json` (`mcpServers.numberone`) | `AGENTS.md` / `GEMINI.md` |
| **GitHub Copilot (VS Code / JB / Agent)** | `.vscode/mcp.json` (`servers.numberone` `type: "stdio"`) | `.github/copilot-instructions.md` |
| **Cline** | `cline_mcp_settings.json` (`mcpServers.numberone`) | `AGENTS.md` / `.clinerules` |
| **Roo Code** | `.roo/mcp.json` (`mcpServers.numberone`) | `AGENTS.md` / `.roorules` |
| **Continue.dev** | `.continue/config.yaml` (`mcpServers`) | `.continue/config.yaml#rules` |
| **Zed Editor** | `.zed/settings.json` (`context_servers.numberone`) | `AGENTS.md` / `.rules` |
| **Aider** | `n1 exec -- aider` + `n1 watch` | `.aider.conf.yml` (`read: [AGENTS.md]`) |
| **OpenCode** | `opencode.json` (`mcp.numberone.command: ["n1", "mcp", "--workspace", "."]`) | `AGENTS.md` |
| **Goose (Block)** | `~/.config/goose/config.yaml` (`extensions.numberone` `type: stdio`) | `AGENTS.md` |
| **Devin** | Custom Stdio MCP (`n1 mcp --workspace <repo>`) + `n1 watch` | `AGENTS.md` |
| **Amazon Q Developer** | `.amazonq/mcp.json` | `.amazonq/rules/numberone.md` |
| **Sourcegraph Amp** | `amp.mcpServers.numberone` in `settings.json` | `AGENTS.md` |
| **JetBrains AI & Junie** | JetBrains MCP Settings (`mcpServers.numberone`) | `.junie/guidelines.md` |
| **Trae** | `.trae/mcp.json` | `.trae/rules/` / `AGENTS.md` |
| **PearAI / Void / Kilo Code** | `.continue/config.yaml` / Void MCP / `.kilocode/mcp.json` | `AGENTS.md` |
| **Neovim / Emacs / Kimi Work** | `~/.config/mcphub/servers.json` / `mcp.el` / `stdio` JSON-RPC 2.0 | `AGENTS.md` |

### Generic Harness-Agnostic Mode (Zero MCP Required)
Works with **any** CLI tool, web chat workflow, custom agent, or human-only terminal:
```bash
n1 attach .                        # Initializes .numberone/, Git hooks, and Markdown shims
n1 watch                           # Streams every file edit & unified diff in the background
eval "$(n1 shell-hook bash)"       # Automatically records interactive terminal crashes (or zsh)
n1 exec -- npm test                # Wraps commands & auto-synthesizes Crash -> Fix lessons
n1 ingest ./chat-export.jsonl      # Ingests offline transcripts from any external AI chat
```

### On-Premises, Regulated & Air-Gapped Enterprise Mode (Full Guide in [`docs/ONPREM.md`](./docs/ONPREM.md))
- **100% Zero-Egress Core**: Runs completely offline (`--network=none`) with a single vendored dependency (`zod`) and shared Git-worktree/NFS Scrum boards (`DirectoryPersistenceAdapter`).
- **Hardened Container Execution (Docker & Rootless Podman)**:
  ```bash
  docker build -t numberone:1.0.0 .
  docker run --rm --network=none --user "$(id -u):$(id -g)" \
    --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
    --cap-drop=ALL --security-opt=no-new-privileges \
    -v "$(pwd):/workspace" numberone:1.0.0 party --workspace /workspace --topic "Air-gap audit"
  ```
- **Self-Hosted Enterprise Integrations**: Native support for **GitHub Enterprise Server** (`apiBaseUrl`), **Jira Data Center / Server**, **vLLM / Ollama / TGI** (`openai-compatible` `baseUrl`), **`systemd`** sandboxing units, **Kubernetes `StatefulSet` sidecars**, and internal root CAs (`NODE_EXTRA_CA_CERTS`).

---

## 6. CLI Command & MCP Protocol Reference

### CLI Commands (`n1` / `numberone`)

| Category | Command | Purpose |
|---|---|---|
| **Lifecycle & Sensors** | `n1 attach [path]` | Initialize `.numberone/`, chained Git hooks, shims & optional Scrum adapters |
| | `n1 status` / `n1 doctor` | Inspect stream tip, daemon PID, officer KPIs & run health diagnostics |
| | `n1 watch [--foreground\|stop]` | Start/stop real-time debounced filesystem watcher |
| | `n1 reconcile` | Record offline manual file edits made while watcher was stopped |
| | `n1 exec -- <cmd...>` | Execute command with crash capture & auto-fix lesson correlation |
| | `n1 shell-hook [bash\|zsh]` | Print shell hook for automatic interactive terminal crash logging |
| | `n1 ingest <file>` | Ingest JSONL/JSON/Markdown AI chat transcripts into the stream |
| **Replay & Audit** | `n1 replay [--until-seq N]` | Deterministically rebuild `WorkspaceProjection` (or time-travel) |
| | `n1 verify [--local-only]` | Verify SHA-256 hash chain, CAS blobs, snapshot digest & remote mirrors |
| | `n1 documentary [--out F]` | Generate chronological chaptered Workspace Documentary markdown |
| **Memory & Authority** | `n1 brief [--paths p1,p2]` | Print authoritative System of Record brief |
| | `n1 consult --intent "..."` | Query ranked lessons learned, dead-ends, crashes & directives |
| | `n1 arbitrate --action "..."` | Evaluate proposed plan against `L1`–`L4` precedence (`0` ok, `3` blocked) |
| | `n1 think "<thought>"` | Record intermediate AI/human reasoning (`chat.thinking`) |
| | `n1 dead-end --approach "..."` | Record failed approach (`attempt.failed`) so it is never repeated |
| | `n1 lesson` / `n1 decision` | Record durable `LessonRecord` or `DecisionRecord` (ADR) |
| | `n1 directive` | Issue authoritative `advisory` / `mandatory` / `blocking` directive |
| | `n1 issue open\|resolve` | Manage Scrum work items synced across `.numberone`, GitHub & Jira |
| **Bridge Crew & Sync** | `n1 party --topic "..."` | Convene 3-round BMAD Party Mode roundtable (`0` consensus, `4` veto) |
| | `n1 officer <role>` | Run single officer (`engineering` \| `security` \| `bridge`) assessment |
| | `n1 evolve [--file\|audit\|revert]` | Submit KPI-proven practice update (`delta > 0`), audit drops, or revert |
| | `n1 sync [push\|pull\|both]` | Synchronize distributed Scrum state with Directory, GitHub & Jira |
| | `n1 shims` / `n1 mcp` | Refresh harness shims or start `stdio` JSON-RPC 2.0 MCP server |

### MCP Tools & Resources (`n1 mcp`)

- **12 Tools**: `get_authoritative_brief`, `consult_number_one`, `arbitrate_action`, `record_stream_event`, `capture_lesson`, `issue_directive`, `replay_workspace_state`, `get_documentary`, `assemble_crew`, `propose_officer_evolution`, `sync_persistence`, `verify_integrity`.
- **4 Resources**: `numberone://brief` (`text/markdown`), `numberone://state` (`application/json`), `numberone://documentary` (`text/markdown`), `numberone://lessons` (`application/json`).

---

## 7. Core Codebase Map

Full signature-level documentation is maintained in [`docs/CODE_REFERENCE.md`](./docs/CODE_REFERENCE.md).

```text
src/
├── index.ts                        # Public TypeScript ESM library exports
├── cli.ts                          # 24-command POSIX CLI parser & runner (n1 / numberone)
├── core/
│   ├── types.ts                    # 47 EventTypes, Zod schemas, WorkspaceProjection & config types
│   ├── ulid.ts                     # Monotonic 128-bit Crockford Base32 ULID generator
│   ├── hash.ts                     # Canonical JSON serializer & SHA-256 primitives
│   ├── stream-store.ts             # Append-only SHA-256 JSONL store, CAS blobs & chain verifier
│   ├── replay-engine.ts            # Pure deterministic fold engine & snapshotDigest cache guard
│   ├── lesson-engine.ts            # Relevance scorer, dead-end matcher & crash-to-fix correlator
│   ├── authority-engine.ts         # L1-L4 precedence gate & affirmative-clause arbitrator
│   └── documentary.ts              # Chronological chaptered Workspace Documentary compiler
├── persistence/
│   ├── types.ts                    # PersistenceAdapter, SyncLedger & integrity contracts
│   ├── fabric.ts                   # Bidirectional push/pull coordinator & fallback manager
│   ├── directory-adapter.ts        # Zero-network local / Git-worktree / NFS Kanban Scrum adapter
│   ├── github-adapter.ts           # GitHub Issues + Projects v2 GraphQL + GHES adapter
│   └── jira-adapter.ts             # Jira REST v3 + ADF + Agile Sprints + JQL adapter
├── watchers/
│   ├── fs-watcher.ts               # Real-time debounced FS sensor, unified diffs & offline reconcile
│   ├── daemon.ts                   # Detached daemon manager with /proc/<pid>/stat tick verification
│   ├── git-hooks.ts                # Non-clobbering chained Git lifecycle hooks & history importer
│   ├── command-runner.ts           # Sanitized child runner, UTF-8 ring buffers & shell crash hooks
│   └── transcript-ingestor.ts      # Claude/Codex/JSONL/Markdown session transcript parser
├── crew/
│   ├── types.ts                    # Officer, PeerChallenge, ChallengeResolution & Proof contracts
│   ├── base-officer.ts             # Abstract officer base, virtual-file matcher & KPI scorer
│   ├── engineering-officer.ts      # Runtime, lockfile, container & shutdown readiness expert
│   ├── security-officer.ts         # Secrets, SHA-pinned CI, permissions, sinks & container AppSec expert
│   ├── bridge-officer.ts           # Tests, CI stability, release automation & rollback CD expert
│   ├── party-mode.ts               # 3-round BMAD Party Mode orchestrator & challenge verifier
│   ├── evolution-engine.ts         # Counterfactual/empirical KPI-gated officer evolution engine
│   └── llm-provider.ts             # Optional OpenAI-compatible / Anthropic / Gemini / vLLM adapter
├── harness/
│   ├── number-one.ts               # High-level NumberOneAgent orchestrator facade
│   ├── mcp-server.ts               # Hardened stdio JSON-RPC 2.0 MCP server (12 tools, 4 resources)
│   └── shims.ts                    # Idempotent AGENTS.md, CLAUDE.md, Cursor, Copilot & .mcp.json shims
└── utils/
    ├── redactor.ts                 # Linear-time secret scrubber & child env sanitizer
    ├── safe-regex.ts               # ReDoS validator & O(N*M) linear-time glob matcher
    ├── http.ts                     # SSRF IP guard, origin-scoped env vars & retry/jitter fetch
    ├── lock.ts                     # Atomic linkSync/O_EXCL locks with /proc start-tick validation
    ├── fs-helpers.ts               # Atomic temp+fsync+rename writes, realpath & O_NOFOLLOW confinement
    ├── diff.ts                     # Bounded line-level unified diff engine
    └── ignore.ts                   # .gitignore + .numberone path filter
```

---

## 8. Essential Technical Glossary (Quick Reference)

Every single technical and domain term in Number One is defined in full inside **[`docs/GLOSSARY.md`](./docs/GLOSSARY.md)**. Key foundational terms:

- **Arbitration**: Deterministic evaluation of a proposed action against `L1`–`L4` precedence (`APPROVE`, `APPROVE_WITH_CONDITIONS`, `OVERRIDE`, `BLOCK`).
- **BMAD Party Mode**: Structured 3-round multi-officer review (Independent Audit -> Evidence-Verified Peer Challenges -> Precedent-Correlated Ruling).
- **Canonical JSON**: Deterministic recursively key-sorted JSON serialization ensuring byte-identical SHA-256 digests across platforms.
- **Content-Addressed Storage (CAS)**: Storing fallback blobs under `.numberone/fallback/blobs/<sha256>.blob` so filename equals cryptographic content digest.
- **Counterfactual Replay**: Proving a candidate officer practice increases KPI discrimination (`delta > 0`) on labeled virtual workspace snapshots before promotion.
- **Fallback Blob (`n1://fallback/<sha256>`)**: Local `.numberone/` storage preserving large logs, snapshots, or rich fields that cannot fit in GitHub or Jira schemas.
- **Hash Chain**: Tamper-evident sequence where every `StreamEvent` embeds `prevHash` of the preceding event and its own SHA-256 `hash`.
- **`L1` / `L2` / `L3` / `L4` Precedence**: Authority tiers ranking `L1` Stream Invariants > `L2` Number One Directives > `L3` Officer Gates & Verified Lessons > `L4` Ephemeral AI Session Context.
- **MCP (Model Context Protocol)**: Open `JSON-RPC 2.0` protocol over `stdio` connecting any modern AI IDE/CLI to Number One's 12 tools and 4 resources.
- **ReDoS (Regular Expression Denial of Service)**: Exponential regex backtracking vulnerability prevented in Number One by `validateRegexSafety` and linear-time `matchGlobLinear`.
- **Snapshot Digest (`snapshotDigest`)**: Canonical SHA-256 checksum inside `projections/state.json` verifying cached state matches deterministic stream replay.
- **SoR (System of Record)**: The single authoritative source of truth for workspace history, lessons learned, active directives, and release readiness.
- **SSRF (Server-Side Request Forgery)**: Network attack targeting internal/cloud-metadata IPs; blocked by `validateHttpUrl` and `isPrivateOrReservedIp`.
- **ULID**: 26-character Crockford Base32 identifier (`48-bit` ms timestamp + `80-bit` monotonic CSPRNG randomness) ordering stream events chronologically and uniquely.

---

## 9. GitHub Platform Governance & Provisioning

This repository includes complete GitHub governance, security automation, and **GitHub Pages** deployment out of the box:
- **CI & Hardened Container Verification**: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
- **GitHub Pages Interactive Docs + Archify Deployment**: [`.github/workflows/pages.yml`](./.github/workflows/pages.yml)
- **CodeQL SAST Analysis**: [`.github/workflows/codeql.yml`](./.github/workflows/codeql.yml)
- **Supply-Chain Dependency & License Review**: [`.github/workflows/dependency-review.yml`](./.github/workflows/dependency-review.yml) & [`.github/dependabot.yml`](./.github/dependabot.yml)
- **Signed Provenance Releases**: [`.github/workflows/release.yml`](./.github/workflows/release.yml)
- **Automated Repository Provisioner**: [`scripts/configure-github.sh`](./scripts/configure-github.sh) configures public visibility, GitHub Pages (`build_type: workflow`), Issues, Discussions, Projects v2 Scrum board, 18 labels, milestones, Dependabot/Secret Scanning, and Default Branch Rulesets:

```bash
# Preview all GitHub API provisioning operations
./scripts/configure-github.sh --repo onimurasame/numberone --dry-run

# Apply live once repository is created/pushed
./scripts/configure-github.sh --repo onimurasame/numberone
```

---

## License

Released under the [MIT License](./LICENSE).
