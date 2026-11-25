# Number One (`n1`) — Complete Archify Visual Architecture & Diagnosis Guide

Number One leverages **100% of [Archify](https://github.com/tt-a1i/archify) v3.3.0's capabilities** to document, verify, animate, and diagnose every layer of the codebase against real committed repository evidence (`--repo-root`).

Every interactive HTML deliverable is self-contained (zero external runtime or CDN dependencies, light/dark themes, keyboard navigation, Semantic Passports, and offline SVG/PNG/WebM/MP4 export) and hosted live on **GitHub Pages** (`https://onimurasame.github.io/numberone/`). Every dual-theme SVG (`-light.svg` / `-dark.svg`) in [`docs/assets/archify/`](./assets/archify/) is validated **GitHub Camo-safe** for `<picture>` rendering in [`README.md`](../README.md).

---

## 1. Complete Artifact Inventory

### A. All 10 Native Interactive Diagram Types (`docs/site/archify/`)

| # | Archify Type | Interactive HTML Viewer | Dual-Theme Camo SVGs (`docs/assets/archify/`) | What It Documents |
|---|---|---|---|---|
| 1 | `architecture` | `system-overview.html` | `system-overview-{light,dark}.svg` | End-to-end system topology, trust boundaries (`.numberone` `0o700`), Semantic Passports, 19 pinned `src/` line citations, and cross-diagram `drilldowns` to all 9 child diagrams |
| 2 | `workflow` (v2) | `bmad-party-workflow.html` | `bmad-party-workflow-{light,dark}.svg` | 3-Round BMAD Party Mode audit, Round 2 peer challenge verification (`CONFIRMED` / `REBUTTED_BY_EVIDENCE` / `ESCALATED`), precedent matching, and automatic `L2` veto block |
| 3 | `sequence` | `mcp-arbitration-sequence.html` | `mcp-arbitration-sequence-{light,dark}.svg` | `stdio` JSON-RPC 2.0 MCP consultation, `L1`–`L4` arbitration, SHA-256 append, and Scrum sync with sample JSON-RPC `payload` inspectors |
| 4 | `dataflow` | `stream-sync-dataflow.html` | `stream-sync-dataflow-{light,dark}.svg` | 5-stage pipeline from workspace sensors through `O(n)` secret redaction into `events.jsonl`, CAS blobs, and Directory / GitHub Projects v2 / Jira mirrors |
| 5 | `lifecycle` (v3) | `directive-evolution-lifecycle.html` | `directive-evolution-lifecycle-{light,dark}.svg` | KPI-gated `KnowledgeEvolutionEngine` state machine (`Proposed` -> `Safety Gate` -> `KPI Proof` -> `Promoted` -> `Live` -> `Regressed` -> `Reverted`) |
| 6 | `erd` | `sor-data-model-erd.html` | `sor-data-model-erd-{light,dark}.svg` | Physical `.numberone/` entity-relationship model (`stream_events`, `fallback_blobs`, `lessons`, `directives`, `issues`, `sync_ledger`) |
| 7 | `class` | `core-classes.html` | `core-classes-{light,dark}.svg` | TypeScript class, abstract class, and interface composition (`NumberOneAgent`, `NumberOneMcpServer`, `StreamStore`, `PartyModeOrchestrator`, `BaseBridgeOfficer`, `PersistenceFabric`, `PersistenceAdapter`) |
| 8 | `tree` | `repository-capability-tree.html` | `repository-capability-tree-{light,dark}.svg` | Acyclic package containment hierarchy across `src/core`, `src/persistence`, `src/watchers`, `src/crew`, `src/harness`, and `src/utils` |
| 9 | `timeline` | `crash-to-lesson-timeline.html` | `crash-to-lesson-timeline-{light,dark}.svg` | Proportional multi-lane operational timeline illustrating cross-harness crash capture, dead-end preservation, harness switch, and automatic fix-to-lesson synthesis |
| 10 | `waterfall` | `party-sync-waterfall.html` | `party-sync-waterfall-{light,dark}.svg` | Nested execution span breakdown (`ms`) across `ReplayEngine`, 3 specialist officers, `DirectoryAdapter`, `GitHubAdapter`, and `verifyDistributedIntegrity` |

### B. Advanced Archify Deliverables (`explainer`, `story`, `compare`, `code-analysis`, `pr-pack`)

| Feature | Artifact Path (`docs/site/archify/`) | Capabilities Exercised |
|---|---|---|
| **4-Style One-Page Explainer** | `how-numberone-works-explainer.html` | Compiled from `how-numberone-works.archify.md`; supports live reader switching across **`clean`**, **`editorial`**, **`product`**, and **`swiss`** visual styles + dark/light mode, compact `@architecture` & `@sequence` diagrams, `@steps` interactive code tour, live repo-pinned `@code` excerpt, Mermaid `xychart-beta` KPI chart, `@facts`, comparison badges, and interactive verification checklist |
| **Viewer Guided Story Walkthrough** | `system-overview-story.html` | Compiled via `archify story attach` with `system-story-brief.json`; adds narrated 3-scene guided playback, WebAudio synthesized soundtrack, live edge-token tracing, pinned code highlights, and built-in **1080p60 WebM (VP9/Opus) & MP4 (H.264/AAC) video export** |
| **Multi-View Component Choreography** | `choreography-stage.html` + `docs/assets/archify/choreography-{light,dark}.svg` | Compiled via `archify story stage` & `archify story svg --theme both`; morphs shared components smoothly across `architecture` -> `workflow` -> `dataflow` with live `metrics` (`before -> after`), `callouts`, `trace` tokens, and `detail` source panels |
| **Architecture Before/After Comparison** | `architecture-comparison.html` | Compiled via `archify compare architecture`; contrasts a local-only curator baseline against Number One's full authoritative Bridge Crew + distributed Scrum fabric |
| **Code Analysis & Diagnosis Workbench** | `code-analysis/repo.analysis.html` | Compiled via `archify code-analysis prepare --ir system-overview.architecture.json --language ts`; provides source-backed module dependency graphs, radial star map, rotatable 3D dependency Atlas, coupling/hotspot metrics, and copyable AI refactoring tasks |
| **Pull Request Walkthrough Pack (`archify-pr`)** | `pr-pack/` + `[archify pr: ask, target=comment]` in `CONTRIBUTING.md` | Compiled via `archify pr validate` & `archify pr build`; produces GitHub-ready PR visual review pack tracking `added`/`modified` services, endpoints, and tables |

---

## 2. Interactive Viewer Controls

- **Semantic Passport & Source Evidence**: Click any node, participant, state, or entity to inspect its role explanation, verified repository file/line citations, sample message payloads, and child diagram drilldowns.
- **Cross-Diagram Drilldowns**: On `system-overview.html`, click a component to view all child diagrams in its Passport (or `Ctrl+Click` / double-click to jump straight into the primary child diagram, then use the header **Back** button to return).
- **Theme & Preset Controls**: Toggle Light/Dark mode, switch Live/Still signal-flow motion, search nodes (`/`), or export high-DPI PNG, SVG, or 1080p60 video directly from the Viewer toolbar.
- **Explainer Style Switcher**: On `how-numberone-works-explainer.html`, switch live between `Clean`, `Editorial`, `Product`, and `Swiss` typographic layouts.
