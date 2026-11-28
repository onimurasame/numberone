#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Number One (n1) — GitHub Repository Governance & Provisioning Script
# ==============================================================================
# Configures a public GitHub repository to leverage all GitHub platform features
# (Issues, Discussions, Projects v2, GitHub Pages Actions workflow, CodeQL,
# Dependabot alerts & security updates, Private Vulnerability Reporting, Secret
# Scanning + Push Protection, Labels, Milestones, and Branch Rulesets).
#
# Usage:
#   ./scripts/configure-github.sh [--repo owner/repo] [--template-repo owner/repo] [--dry-run]
# ==============================================================================

TARGET_REPO="Shadow-Software-Platform/numberone"
TEMPLATE_REPO=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      TARGET_REPO="$2"
      shift 2
      ;;
    --template-repo)
      TEMPLATE_REPO="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--repo owner/repo] [--template-repo owner/repo] [--dry-run]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

OWNER="${TARGET_REPO%%/*}"
REPO="${TARGET_REPO#*/}"
OWNER_LOWER="$(printf '%s' "$OWNER" | tr '[:upper:]' '[:lower:]')"
PAGES_URL="https://${OWNER_LOWER}.github.io/${REPO}/"
DESCRIPTION="Harness-agnostic, event-sourced authoritative workspace curator & System of Record (SoR) with BMAD Party Mode Bridge Crew and KPI-proven continuous evolution."

log() {
  printf '[n1-github] %s\n' "$*"
}

run_gh() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] gh'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  gh "$@"
}

if [[ "$DRY_RUN" -eq 0 ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "Error: GitHub CLI (gh) is required on PATH." >&2
    exit 1
  fi
  gh auth status >/dev/null
fi

# 1. Baseline Governance Flags (with optional --template-repo override)
ALLOW_SQUASH="true"
ALLOW_MERGE="true"
ALLOW_REBASE="true"
DELETE_BRANCH_ON_MERGE="true"
HAS_WIKI="false"
WEB_COMMIT_SIGNOFF="false"

if [[ -n "$TEMPLATE_REPO" && "$DRY_RUN" -eq 0 ]]; then
  log "Inspecting optional template repository settings from ${TEMPLATE_REPO}..."
  if TEMPLATE_JSON="$(gh api "repos/${TEMPLATE_REPO}" 2>/dev/null)"; then
    ALLOW_SQUASH="$(printf '%s' "$TEMPLATE_JSON" | jq -r 'if .allow_squash_merge == null then true else .allow_squash_merge end')"
    ALLOW_MERGE="$(printf '%s' "$TEMPLATE_JSON" | jq -r 'if .allow_merge_commit == null then true else .allow_merge_commit end')"
    ALLOW_REBASE="$(printf '%s' "$TEMPLATE_JSON" | jq -r 'if .allow_rebase_merge == null then true else .allow_rebase_merge end')"
    DELETE_BRANCH_ON_MERGE="$(printf '%s' "$TEMPLATE_JSON" | jq -r 'if .delete_branch_on_merge == null then true else .delete_branch_on_merge end')"
    HAS_WIKI="$(printf '%s' "$TEMPLATE_JSON" | jq -r 'if .has_wiki == null then false else .has_wiki end')"
    WEB_COMMIT_SIGNOFF="$(printf '%s' "$TEMPLATE_JSON" | jq -r 'if .web_commit_signoff_required == null then false else .web_commit_signoff_required end')"
    log "Loaded baseline flags from ${TEMPLATE_REPO} (wiki=${HAS_WIKI}, squash=${ALLOW_SQUASH}, delete_branch=${DELETE_BRANCH_ON_MERGE})."
  else
    log "Note: ${TEMPLATE_REPO} details not readable with current token scope; using default governance settings."
  fi
fi

# 2. Core Repository Settings (Public + Issues + Projects + Discussions + Merge Hygiene)
log "Configuring core repository settings on ${TARGET_REPO} (visibility=public, homepage=${PAGES_URL})..."
run_gh api -X PATCH "repos/${TARGET_REPO}" \
  -f name="$REPO" \
  -f description="$DESCRIPTION" \
  -f homepage="$PAGES_URL" \
  -F private=false \
  -F has_issues=true \
  -F has_projects=true \
  -F has_discussions=true \
  -F has_wiki="$HAS_WIKI" \
  -F web_commit_signoff_required="$WEB_COMMIT_SIGNOFF" \
  -F allow_squash_merge="$ALLOW_SQUASH" \
  -F allow_merge_commit="$ALLOW_MERGE" \
  -F allow_rebase_merge="$ALLOW_REBASE" \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge="$DELETE_BRANCH_ON_MERGE" \
  -f squash_merge_commit_title="PR_TITLE" \
  -f squash_merge_commit_message="PR_BODY"

# 3. Repository Topics for Discovery
log "Configuring repository topics..."
TOPICS_PAYLOAD='{"names":["ai-agent","event-sourcing","mcp","model-context-protocol","system-of-record","bmad","devsecops","continuous-delivery","archify","typescript","institutional-memory","scrum"]}'
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "[dry-run] PUT repos/${TARGET_REPO}/topics -> ${TOPICS_PAYLOAD}"
else
  printf '%s' "$TOPICS_PAYLOAD" | gh api -X PUT "repos/${TARGET_REPO}/topics" --input - >/dev/null
fi

# 4. Security Features (Vulnerability Alerts, Automated Security Fixes, Private Reporting, Secret Scanning)
log "Enabling GitHub Security features (Dependabot alerts, automated fixes, private vulnerability reporting, secret scanning)..."
run_gh api -X PUT "repos/${TARGET_REPO}/vulnerability-alerts" || true
run_gh api -X PUT "repos/${TARGET_REPO}/automated-security-fixes" || true
run_gh api -X PUT "repos/${TARGET_REPO}/private-vulnerability-reporting" || true

SEC_PAYLOAD='{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}'
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "[dry-run] PATCH repos/${TARGET_REPO} security_and_analysis -> ${SEC_PAYLOAD}"
else
  printf '%s' "$SEC_PAYLOAD" | gh api -X PATCH "repos/${TARGET_REPO}" --input - >/dev/null 2>&1 || \
    log "Note: secret_scanning API toggle skipped or already managed at account level."
fi

# 5. GitHub Pages via GitHub Actions Workflow (build_type: workflow)
log "Configuring GitHub Pages (build_type=workflow) for interactive docs & Archify portal..."
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "[dry-run] POST/PUT repos/${TARGET_REPO}/pages -f build_type=workflow"
else
  if gh api "repos/${TARGET_REPO}/pages" >/dev/null 2>&1; then
    gh api -X PUT "repos/${TARGET_REPO}/pages" -f build_type="workflow" >/dev/null
  else
    gh api -X POST "repos/${TARGET_REPO}/pages" -f build_type="workflow" >/dev/null
  fi
fi

# 5b. Provision `npm` GitHub Deployment Environment for OIDC Trusted Publishing
log "Ensuring 'npm' deployment environment exists for CI/CD releases..."
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "[dry-run] PUT repos/${TARGET_REPO}/environments/npm"
else
  gh api -X PUT "repos/${TARGET_REPO}/environments/npm" >/dev/null || \
    log "Note: Could not create 'npm' environment via API; GitHub Actions will auto-create it on first release run."
fi

# 6. Synchronize Number One Distributed SoR Labels (+ Template Repo Labels when readable)
log "Synchronizing Number One & Bridge Crew label taxonomy..."
LABELS=(
  "n1:managed|1d76db|Managed by Number One distributed System of Record"
  "n1:lesson|5319e7|Number One institutional Lesson Learned"
  "n1:directive|b60205|Number One authoritative Directive"
  "n1:decision|0e8a16|Number One Architecture/Process Decision (ADR)"
  "n1:crash|d93f0b|Workspace execution crash tracked by Number One"
  "n1:ruling|fbca04|Bridge Crew Party Mode consensus or arbitration ruling"
  "n1:officer:engineering|0052cc|Owned by Number One Engineering Officer"
  "n1:officer:security|e11d48|Owned by Number One Security Officer"
  "n1:officer:bridge|059669|Owned by Number One Bridge Officer"
  "n1:priority:critical|b60205|Critical priority work item"
  "n1:priority:high|d93f0b|High priority work item"
  "n1:priority:medium|fbca04|Medium priority work item"
  "n1:priority:low|0e8a16|Low priority work item"
  "n1:kind:bug|d73a4a|Deterministic defect or regression"
  "n1:kind:story|a2eeef|Scrum story or capability enhancement"
  "documentation|0075ca|Documentation, Glossary, Code Reference, or Archify artifacts"
  "dependencies|0366d6|Automated dependency updates"
  "github-actions|000000|CI/CD and GitHub Actions workflows"
  "npm|cb3837|npm package dependency updates"
  "automerge-eligible|0e8a16|Dependabot PR passed policy & provenance checks; ready for CODEOWNER approval and squash-merge"
  "manual-review-required|d93f0b|PR requires explicit manual review before merge"
)

for entry in "${LABELS[@]}"; do
  IFS='|' read -r lname lcolor ldesc <<< "$entry"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] upsert label '${lname}' (#${lcolor})"
  else
    gh label create "$lname" -R "$TARGET_REPO" --color "$lcolor" --description "$ldesc" --force >/dev/null
  fi
done

if [[ -n "$TEMPLATE_REPO" && "$DRY_RUN" -eq 0 ]]; then
  if TPL_LABELS="$(gh api "repos/${TEMPLATE_REPO}/labels" --paginate 2>/dev/null)"; then
    log "Mirroring custom labels from ${TEMPLATE_REPO}..."
    printf '%s' "$TPL_LABELS" | jq -c '.[] | {name, color, description: (.description // "")}' | while IFS= read -r row; do
      tname="$(printf '%s' "$row" | jq -r '.name')"
      tcolor="$(printf '%s' "$row" | jq -r '.color')"
      tdesc="$(printf '%s' "$row" | jq -r '.description')"
      gh label create "$tname" -R "$TARGET_REPO" --color "$tcolor" --description "$tdesc" --force >/dev/null || true
    done
  fi
fi

# 7. Ensure Initial v1.0.0 Milestone Exists
log "Ensuring v1.0.0 milestone exists..."
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "[dry-run] POST repos/${TARGET_REPO}/milestones title='v1.0.0 — Authoritative SoR & Bridge Crew'"
else
  EXISTING_MS="$(gh api "repos/${TARGET_REPO}/milestones?state=all" --jq '.[].title' 2>/dev/null || true)"
  if ! printf '%s\n' "$EXISTING_MS" | grep -Fxq "v1.0.0 — Authoritative SoR & Bridge Crew"; then
    gh api -X POST "repos/${TARGET_REPO}/milestones" \
      -f title="v1.0.0 — Authoritative SoR & Bridge Crew" \
      -f state="open" \
      -f description="Initial public release of Number One (n1) with distributed persistence, BMAD Party Mode, and Archify documentation." >/dev/null
  fi
fi

# 8. Provision GitHub Projects v2 Scrum Board (when token carries project scope)
log "Checking GitHub Projects v2 integration..."
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "[dry-run] GraphQL createProjectV2 + linkProjectV2ToRepository ('Number One — Distributed SoR & Scrum')"
else
  REPO_IDS="$(gh api "repos/${TARGET_REPO}" --jq '{repoNodeId: .node_id, ownerNodeId: .owner.node_id}' 2>/dev/null || true)"
  REPO_NODE_ID="$(printf '%s' "$REPO_IDS" | jq -r '.repoNodeId // empty')"
  OWNER_NODE_ID="$(printf '%s' "$REPO_IDS" | jq -r '.ownerNodeId // empty')"
  if [[ -n "$REPO_NODE_ID" && -n "$OWNER_NODE_ID" ]]; then
    if PROJECT_OUT="$(gh api graphql \
      -f ownerId="$OWNER_NODE_ID" \
      -f title="Number One — Distributed SoR & Scrum" \
      -f query='mutation($ownerId: ID!, $title: String!) { createProjectV2(input: { ownerId: $ownerId, title: $title }) { projectV2 { id number url } } }' 2>/dev/null)"; then
      PROJECT_ID="$(printf '%s' "$PROJECT_OUT" | jq -r '.data.createProjectV2.projectV2.id // empty')"
      PROJECT_URL="$(printf '%s' "$PROJECT_OUT" | jq -r '.data.createProjectV2.projectV2.url // empty')"
      if [[ -n "$PROJECT_ID" ]]; then
        gh api graphql \
          -f projectId="$PROJECT_ID" \
          -f repositoryId="$REPO_NODE_ID" \
          -f query='mutation($projectId: ID!, $repositoryId: ID!) { linkProjectV2ToRepository(input: { projectId: $projectId, repositoryId: $repositoryId }) { repository { id } } }' >/dev/null || true
        log "Provisioned & linked Projects v2 board: ${PROJECT_URL}"
      fi
    else
      log "Note: Token does not include Projects v2 write scope; create/link board in UI or re-run with project scope."
    fi
  fi
fi

# 9. Configure Default-Branch Repository Ruleset (CI + CodeQL + Dependency Review + Non-Fast-Forward)
log "Configuring Default Branch Repository Ruleset..."
RULESET_JSON='{
  "name": "Number One Default Branch Governance",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": false,
        "required_approving_review_count": 0,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "verify" },
          { "context": "Analyze (javascript-typescript)" },
          { "context": "dependency-review" }
        ]
      }
    }
  ]
}'

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "[dry-run] POST repos/${TARGET_REPO}/rulesets ('Number One Default Branch Governance')"
else
  EXISTING_RS_ID="$(gh api "repos/${TARGET_REPO}/rulesets" --jq '.[] | select(.name == "Number One Default Branch Governance") | .id' 2>/dev/null | head -n 1 || true)"
  if [[ -n "$EXISTING_RS_ID" ]]; then
    printf '%s' "$RULESET_JSON" | gh api -X PUT "repos/${TARGET_REPO}/rulesets/${EXISTING_RS_ID}" --input - >/dev/null
  else
    printf '%s' "$RULESET_JSON" | gh api -X POST "repos/${TARGET_REPO}/rulesets" --input - >/dev/null
  fi
fi

log "GitHub configuration complete for ${TARGET_REPO}. Documentation URL: ${PAGES_URL}"
