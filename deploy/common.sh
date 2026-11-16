# Shared helpers for the scripts in deploy/. Sourced, not run directly.
# shellcheck disable=SC2034  # the variables below are used by the scripts that source this file

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Folder of every environment on the server: its .env, releases.log and its own copy of deploy/
PROD_DIR="/srv/lockcrm"
STAGING_DIR="/srv/lockcrm-staging"
# Production database dumps: personal data, so only the owner can read them. The staging database is loaded from them
PROD_BACKUP_DIR="$PROD_DIR/backups"
# Every kind of dump is kept apart: the newest 7 of each. The kind is in the file name, see backup_db
BACKUP_KINDS="deploy daily restore"
BACKUP_KEEP=7
# App images older than this are removed from the server, except the ones kept_images lists
IMAGE_MAX_AGE_DAYS=14

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

# One deploy, rollback or backup per environment at a time: a second one waits here until the first finishes
take_lock() {
  exec 9>"$APP_DIR/deploy.lock"
  if ! flock --nonblock 9; then
    log "Another deploy, rollback or backup of $ENV_NAME is running, waiting for it"
    flock 9
  fi
}

# Images that must stay on the server whatever their age: the current and the previous production version
# (a rollback needs them), the current staging version and the image of a deploy that is still running
kept_images() {
  local dir
  if [ -f "$PROD_DIR/releases.log" ]; then
    # Newest first, each image once, the first two
    tac "$PROD_DIR/releases.log" | awk 'NF && !seen[$0]++ && ++count <= 2'
  fi
  if [ -f "$STAGING_DIR/releases.log" ]; then
    awk 'NF { last = $0 } END { if (last != "") print last }' "$STAGING_DIR/releases.log"
  fi
  for dir in "$PROD_DIR" "$STAGING_DIR"; do
    if [ -f "$dir/$DEPLOYING_FILE_NAME" ]; then
      cat "$dir/$DEPLOYING_FILE_NAME"
    fi
  done
}

# Removes images of the app that are older than $IMAGE_MAX_AGE_DAYS, except the ones kept_images lists.
# Both environments share the server's images. Run after a successful production deploy:
#   cleanup_images <image repository>
cleanup_images() {
  local repository="$1" kept cutoff ref created
  kept="$(kept_images)"
  cutoff="$(date -d "-$IMAGE_MAX_AGE_DAYS days" +%s)"
  while read -r ref; do
    if [[ "$ref" == *:"<none>" ]] || grep -qxF "$ref" <<<"$kept"; then
      continue
    fi
    # Build time of the image: it is built when its commit lands in main
    if ! created="$(date -d "$(docker image inspect --format '{{.Created}}' "$ref")" +%s)"; then
      log "Kept image $ref: could not read its build time"
      continue
    fi
    if [ "$created" -ge "$cutoff" ]; then
      continue
    fi
    # An image a container still uses is not removed; that does not fail the deploy that already went well
    if docker image rm "$ref" >/dev/null; then
      log "Removed old image $ref"
    else
      log "Kept image $ref: docker could not remove it"
    fi
  done < <(docker image ls "$repository" --format '{{.Repository}}:{{.Tag}}')
  docker image prune --force >/dev/null
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

# Keeps only the newest $BACKUP_KEEP dumps of every kind; file names start with the date, so name order is time order
prune_backups() {
  local kind old
  for kind in $BACKUP_KINDS; do
    find "$BACKUP_DIR" -maxdepth 1 -name "*_${kind}_*.dump" -printf '%f\n' | sort | head -n "-$BACKUP_KEEP" |
      while read -r old; do
        rm -f "$BACKUP_DIR/$old" && log "Removed old backup $old"
      done
  done
}

# Marks the crontab line of the daily production backup: only this line is replaced, other lines stay as they are
BACKUP_CRON_MARK="# LockCRM: daily production database backup, installed by deploy/deploy.sh"

# Adds the daily production backup at 03:00 Moscow time to the crontab of the deploy user, or updates it.
# Fails without changing anything if the server has no cron
install_backup_cron() {
  local when line current new
  command -v crontab >/dev/null || fail "crontab not found: install cron on the server (sudo apt install cron)"
  # 03:00 Moscow time (always UTC+3: Moscow has no daylight saving time) as the server's local time, which cron uses
  when="$(date -d '03:00 +0300' '+%-M %-H')"
  line="$when * * * bash $PROD_DIR/deploy/backup.sh prod >>$PROD_DIR/backup.log 2>&1"
  current="$(crontab -l 2>/dev/null || true)"
  new="$(
    if [ -n "$current" ]; then
      grep -vF -e "$BACKUP_CRON_MARK" -e "$PROD_DIR/deploy/backup.sh" <<<"$current" || true
    fi
    printf '%s\n%s\n' "$BACKUP_CRON_MARK" "$line"
  )"
  if [ "$new" = "$current" ]; then
    return 0
  fi
  printf '%s\n' "$new" | crontab - || fail "could not update the crontab"
  log "Daily backup scheduled: $line"
}
