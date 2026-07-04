---
id: workflow-auth-and-permissions
title: Auth And Permissions Workflow
type: workflow
status: active
summary: Munjib의 개발용 로그인 gate, NextAuth session, workspace role, document-level explicit permission, folder 관리 권한 흐름.
created: 2026-04-29
updated: 2026-07-04
source_count: 15
tags:
  - munjib
  - auth
  - permissions
links:
  - "[[Munjib]]"
  - "[[Document Knowledge Model]]"
  - "[[Document Editing Workflow]]"
  - "[[Folder Hierarchy Model]]"
  - "[[Local Development Workflow]]"
---

# Auth And Permissions Workflow

Munjib의 현재 인증은 NextAuth 기반이며, 개발 환경에서는 credentials provider로 seed user를 선택해 로그인한다. Issue #143 설계는 이 email-only development login을 launch-safe하게 gate해 production에서는 명시 env 없이 사용할 수 없게 만드는 slice다. 운영 password auth, OAuth, SSO/SAML은 제품 방향에는 있지만 현재 구현의 중심은 아니다.

## Development login gate

Issue #143 keeps the existing email-only Credentials provider for development
but gates authentication with `MUNJIB_ENABLE_DEV_LOGIN`. Local development
defaults to enabled so seed users can keep signing in, while production defaults
to disabled unless an operator explicitly sets `MUNJIB_ENABLE_DEV_LOGIN=true`.
When disabled, the provider returns `null` before querying `User`, and the login
form renders disabled controls plus localized disabled-state copy.

`/login` is forced dynamic so the disabled/enabled UI reflects the runtime env
gate rather than a statically baked build-time value. `/` and `/login` both pass
the server gate into `LoginForm`.

이 slice는 password hash, password reset, OAuth, SSO/SAML, invitation flow, user lifecycle management를 추가하지 않는다. 목표는 지금 존재하는 개발용 provider가 운영 환경에서 실수로 열리지 않게 하는 launch hardening이다.

## Session helper

서버 컴포넌트와 server action은 `requireCurrentUser()`를 통해 현재 사용자를 요구한다. 로그인되지 않은 상태에서 보호된 workspace로 접근하면 로그인 흐름으로 이동한다.

## Cookie namespace

NextAuth session cookie는 `munjib.session-token` 이름을 사용한다. 이 이름은 이전 `obsidian-clone.session-token` stale cookie가 `/login`에서 `JWT_SESSION_ERROR`를 일으키던 문제를 피하기 위해 분리된 것이다.

운영 환경에서는 기본적으로 secure cookie를 사용한다. HTTP-only IP 배포처럼 HTTPS가 아직 붙지 않은 임시 환경에서는 `NEXTAUTH_COOKIE_SECURE=false`로 session cookie의 secure flag를 끌 수 있다. Local HTTPS proxy 검증처럼 개발 환경에서 secure cookie를 강제해야 하면 `NEXTAUTH_COOKIE_SECURE=true`를 사용할 수 있다.

관련 테스트는 cookie 이름, dev fallback secret, HTTP 배포용 secure cookie override, development secure-cookie force 동작을 검증한다.

## Login redirect

`LoginForm`은 `callbackUrl`이 `/workspaces/...` 같은 app-local path이면 `signIn(..., { redirect: false })`가 반환한 absolute URL의 origin을 그대로 사용하지 않고 callback path로 이동한다. NextAuth가 server-side `NEXTAUTH_URL` 기준의 `http://localhost:3000/...` URL을 반환할 수 있기 때문에, client-side 이동은 현재 browser origin을 유지하는 relative path를 우선한다.

Callback sanitization은 단순 string prefix check가 아니라 `new URL(value, window.location.origin)` parsing 결과의 `origin`이 현재 browser origin과 같은지 확인한다. `/\evil.example`처럼 browser가 protocol-relative external URL로 normalize할 수 있는 malformed path는 기본 `/workspaces/company-handbook` callback으로 낮춰 `signIn()`에도 unsafe callback을 전달하지 않는다.

## Workspace role

현재 runtime 권한의 기본값은 `WorkspaceMember.role`이다.

- 읽기 가능: `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`
- 쓰기 가능: `OWNER`, `ADMIN`, `EDITOR`
- 관리 가능: `OWNER`, `ADMIN`

`assertCanReadWorkspace()`와 `assertCanWriteWorkspace()`는 role이 없거나 권한이 부족하면 명시적 error를 던진다.

## Document-level explicit permission

`Permission` table은 `resourceType=DOCUMENT`, `subjectType=USER`, `permission=READ|WRITE|MANAGE` 형태의 explicit document permission을 지원한다.

문서에 explicit permission row가 하나라도 있으면 workspace role만으로는 충분하지 않다. `canReadDocument()`와 `canWriteDocument()`는 workspace role, explicit permission count, actor의 highest permission을 함께 판단한다.

- explicit permission이 없는 문서: workspace role 기준으로 읽기/쓰기를 허용한다.
- explicit permission이 있는 문서: 사용자에게 충분한 document permission이 있어야 읽기/쓰기 가능하다.
- `MANAGE`는 read/write보다 높은 권한으로 취급된다.

Workspace page는 문서 목록과 search 대상에서 읽을 수 없는 문서를 제외한다. Link panel도 outgoing target과 backlink source document를 permission-aware하게 필터링한다.

## 문서 service에서의 권한 적용

`createDocument()`는 workspace slug와 actor id로 membership을 찾고 write 권한을 요구한다.

Issue #20의 folder hierarchy MVP에서 folder 생성, 이름 변경, 이동, archive는 workspace write 권한을 요구한다. Folder-specific permission과 folder-to-document inherited ACL은 MVP 범위에서 제외한다. 기존 document-level explicit permission은 문서 read/write 판단에만 적용된다.

`updateDocument()`와 `archiveDocument()`는 document id로 document와 workspace membership을 함께 찾고 read/write 권한을 요구한다.

`createDocumentFromBrokenLink()`는 link id로 workspace membership을 찾고 read/write 권한을 모두 요구한다.

`restoreDocumentVersion()`, attachment upload, comment creation도 document-level permission을 확인한다. Attachment download는 document read permission을 요구하고, upload/comment는 write 가능한 사용자만 수행한다.

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
- `app/login/login-form.tsx`
- `app/login/page.tsx`
- `app/page.tsx`
- `lib/i18n/messages.ts`
- `docs/superpowers/specs/2026-07-04-launch-auth-foundation-design.md`
- `lib/permissions/workspace.ts`
- `lib/permissions/document.ts`
- `lib/wiki-links/service.ts`
- `lib/attachments/service.ts`
- `tests/auth/config.test.ts`
- `tests/components/login-form.test.tsx`
- `tests/permissions/document.test.ts`
- `prisma/seed.ts`
