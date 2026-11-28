# How does Number One guarantee cryptographic integrity, zero-leak redaction, and deterministic replay? {#adv-hashchain-explainer}

`examples/advanced-hash-chain-time-travel/run.mjs` exercises Number One's core storage and verification invariants end to end — proving **linear-time secret scrubbing**, **content-addressed blob storage**, **deterministic `snapshotDigest` replay**, and **fail-closed 1-byte tamper detection** inside an interactive **Three.js 3D Hash-Chain Helix**.

- `StreamStore.append()` scrubs synthetic GitHub PAT & AWS key patterns in `O(n)` linear time before SHA-256 hashing (`0` raw tokens leaked).[](source:redaction_proof)
- Oversized crash traces are stored once by SHA-256 content digest (`n1://fallback/<sha256>`) and cross-checked on verify.[](source:cas_blob)
- `AuthorityEngine.arbitrate()` distinguishes negated compliance from real affirmative violations via `extractAffirmativeClauses`.[](source:arb_proof)
- Cloning `.numberone/` and mutating 1 byte at `seq #4` immediately fails `StreamStore.verifyIntegrity()` (fail-closed).[](source:tamper_proof)

@answer scope="Advanced Systems Sample · Cryptography, POSIX Durability, ReplayEngine & Three.js Observatory"
@meta locale=en style=editorial repo_url=https://github.com/Shadow-Software-Platform/numberone.git repo_revision=fc10c03081e1eb7b0c75c8828ec1be77b7de8e14
@source redaction_proof title="Synthetic Linear-Time Secret Redaction Proof" path=examples/advanced-hash-chain-time-travel/run.mjs lines=56:66
@source cas_blob title="Content-Addressed Crash Fallback Blob" path=examples/advanced-hash-chain-time-travel/run.mjs lines=68:89
@source arb_proof title="Affirmative-Clause L1-L4 Arbitration Proof" path=examples/advanced-hash-chain-time-travel/run.mjs lines=138:152
@source tamper_proof title="Fail-Closed 1-Byte Tamper Detection Proof" path=examples/advanced-hash-chain-time-travel/run.mjs lines=186:215

## How does the cryptographic pipeline chain events and detect tampering? {#hashchain-arch}

@architecture id=hc-pipe title="Redaction, Hash Chain & Replay Observatory"
| role frontend | Multi-Harness Input |
| role security | Redaction & Verification |
| role database | .numberone/ Store |
| role backend | Pure Replay Fold |
| role cloud | 3D Helix Observatory |
| inputs | Claude -> Codex -> Cursor | frontend | source:redaction_proof |
| scrub | O(n) Secret Redactor | security | source:redaction_proof |
| chain | SHA-256 Event Files + CAS | database | source:cas_blob |
| replay | ReplayEngine + Digest | backend |
| verify | Fail-Closed Tamper Gate | security | source:tamper_proof |
| viz | Three.js 3D Helix | cloud |
| inputs > scrub | raw telemetry |
| scrub > chain | canonical JSON + SHA-256 | emphasis |
| chain > replay | events[1..k] | emphasis |
| chain > verify | prevHash + blob check |
| replay > viz | snapshotDigest |
| verify > viz | tamper cascade | dashed |

@steps id=hc-steps
| scrub | Linear-Time Redaction | Synthesized credentials are scrubbed in `O(n)` before canonical JSON serialization. | hc-pipe | scrub |
| store | Hash-Chain + CAS Blobs | Events link `prevHash -> hash` from `GENESIS_HASH`; 2 KB crash trace links via `n1://fallback/<sha256>`. | hc-pipe | chain |
| fold | Deterministic Replay | `ReplayEngine` folds `events[1..k]` to identical `snapshotDigest` checkpoints at every sequence. | hc-pipe | replay |
| tamper | Fail-Closed Verification | Mutating 1 byte in `seq #4` triggers immediate hash mismatch errors in `verifyIntegrity()`. | hc-pipe | verify |

## Inspect the fail-closed tamper proof code {#tamper-code}

@code source=tamper_proof language=js

## Verified Invariant Matrix {#invariant-table}

| Security / Durability Invariant | Test Condition in Sample | Verified Result |
| --- | --- | --- |
| `O(n)` Secret Redaction | Synthetic `ghp_*` + `AKIA*` injected in `recordThinking()` | `0` raw tokens persisted {good:Scrubbed} |
| Affirmative Clause Arbitration | `"Do not call new Function(...); instead..."` vs. direct call | Negated passes, violation `BLOCK`s {good:Zero False Positive} |
| Fail-Closed Chain Integrity | 1-byte mutation injected into cloned `seq #4` event file | `verifyIntegrity().valid === false` {good:Tamper Caught} |

@facts
| Hash Chain Length | `8` contiguous SHA-256 chained events from `GENESIS_HASH` |
| CAS Blobs Verified | `1` multi-KB crash trace addressed via `n1://fallback/<sha256>` |
| 3D Controls | Live `--until-seq` time-travel scrubber + 1-byte tamper cascade toggle |

## Reproduce & Inspect Locally {#hc-checklist}

- [ ] Execute `node examples/advanced-hash-chain-time-travel/run.mjs` and inspect redaction, arbitration, and tamper proofs.
- [ ] Open the **Three.js 3D Hash-Chain Helix** and click **Simulate 1-Byte Tamper (seq #4)** to watch the crimson hash fracture cascade.
- [ ] Scrub `--until-seq` across `1..8` and observe the central Projection Core's `snapshotDigest` update deterministically.
