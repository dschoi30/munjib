---
title: Release Signer 마지막 세션 진행 사항과 사용자 작업
date: 2026-08-09
tags:
  - munjib
  - security
  - release-signer
  - handoff
status: active
related:
  - "[[Release Signer And Vault Workflow]]"
  - "[[CI CD And Monitoring Workflow]]"
---

# Release Signer 마지막 세션 진행 사항과 사용자 작업

> [!summary] 결론
> 직전 `munjib` 세션은 `Release Signer 작업 절차 가이드` 작성과 운영 준비 점검이었다. 2026-08-09 운영 결정을 반영해, MVP 기간에는 **현재 Munjib OCI VM 한 대에 Vault를 함께 운영하고 기존 배포 방식은 유지한다.** 우선순위는 backup, 외부 포트 차단, secret 분리, 영속 저장, 최소 권한 signer, 재부팅·복구 검증이다. Issue #185의 delivery broker와 PR #188의 immutable runtime은 MVP 이후로 보류한다.

## 1. 기준과 범위

- 대상 세션: 직전 Codex 작업 `Release Signer 작업 절차 가이드`
- 세션 관찰 시각: 2026-08-09 18:13~18:34 KST 전후
- 현재 상태 재검증일: 2026-08-09
- 범위: release signer, Vault Transit, delivery broker, Issue #185, PR #188
- 제외: production secret 값, root token, private key, 실제 접근 자격 증명

## 2. 마지막 세션에서 진행된 내용

### 완료되거나 확인된 내용

- production 변경을 바로 수행하지 않고 운영 절차와 선행 조건을 정리했다.
- delivery bundle에 들어갈 broker, submitter, verifier와 정책·systemd·SSHD 자산을 확인했다.
- `munjib-deploy` 계정이 임의 셸 대신 강제 명령만 실행하도록 하는 least-authority SSH 구성을 점검했다.
- release envelope의 허용 작업, 크기 제한, 만료, generation, payload digest, Ed25519 서명 검증 계약을 확인했다.
- production host 사전 점검 항목으로 architecture, 전용 계정, 제출 그룹, trust key, broker socket/policy를 정리했다.
- Vault는 signer backend이며 bundle builder, root bootstrap, host verifier, rollback/recovery를 대체하지 않는다는 경계를 재확인했다.
- 초기 production Vault는 현재 Munjib과 같은 OCI VM에 둘 수 있지만, 같은 host이므로 독립 attestation 완료로 간주하지 않는다는 결정을 유지했다.

### 세션에서 발생한 실패와 미완료 사항

- 원격 Ubuntu host의 Vault lab bootstrap이 `VAULT_TOKEN` 누락으로 실패했다.
- 그 다음 `pnpm vault:lab:test`도 실패했고, `pnpm vault:lab:down`으로 lab을 종료했다.
- 이 실패는 production broker 실패가 아니라 **lab 초기화 입력 누락**이다.
- 여러 reconcile worktree의 `wiki/log.md`, `wiki/manifest.json` 충돌이 화면에 보였지만, 직전 세션에서는 해결 완료 증적이 확인되지 않았다.
- production host에는 broker socket/operation policy 설치, trust-key enrollment, host `VERIFY_ONLY_OK`, current/rollback/recovery 증적이 아직 없었다.

## 3. 2026-08-09 현재 재검증 상태

| 항목 | 현재 상태 | 의미 |
|---|---|---|
| PR #186 `security: package delivery substrate bundle` | 병합됨 | 공개 가능한 bundle 패키징 코드가 main에 들어감 |
| PR #209 `Add Vault Transit release signer local lab` | 병합됨 | Vault Transit adapter와 local lab 구현이 main에 들어감 |
| Issue #208 | 종료됨 | local Community lab 구현 단위는 완료됨 |
| Issue #185 | 열림 | production broker 설치·attestation은 미완료 |
| PR #188 | 열림, `DIRTY` | main과 충돌하며 #185 완료 전 병합 금지 |
| PR #188 마지막 CI | Test and build 성공, Deploy 건너뜀 | 과거 head의 CI 성공일 뿐 현재 main 대비 병합 준비 완료를 뜻하지 않음 |

> [!warning] 중요한 구분
> bundle build/verify 성공과 local Vault lab 성공은 production release readiness가 아니다. Issue #185를 닫으려면 production host에서 제한된 bootstrap을 거쳐 trust key, broker 설치, 독립 `VERIFY_ONLY`, rollback/recovery 증적이 필요하다.

## 4. 단일 OCI MVP 운영 결정

현재 단계에서는 **새 인프라를 추가하지 않고 Munjib이 실행 중인 OCI VM 한 대에 Vault도 함께 운영한다.** 목표는 완전한 독립 attestation이 아니라 초기 서비스에서 치명적인 실수를 막는 것이다.

### 지금 하는 것

- Vault를 외부 인터넷에 공개하지 않는다.
- Vault 데이터가 컨테이너 재생성 후에도 남도록 영속 volume을 사용한다.
- production key의 export와 plaintext backup을 금지한다.
- root token과 unseal/recovery material을 저장소·서버 `.env`·채팅에 남기지 않는다.
- VM 밖에 암호화된 snapshot backup을 하나 유지한다.
- 재부팅 뒤 Vault와 기존 Munjib이 정상 복구되는지 확인한다.

### MVP 이후로 미루는 것

- 별도 Vault/signing OCI VM
- HCP Vault 또는 Vault Enterprise
- OCI Bastion 도입
- 2인 승인과 별도 운영자
- HSM, multi-region, HA cluster
- Issue #185의 독립 host attestation
- PR #188의 immutable runtime 전환

> [!important] GitHub 상태 처리
> Issue #185와 PR #188은 보안 실패로 닫지 않는다. `MVP 기간에는 기존 배포 방식을 유지하고 same-OCI Vault만 운영한다`고 기록한 뒤 보류한다. PR #188은 merge하지 않는다.

## 5. 초보자용 MVP 작업 순서

### 1단계 — 변경 전 백업과 현재 상태 기록

이 단계는 문제가 생겼을 때 원래 상태로 돌아가기 위한 준비다.

- [ ] OCI Console에서 instance boot volume backup을 만든다.
- [ ] PostgreSQL backup이 최근에 성공했는지 확인한다.
- [ ] `/etc/munjib/env`, Caddy 설정, 현재 Compose 파일의 안전한 backup 위치를 확인한다.
- [ ] 현재 실행 중인 container와 public health 상태를 기록한다.
- [ ] 작업 시간을 정하고, 문제가 생기면 Vault만 제거하고 기존 Munjib은 건드리지 않는다는 원칙을 세운다.

읽기 전용 확인 예시:

```bash
uname -m
docker compose ps
curl -I https://munjib.andrewchoi.link
sudo ss -lntp
```

완료 기준: 작업 전 Munjib이 정상이고, VM 및 DB를 복구할 수 있는 backup이 있다.

### 2단계 — production Vault Compose 준비

현재 repository의 `deploy/vault-lab`은 local test용이므로 production에 복사해 사용하지 않는다. production 전용 Compose/config를 별도 구현하고 review한 다음 설치한다.

필수 설정만 남긴다.

- [ ] `vault server -dev`를 사용하지 않는다.
- [ ] Vault image는 `latest`가 아니라 version과 digest를 고정한다.
- [ ] `storage "raft"`와 persistent volume을 사용한다.
- [ ] `8200/8201`을 `0.0.0.0`에 publish하지 않는다.
- [ ] Caddy에 Vault public hostname이나 reverse-proxy route를 추가하지 않는다.
- [ ] Vault container에는 Munjib DB password, NextAuth secret 등 불필요한 secret을 전달하지 않는다.
- [ ] 자동 재시작 정책과 health check를 설정한다.

가장 단순한 네트워크 형태:

```text
인터넷
  └─ Caddy → Munjib web

같은 OCI 내부
  ├─ Munjib
  └─ Vault → 외부 공개 포트 없음
```

완료 기준: OCI 외부에서 `8200/8201`에 접속할 수 없고, Vault data directory가 container lifecycle과 분리돼 있다.

### 3단계 — Vault 최초 초기화

초기화는 한 번만 수행한다. 화면에 표시되는 root token과 unseal/recovery material은 비밀번호와 같은 중요 정보다.

- [ ] 사람이 직접 보고 안전한 password manager에 저장한다.
- [ ] repository, GitHub, Slack, KakaoTalk, Obsidian, shell script에 붙여 넣지 않는다.
- [ ] server의 일반 `.env` 파일에 장기 보관하지 않는다.
- [ ] 저장 직후 password manager에서 다시 열어 값이 보존됐는지만 확인한다.
- [ ] 초기 설정이 끝나면 root token을 일상 작업에 사용하지 않는다.

> [!danger] 절대 하면 안 되는 일
> 초기화 출력 화면을 캡처하거나 이 문서에 실제 token/key를 기록하지 않는다. 분실했다고 추측으로 재초기화하지 않는다. 기존 Raft data가 있는 상태에서 다시 초기화하면 복구가 더 어려워진다.

완료 기준: Vault가 initialized 상태이고, 필요한 복구 material은 OCI VM 밖의 password manager에만 보관돼 있다.

### 4단계 — Transit signer 최소 설정과 확인

- [ ] release signing 전용 policy와 token을 만든다.
- [ ] token은 필요한 Transit key의 sign/read 동작만 허용한다.
- [ ] Ed25519 key의 `exportable`을 `false`로 둔다.
- [ ] plaintext backup을 허용하지 않는다.
- [ ] local lab key와 구분되는 production key 이름을 사용한다.
- [ ] public key를 추출해 raw 32-byte `release-verify.pub`로 정규화한다.
- [ ] public key SHA-256, key ID, Vault key version만 기록한다.
- [ ] 테스트 payload에 대해 sign과 verify가 성공하는지 확인한다.
- [ ] 변조된 payload가 반드시 실패하는지 확인한다.

기록해도 되는 정보:

```text
Vault image version/digest
key ID
key version
public key SHA-256
test 성공/실패 상태
작업 시각
```

기록하면 안 되는 정보:

```text
root token
signer token 원문
unseal/recovery material
private key
민감한 실제 payload
```

완료 기준: 정상 입력은 서명·검증되고, 변조 입력은 거부되며 private key는 Vault 밖으로 나오지 않는다.

### 5단계 — backup과 재부팅 복구 확인

- [ ] Raft snapshot을 만든다.
- [ ] snapshot을 암호화해 OCI VM 밖에 복사한다.
- [ ] snapshot 파일과 복호화 비밀번호를 같은 위치에 두지 않는다.
- [ ] Vault container만 재시작하고 data가 유지되는지 확인한다.
- [ ] 계획된 작업 시간에 OCI VM 재부팅 테스트를 한다.
- [ ] 재부팅 뒤 Munjib public health를 먼저 확인한다.
- [ ] Vault가 sealed 상태라면 정상 절차로 unseal한다.
- [ ] 기존 production key version이 유지되는지 확인한다.
- [ ] sign/verify smoke test를 다시 실행한다.

완료 기준: VM 재부팅 뒤 Munjib과 Vault가 모두 복구되고, 기존 signing key로 검증이 성공한다.

## 6. MVP 보안 체크리스트

다음 열두 개만 모두 지키면 초기 MVP의 필수선으로 본다.

- [ ] 작업 전 VM과 DB backup이 있다.
- [ ] Vault는 dev mode가 아니다.
- [ ] Vault image version/digest가 고정돼 있다.
- [ ] Raft data가 persistent volume에 저장된다.
- [ ] `8200/8201`이 public internet에 열려 있지 않다.
- [ ] Caddy가 Vault를 공개하지 않는다.
- [ ] production private key를 export할 수 없다.
- [ ] root token과 recovery material은 password manager에만 있다.
- [ ] 일상 작업에 root token을 사용하지 않는다.
- [ ] signer token은 최소 권한만 가진다.
- [ ] 암호화된 Raft snapshot이 VM 밖에 있다.
- [ ] 재부팅 후 Munjib health와 Vault sign/verify를 확인했다.

하나라도 충족하지 못하면 production signer 연결은 보류한다.

## 7. 이번 MVP에서 하지 않는 작업

- delivery broker의 production 설치
- `munjib-deploy` 강제 SSH 계정 구성
- signed `INSTALL_SUBSTRATE` 또는 `RECONCILE_SUBSTRATE`
- PR #188 merge
- 기존 production 배포 pipeline 교체
- 별도 signer VM 구축
- 독립 attestation 완료 주장

이 항목들은 사용자가 늘거나 유료 고객 데이터가 쌓이거나 배포 권한 분리가 필요해질 때 다시 시작한다.

## 8. 관련 문서와 추적 항목

- [[Release Signer And Vault Workflow]]
- [[CI CD And Monitoring Workflow]]
- GitHub Issue #185: production delivery broker 설치·attestation
- GitHub PR #188: exact-digest private runtime gate
- GitHub PR #186: delivery substrate bundle 패키징 — 병합됨
- GitHub PR #209 / Issue #208: Vault Transit local lab — 병합·종료됨
