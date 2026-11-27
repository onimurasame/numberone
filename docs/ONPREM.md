# Number One (`n1`) — Enterprise On-Premises, Regulated & Air-Gapped Deployment Guide

**Number One (`n1`)** is designed with **zero cloud lock-in** and a **single audited runtime dependency (`zod`)**. Every core subsystem — cryptographic stream storage, deterministic replay, institutional lesson matching, authority arbitration, MCP `stdio` serving, Directory Scrum boards, and all three Bridge Crew officers (`EngineeringOfficer`, `SecurityOfficer`, `BridgeOfficer`) — runs **100% deterministically offline with zero network egress required**.

When enterprise integrations are desired inside corporate networks, Number One connects natively to **GitHub Enterprise Server (GHES)**, **Jira Data Center / Server**, **NFS / Git-Worktree Scrum directories**, and **self-hosted OpenAI-compatible inference servers (vLLM, Ollama, HuggingFace TGI, LiteLLM)** behind custom internal Certificate Authorities.

---

## Table of Contents

1. [Air-Gapped Offline Artifact Packaging & Transfer](#1-air-gapped-offline-artifact-packaging--transfer)
2. [Internal Private npm Registry Publishing (Artifactory / Nexus / Verdaccio)](#2-internal-private-npm-registry-publishing-artifactory--nexus--verdaccio)
3. [Hardened Container Deployment (Docker & Rootless Podman)](#3-hardened-container-deployment-docker--rootless-podman)
4. [Linux `systemd` Daemon Deployment (System & Rootless User Units)](#4-linux-systemd-daemon-deployment-system--rootless-user-units)
5. [Kubernetes & OpenShift Deployment (`StatefulSet` & Workspace Sidecar)](#5-kubernetes--openshift-deployment-statefulset--workspace-sidecar)
6. [On-Premises Scrum & VCS Integrations](#6-on-premises-scrum--vcs-integrations)
   - [6.1 Zero-Network Shared Scrum via Git Worktrees or NFS (`DirectoryPersistenceAdapter`)](#61-zero-network-shared-scrum-via-git-worktrees-or-nfs-directorypersistenceadapter)
   - [6.2 GitHub Enterprise Server (GHES)](#62-github-enterprise-server-ghes)
   - [6.3 Jira Data Center / Server](#63-jira-data-center--server)
7. [Self-Hosted On-Premises LLM Inference (vLLM / Ollama / TGI)](#7-self-hosted-on-premises-llm-inference-vllm--ollama--tgi)
8. [Corporate PKI, Custom TLS CAs & SSRF Policy Controls](#8-corporate-pki-custom-tls-cas--ssrf-policy-controls)
9. [Security Hardening, Backup, Disaster Recovery & Cryptographic Audit](#9-security-hardening-backup-disaster-recovery--cryptographic-audit)

---

## 1. Air-Gapped Offline Artifact Packaging & Transfer

On an internet-connected build workstation (bastion / DMZ staging builder), build a completely self-contained offline bundle with SHA-256 verification manifests:

```bash
# 1. Clone and verify clean build + test suite on staging builder
git clone https://github.com/onimurasame/numberone.git
cd numberone
npm ci
npm run typecheck
npm run build
npm test

# 2. Create self-contained offline bundle (includes compiled dist/ and production node_modules/zod)
OFFLINE_STAGE="$(mktemp -d)"
npm pack --pack-destination "$OFFLINE_STAGE"
cp -R dist package.json package-lock.json LICENSE NOTICE README.md SECURITY.md "$OFFLINE_STAGE/"
npm --prefix "$OFFLINE_STAGE" ci --omit=dev --ignore-scripts

# 3. Package tarball + cryptographic checksum for air-gap transfer
tar -czf numberone-1.0.0-airgap-bundle.tar.gz -C "$OFFLINE_STAGE" .
sha256sum numberone-1.0.0-airgap-bundle.tar.gz > numberone-1.0.0-airgap-bundle.tar.gz.sha256
rm -rf "$OFFLINE_STAGE"
```

### Installing Inside the Air-Gapped Host

Transfer `numberone-1.0.0-airgap-bundle.tar.gz` and `.sha256` across your approved media/diode, verify integrity, and install into `/opt/numberone`:

```bash
# 1. Verify cryptographic checksum before extraction
sha256sum -c numberone-1.0.0-airgap-bundle.tar.gz.sha256

# 2. Extract to /opt/numberone with root-owned read-only binaries
sudo mkdir -p /opt/numberone
sudo tar -xzf numberone-1.0.0-airgap-bundle.tar.gz -C /opt/numberone
sudo chown -R root:root /opt/numberone
sudo chmod 0755 /opt/numberone/dist/cli.js

# 3. Symlink onto system PATH
sudo ln -sf /opt/numberone/dist/cli.js /usr/local/bin/n1
sudo ln -sf /opt/numberone/dist/cli.js /usr/local/bin/numberone

# 4. Smoke-test offline execution (zero network required)
n1 --version
```

---

## 2. Internal Private npm Registry Publishing (Artifactory / Nexus / Verdaccio)

To distribute `numberone` across internal developer workstations and CI runners via JFrog Artifactory, Sonatype Nexus, or Verdaccio:

```bash
# Pack verified tarball
TGZ="$(npm pack | tail -n 1)"

# Publish to internal registry
npm publish "$TGZ" \
  --registry https://npm.internal.corp.example/repository/npm-internal/ \
  --ignore-scripts
```

Developers inside the enclave install normally using their `.npmrc` internal registry:

```bash
npm install -g @onimurasame/numberone --registry https://npm.internal.corp.example/repository/npm-internal/
```

---

## 3. Hardened Container Deployment (Docker & Rootless Podman)

Number One ships with a hardened multi-stage [`Dockerfile`](../Dockerfile) pinned to immutable SHA-256 base image digests (`node:22.22.0-bookworm-slim`), utilizing `tini` as PID 1 reaper, stripping `npm`/`corepack` from the runtime layer to minimize attack surface, and running as non-root UID/GID `1000:1000`.

### Air-Gapped Image Export & Load

```bash
# On connected builder
docker build -t registry.internal.corp.example/platform/numberone:1.0.0 .
docker save registry.internal.corp.example/platform/numberone:1.0.0 | gzip > numberone-1.0.0-oci.tar.gz
sha256sum numberone-1.0.0-oci.tar.gz > numberone-1.0.0-oci.tar.gz.sha256

# On air-gapped target (Docker or Podman)
sha256sum -c numberone-1.0.0-oci.tar.gz.sha256
docker load < numberone-1.0.0-oci.tar.gz
# Or with rootless Podman:
podman load < numberone-1.0.0-oci.tar.gz
```

### Running Under Strict Read-Only & Zero-Capability Constraints

Always map `--user "$(id -u):$(id -g)"` when bind-mounting host workspaces so `.numberone/` (`0o700`) is owned by the host operator's UID/GID:

```bash
# Attach workspace inside hardened container (zero network egress: --network=none)
docker run --rm \
  --network=none \
  --user "$(id -u):$(id -g)" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  -v "$(pwd):/workspace" \
  registry.internal.corp.example/platform/numberone:1.0.0 \
  attach /workspace

# Run continuous foreground filesystem watcher daemon
docker run -d \
  --name n1-watcher \
  --restart unless-stopped \
  --network=none \
  --user "$(id -u):$(id -g)" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  -v "$(pwd):/workspace" \
  registry.internal.corp.example/platform/numberone:1.0.0 \
  watch --foreground --workspace /workspace
```

> **RHEL / Fedora / Rocky Linux with SELinux Enforcing (Rootless Podman)**: Append `:Z` to the volume flag (`-v "$(pwd):/workspace:Z"`) and pass `--userns=keep-id` so rootless Podman maps your host UID directly into the container without `chown` drift.

---

## 4. Linux `systemd` Daemon Deployment (System & Rootless User Units)

For bare-metal or VM developer workstations and persistent build hosts, run `n1 watch --foreground` under `systemd` with strict kernel sandboxing.

### Rootless User Unit (`~/.config/systemd/user/numberone-watch.service`)

```ini
[Unit]
Description=Number One Authoritative Workspace Watcher
After=default.target

[Service]
Type=simple
WorkingDirectory=%h/workspace/my-project
ExecStart=/usr/local/bin/n1 watch --foreground --workspace %h/workspace/my-project
Restart=on-failure
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=10

# Kernel & filesystem hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=%h/workspace/my-project
UMask=0077

[Install]
WantedBy=default.target
```

Enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable --now numberone-watch.service
journalctl --user -u numberone-watch.service -f
```

---

## 5. Kubernetes & OpenShift Deployment (`StatefulSet` & Workspace Sidecar)

In remote cloud-on-prem IDE platforms (Coder, Eclipse Che, OpenShift Dev Spaces, self-hosted Gitpod), deploy `numberone` as a restricted sidecar sharing the `/workspace` PersistentVolumeClaim (`PodSecurity` `restricted` compliant):

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: dev-workspace-with-numberone
  namespace: engineering-workspaces
spec:
  serviceName: dev-workspace
  replicas: 1
  selector:
    matchLabels:
      app: dev-workspace
  template:
    metadata:
      labels:
        app: dev-workspace
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: numberone-curator
          image: registry.internal.corp.example/platform/numberone:1.0.0
          args: ["watch", "--foreground", "--workspace", "/workspace"]
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
          resources:
            requests:
              cpu: "50m"
              memory: "96Mi"
            limits:
              cpu: "500m"
              memory: "256Mi"
          volumeMounts:
            - name: workspace-pvc
              mountPath: /workspace
            - name: tmp-vol
              mountPath: /tmp
      volumes:
        - name: tmp-vol
          emptyDir:
            medium: Memory
            sizeLimit: 64Mi
  volumeClaimTemplates:
    - metadata:
        name: workspace-pvc
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 20Gi
```

---

## 6. On-Premises Scrum & VCS Integrations

### 6.1 Zero-Network Shared Scrum via Git Worktrees or NFS (`DirectoryPersistenceAdapter`)

In completely air-gapped environments (SCIF / classified enclaves / OT networks) with neither GitHub nor Jira, Number One's **`DirectoryPersistenceAdapter`** provides a full Kanban/Scrum board (`backlog/`, `in-progress/`, `blocked/`, `done/`, `lessons/`, `directives/`, `decisions/`, `board.md`) backed by atomic POSIX filesystem locks:

```bash
# Create a dedicated orphan Git branch + worktree for team-shared Scrum state
git worktree add ../project-scrum-board -b n1-scrum-board

# Attach Number One to sync with the shared Scrum directory
n1 attach . --directory-scrum ../project-scrum-board --project-key CORE
n1 sync both
```

### 6.2 GitHub Enterprise Server (GHES)

Configure `.numberone/config.json` with `apiBaseUrl` pointing to your internal GHES REST v3 / GraphQL endpoint and set `useGhCli: false` to use direct HTTPS token auth via `resilientFetch`:

```json
{
  "persistence": {
    "github": {
      "enabled": true,
      "owner": "platform-eng",
      "repo": "payment-core",
      "projectNumber": 4,
      "apiBaseUrl": "https://github.internal.corp.example/api/v3",
      "tokenEnvVar": "GHES_PAT_TOKEN",
      "useGhCli": false
    }
  }
}
```

### 6.3 Jira Data Center / Server

Configure `.numberone/config.json` pointing `baseUrl` at your internal Jira instance:

```json
{
  "persistence": {
    "jira": {
      "enabled": true,
      "baseUrl": "https://jira.internal.corp.example",
      "projectKey": "PLAT",
      "boardId": 18,
      "emailEnvVar": "JIRA_USER_EMAIL",
      "apiTokenEnvVar": "JIRA_API_TOKEN"
    }
  }
}
```

---

## 7. Self-Hosted On-Premises LLM Inference (vLLM / Ollama / TGI)

All three Bridge Crew officers run deterministic static/telemetry checks with `provider: "none"` (the default). If you want optional LLM-enriched roundtable commentary without sending code outside your perimeter, point `llm` at an internal OpenAI-compatible server (vLLM, Ollama, TGI, or LiteLLM):

```json
{
  "llm": {
    "provider": "openai-compatible",
    "baseUrl": "https://vllm.internal.corp.example/v1",
    "model": "Qwen/Qwen2.5-Coder-32B-Instruct",
    "apiKeyEnvVar": "INTERNAL_LLM_API_KEY"
  }
}
```

---

## 8. Corporate PKI, Custom TLS CAs & SSRF Policy Controls

### Trusting Internal Root Certificate Authorities
Never disable TLS verification (`NODE_TLS_REJECT_UNAUTHORIZED=0` is strongly discouraged). Instead, pass your enterprise root CA bundle via Node's native `NODE_EXTRA_CA_CERTS`:

```bash
export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/corp-internal-root-ca.pem
n1 sync both
```

### Understanding Number One's Built-In SSRF & Credential Origin Guard (`src/utils/http.ts`)
By default, `validateHttpUrl` enforces strict Server-Side Request Forgery (SSRF) protection:
1. **HTTPS Required by Default**: Plaintext `http://` is blocked for remote hosts (`http://127.0.0.1` / `http://localhost` is allowed only when loopback is explicitly permitted, such as local Ollama).
2. **Private/Link-Local IP Blocklist**: Literal RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), cloud metadata (`169.254.169.254`), CGNAT (`100.64.0.0/10`), and IPv6 ULA/link-local literals are rejected unless routed via verified internal DNS hostnames (`https://github.internal.corp.example`). Always use internal FQDN DNS records with valid corporate TLS certificates rather than raw RFC 1918 IP literals!
3. **Origin-Bound Scoped Env Vars**: `resolveScopedEnvVar` restricts `tokenEnvVar` names to `[A-Z][A-Z0-9_]{1,63}` and blocks reading system secrets (`AWS_SECRET_ACCESS_KEY`, `DATABASE_URL`, `SSH_AUTH_SOCK`, `KUBECONFIG`), preventing malicious `.numberone/config.json` PRs from exfiltrating unrelated host secrets.

---

## 9. Security Hardening, Backup, Disaster Recovery & Cryptographic Audit

### What to Commit vs. Ignore in Git
- **Safe to commit (or archive to object storage)**: `.numberone/config.json`, `.numberone/stream/events.jsonl`, `.numberone/stream/head.json`, `.numberone/fallback/blobs/`, `.numberone/sync/ledger.json`. (All stream payloads and diffs pass through `redactSecrets` / `redactObjectDeep` before disk write, and sensitive files like `.env*`, `*.pem`, `*.key`, `.aws/credentials` never have their contents snapshotted.)
- **Ephemeral per-machine files (keep in `.gitignore`)**:
  - `.numberone/daemon.pid`
  - `.numberone/daemon.log`
  - `.numberone/projections/` (rebuilt deterministically on demand via `n1 replay`)
  - `.numberone/locks/`

### Disaster Recovery & Tamper Auditing
To restore or audit a workspace from backup on any air-gapped server:

```bash
# 1. Verify every event's canonical JSON SHA-256 hash, prevHash link, head tip, and fallback blob digest
n1 verify --local-only --json

# 2. Rebuild deterministic projection from genesis event #1
n1 replay

# 3. Export human-readable forensic documentary
n1 documentary --out AUDIT_DOCUMENTARY.md
```
