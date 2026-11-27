#!/usr/bin/env bash
set -euo pipefail

# Number One (n1) — Automated Release Rollback Script
# Re-points npm `latest` dist-tag to a known-good previous version, optionally
# deprecates the regressed version, and annotates the GitHub Release.
#
# Usage:
#   ./scripts/rollback.sh --good-version <semver> --bad-version <semver> [--reason "..."] [--dry-run]

GOOD_VERSION=""
BAD_VERSION=""
REASON="Rolled back due to production regression"
DRY_RUN=0
PACKAGE_NAME="@onimurasame/numberone"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --good-version)
      GOOD_VERSION="${2:-}"
      shift 2
      ;;
    --bad-version)
      BAD_VERSION="${2:-}"
      shift 2
      ;;
    --reason)
      REASON="${2:-}"
      shift 2
      ;;
    --package)
      PACKAGE_NAME="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      sed -n '3,10p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

SEMVER_RX='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
if [ -z "$GOOD_VERSION" ] || ! printf '%s' "$GOOD_VERSION" | grep -Eq "$SEMVER_RX"; then
  echo "Error: --good-version must be a valid semver (e.g. 1.0.0)" >&2
  exit 1
fi
if [ -z "$BAD_VERSION" ] || ! printf '%s' "$BAD_VERSION" | grep -Eq "$SEMVER_RX"; then
  echo "Error: --bad-version must be a valid semver (e.g. 1.0.1)" >&2
  exit 1
fi
if [ "$GOOD_VERSION" = "$BAD_VERSION" ]; then
  echo "Error: --good-version and --bad-version must differ" >&2
  exit 1
fi

run_cmd() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

echo "Rolling back ${PACKAGE_NAME}: ${BAD_VERSION} -> ${GOOD_VERSION}"
run_cmd npm dist-tag add "${PACKAGE_NAME}@${GOOD_VERSION}" latest
run_cmd npm deprecate "${PACKAGE_NAME}@${BAD_VERSION}" "Rolled back to ${GOOD_VERSION}: ${REASON}"

if command -v gh >/dev/null 2>&1; then
  run_cmd gh release edit "v${BAD_VERSION}" \
    --prerelease \
    --notes "ROLLED BACK to v${GOOD_VERSION}: ${REASON}" || true
fi

echo "Rollback procedure complete."
