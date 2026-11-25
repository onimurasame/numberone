# Number One (`n1`) — Exhaustive Technical & Domain Glossary

Every technical term, architectural concept, cryptographic primitive, operating-system mechanism, security classification, software delivery metric, protocol term, Archify visualization term, and **Number One (`n1`)** domain concept used across this repository is defined below in alphabetical order.

---

## A

- **ADF (Atlassian Document Format)**: A structured JSON document schema required by Jira Cloud REST API v3 for rich-text issue descriptions and comments. Converted deterministically by `toAdfDocument` in `src/persistence/jira-adapter.ts`.
- **ADR (Architecture Decision Record)**: An immutable record (`DecisionRecord` / `decision.recorded`) capturing an architectural or process choice, its rationale, rejected alternatives, and downstream consequences.
- **Advisory Lock (`withFileLockSync` / `withFileLockAsync`)**: A cooperative cross-process synchronization file in `.numberone/locks/` created atomically via `linkSync` or `O_CREAT | O_EXCL` to serialize concurrent stream appends and sync ledger updates without database daemons.
- **Affirmative Clause Extraction (`extractAffirmativeClauses`)**: Linguistic parsing step in `AuthorityEngine` that strips negated avoidance statements (such as `"do not use eval("`) before checking `forbiddenPatterns`, eliminating false-positive blocks when an agent explicitly states compliance with a prohibition.
- **Air-Gapped Environment**: A physically or logically isolated network enclave with zero outbound internet access. Supported natively by Number One's zero-network core and `DirectoryPersistenceAdapter`.
- **Append-Only Log**: A storage data structure where records (`StreamEvent`s) are strictly added to the tail of `events.jsonl` and never mutated or deleted in place, guaranteeing complete historical auditability.
- **Arbitration (`AuthorityEngine.arbitrate`)**: The deterministic evaluation of a proposed AI or human action against Number One's four-tier authority hierarchy (`L1`–`L4`), yielding `APPROVE`, `APPROVE_WITH_CONDITIONS`, `OVERRIDE`, or `BLOCK`.
- **Archify (`tt-a1i/archify`)**: A schema-validated visual architecture compiler that produces self-contained interactive HTML diagrams (10 native diagram types), 4-style One-Page Explainers, Story choreographies/walkthroughs, source-backed Code Analysis workbenches, and Pull Request visual packs.
- **Artifact Provenance (`npm publish --provenance`)**: Cryptographically signed SLSA build attestation generated via GitHub Actions OIDC (`id-token: write`) proving an npm tarball was built from a specific public commit and workflow.
- **ASVS (OWASP Application Security Verification Standard)**: Industry benchmark for application security controls enforced by `SecurityOfficer` practices (input validation, path confinement, secret hygiene, SSRF defenses).
- **Atomic File Write (`atomicWriteFileSync`)**: Crash-safe file update pattern that writes bytes to a unique sibling temporary file, flushes kernel buffers to disk via `fsyncSync`, sets POSIX permissions (`chmodSync`), and atomically replaces the target path via POSIX `renameSync`.
- **`Atomics.wait`**: JavaScript `SharedArrayBuffer` synchronization primitive used in `src/utils/lock.ts` to put a thread to sleep during lock contention with zero CPU spin-waiting.
- **Authoritative Mode (`strict` vs. `advisory`)**: Workspace configuration setting in `.numberone/config.json` controlling how aggressively Number One enforces directives and gates.
- **Authority Hierarchy (`L1` > `L2` > `L3` > `L4`)**: Number One's precedence model where `L1` (Cryptographic SoR Stream Invariants) overrides `L2` (Number One Directives), which overrides `L3` (Bridge Crew Officer Gates & Verified Lessons), which overrides `L4` (Ephemeral AI Session Context).

---

## B

- **Backoff with Jitter**: Resilience retry strategy in `resilientFetch` that increases wait delay exponentially (`baseDelayMs * 2^attempt`) plus random jitter so recovering GitHub/Jira servers are not hit by synchronized retry storms (thundering herd).
- **Backpressure (`stdin.pause` / `stdin.resume`)**: Flow-control mechanism in `NumberOneMcpServer` that pauses reading new requests from `stdin` while an asynchronous tool invocation is running, bounding memory consumption.
- **Base32 (Crockford's Base32)**: A 32-character human-safe encoding alphabet (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`, excluding visually ambiguous `I`, `L`, `O`, `U`) used to encode 128-bit ULIDs into 26-character strings.
- **Baseline Practice (`getBaselinePractices`)**: Built-in, domain-expert `KnowledgePractice` checks shipped with each Bridge Crew officer (`EngineeringOfficer`, `SecurityOfficer`, `BridgeOfficer`) at `knowledgeVersion = 1`.
- **Binary File Detection (`isBinaryBuffer`)**: Inspection of the first 8,192 bytes of a file for `NUL` (`0x00`) bytes so binary assets are hash-tracked without corrupting UTF-8 line diffs.
- **Blob (`BlobRef` / Fallback Blob)**: Large or unestructured artifacts (full command stdout/stderr logs, large file snapshots, full diffs) stored once by SHA-256 hash in `.numberone/fallback/blobs/<sha256>.blob` and referenced via `n1://fallback/<sha256>`.
- **BMAD (Breakthrough Method of Agile AI-Driven Development) Party Mode**: Multi-agent collaborative orchestration pattern implemented in `PartyModeOrchestrator` where specialized domain officers audit a workspace independently, challenge one another across domain boundaries, verify evidence in Round 2, and synthesize an authoritative ruling.
- **Bridge Crew**: Number One's specialist officer roster consisting of the **Engineering Officer**, **Security Officer**, and **Bridge Officer**.
- **Bridge Officer (`BridgeOfficer`)**: Specialist officer responsible for Continuous Delivery readiness (`continuous_delivery_score`), auditing automated tests, stream execution stability, CI workflows, release automation, static quality gates, and rollback runbooks.

---

## C

- **Canonical JSON (`canonicalJson`)**: Deterministic JSON serialization where object keys at every nesting depth are lexicographically sorted and whitespace is normalized, ensuring identical logical objects always produce identical SHA-256 digests across engines and OSes.
- **Capability Dropping (`--cap-drop=ALL`)**: Linux kernel security control removing all root POSIX `capabilities(7)` (such as `CAP_NET_RAW`, `CAP_SYS_ADMIN`, `CAP_CHOWN`) from a container process.
- **Catastrophic Backtracking**: Exponential `O(2^n)` CPU hang in NFA regular expression engines triggered by ambiguous nested quantifiers (e.g., `(a+)+`) on non-matching input. Prevented in Number One by `validateRegexSafety`.
- **Causation ID (`causationId`)**: Optional `StreamEvent` field naming the exact prior `event.id` that directly triggered the current event (forming a directed causal graph).
- **CGNAT (Carrier-Grade NAT, `100.64.0.0/10`)**: RFC 6598 shared address space blocked by `isPrivateOrReservedIp` to prevent SSRF against container/cloud overlay networks (such as Tailscale or internal service meshes).
- **Chained Git Hook**: A Git hook script installed by `installGitHooks` that preserves and executes any pre-existing user hook (such as Husky or Lefthook) before recording the Git lifecycle event in Number One.
- **Challenge Resolution (`ChallengeResolution`)**: Round 2 outcome in `PartyModeOrchestrator` classifying a `PeerChallenge` as `CONFIRMED`, `REBUTTED_BY_EVIDENCE`, or `ESCALATED`.
- **Code Analysis Workbench (`repo.analysis.html`)**: Archify source-backed repository diagnosis artifact visualizing module coupling, dependency cycles, architectural boundaries, and actionable refactoring tasks.
- **CodeQL**: GitHub's semantic static application security testing (SAST) engine configured in `.github/workflows/codeql.yml` to analyze TypeScript dataflow for security vulnerabilities.
- **Compaction (`context.compacted`)**: The truncation or summarization of an AI coding agent's conversation window when token limits are reached — the primary cause of institutional amnesia that Number One solves by persisting `chat.thinking`, `attempt.failed`, and `lesson.captured` in the external SoR stream.
- **Content-Addressed Storage (CAS)**: Storage scheme where each file's filename is the cryptographic SHA-256 hash of its contents (`<sha256>.blob`), guaranteeing automatic deduplication and tamper detection on read.
- **Continuous Delivery (CD)**: Software engineering discipline in which every change passing automated verification gates is releasable to production safely and repeatably at any time. Measured by `BridgeOfficer`'s `continuous_delivery_score`.
- **Correlation ID (`correlationId`)**: Shared identifier linking all `StreamEvent`s belonging to the same multi-step workflow, Party Mode session, or command execution run.
- **Counterfactual Replay (`counterfactual_replay`)**: Verification method in `KnowledgeEvolutionEngine` that evaluates a candidate officer practice before and after activation against labeled virtual workspace snapshots (`VerificationSample[]`) to prove positive KPI discrimination (`delta > 0`) without mutating live files.
- **CSPRNG (Cryptographically Secure Pseudo-Random Number Generator)**: Node's `crypto.randomBytes` entropy source used for the 80-bit random component of every ULID.
- **CWE (Common Weakness Enumeration)**: Standardized taxonomy of software security weaknesses (e.g., CWE-22 Path Traversal, CWE-78 OS Command Injection, CWE-798 Hardcoded Credentials, CWE-918 SSRF, CWE-1333 ReDoS) mitigated and audited by Number One.

---

## D

- **Daemon (`WatcherDaemonManager`)**: Detached background OS process (`n1 watch`) monitoring workspace filesystem mutations continuously across terminal and IDE sessions.
- **Dead-End (`attempt.failed`)**: A recorded approach or hypothesis that failed during debugging or implementation, stored in `WorkspaceProjection.failedAttempts` so future AI sessions are warned before repeating it.
- **Debounce (`debounceMs`)**: Coalescing window (default `250 ms`) in `WorkspaceFsWatcher` that groups rapid burst file writes (such as IDE save-all or `git checkout`) into clean atomic `fs.*` events.
- **Decision Matrix (`OfficerDecisionRow[]`)**: Structured summary table emitted by BMAD Party Mode showing each officer's KPI score, status (`APPROVE` / `CHALLENGE` / `VETO`), top finding, and peer challenge count.
- **Dependabot**: GitHub supply-chain automation configured in `.github/dependabot.yml` to open weekly version-update PRs for npm packages and GitHub Actions SHA pins.
- **Dependency Review (`dependency-review.yml`)**: Pull-request CI gate scanning `package-lock.json` diffs for known CVEs and copyleft license violations (`GPL`/`AGPL`) before merge.
- **Deterministic Replay**: Mathematical property of `ReplayEngine` whereby re-applying `events[1..k]` to `createInitialProjection` always produces the exact same `WorkspaceProjection` and `snapshotDigest` on any machine at any point in time.
- **Directive (`DirectiveRecord` / `directive.issued`)**: An authoritative rule (`advisory`, `mandatory`, or `blocking`) scoped to paths or tags, optionally carrying `forbiddenPatterns` and `requiredPatterns` enforced by `AuthorityEngine.arbitrate`.
- **Directory Persistence Adapter (`DirectoryPersistenceAdapter`)**: Local, NFS, or Git-worktree Scrum backend writing structured JSON and Markdown Kanban artifacts with zero SaaS or network dependency.
- **Distributed Integrity (`DistributedIntegrityReport`)**: End-to-end verification across local SHA-256 stream hashes, fallback blobs, projection snapshot digests, sync ledger mappings, and live remote GitHub/Jira records.
- **Documentary (`WorkspaceDocumentary`)**: Chronological, chapter-structured human narrative generated from raw atomic stream events (`n1 documentary`) reading like a documentary film log of everything that happened in the workspace.
- **Drilldown (`drilldowns` / `href` / `parentHref`)**: Archify cross-diagram navigation contract linking parent overview nodes directly to child detail HTML diagrams with automatic `Back` navigation.

---

## E

- **Empirical Benchmark (`empirical_benchmark`)**: Optional proof mode in `KnowledgeEvolutionEngine` (`n1 evolve --allow-exec`) that executes a real verification command with a bounded timeout to prove a candidate practice's efficacy.
- **Engineering Officer (`EngineeringOfficer`)**: Specialist Bridge Crew officer responsible for target runtime readiness (`runtime_readiness_score`), auditing runtime version pinning, lockfiles, container hardening, configuration docs, graceful shutdown handling, and crash debt.
- **Entity-Relationship Diagram (`erd`)**: Archify native diagram type (`sor-data-model-erd.html`) modeling physical data entities, typed columns, primary/foreign/unique keys, and relationship cardinalities.
- **`EPIPE` (Broken Pipe)**: POSIX error raised when writing to a pipe whose reader has closed (e.g., an IDE terminating an MCP server session); handled gracefully in `NumberOneMcpServer` to prevent unhandled crashes.
- **Error Signature (`errorSignature`)**: Normalized first diagnostic error line extracted from failed command output (`TypeError`, `ReferenceError`, `ENOENT`, `RUSTC`, `FAIL`, etc.) used by `LessonEngine` to match recurring crashes to verified resolutions.
- **ESM (ECMAScript Modules)**: Official JavaScript standard module system (`"type": "module"`, `import`/`export`) used throughout Number One (`NodeNext` module resolution).
- **Event Sourcing**: Architectural pattern in which every state change is stored as an immutable sequence of domain events (`StreamEvent`s), and current application state (`WorkspaceProjection`) is a pure derivative of replaying that log.
- **Explainer (`explainer` / `.archify.md`)**: Archify one-page conclusion-first technical brief supporting live switching across 4 visual typographic styles (`clean`, `editorial`, `product`, `swiss`), embedded compact diagrams, repo-pinned `@code` blocks, metrics, charts, and interactive checklists.

---

## F

- **Fallback Fields (`fallbackFields`)**: Fields or large binary/log payloads of a `StreamEvent` that exceed external Scrum service constraints (such as GitHub's 65,536-character Issue body limit or Jira field schemas) and are preserved losslessly in `.numberone/fallback/blobs/` while linked from the remote ticket.
- **`fsync` (`fs.fsyncSync`)**: POSIX system call forcing the operating system kernel to flush buffered file data from RAM page cache to non-volatile storage media before returning.

---

## G

- **Genesis Hash (`GENESIS_HASH`)**: The 64-zero-character string `'0000000000000000000000000000000000000000000000000000000000000000'` used as `prevHash` for sequence event `#1` (`workspace.attached`).
- **GHES (GitHub Enterprise Server)**: Self-hosted on-premises deployment of GitHub supported by `GitHubPersistenceAdapter` via `apiBaseUrl`.
- **GitHub Pages**: Static web hosting service integrated via `.github/workflows/pages.yml` (`actions/deploy-pages`) to publish Number One's documentation portal and interactive Archify suite at `https://onimurasame.github.io/numberone/`.
- **GitHub Projects v2**: GitHub's GraphQL-powered Scrum/Kanban planning engine integrated by `GitHubPersistenceAdapter` (`createProjectV2`, `addProjectV2ItemById`, `updateProjectV2ItemFieldValue`).
- **Glob (`matchGlobLinear`)**: Wildcard path pattern (`*`, `**`, `?`) evaluated in guaranteed `O(N * M)` linear time without regex conversion in `src/utils/safe-regex.ts`.
- **GraphQL**: Typed query and mutation API protocol used by `GitHubPersistenceAdapter` to inspect and mutate GitHub Projects v2 boards and status columns.

---

## H

- **Harness (AI Coding Harness)**: Any software environment hosting an AI coding assistant or developer workflow — such as Claude Code, Codex CLI, Cursor, Windsurf, Google Antigravity, Gemini CLI, GitHub Copilot, Cline, Roo Code, Zed, Aider, OpenCode, Goose, Devin, Amazon Q, Amp, or Junie.
- **Harness-Agnostic**: Architectural property meaning Number One depends on zero proprietary APIs of any single IDE or AI vendor, operating identically across all harnesses via `.numberone/`, POSIX CLI, hooks, universal shims, and `stdio` MCP.
- **Hash Chain**: Cryptographic structure in which event `k` embeds `prevHash = event[k-1].hash` and computes `hash = SHA256(canonicalJson(event[k]))`. Modifying, deleting, or reordering any historical event invalidates every subsequent hash up to `head.json`.
- **Head Pointer (`stream/head.json` / `StreamHead`)**: Atomic metadata file storing `{ seq, lastEventId, lastHash, updatedAt }` for `O(1)` stream tip verification and projection cache validation.

---

## I

- **Idempotency**: Property whereby executing an operation multiple times (such as `n1 attach .`, `n1 shims`, `n1 sync`, or `scripts/configure-github.sh`) converges cleanly to the same state without duplicating hooks, shims, or tickets.
- **In-Memory Virtual Matcher (`evaluatePracticeMatcherOnVirtualFiles`)**: Pure evaluation engine in `src/crew/base-officer.ts` that runs `KnowledgePractice` rules against virtual file maps during counterfactual evolution proofs.
- **Institutional Memory**: Durable organizational knowledge — why an architecture was chosen, which approaches failed, what caused past outages, and which invariants must hold — preserved permanently in `.numberone/` across AI context compactions and engineer handoffs.
- **Intermediate Thinking (`chat.thinking`)**: Reasoning steps, trade-off analyses, and hypotheses recorded mid-task (`n1 think`) so downstream sessions inherit *why* a solution evolved, not merely the final git diff.

---

## J

- **JQL (Jira Query Language)**: Structured query syntax used by `JiraPersistenceAdapter` (`project = "KEY" AND labels = "n1-managed" ORDER BY updated ASC`) to pull external Jira Scrum updates.
- **JSON-RPC 2.0**: Lightweight stateless remote procedure call protocol (`{"jsonrpc":"2.0","id":1,"method":"...","params":{...}}`) underlying the Model Context Protocol (`MCP`).
- **JSONL (JSON Lines / NDJSON)**: Newline-delimited UTF-8 file format (`.numberone/stream/events.jsonl`) where each line is a self-contained, atomic JSON `StreamEvent`, enabling `O(1)` append-only writes and line-by-line streaming recovery.

---

## K

- **Knowledge Practice (`KnowledgePractice`)**: A versioned, auditable rule (`check`, `tool`, `methodology`, `process`, or `control`) held in an officer's state projection and evaluated during workspace audits.
- **KPI (Key Performance Indicator)**: Quantitative `0..100` domain score tracked per Bridge Crew officer (`runtime_readiness_score`, `security_posture_score`, `continuous_delivery_score`). Officer knowledge updates are accepted **if and only if** factually proven to increase the officer's main KPI (`delta > 0`).

---

## L

- **L1 — SoR Invariant (`L1_SOR_INVARIANT`)**: Highest tier of Number One authority: verified cryptographic stream facts and unresolved critical workspace crashes on target paths.
- **L2 — Number One Directive (`L2_NUMBER_ONE_DIRECTIVE`)**: Second tier of authority: active directives issued by `numberone` (via operator CLI or Bridge Crew veto/consensus).
- **L3 — Officer Gate (`L3_OFFICER_GATE`)**: Third tier of authority: specialist officer directives, verified `high`/`critical` Lesson prevention rules, and active ADRs.
- **L4 — Session Context (`L4_SESSION_CONTEXT`)**: Lowest tier of authority: ephemeral chat prompts, compacted summaries, or unverified AI agent assumptions. Always superseded by `L1`–`L3` on conflict.
- **Lesson Learned (`LessonRecord` / `lesson.captured`)**: Structured institutional memory entry recording `problem`, `rootCause`, `failedApproaches`, `resolution`, `preventionRule`, and `errorSignatures`.
- **Link-Local / Cloud Metadata IP (`169.254.169.254`)**: Non-routable IPv4 range (`169.254.0.0/16`) used by AWS/GCP/Azure instance metadata services to vend IAM credentials; strictly blocked by `isPrivateOrReservedIp` in `src/utils/http.ts`.

---

## M

- **MCP (Model Context Protocol)**: Open `JSON-RPC 2.0` standard enabling AI coding harnesses to discover and invoke external tools (`tools/list`, `tools/call`) and read live context resources (`resources/list`, `resources/read`). Implemented zero-dependency in `NumberOneMcpServer`.
- **Monotonicity**: Property of `seq` (`1, 2, 3, ...`) and `generateUlid()` guaranteeing strictly increasing ordering even when multiple events occur within the same millisecond.
- **Multi-Stage Dockerfile**: Container build pattern separating build-time compilers (`typescript`, devDependencies) in a builder stage from a minimal hardened production image containing only compiled JS, `zod`, and `tini`.

---

## N

- **`no-new-privileges` (`NoNewPrivileges`)**: Linux kernel `prctl(PR_SET_NO_NEW_PRIVS)` security bit preventing `execve` calls from granting elevated privileges via `setuid`/`setgid` binaries.
- **Number One (`n1` / `NumberOneAgent`)**: The authoritative workspace curator, event-sourced System of Record, institutional memory engine, and Bridge Crew commander.

---

## O

- **`O_CREAT | O_EXCL` (`wx` flag)**: Atomic POSIX `open(2)` flag combination that fails with `EEXIST` if the file already exists, preventing race conditions when creating lockfiles or temporary atomic-write files.
- **`O_NOFOLLOW`**: POSIX `open(2)` flag instructing the kernel to fail with `ELOOP` if the target filename is a symbolic link, neutralizing symlink-swap Time-of-Check to Time-of-Use (`TOCTOU`) attacks.
- **OIDC (OpenID Connect)**: Short-lived cryptographic identity token mechanism (`id-token: write`) used by GitHub Actions in `release.yml` and `pages.yml` instead of long-lived static deployment secrets.

---

## P

- **Party Mode (`n1 party`)**: Interactive or automated 3-round Bridge Crew session where Engineering, Security, and Bridge Officers independently assess the workspace, cross-verify peer challenges, correlate historical SoR precedents, and issue a joint ruling.
- **Path Confinement (`isPathConfinedToRoot` / `isWritablePathConfinedToRoot`)**: Canonical `fs.realpathSync` boundary check verifying that a resolved target path resides strictly inside `workspaceRoot` and cannot escape via `..` traversal or symlinks to outside directories.
- **Peer Challenge (`PeerChallenge`)**: Cross-domain critique raised by one Bridge Crew officer against another during Round 1 (for example, `SecurityOfficer` challenging `BridgeOfficer` when unpinned GitHub Actions threaten release integrity).
- **Persistence Fabric (`PersistenceFabric`)**: Distributed synchronization coordinator maintaining consistency and lossless fallback across `.numberone/`, Directory Scrum, GitHub Issues/Projects v2, and Jira.
- **PID Reuse / `/proc/<pid>/stat` Start Ticks (`readProcStartTicks`)**: Operating system phenomenon where a terminated daemon's numeric process ID (`PID`) is later assigned to an unrelated process. Mitigated in `WatcherDaemonManager` and `lock.ts` by binding PIDs to field 22 (`starttime` in kernel clock ticks) of `/proc/<pid>/stat` on Linux.
- **PKI (Public Key Infrastructure)**: Enterprise certificate hierarchy used to sign internal HTTPS services (GHES, Jira Data Center, vLLM), trusted in Node.js via `NODE_EXTRA_CA_CERTS`.
- **Podman (Rootless)**: Daemonless OCI container engine capable of running containers entirely under an unprivileged user namespace without a root daemon.
- **POSIX Permissions (`0o700` / `0o600`)**: Unix filesystem mode bits restricting `.numberone/` (`rwx------`) and `.numberone/stream/events.jsonl` (`rw-------`) exclusively to the workspace owner UID.
- **PR Pack (`archify-pr` / `pr-pack.schema.json`)**: Archify pull-request review artifact highlighting `added`, `modified`, and `removed` (ghost) architecture/schema/sequence elements introduced by a branch diff.
- **Projection (`WorkspaceProjection`)**: Materialized in-memory and cached (`projections/state.json`) view of current workspace state computed by folding `StreamEvent`s through `ReplayEngine`.
- **Prototype Pollution**: JavaScript vulnerability where untrusted JSON keys (`__proto__`, `constructor`, `prototype`) mutate `Object.prototype` or intercept property lookups; blocked globally in `canonicalJson`, `redactObjectDeep`, and record maps via `isSafeRecordKey`.

---

## R

- **Read-Only Root Filesystem (`--read-only` / `readOnlyRootFilesystem: true`)**: Container security control mounting `/` immutable so an attacker cannot modify runtime binaries or libraries even if code execution were achieved.
- **Reconcile (`n1 reconcile`)**: Comparison of current live workspace files against `WorkspaceProjection.files` to detect and record manual edits, creations, or deletions performed while `n1 watch` was not running.
- **Redaction (`redactSecrets` / `redactObjectDeep`)**: Linear-time sanitization pass applied before any stream write or blob persistence that replaces secret credentials (API keys, PATs, JWTs, PEM blocks, cloud keys, Basic/Bearer headers, URL userinfo, SAS signatures) with `[REDACTED:<KIND>]`.
- **ReDoS (Regular Expression Denial of Service, CWE-1333)**: Algorithmic complexity attack exploiting backtracking regexes to freeze Node's single-threaded event loop; prevented by `validateRegexSafety` and `matchGlobLinear`.
- **Remediation Plan (`RemediationItem[]`)**: Prioritized, deduplicated action list produced by `PartyModeOrchestrator` ranking concrete fixes (`P0` -> `P3`) with file targets and owning officers.
- **Replay Engine (`ReplayEngine`)**: Deterministic event-sourcing fold engine (`src/core/replay-engine.ts`) that reconstructs `WorkspaceProjection` from `events.jsonl` and supports historical time-travel (`--until-seq`, `--until-timestamp`).
- **Rollback (`scripts/rollback.sh` / `revertPractice`)**: Automated procedure to restore a previous known-good git tag/release (`scripts/rollback.sh`) or deactivate a regressed officer practice (`n1 evolve revert`).

---

## S

- **SAST (Static Application Security Testing)**: Source-code security analysis performed without executing the program (implemented both by `SecurityOfficer` and `.github/workflows/codeql.yml`).
- **Scoped Environment Variable (`resolveScopedEnvVar`)**: Security mechanism requiring credential environment variable names in `.numberone/config.json` to match strict patterns and binding each credential exclusively to its declared HTTPS `origin`, blocking cross-host credential exfiltration.
- **Scrum**: Agile delivery framework utilizing Sprints, Epics, Stories, Bugs, Tasks, Priorities, and Kanban status columns — mapped natively across Directory Scrum, GitHub Issues + Projects v2, and Jira Agile boards.
- **Security Officer (`SecurityOfficer`)**: Specialist Bridge Crew officer responsible for application, supply-chain, container, and CI/CD security posture (`security_posture_score`).
- **SELinux (`:Z` Volume Relabeling)**: Mandatory Access Control (MAC) kernel module on RHEL/Fedora/CentOS requiring `:Z` private MCS relabeling on container bind mounts.
- **Semantic Passport**: Interactive detail panel inside Archify HTML viewers displaying a focused component's `explanation`, verified repository `sources` (file + line range), message/flow `payload` samples, and child `drilldowns`.
- **SHA-256 (Secure Hash Algorithm 256-bit)**: NIST FIPS 180-4 cryptographic hash function producing 256-bit (64-hex-char) collision-resistant digests for stream hash chaining, content-addressed blobs, snapshot digests, and GitHub Actions/Docker pinning.
- **Shim (`installHarnessShims`)**: Idempotent instruction block injected into `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/numberone.mdc`, and `.github/copilot-instructions.md` teaching any AI harness how to consult and obey Number One.
- **`SIGTERM` / `SIGINT` / `tini`**: POSIX termination signals sent by `docker stop`, Kubernetes, or `Ctrl+C`. `tini` runs as PID 1 in Number One's `Dockerfile` to forward signals cleanly and reap zombie child processes while `WorkspaceFsWatcher` flushes pending diffs before exiting `0`.
- **SLSA (Supply-chain Levels for Software Artifacts)**: Security framework for build integrity, dependency pinning, and cryptographic provenance enforced via 40-char SHA-pinned workflows and `npm publish --provenance`.
- **Snapshot Digest (`snapshotDigest`)**: Canonical SHA-256 checksum stored inside `.numberone/projections/state.json` and recomputed on load by `computeProjectionDigest` to guarantee cached projections have not been manually edited or corrupted.
- **SoR (System of Record)**: The single authoritative data source for a given domain. Number One is the authoritative SoR for workspace history, architectural decisions, lessons learned, active directives, and release readiness.
- **SSDF (NIST SP 800-218 Secure Software Development Framework)**: Federal secure software lifecycle methodology whose practices map directly to Number One's CI/CD, CodeQL, dependency review, and `SecurityOfficer` checks.
- **SSRF (Server-Side Request Forgery, CWE-918)**: Attack inducing a server/CLI process to issue HTTP requests to internal/loopback/cloud-metadata endpoints; blocked in `src/utils/http.ts` by `validateHttpUrl` and `isPrivateOrReservedIp`.
- **`stdio` Transport**: Standard input (`fd 0`) and standard output (`fd 1`) IPC pipe channel used by `NumberOneMcpServer` for zero-port, zero-network local communication with AI coding harnesses.
- **Story Choreography (`story-choreography` / `story stage` / `story attach`)**: Archify guided walkthrough and multi-diagram animation engine supporting step-by-step narrative captions, cross-view transitions, code callouts, dual-theme animated SVGs, and 1080p60 WebM/MP4 video export.
- **Stream Event (`StreamEvent`)**: Single immutable, timestamped, ULID-identified, SHA-256 hash-chained fact recorded in `.numberone/stream/events.jsonl`.
- **Sync Ledger (`.numberone/sync/ledger.json` / `SyncLedger`)**: Local mapping table tracking `eventId -> RemoteRecordRef` and pulled external hashes (`externalId -> syncedHash`) across Directory, GitHub, and Jira adapters.

---

## T

- **Time-Travel Replay (`--until-seq` / `--until-timestamp`)**: Reconstructing the exact `WorkspaceProjection` as it existed at any historical sequence number or ISO-8601 timestamp without mutating current state.
- **TOCTOU (Time-of-Check to Time-of-Use)**: Race-condition vulnerability class where a file path checked for safety is swapped for a symlink before `open(2)`. Mitigated via `O_NOFOLLOW` descriptor operations and `realpathSync` confinement.
- **Transcript Ingestor (`ingestTranscriptFile`)**: Parser in `src/watchers/transcript-ingestor.ts` converting offline chat transcripts (`.jsonl`, `.json`, `.md`) into structured `StreamEvent`s.

---

## U

- **ULID (Universally Unique Lexicographically Sortable Identifier)**: 128-bit identifier (`48-bit` ms timestamp + `80-bit` monotonic randomness) encoded as 26 Crockford Base32 characters (e.g., `01KBC8Z9Q4...`), combining UUID collision resistance with chronological sortability.
- **Unified Diff (`computeUnifiedDiff`)**: Compact line-oriented patch representation (`@@ -a,b +c,d @@` with `+`/`-` lines) computed in `src/utils/diff.ts` for workspace file edits.

---

## V

- **Verification Sample (`VerificationSample`)**: Labeled virtual file map (`expectedViolation: boolean`) supplied inside a `KnowledgeProof` to test whether a proposed officer practice accurately distinguishes compliant workspaces from non-compliant ones.
- **Veto (`crew.veto`)**: Authoritative block raised by a Bridge Crew officer during Party Mode when a `critical`-severity risk is found, automatically issuing an active `L2` `blocking` directive until remediated.

---

## W

- **Waterfall Diagram (`waterfall`)**: Archify native diagram type (`party-sync-waterfall.html`) showing parent-child execution spans, durations, and concurrency on a shared horizontal millisecond timeline.
- **Worktree (`git worktree`)**: Git feature allowing multiple branches (such as `master` for code and an orphan `n1-scrum-board` branch for `DirectoryPersistenceAdapter`) to be checked out simultaneously in sibling directories sharing one `.git` object store.

---

## Z

- **Zod**: TypeScript-first schema declaration and runtime validation library (`zod ^4.x`) — Number One's sole production runtime dependency, enforcing strict fail-closed validation on stream events, config files, and evolution proposals.
