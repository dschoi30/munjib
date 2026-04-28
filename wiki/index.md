---
id: index-main
title: Wiki Index
type: index
status: active
summary: Munjib repository wiki의 탐색 인덱스.
created: 2026-04-29
updated: 2026-04-29
source_count: 8
tags:
  - index
  - munjib
links:
  - "[[Munjib]]"
  - "[[Project PRD]]"
  - "[[Document Knowledge Model]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Document Editing Workflow]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Local Development Workflow]]"
  - "[[Next.js Prisma Monolith]]"
  - "[[Wiki Schema]]"
  - "[[log|Wiki Log]]"
---

# Wiki Index

이 페이지는 broad source search 전에 읽는 munjib repository wiki의 시작점이다. 먼저 관련 wiki page를 읽고, wiki가 비어 있거나 stale하거나 code-level verification이 필요할 때 source file search로 내려간다.

## 제품과 근거

- [[Munjib]] - Obsidian형 기업 문서 위키로서의 제품 정의와 현재 구현 범위.
- [[Project PRD]] - `prd.md`, `obsidian-analysis-report.md`, 현재 source code를 연결한 source note.

## 핵심 개념

- [[Document Knowledge Model]] - Organization, Workspace, Document, DocumentVersion, DocumentLink, Permission, AuditLog 모델.
- [[Wiki Links And Backlinks]] - `[[문서 링크]]`, alias, backlink, broken link 저장 및 reconciliation 방식.
- [[Wiki Schema]] - wiki page frontmatter, link, manifest 유지 규칙.

## 워크플로우

- [[Document Editing Workflow]] - 문서 생성, 수정, 버전 저장, 감사 로그, link reconciliation 흐름.
- [[Auth And Permissions Workflow]] - NextAuth session, dev credentials, workspace role 권한 흐름.
- [[Local Development Workflow]] - 로컬 실행, DB, seed, test, e2e, wiki maintenance 명령.

## 결정

- [[Next.js Prisma Monolith]] - MVP를 Next.js App Router, server actions, Prisma, PostgreSQL monolith로 운영하는 결정.

## 로그

- [[log|Wiki Log]] - wiki maintenance timeline.
