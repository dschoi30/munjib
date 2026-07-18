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
log="$VAULT_LAB_PRIVATE_DIR/integration.log"

finish() {
  local status=${1:-$?}
  trap - EXIT INT TERM
  if [[ -n "${work:-}" && -d "$work" ]]; then
    rm -rf -- "$work"
  fi
  vault_lab_cleanup
  if (( status != 0 )); then
    printf '%s\n' "Vault lab integration failed" >&2
  fi
  exit "$status"
}
trap 'finish $?' EXIT
trap 'finish 130' INT
trap 'finish 143' TERM

vault_lab_compose up -d --wait
VAULT_TOKEN="$VAULT_TOKEN" bash "$VAULT_LAB_ROOT/scripts/vault-lab/bootstrap.sh" >"$log" 2>&1

work="$VAULT_LAB_PRIVATE_DIR/artifacts"
mkdir -m 0700 "$work"
trap 'finish $?' EXIT
trap 'finish 130' INT
trap 'finish 143' TERM

printf '%s' '{"artifact":"munjib-release-lab","digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' >"$work/payload.json"
if [[ "$(uname -s)" == Darwin ]]; then
  CGO_ENABLED=1 go build -ldflags=-linkmode=external -o "$work/signer" ./cmd/munjib-release-sign >>"$log" 2>&1
  CGO_ENABLED=1 go build -ldflags=-linkmode=external -o "$work/verifier" ./cmd/munjib-vault-lab-verify >>"$log" 2>&1
else
  CGO_ENABLED=0 go build -o "$work/signer" ./cmd/munjib-release-sign >>"$log" 2>&1
  CGO_ENABLED=0 go build -o "$work/verifier" ./cmd/munjib-vault-lab-verify >>"$log" 2>&1
fi

VAULT_TOKEN="$VAULT_TOKEN" "$work/signer" public-key --key-name munjib-release-lab-v1 --version 1 --out "$work/public.key" >>"$log" 2>&1
VAULT_TOKEN="$VAULT_TOKEN" "$work/signer" sign --payload "$work/payload.json" --key-name munjib-release-lab-v1 \
  --key-version 1 --key-id munjib-release-lab-v1 --generation 1 --ttl 2m >"$work/envelope.json" 2>>"$log"
"$work/verifier" --key "$work/public.key" --envelope "$work/envelope.json" >>"$log" 2>&1
printf '%s\n' VAULT_LAB_VERIFY_OK

node -e 'if(process.env.VAULT_TOKEN)process.exit(2);const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));x.payload={artifact:"tampered"};fs.writeFileSync(process.argv[2],JSON.stringify(x));' \
  "$work/envelope.json" "$work/tampered.json" >>"$log" 2>&1
"$work/verifier" --key "$work/public.key" --envelope "$work/tampered.json" \
  --want-error ENVELOPE_PAYLOAD_HASH >>"$log" 2>&1
printf '%s\n' VAULT_LAB_TAMPER_REJECT_OK

VAULT_TOKEN="$VAULT_TOKEN" "$work/signer" sign --payload "$work/payload.json" --key-name munjib-release-lab-v1 \
  --key-version 1 --key-id munjib-release-lab-v1 --generation 1 --ttl 1s >"$work/expired.json" 2>>"$log"
sleep 2
"$work/verifier" --key "$work/public.key" --envelope "$work/expired.json" \
  --want-error ENVELOPE_EXPIRY >>"$log" 2>&1
printf '%s\n' VAULT_LAB_EXPIRY_REJECT_OK

"$work/verifier" --key "$work/public.key" --envelope "$work/envelope.json" --generation 2 \
  --want-error ENVELOPE_GENERATION >>"$log" 2>&1
printf '%s\n' VAULT_LAB_GENERATION_REJECT_OK

VAULT_TOKEN="$VAULT_TOKEN" "$work/signer" public-key --key-name munjib-release-lab-wrong-v1 --version 1 --out "$work/wrong.key" >>"$log" 2>&1
"$work/verifier" --key "$work/wrong.key" --envelope "$work/envelope.json" \
  --want-error ENVELOPE_SIGNATURE_INVALID >>"$log" 2>&1
printf '%s\n' VAULT_LAB_WRONG_KEY_REJECT_OK
