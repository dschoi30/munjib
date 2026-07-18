#!/usr/bin/env bash

set -euo pipefail

VAULT_LAB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VAULT_LAB_COMPOSE="$VAULT_LAB_ROOT/deploy/vault-lab/compose.yml"
export VAULT_ADDR="http://127.0.0.1:18200"
export COMPOSE_PROJECT_NAME="munjib-vault-lab"

vault_lab_die() {
  printf '%s\n' "Vault lab command failed" >&2
  exit 1
}

vault_lab_require_image() {
  if [[ ! "${VAULT_LAB_IMAGE:-}" =~ ^[^[:space:]@]+:[^[:space:]@]+@sha256:[a-f0-9]{64}$ ]]; then
    printf '%s\n' "VAULT_LAB_IMAGE must be repository:version@sha256:digest" >&2
    exit 64
  fi
  export VAULT_LAB_IMAGE
}

vault_lab_private_dir() {
  local directory
  directory="$(mktemp -d "${TMPDIR:-/tmp}/munjib-vault-lab.XXXXXX")" || vault_lab_die
  chmod 0700 "$directory" || vault_lab_die
  printf '%s\n' "$directory"
}

vault_lab_token() {
  od -An -N24 -tx1 /dev/urandom | tr -d ' \n'
}

vault_lab_write_override() {
  local output=$1
  umask 077
  printf '%s\n' \
    'services:' \
    '  vault:' \
    '    environment:' \
    "      VAULT_DEV_ROOT_TOKEN_ID: \"${VAULT_TOKEN}\"" >"$output" || vault_lab_die
  chmod 0600 "$output" || vault_lab_die
}

vault_lab_compose() {
  local override=${VAULT_LAB_OVERRIDE:-}
  if [[ -n "$override" ]]; then
    docker compose -f "$VAULT_LAB_COMPOSE" -f "$override" "$@" >/dev/null 2>&1 || vault_lab_die
  else
    docker compose -f "$VAULT_LAB_COMPOSE" "$@" >/dev/null 2>&1 || vault_lab_die
  fi
}

vault_lab_cleanup() {
  if [[ -n "${VAULT_LAB_OVERRIDE:-}" && -f "$VAULT_LAB_OVERRIDE" ]]; then
    docker compose -f "$VAULT_LAB_COMPOSE" -f "$VAULT_LAB_OVERRIDE" down --volumes --remove-orphans >/dev/null 2>&1 || true
  else
    docker compose -f "$VAULT_LAB_COMPOSE" down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  if [[ -n "${VAULT_LAB_PRIVATE_DIR:-}" && -d "$VAULT_LAB_PRIVATE_DIR" ]]; then
    rm -rf -- "$VAULT_LAB_PRIVATE_DIR"
  fi
}
