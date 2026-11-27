#!/bin/bash
# Pull the latest code and keys, then (re)start the app. Safe to run any time:
#   sudo /opt/galla/deploy/gcp/redeploy.sh
set -euo pipefail
exec > >(tee -a /var/log/galla-deploy.log) 2>&1
echo "=== redeploy $(date -Is) ==="

md() { curl -fsS -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/$1"; }
APP_DIR=/opt/galla
BRANCH="$(md instance/attributes/galla-branch)"
DOMAIN="$(md instance/attributes/galla-domain)"
SECRETS="$(md instance/attributes/galla-secrets)"
PROJECT="$(md project/project-id)"

cd "$APP_DIR"
git fetch --depth 1 origin "$BRANCH"
git reset --hard FETCH_HEAD

# Keys: read each secret's latest version from Secret Manager with the VM's own identity.
# A secret with no value yet just stays empty, and the app runs without that feature.
TOKEN="$(md instance/service-accounts/default/token | jq -r .access_token)"
umask 077
{
  echo "# Written by redeploy.sh from Secret Manager. Do not edit; change the secrets instead."
  echo "SITE_DOMAIN=$DOMAIN"
  for NAME in $SECRETS; do
    ID="galla-$(echo "$NAME" | tr '[:upper:]_' '[:lower:]-')"
    VALUE="$(curl -fsS -H "Authorization: Bearer $TOKEN" \
      "https://secretmanager.googleapis.com/v1/projects/$PROJECT/secrets/$ID/versions/latest:access" 2>/dev/null \
      | jq -r '.payload.data // empty' | base64 -d 2>/dev/null | tr -d '\r\n' || true)"
    echo "$NAME=$VALUE"
    if [ -n "$VALUE" ]; then echo "  $NAME: set" >&2; else echo "  $NAME: empty" >&2; fi
  done
} > .env

# Self-signed stand-in so nginx can serve HTTPS before Let's Encrypt has issued the real cert.
SELF=/opt/galla-selfsigned
if [ ! -s "$SELF/fullchain.pem" ]; then
  mkdir -p "$SELF"
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 -subj "/CN=$DOMAIN" \
    -keyout "$SELF/privkey.pem" -out "$SELF/fullchain.pem" 2>/dev/null
fi

docker compose -f docker-compose.yml -f deploy/gcp/docker-compose.gcp.yml up -d --build --remove-orphans
docker image prune -f >/dev/null
echo "=== up: https://$DOMAIN ==="
