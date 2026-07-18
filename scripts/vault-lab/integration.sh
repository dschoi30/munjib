#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"
vault_lab_require_image

VAULT_LAB_PRIVATE_DIR="$(vault_lab_private_dir)"
export VAULT_LAB_PRIVATE_DIR
VAULT_TOKEN="$(vault_lab_token)"
export VAULT_TOKEN
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
trap finish EXIT INT TERM

vault_lab_compose up -d --wait
bash "$VAULT_LAB_ROOT/scripts/vault-lab/bootstrap.sh" >"$log" 2>&1

work="$VAULT_LAB_ROOT/.vault-lab.$RANDOM.$RANDOM"
mkdir -m 0700 "$work"
trap 'finish $?' EXIT INT TERM

cat >"$work/verify.go" <<'GO'
package main

import (
	"crypto/ed25519"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/dschoi30/munjib/internal/delivery"
)

func main() {
	keyPath := flag.String("key", "", "raw Ed25519 public key")
	envelopePath := flag.String("envelope", "", "signed envelope")
	generation := flag.Uint64("generation", 1, "configured generation")
	wantError := flag.String("want-error", "", "expected stable error")
	flag.Parse()
	key, keyErr := os.ReadFile(*keyPath)
	raw, rawErr := os.ReadFile(*envelopePath)
	if keyErr != nil || rawErr != nil || len(key) != ed25519.PublicKeySize {
		os.Exit(2)
	}
	verified, err := delivery.VerifyEnvelope(raw, ed25519.PublicKey(key), time.Now().UTC())
	if err == nil {
		err = delivery.ValidateExpectedGeneration(verified.Envelope, *generation)
	}
	if *wantError == "" && err == nil {
		return
	}
	if *wantError != "" && err != nil && strings.Contains(err.Error(), *wantError) {
		return
	}
	if err != nil {
		fmt.Fprint(os.Stderr, "verification rejected")
	}
	os.Exit(1)
}
GO

printf '%s' '{"artifact":"munjib-release-lab","digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' >"$work/payload.json"
CGO_ENABLED=1 go build -ldflags=-linkmode=external -o "$work/signer" ./cmd/munjib-release-sign >>"$log" 2>&1
CGO_ENABLED=1 go build -ldflags=-linkmode=external -o "$work/verifier" "$work/verify.go" >>"$log" 2>&1

"$work/signer" public-key --key-name munjib-release-lab-v1 --version 1 --out "$work/public.key" >>"$log" 2>&1
"$work/signer" sign --payload "$work/payload.json" --key-name munjib-release-lab-v1 \
  --key-version 1 --key-id munjib-release-lab-v1 --generation 1 --ttl 2m >"$work/envelope.json" 2>>"$log"
"$work/verifier" --key "$work/public.key" --envelope "$work/envelope.json" >>"$log" 2>&1
printf '%s\n' VAULT_LAB_VERIFY_OK

node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));x.payload={artifact:"tampered"};fs.writeFileSync(process.argv[2],JSON.stringify(x));' \
  "$work/envelope.json" "$work/tampered.json" >>"$log" 2>&1
"$work/verifier" --key "$work/public.key" --envelope "$work/tampered.json" \
  --want-error ENVELOPE_PAYLOAD_HASH >>"$log" 2>&1
printf '%s\n' VAULT_LAB_TAMPER_REJECT_OK

"$work/signer" sign --payload "$work/payload.json" --key-name munjib-release-lab-v1 \
  --key-version 1 --key-id munjib-release-lab-v1 --generation 1 --ttl 1s >"$work/expired.json" 2>>"$log"
sleep 2
"$work/verifier" --key "$work/public.key" --envelope "$work/expired.json" \
  --want-error ENVELOPE_EXPIRY >>"$log" 2>&1
printf '%s\n' VAULT_LAB_EXPIRY_REJECT_OK

"$work/verifier" --key "$work/public.key" --envelope "$work/envelope.json" --generation 2 \
  --want-error ENVELOPE_GENERATION >>"$log" 2>&1
printf '%s\n' VAULT_LAB_GENERATION_REJECT_OK

"$work/signer" public-key --key-name munjib-release-lab-wrong-v1 --version 1 --out "$work/wrong.key" >>"$log" 2>&1
"$work/verifier" --key "$work/wrong.key" --envelope "$work/envelope.json" \
  --want-error ENVELOPE_SIGNATURE_INVALID >>"$log" 2>&1
printf '%s\n' VAULT_LAB_WRONG_KEY_REJECT_OK
