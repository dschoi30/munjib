---
id: workflow-attachment-lifecycle-readiness
title: Attachment Lifecycle Readiness
type: workflow
status: active
summary: Issue #165 첨부 파일 lifecycle hardening의 현재 contract, dependency gate, preparation-only evidence 경계.
created: 2026-07-13
updated: 2026-07-13
source_count: 8
tags:
  - munjib
  - security
  - attachments
  - lifecycle
  - readiness
links:
  - "[[index|Wiki Index]]"
  - "[[Document Editing Workflow]]"
  - "[[Markdown Import And Clipboard Paste Workflow]]"
  - "[[Document Knowledge Model]]"
  - "[[CI CD And Monitoring Workflow]]"
  - "[[Wiki Maintenance Automation]]"
---

# Attachment Lifecycle Readiness

Issue #165는 현재 attachment 업로드/ACL/preview 경계를 유지하면서,
archived-document purge 뒤 남는 storage bytes와 저장되지 않은 clipboard
paste의 수명 관리를 다음 hardening leaf로 분리한다.

## 현재 contract

- `Attachment` row는 문서/workspace에 귀속되고 bytes는
  `storage/attachments/<workspaceId>/<uuid>-<safeFileName>`에 둔다.
- 일반 업로드는 DB transaction 실패 시 새 파일을 rollback하지만, 문서
  hard-delete 뒤의 파일 cleanup은 아직 실행하지 않는다.
- paste-only image는 row/audit/file만 먼저 만들고 Save 때 Markdown link를
  확정한다. abandoned draft expiry는 아직 없다.
- Attachment read는 workspace/document ACL과 internal preview allowlist를
  통과해야 하며 missing bytes는 404로 정규화한다.

## Preparation-only implementation slice

Issue #165의 preparation slice는 `lib/attachments/storage-key.ts`의 공통
storage-key/path 검증과 `lib/attachments/lifecycle-inventory.ts`의 순수
reconciliation primitive를 제공한다. 서비스의 모든 write/read path는 이제
workspace-scoped canonical key가 아니면 `ATTACHMENT_STORAGE_KEY_INVALID`로
fail closed한다. Inventory primitive는 DB metadata row와 broker-provided
file manifest를 입력으로 받아 `referenced`, `missing-bytes`,
`orphan-bytes`, `invalid-key`를 deterministic하게 분류하며, 반환값에
`mutationAllowed: false`를 고정한다. 이 코드는 filesystem/DB를 직접 읽거나
삭제하지 않으므로 candidate manifest를 준비하는 호출자와 production
purge를 의도적으로 분리한다.

## Dependency-gated phases

`deploy/attachments/attachment-lifecycle-readiness-v1.json`이 canonical
contract다. Phase A는 Issues #2/#4/#5/#6와 Leaf 13B database authority가
attested되기 전에는 read-only preparation만 허용한다. Phase B는 여기에
Issue #164 provider-policy v2를 더하고, quiesced candidate에서만 DB/file
manifest와 isolated restore를 허용한다. 두 phase 모두 production delete나
storage scheduler를 의미하지 않는다.

## Deferred mutation boundary

Orphan-byte GC, archived-document cascade cleanup, pending paste expiry,
concurrent upload/purge retry, backup/restore ordering, and AI/history
attachment references는 후속 mutation leaf다. Broker-signed epoch,
database authority, retryable quarantine, idempotent audit/journal proof가
없으면 파일을 삭제하지 않는다.

상세 절차와 unknown-unknown 점검표는
`docs/runbooks/attachment-lifecycle-readiness.md`에 있다.
