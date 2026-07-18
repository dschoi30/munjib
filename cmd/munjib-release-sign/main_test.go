package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/dschoi30/munjib/internal/delivery"
)

var fixedNow = time.Date(2026, 7, 19, 1, 2, 3, 0, time.UTC)

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) { return 0, os.ErrClosed }

type fakePublicKeyFile struct {
	bytes.Buffer
	mode                                  os.FileMode
	writeErr, chmodErr, syncErr, closeErr error
}

func (f *fakePublicKeyFile) Name() string                 { return "/tmp/.release-verify.pub.test" }
func (f *fakePublicKeyFile) Chmod(mode os.FileMode) error { f.mode = mode; return f.chmodErr }
func (f *fakePublicKeyFile) Write(p []byte) (int, error) {
	if f.writeErr != nil {
		return 0, f.writeErr
	}
	return f.Buffer.Write(p)
}
func (f *fakePublicKeyFile) Sync() error  { return f.syncErr }
func (f *fakePublicKeyFile) Close() error { return f.closeErr }

type fakePublicKeyDirectory struct{ syncErr, closeErr error }

func (f *fakePublicKeyDirectory) Sync() error  { return f.syncErr }
func (f *fakePublicKeyDirectory) Close() error { return f.closeErr }

func TestPublishPublicKeyAtomicallyFailureCleanup(t *testing.T) {
	for _, stage := range []string{"create", "chmod", "write", "sync", "close", "publish", "dir-open", "dir-sync", "dir-close"} {
		t.Run(stage, func(t *testing.T) {
			file := &fakePublicKeyFile{}
			if stage == "chmod" {
				file.chmodErr = errors.New(stage)
			}
			if stage == "write" {
				file.writeErr = errors.New(stage)
			}
			if stage == "sync" {
				file.syncErr = errors.New(stage)
			}
			if stage == "close" {
				file.closeErr = errors.New(stage)
			}
			removed, published := false, false
			finalRemoved := false
			directory := &fakePublicKeyDirectory{}
			if stage == "dir-sync" {
				directory.syncErr = errors.New(stage)
			}
			if stage == "dir-close" {
				directory.closeErr = errors.New(stage)
			}
			ops := publicKeyPublishOps{
				createTemp: func(string, string) (publicKeyTempFile, error) {
					if stage == "create" {
						return nil, errors.New(stage)
					}
					return file, nil
				},
				link: func(string, string) error {
					if stage == "publish" {
						return errors.New(stage)
					}
					published = true
					return nil
				},
				openDir: func(string) (publicKeyDirectory, error) {
					if stage == "dir-open" {
						return nil, errors.New(stage)
					}
					return directory, nil
				},
				unlink: func(string) error { finalRemoved = true; return nil },
				remove: func(string) error { removed = true; return nil },
			}
			if publishPublicKeyAtomically("/tmp/release-verify.pub", []byte("key"), ops) == nil {
				t.Fatal("failure accepted")
			}
			if stage != "create" && !removed {
				t.Fatal("temporary file not cleaned")
			}
			if published && stage != "close" {
				if !finalRemoved {
					t.Fatal("published final not removed after durability failure")
				}
			}
		})
	}
}

func TestPublishPublicKeyAtomicallyNoReplaceConcurrent(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "release-verify.pub")
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, key := range [][]byte{bytes.Repeat([]byte{1}, 32), bytes.Repeat([]byte{2}, 32)} {
		wg.Add(1)
		go func(key []byte) {
			defer wg.Done()
			results <- publishPublicKeyAtomically(out, key, osPublicKeyPublishOps)
		}(key)
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("successes=%d", successes)
	}
	info, err := os.Stat(out)
	if err != nil || info.Mode().Perm() != 0400 || info.Size() != 32 {
		t.Fatalf("published=%v err=%v", info, err)
	}
	if matches, _ := filepath.Glob(filepath.Join(dir, ".release-verify.pub.*")); len(matches) != 0 {
		t.Fatalf("temp residue: %v", matches)
	}
}

func env(address string) func(string) string {
	return func(name string) string {
		switch name {
		case "VAULT_ADDR":
			return address
		case "VAULT_TOKEN":
			return "test-token-secret"
		default:
			return ""
		}
	}
}

func vaultServer(t *testing.T, publicKey ed25519.PublicKey, privateKey ed25519.PrivateKey) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Vault-Token") != "test-token-secret" {
			t.Fatal("Vault token missing")
		}
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/transit/sign/munjib-release-lab-v1":
			var request struct {
				Input string `json:"input"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Fatal(err)
			}
			message, err := base64.StdEncoding.DecodeString(request.Input)
			if err != nil {
				t.Fatal(err)
			}
			writeVaultJSON(t, w, map[string]any{"key_version": 1, "signature": "vault:v1:" + base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, message))})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/transit/keys/munjib-release-lab-v1":
			writeVaultJSON(t, w, map[string]any{
				"allow_plaintext_backup": false, "auto_rotate_period": 0, "deletion_allowed": false,
				"derived": false, "exportable": false, "imported_key": false,
				"keys":           map[string]any{"1": map[string]any{"creation_time": "2026-07-19T00:00:00Z", "name": "ed25519", "public_key": base64.StdEncoding.EncodeToString(publicKey)}},
				"latest_version": 1, "min_available_version": 0, "min_decryption_version": 1, "min_encryption_version": 0,
				"name": "munjib-release-lab-v1", "supports_decryption": false, "supports_derivation": true,
				"supports_encryption": false, "supports_signing": true, "type": "ed25519",
			})
		default:
			http.NotFound(w, r)
		}
	}))
}

func writeVaultJSON(t *testing.T, w http.ResponseWriter, data any) {
	t.Helper()
	err := json.NewEncoder(w).Encode(map[string]any{
		"request_id": "request-id", "lease_id": "", "renewable": false, "lease_duration": 0,
		"data": data, "wrap_info": nil, "warnings": nil, "auth": nil, "mount_type": "transit",
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestRunSignOutputsVerifierCompatibleEnvelope(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	server := vaultServer(t, publicKey, privateKey)
	defer server.Close()
	payloadPath := filepath.Join(t.TempDir(), "payload.json")
	if err := os.WriteFile(payloadPath, []byte(`{"bundleSha256":"abc"}`), 0600); err != nil {
		t.Fatal(err)
	}
	var stdout, stderr bytes.Buffer
	exit := run(context.Background(), []string{"sign", "--payload", payloadPath, "--key-name", "munjib-release-lab-v1", "--key-version", "1", "--key-id", "munjib-release-lab-v1", "--generation", "1", "--ttl", "2m"}, env(server.URL), strings.NewReader(""), &stdout, &stderr, func() time.Time { return fixedNow }, bytes.NewReader(bytes.Repeat([]byte{7}, 32)))
	if exit != 0 {
		t.Fatalf("exit %d: %s", exit, stderr.String())
	}
	if strings.Count(stdout.String(), "\n") != 1 || !json.Valid(stdout.Bytes()) {
		t.Fatalf("stdout is not exactly one JSON object: %q", stdout.String())
	}
	if _, err := delivery.VerifyEnvelope(bytes.TrimSpace(stdout.Bytes()), publicKey, fixedNow); err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"test-token-secret", "vault:v1:", base64.StdEncoding.EncodeToString(privateKey)} {
		if strings.Contains(stderr.String(), secret) || strings.Contains(stdout.String(), secret) {
			t.Fatalf("secret material leaked: %q", secret)
		}
	}
}

func TestRunPublicKeyWritesRawKeyAtomically(t *testing.T) {
	publicKey, privateKey, _ := ed25519.GenerateKey(rand.Reader)
	server := vaultServer(t, publicKey, privateKey)
	defer server.Close()
	dir := t.TempDir()
	out := filepath.Join(dir, "release-verify.pub")
	var stdout, stderr bytes.Buffer
	if exit := run(context.Background(), []string{"public-key", "--key-name", "munjib-release-lab-v1", "--version", "1", "--out", out}, env(server.URL), strings.NewReader(""), &stdout, &stderr, func() time.Time { return fixedNow }, rand.Reader); exit != 0 {
		t.Fatalf("exit %d: %s", exit, stderr.String())
	}
	raw, err := os.ReadFile(out)
	if err != nil || !bytes.Equal(raw, publicKey) {
		t.Fatalf("raw key: %x, %v", raw, err)
	}
	info, _ := os.Stat(out)
	if info.Mode().Perm() != 0400 || stdout.Len() != 0 {
		t.Fatalf("mode/stdout: %o %q", info.Mode().Perm(), stdout.String())
	}
	for name, path := range map[string]string{"overwrite": out, "directory": dir, "symlink": filepath.Join(dir, "link")} {
		if name == "symlink" {
			if err := os.Symlink(filepath.Join(dir, "target"), path); err != nil {
				t.Fatal(err)
			}
		}
		stdout.Reset()
		stderr.Reset()
		if exit := run(context.Background(), []string{"public-key", "--key-name", "munjib-release-lab-v1", "--version", "1", "--out", path}, env(server.URL), strings.NewReader(""), &stdout, &stderr, func() time.Time { return fixedNow }, rand.Reader); exit != 74 {
			t.Errorf("%s exit = %d, want 74", name, exit)
		}
	}
}

func TestRunPublicKeyForcesExactModeDespiteUmask(t *testing.T) {
	publicKey, privateKey, _ := ed25519.GenerateKey(rand.Reader)
	server := vaultServer(t, publicKey, privateKey)
	defer server.Close()
	out := filepath.Join(t.TempDir(), "release-verify.pub")
	previousUmask := syscall.Umask(0777)
	exit := run(context.Background(), []string{"public-key", "--key-name", "munjib-release-lab-v1", "--version", "1", "--out", out}, env(server.URL), strings.NewReader(""), io.Discard, io.Discard, func() time.Time { return fixedNow }, rand.Reader)
	syscall.Umask(previousUmask)
	if exit != 0 {
		t.Fatalf("exit = %d", exit)
	}
	info, err := os.Stat(out)
	if err != nil || info.Mode().Perm() != 0400 {
		t.Fatalf("mode = %v, err = %v", info.Mode().Perm(), err)
	}
}

func TestRunSignReturnsOutputFailureWithoutLeakingSecrets(t *testing.T) {
	publicKey, privateKey, _ := ed25519.GenerateKey(rand.Reader)
	server := vaultServer(t, publicKey, privateKey)
	defer server.Close()
	payloadPath := filepath.Join(t.TempDir(), "payload.json")
	if err := os.WriteFile(payloadPath, []byte(`{}`), 0600); err != nil {
		t.Fatal(err)
	}
	var stderr bytes.Buffer
	exit := run(context.Background(), []string{"sign", "--payload", payloadPath, "--key-name", "munjib-release-lab-v1", "--key-version", "1", "--key-id", "id", "--generation", "1", "--ttl", "2m"}, env(server.URL), strings.NewReader(""), failingWriter{}, &stderr, func() time.Time { return fixedNow }, bytes.NewReader(bytes.Repeat([]byte{1}, 32)))
	if exit != 74 {
		t.Fatalf("exit = %d, stderr = %q", exit, stderr.String())
	}
	if strings.Contains(stderr.String(), "test-token-secret") || strings.Contains(stderr.String(), "vault:v1:") || strings.Contains(stderr.String(), base64.StdEncoding.EncodeToString(privateKey)) {
		t.Fatalf("secret leaked: %q", stderr.String())
	}
}

func TestRunRejectsUnsafeInputsWithStableExitCodes(t *testing.T) {
	dir := t.TempDir()
	validPayload := filepath.Join(dir, "payload.json")
	badPayload := filepath.Join(dir, "bad.json")
	largePayload := filepath.Join(dir, "large.json")
	_ = os.WriteFile(validPayload, []byte(`{}`), 0600)
	_ = os.WriteFile(badPayload, []byte(`no`), 0600)
	_ = os.WriteFile(largePayload, bytes.Repeat([]byte(" "), delivery.MaxPayloadBytes+1), 0600)
	base := []string{"sign", "--payload", validPayload, "--key-name", "key", "--key-version", "1", "--key-id", "id", "--generation", "1", "--ttl", "2m"}
	tests := []struct {
		name   string
		args   []string
		getenv func(string) string
		want   int
	}{
		{"secret token flag", append(append([]string{}, base...), "--vault-token", "secret"), env("http://127.0.0.1:1"), 64},
		{"secret addr flag", append(append([]string{}, base...), "--vault-addr", "https://example.com"), env("http://127.0.0.1:1"), 64},
		{"missing env", base, func(string) string { return "" }, 64},
		{"invalid present vault address", base, env("http://example.com"), 69},
		{"key version zero", []string{"sign", "--payload", validPayload, "--key-name", "key", "--key-version", "0", "--key-id", "id", "--generation", "1", "--ttl", "2m"}, env("http://127.0.0.1:1"), 64},
		{"non-json", []string{"sign", "--payload", badPayload, "--key-name", "key", "--key-version", "1", "--key-id", "id", "--generation", "1", "--ttl", "2m"}, env("http://127.0.0.1:1"), 65},
		{"oversized", []string{"sign", "--payload", largePayload, "--key-name", "key", "--key-version", "1", "--key-id", "id", "--generation", "1", "--ttl", "2m"}, env("http://127.0.0.1:1"), 65},
		{"generation zero", []string{"sign", "--payload", validPayload, "--key-name", "key", "--key-version", "1", "--key-id", "id", "--generation", "0", "--ttl", "2m"}, env("http://127.0.0.1:1"), 64},
		{"ttl zero", []string{"sign", "--payload", validPayload, "--key-name", "key", "--key-version", "1", "--key-id", "id", "--generation", "1", "--ttl", "0s"}, env("http://127.0.0.1:1"), 64},
		{"ttl too long", []string{"sign", "--payload", validPayload, "--key-name", "key", "--key-version", "1", "--key-id", "id", "--generation", "1", "--ttl", "6m"}, env("http://127.0.0.1:1"), 64},
		{"extra args", append(append([]string{}, base...), "extra"), env("http://127.0.0.1:1"), 64},
		{"vault unavailable", base, env("http://127.0.0.1:1"), 69},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			if got := run(context.Background(), tc.args, tc.getenv, strings.NewReader(""), &stdout, &stderr, func() time.Time { return fixedNow }, bytes.NewReader(bytes.Repeat([]byte{1}, 32))); got != tc.want {
				t.Fatalf("exit = %d, want %d; stderr=%q", got, tc.want, stderr.String())
			}
			if stdout.Len() != 0 || strings.Contains(stderr.String(), "secret") {
				t.Fatalf("unsafe output stdout=%q stderr=%q", stdout.String(), stderr.String())
			}
		})
	}
}

func TestRunReportsMissingVaultEnvironmentWithoutPrintingUsage(t *testing.T) {
	for _, test := range []struct {
		name string
		env  func(string) string
		want string
	}{
		{name: "address", env: func(string) string { return "" }, want: "VAULT_ADDR is required\n"},
		{name: "token", env: func(key string) string {
			if key == "VAULT_ADDR" {
				return "http://127.0.0.1:1"
			}
			return ""
		}, want: "VAULT_TOKEN is required\n"},
	} {
		t.Run(test.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			if exit := run(context.Background(), []string{"sign"}, test.env, strings.NewReader(""), &stdout, &stderr, time.Now, rand.Reader); exit != exitUsage {
				t.Fatalf("exit=%d", exit)
			}
			if stdout.Len() != 0 || stderr.String() != test.want {
				t.Fatalf("stdout=%q stderr=%q", stdout.String(), stderr.String())
			}
		})
	}
}
