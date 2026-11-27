#!/bin/bash
# Runs as root on every boot of the VM. Installs Docker once, then hands over to redeploy.sh.
set -euo pipefail
exec >>/var/log/galla-deploy.log 2>&1
echo "=== boot $(date -Is) ==="

md() { curl -fsS -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"; }
REPO="$(md galla-repo)"
BRANCH="$(md galla-branch)"
APP_DIR=/opt/galla

# Some headroom for building the Next.js image on small machines.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
fi

if ! command -v docker >/dev/null; then
  apt-get update -y
  apt-get install -y ca-certificates curl git jq
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
command -v jq >/dev/null || apt-get install -y jq
command -v git >/dev/null || apt-get install -y git

if [ ! -d "$APP_DIR/.git" ]; then
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

bash "$APP_DIR/deploy/gcp/redeploy.sh"
