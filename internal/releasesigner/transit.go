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

type vaultResponse[T any] struct {
	RequestID     string         `json:"request_id"`
	LeaseID       string         `json:"lease_id"`
	Renewable     bool           `json:"renewable"`
	LeaseDuration int            `json:"lease_duration"`
	Data          T              `json:"data"`
	WrapInfo      *vaultWrapInfo `json:"wrap_info"`
	Warnings      []string       `json:"warnings"`
	Auth          *vaultAuth     `json:"auth"`
	MountType     string         `json:"mount_type"`
}

type vaultWrapInfo struct {
	Token           string    `json:"token"`
	Accessor        string    `json:"accessor"`
	TTL             int       `json:"ttl"`
	CreationTime    time.Time `json:"creation_time"`
	CreationPath    string    `json:"creation_path"`
	WrappedAccessor string    `json:"wrapped_accessor"`
}

type vaultAuth struct {
	ClientToken      string            `json:"client_token"`
	Accessor         string            `json:"accessor"`
	Policies         []string          `json:"policies"`
	TokenPolicies    []string          `json:"token_policies"`
	IdentityPolicies []string          `json:"identity_policies"`
	Metadata         map[string]string `json:"metadata"`
	LeaseDuration    int               `json:"lease_duration"`
	Renewable        bool              `json:"renewable"`
	EntityID         string            `json:"entity_id"`
	TokenType        string            `json:"token_type"`
	Orphan           bool              `json:"orphan"`
	NumUses          int               `json:"num_uses"`
}

type vaultSignData struct {
	KeyVersion uint64 `json:"key_version"`
	Signature  string `json:"signature"`
}

type vaultKeyData struct {
	AllowPlaintextBackup bool                       `json:"allow_plaintext_backup"`
	AutoRotatePeriod     int                        `json:"auto_rotate_period"`
	DeletionAllowed      bool                       `json:"deletion_allowed"`
	Derived              bool                       `json:"derived"`
	Exportable           bool                       `json:"exportable"`
	ImportedKey          bool                       `json:"imported_key"`
	Keys                 map[string]vaultKeyVersion `json:"keys"`
	LatestVersion        uint64                     `json:"latest_version"`
	MinAvailableVersion  uint64                     `json:"min_available_version"`
	MinDecryptionVersion uint64                     `json:"min_decryption_version"`
	MinEncryptionVersion uint64                     `json:"min_encryption_version"`
	Name                 string                     `json:"name"`
	SupportsDecryption   bool                       `json:"supports_decryption"`
	SupportsDerivation   bool                       `json:"supports_derivation"`
	SupportsEncryption   bool                       `json:"supports_encryption"`
	SupportsSigning      bool                       `json:"supports_signing"`
	Type                 string                     `json:"type"`
}

type vaultKeyVersion struct {
	CertificateChain string `json:"certificate_chain"`
	CreationTime     string `json:"creation_time"`
	HybridPublicKey  string `json:"hybrid_public_key"`
	Name             string `json:"name"`
	PublicKey        string `json:"public_key"`
}

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
	var transport http.RoundTripper = http.DefaultTransport
	if defaultTransport, ok := http.DefaultTransport.(*http.Transport); ok {
		transport = defaultTransport.Clone()
	}
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

func (c TransitClient) Sign(ctx context.Context, keyName string, keyVersion uint64, message []byte) ([]byte, uint64, error) {
	if !c.valid(keyName) || keyVersion == 0 {
		return nil, 0, errors.New("VAULT_CONFIG")
	}
	body := struct {
		Input              string `json:"input"`
		KeyVersion         uint64 `json:"key_version"`
		Prehashed          bool   `json:"prehashed"`
		SignatureAlgorithm string `json:"signature_algorithm"`
	}{base64.StdEncoding.EncodeToString(message), keyVersion, false, "ed25519"}
	var response vaultResponse[vaultSignData]
	if err := c.post(ctx, "/v1/transit/sign/"+keyName, body, &response); err != nil {
		return nil, 0, err
	}
	parts := strings.Split(response.Data.Signature, ":")
	if len(parts) != 3 || parts[0] != "vault" || !strings.HasPrefix(parts[1], "v") {
		return nil, 0, errors.New("VAULT_SIGNATURE")
	}
	version, err := strconv.ParseUint(strings.TrimPrefix(parts[1], "v"), 10, 64)
	if err != nil || version == 0 || response.Data.KeyVersion != version || version != keyVersion {
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
	var response vaultResponse[vaultKeyData]
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
