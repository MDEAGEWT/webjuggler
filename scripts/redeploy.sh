#!/usr/bin/env bash
# WebJuggler redeploy — run on the server where the service lives.
#
# Pipeline:
#   1. Build frontend (Vite) -> frontend/dist
#   2. Copy dist into backend/src/main/resources/static (so the JAR serves the UI)
#   3. Build the backend fat JAR (./gradlew bootJar)
#   4. Stop the running service, swap in the new JAR, start it again
#
# The script auto-detects systemd. If a systemd unit named $SERVICE exists it
# uses `systemctl stop/start`; otherwise it falls back to pkill + reports the
# manual start command.
#
# Env overrides:
#   DEPLOY_DIR   (default: /opt/webjuggler)   directory the live JAR lives in
#   SERVICE      (default: webjuggler)        systemd unit name (no .service)
#   JAVA_HOME    (optional)                   JDK 21 path if system Java != 21
#   SKIP_PULL    (default: 0)                 set to 1 to skip `git pull`
#
# Usage:
#   bash scripts/redeploy.sh
#   SERVICE=webjuggler-nas DEPLOY_DIR=/srv/wj bash scripts/redeploy.sh

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/webjuggler}"
SERVICE="${SERVICE:-webjuggler}"
SKIP_PULL="${SKIP_PULL:-0}"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

cd "$REPO"

if [[ "$SKIP_PULL" != "1" ]]; then
  step "git pull"
  git pull --ff-only
fi

step "Building frontend"
pushd frontend >/dev/null
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build
popd >/dev/null

step "Copying frontend dist -> backend static"
STATIC="backend/src/main/resources/static"
mkdir -p "$STATIC"
rm -rf "${STATIC:?}"/*
cp -r frontend/dist/. "$STATIC"/

step "Building backend fat JAR"
pushd backend >/dev/null
./gradlew bootJar
popd >/dev/null

JAR_SRC="$(ls -t backend/build/libs/webjuggler-*.jar 2>/dev/null | head -n1 || true)"
if [[ -z "$JAR_SRC" ]]; then
  echo "ERROR: no JAR produced under backend/build/libs/" >&2
  exit 1
fi
echo "  built: $JAR_SRC"

JAR_DEST="$DEPLOY_DIR/webjuggler.jar"

use_systemd=0
if command -v systemctl >/dev/null 2>&1 \
   && systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE}\.service"; then
  use_systemd=1
fi

SUDO=""
if [[ $EUID -ne 0 ]]; then SUDO="sudo"; fi

if (( use_systemd )); then
  step "Stopping $SERVICE"
  $SUDO systemctl stop "$SERVICE" || true

  step "Swapping in new JAR at $JAR_DEST"
  $SUDO mkdir -p "$DEPLOY_DIR"
  $SUDO install -m 0644 "$JAR_SRC" "$JAR_DEST"

  step "Starting $SERVICE"
  $SUDO systemctl start "$SERVICE"
  $SUDO systemctl --no-pager status "$SERVICE" | head -n 15 || true
else
  step "No systemd unit '$SERVICE' — stopping any running WebJuggler JAR"
  pkill -f "java .*webjuggler.*\.jar" 2>/dev/null || true
  sleep 2

  step "Swapping in new JAR at $JAR_DEST"
  mkdir -p "$DEPLOY_DIR"
  cp "$JAR_SRC" "$JAR_DEST"

  cat <<EOF

Start it manually, e.g.:
  nohup java -jar $JAR_DEST \\
    --webjuggler.mode=nas \\
    --webjuggler.nextcloud.url=https://your-nextcloud \\
    --webjuggler.nas.path=/mnt/nas_storage/Share/flight_logs \\
    --webjuggler.jwt.secret=<secret> \\
    > $DEPLOY_DIR/webjuggler.log 2>&1 &

EOF
fi

step "Done."
