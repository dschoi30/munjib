# Mermaid ERD Wiki Design

## Context

Munjib already documents the current Prisma-backed domain model in `wiki/Document Knowledge Model.md`. The page explains the model groups in prose, but it does not provide a single visual relationship view. The user wants the current wiki to include a Mermaid-format ERD.

## Goal

Add a Mermaid `erDiagram` to the wiki so readers can inspect the current Prisma schema relationships directly from the data model page.

## Scope

The ERD will reflect the current full `prisma/schema.prisma` model set:

- `User`
- `Organization`
- `OrganizationMember`
- `Workspace`
- `WorkspaceMember`
- `Document`
- `DocumentVersion`
- `DocumentLink`
- `Tag`
- `DocumentTag`
- `DocumentProperty`
- `Attachment`
- `Comment`
- `Permission`
- `AuditLog`

The ERD will not change application code, database schema, migrations, tests, or runtime behavior.

## Approach

Use `wiki/Document Knowledge Model.md` as the canonical destination because it already owns the durable data model explanation. Add a `## Mermaid ERD` section near the top of the page, after the opening model summary and before the prose breakdown. The diagram will use Mermaid `erDiagram` syntax and include entity fields plus relationship lines that match Prisma relations.

Enum values such as `WorkspaceRole`, `DocumentStatus`, and `PermissionLevel` will remain explained in prose instead of being modeled as separate Mermaid entities. Mermaid ERD has limited enum semantics, and separate enum boxes would make the schema look more relational than the Prisma model actually is.

## Wiki Maintenance

Update the smallest durable wiki set:

- `wiki/Document Knowledge Model.md`: add the ERD and adjust metadata.
- `wiki/log.md`: append an entry for the ERD maintenance work.
- `wiki/manifest.json`: regenerate with `pnpm wiki:manifest`.

`wiki/index.md` already links to `Document Knowledge Model`, so it only needs changes if the generated manifest or lint rules expose a navigation gap.

## Verification

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

The Mermaid block is documentation-only, so no application test is required unless source files change.

## Out Of Scope

- Generating the ERD automatically from Prisma.
- Adding a separate schema visualization page.
- Changing wiki schema rules for diagram syntax.
- Modifying `raw/sources/`.
