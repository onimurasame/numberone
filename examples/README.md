# Number One (`n1`) — Interactive 3D Examples (Three.js + Archify)

Explore **4 fully runnable samples** — **2 for kids & school projects** and **2 for advanced technical engineering** — each backed by real, zero-mock `numberone` execution, an interactive **Three.js 3D visualization**, and thorough **Archify v3.3.2** documentation (interactive diagram viewer + 4-style One-Page Explainer + dual-theme GitHub SVGs).

> **Launch all 4 live in your browser on GitHub Pages:**  
> **[https://shadow-software-platform.github.io/numberone/#samples-3d](https://shadow-software-platform.github.io/numberone/#samples-3d)**

---

## Kids & School Project Examples

| Sample | What You'll Explore | Interactive 3D View (Three.js) | Archify Docs | Runnable Script |
|---|---|---|---|---|
| **1. Paper Airplane Science Fair Flight Lab** | Hypotheses, Trial #2 tail-weight dead-end stall (`1.4m`), verified balance/wingtip lessons (`10.6m`), dead-end consultation, and printable 9-chapter report | [Open 3D Flight Lab](https://shadow-software-platform.github.io/numberone/examples/kids-science-fair-glider/) | [Timeline](https://shadow-software-platform.github.io/numberone/archify/examples/kids-science-fair-glider-timeline.html) · [4-Style Explainer](https://shadow-software-platform.github.io/numberone/archify/examples/kids-science-fair-glider-explainer.html) | [`kids-science-fair-glider/`](./kids-science-fair-glider/README.md) |
| **2. RoboHawks Safety Arena & Time Machine** | Club tasks, blocking `L2` motor speed cap (`<= 80%`), crimson 3D laser barrier halting `setSpeed(100)`, negation-aware approval, and `replay({ untilSeq })` time-travel | [Open 3D Robotics Arena](https://shadow-software-platform.github.io/numberone/examples/kids-robotics-arena/) | [Sequence](https://shadow-software-platform.github.io/numberone/archify/examples/kids-robotics-arena-sequence.html) · [4-Style Explainer](https://shadow-software-platform.github.io/numberone/archify/examples/kids-robotics-arena-explainer.html) | [`kids-robotics-arena/`](./kids-robotics-arena/README.md) |

---

## Advanced Technical Examples

| Sample | What You'll Explore | Interactive 3D View (Three.js) | Archify Docs | Runnable Script |
|---|---|---|---|---|
| **3. SHA-256 Hash-Chain Helix, CAS Blobs & Replay Observatory** | Canonical JSON SHA-256 chaining from `GENESIS_HASH`, `O(n)` secret redaction (`0` leaks), `n1://fallback/<sha256>` CAS blobs, affirmative arbitration, `snapshotDigest` replay, and 1-byte fail-closed tamper cascade | [Open 3D Hash-Chain Helix](https://shadow-software-platform.github.io/numberone/examples/advanced-hash-chain-time-travel/) | [Dataflow](https://shadow-software-platform.github.io/numberone/archify/examples/advanced-hash-chain-time-travel-dataflow.html) · [4-Style Explainer](https://shadow-software-platform.github.io/numberone/archify/examples/advanced-hash-chain-time-travel-explainer.html) | [`advanced-hash-chain-time-travel/`](./advanced-hash-chain-time-travel/README.md) |
| **4. BMAD Bridge Crew, KPI Self-Evolution & Scrum Command Bridge** | Phase 1 `crew.veto` + `L2` block, Phase 2 counterfactual KPI evolution (reject false positive vs. promote `+100 delta` CWE-78 rule), Phase 3 hardened `crew.consensus`, and Phase 4 `29/29` verified air-gapped Scrum Kanban parity | [Open 3D Command Bridge](https://shadow-software-platform.github.io/numberone/examples/advanced-bmad-crew-evolution/) | [Workflow](https://shadow-software-platform.github.io/numberone/archify/examples/advanced-bmad-crew-evolution-workflow.html) · [4-Style Explainer](https://shadow-software-platform.github.io/numberone/archify/examples/advanced-bmad-crew-evolution-explainer.html) | [`advanced-bmad-crew-evolution/`](./advanced-bmad-crew-evolution/README.md) |

---

## Run All 4 Examples Locally

```bash
# Build the library once
npm run build

# Run any sample and watch real Number One telemetry execute with zero mocks:
node examples/kids-science-fair-glider/run.mjs
node examples/kids-robotics-arena/run.mjs
node examples/advanced-hash-chain-time-travel/run.mjs
node examples/advanced-bmad-crew-evolution/run.mjs

# Optional: refresh any sample's Three.js 3D data.json feed directly:
node examples/kids-science-fair-glider/run.mjs --out docs/site/examples/kids-science-fair-glider/data.json
```

---

## Related Documentation

- **[Friendly Non-Technical README](../README.md)**
- **[Kids & School Projects Guide](../docs/KIDS_AND_SCHOOL_PROJECTS.md)**
- **[Full Technical Architecture Guide](../docs/TECHNICAL_GUIDE.md)**
- **[Archify Visual Suite Guide (24 Deliverables)](../docs/ARCHIFY_GUIDE.md)**
