# Repository Agent Rules

## Wiki-First Lookup

Before using broad `rg` to find project knowledge, read `wiki/index.md` or run:

```bash
pnpm wiki:find "<topic>"
```

Read matching wiki pages first. Use `rg` only when the wiki result is missing, stale, too broad, or explicitly points to raw source or code verification.

When durable knowledge is discovered, update the relevant wiki page, `wiki/index.md`, `wiki/manifest.json`, and `wiki/log.md` when appropriate.

Do not modify files under `raw/sources/` as part of wiki maintenance. Treat them as immutable source evidence.

## Commit-Time Wiki Sync

Before committing source changes, run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
```

Use the candidate pages in the generated plan as the first wiki files to review. If the source changes introduce durable project knowledge, update those wiki pages plus `wiki/index.md` and `wiki/log.md` when navigation or chronology changes.

Then run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

`pnpm wiki:sync-check --staged` fails when staged source changes do not include any staged wiki maintenance file. This is a guardrail, not a substitute for judgment: small implementation-only changes may need a deliberate no-op wiki update entry, while architectural, workflow, model, or tooling changes should update the relevant page content.

The tracked `.githooks/pre-commit` hook runs `pnpm wiki:sync-check --staged` and `pnpm wiki:lint`. `pnpm wiki:install-hooks` enables that hook for the local checkout by setting `core.hooksPath`.
