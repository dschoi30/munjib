---
id: concept-llm-wiki
title: LLM Wiki
type: concept
status: active
summary: Persistent LLM-maintained markdown wiki pattern.
created: 2026-04-27
updated: 2026-04-27
source_count: 1
tags:
  - llm-wiki
  - knowledge-management
links:
  - "[[LLM Wiki Source]]"
  - "[[Persistent Wiki]]"
  - "[[Wiki-First Lookup]]"
---

# LLM Wiki

An LLM wiki is a markdown knowledge base maintained by an LLM agent over time. It sits between immutable raw sources and day-to-day questions.

Instead of retrieving chunks from raw documents for every query, the agent compiles useful knowledge into pages, updates cross-references, and keeps summaries current as new sources or questions arrive.

Core layers:

- Raw sources: immutable source evidence under `raw/sources/`.
- Wiki pages: generated synthesis under `wiki/`.
- Schema and rules: operating instructions in [[Wiki Schema]] and `AGENTS.md`.

This project uses a hybrid markdown-first version: markdown files are the source of truth now, while frontmatter and `wiki/manifest.json` preserve enough structure for future app import.
