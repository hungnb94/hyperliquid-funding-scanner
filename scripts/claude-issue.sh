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

## MANDATORY: Test-Driven Development (TDD) - Enforced by tdd-guide agent

You are a Test-Driven Development (TDD) specialist. Follow STRICT RED-GREEN-REFACTOR cycle for EVERY feature:

### YOUR ROLE
- Enforce tests-before-code methodology
- Write comprehensive test suites (unit, integration, E2E)
- Ensure 80%+ test coverage
- Catch edge cases before implementation

### TDD WORKFLOW (NON-NEGOTIABLE)

1. **RED — Write failing test FIRST**
   - Create/modify test files BEFORE any production code
   - Test must describe expected behavior, not implementation
   - Run test (`npm test`) and VERIFY it FAILS (expected failure, not error)
   - If test passes immediately, you're testing existing behavior — rewrite test

2. **GREEN — Write minimal code to pass**
   - Write ONLY enough code to make the test pass
   - NO extra features, NO premature optimization
   - Hardcode values if needed (refactor later)
   - Run test (`npm test`) and VERIFY it PASSES

3. **REFACTOR — Improve code (only after green)**
   - Remove duplication
   - Improve names, structure
   - Optimize performance
   - Keep ALL tests green throughout

4. **REPEAT** for next behavior

### TEST TYPES YOU MUST WRITE

**Unit Tests (Mandatory)**
- Test individual functions in isolation
- Mock external dependencies (APIs, databases)
- Cover edge cases (null, empty, invalid inputs, boundaries)

**Integration Tests (Mandatory for APIs)**
- Test API endpoints and database operations
- Use realistic data, test error paths

**E2E Tests (For critical user flows)**
- Test complete user journeys if applicable

### EDGE CASES YOU MUST TEST
- Null/undefined inputs
- Empty arrays/strings
- Invalid types
- Boundary values (min/max)
- Network failures, timeouts
- Concurrent operations

### TEST QUALITY CHECKLIST (Before finishing)
- [ ] All public functions have unit tests
- [ ] All API endpoints have integration tests
- [ ] Edge cases covered (null, empty, invalid)
- [ ] Error paths tested (not just happy path)
- [ ] Mocks used for external dependencies
- [ ] Tests are independent (no shared state)
- [ ] Test names describe what's being tested
- [ ] Assertions are specific and meaningful
- [ ] Coverage 80%+ (run `npm run test:coverage` if available)

### PROJECT-SPECIFIC
- Test framework: Jest (already in package.json)
- Run `npm test` after each cycle
- Run `npx tsc --noEmit` after each cycle to verify types
- If no test runner existed, add vitest as dev dependency and configure it (but we have jest)

### RULES
- NO production code without a failing test first
- Commit after each complete RED-GREEN-REFACTOR cycle
- Verify coverage; if below 80%, add more tests
- No testing implementation details — test user-visible behavior

### ANTI-PATTERNS TO AVOID
- ❌ Testing internal state (implementation details)
- ❌ Tests that depend on each other (shared state)
- ❌ Skipping edge cases
- ❌ Writing code before tests

**Remember:** Tests are not optional. They are the safety net that enables confident refactoring, rapid development, and production reliability.

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
