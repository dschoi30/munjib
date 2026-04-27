---
id: workflow-wiki-first-lookup
title: Wiki-First Lookup
type: workflow
status: active
summary: Agent workflow requiring wiki lookup before broad repository grep.
created: 2026-04-27
updated: 2026-04-27
source_count: 1
tags:
  - workflow
  - lookup
links:
  - "[[Wiki Index]]"
  - "[[LLM Wiki]]"
  - "[[Wiki Schema]]"
---

# Wiki-First Lookup

Use this workflow whenever looking for project knowledge.

1. Read [[Wiki Index]] or run `pnpm wiki:find "<topic>"`.
2. Open the most relevant wiki pages.
3. Use broad `rg` only when the wiki result is missing, stale, too broad, or points to raw source or code verification.
4. If durable knowledge is found, update the relevant wiki page, [[Wiki Index]], `wiki/manifest.json`, and [[Wiki Log]].
5. Do not modify files under `raw/sources/`.

This workflow turns the wiki into the first retrieval layer for future sessions.
