# Contributing to Number One (`n1`)

[archify pr: ask, target=comment]

Thank you for contributing to **Number One** — the harness-agnostic, event-sourced authoritative workspace curator and System of Record (SoR).

## Core Engineering Mandates

1. **Zero Mocks, Zero Theatrics, Deterministic Verification**:
   - Every capability must operate on real data structures, real cryptographic primitives, real POSIX file descriptors, and real protocols.
   - Never weaken tests or hardcode fake pass outputs.
2. **Event-Sourcing Determinism (`ReplayEngine`)**:
   - `applyEventToProjection(state, event)` must remain a pure, deterministic function of `(state, event)` with zero wall-clock (`new Date()`), random, or filesystem side effects during replay.
   - If projection semantics change, increment `PROJECTION_VERSION` in `src/core/replay-engine.ts` and add replay migration/determinism tests.
3. **Security Hardening Invariants (`SecurityOfficer` 100/100)**:
   - Confine all workspace file operations via `isPathConfinedToRoot` / `isWritablePathConfinedToRoot` and `O_NOFOLLOW` where supported.
   - Validate all user- or proposal-supplied regular expressions through `validateRegexSafety` (linear-time, no nested quantifiers, no backreferences).
   - Route all outbound HTTP calls through `resilientFetch` (`validateHttpUrl` SSRF guard + `resolveScopedEnvVar` origin binding).
   - Pin every GitHub Actions `uses:` step to a full 40-character commit SHA and declare minimal explicit `permissions:`.
4. **Documentation & Archify Synchronization**:
   - Update `README.md`, `docs/CODE_REFERENCE.md`, `docs/GLOSSARY.md`, `docs/INSTALLATION.md`, and `docs/ONPREM.md` whenever CLI flags, MCP tools, event schemas, or operational contracts change.
   - Regenerate affected Archify visual specs in `docs/archify/specs/` into `docs/site/archify/` and `docs/assets/archify/`.

## Local Development Workflow

```bash
# Install exact locked dependencies
npm ci

# Typecheck both src/ and tests/
npm run typecheck

# Compile TypeScript ESM output to dist/
npm run build

# Run full Vitest suite
npm test

# Audit dependencies
npm audit --audit-level=high
```

## Pull Request Process

1. Create a focused feature branch from `master` / `main`.
2. Ensure all tests, typechecks, container smoke checks, and Bridge Crew KPI audits pass at `100/100`.
3. Open a Pull Request using `.github/PULL_REQUEST_TEMPLATE.md`. For structural changes, Archify PR packs (`archify-pr`) follow `[archify pr: ask, target=comment]`.

## Licensing & Contributions

Number One is licensed under the **GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`)** (see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE)). By submitting a pull request or other contribution to this repository, you agree that your contribution is licensed under the same `AGPL-3.0-or-later` terms so Number One and all derivative works remain free and open source.
