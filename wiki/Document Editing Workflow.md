---
id: workflow-document-editing
title: Document Editing Workflow
type: workflow
status: active
summary: Munjib에서 문서 편집, 생성, 수정, 버전 저장, 링크 reconciliation, 감사 로그가 이어지는 흐름.
created: 2026-04-29
updated: 2026-05-10
source_count: 27
tags:
  - munjib
  - workflow
  - documents
  - 문서
  - 편집
links:
  - "[[Munjib]]"
  - "[[Document Knowledge Model]]"
  - "[[Folder Hierarchy Model]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Auth And Permissions Workflow]]"
---

# Document Editing Workflow

문서 편집 흐름은 Next.js server action에서 시작해 `lib/documents/service.ts`의 service function으로 내려간다. 권한 확인, DB mutation, version 생성, link reconciliation, audit log 작성이 같은 transaction 안에서 처리된다.

## 화면 진입

`app/workspaces/[workspaceSlug]/page.tsx`는 현재 사용자를 요구하고 workspace를 조회한다. workspace membership이 없으면 `notFound()`로 빠진다. active document는 `updatedAt desc`로 정렬되어 좌측 목록에 표시된다.

선택 문서가 있으면 오른쪽 panel은 다음 데이터를 읽는다.

- document versions
- recent audit logs
- attachments
- outgoing links, backlinks, broken links
- tags, frontmatter properties, comments

좌측 navigation은 title/body search, quick switcher, recent documents, localStorage favorites를 제공한다. 검색 결과는 permission filter를 통과한 문서 안에서 title 또는 `contentText` 기준으로 좁힌다.

Issue #20 설계 이후 좌측 navigation은 flat document list에서 folder/document tree로 바뀐다. Folder 선택 시 markdown editor가 아니라 folder detail/empty state를 보여주고, document 선택 시 기존 editor panel을 연다.

Tree row는 folder와 document를 `path` 기준으로 정렬한다. Tree 안의 folder row는 accordion toggle button이라 클릭해도 editor target을 바꾸지 않고 하위 row를 열고 닫는다. Favorite folder link와 folder server-action redirect는 `?folder=<id>`로 folder detail view를 열고, document row와 favorite document link는 `?document=<id>`로 editor를 연다. Quick switcher는 document title과 path를 함께 표시해 folder별 duplicate title을 구분한다. Document row는 hover/focus 상태에서 배경 highlight를 보여주고, 선택된 document row는 고정 highlight를 유지한다.

Sidebar favorites는 always-visible star icon이 아니라 row-level `...` menu에서 관리한다. Document favorites와 folder favorites는 workspace-scoped localStorage에 저장된다. Favorite folder는 folder detail view를 열고, favorite document는 editor를 연다. Favorite folder row도 `...` menu에서 Remove from favorites를 제공한다. Document row `...` menu는 Add/Remove favorites와 Move to trash를 제공하되, 현재 user가 해당 document를 쓸 수 있을 때만 Move to trash를 노출한다. Row action menu는 trigger 또는 menu surface 밖을 클릭하면 닫힌다.

## 생성 흐름

`createDocumentAction()`은 현재 user를 확인한 뒤 `createDocument()`를 호출한다.

`createDocumentAction()`은 `blank`, `runbook`, `policy` template을 지원한다. Issue #20 구현 이후 folder creation은 document template이 아니라 `createFolderAction()`과 `lib/folders/service.ts`가 담당한다. Sidebar top-level create control은 client component에서 이 server action을 호출하고 반환된 id로 이동한다. Server-action redirect에 의존하지 않아 생성 중 sidebar remount flicker를 줄인다.

Issue #20 구현에서 `createDocument()`는 `folderId`를 받을 수 있다. `New document`는 선택된 folder 또는 workspace root 아래 document를 생성한다. 문서 template은 유지하되 `folderId`를 입력으로 받는다. `New folder`는 별도 `Folder` row를 생성하는 folder service로 분리된다.

`createDocument()`는 다음을 수행한다.

1. workspace membership을 조회한다.
2. read/write 권한을 확인한다.
3. 선택 folder 안에서 unique slug를 만든다.
4. folder path와 document slug를 결합한 `path`와 함께 `Document`를 생성한다.
5. `DocumentVersion` v1을 만든다.
6. wiki links와 document metadata를 reconcile한다.
7. `document.created` audit log를 남긴다.
8. 생성 문서 id를 반환한다.

`moveDocument()`는 문서의 `folderId`를 바꾸고 target folder path 아래로 `path`를 재계산한다. 이동은 `document.moved` audit log에 previous path와 새 path를 남긴다.

## 수정 흐름

`updateDocumentAction()`은 form data의 `documentId`, `title`, `contentMarkdown`을 받아 `updateDocument()`를 호출한다. 저장 후 workspace path를 revalidate하고 같은 문서 query로 redirect한다. 이 redirect는 저장 후 UI가 stale RSC payload를 계속 보여주는 문제를 막기 위한 핵심이다.

`updateDocument()`는 다음을 수행한다.

1. document와 workspace membership을 조회한다.
2. write 권한을 확인한다.
3. 현재 folder 안에서 title에 맞춰 unique slug를 다시 계산한다. 현재 document id는 중복 검사에서 제외한다.
4. markdown, plain text, title, slug, path, updatedBy를 갱신한다.
5. 다음 version number로 `DocumentVersion`을 생성한다.
6. source 문서의 wiki links와 document metadata를 reconcile한다.
7. `document.updated` audit log를 남긴다.

## Version restore, attachment, comment

`restoreDocumentVersion()`은 선택한 `DocumentVersion`의 title과 markdown으로 현재 문서를 되돌린다. 복원도 새 version을 생성하고 `document.version_restored` audit log를 남기며, links와 metadata를 다시 reconcile한다.

`uploadDocumentAttachmentAction()`은 file upload를 받아 `uploadDocumentAttachment()`로 넘긴다. service는 5MB 이하의 허용 MIME type만 받아 `storage/attachments/`에 저장하고, image는 `![file](/api/attachments/<id>)`, 그 외 파일은 `[file](/api/attachments/<id>)` markdown link를 본문 끝에 append한다. DB transaction 실패 시 이미 쓴 파일은 삭제한다.

`createCommentAction()`은 문서에 comment를 추가하고 `comment.created` audit log를 남긴다. 빈 comment는 거부된다.

## 아카이브와 broken link 생성

`archiveDocument()`는 문서 status를 `ARCHIVED`로 바꾸고 `archivedAt`을 채운다. 현재 workspace 문서 목록은 active 문서만 보여준다. `archiveDocumentAction()`은 workspace path를 revalidate하고 archived document id를 반환한다.

Sidebar row-level document trash는 `archiveDocumentAction()`의 반환값을 받아 client side에서 처리한다. 현재 열려 있는 document를 삭제한 경우에만 workspace root로 이동하고, 다른 row를 삭제한 경우에는 현재 editor context를 유지한 채 refresh한다.

Issue #20의 folder archive 정책은 비어 있지 않은 folder archive를 차단하는 것이다. 사용자는 먼저 하위 folder/document를 이동하거나 archive해야 한다. Recursive archive/restore는 MVP 범위에서 제외한다.

`createDocumentFromBrokenLink()`는 broken `DocumentLink`에서 target title을 가져와 루트 경로의 blank document를 만들고, 같은 raw target title을 가진 broken links를 repair한다.

## UI 세부 사항

`DocumentEditor`는 controlled title과 markdown state를 사용하며, 문서 선택이 바뀌면 `useEffect`로 title/content/completion state를 새 문서 값으로 재설정한다.

Editor는 edit/split/preview mode를 제공한다. CodeMirror markdown editor는 `[[` 입력 중 workspace 문서 후보를 보여주는 autocomplete를 제공한다. Duplicate title 후보는 path-qualified label과 insert text를 사용해 folder-aware wiki link를 삽입한다.

Preview mode는 YAML frontmatter block을 본문에서 제외한 뒤 `[[Target Title]]` text를 그대로 노출하지 않고, 읽을 수 있는 workspace document와 matching되는 target을 `?document=<id>` link로 렌더링한다. `[[Target Title|Alias]]`는 alias를 label로 사용한다. Matching document가 없는 target은 bracket 없는 plain text로 표시된다.

Title 아래 Properties 영역은 tags, links, frontmatter properties, comments를 표시한다. Properties row는 YAML frontmatter key 순서대로 배치하며, `tags`와 `links` key 위치에는 raw YAML 값 대신 canonical UI row를 렌더링한다. Links row는 YAML frontmatter `links:` 배열 안의 `[[...]]`에서 만든 outgoing links만 보여주고, broken link는 연한 텍스트 button으로 표시해 클릭 시 blank document 생성을 실행한다. Content 영역의 `[[...]]`와 backlinks는 Properties Links row에서 제외한다. YAML frontmatter property와 frontmatter links는 각각 `sortOrder`와 현재 frontmatter `links:` 배열 순서를 기준으로 읽어 markdown 파일에 적힌 속성/링크 순서를 유지한다. Comments는 위에서 아래로 쌓이며 `createdAt asc` 순서로 읽는다.

우측 metadata panel은 local graph, attachments, versions, audit log를 표시한다. Section 영역이 scroll container이며 edit/split mode의 markdown 표시 영역은 고정 높이를 강제하지 않는다.

## 근거

- `app/workspaces/[workspaceSlug]/page.tsx`
- `app/workspaces/[workspaceSlug]/actions.ts`
- GitHub issue #26
- `components/document-editor.tsx`
- `components/document-list.tsx`
- `components/document-navigation.tsx`
- `components/folder-detail.tsx`
- `components/metadata-panel.tsx`
- `lib/workspace-tree.ts`
- `lib/documents/service.ts`
- `lib/wiki-links/preview.ts`
- `lib/attachments/service.ts`
- `lib/comments/service.ts`
- `lib/document-metadata/display.ts`
- `lib/document-metadata/parser.ts`
- `lib/document-metadata/reconcile.ts`
- `prisma/schema.prisma`
- `tests/wiki-links/preview.test.ts`
- `tests/e2e/login.spec.ts`
