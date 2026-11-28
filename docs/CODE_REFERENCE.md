# Number One (`n1`) — Complete Code & API Reference Manual

This document provides the exhaustive module-by-module, class-by-class, interface-by-interface, function-by-function, CLI subcommand, MCP protocol, and stream event schema reference for **Number One (`n1`) v1.0.0**.

---

## Table of Contents

1. [Package & Entrypoint Architecture](#1-package--entrypoint-architecture)
2. [Stream Event Catalog (All 47 `EventType` Variants)](#2-stream-event-catalog-all-47-eventtype-variants)
3. [Core Engine Layer (`src/core/`)](#3-core-engine-layer-srccore)
   - [3.1 `src/core/types.ts` — Schemas & Domain Projections](#31-srccoretypests--schemas--domain-projections)
   - [3.2 `src/core/ulid.ts` — Monotonic Crockford Base32 ULIDs](#32-srccoreulidts--monotonic-crockford-base32-ulids)
   - [3.3 `src/core/hash.ts` — Canonical JSON & SHA-256 Primitives](#33-srccorehashts--canonical-json--sha-256-primitives)
   - [3.4 `src/core/stream-store.ts` — Append-Only Cryptographic Event Store](#34-srccorestream-storets--append-only-cryptographic-event-store)
   - [3.5 `src/core/replay-engine.ts` — Deterministic Fold & Snapshot Digest Engine](#35-srccorereplay-enginets--deterministic-fold--snapshot-digest-engine)
   - [3.6 `src/core/lesson-engine.ts` — Institutional Memory & Crash-to-Fix Correlation](#36-srccorelesson-enginets--institutional-memory--crash-to-fix-correlation)
   - [3.7 `src/core/authority-engine.ts` — L1–L4 Precedence & Affirmative Arbitration](#37-srccoreauthority-enginets--l1l4-precedence--affirmative-arbitration)
   - [3.8 `src/core/documentary.ts` — Chronological Workspace Documentary Builder](#38-srccoredocumentaryts--chronological-workspace-documentary-builder)
4. [Distributed Persistence Fabric (`src/persistence/`)](#4-distributed-persistence-fabric-srcpersistence)
   - [4.1 `src/persistence/types.ts` — Adapter & Ledger Contracts](#41-srcpersistencetypests--adapter--ledger-contracts)
   - [4.2 `src/persistence/fabric.ts` — `PersistenceFabric`](#42-srcpersistencefabricts--persistencefabric)
   - [4.3 `src/persistence/directory-adapter.ts` — `DirectoryPersistenceAdapter`](#43-srcpersistencedirectory-adapterts--directorypersistenceadapter)
   - [4.4 `src/persistence/github-adapter.ts` — `GitHubPersistenceAdapter`](#44-srcpersistencegithub-adapterts--githubpersistenceadapter)
   - [4.5 `src/persistence/jira-adapter.ts` — `JiraPersistenceAdapter`](#45-srcpersistencejira-adapterts--jirapersistenceadapter)
5. [Watchers, Hooks & Transcript Ingestion (`src/watchers/`)](#5-watchers-hooks--transcript-ingestion-srcwatchers)
   - [5.1 `src/watchers/fs-watcher.ts` — `WorkspaceFsWatcher`](#51-srcwatchersfs-watcherts--workspacefswatcher)
   - [5.2 `src/watchers/daemon.ts` — `WatcherDaemonManager`](#52-srcwatchersdaemonts--watcherdaemonmanager)
   - [5.3 `src/watchers/git-hooks.ts` — Chained Git Hook Engine](#53-srcwatchersgit-hooksts--chained-git-hook-engine)
   - [5.4 `src/watchers/command-runner.ts` — `runWatchedCommand` & Shell Hooks](#54-srcwatcherscommand-runnerts--runwatchedcommand--shell-hooks)
   - [5.5 `src/watchers/transcript-ingestor.ts` — `ingestTranscriptFile`](#55-srcwatcherstranscript-ingestorts--ingesttranscriptfile)
6. [Bridge Crew & KPI Evolution (`src/crew/`)](#6-bridge-crew--kpi-evolution-srccrew)
   - [6.1 `src/crew/types.ts` — Crew, Challenge & Proof Contracts](#61-srccrewtypests--crew-challenge--proof-contracts)
   - [6.2 `src/crew/base-officer.ts` — `BaseBridgeOfficer` & Virtual Matcher](#62-srccrewbase-officerts--basebridgeofficer--virtual-matcher)
   - [6.3 `src/crew/engineering-officer.ts` — `EngineeringOfficer`](#63-srccrewengineering-officerts--engineeringofficer)
   - [6.4 `src/crew/security-officer.ts` — `SecurityOfficer`](#64-srccrewsecurity-officerts--securityofficer)
   - [6.5 `src/crew/bridge-officer.ts` — `BridgeOfficer`](#65-srccrewbridge-officerts--bridgeofficer)
   - [6.6 `src/crew/party-mode.ts` — `PartyModeOrchestrator` & `resolvePeerChallenges`](#66-srccrewparty-modets--partymodeorchestrator--resolvepeerchallenges)
   - [6.7 `src/crew/evolution-engine.ts` — `KnowledgeEvolutionEngine`](#67-srccrewevolution-enginets--knowledgeevolutionengine)
   - [6.8 `src/crew/llm-provider.ts` — `PluggableLlmProvider`](#68-srccrewllm-providerts--pluggablellmprovider)
7. [Harness Orchestrator, Shims & MCP Server (`src/harness/`)](#7-harness-orchestrator-shims--mcp-server-srcharness)
   - [7.1 `src/harness/number-one.ts` — `NumberOneAgent`](#71-srcharnessnumber-onets--numberoneagent)
   - [7.2 `src/harness/mcp-server.ts` — `NumberOneMcpServer` (12 Tools & 4 Resources)](#72-srcharnessmcp-serverts--numberonemcpserver-12-tools--4-resources)
   - [7.3 `src/harness/shims.ts` — `installHarnessShims`](#73-srcharnessshimsts--installharnessshims)
8. [Security, Concurrency & Resilience Utilities (`src/utils/`)](#8-security-concurrency--resilience-utilities-srcutils)
9. [CLI Reference (`src/cli.ts` — All 24 Commands & Global Flags)](#9-cli-reference-srcclits--all-24-commands--global-flags)

---

## 1. Package & Entrypoint Architecture

- **ESM Library Entrypoint**: `src/index.ts` -> compiled to `dist/index.js` + `dist/index.d.ts` (`import { NumberOneAgent, StreamStore, ReplayEngine, ... } from '@shadow-software-platform/numberone'`).
- **CLI Entrypoint**: `src/cli.ts` -> compiled to `dist/cli.js` (`0o755`), exposed as both `n1` and `numberone` in `package.json#bin`.
- **Runtime Dependency Surface**: Exactly **1** production dependency (`zod`), minimizing supply-chain attack surface while guaranteeing strict runtime schema validation at every trust boundary.

---

## 2. Stream Event Catalog (All 47 `EventType` Variants)

Defined in `EVENT_TYPES` (`src/core/types.ts`, lines 3–62). Every event is persisted inside `.numberone/stream/events.jsonl` wrapped in a `StreamEvent` envelope (`schemaVersion: 1`, `id`, `seq`, `timestamp`, `type`, `actor`, `harness`, `sessionId`, `causationId`, `correlationId`, `summary`, `tags`, `affectedPaths`, `payload`, `blobs`, `storageManifest`, `prevHash`, `hash`).

| Domain | `EventType` | Primary Producer | Projection Effect in `ReplayEngine` |
|---|---|---|---|
| **Workspace** | `workspace.attached` | `NumberOneAgent.attach` | Initializes workspace metadata & records actor/harness |
| **Workspace** | `workspace.snapshot` | `WorkspaceFsWatcher.recordBaselineSnapshot` | Populates `state.files` with SHA-256 content digests |
| **Workspace** | `workspace.detached` | CLI / Operator | Marks detachment boundary in timeline |
| **Filesystem** | `fs.created` | `WorkspaceFsWatcher` / `reconcile` | Inserts `FileHistoryRecord` (`status: 'exists'`, `changeCount: 1`) |
| **Filesystem** | `fs.modified` | `WorkspaceFsWatcher` / `reconcile` | Updates `lastHash`, `lastSnapshotBlobHash`, increments `changeCount` |
| **Filesystem** | `fs.deleted` | `WorkspaceFsWatcher` / `reconcile` | Marks `FileHistoryRecord.status = 'deleted'` |
| **Filesystem** | `fs.renamed` | `WorkspaceFsWatcher` | Moves `oldPath` -> `newPath` in `state.files` |
| **Git** | `git.commit` | `post-commit` hook / `importGitHistory` | Updates `lastCommitSha`, `currentBranch`, touched files |
| **Git** | `git.checkout` | `post-checkout` hook | Updates `currentBranch` & `lastCommitSha` |
| **Git** | `git.merge` | `post-merge` hook | Updates `lastCommitSha` & records merge lineage |
| **Git** | `git.rebase` | `post-rewrite` hook | Records rewritten commit mapping |
| **Git** | `git.push` | `pre-push` hook | Records pushed remote/branch target |
| **Git** | `git.tag` | Git hook / CLI | Records release tag milestone |
| **Execution** | `exec.started` | `runWatchedCommand` | Records command start & sanitized arguments |
| **Execution** | `exec.completed` | `runWatchedCommand` | Marks matching prior unresolved crashes resolved; appends `recentExecutions` (`ok: true`) |
| **Execution** | `exec.failed` | `runWatchedCommand` / shell hook | Appends `CrashRecord` (`exitCode != 0`); appends `recentExecutions` (`ok: false`) |
| **Execution** | `exec.crashed` | `runWatchedCommand` | Appends `CrashRecord` (terminated by POSIX signal or timeout) |
| **Conversation** | `chat.turn` | `ingestTranscriptFile` / MCP | Tracks session/harness turns in documentary |
| **Conversation** | `chat.thinking` | `n1 think` / MCP / Ingestor | Appends bounded entry to `state.intermediateThinking` |
| **Conversation** | `attempt.failed` | `n1 dead-end` / MCP | Appends dead-end approach to `state.failedAttempts` |
| **Conversation** | `context.compacted` | Harness / CLI | Marks context compaction boundary in documentary |
| **Conversation** | `harness.switched` | Harness / CLI | Records handoff between AI coding harnesses |
| **Scrum Issues** | `issue.opened` | `n1 issue open` / `syncPull` / MCP | Inserts `IssueRecord` (`status: 'open'`) into `state.issues` |
| **Scrum Issues** | `issue.updated` | `syncPull` / CLI / MCP | Updates status, priority, description, or `externalRefs` |
| **Scrum Issues** | `issue.resolved` | `n1 issue resolve` / `syncPull` | Sets `status: 'resolved'`, `resolvedAt`, `resolution` |
| **Scrum Issues** | `issue.reopened` | `syncPull` / CLI | Transitions resolved issue back to `'reopened'` |
| **Memory** | `lesson.captured` | `n1 lesson` / auto-correlation / MCP | Inserts `LessonRecord` into `state.lessons` |
| **Memory** | `lesson.verified` | Operator / Replay verification | Sets `LessonRecord.verified = true` |
| **Memory** | `lesson.applied` | Consultation / Arbitration | Increments `LessonRecord.appliedCount` |
| **Memory** | `lesson.superseded` | Operator / Evolution | Marks `LessonRecord.supersededBy` |
| **Memory** | `decision.recorded` | `n1 decision` / MCP | Inserts `DecisionRecord` (ADR) into `state.decisions` |
| **Authority** | `directive.issued` | `n1 directive` / Party veto / MCP | Inserts active `DirectiveRecord` into `state.directives` |
| **Authority** | `directive.superseded` | Operator / Number One | Deactivates prior `DirectiveRecord` (`active: false`, `supersededBy`) |
| **Authority** | `arbitration.decided` | `AuthorityEngine.arbitrate` | Audits `APPROVE` / `APPROVE_WITH_CONDITIONS` / `OVERRIDE` / `BLOCK` verdict |
| **Bridge Crew** | `crew.assembled` | `PartyModeOrchestrator.convene` | Opens `PartySessionSummary` in `state.partySessions` |
| **Bridge Crew** | `crew.opinion` | `PartyModeOrchestrator.convene` | Increments `opinionCount` & logs officer findings |
| **Bridge Crew** | `crew.challenge` | `PartyModeOrchestrator.convene` | Increments `challengeCount` & logs cross-examination |
| **Bridge Crew** | `crew.consensus` | `PartyModeOrchestrator.convene` | Finalizes `ruling`, `consensusReached`, `directiveId` |
| **Bridge Crew** | `crew.veto` | `PartyModeOrchestrator.convene` | Records critical officer veto (`vetoCount`, `vetoOfficers`) |
| **Evolution** | `officer.kpi.measured` | `assessOfficer` / `convene` | Updates `currentKpiScore` and appends `kpiHistory` |
| **Evolution** | `officer.knowledge.proposed` | `KnowledgeEvolutionEngine.proposeUpdate` | Audits incoming candidate `KnowledgePractice` |
| **Evolution** | `officer.knowledge.rejected` | `KnowledgeEvolutionEngine.proposeUpdate` | Increments `rejectedProposalsCount` when `delta <= 0` or unsafe |
| **Evolution** | `officer.knowledge.updated` | `KnowledgeEvolutionEngine.proposeUpdate` | Activates KPI-proven practice & increments `knowledgeVersion` |
| **Evolution** | `officer.knowledge.reverted` | `KnowledgeEvolutionEngine.revertPractice` | Deactivates regressed practice (`active: false`, `revertedReason`) |
| **Persistence** | `sync.pushed` | `PersistenceFabric.syncPush` | Updates `state.syncState[backend].lastSyncedSeq` |
| **Persistence** | `sync.pulled` | `PersistenceFabric.syncPull` | Updates `state.syncState[backend].lastPulledAt` |
| **Persistence** | `sync.reconciled` | `PersistenceFabric` | Records distributed bidirectional reconciliation |

---

## 3. Core Engine Layer (`src/core/`)

### 3.1 `src/core/types.ts` — Schemas & Domain Projections
- **Zod Runtime Schemas**: `ActorKindSchema`, `ActorSchema`, `BlobRefSchema`, `PersistenceBackendKindSchema`, `RemoteRecordRefSchema`, `StorageManifestSchema`, `StreamEventSchema`.
- **Core Interfaces**:
  - `StreamEvent`: Immutable atomic event envelope with SHA-256 `prevHash` and `hash`.
  - `AppendEventInput`: Input contract for `StreamStore.append(...)`.
  - `LessonRecord`, `DecisionRecord`, `DirectiveRecord`, `IssueRecord`, `CrashRecord`, `FileHistoryRecord`, `KnowledgePractice`, `OfficerStateProjection`, `PartySessionSummary`.
  - `WorkspaceProjection`: Complete deterministic System of Record state rebuilt from stream events.
  - `NumberOneConfig`: Workspace `.numberone/config.json` schema.

### 3.2 `src/core/ulid.ts` — Monotonic Crockford Base32 ULIDs
- **`generateUlid(now?: number): string`** (`L53`): Generates 26-character lexicographically sortable ULIDs (`48-bit` millisecond timestamp + `80-bit` CSPRNG randomness via `crypto.randomBytes`). Guarantees strict within-millisecond monotonicity inside the same process by incrementing the 80-bit random payload when `now === lastTimestamp`.

### 3.3 `src/core/hash.ts` — Canonical JSON & SHA-256 Primitives
- **`GENESIS_HASH: string`** (`L70`): `'0'.repeat(64)` — `prevHash` of `seq #1`.
- **`canonicalJson(value: unknown): string`** (`L54`): Deterministically serializes arbitrary JSON values with recursively sorted object keys (excluding prototype keys via `isSafeRecordKey`), guaranteeing cross-platform byte-identical hashing.
- **`sha256Hex(input: string | Buffer): string`** (`L62`): Computes lowercase 64-hex-character SHA-256 digest using Node `node:crypto`.
- **`hashObject(value: unknown): string`** (`L66`): Composition `sha256Hex(canonicalJson(value))`.

### 3.4 `src/core/stream-store.ts` — Append-Only Cryptographic Event Store
Manages `.numberone/` (`0o700`) and `.numberone/stream/events.jsonl` (`0o600`) under cross-process exclusive locks (`withFileLockSync`).

- **`new StreamStore(workspaceRoot: string)`** (`L118`)
- **`isInitialized(): boolean`** (`L131`): Returns `true` iff `.numberone/config.json` and `.numberone/stream/` exist.
- **`init(config?: Partial<NumberOneConfig>): NumberOneConfig`** (`L254`): Initializes `.numberone/` directory hierarchy with strict `0o700`/`0o600` permissions and symlink confinement checks.
- **`readConfig(): NumberOneConfig | null`** (`L306`) / **`writeConfig(config: NumberOneConfig): void`** (`L310`)
- **`getHead(): StreamHead`** (`L316`): Reads `stream/head.json` and cross-verifies it against the physical tail of `events.jsonl` (recovering from crash-interrupted head writes while failing closed on hash-tampered stream tips).
- **`storeBlob(key: string, content: string | Buffer, contentType?: string): BlobRef`** (`L345`): Redacts text secrets, computes `sha256`, writes content-addressed blob `.numberone/fallback/blobs/<sha256>.blob` (`0o600`), and returns `n1://fallback/<sha256>` reference.
- **`readBlob(sha256: string, maxBytes?: number): Buffer | null`** (`L376`) / **`readBlobUtf8(sha256: string): string | null`** (`L383`): Validates strict 64-hex SHA-256 format, reads with `O_NOFOLLOW`, and verifies actual content hash before returning bytes.
- **`append(input: AppendEventInput): StreamEvent`** (`L388`): Acquires `stream-append` lock, deep-redacts secrets in `summary` and `payload`, stores `fallbackBlobs`, links `prevHash` to `head.lastHash`, computes `hash` via `computeEventHash`, appends JSONL line with `fsyncSync`, and atomically updates `stream/head.json`.
- **`computeEventHash(event: Omit<StreamEvent, 'hash'>): string`** (`L462`): Hashes the event excluding mutable `storageManifest.remotes` (which are tracked separately in `sync/ledger.json` so remote sync never invalidates historical event hashes).
- **`readAllEvents(): StreamEvent[]`** (`L496`) / **`readEventsResilient(): { events: StreamEvent[]; errors: string[] }`** (`L509`)
- **`getEventById(eventId: string): StreamEvent | null`** (`L523`)
- **`query(filter?: StreamQuery): StreamEvent[]`** (`L535`): Filters stream by `types`, `sinceSeq`, `untilSeq`, `sinceTimestamp`, `untilTimestamp`, `harness`, `actorKind`, `tag`, `affectedPath`, `textSearch`, and `limit`.
- **`attachRemoteRef(eventId: string, backendKey: string, ref: RemoteRecordRef): void`** (`L598`): Records distributed remote mapping in `sync/ledger.json`.
- **`verifyIntegrity(): IntegrityCheckResult`** (`L615`): Re-validates every line of `events.jsonl` against `StreamEventSchema`, checks contiguous `seq` (`1..N`), verifies `prevHash` linkage from `GENESIS_HASH`, recomputes every `hash`, verifies `head.json` alignment, and checks every referenced fallback blob's existence and SHA-256 digest.

### 3.5 `src/core/replay-engine.ts` — Deterministic Fold & Snapshot Digest Engine
- **`PROJECTION_VERSION = 3`** (`L30`)
- **`createInitialProjection(workspaceRoot: string, rebuiltAt?: string): WorkspaceProjection`** (`L71`): Constructs empty `WorkspaceProjection` seeded with baseline practices for `engineering`, `security`, and `bridge` officers.
- **`computeProjectionDigest(state: WorkspaceProjection): string`** (`L104`): Computes SHA-256 over canonical projection state (excluding volatile `rebuiltAt` and `snapshotDigest`) to detect corrupted or tampered `.numberone/projections/state.json` caches.
- **`applyEventToProjection(state: WorkspaceProjection, event: StreamEvent): WorkspaceProjection`** (`L177`): Pure deterministic reducer folding a single `StreamEvent` into `WorkspaceProjection`.
- **`class ReplayEngine`** (`L809`):
  - **`replay(options?: ReplayOptions): WorkspaceProjection`** (`L823`): Replays from genesis (or up to `untilSeq` / `untilTimestamp`); persists verified `projections/state.json` when replaying full tip with `persist: true`.
  - **`getCurrentState(): WorkspaceProjection`** (`L848`): Returns cached projection in `O(1)` when `projectionVersion === PROJECTION_VERSION`, `lastSeq`/`lastEventHash` match `StreamStore.getHead()`, and `computeProjectionDigest(cached) === cached.snapshotDigest`; otherwise transparently triggers full deterministic replay.

### 3.6 `src/core/lesson-engine.ts` — Institutional Memory & Crash-to-Fix Correlation
- **`class LessonEngine`** (`L70`):
  - **`findRelevantLessons(state: WorkspaceProjection, query: ConsultationQuery): LessonMatch[]`** (`L80`): Ranks non-superseded lessons by path overlap (`+6` exact, `+3` directory prefix), error-signature substring match (`+8`), tag match (`+4`), token overlap (`+1`..`+5`), verification bonus (`+2`), and severity weight.
  - **`findRelevantFailedAttempts(state: WorkspaceProjection, query: ConsultationQuery)`** (`L171`): Surfaces previously recorded `attempt.failed` dead-ends overlapping target paths, tags, or intent tokens so AI agents never repeat failed experiments.
  - **`detectFailureToFixCorrelation(fixEvent: StreamEvent): FailureFixCorrelation | null`** (`L203`): Inspects stream events between an earlier `exec.failed`/`exec.crashed` and a newly passing `exec.completed`, identifying intermediate `fs.*`/`git.commit` edits and `attempt.failed` entries to synthesize an automatic `LessonRecord`.

### 3.7 `src/core/authority-engine.ts` — L1–L4 Precedence & Affirmative Arbitration
- **`AuthorityEngine.PRECEDENCE`** (`L210`):
  1. `L1_SOR_INVARIANT` — Cryptographic stream history, unresolved critical crashes, immutable SoR facts.
  2. `L2_NUMBER_ONE_DIRECTIVE` — Active directives issued by `numberone` (`blocking` / `mandatory` / `advisory`).
  3. `L3_OFFICER_GATE` — Officer-issued directives, verified `critical`/`high` prevention rules, and active ADRs.
  4. `L4_SESSION_CONTEXT` — Ephemeral prompt assumptions or unverified AI agent plans.
- **`extractAffirmativeClauses(text: string): string[]`** (`L85`): Splits prose/plans into clauses and filters out negated avoidance statements (e.g., `"ensure we do not use eval("`) so stating compliance with a rule never triggers a false-positive `forbiddenPatterns` violation while mixed clauses (`"do not use foo, instead run eval(x)"`) are still caught.
- **`AuthorityEngine.arbitrate(state, proposal, options?): ArbitrationResult`** (`L222`): Evaluates a proposed action against scoped `L2`/`L3` directives (`forbiddenPatterns` & `requiredPatterns` via ReDoS-safe `testSafeRegex`), historical `failedAttempts`, verified `LessonRecord` prevention rules, and unresolved crashes on `targetPaths`, returning `'APPROVE' | 'APPROVE_WITH_CONDITIONS' | 'OVERRIDE' | 'BLOCK'`.
- **`AuthorityEngine.compileAuthoritativeBrief(state, focusPaths?): string`** (`L445`): Renders a concise Markdown System of Record briefing for prompt injection or MCP `numberone://brief`.

### 3.8 `src/core/documentary.ts` — Chronological Workspace Documentary Builder
- **`buildWorkspaceDocumentary(workspaceRoot, events, state): WorkspaceDocumentary`** (`L27`): Groups the entire event stream into chronological session/epoch chapters (`DocumentaryChapter[]`) and compiles narrative Markdown summarizing actor transitions, harness switches, crashes, dead-ends, lessons, directives, and crew rulings.

---

## 4. Distributed Persistence Fabric (`src/persistence/`)

### 4.1 `src/persistence/types.ts` — Adapter & Ledger Contracts
Defines `PersistenceAdapter` (`kind`, `name`, `isConfigured()`, `ensureTaxonomy()`, `pushEvent()`, `pullExternalEvents()`, `verifyRemoteRef()`), `SyncLedger`, `SyncPushReport`, `SyncPullReport`, and `DistributedIntegrityReport`.

### 4.2 `src/persistence/fabric.ts` — `PersistenceFabric`
Coordinates distributed state across `.numberone/` (primary append-only fallback) and any combination of `DirectoryPersistenceAdapter`, `GitHubPersistenceAdapter`, and `JiraPersistenceAdapter`.
- **`syncPush(): Promise<SyncPushReport[]>`** (`L81`): Acquires cross-process `sync-ledger` lock, pushes unsynced Scrum/SoR events (`issue.*`, `lesson.captured`, `directive.issued`, `decision.recorded`, `exec.crashed`, `crew.consensus`, `crew.veto`) to each enabled adapter, records `RemoteRecordRef` entries (including `fallbackFields` preserved locally in `.numberone/`), and appends `sync.pushed`.
- **`syncPull(): Promise<SyncPullReport[]>`** (`L235`): Pulls external Scrum updates/new issues created by humans in GitHub/Jira/Directory boards, deduplicating by `externalId` + `externalHash` so round-trips never loop infinitely.
- **`verifyDistributedIntegrity(verifyRemotes?: boolean): Promise<DistributedIntegrityReport>`** (`L384`): Combines local `StreamStore.verifyIntegrity()`, `ReplayEngine` snapshot verification, ledger cross-checks, and live remote existence checks (`verifyRemoteRef`).

### 4.3 `src/persistence/directory-adapter.ts` — `DirectoryPersistenceAdapter`
Zero-SaaS filesystem/Git-worktree/NFS Scrum board adapter organizing JSON/Markdown cards across `backlog/`, `in-progress/`, `blocked/`, `done/`, `lessons/`, `directives/`, `decisions/`, and rendering a human-readable Kanban `board.md`.

### 4.4 `src/persistence/github-adapter.ts` — `GitHubPersistenceAdapter`
Full-featured GitHub Issues + **GitHub Projects v2 GraphQL** adapter:
- Provisions the 14 `GITHUB_LABELS` (`n1:managed`, `n1:lesson`, `n1:directive`, `n1:decision`, `n1:crash`, `n1:ruling`, `n1:officer:*`, `n1:priority:*`, `n1:kind:*`).
- Embeds lossless machine-parseable `<!-- n1-meta:{...} -->` footers in Issue bodies (`buildGitHubIssueBody` / `parseGitHubEmbeddedMeta`) while listing large blobs in `fallbackFields` backed by `.numberone/fallback/blobs/`.
- Enrolls issues into **GitHub Projects v2** boards via GraphQL (`addProjectV2ItemById`) and updates Single-Select `Status` columns (`Todo` / `In Progress` / `Done`).
- Supports both GitHub.com and GitHub Enterprise Server (`apiBaseUrl`), via scoped HTTPS token (`resilientFetch`) or `gh api`.

### 4.5 `src/persistence/jira-adapter.ts` — `JiraPersistenceAdapter`
Full-featured Jira Cloud & Data Center adapter:
- Converts rich text into **Atlassian Document Format (`ADF`)** (`toAdfDocument`).
- Maps event kinds to native Jira Issue Types (`Bug`, `Story`, `Epic`, `Task`), Priorities (`Highest`, `High`, `Medium`, `Low`), Officer Components (`n1-engineering`, `n1-security`, `n1-bridge`), and active Agile Sprint boards (`/rest/agile/1.0/board/{boardId}/sprint?state=active`).
- Searches external changes via Jira REST v3 `/rest/api/3/search/jql` (`buildJiraSearchPayload`).

---

## 5. Watchers, Hooks & Transcript Ingestion (`src/watchers/`)

- **`WorkspaceFsWatcher` (`src/watchers/fs-watcher.ts`, `L57`)**: Debounced recursive directory & file watcher with symlink confinement (`isPathConfinedToRoot`), `.gitignore` + `.numberone` ignore filtering (`WorkspaceIgnore`), binary file detection (`isBinaryBuffer`), secret-file content suppression (`isSensitiveSecretFile`), Myers/LCS-style bounded unified diff generation (`computeUnifiedDiff`), content-addressed blob snapshotting, and `reconcileOfflineChanges(projection)` (`L189`) for offline edit detection.
- **`WatcherDaemonManager` (`src/watchers/daemon.ts`, `L69`)**: Spawns detached `n1 watch --foreground` processes, writing `.numberone/daemon.pid` with Linux `/proc/<pid>/stat` field-22 `startTicks` binding (`readProcStartTicks`) so recycled PIDs are never misidentified or signaled.
- **`git-hooks.ts` (`src/watchers/git-hooks.ts`)**: `installGitHooks` (`L64`) resolves `git rev-parse --git-path hooks`, preserves pre-existing hooks by chaining instead of overwriting, quotes CLI paths via `shellSingleQuote`, and wires `recordGitHookEvent` (`L144`) + `importGitHistory` (`L245`).
- **`command-runner.ts` (`src/watchers/command-runner.ts`)**: `runWatchedCommand` (`L156`) executes child commands with `buildSanitizedChildEnv`, captures bounded stdout/stderr rings (`BoundedOutputCollector`, UTF-8 multi-byte safe), enforces timeout + `SIGTERM` -> `SIGKILL` escalation, records `exec.*` events, and triggers automatic failure-to-fix lesson synthesis. `generateShellHook` (`L375`) generates `bash` (`PROMPT_COMMAND`) and `zsh` (`preexec`/`precmd`) crash-capture hooks.
- **`transcript-ingestor.ts` (`src/watchers/transcript-ingestor.ts`)**: `ingestTranscriptFile` (`L89`) parses Claude Code JSONL, Codex/OpenAI JSONL, generic JSON arrays, and Markdown chat logs into `chat.turn`, `chat.thinking`, and `attempt.failed` stream events.

---

## 6. Bridge Crew & KPI Evolution (`src/crew/`)

### 6.1 Specialist Officers (`BaseBridgeOfficer` Subclasses)

| Officer Class | File | Main KPI (`0..100`) | Baseline Domain Checks |
|---|---|---|---|
| `EngineeringOfficer` | `src/crew/engineering-officer.ts` | `runtime_readiness_score` | Runtime/engine pinning (`engines` / `.nvmrc` / `rust-toolchain` / `go.mod`), lockfile determinism, hardened multi-stage containerization (`USER`, digest/tag pin, `.dockerignore`), configuration documentation (`.env.example`), graceful shutdown (`SIGTERM`/`SIGINT` / `tini`), unresolved runtime crash debt |
| `SecurityOfficer` | `src/crew/security-officer.ts` | `security_posture_score` | Hardcoded secret scanning across source & configs, `.gitignore` secret hygiene, lockfile supply-chain integrity, dangerous code execution sinks (`eval`, `new Function`, shell injection), GitHub Actions SHA pinning (`40-char` hex) & explicit minimal `permissions:`, container privilege hardening (`USER`, no `--privileged`), `SECURITY.md` + automated dependency scanning (`dependabot.yml` / `renovate.json`) |
| `BridgeOfficer` | `src/crew/bridge-officer.ts` | `continuous_delivery_score` | Automated test suite presence & execution command, recent stream test stability rate, CI pipeline on `push`/`pull_request` running verification gates, automated release/deployment workflow or `CHANGELOG.md`, static type/lint quality gates, documented rollback automation (`scripts/rollback*` or runbook), open release-blocker debt |

### 6.2 `PartyModeOrchestrator` (`src/crew/party-mode.ts`)
Implements 3-phase **BMAD Party Mode**:
1. **Round 1 — Independent Telemetry Audit**: Each selected officer evaluates baseline checks + evolved active `KnowledgePractice` rules against real workspace files and `WorkspaceProjection`, emitting `OfficerAssessment`, `OfficerFinding[]`, and cross-domain `PeerChallenge[]` (`crew.opinion` + `officer.kpi.measured`).
2. **Round 2 — Peer Challenge Cross-Verification (`resolvePeerChallenges`, `L85`)**: Deterministic evidence adjudicator inspects target officer checks and findings for every `PeerChallenge`, classifying each as `'CONFIRMED'` (corroborated by concrete check/finding evidence), `'REBUTTED_BY_EVIDENCE'` (rebutted by passing target domain controls), or `'ESCALATED'` (cross-cutting architectural risk requiring human/lead review).
3. **Round 3 — Precedent Correlation, Arbitration & Ruling**: Correlates findings against historical `LessonRecord`s and `failedAttempts` in the SoR, builds the `OfficerDecisionRow[]` matrix and prioritized `RemediationItem[]` backlog, and issues a binding `crew.consensus` or `crew.veto` (automatically creating an `L2` `blocking` `DirectiveRecord` if any critical veto is raised).

### 6.3 `KnowledgeEvolutionEngine` (`src/crew/evolution-engine.ts`)
Enforces factually proven continuous officer improvement:
- **`proposeUpdate(proposal, options?): EvolutionVerdict`** (`L98`):
  1. Validates `KnowledgeUpdateProposalSchema` and verifies every regex in `practice.matcher` passes `validateRegexSafety` (rejecting ReDoS nested quantifiers/backreferences).
  2. Evaluates `counterfactual_replay` over `VerificationSample[]` (`compliant` vs. `violating` virtual workspace snapshots via `evaluatePracticeMatcherOnVirtualFiles`) or opt-in `empirical_benchmark` (`--allow-exec` required; disabled over MCP).
  3. Requires **strictly positive KPI improvement (`delta > 0`)**, zero false positives on compliant samples, and zero false negatives on violating samples before emitting `officer.knowledge.updated`. Otherwise emits `officer.knowledge.rejected`.
- **`auditLiveRegressions(role, options?)`** (`L472`) & **`revertPractice(role, practiceId, reason)`** (`L456`): Detects live KPI score drops across `kpiHistory` and cleanly reverts regressed practices via `officer.knowledge.reverted`.

---

## 7. Harness Orchestrator, Shims & MCP Server (`src/harness/`)

### 7.1 `NumberOneAgent` (`src/harness/number-one.ts`, `L69`)
High-level facade uniting `StreamStore`, `ReplayEngine`, `LessonEngine`, `AuthorityEngine`, `PersistenceFabric`, `PartyModeOrchestrator`, and `KnowledgeEvolutionEngine`. Provides programmatic TypeScript methods for every CLI and MCP operation (`attach`, `recordEvent`, `recordThinking`, `recordFailedAttempt`, `captureLesson`, `recordDecision`, `issueDirective`, `openIssue`, `resolveIssue`, `replay`, `getState`, `consult`, `arbitrate`, `getAuthoritativeBrief`, `buildDocumentary`, `assessOfficer`, `assembleCrew`, `proposeKnowledgeUpdate`, `auditOfficerRegressions`, `revertOfficerPractice`, `syncPush`, `syncPull`, `verifyIntegrity`, `runCommand`, `ingestTranscript`, `createWatcher`, `reconcileOfflineChanges`).

### 7.2 `NumberOneMcpServer` (`src/harness/mcp-server.ts`, `L261`)
Implements **Model Context Protocol (`2024-11-05`)** over newline-delimited `stdio` JSON-RPC 2.0:
- **Transport Hardening**: Enforces `maxLineBytes = 2_000_000` on raw byte chunks *before* UTF-8 string decoding, pauses/resumes `stdin` during async request handling for backpressure, and handles `stdout` `EPIPE` cleanly when a host IDE closes pipes.
- **`L4` Privilege Boundary**: `record_stream_event` restricts MCP clients to `MCP_ALLOWED_RECORD_TYPES` (`chat.turn`, `chat.thinking`, `attempt.failed`, `issue.opened`, `issue.updated`, `decision.recorded`), `issue_directive` restricts direct MCP calls to `severity: 'advisory'`, and `propose_officer_evolution` forces `allowBenchmarkExec: false`.
- **12 Exposed Tools**: `get_authoritative_brief`, `consult_number_one`, `arbitrate_action`, `record_stream_event`, `capture_lesson`, `issue_directive`, `replay_workspace_state`, `get_documentary`, `assemble_crew`, `propose_officer_evolution`, `sync_persistence`, `verify_integrity`.
- **4 Exposed Resources**: `numberone://brief` (`text/markdown`), `numberone://state` (`application/json`), `numberone://documentary` (`text/markdown`), `numberone://lessons` (`application/json`).

### 7.3 `installHarnessShims` (`src/harness/shims.ts`, `L80`)
Idempotently injects/updates marker-fenced `<!-- NUMBERONE:START -->` blocks inside `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/numberone.mdc`, `.github/copilot-instructions.md`, and merges the `numberone` server entry into `.mcp.json` without clobbering user-defined MCP servers.

---

## 8. Security, Concurrency & Resilience Utilities (`src/utils/`)

| File | Key Exports | Responsibility |
|---|---|---|
| `src/utils/redactor.ts` | `redactSecrets`, `redactObjectDeep`, `isSensitiveSecretFile`, `isSafeRecordKey`, `buildSanitizedChildEnv` | Linear-time (`O(n)`) token redaction (AWS `AKIA`/`ASIA`, GitHub `ghp_`/`github_pat_`, Slack, Anthropic `sk-ant-`, OpenAI `sk-`, Google `AIza`, Stripe, JWTs, PEM keys, Basic/Bearer headers, URL userinfo, Azure SAS `sig=`), prototype-pollution key blocking (`__proto__`, `constructor`, `prototype`), and child-process secret env stripping |
| `src/utils/safe-regex.ts` | `validateRegexSafety`, `compileSafeRegex`, `testSafeRegex`, `matchGlobLinear` | Rejects ReDoS-vulnerable regexes (nested quantifiers `(a+)+`, quantified overlapping alternations, backreferences `\1`, lookbehinds, patterns `> 512` chars) and executes glob matching in guaranteed `O(N * M)` linear time |
| `src/utils/http.ts` | `validateHttpUrl`, `isPrivateOrReservedIp`, `resolveScopedEnvVar`, `resilientFetch`, `readResponseJsonBounded` | Blocks SSRF against RFC 1918, loopback, link-local/cloud metadata (`169.254.169.254`), CGNAT, and IPv6 local addresses; disables redirect-following across origins; bounds response body bytes (`maxResponseBytes`); retries transient `429`/`502`/`503`/`504` with Retry-After + jittered exponential backoff |
| `src/utils/lock.ts` | `withFileLockSync`, `withFileLockAsync`, `isProcessAlive`, `readProcStartTicks` | Cross-process advisory lockfiles using atomic `linkSync` + `O_EXCL` fallback, `Atomics.wait` non-busy sleep, and stale-lock eviction verified by PID + `/proc/<pid>/stat` start-time ticks |
| `src/utils/fs-helpers.ts` | `atomicWriteFileSync`, `atomicWriteJsonSync`, `isPathConfinedToRoot`, `isWritablePathConfinedToRoot`, `readFileBufferSafe`, `walkWorkspaceFiles` | Crash-safe temp-file + `fsync` + `rename` writes, `realpathSync` symlink escape confinement, and `O_NOFOLLOW` descriptor reads |
| `src/utils/diff.ts` | `computeUnifiedDiff` | Bounded line-level unified diff generator (`maxInlineBytes`) with automatic fallback to blob storage for large edits |
| `src/utils/ignore.ts` | `WorkspaceIgnore` | Parses `.gitignore` rules + `.numberone` exclusions using `matchGlobLinear` |

---

## 9. CLI Reference (`src/cli.ts` — All 24 Commands & Global Flags)

Global flags accepted on every command: `--workspace <path>`, `--json`, `--version` (`-v`), `--help` (`-h`).

| Command | Arguments & Flags | Exit Codes | Description |
|---|---|---|---|
| `n1 attach [path]` | `--no-hooks`, `--no-shims`, `--import-commits <N>`, `--strict\|--advisory`, `--directory-scrum <dir>`, `--project-key <K>`, `--github <o/r>`, `--github-project <N>`, `--jira <url:key[:board]>` | `0` ok, `1` err | Attaches Number One to a workspace |
| `n1 status` | `--workspace <path>`, `--json` | `0` | Displays stream head, daemon status, officer KPIs, and sync ledger |
| `n1 doctor` | `--workspace <path>`, `--json` | `0` healthy, `1` error | Runs full toolchain, integrity, hook, daemon, and adapter diagnostics |
| `n1 watch` | `--foreground`, `stop` | `0` | Starts detached background watcher, runs in foreground, or stops daemon |
| `n1 reconcile` | `--harness <name>` | `0` | Scans workspace against projection and appends `fs.*` events for offline edits |
| `n1 exec -- <cmd...>` | `--timeout-ms <N>`, `--harness <name>` | Child exit code | Runs `<cmd>` while capturing crashes, logs, and auto-correlating fix lessons |
| `n1 replay` | `--until-seq <N>`, `--until-timestamp <ISO>` | `0` | Deterministically replays `events.jsonl` from genesis (supports time-travel) |
| `n1 documentary` | `--out <file.md>` | `0` | Compiles chronological Workspace Documentary markdown |
| `n1 verify` | `--local-only` | `0` valid, `2` tampered | Verifies cryptographic hash chain, blobs, snapshot digest, and remote mirrors |
| `n1 brief` | `--paths <p1,p2>` | `0` | Outputs authoritative System of Record context brief |
| `n1 consult` | `--intent "..."`, `--paths <p1,p2>`, `--error "..."`, `--command "..."`, `--tags <t1,t2>` | `0` | Queries relevant Lessons Learned, dead-ends, crashes, and active directives |
| `n1 arbitrate` | `--action "..."`, `--intent "..."`, `--paths <p1,p2>`, `--command "..."`, `--approach "..."` | `0` approved, `3` blocked | Submits proposed action to `AuthorityEngine` (`L1`–`L4` precedence check) |
| `n1 think "<text>"` | `--harness <name>`, `--session <id>`, `--tags <t1,t2>` | `0` | Appends `chat.thinking` reasoning step |
| `n1 dead-end` | `--approach "..."`, `--reason "..."`, `--paths <p1,p2>` | `0` | Appends `attempt.failed` so dead-end approaches are never repeated |
| `n1 lesson` | `--title "..."`, `--problem "..."`, `--root-cause "..."`, `--resolution "..."`, `--rule "..."`, `--failed "..."`, `--severity <lvl>` | `0` | Records durable `lesson.captured` in institutional memory |
| `n1 decision` | `--title "..."`, `--decision "..."`, `--rationale "..."`, `--rejected "..."`, `--consequences "..."` | `0` | Records Architecture/Process Decision (`decision.recorded`) |
| `n1 directive` | `--title "..."`, `--directive "..."`, `--rationale "..."`, `--severity <advisory\|mandatory\|blocking>`, `--forbid <rx>`, `--require <rx>`, `--paths <p1,p2>` | `0` | Issues authoritative `directive.issued` superseding session context |
| `n1 issue open\|resolve` | `--title "..."`, `--desc "..."`, `--kind <k>`, `--priority <p>`, `--officer <role>` / `<id> --resolution "..."` | `0` | Opens or resolves Scrum work items synced across backends |
| `n1 record` | `--type <EventType>`, `--summary "..."`, `--payload <json>`, `--paths <p1,p2>` | `0` | Appends raw validated atomic event via local operator CLI |
| `n1 ingest <file>` | `--harness <name>`, `--session <id>` | `0` | Ingests JSONL/JSON/Markdown session transcripts into the stream |
| `n1 party` | `--topic "..."`, `--mode <roundtable\|specialist\|auto-triage>`, `--officers <list>`, `--paths <p1,p2>` | `0` consensus, `4` veto | Convenes 3-round BMAD Party Mode Bridge Crew audit & arbitration |
| `n1 officer <role>` | `engineering \| security \| bridge`, `--topic "..."`, `--paths <p1,p2>` | `0` | Runs single specialist officer assessment & KPI measurement |
| `n1 evolve` | `--file <proposal.json> [--allow-exec]` \| `audit <role> [--threshold N] [--force]` \| `revert <role> <id> [--reason "..."]` | `0` accepted, `5` rejected | Evaluates KPI-gated officer evolution proposals, audits regressions, or reverts |
| `n1 sync [dir]` | `push \| pull \| both` | `0` | Synchronizes distributed stream with Directory / GitHub / Jira backends |
| `n1 shims` | `--workspace <path>` | `0` | Installs/updates universal AI harness instruction shims & `.mcp.json` |
| `n1 shell-hook [sh]` | `bash \| zsh` | `0` | Outputs POSIX shell hook snippet for automatic terminal crash capture |
| `n1 mcp` | `--workspace <path>` | `0` | Starts `stdio` JSON-RPC 2.0 Model Context Protocol server |
