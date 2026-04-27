# Obsidian Clone Foundation Design

Date: 2026-04-27

## Context

The product is an enterprise wiki inspired by Obsidian's link-based knowledge management, not a direct Obsidian clone. The PRD defines the target as a Markdown-first internal wiki with organization/workspace structure, permissions, search, backlinks, graph exploration, version history, and auditability.

The first implementation milestone will prioritize the production foundation over a fast UI-only prototype. The goal is to create a real application base that later Markdown editing, wiki links, backlinks, search, and graph features can extend without major rework.

## Chosen Approach

Use the "core domain first" approach.

This means building the minimal product foundation first:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma
- PostgreSQL through Docker Compose
- Auth.js with a development Credentials provider for the first local milestone
- Organization, workspace, role, document, version, permission, and audit-log boundaries

This approach balances visible product progress with stable backend foundations. It avoids starting with a document-only prototype that would later need significant changes once permissions, audit logs, and workspace filtering are introduced.

## Initial Architecture

The first milestone will be a single Next.js application. The codebase should use clear module boundaries so future features can be added without mixing product rules into UI components.

Initial structure:

- `app/`: routes, layouts, pages, server actions, and route handlers
- `components/`: reusable UI, 3-column shell, forms, document list, editor shell, metadata panels
- `lib/auth`: Auth.js configuration and session helpers
- `lib/db`: Prisma client
- `lib/permissions`: organization, workspace, and document permission checks
- `lib/documents`: document CRUD orchestration, version snapshots, and audit log writes
- `prisma/schema.prisma`: database model definitions
- `docker-compose.yml`: local PostgreSQL service

The first UI should validate the product foundation rather than attempt a full Obsidian recreation. It should include login, workspace access, document listing, document creation, editing, archiving, and read-only behavior for viewer roles.

## Data Model

The first Prisma schema should include only the models needed for the foundation.

Core models:

- `User`
- `Organization`
- `OrganizationMember`
- `Workspace`
- `WorkspaceMember`
- `Document`
- `DocumentVersion`
- `Permission`
- `AuditLog`

Deferred models:

- `Team`
- `Comment`
- `Attachment`
- `Tag`
- `DocumentTag`
- `DocumentProperty`
- `DocumentLink`
- Graph cache tables

`Document` should include fields that keep later phases straightforward:

- `workspaceId`
- `parentId`
- `title`
- `slug`
- `path`
- `contentMarkdown`
- `contentText`
- `status`
- `createdById`
- `updatedById`
- `createdAt`
- `updatedAt`
- `archivedAt`

The initial milestone does not need to parse wiki links, tags, or frontmatter, but the schema should not block those later additions.

## Permission Model

Permissions should be layered, but the first implementation should keep enforcement simple.

Layers:

- Organization role controls organization access and management.
- Workspace role controls default read, write, and manage permissions inside a workspace.
- Document permission provides a future override mechanism for individual documents.

Initial implementation:

- Enforce workspace-level roles first.
- Add a `Permission` model and permission helper interfaces so document-level overrides can be introduced later.
- Use the same permission helper path for document reads and writes so future search, backlink, and graph filtering can share it.

Initial role behavior:

- Owner/Admin: manage workspace and documents.
- Editor: create and update documents.
- Viewer: read documents only.

## User Flow And UI Scope

The first milestone user flow:

1. User signs in.
2. User enters an organization and workspace.
3. User sees workspace documents in the left sidebar.
4. User creates, opens, edits, and archives documents.
5. User sees document metadata, version history, and audit log summaries in the right sidebar.
6. Viewer users can read but cannot save changes.

Initial layout:

- Left sidebar: workspace switcher, document list, create document action
- Center: document title, markdown textarea editor shell, preview panel reserved for the next milestone
- Right sidebar: reserved properties panel, version list, audit log list
- Top bar: reserved quick switcher control, save status, user menu

The layout should leave space for CodeMirror, backlink panels, outgoing links, and local graph, but those features are not part of the first milestone completion criteria.

## Versioning And Audit Logs

Document updates should create version snapshots. The first implementation can store full Markdown snapshots in `DocumentVersion`.

Audit logs should be written for important product actions:

- `workspace.created`
- `document.created`
- `document.updated`
- `document.archived`

Audit log records should include:

- Organization
- Actor
- Action
- Resource type
- Resource id
- JSON metadata
- Timestamp

## Error Handling

Initial error behavior:

- Unauthenticated request: redirect to login or return `401`
- Workspace access denied: return `403`
- Document access denied: return `403`
- Document not found: return `404`
- Viewer attempts to save: return `403`
- Database save failure: show a save failure state in the UI and log the server-side cause
- Archive action: soft-delete by setting `status` to `ARCHIVED` and writing `archivedAt`

Hard deletes should not be part of the first milestone.

## Testing Strategy

Testing should focus on the riskiest foundation logic.

Initial tests:

- Permission utility tests for Owner, Admin, Editor, and Viewer behavior
- Document service tests for create, update, archive, version snapshot creation, and audit log creation
- A route or smoke test that verifies authenticated workspace document access

Excluded from first milestone tests:

- Wiki link parser tests
- Backlink tests
- Graph rendering tests
- Full search tests

Those should be added when the corresponding features enter scope.

## Completion Criteria

The first milestone is complete when:

- `docker compose up` starts local PostgreSQL.
- Prisma migration and seed flow work.
- The app supports Auth.js login through a development Credentials provider.
- A user can access an organization and workspace.
- Documents can be created, read, updated, and archived in PostgreSQL.
- Viewer users cannot edit documents.
- Editor users can create and update documents.
- Document updates create version records.
- Document create/update/archive actions create audit log records.
- The UI uses the basic 3-column shell with reserved regions for future wiki-specific panels.

## Out Of Scope For This Milestone

- CodeMirror 6 integration
- Live split preview polish
- Wiki link autocomplete
- Backlink computation
- Broken link creation flow
- Tags and YAML frontmatter parsing
- PostgreSQL full-text search
- Local graph rendering
- Comments
- File uploads
- SSO/SAML
- Real-time collaboration
- Canvas
- Public publishing

## Next Step

After this design is reviewed, create an implementation plan that breaks the milestone into setup, schema, auth, permissions, document services, UI shell, tests, and verification steps.
