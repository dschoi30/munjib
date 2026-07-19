# Vault Transit Release Signer Local Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only, digest-pinned Vault Community Transit lab whose real Ed25519 signatures produce Munjib `VERIFY_ONLY` envelopes accepted by the existing verifier and rejected by the existing generation policy when mismatched.

**Architecture:** `internal/delivery` owns the only canonical envelope-message implementation; `internal/releasesigner` owns strict Vault HTTP/signature/public-key normalization; `cmd/munjib-release-sign` exposes `sign` and `public-key` commands without accepting secrets as arguments. A separate `deploy/vault-lab` Compose project and shell harness starts an ephemeral loopback-only Vault dev server, bootstraps Transit, and runs opt-in integration tests.

**Tech Stack:** Go 1.22 standard library, Vault Community Transit, Docker Compose, Bash, existing Vitest wiki/CI contract tests, pnpm 10.28.1.

## Global Constraints

- Phase A is local-only; do not install or configure production OCI, Cloudflare, broker substrate, or production keys.
- Merge `origin/main` after the approved design commit and before implementation because the feature branch predates the delivery-envelope code.
- Do not stage or modify `.lazyweb/`, `.pnpm-store/`, `pnpm-workspace.yaml`, or `wiki/raw/`.
- Keep canonical signed-message construction exclusively in `internal/delivery`.
- Add no production dependency; use Go 1.22 standard-library HTTP/JSON/crypto packages.
- Require `VAULT_LAB_IMAGE` in exact `repository:version@sha256:` plus 64 lowercase hexadecimal characters; the initial verified coordinate is `docker.io/hashicorp/vault:2.0.3@sha256:a296a888b118615dc01d5f1a6846e6d4a7277946caaed5b447008fff5fe06b54`.
- Bind Vault only to `127.0.0.1:18200`; local dev mode is never production evidence.
- Never persist or print Vault tokens, unseal material, private keys, signature bodies, or raw Vault error bodies.
- Sign only `VERIFY_ONLY` envelopes; timeout is 10 seconds, redirects and automatic retries are forbidden.
- General tests must not silently skip or depend on Docker; Docker integration has its own explicit command.

---

### Task 1: Integrate the merged delivery baseline

**Files:**
- Preserve: `docs/superpowers/specs/2026-07-18-vault-transit-release-signer-local-lab-design.md`
- Preserve: `wiki/Release Signer And Vault Workflow.md`
- Merge from: `origin/main`

**Interfaces:**
- Consumes: merge commit `394cc9b833f2340e41536d8a1bb36428477dcf55` or its descendant on `origin/main`.
- Produces: branch containing `internal/delivery/envelope.go`, the three release commands, delivery bundle v2 validation, and the approved Issue #208 design.

- [ ] **Step 1: Confirm only known user-owned untracked paths remain**

Run:

```bash
git status --short --branch
```

Expected: branch is `issue-208-vault-transit-release-signer-adapter-and-local-community-lab`; tracked tree is clean; only `.lazyweb/`, `.pnpm-store/`, `pnpm-workspace.yaml`, and `wiki/raw/` may be untracked.

- [ ] **Step 2: Fetch and merge main without touching untracked paths**

Run:

```bash
git fetch origin main
git merge --no-edit origin/main
```

Expected: merge succeeds and retains the Issue #208 spec/wiki page. If a wiki conflict occurs, preserve main's current deploy facts and the Issue #208 Vault link/temporary same-OCI gate.

- [ ] **Step 3: Verify the delivery baseline before feature edits**

Run:

```bash
go test ./internal/delivery ./cmd/munjib-release-broker ./cmd/munjib-release-submit ./cmd/munjib-release-verify
pnpm exec vitest run tests/deploy/delivery-bundle.test.ts tests/deploy/delivery-substrate-contract.test.ts tests/github-actions/ci-cd.test.ts
```

Expected: all existing Go packages compile and all selected Vitest contracts pass.

- [ ] **Step 4: Record the merge boundary**

Run:

```bash
git log --oneline --decorate -3
```

Expected: the Issue #208 branch includes both `b205a55` and current `origin/main`. The merge commit itself is the task boundary; do not create an empty follow-up commit.

---

### Task 2: Make delivery envelope creation and generation policy testable

**Files:**
- Modify: `internal/delivery/envelope.go`
- Create: `internal/delivery/envelope_test.go`
- Modify: `cmd/munjib-release-broker/main.go`

**Interfaces:**
- Consumes: existing `delivery.Envelope`, `VerifyEnvelope`, payload and envelope size limits.
- Produces: `UnsignedEnvelopeInput`, `NewUnsignedEnvelope`, `SignedMessage`, and `ValidateExpectedGeneration` for the signer and broker.

- [ ] **Step 1: Write failing canonical-envelope tests**

Create `internal/delivery/envelope_test.go` with deterministic inputs and these assertions:

```go
func TestNewUnsignedEnvelopeAndSignedMessage(t *testing.T) {
    now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
    var nonce [32]byte
    for index := range nonce { nonce[index] = byte(index) }
    envelope, err := NewUnsignedEnvelope(UnsignedEnvelopeInput{
        Operation: "VERIFY_ONLY", Payload: json.RawMessage(`{"bundle":"sha256:abc"}`),
        KeyID: "munjib-release-lab-v1", ExpectedGeneration: 1,
        Nonce: nonce, ExpiresAt: now.Add(2 * time.Minute),
    }, now)
    if err != nil { t.Fatal(err) }
    message, err := SignedMessage(envelope)
    if err != nil { t.Fatal(err) }
    expected := strings.Join([]string{
        "munjib-release-envelope-v1", "VERIFY_ONLY",
        base64.RawURLEncoding.EncodeToString(nonce[:]), envelope.ExpiresAt,
        "1", envelope.PayloadSHA256, "munjib-release-lab-v1",
    }, "\x00")
    if string(message) != expected { t.Fatalf("message mismatch: %q", message) }
}

func TestNewUnsignedEnvelopeRejectsUnsafeInput(t *testing.T) {
    // Table cases: non-VERIFY_ONLY operation, empty/oversized/invalid JSON payload,
    // empty key ID, zero generation, zero nonce, expired expiry, and expiry > 5m.
}

func TestValidateExpectedGeneration(t *testing.T) {
    envelope := Envelope{ExpectedGeneration: 2}
    if ValidateExpectedGeneration(envelope, 2) != nil { t.Fatal("matching generation rejected") }
    if ValidateExpectedGeneration(envelope, 1) == nil { t.Fatal("mismatch accepted") }
}
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
go test ./internal/delivery -run 'Test(NewUnsignedEnvelope|ValidateExpectedGeneration)' -v
```

Expected: compile failure because the new types/functions do not exist.

- [ ] **Step 3: Implement the minimal shared envelope API**

Add to `internal/delivery/envelope.go`:

```go
type UnsignedEnvelopeInput struct {
    Operation string
    Payload json.RawMessage
    KeyID string
    ExpectedGeneration uint64
    Nonce [32]byte
    ExpiresAt time.Time
}

func NewUnsignedEnvelope(input UnsignedEnvelopeInput, now time.Time) (Envelope, error) {
    if input.Operation != "VERIFY_ONLY" || input.KeyID == "" || input.ExpectedGeneration == 0 {
        return Envelope{}, errors.New("ENVELOPE_INPUT")
    }
    if len(input.Payload) == 0 || len(input.Payload) > MaxPayloadBytes || !json.Valid(input.Payload) {
        return Envelope{}, errors.New("ENVELOPE_PAYLOAD")
    }
    if input.Nonce == [32]byte{} { return Envelope{}, errors.New("ENVELOPE_NONCE") }
    expiresAt := input.ExpiresAt.UTC()
    if !expiresAt.After(now.UTC()) || expiresAt.Sub(now.UTC()) > 5*time.Minute {
        return Envelope{}, errors.New("ENVELOPE_EXPIRY")
    }
    digest := sha256.Sum256(input.Payload)
    return Envelope{
        Format: "munjib-release-envelope-v1", Operation: input.Operation,
        Nonce: base64.RawURLEncoding.EncodeToString(input.Nonce[:]),
        ExpiresAt: expiresAt.Format(time.RFC3339Nano),
        ExpectedGeneration: input.ExpectedGeneration,
        Payload: append(json.RawMessage(nil), input.Payload...),
        PayloadSHA256: hex.EncodeToString(digest[:]), KeyID: input.KeyID,
    }, nil
}

func SignedMessage(envelope Envelope) ([]byte, error) {
    if envelope.Format != "munjib-release-envelope-v1" || envelope.Operation != "VERIFY_ONLY" ||
        envelope.KeyID == "" || envelope.ExpectedGeneration == 0 || len(envelope.PayloadSHA256) != 64 {
        return nil, errors.New("ENVELOPE_SIGNING_FIELDS")
    }
    return []byte(strings.Join([]string{envelope.Format, envelope.Operation, envelope.Nonce,
        envelope.ExpiresAt, fmt.Sprint(envelope.ExpectedGeneration), envelope.PayloadSHA256,
        envelope.KeyID}, "\x00")), nil
}

func ValidateExpectedGeneration(envelope Envelope, configured uint64) error {
    if configured == 0 || envelope.ExpectedGeneration != configured {
        return errors.New("ENVELOPE_GENERATION")
    }
    return nil
}
```

Make `VerifyEnvelope` call `SignedMessage` instead of the private `signedMessage`. Make broker admission call `ValidateExpectedGeneration` rather than comparing integers inline. Remove the private duplicate.

- [ ] **Step 4: Run focused and package tests GREEN**

Run:

```bash
gofmt -w internal/delivery/envelope.go internal/delivery/envelope_test.go cmd/munjib-release-broker/main.go
go test ./internal/delivery ./cmd/munjib-release-broker -v
```

Expected: all tests pass, including unsafe-input and mismatch cases.

- [ ] **Step 5: Commit the canonical boundary**

Run:

```bash
git add internal/delivery/envelope.go internal/delivery/envelope_test.go cmd/munjib-release-broker/main.go wiki/log.md
git commit -m "feat: expose canonical release envelope signing"
```

Before staging, append a public-safe `wiki/log.md` entry naming the canonical API and generation-policy refactor without claiming Vault integration exists.

---

### Task 3: Implement a strict Vault Transit client

**Files:**
- Create: `internal/releasesigner/transit.go`
- Create: `internal/releasesigner/transit_test.go`

**Interfaces:**
- Consumes: `context.Context`, a validated `*url.URL`, injected `*http.Client`, Vault token, key name, and canonical message bytes.
- Produces: `TransitClient.Sign(ctx, keyName, message) ([]byte, uint64, error)` and `TransitClient.PublicKey(ctx, keyName, version) (ed25519.PublicKey, error)`.

- [ ] **Step 1: Write failing Vault request/response tests**

Create a real `httptest.Server` suite covering:

```go
func TestTransitClientSign(t *testing.T) {
    signature := bytes.Repeat([]byte{0x42}, ed25519.SignatureSize)
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost || r.URL.Path != "/v1/transit/sign/munjib-release-lab-v1" { t.Fatalf("unexpected request") }
        if r.Header.Get("X-Vault-Token") != "test-token" { t.Fatal("missing token") }
        var body struct { Input string `json:"input"`; Prehashed bool `json:"prehashed"`; SignatureAlgorithm string `json:"signature_algorithm"` }
        if json.NewDecoder(r.Body).Decode(&body) != nil { t.Fatal("invalid body") }
        if body.Input != base64.StdEncoding.EncodeToString([]byte("message")) || body.Prehashed || body.SignatureAlgorithm != "ed25519" { t.Fatalf("bad body: %#v", body) }
        json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"signature": "vault:v3:" + base64.StdEncoding.EncodeToString(signature)}})
    }))
    defer server.Close()
    client := newTestTransitClient(t, server.URL, "test-token")
    got, version, err := client.Sign(context.Background(), "munjib-release-lab-v1", []byte("message"))
    if err != nil || version != 3 || !bytes.Equal(got, signature) { t.Fatalf("unexpected result") }
}
```

Add table tests for malformed key names, remote plaintext HTTP, redirects, non-2xx, unknown fields, raw response-body redaction, malformed `vault:vN`, zero/non-numeric versions, invalid base64, non-64-byte signatures, missing token, and canceled/timeout contexts. Add public-key response tests accepting either standard-base64 raw 32-byte Ed25519 bytes or standard-base64 DER SubjectPublicKeyInfo that `x509.ParsePKIXPublicKey` identifies as `ed25519.PublicKey`; reject PEM/OpenSSH, non-Ed25519 DER, wrong version, and wrong size.

- [ ] **Step 2: Run Transit tests and confirm RED**

Run:

```bash
go test ./internal/releasesigner -v
```

Expected: package or symbols do not exist.

- [ ] **Step 3: Implement the fail-closed client**

Implement `TransitClient` with:

```go
type TransitClient struct {
    Address *url.URL
    HTTPClient *http.Client
    Token string
}

func NewTransitClient(rawAddress, token string) (TransitClient, error) {
    // Parse URL; permit http only for loopback; require https otherwise.
    // Clone http.DefaultTransport, set a 10s client timeout, and reject redirects.
}
```

For every JSON response use `json.Decoder.DisallowUnknownFields()` and require EOF after one object. Limit response bodies to 64 KiB. Validate key names with `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`. Return stable errors such as `VAULT_CONFIG`, `VAULT_REQUEST`, `VAULT_RESPONSE`, `VAULT_SIGNATURE`, and `VAULT_PUBLIC_KEY`; never interpolate token, signature, public key, URL query, or body content.

- [ ] **Step 4: Run Transit tests GREEN and race-check**

Run:

```bash
gofmt -w internal/releasesigner/transit.go internal/releasesigner/transit_test.go
go test -race ./internal/releasesigner -v
```

Expected: all success, redaction, timeout, redirect, parser, and key tests pass with race detector clean.

- [ ] **Step 5: Commit the Vault client**

Run:

```bash
git add internal/releasesigner/transit.go internal/releasesigner/transit_test.go wiki/log.md
git commit -m "feat: add fail-closed Vault Transit client"
```

Append a wiki log entry that describes only the tested HTTP/signature/public-key contract.

---

### Task 4: Build the release signer CLI

**Files:**
- Create: `cmd/munjib-release-sign/main.go`
- Create: `cmd/munjib-release-sign/main_test.go`

**Interfaces:**
- Consumes: `delivery.NewUnsignedEnvelope`, `delivery.SignedMessage`, `releasesigner.NewTransitClient`, `VAULT_ADDR`, and `VAULT_TOKEN`.
- Produces: `sign` command emitting one signed envelope JSON to stdout and `public-key` command atomically writing a raw 32-byte public key file.

- [ ] **Step 1: Write failing CLI parsing and output tests**

Structure `main.go` around a testable function:

```go
func run(ctx context.Context, args []string, getenv func(string) string, stdin io.Reader, stdout, stderr io.Writer, now func() time.Time, random io.Reader) int
```

Tests must cover:

```go
func TestRunSignOutputsVerifierCompatibleEnvelope(t *testing.T) {
    // httptest Vault returns an ed25519.Sign(privateKey, decoded input) signature.
    // run sign with --payload payload.json --key-name munjib-release-lab-v1
    // --key-id munjib-release-lab-v1 --generation 1 --ttl 2m.
    // Decode stdout, call delivery.VerifyEnvelope with the paired public key,
    // and assert stderr does not contain token/signature/private material.
}

func TestRunPublicKeyWritesRawKeyAtomically(t *testing.T) {
    // Vault key response version 1 -> --out temporary path.
    // Assert exact 32 bytes and mode 0400; existing symlink/output directory fails.
}
```

Add failure cases for secret flags, missing environment, non-JSON/oversized payload, generation zero, TTL outside `(0,5m]`, extra args, Vault failure, stdout contamination, and output overwrite.

- [ ] **Step 2: Run CLI tests and confirm RED**

Run:

```bash
go test ./cmd/munjib-release-sign -v
```

Expected: command package or `run` does not exist.

- [ ] **Step 3: Implement minimal `sign` and `public-key` subcommands**

Command contracts:

```text
munjib-release-sign sign --payload FILE --key-name NAME --key-id ID --generation UINT --ttl DURATION
munjib-release-sign public-key --key-name NAME --version UINT --out FILE
```

Use `crypto/rand.Reader` for nonce, `time.Now().UTC`, `json.Encoder` for one stdout envelope, `os.OpenFile` with `O_CREATE|O_EXCL|O_WRONLY` and `0400` for public-key output, and exit codes `64` for usage, `65` for input, `69` for Vault unavailable/invalid response, and `74` for output failure. `main` calls `os.Exit(run(...))`.

- [ ] **Step 4: Run CLI tests and cross-build GREEN**

Run:

```bash
gofmt -w cmd/munjib-release-sign/main.go cmd/munjib-release-sign/main_test.go
go test -race ./internal/delivery ./internal/releasesigner ./cmd/munjib-release-sign -v
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -o /tmp/munjib-release-sign-linux-arm64 ./cmd/munjib-release-sign
```

Expected: tests pass and Linux/ARM64 binary builds without cgo.

- [ ] **Step 5: Commit the CLI**

Run:

```bash
git add cmd/munjib-release-sign/main.go cmd/munjib-release-sign/main_test.go wiki/log.md
git commit -m "feat: add Vault-backed release signer CLI"
```

Do not add the `/tmp` binary or any test token/output key.

---

### Task 5: Add the digest-pinned local Vault lab and real integration proof

**Files:**
- Create: `deploy/vault-lab/compose.yml`
- Create: `deploy/vault-lab/vault-lab.hcl`
- Create: `deploy/vault-lab/.env.example`
- Create: `scripts/vault-lab/common.sh`
- Create: `scripts/vault-lab/up.sh`
- Create: `scripts/vault-lab/bootstrap.sh`
- Create: `scripts/vault-lab/integration.sh`
- Create: `scripts/vault-lab/down.sh`
- Create: `tests/deploy/vault-lab-contract.test.ts`
- Modify: `package.json`
- Modify: `wiki/Release Signer And Vault Workflow.md`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: `VAULT_LAB_IMAGE`, Docker Compose, CLI from Task 4, lab key `munjib-release-lab-v1`.
- Produces: explicit `vault:lab:up`, `vault:lab:bootstrap`, `vault:lab:test`, and `vault:lab:down` commands plus real positive/tamper/expiry/generation/wrong-key evidence.

- [ ] **Step 1: Write the failing static lab contract test**

Create `tests/deploy/vault-lab-contract.test.ts` asserting:

```ts
it("keeps the Vault lab digest-pinned, loopback-only, and credential-free", () => {
  const compose = readFileSync("deploy/vault-lab/compose.yml", "utf8");
  expect(compose).toContain("${VAULT_LAB_IMAGE:?");
  expect(compose).toContain("127.0.0.1:18200:8200");
  expect(compose).not.toMatch(/VAULT_TOKEN|VAULT_DEV_ROOT_TOKEN_ID:|8200:8200/);
  expect(readFileSync("deploy/vault-lab/.env.example", "utf8")).not.toMatch(/token|secret|unseal/i);
});

it("exposes explicit non-production lifecycle scripts", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  expect(scripts).toMatchObject({
    "vault:lab:up": "bash scripts/vault-lab/up.sh",
    "vault:lab:bootstrap": "bash scripts/vault-lab/bootstrap.sh",
    "vault:lab:test": "bash scripts/vault-lab/integration.sh",
    "vault:lab:down": "bash scripts/vault-lab/down.sh",
  });
});
```

- [ ] **Step 2: Run the contract test and confirm RED**

Run:

```bash
pnpm exec vitest run tests/deploy/vault-lab-contract.test.ts
```

Expected: missing compose/scripts/package commands.

- [ ] **Step 3: Implement Compose and lifecycle scripts**

`compose.yml` must use:

```yaml
services:
  vault:
    image: "${VAULT_LAB_IMAGE:?set repository:version@sha256 digest}"
    command: ["server", "-dev", "-dev-listen-address=0.0.0.0:8200"]
    ports:
      - "127.0.0.1:18200:8200"
    volumes:
      - ./vault-lab.hcl:/vault/config/vault-lab.hcl:ro
    healthcheck:
      test: ["CMD", "vault", "status", "-address=http://127.0.0.1:8200"]
      interval: 2s
      timeout: 2s
      retries: 30
```

The base Compose file contains no token. `up.sh` creates a random test-only token, writes a mode-0600 generated override under a `mktemp -d` directory with `VAULT_DEV_ROOT_TOKEN_ID` set only for the container, passes it with `docker compose -f compose.yml -f "$override"`, exports the same value only to child lifecycle commands, and registers cleanup traps. `common.sh` rejects an image not matching `^[^[:space:]@]+:[^[:space:]@]+@sha256:[a-f0-9]{64}$`, exports only loopback `VAULT_ADDR`, and redacts command failures.

`bootstrap.sh` calls Vault HTTP APIs (or `docker compose exec vault vault ...`) to enable `transit/`, creates an Ed25519 key with export/plaintext-backup/deletion disabled, and treats already-enabled/already-created state idempotently without printing response bodies.

- [ ] **Step 4: Write the integration harness before running it**

`integration.sh` must:

```bash
set -euo pipefail
# Create a private mktemp directory and trap down/cleanup.
# Start and bootstrap Vault.
# Build munjib-release-sign and a small Go verifier harness from repository source.
# Sign a fixed payload with generation 1 and TTL 2m.
# Fetch raw public key version 1 to a mode-0400 file.
# Verify positive envelope.
# Mutate payload while keeping signature -> expect ENVELOPE_PAYLOAD_HASH or signature failure.
# Sign with TTL 1s, wait 2s, then verify -> expect ENVELOPE_EXPIRY.
# Validate generation 1 against configured 2 -> expect ENVELOPE_GENERATION.
# Verify with a second Transit key/public key -> expect ENVELOPE_SIGNATURE_INVALID.
# Print only: VAULT_LAB_VERIFY_OK, VAULT_LAB_TAMPER_REJECT_OK,
# VAULT_LAB_EXPIRY_REJECT_OK, VAULT_LAB_GENERATION_REJECT_OK,
# VAULT_LAB_WRONG_KEY_REJECT_OK.
```

Do not log `set -x`, tokens, request bodies, signatures, public keys, or temporary paths.

- [ ] **Step 5: Run static contracts GREEN**

Run:

```bash
pnpm exec vitest run tests/deploy/vault-lab-contract.test.ts tests/deploy/delivery-substrate-contract.test.ts
bash -n scripts/vault-lab/common.sh scripts/vault-lab/up.sh scripts/vault-lab/bootstrap.sh scripts/vault-lab/integration.sh scripts/vault-lab/down.sh
docker compose -f deploy/vault-lab/compose.yml config
```

Expected: Vitest and shell syntax pass; Compose config succeeds only when a valid digest-pinned `VAULT_LAB_IMAGE` is supplied and contains only loopback publication.

- [ ] **Step 6: Run the real Docker integration GREEN**

Resolve an approved local image to a digest before invoking the test:

```bash
export VAULT_LAB_IMAGE='docker.io/hashicorp/vault:2.0.3@sha256:a296a888b118615dc01d5f1a6846e6d4a7277946caaed5b447008fff5fe06b54'
pnpm vault:lab:test
```

Expected stdout contains exactly the five `_OK` evidence lines and no token/key/signature material. Record the resolved repository, version, and digest in the PR body, not in generated secret files.

- [ ] **Step 7: Update durable wiki evidence**

In `wiki/Release Signer And Vault Workflow.md`, change Phase A from planned to implemented only for commands and evidence actually produced. Keep same-OCI production bootstrap and Issue #185 independent attestation explicitly incomplete. Add exact package commands, image digest evidence location, error redaction rules, and the five integration outcomes. Update related CI page/index/log and regenerate manifest.

- [ ] **Step 8: Run full verification**

Run:

```bash
go test -race ./...
pnpm test
pnpm exec tsc --noEmit
pnpm run build
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --check
```

Expected: all commands exit 0; only the existing unresolved sidebar pasted-image wiki warning may remain. If untracked `wiki/raw/` still blocks wiki tooling, reproduce the selected staged tree in a temporary detached worktree and run the same manifest/lint/sync commands there without moving or editing `wiki/raw/`.

- [ ] **Step 9: Commit, push, and complete PR review workflow**

Run:

```bash
git add internal/delivery internal/releasesigner cmd/munjib-release-sign deploy/vault-lab scripts/vault-lab tests/deploy/vault-lab-contract.test.ts package.json wiki docs/superpowers/plans/2026-07-18-vault-transit-release-signer-local-lab.md
git commit -m "feat: add Vault Transit release signer lab"
git push origin issue-208-vault-transit-release-signer-adapter-and-local-community-lab
gh pr create --title "Add Vault Transit release signer local lab" --body-file /tmp/issue-208-pr-body.md
gh pr ready
```

The PR body must link Issue #208, list the five integration outcomes, state the exact Vault image version/digest, state that no production key/OCI mutation occurred, and keep Issue #185 open. Wait at least five minutes, inspect CI and unresolved review threads, fix every actionable issue on the same branch, and repeat until CI is green and all threads are resolved. Do not merge without the user's explicit merge authorization if it has not already been given for this PR.

---

## Plan self-review

- Spec coverage: Tasks 2–5 cover canonicalization, Vault signing/public-key normalization, CLI secrecy, digest pinning, loopback binding, real integration, generation policy, docs, and PR verification.
- Scope: production OCI, Cloudflare, production key custody, host bootstrap, and Issue #185 attestation remain excluded.
- Type consistency: `UnsignedEnvelopeInput`, `NewUnsignedEnvelope`, `SignedMessage`, `ValidateExpectedGeneration`, `TransitClient.Sign`, and `TransitClient.PublicKey` have one spelling and signature throughout.
- Placeholder scan: no incomplete implementation values remain; the initial Vault 2.0.3 multi-architecture manifest digest is explicit and scripts still validate it at runtime.
