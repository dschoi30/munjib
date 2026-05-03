---
id: log-main
title: Wiki Log
type: log
status: active
summary: Munjib wiki 유지보수 timeline.
created: 2026-04-29
updated: 2026-04-29
source_count: 1
tags:
  - log
  - munjib
links:
  - "[[index|Wiki Index]]"
  - "[[Munjib]]"
  - "[[Project PRD]]"
---

# Wiki Log

## 2026-04-29T01:05:00+09:00 - maintenance

- Result: Obsidian에서 `[[...]]` 링크가 실제 note로 열리도록 주요 wiki page 파일명을 link target과 일치시켰다.
- Tooling: `wiki/index.md`와 `wiki/log.md`처럼 고정 경로가 필요한 운영 파일을 위해 `[[index|Wiki Index]]`, `[[log|Wiki Log]]` 형태를 사용하고, wiki lint가 파일 basename도 valid target으로 인정하도록 보강했다.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm exec vitest run tests/wiki/lint.test.ts tests/wiki/manifest.test.ts tests/wiki/search.test.ts`.

## 2026-04-29T00:00:00+09:00 - rewrite

- Result: 기존 `llm-wiki` 중심 wiki를 munjib project wiki로 전면 교체했다.
- Source evidence: `prd.md`, `obsidian-analysis-report.md`, `package.json`, `prisma/schema.prisma`, `lib/documents/service.ts`, `lib/wiki-links/*`, `app/workspaces/[workspaceSlug]/*`.
- Pages: [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[Document Editing Workflow]], [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[Next.js Prisma Monolith]], [[Wiki Schema]], [[index|Wiki Index]]
