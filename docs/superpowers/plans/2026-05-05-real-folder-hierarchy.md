# Real Folder Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace folder-like document creation with first-class folder containers, folder-aware document paths, path-qualified wikilinks, and a vault tree navigation.

**Architecture:** Add a `Folder` Prisma model and make `Document.folderId` the source of truth for document location. Keep document permissions document-only, keep folder management workspace-write, and block archive of non-empty folders. Update wiki link resolution to use path-qualified targets first and mark duplicate title-only targets as ambiguous instead of choosing one.

**Tech Stack:** Next.js App Router, React server actions, Prisma/PostgreSQL, TypeScript, Vitest, Playwright, existing wiki maintenance CLI.

---

## File Structure

- Modify `prisma/schema.prisma`: add `Folder`, `Document.folderId`, link Folder relations, add link ambiguity field.
- Create `lib/folders/path.ts`: path normalization and folder/document path helpers.
- Create `lib/folders/types.ts`: folder service input types.
- Create `lib/folders/service.ts`: create, rename, move, archive folder operations.
- Modify `lib/documents/types.ts`: add `folderId` to create input and add move document input.
- Modify `lib/documents/service.ts`: folder-aware document slug/path, rename path updates, document move.
- Create `lib/workspace-tree.ts`: permission-aware workspace tree query and tree shaping.
- Modify `app/workspaces/[workspaceSlug]/page.tsx`: load folders, use tree, support folder selection.
- Modify `app/workspaces/[workspaceSlug]/actions.ts`: split create document/folder actions and add move/archive folder actions.
- Replace `components/document-list.tsx` responsibilities with workspace tree props, or split into `components/workspace-tree.tsx` plus a thin wrapper.
- Create `components/folder-detail.tsx`: selected folder empty/detail state.
- Modify `components/document-navigation.tsx`: render folders/documents, path labels, quick switcher labels.
- Modify `components/document-editor.tsx`: pass path-aware link candidates.
- Modify `lib/wiki-links/parser.ts`: parse path-qualified targets without changing alias behavior.
- Modify `lib/wiki-links/reconcile.ts`: resolve by path, title, and ambiguous title collisions.
- Modify `lib/wiki-links/preview.ts`: preview path-qualified links and ambiguous fallback.
- Modify `lib/wiki-links/autocomplete.ts`: support display/insert target values for duplicate titles.
- Modify `lib/wiki-links/types.ts` and `lib/wiki-links/service.ts`: expose ambiguous links separately from broken links.
- Modify `prisma/seed.ts`: seed at least one folder and document under it after migration support is in place.
- Add or modify tests:
  - `tests/folders/path.test.ts`
  - `tests/folders/service.test.ts`
  - `tests/documents/service.test.ts`
  - `tests/wiki-links/reconcile.test.ts`
  - `tests/wiki-links/preview.test.ts`
  - `tests/wiki-links/autocomplete.test.ts`
  - `tests/e2e/login.spec.ts`
- Update wiki after implementation:
  - `wiki/Folder Hierarchy Model.md`
  - `wiki/Document Knowledge Model.md`
  - `wiki/Document Editing Workflow.md`
  - `wiki/Wiki Links And Backlinks.md`
  - `wiki/Auth And Permissions Workflow.md`
  - `wiki/Munjib.md`
  - `wiki/Project PRD.md`
  - `wiki/index.md`
  - `wiki/log.md`
  - `wiki/manifest.json`

## Task 1: Prisma Folder Model And Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_folder_hierarchy/migration.sql`
- Test with Prisma generate immediately and with focused service tests in Tasks 3 and 4.

- [ ] **Step 1: Update Prisma schema**

Add `Folder` and relations while keeping `Document.parentId` for compatibility:

```prisma
model Workspace {
  id             String            @id @default(cuid())
  organizationId String
  name           String
  slug           String
  visibility     String            @default("private")
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  organization   Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  members        WorkspaceMember[]
  folders        Folder[]
  documents      Document[]
  documentLinks  DocumentLink[]
  tags           Tag[]

  @@unique([organizationId, slug])
}

model Folder {
  id             String         @id @default(cuid())
  workspaceId    String
  parentFolderId String?
  name           String
  slug           String
  path           String
  status         DocumentStatus @default(ACTIVE)
  createdById    String
  updatedById    String
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  archivedAt     DateTime?
  workspace      Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  parentFolder   Folder?        @relation("FolderTree", fields: [parentFolderId], references: [id], onDelete: Restrict)
  childFolders   Folder[]       @relation("FolderTree")
  documents      Document[]
  createdBy      User           @relation("FolderCreatedBy", fields: [createdById], references: [id])
  updatedBy      User           @relation("FolderUpdatedBy", fields: [updatedById], references: [id])

  @@unique([workspaceId, parentFolderId, slug])
  @@unique([workspaceId, path])
  @@index([workspaceId, status])
  @@index([parentFolderId])
}
```

Update `User` and `Document`:

```prisma
model User {
  id                  String               @id @default(cuid())
  email               String               @unique
  name                String
  avatarUrl           String?
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  organizationMembers OrganizationMember[]
  workspaceMembers    WorkspaceMember[]
  documentsCreated    Document[]           @relation("DocumentCreatedBy")
  documentsUpdated    Document[]           @relation("DocumentUpdatedBy")
  foldersCreated      Folder[]             @relation("FolderCreatedBy")
  foldersUpdated      Folder[]             @relation("FolderUpdatedBy")
  documentVersions    DocumentVersion[]
  attachmentsUploaded Attachment[]
  comments            Comment[]
  auditLogs           AuditLog[]
}

model Document {
  id              String            @id @default(cuid())
  workspaceId     String
  parentId        String?
  folderId        String?
  title           String
  slug            String
  path            String
  contentMarkdown String            @default("")
  contentText     String            @default("")
  status          DocumentStatus    @default(ACTIVE)
  createdById     String
  updatedById     String
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  archivedAt      DateTime?
  workspace       Workspace         @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  folder          Folder?           @relation(fields: [folderId], references: [id], onDelete: Restrict)
  parent          Document?         @relation("DocumentTree", fields: [parentId], references: [id])
  children        Document[]        @relation("DocumentTree")
  createdBy       User              @relation("DocumentCreatedBy", fields: [createdById], references: [id])
  updatedBy       User              @relation("DocumentUpdatedBy", fields: [updatedById], references: [id])
  versions        DocumentVersion[]
  outgoingLinks   DocumentLink[]     @relation("DocumentOutgoingLinks")
  incomingLinks   DocumentLink[]     @relation("DocumentIncomingLinks")
  tags            DocumentTag[]
  properties      DocumentProperty[]
  attachments     Attachment[]
  comments        Comment[]

  @@unique([workspaceId, folderId, slug])
  @@unique([workspaceId, path])
  @@index([workspaceId, status])
  @@index([folderId])
}
```

- [ ] **Step 2: Add ambiguous link storage**

Modify `DocumentLink`:

```prisma
model DocumentLink {
  id               String    @id @default(cuid())
  workspaceId      String
  sourceDocumentId String
  targetDocumentId String?
  targetTitleRaw   String
  alias            String?
  linkType         String    @default("wiki")
  isBroken         Boolean   @default(false)
  isAmbiguous      Boolean   @default(false)
  sortOrder        Int       @default(0)
  createdAt        DateTime  @default(now())
  workspace        Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  sourceDocument   Document  @relation("DocumentOutgoingLinks", fields: [sourceDocumentId], references: [id], onDelete: Cascade)
  targetDocument   Document? @relation("DocumentIncomingLinks", fields: [targetDocumentId], references: [id], onDelete: SetNull)

  @@index([workspaceId])
  @@index([sourceDocumentId])
  @@index([sourceDocumentId, sortOrder])
  @@index([targetDocumentId])
  @@index([workspaceId, targetTitleRaw])
}
```

- [ ] **Step 3: Generate migration**

Run:

```bash
pnpm exec prisma migrate dev --name add_folder_hierarchy
```

Expected: Prisma creates `prisma/migrations/<timestamp>_add_folder_hierarchy/migration.sql` and regenerates the client.

- [ ] **Step 4: Inspect generated SQL**

Verify the migration includes:

```sql
CREATE TABLE "Folder"
ALTER TABLE "Document" ADD COLUMN "folderId" TEXT
ALTER TABLE "DocumentLink" ADD COLUMN "isAmbiguous" BOOLEAN NOT NULL DEFAULT false
CREATE UNIQUE INDEX "Folder_workspaceId_parentFolderId_slug_key"
CREATE UNIQUE INDEX "Folder_workspaceId_path_key"
CREATE UNIQUE INDEX "Document_workspaceId_folderId_slug_key"
CREATE UNIQUE INDEX "Document_workspaceId_path_key"
```

If Prisma cannot create `Document_workspaceId_folderId_slug_key` with nullable `folderId` semantics that protect root duplicates in PostgreSQL, replace it with SQL partial unique indexes:

```sql
CREATE UNIQUE INDEX "Document_workspaceId_root_slug_key"
  ON "Document"("workspaceId", "slug")
  WHERE "folderId" IS NULL;
CREATE UNIQUE INDEX "Document_workspaceId_folderId_slug_key"
  ON "Document"("workspaceId", "folderId", "slug")
  WHERE "folderId" IS NOT NULL;
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add folder hierarchy schema"
```

## Task 2: Path Helpers

**Files:**
- Create: `lib/folders/path.ts`
- Test: `tests/folders/path.test.ts`

- [ ] **Step 1: Write failing path helper tests**

Create `tests/folders/path.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildChildPath,
  normalizeFolderPath,
  pathToWikiTarget,
} from "@/lib/folders/path";

describe("folder path helpers", () => {
  it("normalizes root and nested paths", () => {
    expect(normalizeFolderPath("")).toBe("/");
    expect(normalizeFolderPath("/Operations//Runbooks/")).toBe("/operations/runbooks");
  });

  it("builds child paths below root and folder paths", () => {
    expect(buildChildPath("/", "onboarding")).toBe("/onboarding");
    expect(buildChildPath("/operations", "onboarding")).toBe("/operations/onboarding");
  });

  it("converts document paths into wiki targets", () => {
    expect(pathToWikiTarget("/operations/onboarding")).toBe("Operations/Onboarding");
    expect(pathToWikiTarget("/")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/folders/path.test.ts
```

Expected: FAIL because `lib/folders/path.ts` does not exist.

- [ ] **Step 3: Implement path helpers**

Create `lib/folders/path.ts`:

```ts
export function normalizeFolderPath(path: string) {
  const segments = path
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

export function buildChildPath(parentPath: string | null | undefined, childSlug: string) {
  const parent = normalizeFolderPath(parentPath ?? "/");
  const slug = childSlug.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  return parent === "/" ? `/${slug}` : `${parent}/${slug}`;
}

export function pathToWikiTarget(path: string) {
  const normalized = normalizeFolderPath(path);
  if (normalized === "/") return "";
  return normalized
    .slice(1)
    .split("/")
    .map((segment) =>
      segment
        .split("-")
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" "),
    )
    .join("/");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run tests/folders/path.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/folders/path.ts tests/folders/path.test.ts
git commit -m "feat: add folder path helpers"
```

## Task 3: Folder Service

**Files:**
- Create: `lib/folders/types.ts`
- Create: `lib/folders/service.ts`
- Test: `tests/folders/service.test.ts`

- [ ] **Step 1: Write failing folder service tests**

Create `tests/folders/service.test.ts` with tests using the same seed helpers already used in `tests/documents/service.test.ts`. Add the test cases below, adapting setup imports to match that file:

```ts
import { describe, expect, it } from "vitest";
import {
  archiveFolder,
  createFolder,
  moveFolder,
  renameFolder,
} from "@/lib/folders/service";
import { createDocument } from "@/lib/documents/service";
import { prisma } from "@/lib/db/client";
import { WorkspaceRole } from "@prisma/client";
import { beforeEach } from "vitest";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("folder service", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("creates root and nested folders with paths", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const operations = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    const runbooks = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: operations.id,
      name: "Runbooks",
    });

    expect(operations.path).toBe("/operations");
    expect(runbooks.path).toBe("/operations/runbooks");
  });

  it("renames a folder and recalculates descendant document paths", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const operations = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    const doc = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      folderId: operations.id,
      title: "Onboarding",
      contentMarkdown: "",
    });

    await renameFolder({ folderId: operations.id, actorId: fixture.user.id, name: "People Ops" });

    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.path).toBe("/people-ops/onboarding");
  });

  it("rejects archiving non-empty folders", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const folder = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      folderId: folder.id,
      title: "Onboarding",
      contentMarkdown: "",
    });

    await expect(archiveFolder({ folderId: folder.id, actorId: fixture.user.id })).rejects.toThrow(
      "FOLDER_NOT_EMPTY",
    );
  });

  it("rejects moving a folder below its descendant", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const parent = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Parent",
    });
    const child = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: parent.id,
      name: "Child",
    });

    await expect(
      moveFolder({ folderId: parent.id, actorId: fixture.user.id, parentFolderId: child.id }),
    ).rejects.toThrow("FOLDER_MOVE_CYCLE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/folders/service.test.ts
```

Expected: FAIL because `lib/folders/service.ts` does not exist.

- [ ] **Step 3: Add folder service types**

Create `lib/folders/types.ts`:

```ts
export type CreateFolderInput = {
  workspaceSlug: string;
  actorId: string;
  parentFolderId: string | null;
  name: string;
};

export type RenameFolderInput = {
  folderId: string;
  actorId: string;
  name: string;
};

export type MoveFolderInput = {
  folderId: string;
  actorId: string;
  parentFolderId: string | null;
};

export type ArchiveFolderInput = {
  folderId: string;
  actorId: string;
};
```

- [ ] **Step 4: Implement folder service**

Create `lib/folders/service.ts`:

```ts
import { DocumentStatus, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { buildChildPath } from "@/lib/folders/path";
import type {
  ArchiveFolderInput,
  CreateFolderInput,
  MoveFolderInput,
  RenameFolderInput,
} from "@/lib/folders/types";
import { assertCanReadWorkspace, assertCanWriteWorkspace } from "@/lib/permissions/workspace";
import { slugifyTitle } from "@/lib/text/slug";

async function getWorkspaceForWrite(workspaceSlug: string, actorId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug },
    include: { organization: true, members: { where: { userId: actorId }, take: 1 } },
  });
  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
  const role = workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  assertCanWriteWorkspace(role);
  return { workspace, role };
}

async function getFolderForWrite(folderId: string, actorId: string) {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: {
      workspace: {
        include: { organization: true, members: { where: { userId: actorId }, take: 1 } },
      },
    },
  });
  if (!folder) throw new Error("FOLDER_NOT_FOUND");
  const role = folder.workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  assertCanWriteWorkspace(role);
  return { folder, workspace: folder.workspace };
}

async function nextAvailableFolderSlug(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  parentFolderId: string | null,
  name: string,
  excludeFolderId?: string,
) {
  const baseSlug = slugifyTitle(name);
  const siblings = await tx.folder.findMany({
    where: {
      workspaceId,
      parentFolderId,
      slug: { startsWith: baseSlug },
      ...(excludeFolderId ? { id: { not: excludeFolderId } } : {}),
    },
    select: { slug: true },
  });
  const existing = new Set(siblings.map((folder) => folder.slug));
  if (!existing.has(baseSlug)) return baseSlug;
  let suffix = 2;
  while (existing.has(`${baseSlug}-${suffix}`)) suffix += 1;
  return `${baseSlug}-${suffix}`;
}

async function folderPath(tx: Prisma.TransactionClient, folderId: string | null) {
  if (!folderId) return "/";
  const folder = await tx.folder.findUnique({ where: { id: folderId }, select: { path: true } });
  if (!folder) throw new Error("PARENT_FOLDER_NOT_FOUND");
  return folder.path;
}

async function updateDescendantPaths(tx: Prisma.TransactionClient, folderId: string) {
  const folder = await tx.folder.findUniqueOrThrow({
    where: { id: folderId },
    include: { childFolders: true, documents: true },
  });

  for (const document of folder.documents) {
    await tx.document.update({
      where: { id: document.id },
      data: { path: buildChildPath(folder.path, document.slug) },
    });
  }

  for (const child of folder.childFolders) {
    const childPath = buildChildPath(folder.path, child.slug);
    await tx.folder.update({ where: { id: child.id }, data: { path: childPath } });
    await updateDescendantPaths(tx, child.id);
  }
}

async function isDescendant(
  tx: Prisma.TransactionClient,
  folderId: string,
  possibleDescendantId: string,
) {
  let current = await tx.folder.findUnique({
    where: { id: possibleDescendantId },
    select: { parentFolderId: true },
  });
  while (current?.parentFolderId) {
    if (current.parentFolderId === folderId) return true;
    current = await tx.folder.findUnique({
      where: { id: current.parentFolderId },
      select: { parentFolderId: true },
    });
  }
  return false;
}

export async function createFolder(input: CreateFolderInput) {
  const { workspace } = await getWorkspaceForWrite(input.workspaceSlug, input.actorId);
  return prisma.$transaction(async (tx) => {
    const slug = await nextAvailableFolderSlug(tx, workspace.id, input.parentFolderId, input.name);
    const parentPath = await folderPath(tx, input.parentFolderId);
    const folder = await tx.folder.create({
      data: {
        workspaceId: workspace.id,
        parentFolderId: input.parentFolderId,
        name: input.name,
        slug,
        path: buildChildPath(parentPath, slug),
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });
    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "folder.created",
      resourceType: "folder",
      resourceId: folder.id,
      metadata: { name: folder.name, path: folder.path },
    });
    return folder;
  });
}

export async function renameFolder(input: RenameFolderInput) {
  const { folder, workspace } = await getFolderForWrite(input.folderId, input.actorId);
  return prisma.$transaction(async (tx) => {
    const slug = await nextAvailableFolderSlug(
      tx,
      folder.workspaceId,
      folder.parentFolderId,
      input.name,
      folder.id,
    );
    const parentPath = await folderPath(tx, folder.parentFolderId);
    const previousPath = folder.path;
    const updated = await tx.folder.update({
      where: { id: folder.id },
      data: {
        name: input.name,
        slug,
        path: buildChildPath(parentPath, slug),
        updatedById: input.actorId,
      },
    });
    await updateDescendantPaths(tx, updated.id);
    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "folder.renamed",
      resourceType: "folder",
      resourceId: updated.id,
      metadata: { previousPath, path: updated.path },
    });
    return updated;
  });
}

export async function moveFolder(input: MoveFolderInput) {
  const { folder, workspace } = await getFolderForWrite(input.folderId, input.actorId);
  return prisma.$transaction(async (tx) => {
    if (input.parentFolderId === folder.id) throw new Error("FOLDER_MOVE_CYCLE");
    if (input.parentFolderId && (await isDescendant(tx, folder.id, input.parentFolderId))) {
      throw new Error("FOLDER_MOVE_CYCLE");
    }
    const parentPath = await folderPath(tx, input.parentFolderId);
    const previousPath = folder.path;
    const updated = await tx.folder.update({
      where: { id: folder.id },
      data: {
        parentFolderId: input.parentFolderId,
        path: buildChildPath(parentPath, folder.slug),
        updatedById: input.actorId,
      },
    });
    await updateDescendantPaths(tx, updated.id);
    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "folder.moved",
      resourceType: "folder",
      resourceId: updated.id,
      metadata: { previousPath, path: updated.path },
    });
    return updated;
  });
}

export async function archiveFolder(input: ArchiveFolderInput) {
  const { folder, workspace } = await getFolderForWrite(input.folderId, input.actorId);
  const [childFolderCount, childDocumentCount] = await Promise.all([
    prisma.folder.count({ where: { parentFolderId: folder.id, status: "ACTIVE" } }),
    prisma.document.count({ where: { folderId: folder.id, status: "ACTIVE" } }),
  ]);
  if (childFolderCount > 0 || childDocumentCount > 0) throw new Error("FOLDER_NOT_EMPTY");
  return prisma.$transaction(async (tx) => {
    const archived = await tx.folder.update({
      where: { id: folder.id },
      data: { status: DocumentStatus.ARCHIVED, archivedAt: new Date(), updatedById: input.actorId },
    });
    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "folder.archived",
      resourceType: "folder",
      resourceId: archived.id,
      metadata: { path: archived.path },
    });
    return archived;
  });
}
```

- [ ] **Step 5: Run service tests**

Run:

```bash
pnpm exec vitest run tests/folders/service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/folders tests/folders
git commit -m "feat: add folder service"
```

## Task 4: Folder-Aware Document Service

**Files:**
- Modify: `lib/documents/types.ts`
- Modify: `lib/documents/service.ts`
- Test: `tests/documents/service.test.ts`

- [ ] **Step 1: Add failing document service tests**

Append to `tests/documents/service.test.ts`:

```ts
import { createFolder } from "@/lib/folders/service";

it("allows duplicate document titles in different folders", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const operations = await createFolder({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    parentFolderId: null,
    name: "Operations",
  });
  const engineering = await createFolder({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    parentFolderId: null,
    name: "Engineering",
  });

  const first = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    folderId: operations.id,
    title: "Onboarding",
    contentMarkdown: "",
  });
  const second = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    folderId: engineering.id,
    title: "Onboarding",
    contentMarkdown: "",
  });

  expect(first.path).toBe("/operations/onboarding");
  expect(second.path).toBe("/engineering/onboarding");
});

it("moves a document into a folder and recalculates path", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const folder = await createFolder({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    parentFolderId: null,
    name: "Operations",
  });
  const document = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title: "Runbook",
    contentMarkdown: "",
  });

  const moved = await moveDocument({
    documentId: document.id,
    actorId: fixture.user.id,
    folderId: folder.id,
  });

  expect(moved.path).toBe("/operations/runbook");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/documents/service.test.ts
```

Expected: FAIL because `CreateDocumentInput.folderId` and `moveDocument()` are missing.

- [ ] **Step 3: Update document types**

Modify `lib/documents/types.ts`:

```ts
export type CreateDocumentInput = {
  workspaceSlug: string;
  actorId: string;
  folderId?: string | null;
  title: string;
  contentMarkdown: string;
};

export type MoveDocumentInput = {
  documentId: string;
  actorId: string;
  folderId: string | null;
};
```

- [ ] **Step 4: Implement folder-aware slug/path in document service**

In `lib/documents/service.ts`, change `nextAvailableDocumentSlug()` to include `folderId`:

```ts
async function nextAvailableDocumentSlug(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  folderId: string | null,
  title: string,
  excludeDocumentId?: string,
) {
  const baseSlug = slugifyTitle(title);
  const existingDocuments = await tx.document.findMany({
    where: {
      workspaceId,
      folderId,
      slug: { startsWith: baseSlug },
      ...(excludeDocumentId ? { id: { not: excludeDocumentId } } : {}),
    },
    select: { slug: true },
  });
  const existingSlugs = new Set(existingDocuments.map((document) => document.slug));
  if (!existingSlugs.has(baseSlug)) return baseSlug;
  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) suffix += 1;
  return `${baseSlug}-${suffix}`;
}
```

Add a folder path helper inside the service:

```ts
async function getParentFolderPath(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  folderId: string | null | undefined,
) {
  if (!folderId) return "/";
  const folder = await tx.folder.findFirst({
    where: { id: folderId, workspaceId, status: "ACTIVE" },
    select: { path: true },
  });
  if (!folder) throw new Error("FOLDER_NOT_FOUND");
  return folder.path;
}
```

Update `createDocumentWithInitialVersion()`:

```ts
async function createDocumentWithInitialVersion(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    actorId: string;
    folderId?: string | null;
    title: string;
    contentMarkdown: string;
    changeSummary: string;
  },
) {
  const folderId = input.folderId ?? null;
  const slug = await nextAvailableDocumentSlug(tx, input.workspaceId, folderId, input.title);
  const parentPath = await getParentFolderPath(tx, input.workspaceId, folderId);
  const contentText = markdownToPlainText(input.contentMarkdown);

  const document = await tx.document.create({
    data: {
      workspaceId: input.workspaceId,
      folderId,
      title: input.title,
      slug,
      path: buildChildPath(parentPath, slug),
      contentMarkdown: input.contentMarkdown,
      contentText,
      createdById: input.actorId,
      updatedById: input.actorId,
    },
  });
  // Keep existing DocumentVersion creation unchanged.
  return document;
}
```

Update `createDocument()`, `updateDocument()`, `restoreDocumentVersion()`, and `createDocumentFromBrokenLink()` call sites to pass `folderId` and include `folderId` in slug/path calculations.

- [ ] **Step 5: Add moveDocument implementation**

Export from `lib/documents/service.ts`:

```ts
export async function moveDocument(input: MoveDocumentInput) {
  const { document, workspace, role, access } = await getDocumentMembership(
    input.documentId,
    input.actorId,
  );
  assertCanWriteWorkspace(role);
  assertCanWriteDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  return runWithDocumentSlugRetry(() =>
    prisma.$transaction(async (tx) => {
      const slug = await nextAvailableDocumentSlug(
        tx,
        workspace.id,
        input.folderId,
        document.title,
        document.id,
      );
      const parentPath = await getParentFolderPath(tx, workspace.id, input.folderId);
      const previousPath = document.path;
      const moved = await tx.document.update({
        where: { id: document.id },
        data: {
          folderId: input.folderId,
          slug,
          path: buildChildPath(parentPath, slug),
          updatedById: input.actorId,
        },
      });
      await writeAuditLog(tx, {
        organizationId: workspace.organizationId,
        actorId: input.actorId,
        action: "document.moved",
        resourceType: "document",
        resourceId: moved.id,
        metadata: { title: moved.title, previousPath, path: moved.path },
      });
      return moved;
    }),
  );
}
```

- [ ] **Step 6: Run document tests**

Run:

```bash
pnpm exec vitest run tests/documents/service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/documents tests/documents
git commit -m "feat: make documents folder-aware"
```

## Task 5: Path-Aware Wiki Links

**Files:**
- Modify: `lib/wiki-links/parser.ts`
- Modify: `lib/wiki-links/reconcile.ts`
- Modify: `lib/wiki-links/preview.ts`
- Modify: `lib/wiki-links/types.ts`
- Modify: `lib/wiki-links/service.ts`
- Test: `tests/wiki-links/reconcile.test.ts`
- Test: `tests/wiki-links/preview.test.ts`

- [ ] **Step 1: Add failing reconciliation tests**

Add to `tests/wiki-links/reconcile.test.ts`:

```ts
it("resolves path-qualified links when duplicate titles exist", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const operations = await createFolder({ workspaceSlug: fixture.workspace.slug, actorId: fixture.user.id, parentFolderId: null, name: "Operations" });
  const engineering = await createFolder({ workspaceSlug: fixture.workspace.slug, actorId: fixture.user.id, parentFolderId: null, name: "Engineering" });
  const target = await createDocument({ workspaceSlug: fixture.workspace.slug, actorId: fixture.user.id, folderId: operations.id, title: "Onboarding", contentMarkdown: "" });
  await createDocument({ workspaceSlug: fixture.workspace.slug, actorId: fixture.user.id, folderId: engineering.id, title: "Onboarding", contentMarkdown: "" });

  const source = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title: "Source",
    contentMarkdown: "---\nlinks:\n  - \"[[Operations/Onboarding]]\"\n---\n",
  });

  const link = await prisma.documentLink.findFirstOrThrow({ where: { sourceDocumentId: source.id } });
  expect(link.targetDocumentId).toBe(target.id);
  expect(link.isBroken).toBe(false);
  expect(link.isAmbiguous).toBe(false);
});

it("marks title-only duplicate links as ambiguous", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const operations = await createFolder({ workspaceSlug: fixture.workspace.slug, actorId: fixture.user.id, parentFolderId: null, name: "Operations" });
  const engineering = await createFolder({ workspaceSlug: fixture.workspace.slug, actorId: fixture.user.id, parentFolderId: null, name: "Engineering" });
  await createDocument({ workspaceSlug: fixture.workspace.slug, actorId: fixture.user.id, folderId: operations.id, title: "Onboarding", contentMarkdown: "" });
  await createDocument({ workspaceSlug: fixture.workspace.slug, actorId: fixture.user.id, folderId: engineering.id, title: "Onboarding", contentMarkdown: "" });

  const source = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title: "Source",
    contentMarkdown: "---\nlinks:\n  - \"[[Onboarding]]\"\n---\n",
  });

  const link = await prisma.documentLink.findFirstOrThrow({ where: { sourceDocumentId: source.id } });
  expect(link.targetDocumentId).toBeNull();
  expect(link.isBroken).toBe(false);
  expect(link.isAmbiguous).toBe(true);
});
```

- [ ] **Step 2: Add failing preview test**

Add to `tests/wiki-links/preview.test.ts`:

```ts
it("renders path-qualified links and leaves ambiguous title-only links as text", () => {
  const candidates = buildWikiLinkPreviewCandidateMap([
    { id: "ops", slug: "onboarding", title: "Onboarding", path: "/operations/onboarding" },
    { id: "eng", slug: "onboarding", title: "Onboarding", path: "/engineering/onboarding" },
  ]);

  expect(renderPreviewMarkdownWithWikiLinks("[[Operations/Onboarding]]", candidates)).toBe(
    "[Operations/Onboarding](?document=ops)",
  );
  expect(renderPreviewMarkdownWithWikiLinks("[[Onboarding]]", candidates)).toBe("Onboarding");
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
pnpm exec vitest run tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts
```

Expected: FAIL because `isAmbiguous` and path candidate support are missing.

- [ ] **Step 4: Update preview candidates**

Modify `lib/wiki-links/preview.ts` candidate type and map:

```ts
export type WikiLinkPreviewCandidate = {
  id: string;
  slug: string;
  title: string;
  path: string;
};
```

In `buildWikiLinkPreviewCandidateMap()`, map both path and title slug:

```ts
candidateBySlug.set(candidate.path.replace(/^\//, ""), candidate);
candidateBySlug.set(candidate.slug, candidate);
```

Keep existing duplicate title behavior by setting title slug to `null` when duplicates exist.

- [ ] **Step 5: Update reconciliation resolution**

In `lib/wiki-links/reconcile.ts`, add:

```ts
function normalizeTargetPath(raw: string) {
  return `/${raw.trim().toLowerCase().replace(/^\/+|\/+$/g, "")}`;
}

function isPathQualifiedTarget(raw: string) {
  return raw.includes("/");
}
```

Resolve parsed links:

```ts
const activeDocuments = await tx.document.findMany({
  where: { workspaceId: input.workspaceId, status: "ACTIVE" },
  select: { id: true, title: true, slug: true, path: true },
});

function resolveTarget(targetTitleRaw: string) {
  if (isPathQualifiedTarget(targetTitleRaw)) {
    const target = activeDocuments.find(
      (document) => document.path === normalizeTargetPath(targetTitleRaw),
    );
    return { targetDocumentId: target?.id ?? null, isBroken: !target, isAmbiguous: false };
  }

  const targetSlug = slugifyTitle(targetTitleRaw);
  const matches = activeDocuments.filter((document) => slugifyTitle(document.title) === targetSlug);
  if (matches.length === 1) {
    return { targetDocumentId: matches[0].id, isBroken: false, isAmbiguous: false };
  }
  if (matches.length > 1) {
    return { targetDocumentId: null, isBroken: false, isAmbiguous: true };
  }
  return { targetDocumentId: null, isBroken: true, isAmbiguous: false };
}
```

Use the returned `isAmbiguous` in `createMany()`.

- [ ] **Step 6: Update link panel types**

Modify `lib/wiki-links/types.ts` to include ambiguous links:

```ts
export type DocumentLinkPanels = {
  outgoing: Array<{
    id: string;
    targetTitleRaw: string;
    alias: string | null;
    isBroken: boolean;
    isAmbiguous: boolean;
    targetDocument: { id: string; title: string; slug: string; path: string } | null;
  }>;
  backlinks: Array<{ id: string; sourceDocument: { id: string; title: string; slug: string; path: string } }>;
  brokenLinks: Array<{ id: string; targetTitleRaw: string; alias: string | null }>;
  ambiguousLinks: Array<{ id: string; targetTitleRaw: string; alias: string | null }>;
};
```

Update `lib/wiki-links/service.ts` to select `path`, return `isAmbiguous`, and populate `ambiguousLinks` with `link.isAmbiguous`.

- [ ] **Step 7: Run link tests**

Run:

```bash
pnpm exec vitest run tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/wiki-links tests/wiki-links
git commit -m "feat: resolve wiki links by folder path"
```

## Task 6: Workspace Tree Query And UI

**Files:**
- Create: `lib/workspace-tree.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `app/workspaces/[workspaceSlug]/actions.ts`
- Modify: `components/document-list.tsx`
- Modify: `components/document-navigation.tsx`
- Create: `components/folder-detail.tsx`
- Test: `tests/e2e/login.spec.ts`

- [x] **Step 1: Create tree query helper**

Create `lib/workspace-tree.ts`:

```ts
import type { Document, Folder, PermissionLevel, WorkspaceRole } from "@prisma/client";
import { canReadDocument, highestPermissionLevel } from "@/lib/permissions/document";

export type WorkspaceTreeDocument = Pick<Document, "id" | "folderId" | "title" | "path" | "contentText" | "updatedAt">;
export type WorkspaceTreeFolder = Pick<Folder, "id" | "parentFolderId" | "name" | "path" | "updatedAt">;

export function filterReadableDocuments(input: {
  documents: WorkspaceTreeDocument[];
  role: WorkspaceRole;
  explicitDocumentIds: Set<string>;
  userPermissionsByDocumentId: Map<string, PermissionLevel | null>;
}) {
  return input.documents.filter((document) =>
    canReadDocument({
      workspaceRole: input.role,
      explicitPermissionCount: input.explicitDocumentIds.has(document.id) ? 1 : 0,
      userPermission: input.userPermissionsByDocumentId.get(document.id),
    }),
  );
}

export function documentDisplayLabel(document: Pick<Document, "title" | "path">) {
  return document.path === `/${document.title.toLowerCase()}` ? document.title : `${document.title} · ${document.path}`;
}
```

- [x] **Step 2: Update actions**

In `app/workspaces/[workspaceSlug]/actions.ts`, import folder service and split creation:

```ts
import { createFolder, archiveFolder } from "@/lib/folders/service";

export async function createFolderAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const parentFolderId = String(formData.get("parentFolderId") || "") || null;
  const folder = await createFolder({
    workspaceSlug,
    actorId: user.id,
    parentFolderId,
    name: "Untitled folder",
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  redirect(`/workspaces/${workspaceSlug}?folder=${folder.id}`);
}
```

Modify `createDocumentAction()`:

```ts
const document = await createDocument({
  workspaceSlug,
  actorId: user.id,
  folderId: String(formData.get("folderId") || "") || null,
  title: template.title,
  contentMarkdown: template.contentMarkdown,
});
```

- [x] **Step 3: Update workspace page params and query**

In `app/workspaces/[workspaceSlug]/page.tsx`, add `folder?: string` to `searchParams`, include active folders, and pass document paths to candidates:

```ts
searchParams: Promise<{ document?: string; folder?: string; q?: string }>;
```

Include folders:

```ts
folders: {
  where: { status: "ACTIVE" },
  orderBy: [{ path: "asc" }],
},
documents: {
  where: { status: "ACTIVE" },
  orderBy: [{ path: "asc" }],
},
```

When passing `linkCandidates`:

```ts
linkCandidates={readableDocuments.map((document) => ({
  id: document.id,
  slug: document.slug,
  title: document.title,
  path: document.path,
}))}
```

- [x] **Step 4: Add folder detail component**

Create `components/folder-detail.tsx`:

```tsx
export function FolderDetail({
  folder,
  canWrite,
}: {
  folder: { id: string; name: string; path: string; childCount: number } | null;
  canWrite: boolean;
}) {
  if (!folder) {
    return (
      <section className="flex h-full items-center justify-center text-sm text-slate-500">
        Select a document or folder.
      </section>
    );
  }

  return (
    <section className="p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Folder</p>
      <h2 className="mt-2 text-2xl font-semibold">{folder.name}</h2>
      <p className="mt-1 font-mono text-sm text-slate-500">{folder.path}</p>
      <p className="mt-4 text-sm text-slate-600">
        {folder.childCount === 0
          ? "This folder is empty."
          : `${folder.childCount} item${folder.childCount === 1 ? "" : "s"} in this folder.`}
      </p>
      {!canWrite ? <p className="mt-4 text-sm text-slate-500">You have read-only access.</p> : null}
    </section>
  );
}
```

- [x] **Step 5: Update navigation rows**

Change `DocumentListItem` to include `path` and add folder rows:

```ts
export type DocumentListItem = {
  id: string;
  folderId: string | null;
  title: string;
  path: string;
  contentText: string;
};

export type FolderListItem = {
  id: string;
  parentFolderId: string | null;
  name: string;
  path: string;
};
```

Render folder links with:

```tsx
<Link href={`/workspaces/${workspaceSlug}?folder=${folder.id}`} className="block rounded-md px-2 py-2 text-sm hover:bg-muted">
  <span className="block truncate">{folder.name}</span>
  <span className="mt-1 block truncate font-mono text-xs text-slate-500">{folder.path}</span>
</Link>
```

Render document links with path labels when duplicate titles exist.

- [x] **Step 6: Update e2e smoke**

In `tests/e2e/login.spec.ts`, replace the old folder-like assertion:

```ts
await page.getByRole("button", { name: "New folder" }).click();
await expect(page.getByText("Untitled folder")).toBeVisible();
await page.getByRole("button", { name: "New document" }).click();
await expect(page.locator("[name='title']")).toHaveValue("Untitled");
await expect(page.getByText("/untitled-folder/untitled")).toBeVisible();
```

- [x] **Step 7: Run e2e or focused UI checks**

Run:

```bash
pnpm run test:e2e
```

Expected: PASS. If local browser dependencies are missing, run the closest available unit tests and record the e2e blocker in the final implementation notes.

Implementation note: Task 6 was verified with `pnpm exec vitest run tests/workspace-tree.test.ts tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts tests/documents/service.test.ts tests/folders/service.test.ts` and `pnpm exec tsc --noEmit`. Full Playwright e2e remains part of Task 8 final verification.

- [ ] **Step 8: Commit**

```bash
git add app components lib/workspace-tree.ts tests/e2e/login.spec.ts
git commit -m "feat: render workspace folder tree"
```

## Task 7: Autocomplete And Editor Integration

**Files:**
- Modify: `lib/wiki-links/autocomplete.ts`
- Modify: `components/document-editor.tsx`
- Test: `tests/wiki-links/autocomplete.test.ts`

- [ ] **Step 1: Add failing autocomplete tests**

Create or update `tests/wiki-links/autocomplete.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getWikiLinkCompletionOptions } from "@/lib/wiki-links/autocomplete";

describe("wiki link autocomplete options", () => {
  it("uses path-qualified insert text for duplicate titles", () => {
    const options = getWikiLinkCompletionOptions("onb", [
      { id: "ops", title: "Onboarding", path: "/operations/onboarding" },
      { id: "eng", title: "Onboarding", path: "/engineering/onboarding" },
    ]);

    expect(options).toEqual([
      { id: "ops", label: "Operations/Onboarding", insertText: "[[Operations/Onboarding]]" },
      { id: "eng", label: "Engineering/Onboarding", insertText: "[[Engineering/Onboarding]]" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/wiki-links/autocomplete.test.ts
```

Expected: FAIL because `getWikiLinkCompletionOptions()` does not exist.

- [ ] **Step 3: Implement completion options**

In `lib/wiki-links/autocomplete.ts`, add:

```ts
import { pathToWikiTarget } from "@/lib/folders/path";

export type WikiLinkCompletionCandidate = {
  id: string;
  title: string;
  path: string;
};

export function getWikiLinkCompletionOptions(
  query: string,
  candidates: WikiLinkCompletionCandidate[],
) {
  const normalizedQuery = query.toLowerCase().trim();
  const titleCounts = new Map<string, number>();
  for (const candidate of candidates) {
    titleCounts.set(candidate.title.toLowerCase(), (titleCounts.get(candidate.title.toLowerCase()) ?? 0) + 1);
  }

  return candidates
    .filter((candidate) => {
      const target = pathToWikiTarget(candidate.path).toLowerCase();
      return candidate.title.toLowerCase().includes(normalizedQuery) || target.includes(normalizedQuery);
    })
    .slice(0, 6)
    .map((candidate) => {
      const duplicateTitle = (titleCounts.get(candidate.title.toLowerCase()) ?? 0) > 1;
      const target = duplicateTitle ? pathToWikiTarget(candidate.path) : candidate.title;
      return {
        id: candidate.id,
        label: duplicateTitle ? target : candidate.title,
        insertText: `[[${target}]]`,
      };
    });
}
```

- [ ] **Step 4: Wire editor to insertText**

In `components/document-editor.tsx`, replace manual `[[${candidate.title}]]` insertion with:

```ts
const completionOptions = getWikiLinkCompletionOptions(activeCompletion.query, linkCandidates);
```

Use `option.insertText` when applying a completion:

```ts
const nextMarkdown =
  contentMarkdown.slice(0, activeCompletion.from) +
  option.insertText +
  contentMarkdown.slice(activeCompletion.to);
```

- [ ] **Step 5: Run autocomplete and preview tests**

Run:

```bash
pnpm exec vitest run tests/wiki-links/autocomplete.test.ts tests/wiki-links/preview.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/wiki-links/autocomplete.ts components/document-editor.tsx tests/wiki-links/autocomplete.test.ts
git commit -m "feat: insert path-qualified wiki completions"
```

## Task 8: Seed, Wiki Maintenance, And Final Verification

**Files:**
- Modify: `prisma/seed.ts`
- Modify: relevant wiki pages listed in the spec.
- Modify: `wiki/manifest.json`
- Test: broad verification commands.

- [ ] **Step 1: Update seed data**

In `prisma/seed.ts`, create one folder and place at least one document under it:

```ts
const operationsFolder = await prisma.folder.upsert({
  where: { workspaceId_path: { workspaceId: workspace.id, path: "/operations" } },
  update: {},
  create: {
    workspaceId: workspace.id,
    name: "Operations",
    slug: "operations",
    path: "/operations",
    createdById: owner.id,
    updatedById: owner.id,
  },
});

await prisma.document.upsert({
  where: { workspaceId_path: { workspaceId: workspace.id, path: "/operations/onboarding" } },
  update: {},
  create: {
    workspaceId: workspace.id,
    folderId: operationsFolder.id,
    title: "Onboarding",
    slug: "onboarding",
    path: "/operations/onboarding",
    contentMarkdown: "# Onboarding\n",
    contentText: "Onboarding",
    createdById: owner.id,
    updatedById: owner.id,
  },
});
```

- [ ] **Step 2: Update wiki pages**

Update:

```text
wiki/Folder Hierarchy Model.md
wiki/Document Knowledge Model.md
wiki/Document Editing Workflow.md
wiki/Wiki Links And Backlinks.md
wiki/Auth And Permissions Workflow.md
wiki/Munjib.md
wiki/Project PRD.md
wiki/index.md
wiki/log.md
```

Use current-tense implementation language for completed code. Record source evidence from changed files and tests in `wiki/log.md`.

- [ ] **Step 3: Regenerate manifest and lint wiki**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: both PASS.

- [ ] **Step 4: Run focused test suite**

Run:

```bash
pnpm exec vitest run tests/folders/path.test.ts tests/folders/service.test.ts tests/documents/service.test.ts tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts tests/wiki-links/autocomplete.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
pnpm test
pnpm run build
pnpm run test:e2e
```

Expected: PASS. If e2e requires local services, ensure Docker/Postgres and seed data are running before retrying.

- [ ] **Step 6: Commit final integration**

```bash
git add prisma/seed.ts wiki docs tests app components lib prisma
git commit -m "feat: complete folder hierarchy integration"
```

- [ ] **Step 7: Push branch**

```bash
git push
```

Expected: `origin/issue-20-real-folder-hierarchy` receives all commits.

## Self-Review

Spec coverage:

- Separate `Folder` model: Task 1 and Task 3.
- `Document.folderId` and path identity: Task 1 and Task 4.
- Duplicate titles across folders: Task 4 tests.
- Folder create, rename, move, archive guard: Task 3.
- Path-qualified wikilinks and ambiguous title-only fallback: Task 5.
- Autocomplete path labels: Task 7.
- Workspace-write folder permissions and no inherited ACL: Task 3 service uses workspace write only.
- Vault tree UI and folder detail state: Task 6.
- Migration without converting folder-like documents: Task 1 migration adds schema and leaves existing documents at root.
- Wiki updates and verification: Task 8.

Placeholder scan:

- The plan contains no unresolved implementation placeholders. Each code-changing task includes exact files, code skeletons, commands, and expected outcomes.

Type consistency:

- `folderId` is consistently `string | null`.
- `Folder.parentFolderId` is consistently `string | null`.
- `path` is consistently a leading-slash normalized workspace path.
- Ambiguous wiki links use `DocumentLink.isAmbiguous`.
