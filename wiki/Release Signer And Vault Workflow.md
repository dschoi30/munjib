---
id: workflow-release-signer-vault
title: Release Signer And Vault Workflow
type: workflow
status: active
summary: 1인 사이드 프로젝트의 release signer를 Vault Community로 운영한다. 초기 production은 Munjib production과 같은 OCI VM의 Docker Compose 단일 노드로 시작하되, 독립 attestation을 위한 별도 signer VM 승격 게이트를 명시한다.
created: 2026-07-17
updated: 2026-07-19
source_count: 18
tags:
  - munjib
  - security
  - deployment
  - release-signer
  - vault
  - docker-compose
  - cloudflare
links:
  - "[[index|Wiki Index]]"
  - "[[CI CD And Monitoring Workflow]]"
  - "[[Production Observability Workflow]]"
  - "[[Wiki Maintenance Automation]]"
---

# Release Signer And Vault Workflow

이 page는 Issue #185 delivery broker gate를 위해 bundle signer를 분리하고, signed artifact와 host `VERIFY_ONLY` attestation을 남기는 방법을 기록한다. 현재 Munjib은 1인 메인테이너 사이드 프로젝트이므로 Vault를 도입해도 두 사람 승인이나 인간 수준의 독립성이 자동으로 생기지는 않는다.

## Decision

현재 초기 구성은 **Vault Community를 현재 Munjib production과 같은 OCI VM의 Docker Compose에서 운영하는 것**이다.

1. 로컬 Mac에서는 Docker Compose Vault Community로 Transit Ed25519와 signer adapter를 테스트한다.
2. 초기 production signer는 현재 Munjib OCI VM에 Docker Compose, Raft Integrated Storage, TLS, ACL, audit를 구성한다.
3. 이 구성은 단일 노드이면서 Munjib과 signer가 같은 호스트 경계를 공유한다. signer가 일시적으로 중단되면 새 배포가 중단되지만 이미 실행 중인 Munjib 서비스에는 runtime dependency가 없다.
4. Cloudflare Tunnel과 Access Service Token은 public `8200` 노출을 없애는 선택적 보완책으로 사용한다. Cloudflare가 Vault key custody, backup, ACL, attestation을 대체하지는 않는다.
5. #185의 독립 attestation을 완료하거나 무중단 signer, DR replication, HSM, 규제 감사 또는 지원 SLA가 필요해지면 Vault 전용 OCI VM 또는 HCP Vault Dedicated/Enterprise 구조로 승격한다.

여기서 “단일 OCI”는 **현재 Munjib production이 실행 중인 OCI VM 한 대**를 의미한다. 이 구성은 초기 production 운영과 adapter 통합을 빠르게 검증하기 위한 단계이며, Munjib 컨테이너가 호스트를 장악하면 Vault signer와 private key도 같은 호스트에서 위험해질 수 있다. 따라서 이 구성만으로는 #185의 독립 attestation 완료 조건을 충족했다고 보고하지 않는다.

Vault는 signer backend일 뿐이며 bundle builder, immutable artifact store, OCI root-bootstrap, host verifier, rollback/recovery 절차를 대체하지 않는다.

## Trust boundaries

```text
CI/release runner
  └─ approved commit에서 bundle 생성·검증·digest 고정
       └─ (선택) Cloudflare Access + Tunnel
            └─ 현재 Munjib OCI VM / Vault Docker Compose
                 └─ Ed25519 private key 보관·서명·audit

같은 OCI VM의 Munjib host
  ├─ Vault signer와 호스트 경계 공유
  └─ public key만 보관하고 signed envelope을 자체 검증

승격 후 별도 Vault OCI VM
  └─ signer와 Munjib host를 독립 trust boundary로 분리
```

서명은 Munjib host가 Vault에 매번 호출하는 runtime dependency가 아니다. release adapter가 Vault를 호출해 signed manifest/envelope을 만든 뒤, immutable artifact와 raw public key만 Munjib host에 전달한다.

1인 운영에서는 다음을 명시한다.

- Vault ACL은 signer 호출을 제한하지만 본인 승인 자체를 두 사람 승인으로 만들지는 않는다.
- 초기에는 Vault와 Munjib이 같은 VM이라는 사실을 위협 모델과 attestation 기록에 명시한다.
- 승격 단계에서는 Vault VM, Munjib host, release runner를 별도 trust boundary로 분리한다.
- 인간 독립 승인 대신 immutable audit log, signed digest, 별도 host verification, rollback drill을 보완 통제로 사용한다.

## Local Mac lab

로컬 Docker Compose는 adapter 개발과 contract test에만 사용한다.

```text
Vault Community container
  ├─ pinned Vault version/digest
  ├─ Transit Ed25519 test key
  ├─ signer adapter test
  └─ munjib-release-verify positive/tamper/expiry/generation tests
```

Local lab rules:

- `vault server -dev`는 ephemeral test에만 사용하고 production에 사용하지 않는다.
- production private key를 Docker volume, `.env`, repository, iCloud/Dropbox에 넣지 않는다.
- local port는 필요할 때만 `127.0.0.1`에 bind한다.
- `backend "raft"`가 아니라 Vault 설정 키워드인 `storage "raft"`를 사용한다.
- local signature는 production attestation으로 보고하지 않는다.

Issue #208 Phase A local lab은 구현되어 있다. lifecycle entry point는
`pnpm vault:lab:up`, `pnpm vault:lab:bootstrap`, `pnpm vault:lab:test`,
`pnpm vault:lab:down`이고, base Compose는 token을 포함하지 않으며
`127.0.0.1:18200`에만 publish한다. 검증한 image record는
`docker.io/hashicorp/vault:2.0.3@sha256:a296a888b118615dc01d5f1a6846e6d4a7277946caaed5b447008fff5fe06b54`이다.

`vault:lab:test`는 실행마다 private temporary directory와 random dev token을
만들고, token은 mode `0600` generated Compose override와 child process environment에만
둔다. raw public key는 mode `0400` temporary file에 기록하며 command body, token,
signature, key, temporary path와 Vault response body를 출력하지 않는다. 실패 stderr는
stable generic message로 redaction하고 성공 stdout은 다음 다섯 줄만 허용한다.

Lab signer 호출은 `--key-version 1`과 Munjib `--generation 1`을 별도 인자로
고정한다. Transit response의 `key_version`과 `vault:vN` signature prefix가 요청한
version과 모두 일치하지 않으면 서명을 거부한다.

```text
VAULT_LAB_VERIFY_OK
VAULT_LAB_TAMPER_REJECT_OK
VAULT_LAB_EXPIRY_REJECT_OK
VAULT_LAB_GENERATION_REJECT_OK
VAULT_LAB_WRONG_KEY_REJECT_OK
```

이 evidence는 generation `1`, TTL `2m` positive envelope, payload tamper, TTL `1s`
expiry, configured generation `2`, 두 번째 Transit key rejection을 실제 digest-pinned
Vault Community container와 repository signer/verifier source로 확인한 local-only 결과다.

## Single OCI Docker Compose deployment

### VM boundary

현재 OCI VM에는 Munjib web, Postgres, Caddy와 Vault가 함께 존재한다. 이 배치는 초기 운영 비용과 배포 복잡도를 줄이지만, Munjib host compromise가 Vault signer compromise로 이어질 수 있다. Docker Compose의 container 분리는 process/config 경계이지 독립 attestation 경계가 아니다.

권장 디렉터리:

```text
/opt/munjib-vault/
  compose.yml
  .env                  # VAULT_VERSION만 보관, token/key 금지
  config/vault.hcl
  tls/                   # root 소유, Vault가 읽을 수 있는 최소 권한
  data/                  # Raft persistent volume
  logs/                  # Vault audit/server log
  backup/                # snapshot 임시 디렉터리, 장기 보관은 VM 외부
```

### Compose contract

Compose는 image version을 고정하고, `data`, `logs`, `tls`, `config`를 명시적으로 mount한다. Munjib Caddy나 public reverse proxy를 통해 Vault를 노출하지 않으며, 관리용 loopback 또는 내부 Docker network만 사용한다. `cloudflared`를 별도 컨테이너로 실행할 경우에는 Vault와 전용 internal Docker network를 공유하고, host의 `127.0.0.1` publish 포트를 origin으로 사용하지 않는다.

```yaml
services:
  vault:
    image: hashicorp/vault:${VAULT_VERSION}
    restart: unless-stopped
    cap_add:
      - IPC_LOCK
    command: ["server", "-config=/vault/config/vault.hcl"]
    ports:
      - "127.0.0.1:8200:8200"
    volumes:
      - ./config:/vault/config:ro
      - ./tls:/vault/tls:ro
      - ./data:/vault/data
      - ./logs:/vault/logs
```

운영 시작 전에 다음 증적을 남긴다.

```bash
docker compose config
docker compose images
docker compose up -d
docker compose ps
```

`VAULT_VERSION`은 검증한 버전으로 고정하고, 실제 image digest도 release record에 남긴다. `VAULT_TOKEN`, unseal key, private key를 Compose 파일이나 `.env`에 넣지 않는다.

### Vault configuration contract

단일 노드 production 시작점은 TLS와 Raft persistent storage를 사용한다. `tls_disable = true`는 로컬 lab에만 허용한다.

```hcl
ui = false

api_addr     = "https://127.0.0.1:8200"
cluster_addr = "https://127.0.0.1:8201"

storage "raft" {
  path    = "/vault/data"
  node_id = "munjib-vault-prod-1"
}

listener "tcp" {
  address         = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"
  tls_cert_file   = "/vault/tls/server.crt"
  tls_key_file    = "/vault/tls/server.key"
}

audit "file" {
  file_path = "/vault/logs/audit.log"
}
```

OCI security list와 host firewall에서는 `8200`, `8201` 인바운드를 public에 허용하지 않는다. Cloudflare Tunnel을 쓰는 경우에도 Vault listener는 origin VM 내부에만 두고, connector가 outbound로 Cloudflare에 연결하게 한다. Munjib Caddy 설정에 Vault hostname을 추가하지 않는다.

### Bootstrap and recovery

- lab은 `vault operator init -key-shares=1 -key-threshold=1`을 사용할 수 있지만 production은 별도 보관 위치를 갖는 recovery plan을 먼저 기록한다.
- 초기 root token은 setup 전용으로 사용하고 이후 폐기하거나 revoke한다. 일반 signer 호출에는 root token을 사용하지 않는다.
- signer 전용 ACL과 auth method를 생성한다.
- Transit Ed25519 key를 만들고 export/plaintext backup/deletion 정책을 명시한다.
- Raft snapshot을 VM 외부에 보관하고, 새 VM에서 restore 후 unseal·sign·verify를 수행하는 drill을 남긴다.
- VM 재부팅 후 Vault가 sealed 상태로 시작할 수 있음을 가정하고 수동 unseal 절차와 소유자를 기록한다.

## Optional Cloudflare free perimeter

Cloudflare는 Vault의 public IP와 inbound port를 줄이는 네트워크 보완책이다.

```text
GitHub Actions
  └─ CF-Access-Client-Id / CF-Access-Client-Secret
       └─ Access Service Auth (default deny)
            └─ Tunnel outbound connection
                 └─ Vault OCI VM :8200
```

무료 범위에서 사용할 항목:

- Cloudflare Tunnel: origin의 public inbound 없이 outbound-only 연결
- Cloudflare Access: 1인 + CI 구성에 맞는 무료 사용자 범위와 Service Token
- Free Managed Ruleset, 기본 DDoS 보호, 단일 rate-limit rule

구성 규칙:

- signer hostname에는 Access Service Auth 정책만 허용한다.
- CI Service Token은 GitHub protected environment secret으로 저장하고 만료·교체한다.
- Vault ACL은 `transit/sign/munjib-release-prod-v1`의 `update`만 허용한다.
- `auth`, `transit/sign`, 관리자 API 외의 경로는 Access와 Vault 양쪽에서 차단한다.
- Cloudflare 계정 전체를 관리하는 `cert.pem`을 OCI VM에 두지 않고 Tunnel 전용 credential만 사용한다.
- Cloudflare Free 로그 보존은 짧으므로 Vault audit log와 attestation evidence를 별도 보존한다.

Cloudflare가 해결하지 못하는 문제는 private key custody, Vault root/unseal 보안, snapshot/restore, signer ACL, host 독립 검증, CI workflow 승인이다. signer payload에 불필요한 비밀을 넣지 않고, Cloudflare를 별도 trust boundary로 기록한다.

## Vault Transit contract

### Key

Production key registry는 다음 값을 보관한다.

```text
keyId: munjib-release-prod-v1
algorithm: Ed25519
generation: 1
allowed operation: VERIFY_ONLY
exportable: false
allow_plaintext_backup: false
deletion_allowed: false
```

Vault key version과 Munjib `expectedGeneration`은 별도 값이다. 예를 들어 `Vault key version 1 -> Munjib generation 1`처럼 명시적으로 매핑하고, Vault 자동 rotation만으로 host generation이 바뀐다고 가정하지 않는다.

### Signer adapter

Adapter는 다음을 수행한다.

1. approved commit, target, manifest digest, bundle digest, immutable artifact reference를 확인한다.
2. Munjib envelope의 canonical message를 NUL delimiter로 생성한다.
3. bootstrap registry에 기록된 Vault key version을 `--key-version`으로 명시하고 message bytes와 함께 Transit sign API에 전달한다. latest implicit signing은 허용하지 않는다.
4. `vault:v1:<base64>` signature를 파싱하고 64-byte raw signature인지 확인한다.
5. signature를 base64url(no padding)로 변환해 envelope에 넣는다.
6. Vault key ID/version, generation, issued/expiry, bundle digest를 audit record에 남긴다.

현재 envelope verifier가 요구하는 필드는 다음과 같다.

```text
format = munjib-release-envelope-v1
operation = VERIFY_ONLY
nonce = 32-byte random, base64url
expiresAt = RFC3339Nano, now 이후 5분 이내
expectedGeneration = host policy와 동일
payload = signed bundle/digest evidence
payloadSha256 = payload raw bytes의 SHA-256
keyId = root registry의 active key ID
signature = raw Ed25519 signature의 base64url
```

### Public-key bootstrap

Vault에서 조회한 public key는 Munjib host에 다음 형식으로 별도 bootstrap한다.

```text
/var/lib/munjib/security/bootstrap/release-verify.pub
owner: root:root
mode: 0400
size: 32 bytes
```

OpenSSH 한 줄 public key나 PEM 파일을 그대로 설치하지 않는다. adapter/root-bootstrap 단계에서 raw 32-byte Ed25519 key로 정규화하고, public key SHA-256과 key ID를 registry에 기록한다.

## Execution phases

### Phase A — local Compose lab

- [x] Vault Community image/version/digest pin
- [x] loopback-only Compose와 ephemeral credential override
- [x] Transit Ed25519 test key `munjib-release-lab-v1`
- [x] canonical envelope builder와 Vault sign adapter
- [x] raw 32-byte public-key normalization
- [x] real local positive/tamper/expiry/generation/wrong-key integration

Phase A 완료는 production readiness가 아니다. Phase B same-OCI production bootstrap,
Phase C host `VERIFY_ONLY_OK`, current/rollback/recovery evidence와 Issue #185 독립
attestation은 모두 미완료 상태다.

### Phase B — same-OCI production bootstrap (temporary gate)

- 현재 Munjib OCI VM에 Vault Compose 프로젝트 생성
- Docker Compose image digest와 config hash 고정
- TLS, Raft, ACL, audit 구성
- OCI inbound `8200/8201` 차단
- snapshot/restore와 reboot/unseal drill
- 필요 시 Cloudflare Tunnel + Access Service Auth 구성
- 동일 호스트 경계를 #185 evidence에 기록하고 독립 attestation 미충족 상태로 표시

### Phase C — signing and attestation

- production Ed25519 key 생성
- public key raw 32-byte export/normalization
- immutable key registry record 작성
- approved bundle digest 고정
- Vault adapter로 signed manifest/envelope 생성
- immutable artifact에 저장
- host에서 `munjib-release-verify` 실행
- `VERIFY_ONLY_OK` 및 broker `VERIFY_ONLY` response 기록
- current/rollback/recovery digest 증적 기록

### Phase D — independent signer promotion

다음 작업을 완료하기 전까지는 same-OCI 구성을 최종 독립 signer로 취급하지 않는다.

- Vault 전용 OCI VM 생성
- Vault Compose/data/tls/audit 이동과 key registry 연속성 확인
- Munjib host에서 Vault private key와 Vault container 제거
- 새 Vault VM에서 signed bundle 생성 및 host `VERIFY_ONLY_OK` 재검증
- current/rollback/recovery 증적을 새 trust boundary 기준으로 재기록

### Phase E — promotion decision

다음 중 하나가 필요해지면 단일 Community 노드에서 승격한다.

- signer 무중단 또는 다중 노드 HA
- cross-region DR replication
- HSM 또는 FIPS 요구
- multi-tenant namespace/고급 policy 승인
- 장기 audit retention과 상용 SLA

후보는 HCP Vault Dedicated Essentials 이상 또는 별도 Enterprise/multi-node self-managed 구조다.

### Phase F — merge gate

- unresolved review thread 처리
- collaborator 공식 approval 확보
- #185 host attestation gate 충족 확인
- dependency order로 PR merge
- `main` deploy의 exact SHA, migration, RAG index, public health 검증
- 관련 issue 종료

## Rotation rule

현재 host verifier는 공개키 파일 하나와 generation 하나를 사용하므로 Vault auto-rotation만 켜면 안 된다. 회전은 다음 순서로 수행한다.

1. 새 Vault key version 생성
2. 새 public key와 key ID registry 기록
3. host bootstrap public key 교체
4. principal policy generation 증가
5. systemd 또는 Compose 서비스 reload/restart
6. 새 envelope으로 `VERIFY_ONLY_OK` 확인
7. 이전 generation reject 확인
8. 이전 key 폐기 또는 verify minimum version 조정

## Completion evidence

```text
[ ] Vault edition/deployment location
[ ] 현재 same-OCI 또는 승격된 dedicated OCI VM 상태를 명시
[ ] #185 독립 attestation 전에는 same-OCI 제한을 gate에 표시
[ ] Compose file/config hash와 image digest
[ ] keyId, algorithm, key version, Munjib generation
[ ] public key SHA-256 and raw 32-byte check
[ ] private key export/backup disabled
[ ] signer ACL and auth record
[ ] Vault audit log evidence
[ ] snapshot/restore drill evidence
[ ] Cloudflare Access/Tunnel policy, if enabled
[ ] bundle/manifest digest
[ ] immutable artifact URI/version
[ ] signed envelope expiry
[ ] host VERIFY_ONLY_OK
[ ] broker VERIFY_ONLY response
[ ] current/rollback/recovery evidence
```

## Source evidence

- `deploy/vault-lab/compose.yml`, `scripts/vault-lab/*.sh`, and `tests/deploy/vault-lab-contract.test.ts`.
- `cmd/munjib-release-sign/main.go` and `internal/releasesigner/transit.go`.
- Issue #185 delivery-substrate assessment and `internal/delivery/envelope.go`.
- `cmd/munjib-release-verify/main.go` and `cmd/munjib-release-broker/main.go`.
- `deploy/delivery/principal-policy-v1.json` and bundle layout/verifier scripts.
- [Vault Transit API](https://developer.hashicorp.com/vault/api-docs/secret/transit).
- [Vault Community/Enterprise edition comparison](https://developer.hashicorp.com/vault/tutorials/get-started/available-editions).
- [Vault production hardening](https://developer.hashicorp.com/vault/docs/concepts/production-hardening).
- [HCP Vault Dedicated tiers](https://developer.hashicorp.com/hcp/docs/vault/get-started/deployment-considerations/tiers-and-features).
- [HCP Vault deployment overview](https://developer.hashicorp.com/hcp/docs/vault/what-is-hcp-vault).
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/).
- [Cloudflare Access Service Tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).
- [Cloudflare pricing and Free plan](https://www.cloudflare.com/plans/).
- User decision: 초기 production signer는 현재 Munjib production과 같은 OCI VM의 Docker Compose Community로 시작하되, 같은 호스트 경계 때문에 #185 독립 attestation 전에는 임시 gate로만 취급한다.
