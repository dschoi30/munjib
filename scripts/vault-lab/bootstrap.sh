#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"
vault_lab_require_image
: "${VAULT_TOKEN:?Vault lab token is required}"

vault_lab_request() {
  local method=$1 path=$2 body=${3:-} response status
  response="$(mktemp "${TMPDIR:-/tmp}/munjib-vault-response.XXXXXX")" || vault_lab_die
  chmod 0600 "$response"
  if [[ -n "$body" ]]; then
    status="$(curl --silent --show-error --output "$response" --write-out '%{http_code}' \
      --request "$method" --header "X-Vault-Token: $VAULT_TOKEN" --header 'Content-Type: application/json' \
      --data-binary "$body" "$VAULT_ADDR/v1/$path" 2>/dev/null)" || { rm -f "$response"; vault_lab_die; }
  else
    status="$(curl --silent --show-error --output "$response" --write-out '%{http_code}' \
      --request "$method" --header "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/$path" 2>/dev/null)" || { rm -f "$response"; vault_lab_die; }
  fi
  rm -f "$response"
  [[ "$status" == 200 || "$status" == 204 ]] || vault_lab_die
}

mount_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/transit/keys/munjib-release-lab-v1" 2>/dev/null)" || vault_lab_die
if [[ "$mount_status" == 404 ]]; then
  enable_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --request POST \
    --header "X-Vault-Token: $VAULT_TOKEN" --header 'Content-Type: application/json' \
    --data-binary '{"type":"transit"}' "$VAULT_ADDR/v1/sys/mounts/transit" 2>/dev/null)" || vault_lab_die
  [[ "$enable_status" == 200 || "$enable_status" == 204 || "$enable_status" == 400 ]] || vault_lab_die
fi

key_policy='{"type":"ed25519","derived":false,"exportable":false,"allow_plaintext_backup":false,"deletion_allowed":false}'
vault_lab_request POST transit/keys/munjib-release-lab-v1 "$key_policy"
vault_lab_request POST transit/keys/munjib-release-lab-wrong-v1 "$key_policy"
