---
id: concept-folder-hierarchy-model
title: Folder Hierarchy Model
type: concept
status: active
summary: Issue #20에서 folder-like document creation을 실제 Folder 컨테이너와 path 기반 document hierarchy로 대체하는 설계 결정.
created: 2026-05-04
updated: 2026-05-08
source_count: 26
tags:
  - munjib
  - data-model
  - folders
  - hierarchy
links:
  - "[[Document Knowledge Model]]"
  - "[[Document Editing Workflow]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Auth And Permissions Workflow]]"
---

# Folder Hierarchy Model

Issue #20의 목표는 현재 folder-like document creation을 실제 folder 기반 계층 구조로 대체하는 것이다. 현재 `New folder`는 `Untitled folder` 제목과 빈 markdown을 가진 `Document`를 만들지만, 계획된 모델에서는 `Folder`가 별도 컨테이너이고 `Document`는 folder 아래에 위치하는 markdown note다.

## 확정 결정

- `Folder`는 별도 model이다.
- `Folder`는 markdown content, document version, wiki link, metadata, attachment, comment를 갖지 않는다.
- `Document`는 `folderId`로 위치를 갖는다. `folderId=null`이면 workspace root 문서다.
- 같은 folder 안에서는 folder/document slug가 unique해야 한다.
- 서로 다른 folder 사이에서는 같은 document title/slug를 허용한다.
- `path`는 workspace 안에서 folder/document location을 구분하는 unique 값이다.
- 비어 있지 않은 folder archive는 차단한다.
- Folder-specific permission과 inherited ACL은 MVP 범위에서 제외한다.

## Path와 duplicate title

서로 다른 folder에 같은 제목의 문서가 있을 수 있다.

- `/operations/onboarding`
- `/engineering/onboarding`

두 문서는 모두 `Onboarding` title을 가질 수 있다. 따라서 문서의 identity는 workspace-wide slug가 아니라 folder path를 포함한 `path`로 판단한다.

## Wiki link 영향

Duplicate title을 허용하면 `[[Onboarding]]` 같은 title-only link가 모호해질 수 있다. Issue #20 설계는 다음 규칙을 사용한다.

- `[[Operations/Onboarding]]` 같은 path-qualified link는 정확한 document path로 resolve한다.
- `[[Operations/Onboarding|Onboarding]]`은 같은 target에 alias label을 붙인다.
- `[[Onboarding]]`이 하나의 active readable document와만 일치하면 resolve한다.
- `[[Onboarding]]`이 여러 active readable document와 일치하면 ambiguous/unresolved 상태로 남기고 임의 target을 고르지 않는다.

Autocomplete는 duplicate title 후보를 path label로 보여주고 path-qualified target을 삽입해야 한다.

## 권한

Folder create, rename, move, archive는 workspace write 권한을 요구한다. Folder-specific permission과 descendant inheritance는 MVP에서 다루지 않는다.

기존 `Permission(resourceType=DOCUMENT)` 규칙은 문서 read/write에만 적용된다. Folder tree는 사용자가 읽을 수 있는 document만 표시해야 한다.

## Archive 정책

비어 있지 않은 folder archive는 거부한다. 사용자는 먼저 하위 folder/document를 이동하거나 archive해야 한다. Recursive archive/restore는 follow-up 기능으로 둔다.

## 구현 계획에 포함할 항목

- Prisma `Folder` model과 `Document.folderId` 추가.
- folder/document path 계산 helper 추가.
- folder create, rename, move, archive service 추가.
- document create/update/move를 folder-aware하게 변경.
- sidebar를 flat list에서 folder/document tree로 변경.
- path-qualified wikilink reconciliation, preview, autocomplete 추가.
- ambiguous link 상태 저장 또는 표시 방식 추가.
- 관련 wiki page와 manifest/log 업데이트.

구현 계획은 `docs/superpowers/plans/2026-05-05-real-folder-hierarchy.md`에 저장되어 있다. 계획은 schema, folder service, folder-aware document service, path-qualified wiki link, workspace tree UI, autocomplete, seed/wiki verification 순서로 작업을 나눈다.

첫 구현 유틸리티는 `lib/folders/path.ts`다. `normalizeFolderPath()`는 root와 중첩 경로를 소문자 leading-slash path로 정규화하고, `buildChildPath()`는 parent folder path와 child slug를 결합하며, `pathToWikiTarget()`은 `/operations/onboarding` 같은 document path를 `Operations/Onboarding` wikilink target label로 변환한다.

`lib/folders/service.ts`는 folder create, rename, move, archive를 담당한다. 모든 mutation은 workspace write 권한을 요구하고 audit log를 남긴다. Create/move에서 parent folder는 같은 workspace의 active folder여야 하며, 다른 workspace folder id를 parent로 넘기면 `PARENT_FOLDER_NOT_FOUND`로 거부한다. Rename/move는 descendant folder/document path를 재계산하며, 자기 자신 또는 descendant 아래로 이동하는 cycle은 `FOLDER_MOVE_CYCLE`로 거부한다. Move는 destination parent 안의 sibling folder slug를 다시 검사해 같은 이름 folder가 이미 있으면 `runbooks-2` 같은 conflict-free slug/path로 이동한다. Archive는 active child folder/document가 있으면 `FOLDER_NOT_EMPTY`로 거부한다.

`lib/documents/service.ts`는 `CreateDocumentInput.folderId`와 `moveDocument()`를 지원한다. 문서 생성, title update, version restore는 현재 folder path와 document slug를 결합해 `Document.path`를 계산한다. 서로 다른 folder 안에서는 같은 document title/slug를 허용하고, 같은 folder 안에서는 next-available slug를 사용한다. `moveDocument()`는 target folder의 path 아래로 문서를 이동하고 `document.moved` audit log에 previous path와 새 path를 기록한다.

Wiki link reconciliation은 path-qualified target을 document `path`로 우선 resolve한다. Title-only target이 하나의 active document와만 일치하면 연결하고, 여러 active document와 일치하면 `DocumentLink.isAmbiguous=true`로 저장한다. Markdown preview도 ambiguous title-only link를 plain text로 남기고 임의 target을 만들지 않는다.

## Workspace tree UI

Workspace 화면은 active folder와 readable active document를 함께 읽어 경로 기준 tree row로 표시한다. Sidebar의 folder row는 document처럼 editor target을 바꾸는 link가 아니라 accordion toggle button이다. Folder row를 열고 닫아도 현재 editor document는 유지된다.

Folder row는 folder icon 대신 Obsidian reference에 가까운 disclosure chevron icon을 사용한다. 펼쳐진 folder의 하위 row group은 chevron 아래로 이어지는 왼쪽 세로선을 표시해 folder/document 관계를 시각적으로 묶는다.

`New folder`는 더 이상 folder-like document를 만들지 않고 `createFolderAction()`을 통해 `Folder` row를 생성한다. `New document`는 현재 선택된 folder id를 hidden input으로 넘기며, folder 선택 상태에서는 새 문서가 해당 folder 아래에 생성된다.

문서 navigation과 quick switcher는 duplicate title을 구분할 수 있도록 `Document.path`를 함께 사용한다. Root title과 path가 일치하는 문서는 title만 표시하고, folder 아래에 같은 title이 있을 수 있는 문서는 `Title · /folder/title` 형태로 context를 보강한다. Sidebar의 `Recents` section은 최대 5개 document만 표시하고, tree depth와 무관하게 동일한 left padding을 사용한다. 전체 tree section은 `Documents` heading 아래에 표시한다.

Seed data는 root 문서 호환성을 유지하면서 `/operations` folder와 `/operations/operations-runbook` 문서를 추가한다. 이 seed는 folder tree와 folder-scoped document creation을 로컬/e2e 환경에서 확인하기 위한 기준 데이터다.

Issue #26은 folder row interaction을 보강한다. Folder row는 hover/focus 상태에서 배경 highlight를 보여주고 `...`와 `+` control을 드러낸다. Row-level `+` control은 해당 folder 안에 blank document를 생성한다. `...` menu는 Rename, Move to trash, Add/Remove favorites toggle을 제공한다. Rename과 trash는 기존 folder service mutation을 사용하고, folder favorites는 workspace-scoped localStorage state로 유지한다. Duplicate title/path 환경에서 action control을 구분할 수 있도록 document/folder row action label은 path context를 포함한다. 비어 있지 않은 folder trash 실패는 sidebar inline message가 아니라 shadcn Sonner toast로 화면 중앙 하단에 표시하고 3초 뒤 자동으로 사라진다.

## 근거

- GitHub issue #20
- GitHub issue #26
- `docs/superpowers/specs/2026-05-04-real-folder-hierarchy-design.md`
- `docs/superpowers/plans/2026-05-05-real-folder-hierarchy.md`
- `lib/folders/path.ts`
- `lib/folders/service.ts`
- `lib/folders/types.ts`
- `lib/documents/service.ts`
- `lib/documents/types.ts`
- `lib/wiki-links/reconcile.ts`
- `lib/wiki-links/targets.ts`
- `lib/wiki-links/preview.ts`
- `tests/folders/path.test.ts`
- `tests/folders/service.test.ts`
- `tests/documents/service.test.ts`
- `tests/wiki-links/reconcile.test.ts`
- `tests/wiki-links/preview.test.ts`
- `lib/workspace-tree.ts`
- `components/folder-detail.tsx`
- `components/document-list.tsx`
- `components/document-navigation.tsx`
- `wiki/designs/obsidian1.png`
- `app/workspaces/[workspaceSlug]/actions.ts`
- `app/workspaces/[workspaceSlug]/page.tsx`
- `tests/workspace-tree.test.ts`
- `tests/e2e/login.spec.ts`
- `prisma/seed.ts`
- `prisma/schema.prisma`
- `lib/documents/service.ts`
- Obsidian Hub beginner guide: https://publish.obsidian.md/hub/04%20-%20Guides%2C%20Workflows%2C%20%26%20Courses/for%20Beginners
