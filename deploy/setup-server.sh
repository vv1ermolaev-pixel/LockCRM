#!/usr/bin/env bash
# One-time server setup for the app. Needs the sudo password, so a human runs it:
#   ssh -t crm "sudo bash ~/setup-server.sh"
# Safe to run again. Only adds what the app needs; the landing and other settings stay as they are.
#   1. Lets the deploy user run docker (GitHub Actions logs in as this user).
#   2. Creates the production folder /srv/lockcrm owned by the deploy user.
#   3. Points nginx for app.funkicrm.ru to the production app on 127.0.0.1:3000.
#   4. Creates the staging folder /srv/lockcrm-staging owned by the deploy user.
#   5. Asks for the staging login and password (once: kept hashed for nginx).
#   6. Adds the nginx site test-app.funkicrm.ru (own file), gets its certificate,
#      points it to the staging app on 127.0.0.1:3001 behind the password.
#   7. Lets the deploy user read the server journal, where the app containers write their logs.

set -euo pipefail

DEPLOY_USER="crmapp"
APP_DIR="/srv/lockcrm"
NGINX_SITE="/etc/nginx/sites-available/funkicrm.conf"
PROXY_TARGET="http://127.0.0.1:3000"

STAGING_DIR="/srv/lockcrm-staging"
STAGING_DOMAIN="test-app.funkicrm.ru"
STAGING_PROXY_TARGET="http://127.0.0.1:3001"
STAGING_SITE="/etc/nginx/sites-available/lockcrm-staging.conf"
STAGING_SITE_LINK="/etc/nginx/sites-enabled/lockcrm-staging.conf"
STAGING_HTPASSWD="/etc/nginx/lockcrm-staging.htpasswd"
STAGING_CERT_DIR="/etc/letsencrypt/live/$STAGING_DOMAIN"
# The folder certbot already uses for funkicrm.ru and app.funkicrm.ru
CERTBOT_WEBROOT="/var/www/certbot"

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: sudo bash $0" >&2; exit 1; }

echo "1/7 docker access for $DEPLOY_USER"
usermod --append --groups docker "$DEPLOY_USER"

echo "2/7 app folder $APP_DIR"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"

echo "3/7 nginx: app.funkicrm.ru -> $PROXY_TARGET"
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

echo "4/7 staging folder $STAGING_DIR"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$STAGING_DIR"

echo "5/7 staging login and password: $STAGING_HTPASSWD"
if [ -s "$STAGING_HTPASSWD" ]; then
  echo "    already set, skipped (to change it: sudo rm $STAGING_HTPASSWD and run this script again)"
else
  read -r -p "    Login for $STAGING_DOMAIN: " login
  [[ "$login" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "    the login may have only latin letters, digits, . _ -" >&2; exit 1; }
  # The password is not shown and never appears on a command line: only its hash is stored
  read -r -s -p "    Password: " password
  echo
  read -r -s -p "    Password again: " password_again
  echo
  [ -n "$password" ] || { echo "    the password is empty, nothing changed" >&2; exit 1; }
  [ "$password" = "$password_again" ] || { echo "    the passwords differ, nothing changed" >&2; exit 1; }
  hash="$(printf '%s' "$password" | openssl passwd -6 -stdin)"
  unset password password_again
  # Readable by nginx workers (group www-data), not by other users
  (umask 027 && printf '%s:%s\n' "$login" "$hash" >"$STAGING_HTPASSWD")
  chown root:www-data "$STAGING_HTPASSWD"
  chmod 640 "$STAGING_HTPASSWD"
  echo "    saved"
fi

# HTTP: Let's Encrypt checks (needed to get and renew the certificate), everything else to HTTPS
staging_http_block() {
  cat <<EOF
# Staging (LockCRM repo, deploy/setup-server.sh): $STAGING_DOMAIN -> staging app container
server {
    listen 80;
    server_name $STAGING_DOMAIN;
    location /.well-known/acme-challenge/ { root $CERTBOT_WEBROOT; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF
}

# HTTPS: everything behind the staging password, except /health that the deploy smoke test calls.
# The password header is not passed to the app
staging_https_block() {
  cat <<EOF

server {
    listen 443 ssl http2;
    server_name $STAGING_DOMAIN;
    ssl_certificate     $STAGING_CERT_DIR/fullchain.pem;
    ssl_certificate_key $STAGING_CERT_DIR/privkey.pem;

    auth_basic "LockCRM staging";
    auth_basic_user_file $STAGING_HTPASSWD;

    location / {
        proxy_pass $STAGING_PROXY_TARGET;
        include proxy_params;
        proxy_set_header Authorization "";
    }

    location = /health {
        auth_basic off;
        proxy_pass $STAGING_PROXY_TARGET;
        include proxy_params;
        proxy_set_header Authorization "";
    }
}
EOF
}

# Writes the staging site and reloads nginx. If nginx rejects it, the staging site goes back to what it was
apply_staging_site() {
  local content="$1" previous=""
  if [ -f "$STAGING_SITE" ]; then
    if [ "$(cat "$STAGING_SITE")" = "$content" ] && [ -L "$STAGING_SITE_LINK" ]; then
      echo "    nginx site is up to date"
      return 0
    fi
    previous="$(mktemp)"
    cp -a "$STAGING_SITE" "$previous"
  fi
  printf '%s\n' "$content" >"$STAGING_SITE"
  ln -sfn "$STAGING_SITE" "$STAGING_SITE_LINK"
  if ! nginx -t; then
    if [ -n "$previous" ]; then
      cp -a "$previous" "$STAGING_SITE"
    else
      rm -f "$STAGING_SITE" "$STAGING_SITE_LINK"
    fi
    echo "    nginx config test failed, the staging site is back as it was" >&2
    exit 1
  fi
  [ -z "$previous" ] || rm -f "$previous"
  systemctl reload nginx
  echo "    nginx site saved and reloaded"
}

echo "6/7 nginx and certificate: $STAGING_DOMAIN -> $STAGING_PROXY_TARGET"
if [ ! -f "$STAGING_CERT_DIR/fullchain.pem" ]; then
  # Without a certificate nginx cannot serve HTTPS yet: first only HTTP, for the Let's Encrypt check
  apply_staging_site "$(staging_http_block)"
  certbot certonly --webroot --webroot-path "$CERTBOT_WEBROOT" \
    --domain "$STAGING_DOMAIN" --cert-name "$STAGING_DOMAIN" --non-interactive
fi
apply_staging_site "$(staging_http_block)$(staging_https_block)"

echo "7/7 journal access for $DEPLOY_USER (container logs, see deploy/compose.yaml)"
# Takes effect from the next login of the user
usermod --append --groups systemd-journal "$DEPLOY_USER"

echo "Server is ready for deploys."
