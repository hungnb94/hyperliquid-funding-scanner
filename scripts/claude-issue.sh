#!/usr/bin/env bash
set -euo pipefail

# ── Helpers ──────────────────────────────────────────────────────────────────

die() { echo "ERROR: $*" >&2; exit 1; }

has_gh() { command -v gh &>/dev/null; }

# Source env files (best-effort)
[[ -f ~/.zshrc ]] && source ~/.zshrc 2>/dev/null || true
[[ -f ~/.hermes/.env ]] && source ~/.hermes/.env 2>/dev/null || true

# ── Args ─────────────────────────────────────────────────────────────────────

ISSUE_NUM="${1:-}"
[[ -z "$ISSUE_NUM" ]] && die "Usage: $0 <issue_number>"

# Determine repo from git remote
REPO=$(git remote get-url origin 2>/dev/null | sed -E 's#.*github\.com[:/](.+/[^.]+)(\.git)?$#\1#')
[[ -z "$REPO" ]] && die "Could not determine GitHub repo from git remote"

# ── Fetch issue details ──────────────────────────────────────────────────────

echo "Fetching issue #${ISSUE_NUM} from ${REPO}..."

if has_gh; then
  ISSUE_JSON=$(gh issue view "$ISSUE_NUM" --json title,body,labels 2>/dev/null) \
    || die "Failed to fetch issue #${ISSUE_NUM} via gh CLI"
  ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
  ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body // ""')
else
  TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN:-${GH_TOKEN:-}}"
  [[ -z "$TOKEN" ]] && die "No gh CLI and no GITHUB_PERSONAL_ACCESS_TOKEN/GH_TOKEN set"

  API_URL="https://api.github.com/repos/${REPO}/issues/${ISSUE_NUM}"
  ISSUE_JSON=$(curl -sS -H "Authorization: token ${TOKEN}" \
    -H "Accept: application/vnd.github+json" "$API_URL") \
    || die "Failed to fetch issue #${ISSUE_NUM} via curl"

  ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
  ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body // ""')

  if echo "$ISSUE_JSON" | jq -e '.message' &>/dev/null; then
    die "GitHub API error: $(echo "$ISSUE_JSON" | jq -r '.message')"
  fi
fi

[[ -z "$ISSUE_TITLE" || "$ISSUE_TITLE" == "null" ]] && die "Could not parse issue title"

echo "Issue: ${ISSUE_TITLE}"

# ── Fetch latest code ────────────────────────────────────────────────────────

echo "Fetching latest code from origin..."
git fetch origin
git checkout main
git pull origin main

# ── Create branch ────────────────────────────────────────────────────────────

SHORT_SLUG=$(echo "$ISSUE_TITLE" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g' \
  | cut -c1-40)

BRANCH="issue-${ISSUE_NUM}-${SHORT_SLUG}"

echo "Creating branch: ${BRANCH}"
git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"

# ── Build prompt ─────────────────────────────────────────────────────────────

PROMPT="You are working on GitHub issue #${ISSUE_NUM} in the repo ${REPO}.

Title: ${ISSUE_TITLE}

Description:
${ISSUE_BODY}

Instructions:
- Implement the changes described in the issue above.
- Follow existing code conventions in the project.
- Make minimal, focused changes.
- Do not add unnecessary comments or documentation.

## MANDATORY: Test-Driven Development (TDD)

You MUST follow the RED-GREEN-REFACTOR cycle for EVERY feature:

1. **RED** — Write a failing test FIRST
   - Create/modify test files before any production code
   - Run the test and VERIFY it fails (not errors, but expected failure)
   - If test passes immediately, you're testing existing behavior — fix the test

2. **GREEN** — Write minimal code to pass
   - Only write enough code to make the test pass
   - No extra features, no premature optimization
   - Run the test and VERIFY it passes

3. **REFACTOR** — Clean up (only after green)
   - Remove duplication, improve names
   - Keep tests green throughout

4. **Repeat** for next behavior

Rules:
- NO production code without a failing test first
- Run \`npx tsc --noEmit\` after each cycle to verify types
- If project has test runner, run tests after each cycle
- Commit after each complete RED-GREEN-REFACTOR cycle

Test framework: Use whatever is in package.json (jest, vitest, mocha, etc). If none exists, add vitest as dev dependency and configure it."

# ── Run Claude ───────────────────────────────────────────────────────────────

echo "Running Claude Code on issue #${ISSUE_NUM}..."

claude -p "$PROMPT" \
  --dangerously-skip-permissions \
  --max-turns 20 \
  --allowedTools "Read,Edit,Write,Bash" \
  || die "Claude Code failed for issue #${ISSUE_NUM}. Aborting — no PR will be created."

# ── Commit ───────────────────────────────────────────────────────────────────

git add -A

if git diff --cached --quiet; then
  echo "No changes were made. Skipping commit and PR."
  exit 0
fi

git commit -m "feat: address #${ISSUE_NUM} - ${ISSUE_TITLE}

Closes #${ISSUE_NUM}

Automated implementation by Claude Code."

# ── Push ─────────────────────────────────────────────────────────────────────

echo "Pushing branch to origin..."
git push -u origin "$BRANCH"

# ── Create PR ────────────────────────────────────────────────────────────────

PR_BODY="## Summary

Automated implementation for #${ISSUE_NUM}.

Closes #${ISSUE_NUM}

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)"

echo "Creating pull request..."

if has_gh; then
  PR_URL=$(gh pr create \
    --title "Resolve #${ISSUE_NUM}: ${ISSUE_TITLE}" \
    --body "$PR_BODY" \
    --head "$BRANCH") \
    || die "Failed to create PR via gh CLI"
else
  TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN:-${GH_TOKEN:-}}"
  [[ -z "$TOKEN" ]] && die "No gh CLI and no token for creating PR"

  PR_RESPONSE=$(curl -sS -X POST \
    -H "Authorization: token ${TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/pulls" \
    -d "$(jq -n \
      --arg title "Resolve #${ISSUE_NUM}: ${ISSUE_TITLE}" \
      --arg body "$PR_BODY" \
      --arg head "$BRANCH" \
      --arg base "main" \
      '{title: $title, body: $body, head: $head, base: $base}')")

  PR_URL=$(echo "$PR_RESPONSE" | jq -r '.html_url // empty')
  [[ -z "$PR_URL" ]] && die "Failed to create PR via curl: $(echo "$PR_RESPONSE" | jq -r '.message // "unknown error"')"
fi

echo ""
echo "PR created: ${PR_URL}"
