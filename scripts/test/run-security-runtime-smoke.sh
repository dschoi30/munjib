#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${DATABASE_URL:?synthetic test database required}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER_PID=""
FIXTURE_CREATED=false
WORK=""

cleanup() {
  status=$?
  trap - EXIT INT TERM
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || status=1
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [ "${FIXTURE_CREATED:-false}" = true ]; then
    if ! pnpm exec tsx scripts/test/security-runtime-fixture.ts delete >/dev/null; then
      status=1
    fi
  fi
  if [ -n "${WORK:-}" ] && [ -d "$WORK" ]; then
    rm -rf "$WORK"
  fi
  exit "$status"
}

WORK="$(mktemp -d "${TMPDIR:-/tmp}/munjib-runtime-smoke.XXXXXX")"
trap cleanup EXIT INT TERM
PORT="${SECURITY_RUNTIME_PORT:-3103}"
SUFFIX="$(openssl rand -hex 8)"
export SECURITY_RUNTIME_FIXTURE_EMAIL="runtime-${SUFFIX}@invalid.example"
export SECURITY_RUNTIME_FIXTURE_SLUG="security-runtime-${SUFFIX}"
export SECURITY_RUNTIME_FIXTURE_PASSWORD_FILE="$WORK/password"
openssl rand -base64 48 > "$SECURITY_RUNTIME_FIXTURE_PASSWORD_FILE"
chmod 0600 "$SECURITY_RUNTIME_FIXTURE_PASSWORD_FILE"

cd "$ROOT"
pnpm exec tsx scripts/test/security-runtime-fixture.ts create
FIXTURE_CREATED=true
pnpm run build
export NEXTAUTH_SECRET="$(openssl rand -base64 48)"
env \
  NODE_ENV=production \
  MUNJIB_DEPLOYMENT_ENV=development \
  NEXTAUTH_URL="http://127.0.0.1:$PORT" \
  NEXTAUTH_COOKIE_SECURE=false \
  MUNJIB_ENABLE_DEV_LOGIN=false \
  MUNJIB_SIGNUP_MODE=closed \
  SENTRY_DSN= \
  LANGFUSE_PUBLIC_KEY= \
  LANGFUSE_SECRET_KEY= \
  PORT="$PORT" \
  pnpm start > "$WORK/server.log" 2>&1 &
SERVER_PID=$!
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:$PORT/api/auth/providers" >/dev/null; then
    break
  fi
  if [ "$attempt" = 30 ]; then
    printf '%s\n' "security runtime server health timeout" >&2
    exit 1
  fi
  sleep 2
done
PLAYWRIGHT_TEST_BASE_URL="http://127.0.0.1:$PORT" \
  pnpm exec playwright test tests/e2e/security-runtime.spec.ts --reporter=line
printf 'security runtime production smoke OK\n'
