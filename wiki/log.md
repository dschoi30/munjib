---
id: log-main
title: Wiki Log
type: log
status: active
summary: Munjib wiki 유지보수 timeline.
created: 2026-04-29
updated: 2026-05-04
source_count: 8
tags:
  - log
  - munjib
links:
  - "[[index|Wiki Index]]"
  - "[[Munjib]]"
  - "[[Project PRD]]"
  - "[[Wiki Maintenance Automation]]"
---

# Wiki Log

## 2026-05-04T01:20:00+09:00 - review

- Source evidence: PR #17 review comments by Codex and Gemini, `lib/wiki/feature-start.ts`, `tests/wiki/feature-start.test.ts`, [[Wiki Maintenance Automation]].
- Affected pages: [[Wiki Maintenance Automation]], [[log|Wiki Log]].
- Result: feature-start workflow가 GitHub Enterprise 같은 custom host의 issue URL도 parse하고, command 실패 시 stderr를 우선 표시하도록 리뷰 피드백을 반영했다.
- Verification: `pnpm exec vitest run tests/wiki/feature-start.test.ts`, `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-04T00:00:00+09:00 - maintenance

- Source evidence: GitHub issue #16, `docs/superpowers/specs/2026-05-04-feature-start-workflow-design.md`, `docs/superpowers/plans/2026-05-04-feature-start-workflow.md`, `AGENTS.md`, `scripts/wiki/feature-start.ts`, `lib/wiki/feature-start.ts`, `package.json`.
- Affected pages: [[Wiki Maintenance Automation]], [[Local Development Workflow]], [[index|Wiki Index]].
- Result: 신규 기능 구현 전 GitHub issue를 발행하고, `main`에서는 issue branch를 생성하는 feature-start workflow를 wiki 운영 절차에 추가했다.
- Verification: `pnpm exec vitest run tests/wiki/feature-start.test.ts`, `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-03T17:40:00+09:00 - maintenance

- Result: Markdown preview에서 `[[...]]` wiki link text를 Obsidian-style document navigation link로 렌더링하도록 구현했다.
- Coverage: resolved wiki link의 `?document=<id>` preview navigation, alias label, unresolved target의 bracket 없는 plain text fallback, embed/inline/fenced-code 제외.
- Pages: [[Wiki Links And Backlinks]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/document-editor.tsx`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/parser.test.ts`, `pnpm run build`.

## 2026-05-04T01:55:00+09:00 - review

- Result: PR #19 review feedback에 따라 markdown preview 변환이 multi-line inline code span, longer fenced code block, escaped wiki link, indented code block을 올바르게 보존하고, slug collision에서 임의 target을 고르지 않도록 보강했다.
- Coverage: matching backtick delimiter 기반 inline code span tracking, opening fence marker/width 기반 fenced code tracking, escaped `\[[...]]` literal fallback, 4-space/tab indented code block preservation, preview candidate slug map memoization, ReactMarkdown link component memoization, duplicate title slug ambiguity fallback.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #19 review comments, `components/document-editor.tsx`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/parser.test.ts`.

## 2026-05-03T13:25:00+09:00 - maintenance

- Result: LLM wiki 운영 방식을 커밋 누락 방지에서 Ingest, Query, Lint 기반의 영속 지식층 관리 규칙으로 확장했다.
- Coverage: agent-level operating loop, query answer 환류, semantic lint checklist, 타입별 page template, source evidence 기록 규칙, index 상태판.
- Pages: `AGENTS.md`, [[Wiki Schema]], [[Wiki Maintenance Automation]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `llm-wiki.md`, 사용자 제공 LLM wiki 관리 방향 요약, `AGENTS.md`, `wiki/Wiki Schema.md`, `wiki/Wiki Maintenance Automation.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check`.

## 2026-05-03T13:10:00+09:00 - maintenance

- Result: wiki sync 자동화 이전에 누락된 신규 기능 현황을 현재 code 기준으로 보강했다.
- Coverage: search/navigation, editor modes, properties, wiki link autocomplete, permission-filtered links/backlinks, broken link blank document creation, folder-like document creation, tags/frontmatter properties, attachments, comments, version restore, local graph, document-level permissions.
- Pages: [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[index|Wiki Index]].
- Source evidence: `git log`, `prisma/schema.prisma`, `app/workspaces/[workspaceSlug]/*`, `components/document-editor.tsx`, `components/document-navigation.tsx`, `components/metadata-panel.tsx`, `lib/documents/service.ts`, `lib/wiki-links/*`, `lib/document-metadata/*`, `lib/attachments/service.ts`, `lib/comments/service.ts`, `tests/e2e/login.spec.ts`.

## 2026-05-03T00:00:00+09:00 - maintenance

- Result: 커밋 전 source 변경을 기준으로 wiki 후보 page를 제안하고 wiki maintenance 누락을 감지하는 [[Wiki Maintenance Automation]] workflow를 추가했다.
- Tooling: `pnpm wiki:sync-plan`, `pnpm wiki:sync-check`, `pnpm wiki:install-hooks`, `.githooks/pre-commit`.
- Source evidence: `llm-wiki.md`, `AGENTS.md`, `.githooks/pre-commit`, `lib/wiki/sync.ts`, `package.json`.

## 2026-04-29T01:05:00+09:00 - maintenance

- Result: Obsidian에서 `[[...]]` 링크가 실제 note로 열리도록 주요 wiki page 파일명을 link target과 일치시켰다.
- Tooling: `wiki/index.md`와 `wiki/log.md`처럼 고정 경로가 필요한 운영 파일을 위해 `[[index|Wiki Index]]`, `[[log|Wiki Log]]` 형태를 사용하고, wiki lint가 파일 basename도 valid target으로 인정하도록 보강했다.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm exec vitest run tests/wiki/lint.test.ts tests/wiki/manifest.test.ts tests/wiki/search.test.ts`.

## 2026-04-29T00:00:00+09:00 - rewrite

- Result: 기존 `llm-wiki` 중심 wiki를 munjib project wiki로 전면 교체했다.
- Source evidence: `prd.md`, `obsidian-analysis-report.md`, `package.json`, `prisma/schema.prisma`, `lib/documents/service.ts`, `lib/wiki-links/*`, `app/workspaces/[workspaceSlug]/*`.
- Pages: [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[Document Editing Workflow]], [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[Next.js Prisma Monolith]], [[Wiki Schema]], [[index|Wiki Index]]
