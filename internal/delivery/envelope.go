package delivery

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
)

const (
	MaxEnvelopeBytes = 1 << 20
	MaxPayloadBytes  = 512 << 10
)

var allowedOperations = map[string]bool{
	"VERIFY_ONLY":         true,
	"INSTALL_SUBSTRATE":   true,
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

type UnsignedEnvelopeInput struct {
	Operation          string
	Payload            json.RawMessage
	KeyID              string
	ExpectedGeneration uint64
	Nonce              [32]byte
	ExpiresAt          time.Time
}

type VerifiedRequest struct {
	Envelope Envelope
	Payload  []byte
}

func NewUnsignedEnvelope(input UnsignedEnvelopeInput, now time.Time) (Envelope, error) {
	if input.Operation != "VERIFY_ONLY" || input.KeyID == "" || input.ExpectedGeneration == 0 {
		return Envelope{}, errors.New("ENVELOPE_INPUT")
	}
	if len(input.Payload) == 0 || len(input.Payload) > MaxPayloadBytes || !json.Valid(input.Payload) {
		return Envelope{}, errors.New("ENVELOPE_PAYLOAD")
	}
	if input.Nonce == [32]byte{} {
		return Envelope{}, errors.New("ENVELOPE_NONCE")
	}
	expiresAt := input.ExpiresAt.UTC()
	if !expiresAt.After(now.UTC()) || expiresAt.Sub(now.UTC()) > 5*time.Minute {
		return Envelope{}, errors.New("ENVELOPE_EXPIRY")
	}
	digest := sha256.Sum256(input.Payload)
	return Envelope{
		Format:             "munjib-release-envelope-v1",
		Operation:          input.Operation,
		Nonce:              base64.RawURLEncoding.EncodeToString(input.Nonce[:]),
		ExpiresAt:          expiresAt.Format(time.RFC3339Nano),
		ExpectedGeneration: input.ExpectedGeneration,
		Payload:            append(json.RawMessage(nil), input.Payload...),
		PayloadSHA256:      hex.EncodeToString(digest[:]),
		KeyID:              input.KeyID,
	}, nil
}

func SignedMessage(envelope Envelope) ([]byte, error) {
	if envelope.Format != "munjib-release-envelope-v1" || !allowedOperations[envelope.Operation] ||
		envelope.KeyID == "" || envelope.ExpectedGeneration == 0 || len(envelope.PayloadSHA256) != 64 {
		return nil, errors.New("ENVELOPE_SIGNING_FIELDS")
	}
	return []byte(strings.Join([]string{
		envelope.Format,
		envelope.Operation,
		envelope.Nonce,
		envelope.ExpiresAt,
		fmt.Sprint(envelope.ExpectedGeneration),
		envelope.PayloadSHA256,
		envelope.KeyID,
	}, "\x00")), nil
}

func ValidateExpectedGeneration(envelope Envelope, configured uint64) error {
	if configured == 0 || envelope.ExpectedGeneration != configured {
		return errors.New("ENVELOPE_GENERATION")
	}
	return nil
}

func VerifyEnvelope(raw []byte, publicKey ed25519.PublicKey, now time.Time) (VerifiedRequest, error) {
	if len(raw) == 0 || len(raw) > MaxEnvelopeBytes {
		return VerifiedRequest{}, errors.New("ENVELOPE_SIZE")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var envelope Envelope
	if err := decoder.Decode(&envelope); err != nil {
		return VerifiedRequest{}, fmt.Errorf("ENVELOPE_JSON: %w", err)
	}
	var trailing struct{}
	if err := decoder.Decode(&trailing); err != io.EOF {
		return VerifiedRequest{}, errors.New("ENVELOPE_TRAILING_DATA")
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
	message, err := SignedMessage(envelope)
	if err != nil {
		return VerifiedRequest{}, err
	}
	if !ed25519.Verify(publicKey, message, signature) {
		return VerifiedRequest{}, errors.New("ENVELOPE_SIGNATURE_INVALID")
	}
	return VerifiedRequest{Envelope: envelope, Payload: append([]byte(nil), envelope.Payload...)}, nil
}
