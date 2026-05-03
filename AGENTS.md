# Repository Agent Rules

## Feature Start Workflow

Before implementing a new feature, create a GitHub issue by running:

```bash
pnpm wiki:feature-start "<feature title>"
```

The command should create the issue with GitHub CLI when possible. If GitHub CLI is unavailable or unauthenticated, use the printed issue template to create the issue manually before implementation starts.

When the current branch is `main`, the command creates and switches to `issue-<number>-<slug>`. When the current branch is already a feature branch or worktree branch, stay on that branch unless there is a concrete reason to split the work.

## Wiki-First Lookup

Before using broad `rg` to find project knowledge, read `wiki/index.md` or run:

```bash
pnpm wiki:find "<topic>"
```

Read matching wiki pages first. Use `rg` only when the wiki result is missing, stale, too broad, or explicitly points to raw source or code verification.

When durable knowledge is discovered, update the relevant wiki page, `wiki/index.md`, `wiki/manifest.json`, and `wiki/log.md` when appropriate.

Do not modify files under `raw/sources/` as part of wiki maintenance. Treat them as immutable source evidence.

## LLM Wiki Operating Loop

Treat the wiki as a persistent compiled knowledge layer, not as a scratchpad or search cache.

### Ingest

When reading a new durable source, commit, PR, review, design artifact, or runtime finding:

1. Identify the source evidence and leave `raw/sources/` unchanged.
2. Update the smallest set of affected wiki pages, not just a single summary page.
3. Add or adjust links between concept, workflow, decision, source, and question pages.
4. Record material claims, changed claims, contradictions, and open questions in the relevant page sections.
5. Append a `wiki/log.md` entry with affected pages and source evidence.

### Query

When answering a question from project knowledge:

1. Start from `wiki/index.md` or `pnpm wiki:find "<topic>"`.
2. Read matching wiki pages before source search.
3. Use source search only to verify stale, missing, or code-level facts.
4. If the answer creates reusable knowledge, file it back into the appropriate wiki page or create a `question` page.
5. Update `wiki/log.md` when the answer changes the durable project understanding.

### Lint

During wiki maintenance, check more than formatting:

- stale claims that no longer match source code or recent commits
- contradictions between pages
- orphan pages with no useful inbound or outbound links
- missing concept/workflow/decision pages for repeated terms
- claims without concrete source evidence
- pages whose `status`, `updated`, or `source_count` no longer reflect reality

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
