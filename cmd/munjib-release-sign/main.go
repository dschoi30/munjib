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
	"path/filepath"
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

type publicKeyTempFile interface {
	io.Writer
	Name() string
	Chmod(os.FileMode) error
	Sync() error
	Close() error
}

type publicKeyPublishOps struct {
	createTemp func(string, string) (publicKeyTempFile, error)
	openDir    func(string) (publicKeyDirectory, error)
	link       func(string, string) error
	unlink     func(string) error
	remove     func(string) error
}

type publicKeyDirectory interface {
	Sync() error
	Close() error
}

var osPublicKeyPublishOps = publicKeyPublishOps{
	createTemp: func(dir, pattern string) (publicKeyTempFile, error) { return os.CreateTemp(dir, pattern) },
	openDir:    func(path string) (publicKeyDirectory, error) { return os.Open(path) },
	link:       os.Link,
	unlink:     os.Remove,
	remove:     os.Remove,
}

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
	if err := publishPublicKeyAtomically(*out, publicKey, osPublicKeyPublishOps); err != nil {
		fmt.Fprintln(stderr, "failed to publish public key output")
		return exitOutput
	}
	return 0
}

func publishPublicKeyAtomically(output string, publicKey []byte, ops publicKeyPublishOps) error {
	directory, base := filepath.Dir(output), filepath.Base(output)
	file, err := ops.createTemp(directory, "."+base+".*")
	if err != nil {
		return err
	}
	temporary := file.Name()
	defer func() { _ = ops.remove(temporary) }()
	closeWithError := func(cause error) error {
		_ = file.Close()
		return cause
	}
	if err := file.Chmod(0400); err != nil {
		return closeWithError(err)
	}
	written, err := file.Write(publicKey)
	if err != nil {
		return closeWithError(err)
	}
	if written != len(publicKey) {
		return closeWithError(io.ErrShortWrite)
	}
	if err := file.Sync(); err != nil {
		return closeWithError(err)
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := ops.link(temporary, output); err != nil {
		return err
	}
	directoryFile, err := ops.openDir(directory)
	if err != nil {
		_ = ops.unlink(output)
		return err
	}
	if err := directoryFile.Sync(); err != nil {
		_ = directoryFile.Close()
		_ = ops.unlink(output)
		if cleanupDirectory, openErr := ops.openDir(directory); openErr == nil {
			_ = cleanupDirectory.Sync()
			_ = cleanupDirectory.Close()
		}
		return err
	}
	if err := directoryFile.Close(); err != nil {
		_ = ops.unlink(output)
		return err
	}
	return nil
}

func usageError(stderr io.Writer) int {
	fmt.Fprintln(stderr, "usage: munjib-release-sign sign --payload FILE --key-name NAME --key-version UINT --key-id ID --generation UINT --ttl DURATION")
	fmt.Fprintln(stderr, "   or: munjib-release-sign public-key --key-name NAME --version UINT --out FILE")
	return exitUsage
}
