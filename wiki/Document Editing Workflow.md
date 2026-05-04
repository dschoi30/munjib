---
id: workflow-document-editing
title: Document Editing Workflow
type: workflow
status: active
summary: Munjib에서 문서 편집, 생성, 수정, 버전 저장, 링크 reconciliation, 감사 로그가 이어지는 흐름.
created: 2026-04-29
updated: 2026-05-04
source_count: 15
tags:
  - munjib
  - workflow
  - documents
  - 문서
  - 편집
links:
  - "[[Munjib]]"
  - "[[Document Knowledge Model]]"
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

## 생성 흐름

`createDocumentAction()`은 현재 user를 확인한 뒤 `createDocument()`를 호출한다.

`createDocumentAction()`은 `blank`, `runbook`, `policy`, `folder` template을 지원한다. `folder`는 별도 folder table이 아니라 `Untitled folder` title과 빈 markdown을 가진 루트 문서를 만든다.

`createDocument()`는 다음을 수행한다.

1. workspace membership을 조회한다.
2. read/write 권한을 확인한다.
3. title에서 unique slug를 만든다.
4. markdown과 plain text를 저장해 `Document`를 생성한다.
5. `DocumentVersion` v1을 만든다.
6. wiki links와 document metadata를 reconcile한다.
7. `document.created` audit log를 남긴다.
8. 생성 문서로 redirect한다.

## 수정 흐름

`updateDocumentAction()`은 form data의 `documentId`, `title`, `contentMarkdown`을 받아 `updateDocument()`를 호출한다. 저장 후 workspace path를 revalidate하고 같은 문서 query로 redirect한다. 이 redirect는 저장 후 UI가 stale RSC payload를 계속 보여주는 문제를 막기 위한 핵심이다.

`updateDocument()`는 다음을 수행한다.

1. document와 workspace membership을 조회한다.
2. write 권한을 확인한다.
3. title에 맞춰 unique slug를 다시 계산한다. 현재 document id는 중복 검사에서 제외한다.
4. markdown, plain text, title, slug, path, updatedBy를 갱신한다.
5. 다음 version number로 `DocumentVersion`을 생성한다.
6. source 문서의 wiki links와 document metadata를 reconcile한다.
7. `document.updated` audit log를 남긴다.

## Version restore, attachment, comment

`restoreDocumentVersion()`은 선택한 `DocumentVersion`의 title과 markdown으로 현재 문서를 되돌린다. 복원도 새 version을 생성하고 `document.version_restored` audit log를 남기며, links와 metadata를 다시 reconcile한다.

`uploadDocumentAttachmentAction()`은 file upload를 받아 `uploadDocumentAttachment()`로 넘긴다. service는 5MB 이하의 허용 MIME type만 받아 `storage/attachments/`에 저장하고, image는 `![file](/api/attachments/<id>)`, 그 외 파일은 `[file](/api/attachments/<id>)` markdown link를 본문 끝에 append한다. DB transaction 실패 시 이미 쓴 파일은 삭제한다.

`createCommentAction()`은 문서에 comment를 추가하고 `comment.created` audit log를 남긴다. 빈 comment는 거부된다.

## 아카이브와 broken link 생성

`archiveDocument()`는 문서 status를 `ARCHIVED`로 바꾸고 `archivedAt`을 채운다. 현재 workspace 문서 목록은 active 문서만 보여준다.

`createDocumentFromBrokenLink()`는 broken `DocumentLink`에서 target title을 가져와 루트 경로의 blank document를 만들고, 같은 raw target title을 가진 broken links를 repair한다.

## UI 세부 사항

`DocumentEditor`는 controlled title과 markdown state를 사용하며, 문서 선택이 바뀌면 `useEffect`로 title/content/completion state를 새 문서 값으로 재설정한다.

Editor는 edit/split/preview mode를 제공한다. CodeMirror markdown editor는 `[[` 입력 중 workspace 문서 후보를 보여주는 autocomplete를 제공한다.

Preview mode는 YAML frontmatter block을 본문에서 제외한 뒤 `[[Target Title]]` text를 그대로 노출하지 않고, 읽을 수 있는 workspace document와 matching되는 target을 `?document=<id>` link로 렌더링한다. `[[Target Title|Alias]]`는 alias를 label로 사용한다. Matching document가 없는 target은 bracket 없는 plain text로 표시된다.

Title 아래 Properties 영역은 tags, links, frontmatter properties, comments를 표시한다. Links row는 outgoing links와 backlinks를 가로로 합쳐 보여주고, broken link는 연한 텍스트 button으로 표시해 클릭 시 blank document 생성을 실행한다. YAML frontmatter property는 `sortOrder` 기준으로 읽어 markdown 파일에 적힌 속성 순서를 유지한다. YAML frontmatter의 `links` key는 같은 wiki link edge를 이미 canonical Links row가 렌더링하므로 일반 frontmatter property 목록에서는 숨긴다. Comments는 위에서 아래로 쌓이며 `createdAt asc` 순서로 읽는다.

우측 metadata panel은 local graph, attachments, versions, audit log를 표시한다. Section 영역이 scroll container이며 edit/split mode의 markdown 표시 영역은 고정 높이를 강제하지 않는다.

## 근거

- `app/workspaces/[workspaceSlug]/page.tsx`
- `app/workspaces/[workspaceSlug]/actions.ts`
- `components/document-editor.tsx`
- `components/document-list.tsx`
- `components/document-navigation.tsx`
- `components/metadata-panel.tsx`
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
