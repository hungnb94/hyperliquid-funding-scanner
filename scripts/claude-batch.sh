#!/usr/bin/env bash
set -euo pipefail

# Batch-process open issues with claude-issue.sh
# Skips issues that already have an open PR referencing them.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ISSUE_SCRIPT="${SCRIPT_DIR}/claude-issue.sh"

die() { echo "ERROR: $*" >&2; exit 1; }
has_gh() { command -v gh &>/dev/null; }

[[ -x "$ISSUE_SCRIPT" ]] || die "claude-issue.sh not found or not executable at ${ISSUE_SCRIPT}"

# Source env files (best-effort)
[[ -f ~/.zshrc ]] && source ~/.zshrc 2>/dev/null || true
[[ -f ~/.hermes/.env ]] && source ~/.hermes/.env 2>/dev/null || true

REPO=$(git remote get-url origin 2>/dev/null | sed -E 's#.*github\.com[:/](.+/.+?)(\.git)?$#\1#')
[[ -z "$REPO" ]] && die "Could not determine GitHub repo from git remote"

# ── Fetch open issues ───────────────────────────────────────────────────────

echo "Fetching open issues with label 'enhancement' or 'bug' from ${REPO}..."

if has_gh; then
  ISSUES_JSON=$(gh issue list --label "enhancement,bug" --state open --json number,title,labels --limit 100)
else
  TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN:-${GH_TOKEN:-}}"
  [[ -z "$TOKEN" ]] && die "No gh CLI and no GITHUB_PERSONAL_ACCESS_TOKEN/GH_TOKEN set"

  ISSUES_JSON=$(curl -sS \
    -H "Authorization: token ${TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/issues?state=open&labels=enhancement,bug&per_page=100" \
    | jq '[.[] | select(.pull_request == null) | {number, title, labels}]')
fi

ISSUE_COUNT=$(echo "$ISSUES_JSON" | jq 'length')
[[ "$ISSUE_COUNT" -eq 0 ]] && echo "No matching open issues found." && exit 0

echo "Found ${ISSUE_COUNT} issue(s)."

# ── Check for existing PRs ──────────────────────────────────────────────────

has_open_pr() {
  local num="$1"
  if has_gh; then
    local count
    count=$(gh pr list --state open --search "\"Closes #${num}\" in:body" --json number --jq 'length' 2>/dev/null || echo "0")
    [[ "$count" -gt 0 ]]
  else
    TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN:-${GH_TOKEN:-}}"
    local count
    count=$(curl -sS \
      -H "Authorization: token ${TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${REPO}/pulls?state=open" \
      | jq --arg n "#${num}" '[.[] | select(.body // "" | test($n; "i"))] | length')
    [[ "$count" -gt 0 ]]
  fi
}

# ── Process each issue ──────────────────────────────────────────────────────

PROCESSED=0
SKIPPED=0
FAILED=0

for i in $(seq 0 $((ISSUE_COUNT - 1))); do
  NUM=$(echo "$ISSUES_JSON" | jq -r ".[$i].number")
  TITLE=$(echo "$ISSUES_JSON" | jq -r ".[$i].title")

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Issue #${NUM}: ${TITLE}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if has_open_pr "$NUM"; then
    echo "Skipping #${NUM} — already has an open PR."
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Return to main before each issue so branches diverge cleanly
  git checkout main 2>/dev/null || true

  if "$ISSUE_SCRIPT" "$NUM"; then
    PROCESSED=$((PROCESSED + 1))
  else
    echo "Failed to process issue #${NUM}."
    FAILED=$((FAILED + 1))
  fi
done

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Batch complete: ${PROCESSED} processed, ${SKIPPED} skipped, ${FAILED} failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
