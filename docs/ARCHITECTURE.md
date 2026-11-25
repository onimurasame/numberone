# Number One — Architecture & Operations Runbook

## 1. Event-Sourced Stream Architecture

Number One stores every workspace occurrence as an immutable, discrete JSON file in `.numberone/stream/events/<00000001>-<ULID>.json`.

```
.numberone/
├── config.json                 # Workspace config, persistence backends, crew settings
├── stream/
│   ├── head.json               # Current sequence number & chain tip hash
│   ├── events/
│   │   ├── 00000001-<ULID>.json
│   │   └── 00000002-<ULID>.json
│   └── blobs/
│       └── <sha256>            # Content-addressed fallback/overflow store
├── sync/
│   └── ledger.json             # Cross-store mapping (eventId <-> GitHub/Jira refs + fallback fields)
└── projections/
    └── state.json              # Rebuildable deterministic WorkspaceProjection snapshot
```

### Cryptographic Hash Chaining
Every event computes `hash = SHA256(canonicalJson(immutableFields + prevHash))`.
Mutable distributed sync metadata (`storageManifest.remotes`) is intentionally excluded from the immutable event hash so mirroring to GitHub or Jira after local capture never invalidates the local hash chain.

## 2. Distributed Yet Integral Persistence

| Event Category | `.numberone/` Local Stream | GitHub Adapter | Jira Scrum Adapter |
|---|---|---|---|
| `issue.*`, `lesson.*`, `decision.*`, `directive.*` | Canonical event + hash chain | Issue + Labels + Milestone + Projects v2 item + embedded `<!-- numberone:event -->` | Epic/Story/Bug/Task + Active Sprint + Officer Component + `numberone.event` Entity Property + Issue Links |
| `crew.opinion`, `crew.challenge`, `crew.consensus`, `issue.resolved`, `chat.thinking` | Canonical event | Threaded Comment + Issue close/reopen | ADF Comment + Workflow Transition |
| `fs.*`, raw unified diffs, full stdout/stderr, binary dumps | Canonical event + content-addressed `n1://fallback/<sha256>` blob | Referenced via `n1://fallback/<sha256>` pointers | Referenced via `n1://fallback/<sha256>` pointers in Entity Properties |

## 3. Authoritative Precedence Ladder

1. **`L1_SOR_INVARIANT`**: Verified historical lessons learned and recorded dead-ends.
2. **`L2_NUMBER_ONE_DIRECTIVE`**: Explicit rulings and directives issued by Number One.
3. **`L3_OFFICER_GATE`**: Mandatory gates enforced by Engineering, Security, or Bridge Officers.
4. **`L4_SESSION_CONTEXT`**: Ephemeral chat or harness assumptions (lowest precedence; superseded on conflict).

## 4. Bridge Crew Officers & Main KPIs

| Officer | Mandate | Main KPI |
|---|---|---|
| **Engineering Officer** | Complete infrastructure, runtime pinning, env/secrets, IAM/accesses, health probes & runbooks for target runtime | `runtime_readiness_score` (0–100) |
| **Security Officer** | Vulnerability-free Architecture, Infrastructure, Code/Quality, and Dependencies/Supply Chain | `security_posture_score` (0–100) |
| **Bridge Officer** | Relentless Continuous Delivery across code, tests, infra, pipelines, controls, and DORA metrics | `continuous_delivery_score` (0–100) |

## 5. Operations & Recovery Runbook

- **Run health & integrity diagnostics**: `n1 doctor`
- **Start live watcher**: `n1 watch` (background daemon) or `n1 watch --foreground`
- **Catch offline manual changes & renames**: `n1 reconcile`
- **Verify local hash chain, blobs & remote mirrors**: `n1 verify`
- **Rebuild corrupted projection**: Delete `.numberone/projections/state.json` and run `n1 replay`
- **Audit or revert evolved officer practices**: `n1 evolve audit <officer>` or `n1 evolve revert <officer> <practiceId> --reason "..."`
- **Roll back a published release**: `./scripts/rollback.sh --good-version <semver> --bad-version <semver> [--dry-run]`
