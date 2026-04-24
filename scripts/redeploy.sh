#!/usr/bin/env bash
# WebJuggler redeploy — run on the server where the service lives.
#
# Pipeline:
#   1. git pull (skippable)
#   2. Build frontend (Vite) -> frontend/dist
#   3. Copy dist into backend/src/main/resources/static
#   4. Build backend fat JAR (./gradlew bootJar)
#   5. Stop running instance, swap in new JAR, start it again
#
# Auto-detects systemd. If a unit named $SERVICE exists, it uses systemctl.
# Otherwise it manages the process directly via pid file + nohup.
#
# Env overrides:
#   DEPLOY_DIR   (default: /opt/webjuggler)   where the live JAR lives
#   SERVICE      (default: webjuggler)        systemd unit name (no .service)
#   SKIP_PULL    (default: 0)                 set to 1 to skip `git pull`
#   WJ_ARGS      (optional)                   runtime args passed to `java -jar`
#                                             (else reads $DEPLOY_DIR/webjuggler.args)
#
# Runtime args file ($DEPLOY_DIR/webjuggler.args) — one arg per line, # comments OK:
#   --webjuggler.mode=nas
#   --webjuggler.nextcloud.url=https://your-nextcloud
#   --webjuggler.nas.path=/mnt/nas_storage/Share/flight_logs
#   --webjuggler.jwt.secret=change-me
#
# Usage:
#   bash scripts/redeploy.sh
#   SKIP_PULL=1 bash scripts/redeploy.sh

set -euo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
REPO="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/webjuggler}"
SERVICE="${SERVICE:-webjuggler}"
SKIP_PULL="${SKIP_PULL:-0}"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

SUDO=""
if [[ $EUID -ne 0 ]]; then SUDO="sudo"; fi

cd "$REPO"

# ---- 1. git pull (and re-exec if this script itself was updated) ------------
if [[ "$SKIP_PULL" != "1" ]]; then
  step "git pull"
  before="$(sha1sum "$SCRIPT_PATH" | awk '{print $1}')"
  git pull --ff-only
  after="$(sha1sum "$SCRIPT_PATH" | awk '{print $1}')"
  if [[ "$before" != "$after" ]]; then
    echo "redeploy.sh changed after pull — re-executing self"
    export SKIP_PULL=1
    exec bash "$SCRIPT_PATH" "$@"
  fi
fi

# ---- 2. frontend build ------------------------------------------------------
step "Building frontend"
pushd frontend >/dev/null
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build
popd >/dev/null

# ---- 3. copy dist into backend static ---------------------------------------
step "Copying frontend dist -> backend static"
STATIC="backend/src/main/resources/static"
mkdir -p "$STATIC"
rm -rf "${STATIC:?}"/*
cp -r frontend/dist/. "$STATIC"/

# ---- 4. backend fat JAR -----------------------------------------------------
step "Building backend fat JAR"
pushd backend >/dev/null
./gradlew bootJar
popd >/dev/null

JAR_SRC="$(ls -t backend/build/libs/webjuggler-*.jar 2>/dev/null | grep -v plain | head -n1 || true)"
if [[ -z "$JAR_SRC" ]]; then
  echo "ERROR: no JAR produced under backend/build/libs/" >&2
  exit 1
fi
echo "  built: $JAR_SRC"

# ---- 5. prepare deploy dir (ask for sudo here if needed) --------------------
JAR_DEST="$DEPLOY_DIR/webjuggler.jar"

if [[ ! -d "$DEPLOY_DIR" ]]; then
  step "Creating $DEPLOY_DIR (may prompt for sudo)"
  $SUDO mkdir -p "$DEPLOY_DIR"
fi
if [[ ! -w "$DEPLOY_DIR" ]]; then
  step "Granting ownership of $DEPLOY_DIR to $USER (may prompt for sudo)"
  $SUDO chown "$USER":"$USER" "$DEPLOY_DIR"
fi

# ---- 6. stop + start --------------------------------------------------------
use_systemd=0
if command -v systemctl >/dev/null 2>&1 \
   && systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE}\.service"; then
  use_systemd=1
fi

if (( use_systemd )); then
  step "Stopping $SERVICE"
  $SUDO systemctl stop "$SERVICE" || true

  step "Installing JAR at $JAR_DEST"
  install -m 0644 "$JAR_SRC" "$JAR_DEST"

  step "Starting $SERVICE"
  $SUDO systemctl start "$SERVICE"
  $SUDO systemctl --no-pager status "$SERVICE" | head -n 15 || true
else
  PID_FILE="$DEPLOY_DIR/webjuggler.pid"
  LOG_FILE="$DEPLOY_DIR/webjuggler.log"
  ARGS_FILE="$DEPLOY_DIR/webjuggler.args"

  # --- stop old instance ---
  stopped=0
  if [[ -f "$PID_FILE" ]]; then
    OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
      step "Stopping existing pid $OLD_PID"
      kill "$OLD_PID" || true
      for _ in $(seq 1 15); do kill -0 "$OLD_PID" 2>/dev/null || { stopped=1; break; }; sleep 1; done
      (( stopped )) || kill -9 "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  # Belt-and-braces: reap any orphan that wasn't tracked by pid file
  pkill -f "java .*webjuggler.*\.jar" 2>/dev/null || true
  sleep 1

  # --- copy jar ---
  step "Installing JAR at $JAR_DEST"
  install -m 0644 "$JAR_SRC" "$JAR_DEST"

  # --- collect runtime args ---
  WJ_ARGS_DEFAULT=""
  if [[ -f "$ARGS_FILE" ]]; then
    WJ_ARGS_DEFAULT="$(grep -vE '^\s*(#|$)' "$ARGS_FILE" | tr '\n' ' ')"
  fi
  WJ_ARGS="${WJ_ARGS:-$WJ_ARGS_DEFAULT}"

  # --- start ---
  step "Starting JAR (nohup)"
  cd "$DEPLOY_DIR"
  # shellcheck disable=SC2086
  nohup java -jar "$JAR_DEST" $WJ_ARGS > "$LOG_FILE" 2>&1 &
  NEW_PID=$!
  echo $NEW_PID > "$PID_FILE"
  cd "$REPO"
  echo "  pid:  $NEW_PID  (saved to $PID_FILE)"
  echo "  log:  $LOG_FILE"
  echo "  args: ${WJ_ARGS:-<none — SOLO mode; configure $ARGS_FILE>}"

  # --- readiness check ---
  step "Waiting for :8080"
  ready=0
  for _ in $(seq 1 30); do
    if ! kill -0 "$NEW_PID" 2>/dev/null; then
      echo "  process died — last 30 log lines:" >&2
      tail -n 30 "$LOG_FILE" >&2 || true
      exit 1
    fi
    if ss -lnt 2>/dev/null | grep -q ":8080 "; then ready=1; break; fi
    sleep 1
  done
  if (( ready )); then
    echo "  status: listening on :8080"
  else
    echo "  status: not yet listening after 30s — tail -f $LOG_FILE"
  fi
fi

step "Done."
