---
id: decision-hybrid-markdown-first
title: Hybrid Markdown-First Wiki
type: decision
status: active
summary: Markdown wiki files are the source of truth now, with manifest metadata for later app import.
created: 2026-04-27
updated: 2026-04-27
source_count: 1
tags:
  - decision
  - architecture
links:
  - "[[LLM Wiki]]"
  - "[[Wiki Schema]]"
  - "[[Wiki-First Lookup]]"
---

# Hybrid Markdown-First Wiki

Decision: implement the wiki as markdown-first now, with a generated manifest that keeps the system ready for later database import.

Reasons:

- Markdown files are immediately useful to agents and humans.
- Git gives history, review, and rollback without more infrastructure.
- YAML frontmatter and `wiki/manifest.json` preserve structured metadata.
- App import can map pages to future `Document`, tag, property, and link records later.

This decision intentionally excludes vector search, MCP integration, and PostgreSQL import from the first implementation.
