//go:build linux

package main

import (
	"crypto/ed25519"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/dschoi30/munjib/internal/delivery"
)

const publicKeyPath = "/var/lib/munjib/security/bootstrap/release-verify.pub"

func main() {
	if len(os.Args) != 1 {
		os.Exit(64)
	}
	keyBytes, err := os.ReadFile(publicKeyPath)
	if err != nil || len(keyBytes) != ed25519.PublicKeySize {
		os.Exit(70)
	}
	raw, err := io.ReadAll(io.LimitReader(os.Stdin, delivery.MaxEnvelopeBytes+1))
	if err != nil || len(raw) > delivery.MaxEnvelopeBytes {
		os.Exit(65)
	}
	verified, err := delivery.VerifyEnvelope(raw, ed25519.PublicKey(keyBytes), time.Now().UTC())
	if err != nil || verified.Envelope.Operation != "VERIFY_ONLY" {
		os.Exit(78)
	}
	fmt.Fprintln(os.Stdout, "VERIFY_ONLY_OK")
}
