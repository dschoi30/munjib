package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strconv"
	"time"

	"github.com/dschoi30/munjib/internal/delivery"
	"github.com/dschoi30/munjib/internal/releasesigner"
)

const (
	exitUsage       = 64
	exitInput       = 65
	exitUnavailable = 69
	exitOutput      = 74
)

func main() {
	os.Exit(run(context.Background(), os.Args[1:], os.Getenv, os.Stdin, os.Stdout, os.Stderr, func() time.Time { return time.Now().UTC() }, rand.Reader))
}

func run(ctx context.Context, args []string, getenv func(string) string, stdin io.Reader, stdout, stderr io.Writer, now func() time.Time, random io.Reader) int {
	_ = stdin
	if len(args) == 0 {
		return usageError(stderr)
	}
	address, token := getenv("VAULT_ADDR"), getenv("VAULT_TOKEN")
	if address == "" {
		fmt.Fprintln(stderr, "VAULT_ADDR is required")
		return exitUsage
	}
	if token == "" {
		fmt.Fprintln(stderr, "VAULT_TOKEN is required")
		return exitUsage
	}
	client, err := releasesigner.NewTransitClient(address, token)
	if err != nil {
		fmt.Fprintln(stderr, "invalid Vault configuration")
		return exitUnavailable
	}
	switch args[0] {
	case "sign":
		return runSign(ctx, client, args[1:], stdout, stderr, now, random)
	case "public-key":
		return runPublicKey(ctx, client, args[1:], stdout, stderr)
	default:
		return usageError(stderr)
	}
}

func runSign(ctx context.Context, client releasesigner.TransitClient, args []string, stdout, stderr io.Writer, now func() time.Time, random io.Reader) int {
	flags := flag.NewFlagSet("sign", flag.ContinueOnError)
	flags.SetOutput(stderr)
	payloadPath := flags.String("payload", "", "payload JSON file")
	keyName := flags.String("key-name", "", "Vault Transit key name")
	keyVersion := flags.Uint64("key-version", 0, "pinned Vault key version")
	keyID := flags.String("key-id", "", "envelope key ID")
	generation := flags.Uint64("generation", 0, "expected generation")
	ttl := flags.Duration("ttl", 0, "envelope lifetime")
	if err := flags.Parse(args); err != nil || flags.NArg() != 0 || *payloadPath == "" || *keyName == "" || *keyVersion == 0 || *keyID == "" || *generation == 0 || *ttl <= 0 || *ttl > 5*time.Minute {
		return usageError(stderr)
	}
	payload, err := readPayload(*payloadPath)
	if err != nil {
		fmt.Fprintln(stderr, "invalid payload")
		return exitInput
	}
	var nonce [32]byte
	if _, err := io.ReadFull(random, nonce[:]); err != nil {
		fmt.Fprintln(stderr, "failed to generate nonce")
		return exitInput
	}
	issuedAt := now().UTC()
	envelope, err := delivery.NewUnsignedEnvelope(delivery.UnsignedEnvelopeInput{
		Operation: "VERIFY_ONLY", Payload: payload, KeyID: *keyID, ExpectedGeneration: *generation,
		Nonce: nonce, ExpiresAt: issuedAt.Add(*ttl),
	}, issuedAt)
	if err != nil {
		fmt.Fprintln(stderr, "invalid envelope input")
		return exitInput
	}
	message, err := delivery.SignedMessage(envelope)
	if err != nil {
		fmt.Fprintln(stderr, "invalid signing input")
		return exitInput
	}
	signature, _, err := client.Sign(ctx, *keyName, *keyVersion, message)
	if err != nil {
		fmt.Fprintln(stderr, "Vault signing unavailable")
		return exitUnavailable
	}
	envelope.Signature = base64.RawURLEncoding.EncodeToString(signature)
	if err := json.NewEncoder(stdout).Encode(envelope); err != nil {
		fmt.Fprintln(stderr, "failed to write signed envelope")
		return exitOutput
	}
	return 0
}

func readPayload(path string) (json.RawMessage, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, delivery.MaxPayloadBytes+1))
	if err != nil || len(raw) == 0 || len(raw) > delivery.MaxPayloadBytes || !json.Valid(raw) {
		return nil, errors.New("invalid payload")
	}
	return json.RawMessage(raw), nil
}

func runPublicKey(ctx context.Context, client releasesigner.TransitClient, args []string, stdout, stderr io.Writer) int {
	_ = stdout
	flags := flag.NewFlagSet("public-key", flag.ContinueOnError)
	flags.SetOutput(stderr)
	keyName := flags.String("key-name", "", "Vault Transit key name")
	versionText := flags.String("version", "", "Vault key version")
	out := flags.String("out", "", "raw public key output file")
	if err := flags.Parse(args); err != nil || flags.NArg() != 0 || *keyName == "" || *versionText == "" || *out == "" {
		return usageError(stderr)
	}
	version, err := strconv.ParseUint(*versionText, 10, 64)
	if err != nil || version == 0 {
		return usageError(stderr)
	}
	publicKey, err := client.PublicKey(ctx, *keyName, version)
	if err != nil {
		fmt.Fprintln(stderr, "Vault public key unavailable")
		return exitUnavailable
	}
	file, err := os.OpenFile(*out, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0400)
	if err != nil {
		fmt.Fprintln(stderr, "failed to create public key output")
		return exitOutput
	}
	keep := false
	defer func() {
		_ = file.Close()
		if !keep {
			_ = os.Remove(*out)
		}
	}()
	if err := file.Chmod(0400); err != nil {
		fmt.Fprintln(stderr, "failed to set public key output mode")
		return exitOutput
	}
	if _, err := file.Write(publicKey); err != nil {
		fmt.Fprintln(stderr, "failed to write public key output")
		return exitOutput
	}
	if err := file.Sync(); err != nil {
		fmt.Fprintln(stderr, "failed to sync public key output")
		return exitOutput
	}
	if err := file.Close(); err != nil {
		fmt.Fprintln(stderr, "failed to close public key output")
		return exitOutput
	}
	keep = true
	return 0
}

func usageError(stderr io.Writer) int {
	fmt.Fprintln(stderr, "usage: munjib-release-sign sign --payload FILE --key-name NAME --key-version UINT --key-id ID --generation UINT --ttl DURATION")
	fmt.Fprintln(stderr, "   or: munjib-release-sign public-key --key-name NAME --version UINT --out FILE")
	return exitUsage
}
