#!/usr/bin/env bash
# Fills the database of one environment with test contacts, run by hand:
#   bash /srv/lockcrm/deploy/seed.sh prod [count]   (default: 1000)
# Never deletes anything: if contacts already exist, the seed does nothing.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

use_env "${1:?usage: seed.sh <prod|staging> [count]}"
shift

[ -s "$RELEASES_FILE" ] || fail "nothing has been deployed yet."
APP_IMAGE="$(tail -n 1 "$RELEASES_FILE")"
export APP_IMAGE
check_env_file

# The one-off migrate service already has the database settings
compose run --rm migrate node scripts/seed.mjs "$@"
