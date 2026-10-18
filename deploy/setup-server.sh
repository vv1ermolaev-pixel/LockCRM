#!/usr/bin/env bash
# One-time server setup for the app. Needs the sudo password, so a human runs it:
#   ssh -t crm "sudo bash ~/setup-server.sh"
# Safe to run again. Only adds what the app needs; the landing and other settings stay as they are.
#   1. Lets the deploy user run docker (GitHub Actions logs in as this user).
#   2. Creates the app folder /srv/lockcrm owned by the deploy user.
#   3. Points nginx for app.funkicrm.ru to the app container on 127.0.0.1:3000.

set -euo pipefail

DEPLOY_USER="crmapp"
APP_DIR="/srv/lockcrm"
NGINX_SITE="/etc/nginx/sites-available/funkicrm.conf"
PROXY_TARGET="http://127.0.0.1:3000"

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: sudo bash $0" >&2; exit 1; }

echo "1/3 docker access for $DEPLOY_USER"
usermod --append --groups docker "$DEPLOY_USER"

echo "2/3 app folder $APP_DIR"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"

echo "3/3 nginx: app.funkicrm.ru -> $PROXY_TARGET"
if grep -qF "proxy_pass $PROXY_TARGET;" "$NGINX_SITE"; then
  echo "    already configured, skipped"
else
  backup="$NGINX_SITE.bak-$(date +%Y%m%d-%H%M%S)"
  cp -a "$NGINX_SITE" "$backup"
  # Inside the app.funkicrm.ru server block, replace the placeholder page with the proxy.
  # The landing block (root /var/www/funkicrm.ru) is not touched.
  PROXY_BLOCK="    location / {
        proxy_pass $PROXY_TARGET;
        include proxy_params;
    }
" perl -0777 -i -pe '
    s{^    root /var/www/app\.funkicrm\.ru;\n    index index\.html;\n    location / \{ try_files \$uri \$uri/ =404; \}\n}{$ENV{PROXY_BLOCK}}m;
    s{^# Приложение\. Пока заглушка\..*\n# root/index/location .*\n#   location / .*\n}{# App (LockCRM repo): requests go to the app container, see deploy/compose.yaml\n}m;
  ' "$NGINX_SITE"
  if ! grep -qF "proxy_pass $PROXY_TARGET;" "$NGINX_SITE"; then
    cp -a "$backup" "$NGINX_SITE"
    echo "    app.funkicrm.ru block has an unexpected shape, nothing changed" >&2
    exit 1
  fi
  if ! nginx -t; then
    cp -a "$backup" "$NGINX_SITE"
    echo "    nginx config test failed, previous config restored" >&2
    exit 1
  fi
  systemctl reload nginx
  echo "    done, previous config saved to $backup"
fi

echo "Server is ready for deploys."
