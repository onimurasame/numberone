## Summary

<!-- Describe what changed, why it changed, and which System of Record / Bridge Crew / Persistence invariants are affected. -->

## Related Issues / Directives / ADRs

- Closes #

## Verification & Bridge Crew Gate

- [ ] `npm run typecheck` passes with zero errors (`src/` + `tests/`).
- [ ] `npm run build` succeeds cleanly.
- [ ] `npm test` passes 100% of unit, integration, adversarial, and E2E suites.
- [ ] `npm audit --audit-level=high` reports 0 vulnerabilities.
- [ ] Bridge Crew self-audit (`EngineeringOfficer`, `SecurityOfficer`, `BridgeOfficer`) maintains 100/100 KPI scores without regressions (`security_posture_score`, `runtime_readiness_score`, `continuous_delivery_score`).
- [ ] Every added or updated GitHub Action is pinned to an immutable 40-character commit SHA with explicit minimal `permissions:`.
- [ ] Documentation (`README.md`, `docs/KIDS_AND_SCHOOL_PROJECTS.md`, `docs/TECHNICAL_GUIDE.md`, `docs/site/`, `docs/CODE_REFERENCE.md`, `docs/GLOSSARY.md`, `docs/INSTALLATION.md`, `docs/ONPREM.md`, and Archify visual artifacts if topology/schema changed) has been updated.

## Archify PR Walkthrough (Optional)

<!-- If structural topology, sequence flows, or ER schemas changed, attach or link an Archify PR pack (`archify pr validate` / `archify pr build`). Policy: [archify pr: ask, target=comment] -->
