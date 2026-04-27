---
id: concept-persistent-wiki
title: Persistent Wiki
type: concept
status: active
summary: A compounding markdown artifact that preserves synthesized knowledge across sessions.
created: 2026-04-27
updated: 2026-04-27
source_count: 1
tags:
  - llm-wiki
  - persistence
links:
  - "[[LLM Wiki]]"
  - "[[Wiki-First Lookup]]"
  - "[[Wiki Log]]"
---

# Persistent Wiki

A persistent wiki is a maintained artifact that accumulates knowledge instead of forcing each session to rediscover it.

For agents, persistence means:

- important findings are filed into durable pages;
- links are updated when concepts relate to one another;
- stale or superseded claims can be marked explicitly;
- new answers can become wiki pages when they have future value.

The wiki should improve after each ingest, query, or lint pass. [[Wiki Log]] records those changes so future sessions understand recent maintenance.
