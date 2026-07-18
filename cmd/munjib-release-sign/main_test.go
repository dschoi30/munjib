package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dschoi30/munjib/internal/delivery"
)

var fixedNow = time.Date(2026, 7, 19, 1, 2, 3, 0, time.UTC)

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
			writeVaultJSON(t, w, map[string]any{"signature": "vault:v1:" + base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, message))})
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
	exit := run(context.Background(), []string{"sign", "--payload", payloadPath, "--key-name", "munjib-release-lab-v1", "--key-id", "munjib-release-lab-v1", "--generation", "1", "--ttl", "2m"}, env(server.URL), strings.NewReader(""), &stdout, &stderr, func() time.Time { return fixedNow }, bytes.NewReader(bytes.Repeat([]byte{7}, 32)))
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

func TestRunRejectsUnsafeInputsWithStableExitCodes(t *testing.T) {
	dir := t.TempDir()
	validPayload := filepath.Join(dir, "payload.json")
	badPayload := filepath.Join(dir, "bad.json")
	largePayload := filepath.Join(dir, "large.json")
	_ = os.WriteFile(validPayload, []byte(`{}`), 0600)
	_ = os.WriteFile(badPayload, []byte(`no`), 0600)
	_ = os.WriteFile(largePayload, bytes.Repeat([]byte(" "), delivery.MaxPayloadBytes+1), 0600)
	base := []string{"sign", "--payload", validPayload, "--key-name", "key", "--key-id", "id", "--generation", "1", "--ttl", "2m"}
	tests := []struct {
		name   string
		args   []string
		getenv func(string) string
		want   int
	}{
		{"secret token flag", append(append([]string{}, base...), "--vault-token", "secret"), env("http://127.0.0.1:1"), 64},
		{"secret addr flag", append(append([]string{}, base...), "--vault-addr", "https://example.com"), env("http://127.0.0.1:1"), 64},
		{"missing env", base, func(string) string { return "" }, 64},
		{"non-json", []string{"sign", "--payload", badPayload, "--key-name", "key", "--key-id", "id", "--generation", "1", "--ttl", "2m"}, env("http://127.0.0.1:1"), 65},
		{"oversized", []string{"sign", "--payload", largePayload, "--key-name", "key", "--key-id", "id", "--generation", "1", "--ttl", "2m"}, env("http://127.0.0.1:1"), 65},
		{"generation zero", []string{"sign", "--payload", validPayload, "--key-name", "key", "--key-id", "id", "--generation", "0", "--ttl", "2m"}, env("http://127.0.0.1:1"), 64},
		{"ttl zero", []string{"sign", "--payload", validPayload, "--key-name", "key", "--key-id", "id", "--generation", "1", "--ttl", "0s"}, env("http://127.0.0.1:1"), 64},
		{"ttl too long", []string{"sign", "--payload", validPayload, "--key-name", "key", "--key-id", "id", "--generation", "1", "--ttl", "6m"}, env("http://127.0.0.1:1"), 64},
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
