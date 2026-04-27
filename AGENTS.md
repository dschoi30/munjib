# Repository Agent Rules

## Wiki-First Lookup

Before using broad `rg` to find project knowledge, read `wiki/index.md` or run:

```bash
pnpm wiki:find "<topic>"
```

Read matching wiki pages first. Use `rg` only when the wiki result is missing, stale, too broad, or explicitly points to raw source or code verification.

When durable knowledge is discovered, update the relevant wiki page, `wiki/index.md`, `wiki/manifest.json`, and `wiki/log.md` when appropriate.

Do not modify files under `raw/sources/` as part of wiki maintenance. Treat them as immutable source evidence.
