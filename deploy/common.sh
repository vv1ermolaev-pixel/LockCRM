# Shared helpers for the scripts in deploy/. Sourced, not run directly.
# shellcheck disable=SC2034  # the variables below are used by the scripts that source this file

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Folder of every environment on the server: its .env, releases.log and its own copy of deploy/
PROD_DIR="/srv/lockcrm"
STAGING_DIR="/srv/lockcrm-staging"
# Production database dumps: personal data, so only the owner can read them. The staging database is loaded from them
PROD_BACKUP_DIR="$PROD_DIR/backups"
BACKUP_KEEP=30

# Picks the environment every other function works with. Every script calls it first:
#   use_env <prod|staging>
use_env() {
  ENV_NAME="$1"
  case "$ENV_NAME" in
    prod)
      APP_DIR="$PROD_DIR"
      APP_PORT=3000
      ;;
    staging)
      APP_DIR="$STAGING_DIR"
      APP_PORT=3001
      ;;
    *) fail "unknown environment \"$ENV_NAME\": use prod or staging" ;;
  esac
  ENV_FILE="$APP_DIR/.env"
  # Every successfully deployed image, one per line; the last line is the current version
  RELEASES_FILE="$APP_DIR/releases.log"
  BACKUP_DIR="$APP_DIR/backups"
  LOCAL_HEALTH_URL="http://127.0.0.1:$APP_PORT/health"
  # compose.yaml publishes the app on this localhost port
  export APP_PORT
}

log() {
  printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

# The project name keeps the environments apart: own containers, own network, own database volume
compose() {
  docker compose -p "$ENV_NAME" -f "$SCRIPT_DIR/compose.yaml" --env-file "$ENV_FILE" "$@"
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

# Image a deploy is bringing in right now; written by deploy.sh, removed when it ends
DEPLOYING_FILE_NAME="deploying.image"

# Images that must stay on the server: the current and the previous version of every environment (a rollback
# needs them) and the image of a deploy that is still running. The environments share the server's images,
# so a cleanup must keep the other environment's ones too
kept_images() {
  local dir
  for dir in "$PROD_DIR" "$STAGING_DIR"; do
    if [ -f "$dir/releases.log" ]; then
      # Newest first, each image once, the first two
      tac "$dir/releases.log" | awk 'NF && !seen[$0]++ && ++count <= 2'
    fi
    if [ -f "$dir/$DEPLOYING_FILE_NAME" ]; then
      cat "$dir/$DEPLOYING_FILE_NAME"
    fi
  done
}

# Dumps the environment's database into $BACKUP_DIR and sets BACKUP_FILE to the new dump.
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
