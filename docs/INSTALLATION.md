# Number One (`n1`) — Complete Market Harness & Generic Installation Guide

**Number One (`n1`)** is engineered from the ground up to be **100% harness-agnostic**. Because it stores its authoritative System of Record (SoR) inside the workspace's cryptographic `.numberone/` stream and speaks standard POSIX CLI, Git hooks, shell hooks, universal instruction shims, and JSON-RPC 2.0 Model Context Protocol (`stdio` MCP), you can switch freely between **Claude Code, OpenAI Codex CLI, Cursor, Windsurf, Google Antigravity, Gemini CLI, GitHub Copilot, Cline, Roo Code, Zed, Aider, OpenCode, Goose, Devin, Amazon Q, Sourcegraph Amp, JetBrains Junie, Trae, PearAI/Void, Neovim, Emacs, Kimi Work**, or a raw human terminal **without ever losing a single decision, crash signature, intermediate thought, or lesson learned**.

---

## Table of Contents

1. [Prerequisites & Binary Installation](#1-prerequisites--binary-installation)
2. [Workspace Attachment (`n1 attach`)](#2-workspace-attachment-n1-attach)
3. [Generic Harness-Agnostic Installation (Works Everywhere, Zero MCP Required)](#3-generic-harness-agnostic-installation-works-everywhere-zero-mcp-required)
4. [Market AI Coding Harnesses (24 Harnesses — Exact Setup)](#4-market-ai-coding-harnesses-24-harnesses--exact-setup)
   - [4.1 Claude Code (CLI & Desktop App)](#41-claude-code-cli--desktop-app)
   - [4.2 OpenAI Codex CLI](#42-openai-codex-cli)
   - [4.3 Cursor](#43-cursor)
   - [4.4 Windsurf (Codeium)](#44-windsurf-codeium)
   - [4.5 Google Antigravity](#45-google-antigravity)
   - [4.6 Google Gemini CLI](#46-google-gemini-cli)
   - [4.7 GitHub Copilot (VS Code, JetBrains, CLI & Coding Agent)](#47-github-copilot-vs-code-jetbrains-cli--coding-agent)
   - [4.8 Cline (VS Code)](#48-cline-vs-code)
   - [4.9 Roo Code (VS Code)](#49-roo-code-vs-code)
   - [4.10 Continue.dev (VS Code & JetBrains)](#410-continuedev-vs-code--jetbrains)
   - [4.11 Zed Editor](#411-zed-editor)
   - [4.12 Aider](#412-aider)
   - [4.13 OpenCode](#413-opencode)
   - [4.14 Goose (Block)](#414-goose-block)
   - [4.15 Devin](#415-devin)
   - [4.16 Amazon Q Developer (CLI & IDE)](#416-amazon-q-developer-cli--ide)
   - [4.17 Sourcegraph Amp](#417-sourcegraph-amp)
   - [4.18 JetBrains AI Assistant & Junie](#418-jetbrains-ai-assistant--junie)
   - [4.19 Trae](#419-trae)
   - [4.20 PearAI & Void Editor](#420-pearai--void-editor)
   - [4.21 Kilo Code](#421-kilo-code)
   - [4.22 Neovim (`mcphub.nvim`, `codecompanion.nvim`, `avante.nvim`)](#422-neovim-mcphubnvim-codecompanionnvim-avantenvim)
   - [4.23 Emacs (`mcp.el` + `gptel` / `ellama`)](#423-emacs-mcpel--gptel--ellama)
   - [4.24 Kimi Work & Any Custom MCP Client](#424-kimi-work--any-custom-mcp-client)
5. [Distributed Scrum Persistence Configuration](#5-distributed-scrum-persistence-configuration)
6. [Post-Installation Verification Checklist](#6-post-installation-verification-checklist)

---

## 1. Prerequisites & Binary Installation

### Runtime Requirements
- **Node.js**: `>= 22.0.0` (verified on Node `22.22.x` LTS)
- **Operating Systems**: Linux (`x86_64`, `arm64`), macOS (`Apple Silicon`, `Intel`), Windows (`WSL2` recommended for POSIX `0o700`/`0o600` permissions and shell hooks; native Windows supported with automatic `O_NOFOLLOW` fallback)
- **Git**: `>= 2.28` (optional; enables commit/checkout/merge/rebase hooks and Git history bootstrap)

### Option A — Global npm Installation (Recommended)

```bash
npm install -g @shadow-software-platform/numberone
n1 --version
```

### Option B — Build from Source & Link Globally

```bash
git clone https://github.com/Shadow-Software-Platform/numberone.git
cd numberone
npm ci
npm run build
npm link
n1 --version
```

### Option C — Zero-Install Workspace Execution (`npx`)

```bash
npx -y @shadow-software-platform/numberone attach .
npx -y @shadow-software-platform/numberone status
```

> **Enterprise / Air-Gapped Environments**: For offline tarball installation, rootless Docker/Podman, `systemd`, Kubernetes, GitHub Enterprise Server, and Jira Data Center, see [`docs/ONPREM.md`](./ONPREM.md).

---

## 2. Workspace Attachment (`n1 attach`)

Navigate to any project workspace (new or existing) and attach Number One:

```bash
cd /path/to/your/project
n1 attach .
```

Running `n1 attach .` performs five atomic, non-destructive operations:
1. **Initializes `.numberone/` (`0o700`)**: Creates `config.json`, `stream/events.jsonl` (`0o600`), `stream/head.json`, `fallback/blobs/`, `projections/state.json`, and `sync/ledger.json`.
2. **Records Genesis Events**: Appends `workspace.attached` (`seq = 1`, `prevHash = "0000...0000"`) and an initial `workspace.snapshot` cataloging existing workspace file hashes.
3. **Imports Git History (if Git repo)**: Imports recent commits into the stream (`--import-commits 50` by default) so Number One starts with historical context.
4. **Chains Non-Clobbering Git Hooks**: Installs chained hooks (`post-commit`, `post-checkout`, `post-merge`, `post-rewrite`, `pre-push`) in `git rev-parse --git-path hooks` (supporting worktrees and custom `core.hooksPath`) without overwriting existing Husky, Lefthook, or pre-commit hooks.
5. **Installs Universal Instruction Shims**: Generates or updates bounded `<!-- NUMBERONE:START --> ... <!-- NUMBERONE:END -->` blocks inside `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/numberone.mdc`, `.github/copilot-instructions.md`, and `.mcp.json`.

---

## 3. Generic Harness-Agnostic Installation (Works Everywhere, Zero MCP Required)

Even if an AI coding agent, custom internal script, web chat copy-paste workflow, or human terminal **does not support MCP at all**, Number One achieves 100% workspace curation through five universal primitives:

### Layer 1: Universal Instruction Shims (`n1 shims`)
Nearly every modern agent reads at least one workspace instruction file (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`). `n1 shims` injects Number One's authoritative protocol into those files:
- Before planning or editing: run `n1 brief` and `n1 consult --intent "<task>" --paths <files>`.
- Before executing risky or architectural changes: run `n1 arbitrate --action "<plan>" --intent "<goal>" --paths <files>`.
- During multi-step exploration: record intermediate reasoning (`n1 think "..."`) and failed approaches (`n1 dead-end --approach "..." --reason "..."`).
- After fixing non-trivial bugs: record durable lessons (`n1 lesson ...`).

### Layer 2: Real-Time Background Filesystem Watcher (`n1 watch`)
Captures every manual save, IDE refactor, formatter run, or AI file edit in real time, computing unified diffs and storing content-addressed snapshots in `.numberone/fallback/blobs/`:

```bash
# Start detached background daemon (writes .numberone/daemon.pid with /proc start-tick binding)
n1 watch

# Inspect daemon health & stream position
n1 status

# Stop background daemon cleanly
n1 watch stop

# Reconcile offline edits made while the daemon was stopped
n1 reconcile
```

### Layer 3: Git Lifecycle Hooks
Installed automatically by `n1 attach .` (or disable via `--no-hooks`). Every `git commit`, `git checkout`, `git merge`, `git rebase`, and `git push` automatically appends a hash-chained `git.*` event to `.numberone/stream/events.jsonl`.

### Layer 4: Terminal & Test Execution Wrapper (`n1 exec` & `n1 shell-hook`)
Wrap any build, test, migration, or CLI agent command with `n1 exec`:

```bash
n1 exec -- npm test
n1 exec -- pytest -q
```

- When a command fails or crashes by signal (`SIGSEGV`, `SIGKILL`, non-zero exit), Number One appends `exec.failed` / `exec.crashed`, extracts the deterministic error signature, and stores full logs as content-addressed fallback blobs.
- When a subsequent `n1 exec` succeeds after code edits, `LessonEngine.correlateFailureToFix` **automatically synthesizes a `lesson.captured` event** linking the crash signature, edited files, and resolution!

To capture interactive terminal failures automatically in Bash or Zsh without typing `n1 exec`:

```bash
# Bash (~/.bashrc)
eval "$(n1 shell-hook bash)"

# Zsh (~/.zshrc)
eval "$(n1 shell-hook zsh)"
```

### Layer 5: Universal Transcript Ingestor (`n1 ingest`)
Import exported session logs from any chat UI, CI agent, or custom harness (`.jsonl`, `.json`, or `.md`):

```bash
n1 ingest ./exported-chat.jsonl --harness custom-agent --session sess-2026-11
```

---

## 4. Market AI Coding Harnesses (24 Harnesses — Exact Setup)

Every MCP-capable harness below connects to `n1 mcp --workspace <path>` over standard input/output (`stdio` JSON-RPC 2.0), gaining access to all **12 authoritative MCP tools** (`get_authoritative_brief`, `consult_number_one`, `arbitrate_action`, `record_stream_event`, `capture_lesson`, `issue_directive`, `replay_workspace_state`, `get_documentary`, `assemble_crew`, `propose_officer_evolution`, `sync_persistence`, `verify_integrity`) and **4 live MCP resources** (`numberone://brief`, `numberone://state`, `numberone://documentary`, `numberone://lessons`).

---

### 4.1 Claude Code (CLI & Desktop App)

1. **Attach workspace** (creates `CLAUDE.md` and `.mcp.json` automatically):
   ```bash
   n1 attach .
   ```
2. **Register MCP server via Claude CLI** (project scope or user scope):
   ```bash
   # Project-scoped (.mcp.json)
   claude mcp add --scope project numberone -- n1 mcp --workspace .

   # Or global user-scoped (dynamically resolves current directory)
   claude mcp add --scope user numberone -- n1 mcp
   ```
3. **Optional Claude Code Hook Integration (`.claude/settings.json`)** — automatically reconcile workspace edits after tool turns:
   ```json
   {
     "hooks": {
       "Stop": [
         {
           "matcher": "",
           "hooks": [
             {
               "type": "command",
               "command": "n1 reconcile --json >/dev/null 2>&1 || true"
             }
           ]
         }
       ]
     }
   }
   ```
4. **Claude Desktop (`claude_desktop_config.json`)**:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   ```json
   {
     "mcpServers": {
       "numberone": {
         "command": "n1",
         "args": ["mcp", "--workspace", "/absolute/path/to/workspace"]
       }
     }
   }
   ```

---

### 4.2 OpenAI Codex CLI

Codex CLI natively reads `AGENTS.md` (created by `n1 attach .`) and configures MCP servers in `~/.codex/config.toml` (or `.codex/config.toml`):

```toml
[mcp_servers.numberone]
command = "n1"
args = ["mcp", "--workspace", "."]
startup_timeout_sec = 10
tool_timeout_sec = 60
```

Or register via CLI:
```bash
codex mcp add numberone -- n1 mcp --workspace .
```

---

### 4.3 Cursor

`n1 attach .` writes `.cursor/rules/numberone.mdc` (`alwaysApply: true`). Add `.cursor/mcp.json` in your workspace root (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "numberone": {
      "command": "n1",
      "args": ["mcp", "--workspace", "${workspaceFolder}"]
    }
  }
}
```

Verify in **Cursor Settings -> MCP** that `numberone` shows a green status indicator with 12 tools enabled.

---

### 4.4 Windsurf (Codeium)

Windsurf reads `AGENTS.md` (and `.windsurfrules`). Add `numberone` to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "numberone": {
      "command": "n1",
      "args": ["mcp", "--workspace", "/absolute/path/to/workspace"]
    }
  }
}
```

To mirror Number One instructions into `.windsurfrules`:
```bash
ln -sf AGENTS.md .windsurfrules
```

---

### 4.5 Google Antigravity

Antigravity automatically discovers `AGENTS.md` in the workspace root and connects to stdio MCP servers configured in MCP settings:

```json
{
  "mcpServers": {
    "numberone": {
      "command": "n1",
      "args": ["mcp", "--workspace", "/absolute/path/to/workspace"]
    }
  }
}
```

Inside Antigravity workspaces, also start the background watcher so autonomous edits and subagent changes stream continuously:
```bash
n1 attach . && n1 watch
```

---

### 4.6 Google Gemini CLI

Gemini CLI reads `~/.gemini/settings.json` (or workspace `.gemini/settings.json`) and context files (`GEMINI.md` / `AGENTS.md`):

```json
{
  "contextFileName": ["AGENTS.md", "GEMINI.md"],
  "mcpServers": {
    "numberone": {
      "command": "n1",
      "args": ["mcp", "--workspace", "."],
      "trust": true
    }
  }
}
```

---

### 4.7 GitHub Copilot (VS Code, JetBrains, CLI & Coding Agent)

1. **Repository Instructions**: `n1 attach .` writes `.github/copilot-instructions.md` automatically.
2. **VS Code Copilot Agent Mode (`.vscode/mcp.json`)**:
   ```json
   {
     "servers": {
       "numberone": {
         "type": "stdio",
         "command": "n1",
         "args": ["mcp", "--workspace", "${workspaceFolder}"]
       }
     }
   }
   ```
3. **GitHub Copilot Coding Agent (Cloud Runner)** — create `.github/workflows/copilot-setup-steps.yml`:
   ```yaml
   name: "Copilot Setup Steps"
   on: workflow_dispatch
   permissions:
     contents: read
   jobs:
     copilot-setup-steps:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
         - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
           with:
             node-version: '22.22.x'
         - run: npm install -g @shadow-software-platform/numberone
   ```

---

### 4.8 Cline (VS Code)

1. Open **Cline -> MCP Servers -> Configure MCP Servers** (`cline_mcp_settings.json`):
   ```json
   {
     "mcpServers": {
       "numberone": {
         "command": "n1",
         "args": ["mcp", "--workspace", "/absolute/path/to/workspace"],
         "disabled": false,
         "autoApprove": [
           "get_authoritative_brief",
           "consult_number_one",
           "arbitrate_action",
           "replay_workspace_state",
           "get_documentary",
           "verify_integrity"
         ]
       }
     }
   }
   ```
2. Link `.clinerules` to `AGENTS.md` (Cline also reads `AGENTS.md` natively in recent versions):
   ```bash
   ln -sf AGENTS.md .clinerules
   ```

---

### 4.9 Roo Code (VS Code)

Create `.roo/mcp.json` in your workspace root (Roo Code natively reads `AGENTS.md` and `.roorules`):

```json
{
  "mcpServers": {
    "numberone": {
      "command": "n1",
      "args": ["mcp", "--workspace", "${workspaceFolder}"],
      "alwaysAllow": [
        "get_authoritative_brief",
        "consult_number_one",
        "arbitrate_action",
        "verify_integrity"
      ]
    }
  }
}
```

---

### 4.10 Continue.dev (VS Code & JetBrains)

Add to `.continue/config.yaml` (or `.continue/mcpServers/numberone.yaml`):

```yaml
name: Number One Workspace Config
version: 1.0.0
schema: v1
mcpServers:
  - name: numberone
    command: n1
    args:
      - mcp
      - --workspace
      - .
rules:
  - Always call get_authoritative_brief and consult_number_one before planning edits, and arbitrate_action before structural changes.
```

---

### 4.11 Zed Editor

Add to Zed's `~/.config/zed/settings.json` (or `.zed/settings.json` in the workspace; Zed automatically loads `AGENTS.md` / `CLAUDE.md` as `.rules`):

```json
{
  "context_servers": {
    "numberone": {
      "source": "custom",
      "command": "n1",
      "args": ["mcp", "--workspace", "."]
    }
  }
}
```

---

### 4.12 Aider

Aider operates directly on Git and workspace instruction files. Configure `.aider.conf.yml` in the workspace root:

```yaml
read:
  - AGENTS.md
auto-commits: true
```

Run Aider under Number One's execution & watcher harness so every edit, commit, and test run is recorded:

```bash
n1 attach .
n1 watch
n1 exec -- aider
```

---

### 4.13 OpenCode

OpenCode natively reads `AGENTS.md`. Add `opencode.json` in your workspace root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "numberone": {
      "type": "local",
      "command": ["n1", "mcp", "--workspace", "."],
      "enabled": true
    }
  }
}
```

---

### 4.14 Goose (Block)

Add the `numberone` stdio extension to `~/.config/goose/config.yaml` (Goose also reads `AGENTS.md` via its developer context):

```yaml
extensions:
  numberone:
    name: Number One SoR
    type: stdio
    cmd: n1
    args:
      - mcp
      - --workspace
      - .
    enabled: true
    timeout: 60
```

---

### 4.15 Devin

Devin automatically loads `AGENTS.md` from the repository root and supports MCP servers in **Settings -> MCP Marketplace / Custom Stdio Server**:

1. Run `n1 attach .` in your repo setup script (`n1 watch` runs in the background of the Devin VM).
2. Configure custom MCP server:
   - **Command**: `n1`
   - **Arguments**: `mcp --workspace /home/ubuntu/repos/<your-repo>`

---

### 4.16 Amazon Q Developer (CLI & IDE)

Create `.amazonq/mcp.json` in your workspace root (or `~/.aws/amazonq/mcp.json`):

```json
{
  "mcpServers": {
    "numberone": {
      "command": "n1",
      "args": ["mcp", "--workspace", "."],
      "timeout": 60000
    }
  }
}
```

Copy or symlink `AGENTS.md` into `.amazonq/rules/numberone.md`:
```bash
mkdir -p .amazonq/rules && ln -sf ../../AGENTS.md .amazonq/rules/numberone.md
```

---

### 4.17 Sourcegraph Amp

Amp reads `AGENTS.md` / `AGENT.md` automatically. Configure MCP in VS Code `settings.json` or `~/.config/amp/settings.json`:

```json
{
  "amp.mcpServers": {
    "numberone": {
      "command": "n1",
      "args": ["mcp", "--workspace", "."]
    }
  }
}
```

---

### 4.18 JetBrains AI Assistant & Junie

1. **Junie Guidelines**: Link `.junie/guidelines.md` to `AGENTS.md`:
   ```bash
   mkdir -p .junie && ln -sf ../AGENTS.md .junie/guidelines.md
   ```
2. **JetBrains AI Assistant MCP**: Open **Settings -> Tools -> AI Assistant -> Model Context Protocol (MCP)**, click **Add (+)** -> **As JSON**:
   ```json
   {
     "mcpServers": {
       "numberone": {
         "command": "n1",
         "args": ["mcp", "--workspace", "/absolute/path/to/workspace"]
       }
     }
   }
   ```

---

### 4.19 Trae

Create `.trae/mcp.json` in the workspace root (and optionally link `.trae/rules/project_rules.md` -> `AGENTS.md`):

```json
{
  "mcpServers": {
    "numberone": {
      "command": "n1",
      "args": ["mcp", "--workspace", "."]
    }
  }
}
```

---

### 4.20 PearAI & Void Editor

Both PearAI and Void support `AGENTS.md` / `.cursor/rules` and standard `mcpServers` JSON blocks:
- **Void Editor**: Open **Void Settings -> MCP** and add:
  ```json
  {
    "mcpServers": {
      "numberone": {
        "command": "n1",
        "args": ["mcp", "--workspace", "/absolute/path/to/workspace"]
      }
    }
  }
  ```
- **PearAI**: Uses Continue/Roo MCP configuration (`.continue/config.yaml` or Roo MCP settings above).

---

### 4.21 Kilo Code

Create `.kilocode/mcp.json` in your workspace root (Kilo Code also honors `AGENTS.md`):

```json
{
  "mcpServers": {
    "numberone": {
      "command": "n1",
      "args": ["mcp", "--workspace", "${workspaceFolder}"]
    }
  }
}
```

---

### 4.22 Neovim (`mcphub.nvim`, `codecompanion.nvim`, `avante.nvim`)

Add to `~/.config/mcphub/servers.json` (shared seamlessly by `mcphub.nvim`, `codecompanion.nvim`, and `avante.nvim`):

```json
{
  "mcpServers": {
    "numberone": {
      "command": "n1",
      "args": ["mcp", "--workspace", "."]
    }
  }
}
```

---

### 4.23 Emacs (`mcp.el` + `gptel` / `ellama`)

Add to your `init.el`:

```elisp
(use-package mcp
  :config
  (setq mcp-hub-servers
        `(("numberone" . (:command "n1"
                          :args ("mcp" "--workspace" ,(expand-file-name default-directory)))))))
```

---

### 4.24 Kimi Work & Any Custom MCP Client

Any client implementing **MCP Protocol `2024-11-05` (or compatible JSON-RPC 2.0 over `stdio`)** connects identically:
- **Transport**: `stdio` (newline-delimited UTF-8 JSON-RPC 2.0 messages; `stdout` carries exclusively JSON-RPC frames, `stderr` carries diagnostics)
- **Executable**: `n1` (or `node /path/to/numberone/dist/cli.js`)
- **Arguments**: `["mcp", "--workspace", "/path/to/workspace"]`

Test the raw JSON-RPC handshake directly from any shell:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' | n1 mcp --workspace .
```

---

## 5. Distributed Scrum Persistence Configuration

After attaching, you can optionally configure distributed Scrum persistence in `.numberone/config.json` (or pass flags during `n1 attach`):

```bash
# Attach with Directory Scrum backend + GitHub Issues/Projects v2 + Jira Scrum
n1 attach . \
  --directory-scrum ../.scrum-board \
  --github owner/repo \
  --github-project 1 \
  --jira https://your-org.atlassian.net:PROJ:42
```

Synchronize and verify distributed integrity at any time:

```bash
n1 sync both
n1 verify
```

---

## 6. Post-Installation Verification Checklist

Run these four commands inside your attached workspace to verify end-to-end health:

```bash
# 1. Verify runtime, hooks, daemon, and persistence setup
n1 doctor

# 2. Verify SHA-256 hash chain, fallback blobs, and snapshot digest
n1 verify --local-only

# 3. Inspect authoritative System of Record brief
n1 brief

# 4. Run a 3-officer BMAD Party Mode audit of your workspace
n1 party --topic "Initial workspace baseline & continuous delivery readiness"
```
