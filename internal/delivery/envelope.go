package delivery

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	MaxEnvelopeBytes = 1 << 20
	MaxPayloadBytes  = 512 << 10
)

var allowedOperations = map[string]bool{
	"VERIFY_ONLY":        true,
	"INSTALL_SUBSTRATE":  true,
	"RECONCILE_SUBSTRATE": true,
}

type Envelope struct {
	Format             string          `json:"format"`
	Operation          string          `json:"operation"`
	Nonce              string          `json:"nonce"`
	ExpiresAt          string          `json:"expiresAt"`
	ExpectedGeneration uint64          `json:"expectedGeneration"`
	Payload            json.RawMessage `json:"payload"`
	PayloadSHA256      string          `json:"payloadSha256"`
	KeyID              string          `json:"keyId"`
	Signature          string          `json:"signature"`
}

type VerifiedRequest struct {
	Envelope Envelope
	Payload  []byte
}

func VerifyEnvelope(raw []byte, publicKey ed25519.PublicKey, now time.Time) (VerifiedRequest, error) {
	if len(raw) == 0 || len(raw) > MaxEnvelopeBytes {
		return VerifiedRequest{}, errors.New("ENVELOPE_SIZE")
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	var envelope Envelope
	if err := decoder.Decode(&envelope); err != nil {
		return VerifiedRequest{}, fmt.Errorf("ENVELOPE_JSON: %w", err)
	}
	if envelope.Format != "munjib-release-envelope-v1" || !allowedOperations[envelope.Operation] {
		return VerifiedRequest{}, errors.New("ENVELOPE_OPERATION")
	}
	if len(envelope.Payload) == 0 || len(envelope.Payload) > MaxPayloadBytes || envelope.KeyID == "" {
		return VerifiedRequest{}, errors.New("ENVELOPE_PAYLOAD")
	}
	nonce, err := base64.RawURLEncoding.DecodeString(envelope.Nonce)
	if err != nil || len(nonce) != 32 {
		return VerifiedRequest{}, errors.New("ENVELOPE_NONCE")
	}
	expiresAt, err := time.Parse(time.RFC3339Nano, envelope.ExpiresAt)
	if err != nil || !expiresAt.After(now) || expiresAt.Sub(now) > 5*time.Minute {
		return VerifiedRequest{}, errors.New("ENVELOPE_EXPIRY")
	}
	payloadDigest := sha256.Sum256(envelope.Payload)
	if !strings.EqualFold(envelope.PayloadSHA256, hex.EncodeToString(payloadDigest[:])) {
		return VerifiedRequest{}, errors.New("ENVELOPE_PAYLOAD_HASH")
	}
	signature, err := base64.RawURLEncoding.DecodeString(envelope.Signature)
	if err != nil || len(signature) != ed25519.SignatureSize {
		return VerifiedRequest{}, errors.New("ENVELOPE_SIGNATURE")
	}
	message := signedMessage(envelope)
	if !ed25519.Verify(publicKey, message, signature) {
		return VerifiedRequest{}, errors.New("ENVELOPE_SIGNATURE_INVALID")
	}
	return VerifiedRequest{Envelope: envelope, Payload: append([]byte(nil), envelope.Payload...)}, nil
}

func signedMessage(envelope Envelope) []byte {
	return []byte(strings.Join([]string{
		envelope.Format,
		envelope.Operation,
		envelope.Nonce,
		envelope.ExpiresAt,
		fmt.Sprint(envelope.ExpectedGeneration),
		envelope.PayloadSHA256,
		envelope.KeyID,
	}, "\x00"))
}
