---
id: log-main
title: Wiki Log
type: log
status: active
summary: Munjib wiki 유지보수 timeline.
created: 2026-04-29
updated: 2026-05-24
source_count: 97
tags:
  - log
  - munjib
links:
  - "[[index|Wiki Index]]"
  - "[[Munjib]]"
  - "[[Project PRD]]"
  - "[[Wiki Maintenance Automation]]"
---

# Wiki Log

## 2026-05-24T19:28:00+09:00 - review follow-up

- Result: PR #60 automated review feedback에 따라 wiki-link lookup key의 최종 hyphen normalization을 복원했다.
- Coverage: Lookup key는 whitespace를 hyphen으로 바꾼 뒤 hyphen run을 다시 접어 `[[A - B]]`가 `A-B` 문서와 계속 매칭된다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #60 review threads, `lib/wiki-links/targets.ts`, `tests/wiki-links/preview.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T19:20:00+09:00 - review follow-up

- Result: PR #60 automated review feedback에 따라 path-qualified wiki-link lookup의 stored path matching을 `slugifyTitle()` 기반으로 복원하고, non-ASCII parent folder fallback을 보강했다.
- Coverage: Direct path matching은 persisted `Document.path`와 같은 slug-compatible key를 사용한다. 마지막 segment title matching은 parent folder path를 slug-compatible하게 유지하고 마지막 title segment만 Unicode-preserving lookup key로 비교해 `[[역사/수에즈_운하_위기]]` 같은 link도 resolve한다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #60 review threads, `lib/wiki-links/targets.ts`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T19:12:00+09:00 - review follow-up

- Result: PR #60 automated review feedback에 따라 wiki-link lookup key의 slug-compatible punctuation normalization을 복원하고 lookup 반복 계산을 줄였다.
- Coverage: Unicode-preserving lookup key는 underscore를 공백처럼 취급하면서 punctuation을 제거해 `[[Q1Q2 Plan]]`이 `Q1/Q2 Plan` 문서와 계속 매칭된다. Path-qualified title fallback lookup key는 filter loop 밖에서 계산하고 preview candidate lookup keys는 중복 제거한다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #60 review threads, `lib/wiki-links/targets.ts`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T14:00:00+09:00 - bugfix

- Result: Issue #59 underscore wiki link target matching을 구현했다.
- Coverage: Body preview links와 frontmatter `links:` reconciliation은 target lookup에서 underscore를 공백처럼 취급한다. Raw markdown과 `DocumentLink.targetTitleRaw`는 보존하며, path-qualified target은 segment별 lookup normalization을 적용한다. 한글 title처럼 stored path가 title 정보를 잃는 경우에는 parent path와 마지막 title segment lookup key를 함께 비교한다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: GitHub issue #59, `lib/wiki-links/targets.ts`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`, `tests/wiki-links/reconcile.test.ts`, `docs/superpowers/plans/2026-05-24-underscore-wiki-link-targets.md`.
- Verification: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-05-24T13:35:00+09:00 - design

- Result: Issue #59 underscore wiki link target matching 설계를 기록했다.
- Coverage: `[[수에즈_운하_위기]]`처럼 target에 underscore가 포함된 body preview link와 frontmatter `links:` entry를 `수에즈 운하 위기` 문서로 resolve하되, source markdown과 `DocumentLink.targetTitleRaw` raw text는 rewrite하지 않는다. Path-qualified target은 segment별로 같은 lookup normalization을 적용하고, global document slug/path 생성 규칙은 유지한다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: GitHub issue #59, `docs/superpowers/specs/2026-05-24-underscore-wiki-link-targets-design.md`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `lib/wiki-links/targets.ts`.
- Verification: Spec self-review.

## 2026-05-24T12:55:00+09:00 - review follow-up

- Result: PR #56 review feedback에 따라 multiple Markdown import의 batch failure handling과 panel state update를 보강했다.
- Coverage: `createDocument()` 실패는 file별 failed row로 기록해 이미 생성된 document 결과와 workspace revalidation을 보존한다. Settings panel은 folder sort를 `useMemo`로 memoize하고, duplicate filename row status 계산은 React state updater 내부의 local count map으로 수행해 updater purity를 유지한다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: PR #56 review threads, `app/workspaces/[workspaceSlug]/actions.ts`, `components/workspace-settings-panel.tsx`, `tests/workspace-actions.test.ts`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T12:45:00+09:00 - feature

- Result: Issue #55 multiple Markdown file import를 구현하고 settings panel을 별도 component로 분리했다.
- Coverage: Workspace settings Import form은 multiple file selection, selected file table, root-default destination picker, folder tree popup, panel-centered status message, partial success batch result, duplicate filename row status handling, current-route 유지 refresh를 제공한다. `components/document-list.tsx`는 sidebar composition과 settings panel open/close만 맡고, import UI/state는 `components/workspace-settings-panel.tsx`로 분리했다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/document-list.tsx`, `components/workspace-settings-panel.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `tests/components/document-list.test.tsx`, `tests/workspace-actions.test.ts`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T00:40:00+09:00 - plan

- Result: Issue #55 multiple Markdown file import implementation plan을 작성했다.
- Coverage: Plan은 server action batch contract, settings panel multi-file UI, destination path tree picker, wiki/verification/PR workflow를 task 단위로 나눈다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-24-multiple-markdown-file-import.md`, `docs/superpowers/specs/2026-05-23-multiple-markdown-file-import-design.md`.
- Verification: Plan self-review.

## 2026-05-24T00:20:00+09:00 - design

- Result: Issue #55 multiple Markdown file import 설계에 destination path 선택 요건을 추가했다.
- Coverage: Import submit row는 약 2/3 너비의 bordered destination path 영역과 좁은 Import button으로 구성한다. Destination path는 기본 root를 표시하고, 클릭 시 popup tree에서 root 또는 folder를 선택한다. 선택한 folder는 batch 전체 `folderId`로 전달하며 미선택 시 root에 import한다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: 사용자 추가 요건, `docs/superpowers/specs/2026-05-23-multiple-markdown-file-import-design.md`.
- Verification: Spec update self-review.

## 2026-05-23T23:55:00+09:00 - design

- Result: Issue #55 multiple Markdown file import 설계를 기록했다.
- Coverage: Workspace settings Import form은 여러 Markdown file 선택, selected file table, current-route 유지, panel-centered local status message, partial success batch result를 목표로 한다. 구현 전 설계 근거는 `docs/superpowers/specs/2026-05-23-multiple-markdown-file-import-design.md`이다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #55, `docs/superpowers/specs/2026-05-23-multiple-markdown-file-import-design.md`, `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`.
- Verification: Spec self-review.

## 2026-05-21T01:00:00+09:00 - bugfix

- Result: Markdown import 직후 화면 깜빡임을 줄이기 위해 import navigation을 server redirect에서 client push로 옮겼다.
- Coverage: `importMarkdownDocumentAction()`은 document 생성과 revalidation 후 `{ documentId }`만 반환한다. Workspace settings import form은 client action에서 dialog를 닫고 `router.push()`로 imported document URL을 연다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/actions.ts`, `components/document-list.tsx`, `tests/workspace-actions.test.ts`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-21T00:56:00+09:00 - bugfix

- Result: PR review feedback에 따라 clipboard HTML image paste의 server fetch와 pending state guard를 추가 보강했다.
- Coverage: IPv4-mapped IPv6 address는 dotted form뿐 아니라 hex form도 IPv4 private range 판정으로 재검사한다. Remote image fetch는 검증된 DNS answer를 한 개만 쓰지 않고, 실패 시 다음 검증 address를 순서대로 시도한다. Unsupported/malformed `data:` image가 HTML paste form data 생성 중 동기 throw해도 pending image paste count가 finally에서 정리된다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/actions.ts`, `components/document-editor.tsx`, `tests/workspace-actions.test.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/workspace-actions.test.ts`, `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`.

## 2026-05-21T00:45:00+09:00 - security

- Result: Clipboard HTML remote image server fetch의 SSRF hardening을 PR review feedback에 맞춰 보강했다.
- Coverage: Remote image fetch는 DNS lookup으로 public address만 허용한 뒤 원래 hostname을 다시 resolve하지 않고 검증된 IP address에 직접 연결한다. HTTPS 요청은 원래 hostname을 SNI와 `Host` header에 유지해 DNS rebinding 우회를 줄인다. IPv4-mapped IPv6 private range도 IPv4 판정 경로로 재검사한다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/actions.ts`, `tests/workspace-actions.test.ts`, `components/document-editor.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/workspace-actions.test.ts tests/attachments/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-21T00:00:00+09:00 - documentation

- Result: Markdown import와 clipboard paste 프로세스를 별도 workflow 문서로 분리했다.
- Coverage: 새 [[Markdown Import And Clipboard Paste Workflow]]는 Markdown file import의 document creation 흐름과 clipboard image/rich HTML paste의 draft, attachment, Save guard, remote image server fetch, 실패 처리 차이를 정리한다. [[Document Editing Workflow]]는 상위 편집 흐름을 유지하고 세부 import/paste 설명은 새 문서로 연결한다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `lib/documents/import-markdown.ts`, `components/document-editor.tsx`, `lib/markdown/html-to-markdown.ts`, `lib/attachments/service.ts`, `tests/documents/import-markdown.test.ts`, `tests/components/document-editor-preview.test.tsx`, `tests/workspace-actions.test.ts`, `tests/attachments/service.test.ts`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-20T00:36:00+09:00 - bugfix

- Result: Clipboard rich HTML paste에 image file 없이 `<img src>`만 포함될 때 source link만 붙여넣어지던 문제를 수정했다.
- Coverage: `DocumentEditor`는 clipboard HTML의 `<img>`를 upload placeholder로 치환해 Markdown으로 삽입한다. Data URL image는 client에서 File로 만들어 `pasteImageAttachmentAction()`에 보내고, remote image URL은 browser CORS를 피하기 위해 `imageUrl`로 server action에 넘겨 서버에서 fetch/upload한 뒤 placeholder를 attachment image markdown으로 교체한다. Server-side remote image fetch는 http/https URL만 허용하고 DNS lookup 결과가 private/local/link-local address이면 fetch 전에 거부하며, redirect 차단, 5초 timeout, allowed image MIME type, content-length, streaming byte limit을 적용한다. Image-only anchor wrapper는 source link markdown으로 변환하지 않고 image placeholder로 대체한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/workspace-actions.test.ts tests/attachments/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-18T03:14:00+09:00 - review follow-up

- Result: PR #53 추가 review feedback에 따라 pending image paste draft update를 active document가 아니라 source editor view document 기준으로 기록하도록 보강했다.
- Coverage: 오래된 CodeMirror view에서 upload completion dispatch가 발생해도 `EditorView`와 source document id의 mapping을 사용해 해당 paste가 시작된 문서 draft만 갱신한다. 다른 문서에도 pending paste가 있는 상태에서 source view update가 active document draft를 덮어쓰는 corruption path를 막는다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #53 review thread, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-18T03:06:00+09:00 - review follow-up

- Result: PR #53 추가 review feedback에 따라 pasted image draft cache를 완료 후 stale server content보다 우선하지 않도록 보강했다.
- Coverage: Pending image paste draft는 upload가 진행 중인 문서 상태 또는 비활성 source document에 완료 결과를 한 번 전달하기 위한 임시 값으로 제한된다. Upload가 끝난 활성 문서는 draft cache를 지우고, 비활성 문서에서 끝난 결과도 해당 문서를 다시 열 때 한 번 반영한 뒤 cache를 지워 이후 server-side content refresh를 stale draft가 덮지 않게 한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #53 review thread, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-18T02:54:00+09:00 - review follow-up

- Result: PR #53 review feedback에 따라 pending paste upload 완료 결과를 source document draft에 적용하도록 보강했다.
- Coverage: Image upload가 pending인 동안 다른 문서로 전환해도 upload 성공 결과는 paste가 시작된 document draft에 반영된다. 사용자가 원래 문서로 돌아오면 placeholder 대신 반환된 image markdown이 표시된다.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #53 review thread, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-18T02:46:00+09:00 - review follow-up

- Result: PR #53 review feedback에 따라 pending image paste state를 document별 count로 바꿨다.
- Coverage: 서로 다른 문서에서 paste image upload가 동시에 pending이어도 각 문서의 Save guard가 독립적으로 유지된다. 한 문서의 upload 완료가 다른 문서의 pending placeholder 저장 차단을 해제하지 않는다.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #53 review thread, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-18T01:29:00+09:00 - review follow-up

- Result: PR #53 추가 review feedback에 따라 clipboard image paste 실패 복구와 pending state scope를 보강했다.
- Coverage: Upload 실패 시 placeholder를 빈 문자열로 지우지 않고 paste 전에 선택된 text로 되돌린다. Pending upload save guard는 현재 선택 문서 기준으로만 적용되어, 느린 upload가 진행 중이어도 다른 문서로 전환하면 해당 문서 Save를 막지 않는다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #53 review threads, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-18T01:21:00+09:00 - review follow-up

- Result: PR #53 review feedback에 따라 clipboard image paste placeholder 처리와 pending upload save guard를 보강했다.
- Coverage: `DocumentEditor`는 같은 paste placeholder가 여러 번 존재하면 모두 반환 markdown으로 교체하고, upload 실패 시 모두 제거한다. Image upload가 pending인 동안 Save submit을 차단해 placeholder markdown이 저장되는 것을 막고 `Image upload is still in progress` toast를 표시한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #53 review threads, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-18T01:03:00+09:00 - maintenance

- Result: Issue #52 clipboard image paste attachment workflow를 최종 구현 상태에 맞춰 정리했다.
- Coverage: Manual attachment upload는 기존처럼 markdown link append와 즉시 document version 생성을 수행하고, Markdown editor clipboard image paste는 `pasteDocumentImageAttachmentAction()`을 통해 paste-only attachment service를 호출한다. Paste-only service/action은 `image/png`, `image/jpeg`, `image/gif`, `image/webp` file blob만 저장하고 `![file](/api/attachments/<id>)` markdown을 반환하되 `Document.contentMarkdown`와 `DocumentVersion`은 즉시 바꾸지 않는다. `DocumentEditor`는 paste selection에 temporary upload placeholder를 동기 삽입하고 upload 성공 시 현재 placeholder를 반환 markdown으로 교체하며, upload 실패 시 placeholder를 제거하고 `Image paste failed` toast를 표시한다. Body markdown persistence, version 생성, metadata/link reconciliation, audit log 작성은 사용자가 Save를 누를 때 기존 `updateDocument()` 흐름에서 확정된다. Remote `<img>` download와 Markdown import image collection은 Issue #52 범위 밖이다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #52, `docs/superpowers/specs/2026-05-18-clipboard-image-paste-design.md`, `docs/superpowers/plans/2026-05-18-clipboard-image-paste-attachments.md`, `lib/attachments/service.ts`, `app/workspaces/[workspaceSlug]/actions.ts`, `components/document-editor.tsx`, `tests/attachments/service.test.ts`, `tests/workspace-actions.test.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/attachments/service.test.ts tests/workspace-actions.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-18T00:47:00+09:00 - implementation

- Result: Issue #52 Task 3 `DocumentEditor` paste integration을 추가했다.
- Coverage: Workspace page가 `pasteDocumentImageAttachmentAction`을 bind해 `DocumentEditor`에 전달하고, CodeMirror paste handler는 clipboard image file을 rich HTML 변환보다 먼저 upload해 반환된 image markdown을 현재 selection에 삽입한다. Image file이 없으면 기존 rich HTML paste 변환을 유지한다.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/page.tsx`, `components/document-editor.tsx`, `components/document-editor/types.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`.

## 2026-05-18T00:38:00+09:00 - implementation

- Result: Issue #52 Task 2 paste image attachment server action contract를 추가했다.
- Coverage: `pasteDocumentImageAttachmentAction()`은 clipboard image file과 `documentId`를 받아 `uploadPastedDocumentImageAttachment()`를 호출하고, workspace path revalidation 후 redirect 없이 editor insertion용 `{ markdown }`을 반환한다. File이 없으면 `ATTACHMENT_FILE_REQUIRED`를 throw한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/actions.ts`, `tests/workspace-actions.test.ts`.
- Verification: `pnpm exec vitest run tests/workspace-actions.test.ts`.

## 2026-05-18T00:25:00+09:00 - implementation

- Result: Issue #52 Task 1 paste-only image attachment service를 추가했다.
- Coverage: `uploadPastedDocumentImageAttachment()`는 허용된 clipboard image MIME type만 저장하고 unnamed paste fallback file name을 만들며, attachment storage/row와 `attachment.uploaded` audit log를 생성한다. Manual attachment upload는 기존처럼 markdown append, document version, link/metadata reconciliation을 수행한다.
- Pages: [[Document Knowledge Model]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/attachments/service.ts`, `lib/service-errors.ts`, `tests/attachments/service.test.ts`.
- Verification: `pnpm exec vitest run tests/attachments/service.test.ts`.

## 2026-05-18T00:10:00+09:00 - plan

- Result: Issue #52 clipboard image paste attachment 구현 계획을 작성했다.
- Coverage: plan은 paste-only attachment service, server action, `DocumentEditor` paste integration, wiki maintenance, final PR workflow를 TDD task 단위로 나눈다.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/specs/2026-05-18-clipboard-image-paste-design.md`, `docs/superpowers/plans/2026-05-18-clipboard-image-paste-attachments.md`.
- Verification: plan self-review.

## 2026-05-18T00:00:00+09:00 - design

- Result: Issue #52 clipboard image paste attachment 설계를 작성했다.
- Coverage: 설계는 clipboard image file paste를 attachment로 즉시 저장하고, 반환된 image markdown을 현재 CodeMirror selection에 삽입하되 문서 본문 persistence는 기존 Save 흐름에 남기는 방향을 정한다. Remote image download, Markdown import image 가져오기, ZIP import, blob URL draft preview는 범위에서 제외한다.
- Pages: [[log|Wiki Log]].
- Source evidence: GitHub issue #52, `docs/superpowers/specs/2026-05-18-clipboard-image-paste-design.md`.
- Verification: spec self-review.

## 2026-05-18T00:25:00+09:00 - review follow-up

- Result: PR #51 Codex review에서 지적한 Docker attachment storage persistence를 반영했다.
- Coverage: Production `web` service가 `/app/storage`를 `web_storage` named volume으로 마운트해 container 재생성 후에도 uploaded attachment files가 DB attachment row와 함께 유지된다.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: PR #51 review thread, `docker-compose.yml`, `tests/docker/compose.test.ts`, `wiki/Local Development Workflow.md`.
- Verification: `pnpm exec vitest run tests/docker/compose.test.ts`.

## 2026-05-17T23:58:00+09:00 - review follow-up

- Result: PR #51 Docker review feedback를 반영했다.
- Coverage: Production `runner` image는 `pnpm prune --prod`로 devDependencies를 제거하고, Prisma/seed 등 DB 관리 명령은 devDependencies가 있는 `tools` target/service에서 실행한다. `public` directory를 runtime image에 포함하기 위해 `public/.gitkeep`을 추가했다. Compose environment는 host `.env`의 `DATABASE_URL`과 충돌하지 않도록 `DOCKER_DATABASE_URL` placeholder default를 사용하며, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`도 placeholder default를 사용한다. Host port conflict 때는 `WEB_PORT`와 `NEXTAUTH_URL`을 함께 override한다. Docker contract test는 placeholder 전체 문자열 대신 variable name과 default 핵심값을 분리해 확인한다.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: PR #51 review threads, `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`, `.env.docker.example`, `public/.gitkeep`, `tests/docker/compose.test.ts`.
- Verification: `pnpm exec vitest run tests/docker/compose.test.ts`, `docker compose build web tools`, `POSTGRES_PORT=55433 WEB_PORT=3101 NEXTAUTH_URL=http://localhost:3101 docker compose up -d postgres web`, `POSTGRES_PORT=55433 WEB_PORT=3101 NEXTAUTH_URL=http://localhost:3101 docker compose run --rm tools pnpm exec prisma db push`, `POSTGRES_PORT=55433 WEB_PORT=3101 NEXTAUTH_URL=http://localhost:3101 docker compose run --rm tools pnpm run db:seed`, `curl -I http://127.0.0.1:3101/login`, `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm test`.

## 2026-05-17T23:35:00+09:00 - implementation

- Result: Issue #50 Docker web+DB 실행 구성을 추가했다.
- Coverage: `Dockerfile`은 `runner` target에서 production dependency와 built `.next` output으로 `pnpm start`를 실행하고, `dev` target에서 source-mounted `pnpm run dev`를 지원한다. 기본 `docker-compose.yml`은 `postgres` healthcheck 이후 `web` service를 시작하며, `docker-compose.dev.yml`은 dev target, bind mount, anonymous dependency/build volumes를 적용한다. Docker contract test는 compose/Dockerfile/dockerignore의 핵심 계약을 검증한다.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #50, `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker-compose.dev.yml`, `.env.docker.example`, `tests/docker/compose.test.ts`.
- Verification: `pnpm exec vitest run tests/docker/compose.test.ts`.

## 2026-05-17T23:20:00+09:00 - design

- Result: Issue #50 Dockerized Next.js web service 설계와 구현 계획을 기록했다.
- Coverage: 기존 PostgreSQL-only `docker-compose.yml`을 web+DB 기본 compose로 확장하고, production-style `Dockerfile` runner target과 source-mounted `docker-compose.dev.yml` development override를 함께 제공하는 방향을 확정했다. Docker container 내부 DB URL은 `postgres:5432`, host machine local 개발 URL은 `localhost:55432`로 구분한다.
- Pages: [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #50, `docs/superpowers/specs/2026-05-17-dockerized-next-js-web-service-design.md`, `docs/superpowers/plans/2026-05-17-dockerized-next-js-web-service.md`, `docker-compose.yml`.
- Verification: spec/plan self-review.

## 2026-05-17T23:08:00+09:00 - review follow-up

- Result: PR #49 review에서 지적된 frontmatter property value 표시 edge case를 수정했다.
- Coverage: 일반 property row가 object value를 `[object Object]`로 표시하지 않고 JSON string으로 표시하며, null/undefined value는 literal `null`/`undefined` text 대신 빈 값으로 둔다.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #49 review thread, `components/document-editor/document-properties.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-17T22:49:00+09:00 - implementation

- Result: Issue #48에서 `DocumentEditor`와 `DocumentNavigation`의 동작을 유지하면서 큰 component 파일을 feature-local module로 분리했다.
- Coverage: editor preview/folding/properties/suggestion UI와 navigation panel/row/tree/favorites helper를 하위 module로 나누고, public entrypoint component, route shape, localStorage key, server action contract는 유지했다. `components/document-editor.tsx`는 342줄, `components/document-navigation.tsx`는 384줄로 줄었다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #48, `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`, `docs/superpowers/plans/2026-05-17-document-editor-navigation-refactor.md`, `components/document-editor.tsx`, `components/document-editor/*`, `components/document-navigation.tsx`, `components/document-navigation/*`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/components/document-list.test.tsx tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/wiki-links/preview.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-17T18:16:00+09:00 - plan

- Result: Issue #48 document editor/navigation 구조 리팩토링 구현 계획을 작성했다.
- Coverage: plan은 editor shared types, suggestion popover, folding storage, preview markdown helpers, markdown preview, document properties, navigation helpers, navigation rows, search/favorites panels, 최종 wiki/PR workflow를 task 단위로 나눈다.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`, `docs/superpowers/plans/2026-05-17-document-editor-navigation-refactor.md`.
- Verification: plan self-review.

## 2026-05-17T18:09:00+09:00 - design

- Result: Issue #48 document editor/navigation 구조 리팩토링 설계를 승인하고 spec으로 기록했다.
- Coverage: `components/document-editor.tsx`는 public `DocumentEditor` entrypoint와 editor state를 유지하고 preview/folding/properties/suggestion UI를 feature-local module로 분리한다. `components/document-navigation.tsx`는 public `DocumentNavigation` entrypoint와 container state, keyboard/menu/toast policy를 유지하고 search/favorites/document/folder rows, tree, favorites helper를 하위 module로 분리한다. Navigation 전용 `errors.ts`는 만들지 않고 작은 folder error toast policy는 container에 남긴다.
- Pages: [[Munjib]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #48, 사용자 승인, `components/document-editor.tsx`, `components/document-navigation.tsx`, `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`.
- Verification: spec self-review.

## 2026-05-17T12:15:00+09:00 - regression fix

- Result: Issue #46 branch에서 외부 branch merge 이후 다시 나타난 DocumentEditor 저장 flicker와 preview 줄바꿈 접힘 회귀를 복구했다.
- Coverage: `updateDocumentAction()`과 `createCommentAction()`은 현재 문서 query로 redirect하지 않고 workspace path revalidation만 수행한다. Preview paragraph는 `white-space: pre-wrap`을 유지하고 ReactMarkdown soft line break를 explicit break node로 렌더링해 edit mode 단일 개행과 외부 텍스트 paste 개행을 보존한다. PR review follow-up으로 HTML-to-Markdown 변환의 inline whitespace, backtick code delimiter, inline code significant whitespace, nested list indentation, table cell/row boundary, fenced code block delimiter 선택도 보강했다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 회귀 보고, PR #47 review comments, `app/workspaces/[workspaceSlug]/actions.ts`, `app/globals.css`, `components/document-editor.tsx`, `lib/markdown/html-to-markdown.ts`, `tests/workspace-actions.test.ts`, `tests/markdown/preview-styles.test.ts`, `tests/components/document-editor-preview.test.tsx`, `tests/markdown/html-to-markdown.test.ts`, `tests/e2e/preview-line-breaks.spec.ts`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/markdown/html-to-markdown.test.ts tests/workspace-actions.test.ts tests/markdown/preview-styles.test.ts`, `pnpm exec tsc --noEmit`, `pnpm exec playwright test tests/e2e/preview-line-breaks.spec.ts`.

## 2026-05-17T12:10:00+09:00 - review follow-up

- Result: Issue #46 branch를 최신 main과 merge한 뒤 Properties tags 정책에 맞춰 실패하던 DocumentEditor component tests를 수정했다.
- Coverage: Properties tags row는 YAML frontmatter `tags:` 값만 렌더링하고, 본문 `#tag`는 knowledge graph/tag extraction 용도로만 사용하며 Properties 영역에는 표시하지 않는다. Frontmatter가 없는 문서의 `frontmatter none` placeholder row도 렌더링하지 않는다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 정책 확인, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/markdown/html-to-markdown.test.ts tests/components/document-editor-preview.test.tsx tests/components/metadata-panel.test.tsx tests/components/app-shell.test.tsx tests/markdown/outline.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-17T11:55:00+09:00 - implementation

- Result: Issue #46 rich paste 동작을 추가해 외부 앱에서 복사한 styled text를 Markdown editor에 붙여넣을 때 의미 있는 스타일을 Markdown으로 보존한다.
- Coverage: clipboard `text/html`을 감지하면 CodeMirror paste handler가 기본 paste를 막고 heading, bold, italic, link, list, inline code, code block, blockquote, line break를 semantic Markdown으로 변환해 삽입한다. HTML이 없거나 변환 결과가 비어 있으면 기존 plain text paste 흐름을 유지한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #46, `components/document-editor.tsx`, `lib/markdown/html-to-markdown.ts`, `tests/markdown/html-to-markdown.test.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/markdown/html-to-markdown.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-17T11:24:00+09:00 - review follow-up

- Result: PR #45 Codex review에서 지적한 preview outline navigation edge case를 수정했다.
- Coverage: preview mode에서 접힌 parent section 아래 child heading outline row를 클릭하면 `DocumentEditor`가 target heading의 ancestor fold keys를 먼저 펼치고 DOM target을 다시 조회한 뒤 스크롤한다. 이로써 child heading이 접힘 때문에 DOM에 없던 경우에도 outline click이 no-op으로 끝나지 않는다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #45 unresolved review thread, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec vitest run tests/components/metadata-panel.test.tsx tests/components/app-shell.test.tsx tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-17T00:18:00+09:00 - review follow-up

- Result: Issue #44 final review에서 발견된 outline navigation fallback edge case를 수정했다.
- Coverage: `AppShell` heading navigator는 실제 target 처리 여부를 boolean으로 반환하고, `DocumentEditor`는 preview target 또는 CodeMirror line scroll을 성공했을 때만 handled로 보고한다. `MetadataPanel`은 registered navigator가 target을 처리하지 못하면 DOM `data-outline-heading-id` fallback으로 스크롤한다. PR review follow-up으로 `DocumentEditor`의 저장 전 `contentMarkdown` state를 `AppShell` outline document context에 등록해 metadata outline이 live markdown을 우선 사용하게 했고, selector escaping utility는 `lib/outline-targets.ts`로 공유했다. PR review loop 누락 원인은 completion rule이 wiki에는 있었지만 `AGENTS.md`의 hard rule로 고정되지 않았고, draft PR 생성과 review request/wait/recheck 단계가 별도 상태처럼 쓰인 점이었다. `AGENTS.md`, [[Local Development Workflow]], [[Wiki Maintenance Automation]]에 push/PR 선택이 review workflow 시작이라는 규칙, 5분 대기, review thread/CI 재확인, blocker 보고 요구를 명시했다. Plan의 final status checkbox도 구현 완료 상태에 맞춰 갱신했다.
- Pages: [[log|Wiki Log]], [[Local Development Workflow]], [[Wiki Maintenance Automation]].
- Source evidence: final code review, GitHub PR #45 review threads, `AGENTS.md`, `components/app-shell.tsx`, `components/document-editor.tsx`, `components/metadata-panel.tsx`, `lib/outline-targets.ts`, `tests/components/app-shell.test.tsx`, `tests/components/metadata-panel.test.tsx`, `docs/superpowers/plans/2026-05-16-metadata-panel-outline.md`.
- Verification: `pnpm exec vitest run tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/components/metadata-panel.test.tsx tests/components/document-editor-preview.test.tsx tests/components/app-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:lint`.

## 2026-05-16T23:55:00+09:00 - implementation

- Result: Issue #44 metadata panel outline navigation 구현 상태를 durable wiki에 반영했다.
- Coverage: metadata panel 첫 번째 `Outline` tab, `#`-`####` ATX heading extraction, frontmatter/fenced-code/empty-heading exclusion, `DocumentNavigation`-style `border-l` guide lines, preview `data-outline-heading-id`, edit mode CodeMirror line scroll, DOM fallback navigation을 기록했다.
- Changed files: `wiki/Document Editing Workflow.md`, `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`, `docs/superpowers/plans/2026-05-16-metadata-panel-outline.md`.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #44, `docs/superpowers/specs/2026-05-16-metadata-panel-outline-design.md`, `docs/superpowers/plans/2026-05-16-metadata-panel-outline.md`, `lib/markdown/folding.ts`, `components/metadata-panel.tsx`, `components/document-editor.tsx`, `components/app-shell.tsx`, `tests/markdown/outline.test.ts`, `tests/components/metadata-panel.test.tsx`, `tests/components/document-editor-preview.test.tsx`, `tests/components/app-shell.test.tsx`.
- Verification: `pnpm exec vitest run tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/components/metadata-panel.test.tsx tests/components/document-editor-preview.test.tsx tests/components/app-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-05-16T23:19:24+09:00 - design

- Result: metadata panel outline 기능 설계를 승인하고 spec으로 기록했다.
- Coverage: 오른쪽 metadata panel 첫 번째 icon tab으로 `Outline`을 추가하고, 현재 선택 문서의 `#`-`####` heading을 tree로 추출하며, `DocumentNavigation`과 같은 vertical guide line으로 level을 구분하고 row click으로 해당 heading에 스크롤하는 방향을 확정했다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: 사용자 승인, visual companion mockup, `components/metadata-panel.tsx`, `components/document-list.tsx`, `components/document-navigation.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `docs/superpowers/specs/2026-05-16-metadata-panel-outline-design.md`.
- Verification: spec self-review.

## 2026-05-16T19:35:00+09:00 - polish

- Result: Issue #42 metadata panel reopen icon 위치를 조정했다.
- Coverage: 오른쪽 panel collapse 후 남는 `Open metadata panel` icon을 화면 우측 상단에 더 맞게 `right-4 top-1.5` 위치로 조정했다.
- Pages: [[log|Wiki Log]].
- Source evidence: 사용자 UI 조정, `components/app-shell.tsx`, `tests/components/app-shell.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/app-shell.test.tsx`.

## 2026-05-16T19:05:00+09:00 - implementation

- Result: Issue #42 metadata panel tab UI와 오른쪽 panel collapse control을 추가했다.
- Coverage: `MetadataPanel` 상단에 `document-list.tsx` toolbar와 같은 icon tab 영역을 두고 `Attachments`, `Versions`, `Audit log`를 버튼 클릭 시 해당 목록만 표시하도록 바꿨다. Attachments tab이 기본으로 열리고, Versions/Audit log tab은 빈 목록일 때 empty state를 표시한다. Metadata panel toolbar와 reopen icon은 sidebar toolbar와 같은 tooltip pattern을 사용한다. 기존 metadata panel의 local graph UI와 기능은 제거했다. `AppShell`은 오른쪽 panel open/collapse state를 소유하며, metadata panel close button은 오른쪽 sidebar를 제거하고 화면 우측 상단 reopen icon 하나만 남긴다. 오른쪽 sidebar는 좌측 sidebar와 같은 `pt-0` alignment를 사용한다.
- Pages: [[Document Editing Workflow]], [[Munjib]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #42, 사용자 제공 Obsidian metadata panel screenshot, `components/metadata-panel.tsx`, `components/app-shell.tsx`, `tests/components/metadata-panel.test.tsx`, `tests/components/app-shell.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/components/metadata-panel.test.tsx tests/components/app-shell.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-16T18:40:49+09:00 - review follow-up

- Result: PR #41 review feedback를 반영했다.
- Coverage: Markdown import는 zero-byte empty file selection을 required-file error로 처리하고, title derivation은 YAML block scalar marker를 fallback 대상으로 처리한다. 첫 ATX heading fallback은 fenced code block 내부의 `# ...` line을 건너뛰며, settings dialog는 backdrop click으로 닫힌다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #41 review threads, `app/workspaces/[workspaceSlug]/actions.ts`, `components/document-list.tsx`, `lib/documents/import-markdown.ts`, `tests/components/document-list.test.tsx`, `tests/documents/import-markdown.test.ts`.
- Verification: `pnpm exec vitest run tests/documents/import-markdown.test.ts tests/components/document-list.test.tsx`.

## 2026-05-16T17:30:00+09:00 - implementation

- Result: Issue #40 Markdown document import 1차 기능을 추가했다.
- Coverage: `Company Handbook` title row 우측에 toolbar icon과 오른쪽 edge를 맞춘 workspace settings button을 추가했다. Settings button은 document list를 교체하지 않고 modal dialog를 띄우며, dialog 내부는 좌측 settings sidebar와 우측 content pane으로 구성된다. 현재는 `Import` menu를 기본 선택한다. Import content는 Markdown 전용 file form만 제공하고, import validation error는 `lib/service-errors.ts`의 `SERVICE_ERROR_CODES`로 전역 관리한다. Server action은 Markdown file을 읽어 `title` frontmatter, 첫 `# Heading`, file name 순서로 문서 제목을 정한 뒤 기존 `createDocument()` 흐름으로 document, initial version, wiki link/document metadata reconciliation, audit log를 만든다.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #40, 사용자 제공 Notion import screenshots, `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `lib/documents/import-markdown.ts`, `tests/components/document-list.test.tsx`, `tests/documents/import-markdown.test.ts`, `docs/superpowers/specs/2026-05-16-markdown-document-import-design.md`, `docs/superpowers/plans/2026-05-16-markdown-document-import.md`.
- Verification: `pnpm exec vitest run tests/documents/import-markdown.test.ts tests/components/document-list.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-16T16:55:00+09:00 - review follow-up

- Result: PR #39 review feedback를 반영했다.
- Coverage: graph node label Y offset 계산에 쓰이던 literal `8`을 `LABEL_VERTICAL_OFFSET` constant로 추출했다. 동작 변경 없이 readability만 보강한 review follow-up이다.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #39 Gemini review comment, `components/knowledge-graph-view.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-16T13:16:00+09:00 - maintenance

- Result: task 종료와 PR review follow-up 운영 규칙을 wiki에 추가했다.
- Coverage: 모든 task 종료 시 검증과 wiki sync 이후 draft PR을 자동 작성한다. PR 리뷰 요청 완료 후 최소 5분 대기하고, review submission, unresolved thread, inline comment, CI/check 결과를 확인해 actionable feedback이나 실패 check가 있으면 같은 branch에서 추가 수정, 검증, wiki update, commit, push까지 수행한다.
- Pages: [[Local Development Workflow]], [[Wiki Maintenance Automation]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: 사용자 workflow 결정.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-16T12:40:00+09:00 - implementation

- Result: Issue #38 graph settings panel polish를 적용했다.
- Coverage: `KnowledgeGraphView` settings panel을 graph canvas 우측 상단으로 옮기고 `bg-muted` surface로 맞췄다. Panel-level `X` close는 전체 설정창을 숨기고 같은 위치에 reopen icon만 남긴다. `Filters`, `Display`, `Forces` section toggle은 `DocumentNavigation`과 같은 chevron icon을 section text 좌측에 배치한 button을 사용하며, `X` close는 `Filters` header row 우측에 배치한다. Hover focus가 활성일 때 연결되지 않은 node circle과 label을 더 낮은 alpha로 흐리게 표시해 1-hop highlight가 더 두드러지게 했다. Node label은 circle 중심과 겹치지 않도록 node center보다 아래에 그리고, 일정 수준 이상 줌아웃하면 숨긴다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #38, 사용자 제공 Obsidian graph screenshot, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`.

## 2026-05-16T12:08:00+09:00 - review follow-up

- Result: PR #37 graph display control regression을 정리했다.
- Coverage: `Text fade threshold`가 force controls 조작 이후 cooled graph canvas에서 다시 반영되지 않는 문제를 수정했다. Display state 변경 시 `react-force-graph-2d` graph ref의 animation loop를 재개해 custom label drawing이 다시 repaint되도록 했다. 추가 PR review에서 지적된 stale hovered node id도 방어해, graph refresh/removal 이후 존재하지 않는 hover target이 전체 graph를 dim 처리하지 않도록 했다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #37 review follow-up, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`.

## 2026-05-16T01:22:05+09:00 - implementation

- Result: Issue #36 workspace knowledge graph view에 Display와 Forces 설정을 추가했다.
- Coverage: Graph panel은 `Filters` 아래에 `Display`와 `Forces` section을 표시한다. Display controls는 arrows, text fade threshold, node size, link thickness를 `react-force-graph-2d` props와 label drawing에 반영한다. Forces controls는 center force, repel force, link force, link distance를 graph ref의 `d3Force` API에 적용한다. Review follow-up으로 center force는 `forceCenter.strength()`가 아니라 custom `munjib-center` gravity force를 등록하도록 바꿨고, dynamic graph ref가 늦게 mount되어도 기본 force 설정이 적용되도록 했다. Graph link color는 relation-kind color 대신 neutral gray로 통일하고, selected document 또는 hovered node의 1-hop focus link만 더 밝게 표시한다. Graph mode는 normal editor padding 없이 center 영역 높이를 채우고, canvas background는 `DocumentToolbar`와 같은 흰색 surface를 사용한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #36, 사용자 제공 Obsidian graph screenshot, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`, `docs/superpowers/specs/2026-05-16-knowledge-graph-display-force-controls-design.md`, `docs/superpowers/plans/2026-05-16-knowledge-graph-display-force-controls.md`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`, `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx tests/workspace-routes.test.ts`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`, `pnpm run test:e2e`.

## 2026-05-16T00:54:25+09:00 - review follow-up

- Result: PR #35 workspace knowledge graph view review feedback를 반영했다.
- Coverage: `react-force-graph-2d`가 renderer node/link 객체에 붙이는 layout state를 유지하기 위해 renderer 전용 graph 객체 cache를 추가하되, source `KnowledgeGraphData`는 mutation되지 않게 분리했다. 선택 문서가 있을 때는 1-hop 이웃 node/link만 원래 색상으로 유지하고 나머지는 alpha 색상으로 dim 처리한다.
- Pages: [[Document Editing Workflow]], [[Document Knowledge Model]], [[log|Wiki Log]].
- Source evidence: PR #35 Gemini review comments, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`, `pnpm exec vitest run tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/workspace-routes.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-16T00:16:54+09:00 - implementation

- Result: Issue #34 workspace knowledge graph view의 e2e smoke와 durable wiki 문서를 마무리했다.
- Coverage: Sidebar `Graph` 진입, `?graph=1` graph mode, toolbar `Graph view` path, filter panel open/close, graph DTO의 document/tag/wiki/property node와 wiki/tag/property edge semantics, frontmatter wiki link의 graph rendering을 기록했다.
- Pages: [[Document Editing Workflow]], [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #34, `tests/e2e/login.spec.ts`, `components/document-list.tsx`, `components/knowledge-graph-view.tsx`, `components/workspace-center-shell.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `lib/workspace-routes.ts`, `lib/knowledge-graph/model.ts`, `tests/components/knowledge-graph-view.test.tsx`, `tests/knowledge-graph/model.test.ts`.
- Verification: `pnpm run test:e2e`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm exec vitest run tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/workspace-routes.test.ts`, `pnpm exec tsc --noEmit`, `pnpm wiki:sync-check --staged`.

## 2026-05-15T23:07:00+09:00 - plan

- Result: Issue #34 workspace knowledge graph view 구현 계획을 작성했다.
- Coverage: Route helper, graph model, sidebar graph button, workspace shell graph mode, `react-force-graph-2d` graph component, page data wiring, e2e/wiki finalization을 TDD task 단위로 분해했다.
- Pages: [[Document Editing Workflow]], [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-15-workspace-knowledge-graph-view.md`, `docs/superpowers/specs/2026-05-15-workspace-knowledge-graph-view-design.md`.
- Verification: plan self-review, `pnpm wiki:sync-check --staged`, `pnpm wiki:lint`.

## 2026-05-15T22:53:00+09:00 - design

- Result: Issue #34 workspace knowledge graph view 설계를 정리했다.
- Coverage: Sidebar `Graph` icon button, `?graph=1` route state, center graph view, document/tag/wiki/property node model, `react-force-graph-2d` 기반 zoom/pan graph renderer, filter panel, selected document focus behavior를 설계 범위로 확정했다.
- Pages: [[Document Editing Workflow]], [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: GitHub issue #34, `docs/superpowers/specs/2026-05-15-workspace-knowledge-graph-view-design.md`, 사용자 제공 Obsidian graph screenshot.
- Verification: design only.

## 2026-05-14T23:52:00+09:00 - review follow-up

- Result: PR #33 review에서 지적된 sidebar panel 전환 안정성과 Escape UX 회귀를 정리했다.
- Coverage: `DocumentList`의 panel switching handlers를 memoized callback으로 고정해 keyboard shortcut effect가 불필요하게 재등록되지 않도록 했고, search/favorites panel 활성 상태에서 `Escape`가 기본 document list로 되돌아가도록 했다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #33 Gemini review comments, `components/document-list.tsx`, `components/document-navigation.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/components/app-shell.test.tsx tests/components/workspace-center-shell.test.tsx tests/workspace-routes.test.ts`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`.

## 2026-05-14T22:44:00+09:00 - implementation

- Result: Issue #32 document list sidebar를 Obsidian 참고 이미지에 맞춰 단순화했다.
- Coverage: WORKSPACE label과 always-visible title/body search form, quick switcher, template selection을 제거했다. `Company Handbook` 제목 아래에 icon-only `Documents`, `New document`, `New folder`, `Search`, `Favorites` toolbar를 배치했고, left sidebar top padding을 제거해 `Company Handbook` row는 `DocumentTabs`, icon toolbar row는 `DocumentToolbar`와 vertical alignment를 맞춘다. Document creation은 항상 blank `Untitled` 문서로 시작한다. `Search` button과 `Ctrl+K`는 document list 영역을 검색 결과 panel로 전환하고, `Favorites` button은 favorites-only panel로 전환하며, folder-shaped `Documents` button은 기본 document list로 되돌린다. 각 toolbar icon은 shadcn/Radix Tooltip hover 설명을 제공한다. 기존에 `Recents` 위로 favorites section을 상시 노출하던 코드는 제거했다. `Recents` / `Documents` section label은 기존 uppercase/tracking style로 복구하고, document/folder row hover 및 selected highlight를 `bg-slate-200`으로 강화했다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #32, 사용자 제공 Obsidian screenshot, `components/document-list.tsx`, `components/document-create-controls.tsx`, `components/document-navigation.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `tests/components/document-list.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/components/workspace-center-shell.test.tsx tests/workspace-routes.test.ts`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`.

## 2026-05-14T00:55:00+09:00 - implementation

- Result: Issue #31 Obsidian-style document title and mode toolbar UI를 구현했다.
- Coverage: Document title input을 borderless heading-size control로 변경했다. Edit/preview text controls는 editor 내부에서 제거하고 navigation toolbar 오른쪽 single icon toggle로 이동했다. Toolbar path는 left navigation buttons와 right mode toggle 사이의 centered column에 표시된다. Mode 전환 시 workspace center scroll position을 보존한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #31, 사용자 제공 Obsidian screenshot, `components/document-editor.tsx`, `components/document-toolbar.tsx`, `components/document-view-mode.tsx`, `components/workspace-center-shell.tsx`, `tests/components/document-editor-preview.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/components/workspace-center-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`.

## 2026-05-13T00:20:00+09:00 - refinement

- Result: Issue #29 document tabs와 navigation toolbar의 후속 UI 피드백을 반영했다.
- Coverage: App shell을 viewport height에 고정해 workspace root vertical scroll을 제거하되, 다른 routes의 document root scroll은 막지 않는다. Tab strip `+` button은 마지막 tab 바로 오른쪽에 배치하고, row 폭이 부족하면 tab width를 함께 줄인다. Minimum width 이후 overflow tab은 horizontal scroll로 접근 가능하게 했다. Sidebar Open in new tab은 search result context의 `q` query를 유지한다. Toolbar forward button은 readable document forward target이 있을 때만 활성화한다. Review follow-up으로 tab reconciliation과 document history edge-case 표현을 명확히 했다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 피드백, PR #30 review feedback, `components/app-shell.tsx`, `app/globals.css`, `components/document-tabs.tsx`, `components/document-navigation.tsx`, `components/document-toolbar.tsx`, `components/workspace-center-shell.tsx`, `lib/document-tabs.ts`, `docs/superpowers/specs/2026-05-11-document-tabs-navigation-toolbar-design.md`, `tests/document-tabs.test.ts`, `tests/components/workspace-center-shell.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/document-tabs.test.ts tests/components/workspace-center-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`.

## 2026-05-12T00:00:00+09:00 - review

- Result: Issue #29 document tabs behavior를 사용자 피드백에 맞춰 조정했다.
- Coverage: 일반 document 선택은 현재 active tab을 교체하고, tab strip 오른쪽 `+` button과 sidebar document row `...` menu의 Open in new tab만 새 tab instance를 추가한다. Inactive tab close는 현재 folder/root context를 유지한다. Root body vertical scroll은 app shell 안쪽 scroll container로 한정했다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 피드백, `lib/document-tabs.ts`, `components/use-document-tabs.ts`, `components/document-tabs.tsx`, `components/document-navigation.tsx`, `components/workspace-center-shell.tsx`, `app/globals.css`, `tests/document-tabs.test.ts`, `tests/components/workspace-center-shell.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/document-tabs.test.ts tests/components/workspace-center-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`.

## 2026-05-11T00:30:00+09:00 - implementation

- Result: Issue #29 document tabs and navigation toolbar를 구현했다.
- Coverage: workspace center 상단 tab strip, workspace-scoped `localStorage` tab state, active `?document=<id>` routing, tab close target selection, browser history back/forward toolbar, current document/folder path display, unit/component/e2e coverage.
- Pages: [[Document Editing Workflow]], [[Folder Hierarchy Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #29, `lib/document-tabs.ts`, `components/workspace-center-shell.tsx`, `components/document-tabs.tsx`, `components/document-toolbar.tsx`, `components/use-document-tabs.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/document-tabs.test.ts`, `tests/components/workspace-center-shell.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/document-tabs.test.ts tests/components/workspace-center-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`, browser visual check.

## 2026-05-11T00:15:00+09:00 - plan

- Result: Issue #29 document tabs and navigation toolbar implementation plan을 추가했다.
- Coverage: pure tab state model, workspace center chrome components, App Router page wiring, Playwright smoke, browser visual check, wiki maintenance 순서.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-11-document-tabs-navigation-toolbar.md`.

## 2026-05-11T00:00:00+09:00 - design

- Result: Issue #29 document tabs and navigation toolbar 설계를 추가했다.
- Coverage: Obsidian 참고 이미지 `wiki/designs/obsidian1.png` 기준의 상단 문서 탭 strip, 탭 하단 browser history 기반 back/forward toolbar, 현재 document/folder path 표시, workspace-scoped `localStorage` 탭 상태, 기존 `?document=<id>` active routing 유지, multi-editor unsaved buffer 보존 제외 범위를 정리했다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[Folder Hierarchy Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #29, `docs/superpowers/specs/2026-05-11-document-tabs-navigation-toolbar-design.md`, `wiki/designs/obsidian1.png`.

## 2026-05-10T17:55:00+09:00 - review

- Result: PR #27 review를 반영해 heading folding의 CRLF preview scan, no-heading preview rendering, live editor fold persistence를 보강했다.
- Coverage: Preview helper는 original offset을 보존하는 CRLF-safe line scan을 사용하고, shared definition scan은 CRLF fenced code block 종료를 인식한다. Heading 없는 preview는 definition을 재첨부하지 않으며, edit mode fold 저장은 stale React state 대신 CodeMirror live document text에서 fold tree를 계산한다. Fold key validation은 stable sorted output을 반환한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #27 review comments, `components/document-editor.tsx`, `lib/markdown/folding.ts`, `tests/markdown/folding.test.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-10T17:40:00+09:00 - review

- Result: Preview heading folding follow-up으로 chevron hover/focus 배경과 border/ring 제거, heading level별 section spacing, CRLF fenced code block 뒤 heading 인식 문제를 보정했다.
- Coverage: Preview chevron은 content flow를 밀지 않는 absolute 배치를 유지하면서 hover background와 focus border/ring을 쓰지 않는다. `#`, `##`, `###` section에는 level별 margin을 적용하고, CRLF 문서의 backtick code fence 종료도 parser가 인식한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 요청, `components/document-editor.tsx`, `lib/markdown/folding.ts`, `tests/markdown/folding.test.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-10T00:00:00+09:00 - review

- Result: Issue #26 folder/document row navigation polish를 보강했다.
- Coverage: `FOLDER_NOT_EMPTY` user feedback은 redirect와 `folderError` query 없이 server action result를 받아 shadcn Sonner toast로 표시한다. PR review에 따라 favorite folder row menu, folder trash confirmation, write-permitted document trash action, row-level document trash conditional navigation, folder rename/archive context preservation, create action server redirect preservation을 반영했다. Row action menu는 외부 클릭 시 닫히고, document row hover/selected highlight와 sidebar section/row font-size 조정을 유지한다.
- Pages: [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 피드백, `components/document-create-controls.tsx`, `components/ui/sonner.tsx`, `app/layout.tsx`, `components/document-navigation.tsx`, `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `package.json`, `tests/e2e/login.spec.ts`.

## 2026-05-08T01:00:00+09:00 - review

- Result: Preview heading chevron이 heading content를 밀어내지 않도록 absolute overlay 배치로 조정했다.
- Coverage: 접힘/펼침 button은 heading 왼쪽 flow 바깥에 배치하고, expanded hover/focus 노출과 folded 상시 노출 behavior는 유지한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 요청, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-06T01:05:00+09:00 - review

- Result: Issue #25 final review blocker를 반영해 edit mode CodeMirror folding도 preview와 같은 문서별 fold state를 저장하고, preview chunk의 multi-line reference/footnote definition 공유를 보강했다.
- Coverage: CodeMirror `foldedRanges`를 heading body line range와 CodeMirror heading fold range 모두에 matching해 `munjib:heading-folds:<documentId>`에 raw heading key를 저장한다. Preview chunk 공유 definition은 empty marker line과 definition line 뒤의 indented/blank continuation line까지 포함한다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: final review blockers, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`, GitHub issue #25.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-06T00:45:00+09:00 - review

- Result: Issue #25 final review blocker를 반영해 heading-folded preview chunk에서도 문서 전체 Markdown reference definition을 공유하고, stale planned wording을 현재 구현 상태로 정리했다.
- Coverage: `[ref][x]`와 `[x]: https://example.com`이 서로 다른 heading section에 있어도 preview link가 resolve되며, Munjib/PRD/index 상태판이 edit/preview와 heading folding 구현 완료 상태를 말한다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: final review blockers, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`, GitHub issue #25.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-05-06T00:43:00+09:00 - implementation

- Result: Issue #26 folder row hover actions menu를 구현했다.
- Coverage: folder row hover/focus highlight, path-qualified action labels, `...` menu, row-level `+` document creation, inline folder rename, empty folder trash, non-empty folder trash guard feedback, folder favorites, document favorite menu migration, always-visible star icon removal.
- Pages: [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #26, `components/document-navigation.tsx`, `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec tsc --noEmit`, `pnpm run test:e2e`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-05-05T23:58:00+09:00 - plan

- Result: Issue #26 folder row hover actions menu implementation plan을 추가했다.
- Coverage: folder mutation actions, sidebar action prop threading, document/folder row menus, folder favorite/error UI, Playwright smoke, wiki maintenance 순서.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-05-folder-row-hover-actions-menu.md`.

## 2026-05-05T23:55:00+09:00 - design

- Result: Issue #26 folder row hover actions menu 설계를 추가하고 Notion-style 참고 이미지 `wiki/designs/notion1.png`를 design evidence로 등록했다.
- Coverage: folder row hover highlight, `...` menu, row-level `+` child document creation, folder rename/archive/favorite actions, existing star icon removal and document favorite menu migration.
- Pages: [[designs/index|UI Design Excalidraw Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #26, `docs/superpowers/specs/2026-05-05-folder-row-hover-actions-menu-design.md`, `wiki/designs/notion1.png`.

## 2026-05-05T23:50:00+09:00 - implementation

- Result: Issue #25에서 markdown heading folding을 구현하고 split mode를 제거했다.
- Coverage: Preview heading chevron folding, edit mode CodeMirror fold gutter/restoration, 문서별 `localStorage` fold state, wiki-link preview regression.
- Pages: [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: GitHub issue #25, `components/document-editor.tsx`, `lib/markdown/folding.ts`, `tests/markdown/folding.test.ts`, `tests/components/document-editor-preview.test.tsx`, `tests/wiki-links/preview.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-05-05T23:45:00+09:00 - planning

- Result: Issue #25 Markdown heading folding 구현 계획을 작성했다.
- Coverage: markdown folding pure model, preview chevron UI와 localStorage, CodeMirror fold restoration, split mode 제거, regression/wiki verification tasks.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-05-markdown-heading-folding.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-05T23:35:00+09:00 - maintenance

- Result: 기존 feature branch에 다른 issue 작업이 있으면 `git worktree` 또는 clean `main` checkout으로 새 작업공간을 분리해야 한다는 운영 규칙을 추가했다.
- Coverage: `wiki:feature-start`가 이미 feature branch에서는 새 branch를 만들지 않는 동작의 전제, worktree 사용 예시, issue #25 branch separation recovery.
- Pages: [[Local Development Workflow]], [[Wiki Maintenance Automation]], [[log|Wiki Log]].
- Source evidence: Issue #25 설계 커밋을 `issue-23-centralize-service-error-codes`에서 `issue-25-markdown-heading-folding`으로 분리한 작업.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-05T23:10:00+09:00 - review

- Result: PR #24 리뷰를 반영해 document service에 남아 있던 document 관련 error code literal을 `SERVICE_ERROR_CODES`에 추가했다.
- Coverage: `DOCUMENT_NOT_FOUND`, `DOCUMENT_VERSION_NOT_FOUND`, `DOCUMENT_LINK_NOT_FOUND`를 service error registry에 포함하고 document service가 상수를 참조하도록 변경.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: PR #24 review comments, `lib/service-errors.ts`, `lib/documents/service.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts tests/documents/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T22:55:00+09:00 - review

- Result: PR #22 추가 리뷰를 반영해 slash-containing title link가 path-qualified fallback 때문에 깨지지 않도록 보강했다.
- Coverage: path-qualified document path를 먼저 resolve하고, path match가 없으면 `[[Q1/Q2 Plan]]` 같은 slash-containing title을 title slug로 fallback resolve한다. Broken link creation도 parent folder path가 없으면 root slash-title 문서로 생성한다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #22 review comments, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `lib/documents/service.ts`, `tests/wiki-links/reconcile.test.ts`, `tests/wiki-links/preview.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T18:20:00+09:00 - design

- Result: Issue #25 Markdown heading folding 설계를 기록했다.
- Coverage: Obsidian-style heading hierarchy folding, Preview chevron hover/focus behavior, Edit mode CodeMirror heading folding, 문서별 `localStorage` fold state, split mode 제거 계획.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #25, `docs/superpowers/specs/2026-05-05-markdown-heading-folding-design.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-05T15:25:00+09:00 - review

- Result: PR #22 추가 리뷰를 반영해 path-qualified broken link creation과 folder move slug 충돌을 수정했다.
- Coverage: `[[Operations/Incident Runbook]]` broken link에서 `/operations` folder 아래 `Incident Runbook` 문서 생성, 다음 reconciliation에서도 link 유지, folder move 시 destination sibling slug 재계산.
- Pages: [[Folder Hierarchy Model]], [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #22 review comments, `lib/documents/service.ts`, `lib/folders/service.ts`, `lib/wiki-links/targets.ts`, `tests/folders/service.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts`, `pnpm exec vitest run tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T15:05:00+09:00 - implementation

- Result: Issue #23에서 folder/document service error code 문자열을 `SERVICE_ERROR_CODES`로 중앙화했다.
- Coverage: workspace/folder not found, parent folder not found, folder move cycle, non-empty folder archive, document slug retry exhaustion code를 `lib/service-errors.ts`로 이동하고 service/tests가 상수를 참조하도록 변경.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #23, PR #22 Gemini review comments, `lib/service-errors.ts`, `lib/folders/service.ts`, `lib/documents/service.ts`, `tests/folders/service.test.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts tests/documents/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T14:45:00+09:00 - review

- Result: PR #22 리뷰 1,2번을 반영해 folder parent workspace 검증과 path-qualified wiki target 정규화를 보강했다.
- Coverage: `createFolder`/`moveFolder`에서 parent folder가 같은 workspace의 active folder인지 검증, `[[Operations/Incident Runbook]]` 같은 multi-word path-qualified target의 reconcile/preview resolve.
- Pages: [[Folder Hierarchy Model]], [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #22 review comments, `lib/folders/service.ts`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `tests/folders/service.test.ts`, `tests/wiki-links/reconcile.test.ts`, `tests/wiki-links/preview.test.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts`, `pnpm exec vitest run tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T14:20:00+09:00 - implementation

- Result: Workspace sidebar folder tree를 editor navigation link에서 accordion disclosure UI로 조정했다.
- Coverage: folder row chevron toggle, 펼쳐진 child group 세로 guide line, folder toggle 시 editor 유지, `Recents` 최대 5개 표시, recents depth-independent padding, 전체 tree의 `Documents` heading.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: `components/document-navigation.tsx`, `tests/e2e/login.spec.ts`, `wiki/designs/obsidian1.png`, `docs/superpowers/plans/2026-05-05-real-folder-hierarchy.md`.
- Verification: `pnpm exec tsc --noEmit`, `pnpm exec vitest run tests/workspace-tree.test.ts`, `pnpm run test:e2e`.

## 2026-05-05T13:00:00+09:00 - implementation

- Result: Issue #20 최종 integration을 위해 seed data와 project wiki 현황을 실제 folder hierarchy 구현 기준으로 정리했다.
- Coverage: `/operations` folder seed, folder 하위 `Operations Runbook` seed, folder-like 문서 생성 표현 제거, PRD/제품/index 문서의 구현 현황 갱신.
- Pages: [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Folder Hierarchy Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `prisma/seed.ts`, `wiki/Munjib.md`, `wiki/Project PRD.md`, `wiki/Document Knowledge Model.md`, `wiki/Folder Hierarchy Model.md`, `wiki/index.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm exec vitest run tests/folders/path.test.ts tests/folders/service.test.ts tests/documents/service.test.ts tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts tests/wiki-links/autocomplete.test.ts tests/workspace-tree.test.ts`, `pnpm test`, `pnpm run build`, `pnpm run test:e2e`, `pnpm exec tsc --noEmit`.

## 2026-05-05T12:50:00+09:00 - implementation

- Result: Wiki link autocomplete가 duplicate title 후보에 path-qualified target을 삽입하도록 변경했다.
- Coverage: title/path query matching, duplicate title count 기반 `[[Folder/Title]]` insert text, editor suggestion label과 insertion wiring.
- Pages: [[Wiki Links And Backlinks]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/wiki-links/autocomplete.ts`, `components/document-editor.tsx`, `tests/wiki-links/autocomplete.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/autocomplete.test.ts tests/wiki-links/preview.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T12:45:00+09:00 - implementation

- Result: Issue #20 workspace 화면을 folder/document tree로 전환하고, `New folder`를 실제 `Folder` row 생성으로 분리했다.
- Coverage: active folders 조회, readable document filtering helper, folder selection query, folder detail panel, selected-folder document creation, path-aware navigation/quick switcher labels, schema 변경에 맞춘 seed upsert key 조정.
- Pages: [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/page.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `components/document-list.tsx`, `components/document-navigation.tsx`, `components/folder-detail.tsx`, `lib/workspace-tree.ts`, `prisma/seed.ts`, `tests/workspace-tree.test.ts`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/workspace-tree.test.ts tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts tests/documents/service.test.ts tests/folders/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T01:00:00+09:00 - implementation

- Result: Wiki link reconciliation과 preview가 folder path를 인식하도록 변경했다.
- Coverage: path-qualified wikilink의 document path resolve, duplicate title-only link의 `isAmbiguous` 저장, ambiguous link panel data, preview의 path-qualified rendering과 ambiguous plain text fallback.
- Pages: [[Wiki Links And Backlinks]], [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `lib/wiki-links/service.ts`, `lib/wiki-links/types.ts`, `tests/wiki-links/reconcile.test.ts`, `tests/wiki-links/preview.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts`.

## 2026-05-05T00:50:00+09:00 - implementation

- Result: Document service를 folder-aware하게 변경했다.
- Coverage: `CreateDocumentInput.folderId`, folder별 document slug/path 계산, duplicate title의 cross-folder 허용, title update/version restore path 보존, `moveDocument()`와 `document.moved` audit log.
- Pages: [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/documents/service.ts`, `lib/documents/types.ts`, `tests/documents/service.test.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts tests/documents/service.test.ts`.

## 2026-05-05T00:40:00+09:00 - implementation

- Result: Folder service를 추가했다.
- Coverage: create, rename, move, archive folder mutation, workspace write 권한 검사, audit log 기록, descendant path recalculation, move cycle guard, non-empty archive guard.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: `lib/folders/service.ts`, `lib/folders/types.ts`, `tests/folders/service.test.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts`.

## 2026-05-05T00:30:00+09:00 - implementation

- Result: Folder hierarchy path helper를 추가했다.
- Coverage: root/nested folder path 정규화, parent path와 child slug 결합, document path를 path-qualified wikilink target label로 변환.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: `lib/folders/path.ts`, `tests/folders/path.test.ts`.
- Verification: `pnpm exec vitest run tests/folders/path.test.ts`.

## 2026-05-05T00:20:00+09:00 - implementation

- Result: Issue #20 folder hierarchy의 첫 구현 단계로 Prisma schema와 migration에 `Folder`, `Document.folderId`, `DocumentLink.isAmbiguous`를 추가했다.
- Coverage: workspace-folder relation, nested folder parent relation, folder/document path uniqueness, root/folder별 slug partial unique index, folder creator/updater relation, ambiguous wiki link 저장 필드.
- Pages: [[Document Knowledge Model]], [[log|Wiki Log]].
- Source evidence: `prisma/schema.prisma`, `prisma/migrations/20260505001000_add_folder_hierarchy/migration.sql`.
- Verification: `pnpm exec prisma validate`, `pnpm exec prisma generate`, `pnpm exec prisma migrate deploy`.

## 2026-05-05T00:00:00+09:00 - planning

- Result: Issue #20 실제 folder hierarchy 구현 계획을 작성했다.
- Coverage: Prisma `Folder` schema, path helper, folder service, folder-aware document service, path-qualified wikilink resolution, ambiguous link 상태, workspace tree UI, autocomplete, seed, wiki maintenance, verification command 순서.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-05-real-folder-hierarchy.md`, `docs/superpowers/specs/2026-05-04-real-folder-hierarchy-design.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-04T18:55:00+09:00 - planning

- Result: Issue #20 실제 folder hierarchy 설계를 wiki에 반영했다. `Folder`는 별도 컨테이너 model이고, `Document.folderId`와 path 기반 위치를 사용하며, 서로 다른 folder의 duplicate title을 허용한다.
- Coverage: path-qualified wikilink, title-only ambiguous link fallback, workspace-write folder 관리 권한, folder-specific permission 제외, 비어 있지 않은 folder archive 차단, 관련 implementation plan 필수 wiki 업데이트 범위.
- Pages: [[Folder Hierarchy Model]], [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #20, `docs/superpowers/specs/2026-05-04-real-folder-hierarchy-design.md`, Obsidian Hub beginner guide, `prisma/schema.prisma`, `lib/documents/service.ts`, `lib/wiki-links/preview.ts`, `lib/wiki-links/reconcile.ts`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-04T18:00:00+09:00 - maintenance

- Result: `Document Knowledge Model`에 현재 `prisma/schema.prisma` 전체 model set을 Mermaid `erDiagram`으로 추가했다.
- Coverage: 조직, workspace, 사용자 membership, 문서 tree/version/link, tag/property, attachment/comment, permission, audit log 관계를 한 다이어그램에서 확인할 수 있게 했다.
- Pages: [[Document Knowledge Model]], [[log|Wiki Log]].
- Source evidence: GitHub issue #21, `prisma/schema.prisma`, `docs/superpowers/specs/2026-05-04-mermaid-erd-wiki-design.md`, `docs/superpowers/plans/2026-05-04-mermaid-erd-wiki.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-04T17:50:00+09:00 - design

- Result: 현재 Prisma schema 전체를 `Document Knowledge Model`에 Mermaid `erDiagram`으로 추가하기 위한 설계를 확정했다.
- Coverage: ERD 대상은 `prisma/schema.prisma`의 전체 model set이며, enum은 Mermaid entity로 분리하지 않고 기존 prose 설명에 유지한다.
- Pages: [[Document Knowledge Model]], [[log|Wiki Log]].
- Source evidence: GitHub issue #21, `docs/superpowers/specs/2026-05-04-mermaid-erd-wiki-design.md`, `prisma/schema.prisma`.
- Verification: spec self-review에서 placeholder, TODO, scope ambiguity 없음.

## 2026-05-04T12:35:00+09:00 - review

- Result: Properties Links row가 content 영역의 `[[...]]`와 backlinks를 포함하지 않고 YAML frontmatter `links:` 안의 `[[...]]` outgoing만 표시하도록 수정했다.
- Coverage: `parseFrontmatterWikiLinks()`가 YAML `links:` 배열만 읽고, `DocumentLink.sortOrder`가 markdown 파일의 links 배열 순서를 보존하며, `getDocumentLinkPanels()`는 현재 frontmatter `links:` 기준으로 stale/content link row를 필터링하고 그 순서로 outgoing links를 조회한다. Properties row는 frontmatter key 순서에 맞춰 `tags`와 `links` canonical row를 해당 key 위치에 렌더링한다.
- Pages: [[Wiki Links And Backlinks]], [[Document Knowledge Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 보고, `lib/wiki-links/parser.ts`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/service.ts`, `prisma/schema.prisma`, `prisma/migrations/20260504123500_add_document_link_sort_order/migration.sql`, `tests/wiki-links/parser.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/parser.test.ts tests/wiki-links/reconcile.test.ts tests/documents/service.test.ts`.

## 2026-05-04T12:25:00+09:00 - review

- Result: Properties 영역의 frontmatter property 표시 순서가 markdown 파일의 YAML key 순서와 달라지던 문제를 수정했다.
- Coverage: `DocumentProperty.sortOrder`를 추가하고 metadata reconciliation 시 YAML key 순서를 저장하며, workspace page는 `sortOrder` 기준으로 properties를 조회한다.
- Pages: [[Document Knowledge Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 보고, `prisma/schema.prisma`, `prisma/migrations/20260504122500_add_document_property_sort_order/migration.sql`, `lib/document-metadata/reconcile.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/documents/service.test.ts`.
- Verification: `pnpm exec vitest run tests/documents/service.test.ts tests/document-metadata/parser.test.ts tests/document-metadata/display.test.ts`.

## 2026-05-04T12:15:00+09:00 - review

- Result: Properties 영역에서 YAML frontmatter `links` key가 canonical Links row와 중복 표시되던 문제와 preview content 영역에 YAML frontmatter가 재차 표시되던 문제를 수정했다.
- Coverage: `links` frontmatter property는 일반 property 목록에서 숨기고, outgoing/backlink/broken link rendering은 기존 Links row에만 맡긴다. Markdown preview는 YAML frontmatter block을 제거한 본문만 렌더링한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 보고, `components/document-editor.tsx`, `lib/document-metadata/display.ts`, `lib/document-metadata/parser.ts`, `tests/document-metadata/display.test.ts`, `tests/document-metadata/parser.test.ts`.
- Verification: `pnpm exec vitest run tests/document-metadata/display.test.ts tests/document-metadata/parser.test.ts tests/wiki-links/preview.test.ts tests/wiki-links/parser.test.ts`.

## 2026-05-04T01:20:00+09:00 - review

- Source evidence: PR #17 review comments by Codex and Gemini, `lib/wiki/feature-start.ts`, `tests/wiki/feature-start.test.ts`, [[Wiki Maintenance Automation]].
- Affected pages: [[Wiki Maintenance Automation]], [[log|Wiki Log]].
- Result: feature-start workflow가 GitHub Enterprise 같은 custom host의 issue URL도 parse하고, command 실패 시 stderr를 우선 표시하도록 리뷰 피드백을 반영했다.
- Verification: `pnpm exec vitest run tests/wiki/feature-start.test.ts`, `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-04T00:00:00+09:00 - maintenance

- Source evidence: GitHub issue #16, `docs/superpowers/specs/2026-05-04-feature-start-workflow-design.md`, `docs/superpowers/plans/2026-05-04-feature-start-workflow.md`, `AGENTS.md`, `scripts/wiki/feature-start.ts`, `lib/wiki/feature-start.ts`, `package.json`.
- Affected pages: [[Wiki Maintenance Automation]], [[Local Development Workflow]], [[index|Wiki Index]].
- Result: 신규 기능 구현 전 GitHub issue를 발행하고, `main`에서는 issue branch를 생성하는 feature-start workflow를 wiki 운영 절차에 추가했다.
- Verification: `pnpm exec vitest run tests/wiki/feature-start.test.ts`, `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-03T17:40:00+09:00 - maintenance

- Result: Markdown preview에서 `[[...]]` wiki link text를 Obsidian-style document navigation link로 렌더링하도록 구현했다.
- Coverage: resolved wiki link의 `?document=<id>` preview navigation, alias label, unresolved target의 bracket 없는 plain text fallback, embed/inline/fenced-code 제외.
- Pages: [[Wiki Links And Backlinks]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/document-editor.tsx`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/parser.test.ts`, `pnpm run build`.

## 2026-05-04T01:55:00+09:00 - review

- Result: PR #19 review feedback에 따라 markdown preview 변환이 multi-line inline code span, longer fenced code block, escaped wiki link, indented code block을 올바르게 보존하고, slug collision에서 임의 target을 고르지 않도록 보강했다.
- Coverage: matching backtick delimiter 기반 inline code span tracking, opening fence marker/width 기반 fenced code tracking, escaped `\[[...]]` literal fallback, 4-space/tab indented code block preservation, preview candidate slug map memoization, ReactMarkdown link component memoization, duplicate title slug ambiguity fallback.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #19 review comments, `components/document-editor.tsx`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/parser.test.ts`.

## 2026-05-03T13:25:00+09:00 - maintenance

- Result: LLM wiki 운영 방식을 커밋 누락 방지에서 Ingest, Query, Lint 기반의 영속 지식층 관리 규칙으로 확장했다.
- Coverage: agent-level operating loop, query answer 환류, semantic lint checklist, 타입별 page template, source evidence 기록 규칙, index 상태판.
- Pages: `AGENTS.md`, [[Wiki Schema]], [[Wiki Maintenance Automation]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `llm-wiki.md`, 사용자 제공 LLM wiki 관리 방향 요약, `AGENTS.md`, `wiki/Wiki Schema.md`, `wiki/Wiki Maintenance Automation.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check`.

## 2026-05-03T13:10:00+09:00 - maintenance

- Result: wiki sync 자동화 이전에 누락된 신규 기능 현황을 현재 code 기준으로 보강했다.
- Coverage: search/navigation, editor modes, properties, wiki link autocomplete, permission-filtered links/backlinks, broken link blank document creation, folder-like document creation, tags/frontmatter properties, attachments, comments, version restore, local graph, document-level permissions.
- Pages: [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[index|Wiki Index]].
- Source evidence: `git log`, `prisma/schema.prisma`, `app/workspaces/[workspaceSlug]/*`, `components/document-editor.tsx`, `components/document-navigation.tsx`, `components/metadata-panel.tsx`, `lib/documents/service.ts`, `lib/wiki-links/*`, `lib/document-metadata/*`, `lib/attachments/service.ts`, `lib/comments/service.ts`, `tests/e2e/login.spec.ts`.

## 2026-05-03T00:00:00+09:00 - maintenance

- Result: 커밋 전 source 변경을 기준으로 wiki 후보 page를 제안하고 wiki maintenance 누락을 감지하는 [[Wiki Maintenance Automation]] workflow를 추가했다.
- Tooling: `pnpm wiki:sync-plan`, `pnpm wiki:sync-check`, `pnpm wiki:install-hooks`, `.githooks/pre-commit`.
- Source evidence: `llm-wiki.md`, `AGENTS.md`, `.githooks/pre-commit`, `lib/wiki/sync.ts`, `package.json`.

## 2026-04-29T01:05:00+09:00 - maintenance

- Result: Obsidian에서 `[[...]]` 링크가 실제 note로 열리도록 주요 wiki page 파일명을 link target과 일치시켰다.
- Tooling: `wiki/index.md`와 `wiki/log.md`처럼 고정 경로가 필요한 운영 파일을 위해 `[[index|Wiki Index]]`, `[[log|Wiki Log]]` 형태를 사용하고, wiki lint가 파일 basename도 valid target으로 인정하도록 보강했다.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm exec vitest run tests/wiki/lint.test.ts tests/wiki/manifest.test.ts tests/wiki/search.test.ts`.

## 2026-04-29T00:00:00+09:00 - rewrite

- Result: 기존 `llm-wiki` 중심 wiki를 munjib project wiki로 전면 교체했다.
- Source evidence: `prd.md`, `obsidian-analysis-report.md`, `package.json`, `prisma/schema.prisma`, `lib/documents/service.ts`, `lib/wiki-links/*`, `app/workspaces/[workspaceSlug]/*`.
- Pages: [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[Document Editing Workflow]], [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[Next.js Prisma Monolith]], [[Wiki Schema]], [[index|Wiki Index]]
