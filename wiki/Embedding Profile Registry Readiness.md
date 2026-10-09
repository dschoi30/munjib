---
id: concept-embedding-profile-registry-readiness
title: Embedding Profile Registry Readiness
type: concept
status: active
summary: Issue #139의 embedding profile metadata와 runtime/schema activation dependency gate.
created: 2026-07-13
updated: 2026-10-09
source_count: 5
tags:
  - munjib
  - ai
  - rag
  - embedding
  - security
links:
  - "[[RAG Process Workflow]]"
  - "[[index|Wiki Index]]"
  - "[[log|Wiki Log]]"
---

# Embedding Profile Registry Readiness

> MVP scope update (2026-10-09): the owner deferred the remaining long-term
> hardening/runtime program. Its issues are closed as `not_planned`, not completed.
> Readiness/dependency sections below preserve future activation criteria; they
> are not the current MVP execution plan. See [[Security Hardening Public Status]].


Issue #139의 현재 dependency-safe slice는 `lib/rag/embedding-registry.ts`에
server/client-safe embedding profile metadata 계약만 둔다. Registry는 기존
live index인 Ollama `bge-m3` 1024 하나만 노출하고, legacy `indexId` `bge-m3`를
그대로 보존한다. Versioned profile id는 이후 settings/backfill 단계가 사용할
forward-looking identity이며 현재 pgvector identity를 대체하지 않는다.

## 현재 제공하는 계약

- profile id는 provider/model/dimension 조합에서 deterministic하게 생성된다.
- v1은 현재 pgvector column과 맞는 정확한 1024 dimensions만 허용한다.
- profile lookup은 profile id 또는 exact provider/model/dimension identity로
  수행한다.
- provider availability는 호출자가 넘긴 boolean map으로만 필터링한다.
- profile metadata에는 API key, base URL, workspace/document value, database
  id가 없다.

이 helper들은 env를 읽지 않고 provider network, database, schema, indexing,
backfill, reindex, profile activation을 실행하지 않는다. 따라서 registry
테스트가 통과해도 workspace가 reindexed 되었거나 cloud provider가 운영
가능하다는 뜻은 아니다.

## 다음 단계의 gate

다음 구현은 #184 immutable runtime와 #185 delivery broker의 accepted
attestation, Leaf 13B database-time authority와 reserved migration slot,
그리고 명시적으로 소유된 maintenance role이 제공된 뒤에만 시작한다.

그 증거가 오기 전에는 `WorkspaceAiSettings` schema/desired-active status,
`DocumentChunk` backfill/reindex, retrieval identity switch, provider
activation, production rollout을 추가하지 않는다. 상세 public handoff와
검증 명령은 [`docs/runbooks/embedding-registry-readiness.md`](../docs/runbooks/embedding-registry-readiness.md)에 둔다.

## 근거

- GitHub Issue #139와 해당 issue의 current-origin assessment comment
- `lib/rag/model-config.ts`의 `CURRENT_EMBEDDING_INDEX`
- `lib/rag/embedding-registry.ts`
- `tests/rag/embedding-registry.test.ts`
