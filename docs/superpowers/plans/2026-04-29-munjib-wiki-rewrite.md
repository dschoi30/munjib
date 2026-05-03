# Munjib Wiki Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 `llm-wiki` 중심 repository wiki를 munjib 프로젝트 설명으로 전면 교체한다.

**Architecture:** 기존 markdown-first wiki 구조와 frontmatter schema는 유지한다. 페이지 본문, 링크, index, log를 munjib 중심으로 다시 쓰고 `pnpm wiki:manifest`로 manifest를 재생성한다.

**Tech Stack:** Markdown, Obsidian-style wikilinks, existing `pnpm wiki:*` CLI, Next.js/Prisma/NextAuth project evidence.

---

## File Structure

- Modify: `wiki/index.md` - munjib wiki navigation entry point.
- Modify: `wiki/schema.md` - wiki schema rules with munjib examples.
- Modify: `wiki/log.md` - munjib wiki rewrite maintenance log.
- Modify: `wiki/manifest.json` - generated from frontmatter.
- Create: `wiki/concepts/munjib.md` - product concept.
- Create: `wiki/concepts/document-knowledge-model.md` - core domain model.
- Create: `wiki/concepts/wiki-links-and-backlinks.md` - link model behavior.
- Create: `wiki/workflows/document-editing.md` - document mutation flow.
- Create: `wiki/workflows/auth-and-permissions.md` - auth and permission flow.
- Create: `wiki/workflows/local-development.md` - local commands and verification.
- Create: `wiki/decisions/nextjs-prisma-monolith.md` - architecture decision.
- Create: `wiki/sources/project-prd.md` - source evidence note.
- Delete: `wiki/concepts/llm-wiki.md`, `wiki/concepts/persistent-wiki.md`, `wiki/decisions/hybrid-markdown-first.md`, `wiki/sources/llm-wiki.md`, `wiki/workflows/source-ingest.md`, `wiki/workflows/wiki-first-lookup.md`, `wiki/workflows/wiki-lint.md`.

## Task 1: Replace Wiki Page Set

**Files:**
- Modify: `wiki/index.md`
- Modify: `wiki/schema.md`
- Modify: `wiki/log.md`
- Create/Modify/Delete the wiki pages listed above.

- [ ] **Step 1: Remove stale llm-wiki pages**

Remove only the old pages that describe the generic LLM wiki pattern:

```text
wiki/concepts/llm-wiki.md
wiki/concepts/persistent-wiki.md
wiki/decisions/hybrid-markdown-first.md
wiki/sources/llm-wiki.md
wiki/workflows/source-ingest.md
wiki/workflows/wiki-first-lookup.md
wiki/workflows/wiki-lint.md
```

- [ ] **Step 2: Write Korean munjib pages**

Create Korean markdown pages with valid frontmatter. Each page must include accurate source/code references and avoid claiming planned features are already implemented.

- [ ] **Step 3: Check unresolved wiki links by inspection**

Confirm every `[[...]]` target in frontmatter and body has a page title in the new page set.

## Task 2: Regenerate Manifest And Verify

**Files:**
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Regenerate manifest**

Run:

```bash
pnpm wiki:manifest
```

Expected: command writes `wiki/manifest.json` with the new munjib page set.

- [ ] **Step 2: Lint wiki**

Run:

```bash
pnpm wiki:lint
```

Expected: no errors. Warnings should be fixed unless they are intentionally accepted and explained.

- [ ] **Step 3: Verify lookup discoverability**

Run:

```bash
pnpm wiki:find munjib
pnpm wiki:find "문서 편집"
pnpm wiki:find "wiki link"
```

Expected: each query returns relevant munjib wiki pages.

## Task 3: Review Diff And Commit

**Files:**
- All changed wiki files.
- `docs/superpowers/plans/2026-04-29-munjib-wiki-rewrite.md`

- [ ] **Step 1: Review changed files**

Run:

```bash
git status --short
git diff -- wiki docs/superpowers/plans/2026-04-29-munjib-wiki-rewrite.md
```

Expected: diff contains only the plan and wiki documentation changes for this task.

- [ ] **Step 2: Commit scoped documentation changes**

Run:

```bash
git add docs/superpowers/plans/2026-04-29-munjib-wiki-rewrite.md wiki
git commit -m "docs: rewrite wiki for munjib project"
```

Expected: commit succeeds without staging unrelated app/test changes.
