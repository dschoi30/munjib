---
id: workflow-wiki-lint
title: Wiki Lint
type: workflow
status: active
summary: Maintenance workflow for checking wiki structure and unresolved links.
created: 2026-04-27
updated: 2026-04-27
source_count: 1
tags:
  - workflow
  - lint
links:
  - "[[Wiki Schema]]"
  - "[[Wiki Index]]"
  - "[[Wiki Log]]"
---

# Wiki Lint

Run `pnpm wiki:lint` after changing wiki pages.

The linter fails on:

- missing frontmatter;
- missing required fields;
- invalid page type;
- invalid page status;
- duplicate manifest IDs;
- manifest entries pointing at missing files.

The linter warns on:

- pages missing from [[Wiki Index]];
- unresolved wiki links;
- pages marked `stale`.

Fix errors before committing wiki changes. Warnings should be handled or intentionally left visible for future maintenance.
