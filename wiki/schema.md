---
id: schema-main
title: Wiki Schema
type: concept
status: active
summary: Required page metadata, link conventions, and maintenance rules for the markdown wiki.
created: 2026-04-27
updated: 2026-04-27
source_count: 1
tags:
  - schema
  - llm-wiki
links:
  - "[[LLM Wiki]]"
  - "[[Wiki Lint]]"
  - "[[Hybrid Markdown-First Wiki]]"
---

# Wiki Schema

Every wiki page must start with YAML frontmatter.

Required fields:

```yaml
---
id: concept-example
title: Example Page
type: concept
status: active
summary: One-sentence page summary.
created: 2026-04-27
updated: 2026-04-27
source_count: 1
tags:
  - example
links:
  - "[[Wiki Index]]"
---
```

Allowed `type` values:

```text
source | concept | entity | workflow | decision | question | index | log
```

Allowed `status` values:

```text
active | stale | draft | superseded
```

Use Obsidian-style `[[Wiki Link]]` references for wiki-to-wiki links. Use standard markdown links for raw source paths, local assets, or external URLs.

Regenerate `wiki/manifest.json` with `pnpm wiki:manifest` after changing page frontmatter.
