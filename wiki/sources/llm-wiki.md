---
id: source-llm-wiki
title: LLM Wiki Source
type: source
status: active
summary: Source note describing the LLM-maintained persistent markdown wiki pattern.
created: 2026-04-27
updated: 2026-04-27
source_count: 1
tags:
  - llm-wiki
  - source
links:
  - "[[LLM Wiki]]"
  - "[[Persistent Wiki]]"
  - "[[Source Ingest]]"
---

# LLM Wiki Source

This page summarizes `raw/sources/llm-wiki.md`, the immutable source that introduced the local wiki system.

The source argues that LLM agents should not repeatedly rediscover knowledge from raw files. Instead, they should incrementally maintain a structured markdown wiki that captures summaries, links, contradictions, and durable decisions.

Key source claims:

- Raw sources are immutable evidence.
- The wiki is the maintained synthesis layer.
- `AGENTS.md` or an equivalent schema file tells future agents how to behave.
- `index.md` is the first navigation surface for queries.
- `log.md` records ingest, query, lint, and maintenance work chronologically.
- Small CLI tools can make wiki-first lookup repeatable before broad repository search.

Primary derived pages:

- [[LLM Wiki]]
- [[Persistent Wiki]]
- [[Wiki-First Lookup]]
- [[Source Ingest]]
- [[Wiki Lint]]
- [[Hybrid Markdown-First Wiki]]
