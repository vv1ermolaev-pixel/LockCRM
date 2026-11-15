#!/usr/bin/env bash
# Deploys one app version to one environment on the server. Called by GitHub Actions over SSH:
#   bash /srv/lockcrm/deploy/deploy.sh prod <image:tag> <public-url>
#   bash /srv/lockcrm-staging/deploy/deploy.sh staging <image:tag> <public-url>
# stdin: "<registry-user> <registry-token>" to pull the image from GHCR.
#
# Steps: pull image -> database backup (prod only) -> migrations (one-off container) -> new app
# -> smoke /health -> cleanup.
# Any failure stops the deploy with a non-zero exit code. There is no automatic
# rollback: a human decides and runs deploy/rollback.sh.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

USAGE="usage: deploy.sh <prod|staging> <image:tag> <public-url>"
use_env "${1:?$USAGE}"
IMAGE="${2:?$USAGE}"
PUBLIC_URL="${3:?$USAGE}"
VERSION="$(image_version "$IMAGE")"
export APP_IMAGE="$IMAGE"

check_env_file

# One deploy per environment at a time: a second one waits here until the first finishes
exec 9>"$APP_DIR/deploy.lock"
if ! flock --nonblock 9; then
  log "Another deploy to $ENV_NAME is running, waiting for it"
  flock 9
fi

log "Deploying $VERSION to $ENV_NAME"
# The other environment's cleanup keeps this image while the deploy runs
DEPLOYING_FILE="$APP_DIR/$DEPLOYING_FILE_NAME"
echo "$IMAGE" >"$DEPLOYING_FILE"
trap 'rm -f "$DEPLOYING_FILE"' EXIT

log "Pulling $IMAGE"
read -r REGISTRY_USER REGISTRY_TOKEN || fail "registry user and token are expected on stdin"
(
  # Temporary docker credentials: the token is never stored on the server
  DOCKER_CONFIG="$(mktemp -d)"
  export DOCKER_CONFIG
  trap 'rm -rf "$DOCKER_CONFIG"' EXIT
  # Docker warns that this temporary config stores the token unencrypted; it is deleted right after
  if ! output="$(printf '%s' "$REGISTRY_TOKEN" | docker login ghcr.io --username "$REGISTRY_USER" --password-stdin 2>&1)"; then
    fail "registry login failed: $output"
  fi
  docker pull --quiet "$IMAGE"
)
unset REGISTRY_TOKEN

log "Starting database"
compose up --detach --wait --quiet-pull db

if [ "$ENV_NAME" = "prod" ]; then
  # The dump name carries the version that runs before this deploy ("none" on the very first one)
  CURRENT_IMAGE="$(running_image)"
  CURRENT_VERSION="$(image_version "${CURRENT_IMAGE:-none}")"
  log "Backing up database (running version: $CURRENT_VERSION)"
  # No backup - no migrations: the running version stays as it is
  backup_db deploy "$CURRENT_VERSION" || fail "database backup failed, nothing changed"
  prune_backups
else
  # Staging holds a copy of production data: a broken database is loaded again from a production backup
  log "No backup on $ENV_NAME"
fi

log "Running migrations"
# If migrations fail, set -e stops here: the new app version does not start
compose run --rm migrate

log "Starting new app version $VERSION"
compose up --detach --no-deps --wait --wait-timeout 120 app

log "Smoke test"
smoke "$LOCAL_HEALTH_URL" "$VERSION" || fail "app does not answer on $LOCAL_HEALTH_URL"
smoke "$PUBLIC_URL/health" "$VERSION" || fail "app does not answer on $PUBLIC_URL/health (nginx/HTTPS)"

PREVIOUS="$(grep -vxF "$IMAGE" "$RELEASES_FILE" 2>/dev/null | tail -n 1 || true)"
echo "$IMAGE" >> "$RELEASES_FILE"

log "Cleanup: keeping only the current and the previous app images of every environment"
KEPT="$(kept_images)"
REPOSITORY="${IMAGE%:*}"
docker image ls "$REPOSITORY" --format '{{.Repository}}:{{.Tag}}' | while read -r ref; do
  if [[ "$ref" != *:"<none>" ]] && ! grep -qxF "$ref" <<<"$KEPT"; then
    # An image a container still uses is not removed; that does not fail the deploy that already went well
    if docker image rm "$ref" >/dev/null; then
      log "Removed old image $ref"
    else
      log "Kept image $ref: docker could not remove it"
    fi
  fi
done
docker image prune --force >/dev/null

log "Deployed $VERSION to $ENV_NAME (previous: ${PREVIOUS:-none})"
