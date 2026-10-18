# Shared helpers for deploy.sh and rollback.sh. Sourced, not run directly.
# shellcheck disable=SC2034  # the variables below are used by the scripts that source this file

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"
# Every successfully deployed image, one per line; the last line is the current version
RELEASES_FILE="$APP_DIR/releases.log"
LOCAL_HEALTH_URL="http://127.0.0.1:3000/health"

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
