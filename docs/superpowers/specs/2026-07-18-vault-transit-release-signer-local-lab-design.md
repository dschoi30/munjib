# Vault Transit Release Signer Local Lab Design

## Scope

Issue #208의 첫 구현 단위는 로컬 Mac에서만 실행되는 Vault Community Transit signer lab과 Munjib release-envelope adapter다. 이 단위는 실제 Vault Transit Ed25519 서명이 기존 Go verifier의 `VERIFY_ONLY` 계약을 통과하고, 변조·만료·generation 불일치 입력이 실패하는 것을 재현 가능하게 증명한다.

이 범위에는 production OCI 설치, production key 생성, Cloudflare Tunnel, host trust-key 교체, broker 설치, `INSTALL_SUBSTRATE`, `RECONCILE_SUBSTRATE`가 포함되지 않는다. 로컬 결과는 production attestation으로 취급하지 않는다.

## Prerequisite

현재 `issue-208-vault-transit-release-signer-adapter-and-local-community-lab` 브랜치는 release-envelope 코드가 합쳐지기 전 커밋에서 분기됐다. 설계 커밋이 사용자 검토를 통과하면 `origin/main`을 이 브랜치에 병합한 다음 구현한다. 현재 작업 트리의 `.lazyweb/`, `.pnpm-store/`, `pnpm-workspace.yaml`, `wiki/raw/`는 Issue #208 구현 범위 밖이며 스테이징하거나 수정하지 않는다.

## Considered approaches

### 1. Go adapter reusing the delivery package — selected

Go package가 unsigned envelope 생성과 canonical signed-message 생성을 소유하고, CLI가 Vault HTTP API를 호출한다. 기존 verifier와 같은 타입 및 canonicalization 함수를 사용하므로 NUL delimiter, timestamp, digest, key ID가 서로 어긋날 위험이 가장 작다. 표준 라이브러리만으로 구현할 수 있어 새 production dependency도 필요 없다.

### 2. TypeScript adapter

현재 CI와 bundle tooling이 TypeScript이므로 연결은 쉽지만, Go verifier의 canonicalization을 별도로 복제해야 한다. 두 구현이 독립적으로 변경될 때 서명 계약이 조용히 갈라질 수 있으므로 선택하지 않는다.

### 3. Vault CLI와 shell 중심 adapter

lab bootstrap에는 편리하지만 JSON parsing, canonical bytes, signature conversion, 오류 분류가 shell에 흩어진다. 테스트 가능한 라이브러리 경계가 약하고 Vault CLI 출력 변화에 민감하므로 bootstrap 보조 용도로만 제한한다.

## Architecture

구성 요소는 네 개로 분리한다.

1. `internal/delivery`는 unsigned `VERIFY_ONLY` envelope 생성과 canonical signed-message bytes를 제공한다.
2. `internal/releasesigner`는 Vault Transit HTTP 요청·응답과 signature/public-key 정규화를 담당한다.
3. `cmd/munjib-release-sign`은 payload 파일과 명시적 metadata를 받아 signed envelope JSON을 stdout으로 출력한다.
4. `deploy/vault-lab`은 digest-pinned Vault Community 컨테이너, ephemeral dev-mode storage, Transit mount/key bootstrap을 제공한다.

Vault image는 `VAULT_LAB_IMAGE`에 `repository:version@sha256:digest` 전체 값을 요구한다. Compose나 `.env.example`에 token, unseal key, private key를 저장하지 않는다. lab은 `127.0.0.1:18200`에만 bind하고, 고정된 test-only root token은 실행 프로세스 환경에서만 주입한다. production은 dev mode를 사용할 수 없다.

## Data flow

1. bootstrap 스크립트가 local Vault health를 확인하고 Transit을 enable한 뒤 `munjib-release-lab-v1` Ed25519 key를 `exportable=false`, `allow_plaintext_backup=false`, `deletion_allowed=false`로 만든다.
2. signer CLI가 payload raw JSON bytes의 SHA-256을 계산하고 32-byte random nonce, RFC3339Nano expiry, `expectedGeneration`, `keyId`를 포함한 unsigned envelope를 만든다.
3. `internal/delivery`가 verifier와 동일한 NUL-delimited canonical message를 생성한다.
4. adapter가 message를 standard base64로 인코딩해 `POST /v1/transit/sign/munjib-release-lab-v1`에 `prehashed=false`, `signature_algorithm=ed25519`로 전달한다.
5. adapter가 `vault:vN:<base64>`를 엄격히 파싱하고 raw signature가 정확히 64 bytes인지 확인한 뒤 base64url-no-padding으로 envelope에 저장한다.
6. adapter가 `GET /v1/transit/keys/munjib-release-lab-v1`의 public key를 파싱해 raw 32-byte Ed25519 key로 정규화한다. OpenSSH 한 줄이나 PEM을 bootstrap 파일 형식으로 그대로 사용하지 않는다.
7. 기존 `delivery.VerifyEnvelope`와 Linux verifier CLI가 signed envelope의 서명·expiry·payload를 검증하고, broker policy contract가 `expectedGeneration` 일치를 검증한다.

## Interfaces

`internal/delivery`에 다음 공개 경계를 추가한다.

```go
type UnsignedEnvelopeInput struct {
    Operation          string
    Payload            json.RawMessage
    KeyID              string
    ExpectedGeneration uint64
    Nonce              [32]byte
    ExpiresAt          time.Time
}

func NewUnsignedEnvelope(input UnsignedEnvelopeInput, now time.Time) (Envelope, error)
func SignedMessage(envelope Envelope) ([]byte, error)
```

`NewUnsignedEnvelope`는 `VERIFY_ONLY`만 허용하고 expiry가 `now`보다 뒤이면서 5분 이내인지, payload size/key ID/nonce가 유효한지 검사한다. `SignedMessage`는 signature 필드를 제외한 verifier의 기존 canonical field 순서를 그대로 사용한다. 기존 verification 경로도 같은 함수를 호출하도록 바꿔 canonicalization 구현을 하나만 둔다.

`internal/releasesigner`는 다음 경계를 제공한다.

```go
type TransitClient struct {
    Address    *url.URL
    HTTPClient *http.Client
    Token      string
}

func (client TransitClient) Sign(ctx context.Context, keyName string, message []byte) (signature []byte, keyVersion uint64, err error)
func (client TransitClient) PublicKey(ctx context.Context, keyName string, keyVersion uint64) (ed25519.PublicKey, error)
```

CLI는 secret 값을 인자로 받지 않는다. `VAULT_ADDR`와 `VAULT_TOKEN`을 환경에서 읽되 오류 메시지, stdout, generated envelope에 token을 포함하지 않는다. stdout은 성공 시 envelope JSON 전용이며 상태 메시지는 stderr로 보낸다.

## Fail-closed behavior

- Vault 주소는 loopback HTTP 또는 검증되는 HTTPS만 허용한다. 임의 remote plaintext HTTP는 거부한다.
- HTTP client timeout은 10초로 고정하고 redirect를 거부한다.
- non-2xx response, unknown JSON fields, missing signature, malformed `vault:vN`, 잘못된 base64, 64-byte가 아닌 signature를 모두 실패 처리한다.
- requested key version과 public-key response version이 다르면 실패한다.
- nonce, token, signature, public key 또는 Vault response body를 오류 메시지에 포함하지 않는다.
- adapter는 retry하지 않는다. 재시도 정책은 향후 CI orchestration 범위이며 중복 audit event를 숨기지 않는다.
- 생성된 envelope operation은 항상 `VERIFY_ONLY`다.

## Test strategy

### Unit and contract tests

- delivery builder가 deterministic nonce/time 입력으로 verifier와 동일한 canonical message를 만든다.
- payload digest, nonce, expiry, generation, key ID validation이 fail closed다.
- Transit response parser가 valid Ed25519 signature와 key version을 반환한다.
- malformed prefix/version/base64/length, redirects, timeout, non-2xx, unexpected response shape가 실패한다.
- public-key parser가 Vault Ed25519 public key를 raw 32 bytes로 정규화하고 PEM/OpenSSH/잘못된 길이를 거부한다.
- CLI stdout에는 envelope만 있고 token이 stdout/stderr에 노출되지 않는다.

### Docker integration test

digest-pinned Vault Community lab을 기동하고 다음을 실행한다.

1. Transit enable 및 lab key bootstrap
2. signer CLI로 `VERIFY_ONLY` envelope 생성
3. 조회한 raw public key로 positive verification
4. payload tamper reject
5. expired envelope reject
6. broker policy contract의 wrong generation reject
7. wrong key/signature reject

Docker가 없으면 일반 `pnpm test`는 실패하거나 자동 skip하지 않는다. Docker integration은 별도 명령으로 명시적으로 실행하며, CI에 추가할 때는 Docker availability와 digest input을 workflow가 제공해야 한다.

## Repository changes

- Create `internal/releasesigner/transit.go` and focused Go tests.
- Modify `internal/delivery/envelope.go` and its tests to expose one canonical signing boundary.
- Create `cmd/munjib-release-sign/main.go` and CLI contract tests.
- Create `deploy/vault-lab/compose.yml`, `vault-lab.hcl`, `.env.example`, and bootstrap/test scripts.
- Add package scripts for lab up, bootstrap, integration test, and down without embedding credentials.
- Update [[Release Signer And Vault Workflow]], [[CI CD And Monitoring Workflow]], `wiki/index.md`, `wiki/log.md`, and `wiki/manifest.json` with implemented evidence only.

## Acceptance criteria

- No canonical-message implementation exists outside `internal/delivery`.
- A real local Vault Transit Ed25519 signature passes the existing Munjib verifier.
- Signature and public-key conversions enforce exact Ed25519 sizes.
- Tamper, expiry, generation, wrong-key, malformed Vault response, redirect, and timeout cases fail closed.
- No Vault token or private key is written to tracked files or command output.
- Vault binds to loopback only and requires a digest-pinned image reference.
- Local lab evidence is explicitly labeled non-production and does not close Issue #185.
- Targeted tests, full repository tests, TypeScript/build checks, Docker integration, wiki manifest/lint/sync checks, PR review, and CI all pass before merge.
