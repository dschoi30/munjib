package delivery

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestNewUnsignedEnvelopeCanonicalizesPayloadBeforeHashing(t *testing.T) {
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	var nonce [32]byte
	nonce[0] = 1
	payload := json.RawMessage("{\n  \"html\": \"<tag>\",\n  \"nested\": { \"x\": 1 }\n}\n")
	envelope, err := NewUnsignedEnvelope(UnsignedEnvelopeInput{
		Operation: "VERIFY_ONLY", Payload: payload, KeyID: "key", ExpectedGeneration: 1,
		Nonce: nonce, ExpiresAt: now.Add(time.Minute),
	}, now)
	if err != nil {
		t.Fatal(err)
	}
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	message, err := SignedMessage(envelope)
	if err != nil {
		t.Fatal(err)
	}
	envelope.Signature = base64.RawURLEncoding.EncodeToString(ed25519.Sign(privateKey, message))
	raw, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	verified, err := VerifyEnvelope(raw, publicKey, now)
	if err != nil {
		t.Fatal(err)
	}
	if string(verified.Payload) != `{"html":"\u003ctag\u003e","nested":{"x":1}}` {
		t.Fatalf("payload=%s", verified.Payload)
	}
}

func TestNewUnsignedEnvelopeAndSignedMessage(t *testing.T) {
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	var nonce [32]byte
	for index := range nonce {
		nonce[index] = byte(index)
	}
	envelope, err := NewUnsignedEnvelope(UnsignedEnvelopeInput{
		Operation: "VERIFY_ONLY", Payload: json.RawMessage(`{"bundle":"sha256:abc"}`),
		KeyID: "munjib-release-lab-v1", ExpectedGeneration: 1,
		Nonce: nonce, ExpiresAt: now.Add(2 * time.Minute),
	}, now)
	if err != nil {
		t.Fatal(err)
	}
	message, err := SignedMessage(envelope)
	if err != nil {
		t.Fatal(err)
	}
	expected := strings.Join([]string{
		"munjib-release-envelope-v1", "VERIFY_ONLY",
		base64.RawURLEncoding.EncodeToString(nonce[:]), envelope.ExpiresAt,
		"1", envelope.PayloadSHA256, "munjib-release-lab-v1",
	}, "\x00")
	if string(message) != expected {
		t.Fatalf("message mismatch: %q", message)
	}
}

func TestNewUnsignedEnvelopeRejectsUnsafeInput(t *testing.T) {
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	var nonce [32]byte
	nonce[0] = 1
	valid := UnsignedEnvelopeInput{
		Operation: "VERIFY_ONLY", Payload: json.RawMessage(`{"bundle":"sha256:abc"}`),
		KeyID: "munjib-release-lab-v1", ExpectedGeneration: 1,
		Nonce: nonce, ExpiresAt: now.Add(2 * time.Minute),
	}
	tests := []struct {
		name   string
		mutate func(*UnsignedEnvelopeInput)
	}{
		{name: "non-VERIFY_ONLY operation", mutate: func(input *UnsignedEnvelopeInput) { input.Operation = "INSTALL_SUBSTRATE" }},
		{name: "empty payload", mutate: func(input *UnsignedEnvelopeInput) { input.Payload = nil }},
		{name: "oversized payload", mutate: func(input *UnsignedEnvelopeInput) {
			input.Payload = json.RawMessage(strings.Repeat(" ", MaxPayloadBytes+1))
		}},
		{name: "invalid JSON payload", mutate: func(input *UnsignedEnvelopeInput) { input.Payload = json.RawMessage(`{"bundle":`) }},
		{name: "empty key ID", mutate: func(input *UnsignedEnvelopeInput) { input.KeyID = "" }},
		{name: "zero generation", mutate: func(input *UnsignedEnvelopeInput) { input.ExpectedGeneration = 0 }},
		{name: "zero nonce", mutate: func(input *UnsignedEnvelopeInput) { input.Nonce = [32]byte{} }},
		{name: "expired expiry", mutate: func(input *UnsignedEnvelopeInput) { input.ExpiresAt = now }},
		{name: "expiry beyond five minutes", mutate: func(input *UnsignedEnvelopeInput) { input.ExpiresAt = now.Add(5*time.Minute + time.Nanosecond) }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := valid
			test.mutate(&input)
			if _, err := NewUnsignedEnvelope(input, now); err == nil {
				t.Fatal("unsafe input accepted")
			}
		})
	}
}

func TestValidateExpectedGeneration(t *testing.T) {
	envelope := Envelope{ExpectedGeneration: 2}
	if ValidateExpectedGeneration(envelope, 2) != nil {
		t.Fatal("matching generation rejected")
	}
	if ValidateExpectedGeneration(envelope, 1) == nil {
		t.Fatal("mismatch accepted")
	}
}

func TestSignedMessageCanonicalizesEveryAdmittedOperation(t *testing.T) {
	for _, operation := range []string{"VERIFY_ONLY", "INSTALL_SUBSTRATE", "RECONCILE_SUBSTRATE"} {
		envelope := Envelope{
			Format: "munjib-release-envelope-v1", Operation: operation, Nonce: "nonce",
			ExpiresAt: "2026-07-18T12:02:00Z", ExpectedGeneration: 1,
			PayloadSHA256: strings.Repeat("a", 64), KeyID: "key",
		}
		if _, err := SignedMessage(envelope); err != nil {
			t.Fatalf("operation %s: %v", operation, err)
		}
	}
}
