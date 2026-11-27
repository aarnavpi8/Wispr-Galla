#!/bin/sh
# Runs inside the nginx container before nginx starts (official image: /docker-entrypoint.d/).
# Points /etc/nginx/certs at the Let's Encrypt cert once certbot has issued it, or at the
# self-signed stand-in (made by redeploy.sh) until then. A watcher re-links and reloads nginx
# when certbot issues or renews, so HTTPS turns "real" without a restart.
set -eu

LIVE="/etc/letsencrypt/live/${SITE_DOMAIN}"
FALLBACK="/etc/galla-selfsigned"
mkdir -p /etc/nginx/certs

pick() {
  if [ -s "$LIVE/fullchain.pem" ] && [ -s "$LIVE/privkey.pem" ]; then
    echo "$LIVE"
  else
    echo "$FALLBACK"
  fi
}

link() {
  ln -sf "$1/fullchain.pem" /etc/nginx/certs/fullchain.pem
  ln -sf "$1/privkey.pem" /etc/nginx/certs/privkey.pem
}

CURRENT="$(pick)"
link "$CURRENT"
echo "galla-certs: using $CURRENT"

(
  LAST="$CURRENT:$(cat "$CURRENT/fullchain.pem" 2>/dev/null | md5sum)"
  while sleep 300; do
    DIR="$(pick)"
    NOW="$DIR:$(cat "$DIR/fullchain.pem" 2>/dev/null | md5sum)"
    if [ "$NOW" != "$LAST" ]; then
      link "$DIR"
      nginx -s reload && echo "galla-certs: reloaded with $DIR"
      LAST="$NOW"
    fi
  done
) &
