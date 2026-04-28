---
id: workflow-document-editing
title: Document Editing Workflow
type: workflow
status: active
summary: Munjib에서 문서 편집, 생성, 수정, 버전 저장, 링크 reconciliation, 감사 로그가 이어지는 흐름.
created: 2026-04-29
updated: 2026-04-29
source_count: 4
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
- outgoing links
- backlinks
- broken links

## 생성 흐름

`createDocumentAction()`은 현재 user를 확인한 뒤 `createDocument()`를 호출한다.

`createDocument()`는 다음을 수행한다.

1. workspace membership을 조회한다.
2. read/write 권한을 확인한다.
3. title에서 unique slug를 만든다.
4. markdown과 plain text를 저장해 `Document`를 생성한다.
5. `DocumentVersion` v1을 만든다.
6. wiki links를 reconcile한다.
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
6. source 문서의 wiki links를 reconcile한다.
7. `document.updated` audit log를 남긴다.

## 아카이브와 broken link 생성

`archiveDocument()`는 문서 status를 `ARCHIVED`로 바꾸고 `archivedAt`을 채운다. 현재 workspace 문서 목록은 active 문서만 보여준다.

`createDocumentFromBrokenLink()`는 broken `DocumentLink`에서 target title을 가져와 새 문서를 만들고, 같은 raw target title을 가진 broken links를 repair한다.

## UI 세부 사항

`DocumentEditor`는 uncontrolled input의 `defaultValue`를 사용한다. 문서 선택을 바꿀 때 이전 값이 남지 않도록 form에 `key={document.id}`를 둔다.

## 근거

- `app/workspaces/[workspaceSlug]/page.tsx`
- `app/workspaces/[workspaceSlug]/actions.ts`
- `components/document-editor.tsx`
- `lib/documents/service.ts`
