#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf '%s\n' "SECURITY_RUNTIME_SMOKE_USAGE" >&2
  exit 2
fi

SECURITY_RUNTIME_SMOKE_BASE_URL="$1" pnpm exec playwright test tests/e2e/security-runtime.spec.ts
