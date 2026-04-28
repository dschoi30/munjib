---
id: source-project-prd
title: Project PRD
type: source
status: active
summary: Munjib 제품 방향과 현재 repository 구현을 연결하는 source note.
created: 2026-04-29
updated: 2026-04-29
source_count: 7
tags:
  - munjib
  - source
  - prd
links:
  - "[[Munjib]]"
  - "[[Document Knowledge Model]]"
  - "[[Wiki Links And Backlinks]]"
  - "[[Next.js Prisma Monolith]]"
---

# Project PRD

이 source note는 root의 `prd.md`, `obsidian-analysis-report.md`, 현재 애플리케이션 source를 munjib wiki의 근거로 묶는다. `raw/sources/`는 immutable source로 취급하므로 이 작업에서는 수정하지 않는다.

## 제품 방향

`prd.md`는 Obsidian의 개인 지식관리 철학을 기업용 협업 위키로 재해석한다. 핵심 방향은 다음과 같다.

- Markdown-first 문서 작성.
- `[[문서 링크]]` 중심의 연결형 지식 구조.
- Backlink, outgoing link, broken link 탐색.
- 조직/workspace/user role 기반 협업.
- 문서 version history와 audit log.
- 장기적으로 search, graph, properties, template, review flow, export를 확장.

## Obsidian 분석에서 가져온 원칙

`obsidian-analysis-report.md`는 Obsidian의 local-first, markdown, graph, backlinks, properties, search, plugin, sync/publish 같은 기능을 분석한다. Munjib은 이를 그대로 복제하지 않고 사내 문서 위키에 필요한 협업, 권한, 감사, 검색, 템플릿 관점으로 재설계한다.

## 현재 구현 근거

현재 repository에서 확인한 구현 근거:

- `package.json`: Next.js, React, NextAuth, Prisma, Vitest, Playwright, wiki CLI.
- `prisma/schema.prisma`: organization/workspace/document/link/permission/audit schema.
- `prisma/seed.ts`: company handbook seed data와 owner/editor/viewer user.
- `lib/documents/service.ts`: 문서 생성, 수정, 아카이브, broken link 생성.
- `lib/wiki-links/parser.ts`: `[[...]]` parsing.
- `lib/wiki-links/reconcile.ts`: link row reconciliation과 repair.
- `app/workspaces/[workspaceSlug]/page.tsx`: workspace document UI composition.

## Wiki 작성 원칙

이 wiki는 현재 구현과 계획을 분리한다. 구현된 기능은 현재형으로 설명하고, PRD에는 있지만 코드에 없는 기능은 roadmap 또는 planned scope로만 언급한다.
