# Project Structure Onboarding Guide Design

## Context

Issue #123 adds a developer onboarding page that explains the Munjib project
structure for someone joining the repository for the first time.

The repository already has detailed wiki pages for product scope, data modeling,
document editing, auth, RAG, local development, deployment, and wiki maintenance.
What is missing is an entry map: a short, visual guide that tells a new developer
what to read first, which directories own which responsibilities, and which files
to open when tracing common product flows.

This guide should live in the wiki because repository rules make the wiki the
compiled knowledge layer and the first lookup surface before broad source search.

## Goals

- Add `wiki/Project Structure Onboarding.md` as the first-hour entry point for a
  new Munjib developer.
- Make the page visual-first with Mermaid diagrams and compact tables.
- Explain the repository by runtime responsibilities, not as a complete file
  inventory.
- Link onward to existing durable wiki pages instead of duplicating their full
  content.
- Ground every major path in current source entry points such as workspace routes,
  domain services, Prisma schema, RAG services, tests, and wiki scripts.
- Add navigation from `wiki/index.md` so the page is discoverable.

## Non-Goals

- Do not rewrite the project README.
- Do not replace `Munjib`, `Project PRD`, `Document Knowledge Model`,
  `Document Editing Workflow`, `RAG Process Workflow`, or
  `Local Development Workflow`.
- Do not document every file in the repository.
- Do not restate the full PRD or roadmap.
- Do not include long RAG tuning details, full deployment runbooks, or exhaustive
  test matrices.
- Do not change source code behavior.

## Page Location

Create a new wiki page:

```text
wiki/Project Structure Onboarding.md
```

Add it to `wiki/index.md` in the workflow navigation section, immediately before
`Local Development Workflow`, as the recommended first stop for repository
orientation.

The page should use normal wiki frontmatter with:

- `type: workflow`
- `status: active`
- tags for `munjib`, `onboarding`, `architecture`, and `development`
- links to the existing pages it routes readers toward

## Page Structure

The page should be organized around a first-hour path:

1. Product shape: read `Munjib` and understand this is a Next.js/Prisma monolith
   for a Markdown-first workspace wiki.
2. Local run path: jump to `Local Development Workflow` for install, DB, seed,
   and verification commands.
3. Workspace route path: start at `app/workspaces/[workspaceSlug]/page.tsx` and
   see how the workspace screen composes editor, navigation, graph, settings, and
   workspace chat surfaces.
4. Document save path: follow server actions into `lib/documents/service.ts`,
   wiki-link reconciliation, metadata extraction, audit logging, and RAG indexing.
5. AI path: separate current-document Ask AI from workspace chatbot RAG using the
   existing `RAG Process Workflow`.
6. Knowledge maintenance path: explain when to update wiki pages, `wiki/index.md`,
   `wiki/manifest.json`, and `wiki/log.md`.

After the first-hour section, the page should include:

- Repository responsibility map.
- Runtime request-flow map.
- Feature-to-files guide.
- Data and knowledge source-of-truth summary.
- Verification and wiki maintenance checklist.

## Visual Design

The page should include two Mermaid diagrams and one compact source-of-truth
table.

### Directory Responsibility Map

Use a Mermaid flowchart to show the major repository areas:

- `app/`: App Router pages, route handlers, server actions, global layout.
- `components/`: workspace shell, editor, navigation, graph, settings, AI UI.
- `lib/`: domain services and pure helpers for documents, folders, permissions,
  wiki links, RAG, observability, attachments, and wiki tooling.
- `prisma/`: schema, migrations, seed data, generated client boundary.
- `tests/`: focused Vitest, component tests, e2e tests, and workflow tests.
- `scripts/`: wiki CLI, DB vector index setup, maintenance commands.
- `wiki/` and `docs/`: durable project knowledge, designs, and implementation
  plans/specs.

### Runtime Request Flow

Use a second Mermaid flowchart to show the common monolith path:

```text
UI component -> route handler or server action -> lib service -> Prisma/Postgres
```

Branch that diagram for:

- document editing and metadata reconciliation
- graph DTO construction and client filtering
- Ask AI direct-context generation
- workspace chatbot RAG retrieval and streaming

### Data And Knowledge Map

Use a compact table to separate source-of-truth layers:

- Prisma/PostgreSQL owns runtime product data.
- Saved Markdown in `Document` rows is the source for document content, wiki-link
  parsing, metadata extraction, RAG chunking, and graph construction.
- `DocumentLink`, `DocumentTag`, and `DocumentChunk` are derived or indexed
  runtime support data.
- `wiki/` owns durable project knowledge and should be updated when behavior or
  architecture knowledge changes.
- `raw/sources/` remains immutable source evidence.

## Feature-To-Files Guide

Include a compact table with rows for common onboarding questions:

- Workspace screen and routing.
- Document create/update/archive.
- Folder tree and navigation.
- Markdown preview, properties, and heading folding.
- Wiki links, backlinks, broken links, tags, and graph view.
- Auth and permission filtering.
- Ask AI direct current-document answers.
- Workspace AI chatbot and RAG retrieval.
- Attachments, comments, versions, and audit logs.
- Retention and archived-document purge.
- Wiki maintenance automation.
- Local verification.

Each row should list:

- where to start reading
- the main supporting `lib/` module
- the most relevant wiki page
- representative tests

## Writing Style

Use short explanations, tables, and diagrams. A new developer should be able to
skim the page in about 10 minutes and then follow deep links for details.

Prefer concrete paths over abstract descriptions. For example, say
`app/workspaces/[workspaceSlug]/page.tsx` and `lib/rag/workspace-chat.ts` instead
of "the page" or "the chatbot backend".

Avoid duplicating long details from existing pages. Link to them with one-line
orientation notes.

## Wiki Updates

Implementation should update:

- `wiki/Project Structure Onboarding.md`: new page.
- `wiki/index.md`: add the page to navigation.
- `wiki/manifest.json`: regenerate with `pnpm wiki:manifest`.
- `wiki/log.md`: append an entry for Issue #123 with source evidence.

If the page repeats any durable claim that belongs in a more specific page, either
link to that page or update the specific page instead of making this onboarding
guide the only source.

## Validation

Because this is documentation-only, validation should focus on wiki integrity:

```bash
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --check
```

If implementation stages only wiki/doc files, `wiki:sync-check --staged` should
still pass because wiki maintenance files are included. If the implementation
also changes source code, run the relevant focused tests for that source surface.
