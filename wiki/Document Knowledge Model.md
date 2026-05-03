---
id: concept-document-knowledge-model
title: Document Knowledge Model
type: concept
status: active
summary: Munjib의 조직, workspace, 문서, 버전, 링크, 권한, 감사 로그 데이터 모델.
created: 2026-04-29
updated: 2026-04-29
source_count: 2
tags:
  - munjib
  - data-model
  - prisma
links:
  - "[[Munjib]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Document Editing Workflow]]"
  - "[[Auth And Permissions Workflow]]"
---

# Document Knowledge Model

Munjib의 core domain은 Prisma schema에 정의되어 있다. 가장 중요한 축은 조직/사용자 membership, workspace, document tree, document versions, document links, permissions, audit logs다.

## 조직과 workspace

- `User`: 로그인 사용자. 조직 membership, workspace membership, 생성/수정 문서, 버전, 감사 로그와 연결된다.
- `Organization`: 여러 workspace를 포함하는 상위 tenant 단위다.
- `OrganizationMember`: 사용자를 조직에 연결하고 `OWNER`, `ADMIN`, `MEMBER` role을 부여한다.
- `Workspace`: 조직 아래 문서 집합이다. `slug`는 조직 안에서 unique하다.
- `WorkspaceMember`: 사용자를 workspace에 연결하고 `OWNER`, `ADMIN`, `EDITOR`, `VIEWER` role을 부여한다.

현재 권한 체크는 주로 workspace role을 기준으로 한다. 자세한 흐름은 [[Auth And Permissions Workflow]]를 본다.

## 문서와 버전

- `Document`: workspace 안의 문서 본체다.
- `title`, `slug`, `path`는 문서 탐색과 URL/표시 이름의 기반이다.
- `contentMarkdown`은 작성 원문이다.
- `contentText`는 검색과 표시를 위한 plain text 파생값이다.
- `status`는 `ACTIVE` 또는 `ARCHIVED`다.
- `parentId`는 tree 구조를 위한 필드지만, 현재 UI의 핵심 흐름은 flat document list에 가깝다.
- `DocumentVersion`: 문서 저장 시점의 title과 markdown content snapshot이다.

`Document`는 workspace 안에서 `slug`가 unique하다. `lib/documents/service.ts`의 `nextAvailableDocumentSlug()`가 중복 title을 `untitled-2`, `runbook-2` 같은 slug로 회피한다.

## 문서 링크

- `DocumentLink`: 한 문서에서 다른 문서를 향하는 wiki link edge다.
- `sourceDocumentId`: link가 적힌 문서.
- `targetDocumentId`: 실제 대상 문서. 대상이 없으면 `null`.
- `targetTitleRaw`: markdown 안에 적힌 대상 제목 원문.
- `alias`: `[[Target|Alias]]`의 alias.
- `isBroken`: 대상 문서가 없으면 `true`.

링크 파싱과 reconciliation은 [[Wiki Links And Backlinks]]에서 설명한다.

## 권한과 감사

- `Permission`: resource/subject/permission 형태의 세밀한 권한 모델을 위한 테이블이다. 현재 주요 runtime 권한은 workspace membership helper가 담당한다.
- `AuditLog`: 문서 생성, 수정, 아카이브, broken link 기반 생성 같은 mutation 기록을 남긴다.

## 근거

- `prisma/schema.prisma`
- `lib/documents/service.ts`
