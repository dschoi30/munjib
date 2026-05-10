---
id: log-main
title: Wiki Log
type: log
status: active
summary: Munjib wiki 유지보수 timeline.
created: 2026-04-29
updated: 2026-05-10
source_count: 35
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

## 2026-05-10T17:40:00+09:00 - review

- Result: Preview heading folding follow-up으로 chevron hover/focus 배경과 border/ring 제거, heading level별 section spacing, CRLF fenced code block 뒤 heading 인식 문제를 보정했다.
- Coverage: Preview chevron은 content flow를 밀지 않는 absolute 배치를 유지하면서 hover background와 focus border/ring을 쓰지 않는다. `#`, `##`, `###` section에는 level별 margin을 적용하고, CRLF 문서의 backtick code fence 종료도 parser가 인식한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 요청, `components/document-editor.tsx`, `lib/markdown/folding.ts`, `tests/markdown/folding.test.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

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

## 2026-05-05T18:20:00+09:00 - design

- Result: Issue #25 Markdown heading folding 설계를 기록했다.
- Coverage: Obsidian-style heading hierarchy folding, Preview chevron hover/focus behavior, Edit mode CodeMirror heading folding, 문서별 `localStorage` fold state, split mode 제거 계획.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #25, `docs/superpowers/specs/2026-05-05-markdown-heading-folding-design.md`.
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
