#!/usr/bin/env bash
# Restores the database of one environment from a backup, run by a human on the server:
#   bash /srv/lockcrm/deploy/restore.sh prod /srv/lockcrm/backups/<file>.dump
#   bash /srv/lockcrm-staging/deploy/restore.sh staging [/srv/lockcrm/backups/<file>.dump]
# Staging takes the newest production backup when no file is given.
# Shows what will be replaced and waits for "yes". Then: stop the app -> back up the current
# database (prod only: staging is recreated from production backups) -> drop and recreate the database
# -> load the backup -> migrations of the running version (a backup from an older version gets the newer
# tables and columns) -> start the same app version -> smoke /health. The app version does not change,
# releases.log is not touched.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

USAGE="usage: restore.sh prod <backup-file> | restore.sh staging [backup-file]"
use_env "${1:?$USAGE}"
BACKUP="${2:-}"
if [ -z "$BACKUP" ]; then
  [ "$ENV_NAME" = "staging" ] || fail "$USAGE"
  NEWEST="$(find "$PROD_BACKUP_DIR" -maxdepth 1 -name '*.dump' -printf '%f\n' | sort | tail -n 1)"
  [ -n "$NEWEST" ] || fail "no production backups in $PROD_BACKUP_DIR."
  BACKUP="$PROD_BACKUP_DIR/$NEWEST"
fi
[ -f "$BACKUP" ] || fail "$BACKUP not found."
BACKUP="$(realpath "$BACKUP")"
[ -s "$RELEASES_FILE" ] || fail "$RELEASES_FILE is empty: nothing has been deployed to $ENV_NAME yet."
check_env_file

# The version that runs now; if the app is stopped, the last deployed one
APP_IMAGE="$(tail -n 1 "$RELEASES_FILE")"
export APP_IMAGE
RUNNING_IMAGE="$(running_image)"
if [ -n "$RUNNING_IMAGE" ]; then
  APP_IMAGE="$RUNNING_IMAGE"
fi
VERSION="$(image_version "$APP_IMAGE")"

compose up --detach --wait --quiet-pull db
# Checked before anything is touched: the file must be a dump that pg_restore can read
compose exec -T db pg_restore --list <"$BACKUP" >/dev/null ||
  fail "$BACKUP is not a database backup (pg_dump --format=custom). Nothing changed."
DB_NAME="$(compose exec -T db printenv POSTGRES_DB)"

echo
echo "Backup file:  $BACKUP"
echo "              $(du -h "$BACKUP" | cut -f1), saved $(date -r "$BACKUP" '+%Y-%m-%d %H:%M:%S')"
echo "Database:     $DB_NAME (docker compose project $ENV_NAME): ALL its data will be replaced"
if [ "$ENV_NAME" != "prod" ]; then
  echo "              no copy of it is kept"
fi
echo "App version:  $VERSION (stays the same)"
echo
read -r -p 'Type "yes" to restore: ' ANSWER || ANSWER=""
[ "$ANSWER" = "yes" ] || {
  log "Cancelled, nothing changed."
  exit 0
}

log "Stopping the app"
compose stop app

SAFETY_COPY=""
if [ "$ENV_NAME" = "prod" ]; then
  log "Backing up the current database"
  if ! backup_db restore "$VERSION"; then
    log "Starting the app again: the database is not touched"
    compose up --detach --no-deps --wait --wait-timeout 120 app
    fail "restore cancelled."
  fi
  SAFETY_COPY="$BACKUP_FILE"
fi

# From here on a failure leaves the app stopped: a human decides what to do next
on_failure() {
  log "ERROR: restore failed, the app is stopped."
  if [ -n "$SAFETY_COPY" ]; then
    log "The database as it was before this restore: $SAFETY_COPY"
    log "To bring it back: bash $0 $ENV_NAME $SAFETY_COPY"
  else
    log "To try again: bash $0 $ENV_NAME"
  fi
}
trap on_failure EXIT

log "Recreating database $DB_NAME"
# shellcheck disable=SC2016  # the variables are expanded inside the db container
compose exec -T db sh -c \
  'dropdb --username="$POSTGRES_USER" --force "$POSTGRES_DB" && createdb --username="$POSTGRES_USER" "$POSTGRES_DB"'

log "Loading $BACKUP"
# --no-owner and --no-privileges: the staging database user is not the production one
# shellcheck disable=SC2016
compose exec -T db sh -c \
  'pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-owner --no-privileges --exit-on-error --single-transaction' \
  <"$BACKUP"

log "Running migrations of version $VERSION"
compose run --rm migrate

log "Starting app version $VERSION"
compose up --detach --no-deps --wait --wait-timeout 120 app
smoke "$LOCAL_HEALTH_URL" "$VERSION" || fail "app does not answer on $LOCAL_HEALTH_URL"

trap - EXIT
log "Restored $DB_NAME ($ENV_NAME) from $BACKUP, app version $VERSION"
if [ -n "$SAFETY_COPY" ]; then
  # Pruned only now: the file being restored may be the oldest one
  prune_backups
  log "The database as it was before this restore: $SAFETY_COPY"
fi
