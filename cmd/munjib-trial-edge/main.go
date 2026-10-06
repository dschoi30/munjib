package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
	"unicode/utf8"
)

const credentialPath = "/run/credentials/munjib-trial-edge.service/trial-edge-proof-secret"

var methodPattern = regexp.MustCompile(`^[A-Z]{3,10}$`)
var pathPattern = regexp.MustCompile(`^(/api/trial/entitlement|/trial/workspaces/[^/]+|/api/workspaces/[^/]+/(assistant/messages|documents/[^/]+/ask))$`)

func proof(key, timestamp, method, uri, ip string) (string, error) {
	addr, err := netip.ParseAddr(ip)
	if err != nil || addr.Zone() != "" || !methodPattern.MatchString(method) || !strings.HasPrefix(uri, "/") {
		return "", fmt.Errorf("invalid authority")
	}
	u, err := url.ParseRequestURI(uri)
	if err != nil {
		return "", fmt.Errorf("invalid URI")
	}
	path := u.EscapedPath()
	if len(path) > 2048 || !pathPattern.MatchString(path) {
		return "", fmt.Errorf("invalid path")
	}
	normalized := "v4:" + addr.String()
	if addr.Is6() {
		b := addr.As16()
		normalized = fmt.Sprintf("v6:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x", b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15])
	}
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte("munjib/trial-network-evidence/v1\x00" + timestamp + "\x00" + method + "\x00" + path + "\x00" + normalized))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func handler(key string, now func() time.Time) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "private, no-store")
		peer, _, err := net.SplitHostPort(r.RemoteAddr)
		peerIP := net.ParseIP(peer)
		if err != nil || peerIP == nil || !peerIP.IsLoopback() {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		if r.Method != "GET" || r.URL.Path != "/proof" || r.URL.RawQuery != "" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		for _, name := range []string{"X-Munjib-Edge-Client-IP", "X-Forwarded-Method", "X-Forwarded-Uri"} {
			if len(r.Header.Values(name)) != 1 {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
		}
		ip := r.Header.Get("X-Munjib-Edge-Client-IP")
		timestamp := strconv.FormatInt(now().Unix(), 10)
		signature, err := proof(key, timestamp, r.Header.Get("X-Forwarded-Method"), r.Header.Get("X-Forwarded-Uri"), ip)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Header().Set("X-Munjib-Trusted-Client-IP", ip)
		w.Header().Set("X-Munjib-Trusted-Network-Timestamp", timestamp)
		w.Header().Set("X-Munjib-Trusted-Network-Proof", signature)
		w.WriteHeader(http.StatusOK)
	})
}

func validKeyBytes(data []byte) bool {
	if len(data) > 256 || !utf8.Valid(data) {
		return false
	}
	value := string(data)
	if len(utf16.Encode([]rune(value))) < 16 || strings.TrimSpace(value) != value {
		return false
	}
	for _, r := range value {
		if r <= 0x1f || (r >= 0x7f && r <= 0x9f) || r == 0x2028 || r == 0x2029 || r == 0xfeff {
			return false
		}
	}
	return true
}

func loadKey(path string) (string, error) {
	pathInfo, err := os.Lstat(path)
	if err != nil || !pathInfo.Mode().IsRegular() {
		return "", fmt.Errorf("unsafe secret file")
	}
	file, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return "", fmt.Errorf("secret unavailable")
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !os.SameFile(pathInfo, info) || !info.Mode().IsRegular() || info.Size() < 16 || info.Size() > 256 {
		return "", fmt.Errorf("unsafe secret file")
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	// systemd may expose credentials as root:root 0440 with a service-only ACL.
	// Accept that envelope only at the fixed systemd-managed credential path.
	privateOwner := ok && int(stat.Uid) == os.Geteuid() && info.Mode() == 0400
	systemdCredential := ok && path == credentialPath && stat.Uid == 0 && stat.Gid == 0 && info.Mode() == 0440
	if (!privateOwner && !systemdCredential) || stat.Nlink != 1 {
		return "", fmt.Errorf("invalid secret owner")
	}
	data, err := io.ReadAll(io.LimitReader(file, 257))
	if err != nil || int64(len(data)) != info.Size() || !validKeyBytes(data) {
		return "", fmt.Errorf("invalid secret bytes")
	}
	return string(data), nil
}

func main() {
	key, err := loadKey(credentialPath)
	if err != nil {
		log.Fatal("Trial edge secret unavailable or unsafe")
	}
	server := &http.Server{Addr: "127.0.0.1:9187", Handler: handler(key, time.Now), ReadHeaderTimeout: 2 * time.Second, ReadTimeout: 2 * time.Second, WriteTimeout: 2 * time.Second, IdleTimeout: 5 * time.Second, MaxHeaderBytes: 4096}
	log.Fatal(server.ListenAndServe())
}
