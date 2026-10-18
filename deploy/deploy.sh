#!/usr/bin/env bash
# Deploys one app version on the server. Called by GitHub Actions over SSH:
#   bash /srv/lockcrm/deploy/deploy.sh <image:tag> <public-url>
# stdin: "<registry-user> <registry-token>" to pull the image from GHCR.
#
# Steps: pull image -> migrations (one-off container) -> new app -> smoke /health -> cleanup.
# Any failure stops the deploy with a non-zero exit code. There is no automatic
# rollback: a human decides and runs deploy/rollback.sh.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

IMAGE="${1:?usage: deploy.sh <image:tag> <public-url>}"
PUBLIC_URL="${2:?usage: deploy.sh <image:tag> <public-url>}"
VERSION="$(image_version "$IMAGE")"
export APP_IMAGE="$IMAGE"

check_env_file

log "Pulling $IMAGE"
read -r REGISTRY_USER REGISTRY_TOKEN || fail "registry user and token are expected on stdin"
(
  # Temporary docker credentials: the token is never stored on the server
  DOCKER_CONFIG="$(mktemp -d)"
  export DOCKER_CONFIG
  trap 'rm -rf "$DOCKER_CONFIG"' EXIT
  printf '%s' "$REGISTRY_TOKEN" | docker login ghcr.io --username "$REGISTRY_USER" --password-stdin >/dev/null
  docker pull --quiet "$IMAGE"
)
unset REGISTRY_TOKEN

log "Starting database"
compose up --detach --wait db

log "Running migrations"
# If migrations fail, set -e stops here: the new app version does not start
compose run --rm migrate

log "Starting new app version $VERSION"
compose up --detach --no-deps --wait --wait-timeout 120 app

log "Smoke test"
smoke "$LOCAL_HEALTH_URL" "$VERSION" || fail "app does not answer on $LOCAL_HEALTH_URL"
smoke "$PUBLIC_URL/health" "$VERSION" || fail "app does not answer on $PUBLIC_URL/health (nginx/HTTPS)"

echo "$IMAGE" >> "$RELEASES_FILE"

log "Cleanup: keeping only the current and the previous app images"
PREVIOUS="$(grep -vxF "$IMAGE" "$RELEASES_FILE" | tail -n 1 || true)"
REPOSITORY="${IMAGE%:*}"
docker image ls "$REPOSITORY" --format '{{.Repository}}:{{.Tag}}' | while read -r ref; do
  if [ "$ref" != "$IMAGE" ] && [ "$ref" != "$PREVIOUS" ] && [[ "$ref" != *:"<none>" ]]; then
    docker image rm "$ref" >/dev/null && log "Removed old image $ref"
  fi
done
docker image prune --force >/dev/null

log "Deployed $VERSION (previous: ${PREVIOUS:-none})"
