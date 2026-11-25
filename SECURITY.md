# Security Policy & Threat Model — Number One

## Threat Model & Implemented Controls (OWASP ASVS / CWE / NIST SSDF)
- **Tamper-Evident Stream & Crash Durability**: Canonical SHA-256 hash chaining (`prevHash` -> `hash`) across discrete atomic event files and SHA-256 content-addressed blobs, written via `O_CREAT|O_EXCL` temp file + `fsync` + atomic `rename` + parent-dir `fsync` with atomic `linkSync` cross-process locks (`0o600`), `(dev, ino)` ownership verification, `/proc/<pid>/stat` start-ticks + instance-ID stale lock detection, fail-closed tip validation, and integrity verification via `n1 verify` / `n1 doctor`.
- **Projection Integrity & Privilege Isolation (L1 > L2 > L3 > L4)**:
  - Projection caches (`state.json`) are tamper-detected via canonical SHA-256 `snapshotDigest` and rebuilt with null-prototype maps (`Object.create(null)`) + forbidden-key guards (`__proto__`, `constructor`, `prototype`).
  - L4 `ai-agent` sessions (including MCP clients) cannot supersede directives, forge `exec.completed` crash resolutions, or promote/revert officer knowledge; MCP `record_stream_event` enforces an explicit non-privileged allowlist and MCP `issue_directive` is restricted to `advisory` severity.
- **Automatic Secret Redaction & Sensitive File Exclusion (CWE-532 / CWE-200)**:
  - Stream summaries, payloads, command outputs, text/JSON/YAML/XML blobs, LLM prompts, MCP error responses, and outbound GitHub/Jira issue payloads pass through the linear-time deterministic secret redactor (`src/utils/redactor.ts`), scrubbing PEM/PGP private keys (including truncated headers), AWS (`AKIA`/`ASIA`), GitHub (`gh*`/`github_pat_`), GitLab (`glpat-`/`gloas-`/`glrt-`), npm/PyPI/Google/OpenAI/Anthropic/Slack/Stripe tokens, Azure SAS `sig=`, JWTs, Bearer headers, Basic Auth URLs, and key-value secrets.
  - Sensitive credential files (`.env*`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `.npmrc`, `.netrc`, `credentials.json`, etc.) are recorded metadata-only (`sensitiveRedacted: true`) and skipped by dynamic officer matchers and transcript ingestion.
  - `.numberone/` state directories and files use restrictive owner-only permissions (`0o700` dirs / `0o600` files).
  - Gemini API keys are sent in the `x-goog-api-key` HTTP header rather than URL query strings; outbound HTTP clients enforce HTTPS, block private/loopback/metadata IP ranges (SSRF protection), disable redirect credential forwarding (`redirect: 'error'`), cap response body sizes, and scope configured credential env vars to domain prefixes (`GITHUB_`/`GH_`, `JIRA_`, `OPENAI_`/`ANTHROPIC_`/`GEMINI_`/`LLM_`).
- **Default-Deny Arbitrary Command Execution (CWE-78)**:
  - `KnowledgeEvolutionEngine` disables shell execution for `empirical_benchmark` proposals by default (`allowCommandExecution: false`); MCP `propose_officer_evolution` permanently hardcodes `allowCommandExecution: false`.
  - CLI `n1 evolve --allow-exec` runs opted-in commands with an allowlist-sanitized environment (`buildSanitizedChildEnv`).
  - `n1 exec -- <bin> <args...>` executes directly with `shell: false` (eliminating double-shell interpretation).
  - Generated Git hooks and bash/zsh shell hooks validate executables, enforce symlink confinement, and use strict POSIX single-quoting.
- **Symlink Escape & Path Traversal Confinement (CWE-59 / CWE-22)**:
  - File readers use FD-based `O_RDONLY | O_NONBLOCK | O_NOFOLLOW` + `fstatSync(fd)` + `realpathSync` confinement within `workspaceRoot`, blocking symlink swaps, FIFOs, sockets, and growing-file OOM.
  - Harness shims, Git hooks, and directory persistence validate writable path confinement and reject symlinks and unsafe keys.
- **ReDoS & Resource Exhaustion Controls (CWE-1333 / CWE-400)**:
  - `.gitignore` and evolved glob patterns use linear-time $O(N \cdot M)$ dynamic programming (`matchGlobLinear`) with zero regex backtracking; dynamic regexes are statically validated against nested quantifiers, backreferences, and lookarounds.
  - Watched commands bound stdout/stderr memory capture in $O(1)$ using `Buffer` slices (default 2 MB head+tail) and forward parent `SIGINT`/`SIGTERM` to process groups.
  - MCP stdio transport uses raw-`Buffer` pre-allocation frame limiting (2 MB cap before UTF-8 string decoding) with stdin pause/resume backpressure and `EPIPE` safety; watcher snapshot text cache is capped at 64 MB and directory watches at 2,000.
  - Daemon lifecycle serializes under `.daemon.lock`, opens `daemon.log` with `O_NOFOLLOW`, and verifies exact NUL-split `/proc/<pid>/cmdline` argv and `/proc/<pid>/stat` start ticks before signaling.
- **Supply Chain Integrity & Container Hardening**:
  - Production runtime depends solely on `zod` (0 CVEs) and Node.js 22 standard library, locked by `package-lock.json`, audited in CI (`npm audit --audit-level=high`), and kept current via Dependabot.
  - GitHub Actions workflows are pinned to immutable 40-char commit SHAs with minimal `permissions:`.
  - Container image builds from a SHA-256 digest-pinned Node 22 Alpine image with `tini` PID-1 init, root-owned read-only `/app`, non-root `USER node`, `STOPSIGNAL SIGTERM`, `HEALTHCHECK`, and CI verification under `--read-only --cap-drop=ALL --security-opt=no-new-privileges`.

## Reporting a Vulnerability
Open a private security advisory or contact the workspace Security Officer via `n1 party --officers security --topic "Security advisory"`.
