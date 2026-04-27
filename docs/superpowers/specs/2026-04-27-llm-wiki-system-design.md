# LLM Wiki System Design

Date: 2026-04-27

## Context

This project is building an Obsidian-inspired internal wiki. The current application has a Next.js foundation, PostgreSQL/Prisma persistence, development Auth.js login, document CRUD services, version snapshots, audit logs, and a basic 3-column document UI.

The file `llm-wiki.md` describes a complementary operating pattern: instead of relying only on ad hoc retrieval over raw files, an LLM incrementally builds and maintains a persistent markdown wiki. The wiki becomes a compounding artifact with summaries, entity pages, concept pages, links, contradictions, logs, and an index.

The first implementation should instantiate that pattern inside this repository without overloading the app database yet. The markdown wiki will be the source of truth now, while its schema and manifest will be strict enough for later import into the app database.

## Chosen Approach

Use a hybrid, import-ready markdown wiki system.

The first version will:

- Maintain raw source files separately from generated wiki pages.
- Treat markdown wiki files as the source of truth.
- Add agent rules that require wiki-first lookup before broad `rg` searches.
- Add small CLI scripts for repeatable wiki lookup, log inspection, linting, and manifest generation.
- Maintain a JSON manifest that can later be mapped into Prisma `Document`, `DocumentTag`, `DocumentProperty`, and `DocumentLink` data.

This balances immediate usefulness for agent workflows with future app integration.

## Directory Structure

Create the following structure:

```text
raw/
  sources/
  assets/

wiki/
  index.md
  log.md
  manifest.json
  schema.md
  sources/
  concepts/
  entities/
  workflows/
  decisions/
  questions/
```

Responsibilities:

- `raw/sources/`: immutable source materials such as clipped articles, notes, reports, and markdown references.
- `raw/assets/`: local images and attachments referenced by raw sources.
- `wiki/index.md`: the first navigation file an agent reads before searching the repository.
- `wiki/log.md`: append-only timeline of ingest, query, lint, and maintenance work.
- `wiki/manifest.json`: structured metadata index for scripts and future app import.
- `wiki/schema.md`: conventions for page frontmatter, links, status values, and workflows.
- `wiki/sources/`: one summary page per raw source.
- `wiki/concepts/`: conceptual synthesis pages.
- `wiki/entities/`: people, organizations, tools, systems, and other named entities.
- `wiki/workflows/`: repeatable agent workflows, including wiki-first lookup, source ingest, and linting.
- `wiki/decisions/`: architecture, product, and operating decisions.
- `wiki/questions/`: durable answers or analyses created from user questions.

## Agent Lookup Rule

Add an `AGENTS.md` rule for this repository.

Required lookup behavior:

1. When looking for project knowledge, read `wiki/index.md` or run `pnpm wiki:find "<topic>"` before using `rg`.
2. Read the top matching wiki pages first.
3. Use `rg` only when the wiki result is missing, stale, too broad, or explicitly points to raw source/code verification.
4. If new durable knowledge is discovered, update the relevant wiki page, `wiki/index.md`, `wiki/manifest.json`, and `wiki/log.md` when appropriate.
5. Never modify files under `raw/sources/` as part of wiki maintenance.

This rule applies to future Codex/agent sessions in this repository.

## Page Schema

Every wiki page should use YAML frontmatter.

Required fields:

```yaml
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
  - "[[Persistent Wiki]]"
  - "[[Wiki-First Lookup]]"
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

Obsidian-style `[[Wiki Link]]` is the default link format for wiki-to-wiki references. Standard markdown links should be reserved for raw source paths, assets, and external URLs.

## Manifest

`wiki/manifest.json` is the structured bridge between the markdown wiki and the future app database.

Initial shape:

```json
{
  "version": 1,
  "updated": "2026-04-27",
  "pages": [
    {
      "id": "concept-llm-wiki",
      "path": "wiki/concepts/llm-wiki.md",
      "title": "LLM Wiki",
      "type": "concept",
      "status": "active",
      "summary": "Persistent LLM-maintained markdown wiki pattern.",
      "tags": ["llm-wiki", "knowledge-management"]
    }
  ]
}
```

The manifest should be generated from wiki page frontmatter rather than hand-maintained long term. The first implementation will commit a generated manifest and provide `pnpm wiki:manifest` to refresh it.

Future database mapping:

- `title`, `path`, `summary`, and markdown body map to `Document`.
- `tags` map to future `Tag` and `DocumentTag`.
- frontmatter fields map to future `DocumentProperty`.
- `[[Wiki Link]]` references map to future `DocumentLink`.

The first implementation will not import into PostgreSQL yet.

## CLI Commands

Add these scripts to `package.json`:

```json
{
  "wiki:find": "tsx scripts/wiki/find.ts",
  "wiki:log": "tsx scripts/wiki/log.ts",
  "wiki:lint": "tsx scripts/wiki/lint.ts",
  "wiki:manifest": "tsx scripts/wiki/manifest.ts"
}
```

Command behavior:

- `pnpm wiki:find <query>`
  - Searches `wiki/index.md` and `wiki/manifest.json` before any raw repo search.
  - Prints matching page path, title, type, status, and summary.
  - Prints `wiki miss, use rg next` when no useful result exists.

- `pnpm wiki:log`
  - Prints recent entries from `wiki/log.md`.
  - Defaults to 10 entries.
  - Supports a count argument such as `pnpm wiki:log 5`.

- `pnpm wiki:lint`
  - Fails when required frontmatter is missing.
  - Fails when manifest pages point to missing files.
  - Warns when wiki pages are missing from `wiki/index.md`.
  - Warns when `[[Wiki Link]]` targets appear unresolved.
  - Shows stale pages in output.

- `pnpm wiki:manifest`
  - Reads `wiki/**/*.md` frontmatter.
  - Regenerates `wiki/manifest.json`.
  - Includes `index.md` and `log.md` with low search priority metadata.

## Initial Wiki Seed

Use `llm-wiki.md` as the first source.

Initial files:

```text
raw/sources/llm-wiki.md
wiki/sources/llm-wiki.md
wiki/concepts/llm-wiki.md
wiki/concepts/persistent-wiki.md
wiki/workflows/wiki-first-lookup.md
wiki/workflows/source-ingest.md
wiki/workflows/wiki-lint.md
wiki/decisions/hybrid-markdown-first.md
wiki/index.md
wiki/log.md
wiki/schema.md
wiki/manifest.json
AGENTS.md
```

The root `llm-wiki.md` file should be preserved or moved only with explicit handling in the implementation plan. The raw source copy under `raw/sources/` is the immutable source for wiki maintenance.

## Index Format

`wiki/index.md` should be readable by humans and agents.

Example:

```md
## Concepts
- [[LLM Wiki]] — Persistent LLM-maintained markdown wiki pattern.
- [[Persistent Wiki]] — Knowledge artifact that compounds across sources and queries.

## Workflows
- [[Wiki-First Lookup]] — Read wiki index and relevant pages before grep/rg.
```

The index is content-oriented. It should be updated when pages are created, renamed, or materially changed.

## Log Format

`wiki/log.md` is chronological and append-only.

Example:

```md
## [2026-04-27] ingest | llm-wiki.md
- Added initial LLM Wiki pattern pages.
- Established wiki-first lookup rule.
```

Entries should use consistent prefixes:

```text
## [YYYY-MM-DD] ingest | title
## [YYYY-MM-DD] query | title
## [YYYY-MM-DD] lint | title
## [YYYY-MM-DD] maintenance | title
```

## Lint And Error Handling

Lint failures:

- A wiki page is missing frontmatter.
- A wiki page is missing a required frontmatter field.
- A frontmatter `type` is not in the allowed set.
- A frontmatter `status` is not in the allowed set.
- `wiki/manifest.json` references a missing page.
- A page id is duplicated.

Lint warnings:

- A wiki page is not mentioned in `wiki/index.md`.
- A `[[Wiki Link]]` target cannot be resolved.
- A page has `status: stale`.

`wiki:find` should include page status in output so agents know when a result is stale.

## Tests

Add tests for the script-level behavior.

Required coverage:

- `wiki:manifest` regenerates `wiki/manifest.json` from frontmatter.
- `wiki:find "llm wiki"` returns `wiki/concepts/llm-wiki.md`.
- `wiki:find "unknown"` prints the miss message.
- `wiki:lint` fails for missing required frontmatter.
- `wiki:lint` passes for the committed seed wiki.

These tests should be separate from the existing app service tests and should not require PostgreSQL.

## Out Of Scope

- Embedding or vector search.
- qmd integration.
- MCP server integration.
- Automatic web clipping.
- App database import implementation.
- UI for source ingest.
- UI for wiki lint results.
- Automated contradiction detection beyond simple lint warnings.

## Completion Criteria

The first implementation is complete when:

- The directory structure exists.
- `llm-wiki.md` is represented as an immutable raw source and generated wiki pages.
- `AGENTS.md` instructs agents to use wiki-first lookup before broad `rg`.
- `wiki/index.md`, `wiki/log.md`, `wiki/schema.md`, and `wiki/manifest.json` exist and are internally consistent.
- `pnpm wiki:find`, `pnpm wiki:log`, `pnpm wiki:lint`, and `pnpm wiki:manifest` work.
- Script tests pass without requiring PostgreSQL.
- Existing app tests and build still pass.
