package releasesigner

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newTestTransitClient(t *testing.T, address, token string) TransitClient {
	t.Helper()
	c, err := NewTransitClient(address, token)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestTransitClientSign(t *testing.T) {
	signature := bytes.Repeat([]byte{0x42}, ed25519.SignatureSize)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/transit/sign/munjib-release-lab-v1" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("X-Vault-Token") != "test-token" {
			t.Fatal("missing token")
		}
		var body struct {
			Input              string `json:"input"`
			Prehashed          bool   `json:"prehashed"`
			SignatureAlgorithm string `json:"signature_algorithm"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Fatal("invalid body")
		}
		if body.Input != base64.StdEncoding.EncodeToString([]byte("message")) || body.Prehashed || body.SignatureAlgorithm != "ed25519" {
			t.Fatalf("bad body: %#v", body)
		}
		json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"signature": "vault:v3:" + base64.StdEncoding.EncodeToString(signature)}})
	}))
	defer server.Close()
	got, version, err := newTestTransitClient(t, server.URL, "test-token").Sign(context.Background(), "munjib-release-lab-v1", []byte("message"))
	if err != nil || version != 3 || !bytes.Equal(got, signature) {
		t.Fatalf("unexpected result: %d %x %v", version, got, err)
	}
}

func TestTransitClientRejectsConfiguration(t *testing.T) {
	for _, tc := range []struct{ name, address, token string }{
		{"remote http", "http://example.com", "token"}, {"missing token", "https://example.com", ""},
		{"query", "https://example.com?secret=x", "token"}, {"credentials", "https://u:p@example.com", "token"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := NewTransitClient(tc.address, tc.token); err == nil || err.Error() != "VAULT_CONFIG" {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func TestTransitClientSignFailuresAreStableAndRedacted(t *testing.T) {
	sig := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 64))
	tests := []struct {
		name, response string
		status         int
	}{
		{"non-2xx", `super-secret-body`, 500}, {"unknown field", `{"data":{"signature":"vault:v1:` + sig + `"},"secret":"leak"}`, 200},
		{"trailing", `{"data":{"signature":"vault:v1:` + sig + `"}} {}`, 200},
		{"malformed prefix", `{"data":{"signature":"other:v1:` + sig + `"}}`, 200},
		{"zero version", `{"data":{"signature":"vault:v0:` + sig + `"}}`, 200},
		{"non-numeric version", `{"data":{"signature":"vault:vX:` + sig + `"}}`, 200},
		{"invalid base64", `{"data":{"signature":"vault:v1:not-base64"}}`, 200},
		{"wrong signature size", `{"data":{"signature":"vault:v1:YQ=="}}`, 200},
		{"oversize", strings.Repeat("x", 65537), 200},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.response))
			}))
			defer s.Close()
			_, _, err := newTestTransitClient(t, s.URL, "token-secret").Sign(context.Background(), "valid-key", []byte("message"))
			if err == nil || strings.Contains(err.Error(), "secret") || !strings.HasPrefix(err.Error(), "VAULT_") {
				t.Fatalf("unsafe error: %v", err)
			}
		})
	}
	for _, key := range []string{"", "-bad", "bad/key", strings.Repeat("a", 129)} {
		if _, _, err := newTestTransitClient(t, "http://127.0.0.1:1", "t").Sign(context.Background(), key, nil); err == nil || err.Error() != "VAULT_CONFIG" {
			t.Fatalf("key %q: %v", key, err)
		}
	}
}

func TestTransitClientRejectsRedirectAndHonorsContext(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/elsewhere", http.StatusFound) }))
	defer s.Close()
	_, _, err := newTestTransitClient(t, s.URL, "t").Sign(context.Background(), "key", nil)
	if err == nil || err.Error() != "VAULT_REQUEST" {
		t.Fatalf("redirect: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, err = newTestTransitClient(t, s.URL, "t").Sign(ctx, "key", nil)
	if err == nil || err.Error() != "VAULT_REQUEST" {
		t.Fatalf("cancel: %v", err)
	}
}

func TestTransitClientPublicKeyRawAndDER(t *testing.T) {
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	der, _ := x509.MarshalPKIXPublicKey(pub)
	for _, encoded := range []string{base64.StdEncoding.EncodeToString(pub), base64.StdEncoding.EncodeToString(der)} {
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"keys": map[string]any{"3": map[string]any{"public_key": encoded}}}})
		}))
		got, err := newTestTransitClient(t, s.URL, "t").PublicKey(context.Background(), "key", 3)
		s.Close()
		if err != nil || !bytes.Equal(got, pub) {
			t.Fatalf("got %x: %v", got, err)
		}
	}
}

func TestTransitClientPublicKeyRejectsInvalidForms(t *testing.T) {
	rsaKey, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatal(err)
	}
	rsaDER, err := x509.MarshalPKIXPublicKey(&rsaKey.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	for _, encoded := range []string{
		"-----BEGIN PUBLIC KEY-----",
		"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample",
		base64.StdEncoding.EncodeToString([]byte("short")),
		base64.StdEncoding.EncodeToString(rsaDER),
	} {
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"keys": map[string]any{"2": map[string]any{"public_key": encoded}}}})
		}))
		_, err := newTestTransitClient(t, s.URL, "t").PublicKey(context.Background(), "key", 3)
		s.Close()
		if err == nil || err.Error() != "VAULT_PUBLIC_KEY" {
			t.Fatalf("got %v", err)
		}
	}
}

func TestTransitClientDefaultTimeout(t *testing.T) {
	c := newTestTransitClient(t, "https://example.com", "t")
	if c.HTTPClient.Timeout != 10*time.Second {
		t.Fatalf("timeout %v", c.HTTPClient.Timeout)
	}
}
