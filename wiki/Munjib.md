---
id: concept-munjib
title: Munjib
type: concept
status: active
summary: Markdown-first 문서 작성과 wiki link 기반 탐색을 제공하는 Obsidian형 기업 문서 위키.
created: 2026-04-29
updated: 2026-04-29
source_count: 5
tags:
  - munjib
  - product
  - enterprise-wiki
links:
  - "[[Project PRD]]"
  - "[[Document Knowledge Model]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Document Editing Workflow]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Next.js Prisma Monolith]]"
---

# Munjib

Munjib은 Obsidian의 `[[문서 링크]]`, backlink, Markdown 중심 작성 경험을 기업용 협업 문서 위키로 재해석하는 웹 애플리케이션이다. 제품 방향은 "Notion보다 가볍고, Confluence보다 연결성이 좋고, Obsidian보다 협업과 권한에 강한 사내 지식 위키"에 가깝다.

현재 코드는 `obsidian-clone`이라는 repository 이름을 사용하지만, 인증 쿠키와 제품 문맥에서는 `munjib` 이름을 사용한다. 특히 NextAuth session cookie는 stale cookie 충돌을 피하기 위해 `munjib.session-token`으로 격리되어 있다.

## 현재 구현된 핵심

- Next.js App Router 기반 로그인과 workspace 문서 화면.
- Prisma/PostgreSQL 기반 조직, workspace, 문서, 버전, 링크, 권한, 감사 로그 모델.
- 개발용 credentials login.
- workspace role 기반 읽기/쓰기 권한 검사.
- 문서 생성, 수정, 아카이브, broken link에서 문서 생성.
- Markdown 원문과 plain text 본문 저장.
- 문서 수정 시 version row 생성.
- `[[문서명]]` wiki link 파싱과 `DocumentLink` reconciliation.
- outgoing links, backlinks, broken links, versions, audit log를 보여주는 metadata panel.

## 아직 구현으로 과장하면 안 되는 범위

`prd.md`에는 graph view, rich preview, properties, search, template, review flow, attachment, advanced export 같은 제품 방향이 포함되어 있다. 현재 UI의 `DocumentEditor`도 preview, backlinks, graph panel 일부를 "next milestone"로 표시한다. 따라서 wiki 문서에서는 이런 항목을 현재 구현이 아니라 계획 또는 예약된 영역으로 구분한다.

## 빠른 진입점

- 데이터 모델은 [[Document Knowledge Model]]에서 본다.
- `[[wiki link]]` 동작은 [[Wiki Links And Backlinks]]에서 본다.
- 문서 저장 흐름은 [[Document Editing Workflow]]에서 본다.
- 인증과 권한은 [[Auth And Permissions Workflow]]에서 본다.
- 로컬 실행과 검증 명령은 [[Local Development Workflow]]에서 본다.

## 근거

- `prd.md`
- `obsidian-analysis-report.md`
- `package.json`
- `prisma/schema.prisma`
- `lib/documents/service.ts`
- `lib/wiki-links/*`
- `app/workspaces/[workspaceSlug]/*`
