package main

import (
	"crypto/ed25519"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/dschoi30/munjib/internal/delivery"
)

func main() {
	keyPath := flag.String("key", "", "raw Ed25519 public key")
	envelopePath := flag.String("envelope", "", "signed envelope")
	generation := flag.Uint64("generation", 1, "configured generation")
	wantError := flag.String("want-error", "", "expected stable error")
	flag.Parse()
	if _, present := os.LookupEnv("VAULT_TOKEN"); present {
		os.Exit(2)
	}
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
	if *wantError != "" && err != nil && err.Error() == *wantError {
		return
	}
	if err != nil {
		fmt.Fprint(os.Stderr, "verification rejected")
	}
	os.Exit(1)
}
