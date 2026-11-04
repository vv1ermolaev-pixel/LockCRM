# Shared helpers for the scripts in deploy/. Sourced, not run directly.
# shellcheck disable=SC2034  # the variables below are used by the scripts that source this file

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"
# Every successfully deployed image, one per line; the last line is the current version
RELEASES_FILE="$APP_DIR/releases.log"
LOCAL_HEALTH_URL="http://127.0.0.1:3000/health"
# Database dumps: personal data, so only the owner can read them
BACKUP_DIR="$APP_DIR/backups"
BACKUP_KEEP=30

log() {
  printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

compose() {
  docker compose -p prod -f "$APP_DIR/deploy/compose.yaml" --env-file "$ENV_FILE" "$@"
}

check_env_file() {
  [ -f "$ENV_FILE" ] || fail "$ENV_FILE not found. Create it as described in README.md."
  local mode
  mode="$(stat -c '%a' "$ENV_FILE")"
  [ "$mode" = "600" ] || fail "$ENV_FILE must have mode 600 (now $mode). Run: chmod 600 $ENV_FILE"
}

# Waits until the URL answers 200 with the expected version in the body
smoke() {
  local url="$1" version="$2" body=""
  for _ in $(seq 1 10); do
    if body="$(curl --silent --show-error --fail --max-time 5 "$url" 2>&1)" \
      && [[ "$body" == *"\"version\":\"$version\""* ]]; then
      log "Smoke OK: $url -> 200 $body"
      return 0
    fi
    sleep 3
  done
  log "Smoke FAILED: $url -> $body"
  return 1
}

image_version() {
  printf '%s' "${1##*:}"
}

# Image of the app container that is running now; empty if the app is not running
running_image() {
  local id
  id="$(compose ps --quiet app)"
  if [ -n "$id" ]; then
    docker inspect --format '{{.Config.Image}}' "$id"
  fi
}

# Dumps the production database into $BACKUP_DIR and sets BACKUP_FILE to the new dump.
#   backup_db <reason> <app version running now>
# Returns non-zero instead of exiting, so the caller decides what to do on failure.
backup_db() {
  local reason="$1" version="$2" tmp
  BACKUP_FILE="$BACKUP_DIR/$(date '+%Y-%m-%d_%H-%M-%S')_${reason}_${version}.dump"
  tmp="$BACKUP_FILE.tmp"
  install -d -m 700 "$BACKUP_DIR" || return 1
  # Written under a temporary name first: an interrupted dump never looks like a finished one
  # shellcheck disable=SC2016  # the variables are expanded inside the db container
  if ! (umask 077 && compose exec -T db sh -c \
    'pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom' >"$tmp"); then
    rm -f "$tmp"
    log "Backup FAILED: pg_dump did not finish"
    return 1
  fi
  mv "$tmp" "$BACKUP_FILE" || return 1
  log "Backup saved: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
}

# Keeps only the newest $BACKUP_KEEP dumps; file names start with the date, so name order is time order
prune_backups() {
  local old
  find "$BACKUP_DIR" -maxdepth 1 -name '*.dump' -printf '%f\n' | sort | head -n "-$BACKUP_KEEP" |
    while read -r old; do
      rm -f "$BACKUP_DIR/$old" && log "Removed old backup $old"
    done
}
