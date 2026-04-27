---
id: workflow-source-ingest
title: Source Ingest
type: workflow
status: active
summary: Workflow for turning immutable raw sources into maintained wiki pages.
created: 2026-04-27
updated: 2026-04-27
source_count: 1
tags:
  - workflow
  - ingest
links:
  - "[[LLM Wiki Source]]"
  - "[[LLM Wiki]]"
  - "[[Wiki Log]]"
---

# Source Ingest

Use this workflow when adding a new source to the wiki.

1. Place the original source under `raw/sources/`.
2. Treat the raw source as immutable evidence.
3. Create or update a source summary page under `wiki/sources/`.
4. Update affected concept, workflow, decision, entity, or question pages.
5. Update [[Wiki Index]] and regenerate `wiki/manifest.json`.
6. Append an entry to [[Wiki Log]] describing what changed.

The initial ingest processed [[LLM Wiki Source]] into the seed pages for this repository.
