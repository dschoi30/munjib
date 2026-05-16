---
id: log-main
title: Wiki Log
type: log
status: active
summary: Munjib wiki 유지보수 timeline.
created: 2026-04-29
updated: 2026-05-16
source_count: 63
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
