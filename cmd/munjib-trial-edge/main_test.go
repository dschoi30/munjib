package main

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestProof(t *testing.T) {
	for _, tc := range []struct{ ip, method, uri, want string }{
		{"203.0.113.7", "POST", "/api/trial/entitlement", "QkMHmujoz3X8PIihgjDmBevsT2PffkacC_FKiezMAYk"},
		{"2001:db8::1", "GET", "/trial/workspaces/demo?document=abc", "vLTT5mGgizDbgLrZSzO29joDt7aQWQeJDPgbYhapt5E"},
	} {
		got, err := proof(strings.Repeat("a", 43), "1800000000", tc.method, tc.uri, tc.ip)
		if err != nil || got != tc.want {
			t.Fatalf("proof %s: %q %v", tc.ip, got, err)
		}
	}
}
func TestRejectInputs(t *testing.T) {
	for _, tc := range []struct{ ip, method, uri string }{
		{"203.0.113.7, 127.0.0.1", "GET", "/trial/workspaces/demo"},
		{" 203.0.113.7", "GET", "/trial/workspaces/demo"},
		{"203.0.113.7", "get", "/trial/workspaces/demo"},
		{"203.0.113.7", "GET", "https://evil.example/trial/workspaces/demo"},
		{"203.0.113.7", "GET", "/api/auth/callback/password"},
		{"fe80::1%eth0", "GET", "/trial/workspaces/demo"},
		{"203.0.113.7", "GET", "/trial/workspaces/" + strings.Repeat("x", 2048)},
	} {
		if _, err := proof(strings.Repeat("a", 43), "1800000000", tc.method, tc.uri, tc.ip); err == nil {
			t.Fatalf("accepted %+v", tc)
		}
	}
}
func TestHandlerUsesOriginalRequest(t *testing.T) {
	h := handler(strings.Repeat("a", 43), func() time.Time { return time.Unix(1800000000, 0) })
	r := httptest.NewRequest("GET", "http://localhost/proof", nil)
	r.RemoteAddr = "127.0.0.1:1234"
	r.Header.Set("X-Munjib-Edge-Client-IP", "203.0.113.7")
	r.Header.Set("X-Forwarded-Method", "POST")
	r.Header.Set("X-Forwarded-Uri", "/api/trial/entitlement?ignored=1")
	r.Header.Set("X-Munjib-Trusted-Network-Proof", "forged")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 || w.Header().Get("X-Munjib-Trusted-Network-Proof") != "QkMHmujoz3X8PIihgjDmBevsT2PffkacC_FKiezMAYk" {
		t.Fatalf("unexpected response: %d %v", w.Code, w.Header())
	}
	if w.Body.Len() != 0 {
		t.Fatal("proof body must be empty")
	}
	r.Header.Add("X-Munjib-Edge-Client-IP", "127.0.0.1")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 400 {
		t.Fatal("duplicate authority header accepted")
	}
}

func TestKeyFileBoundary(t *testing.T) {
	path := filepath.Join(t.TempDir(), "key")
	if _, err := loadKey(path); err == nil {
		t.Fatal("missing accepted")
	}
	if err := os.WriteFile(path, []byte(strings.Repeat("a", 43)), 0400); err != nil {
		t.Fatal(err)
	}
	if _, err := loadKey(path); err != nil {
		t.Fatal(err)
	}
	link := path + "-link"
	if err := os.Symlink(path, link); err != nil {
		t.Fatal(err)
	}
	if _, err := loadKey(link); err == nil {
		t.Fatal("symlink accepted")
	}
	if err := os.Chmod(path, 0440); err != nil {
		t.Fatal(err)
	}
	if _, err := loadKey(path); err == nil {
		t.Fatal("group-readable arbitrary file accepted")
	}
	if err := os.Chmod(path, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := loadKey(path); err == nil {
		t.Fatal("public file accepted")
	}
	if err := os.WriteFile(path, []byte("short"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0400); err != nil {
		t.Fatal(err)
	}
	if _, err := loadKey(path); err == nil {
		t.Fatal("short key accepted")
	}
}
func TestRejectNonlocalAndWrongEndpoint(t *testing.T) {
	h := handler(strings.Repeat("a", 43), time.Now)
	for _, tc := range []struct {
		peer, method, path string
		status             int
	}{
		{"198.51.100.1:1234", "GET", "/proof", 403},
		{"127.0.0.1:1234", "POST", "/proof", 404},
		{"127.0.0.1:1234", "GET", "/proof?x=1", 404},
		{"127.0.0.1:1234", "GET", "/proof", 400},
	} {
		r := httptest.NewRequest(tc.method, "http://localhost"+tc.path, nil)
		r.RemoteAddr = tc.peer
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("%+v got %d", tc, w.Code)
		}
	}
}
