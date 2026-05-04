---
id: index-main
title: Wiki Index
type: index
status: active
summary: Munjib repository wiki의 탐색 인덱스와 feature-start 포함 workflow navigation.
created: 2026-04-29
updated: 2026-05-04
source_count: 23
tags:
  - index
  - munjib
links:
  - "[[Munjib]]"
  - "[[Project PRD]]"
  - "[[Document Knowledge Model]]"
  - "[[Folder Hierarchy Model]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Document Editing Workflow]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Local Development Workflow]]"
  - "[[Next.js Prisma Monolith]]"
  - "[[Wiki Schema]]"
  - "[[Wiki Maintenance Automation]]"
  - "[[designs/index|UI Design Excalidraw Index]]"
  - "[[log|Wiki Log]]"
---

# Wiki Index

이 페이지는 broad source search 전에 읽는 munjib repository wiki의 시작점이다. 먼저 관련 wiki page를 읽고, wiki가 비어 있거나 stale하거나 code-level verification이 필요할 때 source file search로 내려간다.

## 제품과 근거

- [[Munjib]] - Obsidian형 기업 문서 위키로서의 제품 정의와 최신 구현 범위.
- [[Project PRD]] - `prd.md`, `obsidian-analysis-report.md`, 현재 source code, 남은 roadmap을 연결한 source note.

## 핵심 개념

- [[Document Knowledge Model]] - Organization, Workspace, Document, DocumentVersion, DocumentLink, Tag, DocumentProperty, Attachment, Comment, Permission, AuditLog 모델.
- [[Folder Hierarchy Model]] - Issue #20의 실제 Folder 컨테이너, document path, duplicate title, ambiguous wikilink 설계.
- [[Wiki Links And Backlinks]] - `[[문서 링크]]`, alias, autocomplete, preview link rendering, backlink, broken link 저장 및 reconciliation 방식.
- [[Wiki Schema]] - wiki page frontmatter, link, manifest 유지 규칙.

## 워크플로우

- [[Document Editing Workflow]] - 문서 생성, 수정, properties, attachment, comment, version restore, 감사 로그, link/metadata reconciliation 흐름.
- [[Auth And Permissions Workflow]] - NextAuth session, dev credentials, workspace role과 document-level explicit permission 흐름.
- [[Local Development Workflow]] - 로컬 실행, DB, seed, test, e2e, feature start, wiki maintenance 명령.
- [[Wiki Maintenance Automation]] - Feature Start, Ingest, Query, Lint, 커밋 전 sync plan/check 운영 방식.

## 결정

- [[Next.js Prisma Monolith]] - MVP를 Next.js App Router, server actions, Prisma, PostgreSQL monolith로 운영하는 결정.

## 디자인

- [[designs/index|UI Design Excalidraw Index]] - UI 작업이 포함된 GitHub 이슈별 Excalidraw 와이어프레임.

## 로그

- [[log|Wiki Log]] - wiki maintenance timeline.

## 상태판

- 최신 구현 현황: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]]
- 데이터/권한/링크 모델: [[Document Knowledge Model]], [[Folder Hierarchy Model]], [[Auth And Permissions Workflow]], [[Wiki Links And Backlinks]]
- wiki 운영 규칙: [[Wiki Schema]], [[Wiki Maintenance Automation]], [[Local Development Workflow]]; 신규 기능 시작은 `pnpm wiki:feature-start "<feature title>"`로 GitHub issue를 먼저 만든다.
- 디자인 산출물: [[designs/index|UI Design Excalidraw Index]]
- stale/draft 후보: 현재 명시된 후보 없음. `pnpm wiki:lint` warning이나 semantic lint에서 발견되면 이곳에 추가한다.
