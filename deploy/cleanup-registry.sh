#!/usr/bin/env bash
# Keeps the newest $KEEP builds of the app image in GHCR and deletes the older ones. Run by the workflow Deploy prod
# on the GitHub runner after a successful production deploy; needs gh with GH_TOKEN (packages: write), docker logged in
# to ghcr.io and GITHUB_REPOSITORY:
#   bash deploy/cleanup-registry.sh
# One build is several package versions: the tagged one (tag = commit SHA) and the untagged ones it points to (the
# image itself, the build attestation). Those are kept or deleted together with their build: without them the build
# cannot be pulled. Untagged versions younger than an hour are not touched: they may belong to a build that is being
# pushed right now. The server keeps its own copies of the images it needs, see cleanup_images in common.sh.

set -euo pipefail

KEEP=10
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is set by GitHub Actions}"
OWNER="${REPO%%/*}"
# Image names are lowercase
IMAGE="ghcr.io/${REPO,,}"
PACKAGE="${IMAGE##*/}"

log() {
  printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

if [ "$(gh api "users/$OWNER" --jq '.type')" = "Organization" ]; then
  VERSIONS_URL="orgs/$OWNER/packages/container/$PACKAGE/versions"
else
  VERSIONS_URL="users/$OWNER/packages/container/$PACKAGE/versions"
fi

# All versions, every page, as one JSON array
VERSIONS="$(gh api --paginate "$VERSIONS_URL?per_page=100" | jq --slurp 'add // []')"

# Newest $KEEP tagged versions: their names are the digests of the builds
KEPT_BUILDS="$(jq -r --argjson keep "$KEEP" \
  '[.[] | select(.metadata.container.tags | length > 0)] | sort_by(.created_at) | reverse | .[:$keep][] | .name' \
  <<<"$VERSIONS")"
if [ -z "$KEPT_BUILDS" ]; then
  log "No tagged builds in $IMAGE: nothing is deleted"
  exit 0
fi

# Every digest that must stay: the kept builds and what they point to. Read before anything is deleted:
# if a build cannot be read, the script stops here and deletes nothing
KEPT_DIGESTS="$KEPT_BUILDS"
while read -r digest; do
  children="$(docker buildx imagetools inspect --raw "$IMAGE@$digest" | jq -r '.manifests[]?.digest')"
  if [ -n "$children" ]; then
    KEPT_DIGESTS="$KEPT_DIGESTS"$'\n'"$children"
  fi
done <<<"$KEPT_BUILDS"

# Delete: tagged versions that are not kept, and untagged ones that no kept build needs and are older than an hour
TO_DELETE="$(jq -r --argjson kept "$(jq -R . <<<"$KEPT_DIGESTS" | jq -s .)" \
  --arg hour_ago "$(date -u -d '-1 hour' '+%Y-%m-%dT%H:%M:%SZ')" \
  '.[] | select((.name | IN($kept[])) | not)
       | select((.metadata.container.tags | length > 0) or (.created_at < $hour_ago))
       | "\(.id) \(.name) \(.metadata.container.tags | join(","))"' \
  <<<"$VERSIONS")"

if [ -z "$TO_DELETE" ]; then
  log "Nothing to delete: $IMAGE has at most $KEEP builds"
  exit 0
fi

while read -r id digest tags; do
  gh api --method DELETE "$VERSIONS_URL/$id" --silent
  log "Deleted ${tags:+$tags }$digest"
done <<<"$TO_DELETE"
log "Kept the newest $KEEP builds of $IMAGE"
