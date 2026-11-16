#!/usr/bin/env bash
# Picks the commit for a production deploy: only a commit that staging has already deployed successfully.
# Run by the workflow Deploy prod on the GitHub runner; needs gh with GH_TOKEN (actions: read) and GITHUB_REPOSITORY:
#   bash deploy/pick-prod-version.sh            # the newest successful staging deploy
#   bash deploy/pick-prod-version.sh <sha>      # this commit (full or short SHA), if staging deployed it
# Prints the full SHA. The staging deploy history is the runs of the workflow Deploy staging on main.

set -euo pipefail

STAGING_WORKFLOW="deploy-staging.yml"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is set by GitHub Actions}"
# Spaces around a pasted SHA are dropped
REQUESTED="$(tr -d '[:space:]' <<<"${1:-}")"
RUNS="repos/$REPO/actions/workflows/$STAGING_WORKFLOW/runs?branch=main&event=push&status=success&per_page=1"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

if [ -z "$REQUESTED" ]; then
  # Runs are listed newest first
  SHA="$(gh api "$RUNS" --jq '.workflow_runs[0].head_sha // empty')"
  [ -n "$SHA" ] || fail "staging has no successful deploy yet: nothing to deploy to prod"
  echo "The newest successful staging deploy: $SHA" >&2
else
  [[ "$REQUESTED" =~ ^[0-9a-fA-F]{7,40}$ ]] || fail "\"$REQUESTED\" is not a commit SHA"
  SHA="$(gh api "repos/$REPO/commits/$REQUESTED" --jq '.sha' 2>/dev/null)" ||
    fail "commit $REQUESTED is not in the repository"
  PASSED="$(gh api "$RUNS&head_sha=$SHA" --jq '.total_count')"
  [ "$PASSED" -gt 0 ] ||
    fail "commit $SHA has no successful staging deploy (workflow Deploy staging): it cannot go to prod"
  echo "Staging deployed $SHA successfully" >&2
fi

echo "$SHA"
