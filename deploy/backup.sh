#!/usr/bin/env bash
# Daily production database backup. Run by cron at 03:00 Moscow time; deploy.sh installs the crontab line:
#   bash /srv/lockcrm/deploy/backup.sh prod >>/srv/lockcrm/backup.log 2>&1
# Can be run by hand the same way. Staging has no backups: its database is loaded from production ones.
# Keeps the newest backups of every kind, see prune_backups in common.sh.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

use_env "${1:?usage: backup.sh prod}"
[ "$ENV_NAME" = "prod" ] || fail "only prod has backups: staging is loaded from production backups"
log "Daily backup of $ENV_NAME, $(date '+%Y-%m-%d')"
[ -s "$RELEASES_FILE" ] || fail "$RELEASES_FILE is empty: nothing has been deployed yet."
check_env_file

# Waits for a deploy or a rollback that is running now
take_lock

# compose.yaml needs an app image; the database container does not depend on it
APP_IMAGE="$(tail -n 1 "$RELEASES_FILE")"
export APP_IMAGE
RUNNING_IMAGE="$(running_image)"
VERSION="$(image_version "${RUNNING_IMAGE:-$APP_IMAGE}")"

backup_db daily "$VERSION" || fail "daily backup failed"
prune_backups
log "Daily backup done"
