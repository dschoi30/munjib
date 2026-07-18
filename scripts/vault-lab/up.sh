#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"
vault_lab_require_image

VAULT_LAB_PRIVATE_DIR="$(vault_lab_private_dir)"
export VAULT_LAB_PRIVATE_DIR
unset VAULT_TOKEN
VAULT_TOKEN="$(vault_lab_token)"
VAULT_LAB_OVERRIDE="$VAULT_LAB_PRIVATE_DIR/compose.override.yml"
export VAULT_LAB_OVERRIDE
vault_lab_write_override "$VAULT_LAB_OVERRIDE"
trap vault_lab_cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

vault_lab_compose up -d --wait
VAULT_TOKEN="$VAULT_TOKEN" bash "$VAULT_LAB_ROOT/scripts/vault-lab/bootstrap.sh"

if (( $# > 0 )); then
  "$@"
else
  while :; do sleep 60; done
fi
