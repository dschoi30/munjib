---
id: workflow-auth-and-permissions
title: Auth And Permissions Workflow
type: workflow
status: active
summary: Munjib의 개발용 로그인, NextAuth session, workspace role 기반 권한 검사 흐름.
created: 2026-04-29
updated: 2026-04-29
source_count: 5
tags:
  - munjib
  - auth
  - permissions
links:
  - "[[Munjib]]"
  - "[[Document Knowledge Model]]"
  - "[[Document Editing Workflow]]"
  - "[[Local Development Workflow]]"
---

# Auth And Permissions Workflow

Munjib의 현재 인증은 NextAuth 기반이며, 개발 환경에서는 credentials provider로 seed user를 선택해 로그인한다. 운영 SSO는 제품 방향에는 있지만 현재 구현의 중심은 아니다.

## Session helper

서버 컴포넌트와 server action은 `requireCurrentUser()`를 통해 현재 사용자를 요구한다. 로그인되지 않은 상태에서 보호된 workspace로 접근하면 로그인 흐름으로 이동한다.

## Cookie namespace

NextAuth session cookie는 `munjib.session-token` 이름을 사용한다. 이 이름은 이전 `obsidian-clone.session-token` stale cookie가 `/login`에서 `JWT_SESSION_ERROR`를 일으키던 문제를 피하기 위해 분리된 것이다.

관련 테스트는 cookie 이름과 dev fallback secret 동작을 검증한다.

## Workspace role

현재 runtime 권한의 핵심은 `WorkspaceMember.role`이다.

- 읽기 가능: `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`
- 쓰기 가능: `OWNER`, `ADMIN`, `EDITOR`
- 관리 가능: `OWNER`, `ADMIN`

`assertCanReadWorkspace()`와 `assertCanWriteWorkspace()`는 role이 없거나 권한이 부족하면 명시적 error를 던진다.

## 문서 service에서의 권한 적용

`createDocument()`는 workspace slug와 actor id로 membership을 찾고 write 권한을 요구한다.

`updateDocument()`와 `archiveDocument()`는 document id로 document와 workspace membership을 함께 찾고 read/write 권한을 요구한다.

`createDocumentFromBrokenLink()`는 link id로 workspace membership을 찾고 read/write 권한을 모두 요구한다.

## Seed 사용자

`prisma/seed.ts`는 다음 사용자와 workspace를 만든다.

- `owner@example.com`
- `editor@example.com`
- `viewer@example.com`
- workspace: `company-handbook`

테스트나 수동 검증에서 이 seed data를 기준으로 역할별 동작을 확인할 수 있다.

## 근거

- `lib/auth/config.ts`
- `lib/auth/session.ts`
- `lib/permissions/workspace.ts`
- `tests/auth/config.test.ts`
- `prisma/seed.ts`
