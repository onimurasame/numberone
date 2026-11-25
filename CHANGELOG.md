# Changelog

All notable changes to **Number One (`n1`)** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **License (`AGPL-3.0-or-later`)**: Transitioned Number One from MIT to the **GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`)** to ensure the software, derivative works, and modified network/cloud deployments remain permanently free and open source (OSI- and FSF-approved). Added [`NOTICE`](./NOTICE) documenting copyright, workspace scope clarification, historical MIT transition provenance, and third-party attributions; updated `package.json`, `package-lock.json`, `Dockerfile` OCI metadata/runtime image, `README.md`, `CONTRIBUTING.md`, `docs/site/index.html`, `docs/ONPREM.md`, `docs/GLOSSARY.md`, and `.github/workflows/dependency-review.yml` license policy.

## [1.0.0] - 2026-11-23

### Added
- **Append-Only Cryptographic Event Stream (`StreamStore`)**: Local `.numberone/stream/` System of Record (SoR) storing discrete atomic `StreamEvent` records (47 event types) linked by canonical JSON SHA-256 hash chaining (`prevHash` -> `hash`), monotonic sequence numbers (`seq`), Crockford Base32 ULIDs, `0o700`/`0o600` POSIX permissions, symlink-safe confinement (`O_NOFOLLOW`), `fsync` durability, and content-addressed fallback blobs (`n1://fallback/<sha256>`).
- **Deterministic Replay & Snapshot Integrity (`ReplayEngine`)**: Rebuilds complete `WorkspaceProjection` state (`PROJECTION_VERSION = 3`) from genesis or time-travels via `--until-seq` / `--until-timestamp`, guarded by canonical `snapshotDigest` verification.
- **Authoritative Precedence & Arbitration (`AuthorityEngine`)**: Enforces strict four-tier authority (`L1` Cryptographic Stream History > `L2` Active Blocking/Mandatory Directives > `L3` Verified Lessons & ADRs > `L4` Ephemeral AI Session Context) with affirmative-clause extraction and linear-time ReDoS-safe pattern checks.
- **Institutional Memory & Crash-to-Fix Correlation (`LessonEngine`)**: Captures durable Lessons Learned, failed dead-end approaches, intermediate reasoning (`chat.thinking`), and automatic failure-to-resolution lesson synthesis during `n1 exec`.
- **Distributed Scrum Persistence Fabric (`PersistenceFabric`)**: Synchronizes issues, lessons, directives, decisions, crashes, and rulings across `.numberone/` fallback storage, Git-worktree/NFS Directory Scrum boards (`DirectoryPersistenceAdapter`), GitHub Issues + Projects v2 GraphQL (`GitHubPersistenceAdapter`), and Jira Cloud/Data Center REST API v3 + Agile v1.0 (`JiraPersistenceAdapter`) with SSRF protection, scoped credential binding, and retry/jitter resilience.
- **Harness-Agnostic Watchers & MCP Server**: Real-time `WorkspaceFsWatcher`, `WatcherDaemonManager` with `/proc/<pid>/stat` start-tick verification, non-clobbering Git hooks (`--git-path hooks`), POSIX shell crash hooks (`bash`/`zsh`), multi-format `ingestTranscriptFile`, universal instruction shims (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/numberone.mdc`, `.github/copilot-instructions.md`, `.mcp.json`), and `NumberOneMcpServer` over stdio JSON-RPC 2.0 (12 tools, 4 resources, pre-allocation line-length DoS guard, `L4` privilege boundary).
- **BMAD Party Mode Bridge Crew (`PartyModeOrchestrator`)**: Multi-round collaborative audit across `EngineeringOfficer`, `SecurityOfficer`, and `BridgeOfficer` featuring Round 1 independent telemetry assessment, Round 2 peer challenge verification (`CONFIRMED` / `REBUTTED_BY_EVIDENCE` / `ESCALATED`), SoR precedent correlation, officer decision matrix, ranked remediation plan, and automatic blocking `L2` directive issuance on veto.
- **Empirically Verified KPI Self-Evolution (`KnowledgeEvolutionEngine`)**: Accepts new officer `KnowledgePractice` rules only when counterfactual virtual-file replay or opt-in empirical benchmark factually proves a positive delta (`delta > 0`) on the officer's primary KPI, backed by automated KPI regression auditing and practice rollback.
- **Comprehensive Documentation, Archify Visual Suite & GitHub Pages Portal**: Complete documentation across `README.md`, `docs/INSTALLATION.md` (23+ AI harnesses, generic harness-agnostic, and on-premises/air-gapped), `docs/ONPREM.md`, `docs/CODE_REFERENCE.md`, `docs/GLOSSARY.md`, interactive Archify v3.3.0 artifacts (all 10 native diagram types, 4-style Explainer, Story walkthrough & choreography stage, Code Analysis workbench, and PR Pack), and automated GitHub Pages deployment.
