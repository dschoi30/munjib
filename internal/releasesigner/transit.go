package releasesigner

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const maxVaultResponseBytes = 64 << 10

var transitKeyName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`)

type TransitClient struct {
	Address    *url.URL
	HTTPClient *http.Client
	Token      string
}

func NewTransitClient(rawAddress, token string) (TransitClient, error) {
	address, err := url.Parse(rawAddress)
	if err != nil || !validVaultAddress(address) || token == "" {
		return TransitClient{}, errors.New("VAULT_CONFIG")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	return TransitClient{
		Address: address,
		Token:   token,
		HTTPClient: &http.Client{
			Transport:     transport,
			Timeout:       10 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("redirect rejected") },
		},
	}, nil
}

func validVaultAddress(address *url.URL) bool {
	if address == nil || address.Host == "" || address.User != nil || address.RawQuery != "" || address.Fragment != "" || (address.Path != "" && address.Path != "/") {
		return false
	}
	if address.Scheme == "https" {
		return true
	}
	if address.Scheme != "http" {
		return false
	}
	host := address.Hostname()
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (c TransitClient) Sign(ctx context.Context, keyName string, message []byte) ([]byte, uint64, error) {
	if !c.valid(keyName) {
		return nil, 0, errors.New("VAULT_CONFIG")
	}
	body := struct {
		Input              string `json:"input"`
		Prehashed          bool   `json:"prehashed"`
		SignatureAlgorithm string `json:"signature_algorithm"`
	}{base64.StdEncoding.EncodeToString(message), false, "ed25519"}
	var response struct {
		Data struct {
			Signature string `json:"signature"`
		} `json:"data"`
	}
	if err := c.post(ctx, "/v1/transit/sign/"+keyName, body, &response); err != nil {
		return nil, 0, err
	}
	parts := strings.Split(response.Data.Signature, ":")
	if len(parts) != 3 || parts[0] != "vault" || !strings.HasPrefix(parts[1], "v") {
		return nil, 0, errors.New("VAULT_SIGNATURE")
	}
	version, err := strconv.ParseUint(strings.TrimPrefix(parts[1], "v"), 10, 64)
	if err != nil || version == 0 {
		return nil, 0, errors.New("VAULT_SIGNATURE")
	}
	signature, ok := decodeCanonicalBase64(parts[2])
	if !ok || len(signature) != ed25519.SignatureSize {
		return nil, 0, errors.New("VAULT_SIGNATURE")
	}
	return signature, version, nil
}

func (c TransitClient) PublicKey(ctx context.Context, keyName string, version uint64) (ed25519.PublicKey, error) {
	if !c.valid(keyName) || version == 0 {
		return nil, errors.New("VAULT_CONFIG")
	}
	var response struct {
		Data struct {
			Keys map[string]struct {
				PublicKey string `json:"public_key"`
			} `json:"keys"`
		} `json:"data"`
	}
	if err := c.get(ctx, "/v1/transit/keys/"+keyName, &response); err != nil {
		return nil, err
	}
	entry, ok := response.Data.Keys[strconv.FormatUint(version, 10)]
	if !ok {
		return nil, errors.New("VAULT_PUBLIC_KEY")
	}
	raw, ok := decodeCanonicalBase64(entry.PublicKey)
	if !ok {
		return nil, errors.New("VAULT_PUBLIC_KEY")
	}
	if len(raw) == ed25519.PublicKeySize {
		return ed25519.PublicKey(append([]byte(nil), raw...)), nil
	}
	parsed, err := x509.ParsePKIXPublicKey(raw)
	if err != nil {
		return nil, errors.New("VAULT_PUBLIC_KEY")
	}
	publicKey, ok := parsed.(ed25519.PublicKey)
	if !ok || len(publicKey) != ed25519.PublicKeySize {
		return nil, errors.New("VAULT_PUBLIC_KEY")
	}
	return append(ed25519.PublicKey(nil), publicKey...), nil
}

func (c TransitClient) valid(keyName string) bool {
	return validVaultAddress(c.Address) && c.Token != "" && c.HTTPClient != nil && transitKeyName.MatchString(keyName)
}

func (c TransitClient) get(ctx context.Context, path string, output any) error {
	return c.do(ctx, http.MethodGet, path, nil, output)
}

func (c TransitClient) post(ctx context.Context, path string, input, output any) error {
	encoded, err := json.Marshal(input)
	if err != nil {
		return errors.New("VAULT_REQUEST")
	}
	return c.do(ctx, http.MethodPost, path, encoded, output)
}

func (c TransitClient) do(ctx context.Context, method, path string, body []byte, output any) error {
	endpoint := *c.Address
	endpoint.Path = path
	request, err := http.NewRequestWithContext(ctx, method, endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return errors.New("VAULT_REQUEST")
	}
	request.Header.Set("X-Vault-Token", c.Token)
	request.Header.Set("Content-Type", "application/json")
	client := *c.HTTPClient
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return errors.New("redirect rejected") }
	client.Timeout = 10 * time.Second
	response, err := client.Do(request)
	if err != nil {
		return errors.New("VAULT_REQUEST")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return errors.New("VAULT_RESPONSE")
	}
	limited := io.LimitReader(response.Body, maxVaultResponseBytes+1)
	raw, err := io.ReadAll(limited)
	if err != nil || len(raw) > maxVaultResponseBytes {
		return errors.New("VAULT_RESPONSE")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(output); err != nil {
		return errors.New("VAULT_RESPONSE")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return errors.New("VAULT_RESPONSE")
	}
	return nil
}

func decodeCanonicalBase64(encoded string) ([]byte, bool) {
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	return decoded, err == nil && base64.StdEncoding.EncodeToString(decoded) == encoded
}
