# How does BMAD Party Mode enforce release readiness, evolve officers with proof, and sync Scrum losslessly? {#adv-bmad-explainer}

`examples/advanced-bmad-crew-evolution/run.mjs` executes a full 4-phase DevSecOps hardening lifecycle on a real microservice — transitioning from a **Phase 1 Veto** through **KPI-Gated Counterfactual Officer Evolution** to a **Phase 3 Consensus** and **100% Verified Air-Gapped Scrum Sync**, visualized inside a **Three.js 3D Command Bridge**.

- **Phase 1 (`assembleCrew`)**: Audits an unhardened `USER root` service, verifies Round 2 peer challenges (`CONFIRMED`), and emits `crew.veto` + automatic `L2` blocking directive (`Eng 53.3`, `Sec 40`, `Bridge 0`).[](source:phase1_veto)
- **Phase 2 (`proposeKnowledgeUpdate`)**: Rejects an overbroad regex with false positives (`fp=1`) while promoting a precise `CWE-78` rule proven via counterfactual virtual-file replay (`delta=+100`, `fp=0`).[](source:evo_promote)
- **Phase 3 (`assembleCrew`)**: After applying non-root containers, lockfile, SHA-pinned CI/Release workflows, tests, and rollback runbook, reaches `crew.consensus` (`Eng 100`, `Sec 100`, `Bridge 86.4`).[](source:phase3_consensus)
- **Phase 4 (`syncPush` + `verifyIntegrity`)**: Mirrors `29/29` verified events to an air-gapped `DirectoryPersistenceAdapter` Kanban board.[](source:scrum_sync)

@answer scope="Advanced DevSecOps Sample · BMAD Party Mode, KPI Evolution, Air-Gapped Scrum & Three.js Bridge"
@meta locale=en style=swiss repo_url=https://github.com/Shadow-Software-Platform/numberone.git repo_revision=fc10c03081e1eb7b0c75c8828ec1be77b7de8e14
@source phase1_veto title="Phase 1 Pre-Hardening Party Mode Veto" path=examples/advanced-bmad-crew-evolution/run.mjs lines=105:113
@source evo_promote title="Promote Counterfactual CWE-78 Security Practice" path=examples/advanced-bmad-crew-evolution/run.mjs lines=157:184
@source phase3_consensus title="Phase 3 Post-Remediation Consensus" path=examples/advanced-bmad-crew-evolution/run.mjs lines=302:309
@source scrum_sync title="Distributed Scrum Sync & Verification" path=examples/advanced-bmad-crew-evolution/run.mjs lines=311:315

## How do KPI scores evolve across hardening phases? {#bmad-kpi-chart}

```mermaid title="Measured Officer KPI Progression: Phase 1 (Veto) vs Phase 3 (Consensus)"
xychart-beta
  x-axis ["Engineering P1", "Engineering P3", "Security P1", "Security P3", "Bridge P1", "Bridge P3"]
  y-axis "KPI Score (0-100)" 0 --> 100
  bar "Officer KPI Score" [53.3, 100, 40, 100, 0, 86.4]
```

## How does KnowledgeEvolutionEngine prevent rule hallucination? {#evo-gate-table}

| Candidate Security Practice | Recall on Incident Blob | False Positives on Clean Sample | KPI Delta | Decision |
| --- | --- | --- | --- | --- |
| `sec-overbroad-exec-word` (`exec`) | Caught | `1` (`executeHealthCheck`) | `0` | Rejected {bad:Rejected} |
| `sec-forbid-interpolated-execsync` (CWE-78) | `0% -> 100%` | `0` (`execFileSync`) | `+100` | Promoted {good:Promoted} |

@code source=evo_promote language=js

@facts
| Phase 1 -> Phase 3 Verdict | `crew.veto` (L2 Block) -> `crew.consensus` (Auto-Superseded) |
| Officer KPI Proof Delta | `+100` recall delta with `0` false positives on clean code |
| Distributed Scrum Parity | `29 / 29` remote Kanban records verified (`distributedValid = true`) |

## Explore the 3D Command Bridge {#bmad-checklist}

- [ ] Run `node examples/advanced-bmad-crew-evolution/run.mjs` to execute all 4 phases live with zero mocks.
- [ ] Open the **Three.js 3D Command Bridge** and switch between **Phase 1 (Veto)**, **Phase 2 (KPI Evolution)**, and **Phase 3 (Consensus + Sync)**.
- [ ] Click each 3D Officer Tower, the orbiting Rejected/Promoted Evolution Orbs, and the Distributed Scrum Sync Node to inspect live JSON telemetry.
