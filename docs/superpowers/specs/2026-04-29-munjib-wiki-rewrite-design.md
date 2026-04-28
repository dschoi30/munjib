---
title: Munjib Wiki Rewrite Design
date: 2026-04-29
status: approved-for-review
scope: Replace the current llm-wiki-oriented repository wiki with munjib project knowledge.
---

# Munjib Wiki Rewrite Design

## Goal

Replace the current `wiki/` content, which still describes the generic LLM wiki pattern, with durable knowledge about munjib: an Obsidian-inspired enterprise document wiki built with Next.js, Prisma, PostgreSQL, and NextAuth.

The wiki should help future agents and maintainers answer project questions before falling back to broad source search. It should describe what the product is, how the code is organized, how core workflows move through the app, and which commands verify wiki and application behavior.

## Current State

The repository already has a functioning markdown wiki system with frontmatter, a manifest, lookup, log, and lint commands. The page contents are stale for this project because they explain the seed concept of an LLM-maintained wiki rather than munjib itself.

The application code currently includes:

- Next.js App Router pages for login and workspace document editing.
- NextAuth development credentials login and session helpers.
- Prisma models for organizations, workspaces, members, documents, document versions, document links, permissions, and audit logs.
- Document service workflows for create, update, archive, and create-from-broken-link.
- Wiki-link parsing and reconciliation for outgoing links, backlinks, and broken links.
- Workspace role checks for read/write/manage access.
- Wiki maintenance CLI commands: `pnpm wiki:find`, `pnpm wiki:manifest`, `pnpm wiki:lint`, and `pnpm wiki:log`.

## Proposed Page Set

The rewrite will replace the existing llm-wiki pages with a munjib-focused page set:

- `wiki/index.md`: Navigation entry point for munjib project knowledge.
- `wiki/concepts/munjib.md`: Product definition and MVP shape.
- `wiki/concepts/document-knowledge-model.md`: Data model and relationship summary.
- `wiki/concepts/wiki-links-and-backlinks.md`: Wiki link parsing, reconciliation, backlinks, and broken-link behavior.
- `wiki/workflows/document-editing.md`: Document create, update, versioning, audit, and link update flow.
- `wiki/workflows/auth-and-permissions.md`: Login, session, role checks, and permission boundaries.
- `wiki/workflows/local-development.md`: Development, database, seed, test, e2e, and wiki commands.
- `wiki/decisions/nextjs-prisma-monolith.md`: Current architecture decision and future split criteria.
- `wiki/sources/project-prd.md`: Source note for `prd.md`, `obsidian-analysis-report.md`, schema, services, and current implementation evidence.
- `wiki/schema.md`: Keep the wiki schema page, but update examples and tags for munjib.
- `wiki/log.md`: Replace the llm-wiki timeline with a munjib wiki rewrite entry.
- `wiki/manifest.json`: Regenerate from frontmatter after content changes.

The old generic llm-wiki pages should be removed from the maintained wiki surface. If their concept is needed later, it can live outside the active project wiki or be reintroduced as a clearly labeled historical source.

## Content Boundaries

The wiki will document the current project as observed in the repository. It should not overstate planned features as implemented. Planned or reserved UI areas, such as graph panels, rich preview, properties, and later search behavior, should be described as roadmap or reserved scope when mentioned.

The wiki should not edit files under `raw/sources/`. Existing root-level source notes such as `prd.md` and `obsidian-analysis-report.md` may be cited by path, but they should remain source evidence rather than maintained wiki pages.

## Architecture

The wiki remains markdown-first. Each page will use the existing required YAML frontmatter fields:

- `id`
- `title`
- `type`
- `status`
- `summary`
- `created`
- `updated`
- `source_count`
- `tags`
- `links`

Pages will use Obsidian-style `[[Wiki Link]]` references for wiki-to-wiki links. Local source and code references will use standard markdown paths.

The manifest will continue to be generated from frontmatter using `pnpm wiki:manifest`.

## Data Flow To Document

The rewrite will capture these durable flows:

- A user signs in through NextAuth credentials in development.
- Workspace pages require a current user and check workspace membership.
- Document create/update paths assert write access.
- Document content is stored as markdown and plain text.
- Document updates create `DocumentVersion` rows.
- Create/update paths reconcile `[[wiki links]]` into `DocumentLink` rows.
- Broken links can create new documents and repair the corresponding link records.
- Document mutations write audit logs.
- The metadata panel reads outgoing links, backlinks, broken links, versions, and recent audit logs.

## Error Handling And Risk

The rewrite is documentation-only. The main risks are stale claims, unresolved wiki links, and manifest drift.

Mitigations:

- Use current source files and source notes as evidence.
- Avoid broad future-tense feature claims except where explicitly marked as planned.
- Regenerate `wiki/manifest.json`.
- Run `pnpm wiki:lint`.
- Run at least one lookup such as `pnpm wiki:find munjib` to confirm discoverability.

## Verification

After implementation, verify with:

```bash
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:find munjib
```

Application tests are not required for this documentation rewrite unless source code changes are made.

## Implementation Notes

This spec only authorizes the wiki rewrite. It does not authorize application behavior changes, schema changes, or test changes.

Before implementation starts, the user should review this spec. After approval, the next step is to create an implementation plan and then edit the wiki files.
