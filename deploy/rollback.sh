#!/usr/bin/env bash
# Manual rollback of one environment, run by a human on the server:
#   bash /srv/lockcrm/deploy/rollback.sh prod              # back to the previous version
#   bash /srv/lockcrm/deploy/rollback.sh prod <image:tag>  # to a specific image kept on the server
#   bash /srv/lockcrm-staging/deploy/rollback.sh staging   # the same for staging
# Restarts only the app with an older image. Database migrations are NOT reverted.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

use_env "${1:?usage: rollback.sh <prod|staging> [image:tag]}"
[ -s "$RELEASES_FILE" ] || fail "$RELEASES_FILE is empty: nothing has been deployed yet."
CURRENT="$(tail -n 1 "$RELEASES_FILE")"
TARGET="${2:-$(grep -vxF "$CURRENT" "$RELEASES_FILE" | tail -n 1 || true)}"
[ -n "$TARGET" ] || fail "no previous version to roll back to."
docker image inspect "$TARGET" >/dev/null 2>&1 || fail "image $TARGET is not on the server."

export APP_IMAGE="$TARGET"
check_env_file

log "Rolling back $ENV_NAME from $CURRENT to $TARGET"
compose up --detach --no-deps --wait --wait-timeout 120 app
smoke "$LOCAL_HEALTH_URL" "$(image_version "$TARGET")" || fail "app does not answer after rollback."

echo "$TARGET" >> "$RELEASES_FILE"
log "Rolled back $ENV_NAME to $(image_version "$TARGET")"
