# Cascade Folder Trash Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users move a folder and all active descendant folders/documents to trash after an explicit confirmation, while preserving the default non-empty-folder guard.

**Architecture:** The folder service remains the source of truth for archive safety. The sidebar computes descendant counts only for confirmation copy and route cleanup, then submits an explicit `cascade=true` flag that the server action passes to `archiveFolder()`. Recursive archive is a soft-delete transaction over active descendants; supporting records are not physically deleted.

**Tech Stack:** Next.js App Router server actions, React client components, Prisma/PostgreSQL, Vitest, React Testing Library, Playwright, project wiki automation.

---

## File Structure

- `lib/folders/types.ts`: extend `ArchiveFolderInput` with `cascade?: boolean`.
- `lib/folders/service.ts`: add active descendant lookup and cascade archive logic inside `archiveFolder()`.
- `app/workspaces/[workspaceSlug]/actions.ts`: read `FormData` cascade opt-in and pass it to the service.
- `components/document-navigation/folder-trash.ts`: create a focused helper for folder subtree counts and selected-target detection.
- `components/document-navigation/folder-row.tsx`: render cascade hidden input and destructive confirmation copy based on row trash summary.
- `components/document-navigation.tsx`: compute row trash summary and navigate to root when the archived subtree contains the current selection.
- `tests/folders/service.test.ts`: cover recursive archive, default guard preservation, unrelated workspace isolation, and already archived row preservation.
- `tests/workspace-actions.test.ts`: cover server action cascade pass-through and non-cascade guard result.
- `tests/components/document-list.test.tsx`: cover confirm copy, cascade form data, cancel behavior, and route cleanup.
- `tests/e2e/login.spec.ts`: replace the old non-empty-folder rejection expectation with confirm-driven recursive trash.
- `wiki/Folder Hierarchy Model.md`, `wiki/Project PRD.md`, `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`: update durable wiki knowledge after implementation.

---

### Task 1: Folder Service Recursive Archive

**Files:**
- Modify: `tests/folders/service.test.ts`
- Modify: `lib/folders/types.ts`
- Modify: `lib/folders/service.ts`

- [ ] **Step 1: Write the failing service tests**

Add these tests immediately after the existing `rejects archiving non-empty folders` test in `tests/folders/service.test.ts`:

```ts
  it("archives a non-empty folder subtree when cascade is explicit", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const otherFixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const parent = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });
    const child = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: parent.id,
      name: "Runbooks",
    });
    const grandchild = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: child.id,
      name: "Incidents",
    });
    const parentDocument = await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        folderId: parent.id,
        title: "Overview",
        slug: "overview",
        path: "/operations/overview",
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    const grandchildDocument = await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        folderId: grandchild.id,
        title: "Incident Review",
        slug: "incident-review",
        path: "/operations/runbooks/incidents/incident-review",
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    const archivedAt = new Date("2026-01-01T00:00:00.000Z");
    const alreadyArchivedChild = await prisma.folder.create({
      data: {
        workspaceId: fixture.workspace.id,
        parentFolderId: parent.id,
        name: "Archive Shelf",
        slug: "archive-shelf",
        path: "/operations/archive-shelf",
        status: "ARCHIVED",
        archivedAt,
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    const alreadyArchivedDocument = await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        folderId: parent.id,
        title: "Old Runbook",
        slug: "old-runbook",
        path: "/operations/old-runbook",
        status: "ARCHIVED",
        archivedAt,
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    const otherWorkspaceFolder = await createFolder({
      workspaceSlug: otherFixture.workspace.slug,
      actorId: otherFixture.user.id,
      parentFolderId: null,
      name: "Operations",
    });

    const archived = await archiveFolder({
      folderId: parent.id,
      actorId: fixture.user.id,
      cascade: true,
    });

    expect(archived.status).toBe("ARCHIVED");
    const archivedFolders = await prisma.folder.findMany({
      where: { id: { in: [parent.id, child.id, grandchild.id] } },
      select: { id: true, status: true, archivedAt: true, updatedById: true },
    });
    expect(archivedFolders).toHaveLength(3);
    expect(archivedFolders.every((folder) => folder.status === "ARCHIVED")).toBe(true);
    expect(archivedFolders.every((folder) => folder.archivedAt instanceof Date)).toBe(true);
    expect(archivedFolders.every((folder) => folder.updatedById === fixture.user.id)).toBe(true);

    const archivedDocuments = await prisma.document.findMany({
      where: { id: { in: [parentDocument.id, grandchildDocument.id] } },
      select: { id: true, status: true, archivedAt: true, updatedById: true },
    });
    expect(archivedDocuments).toHaveLength(2);
    expect(archivedDocuments.every((document) => document.status === "ARCHIVED")).toBe(true);
    expect(archivedDocuments.every((document) => document.archivedAt instanceof Date)).toBe(true);
    expect(archivedDocuments.every((document) => document.updatedById === fixture.user.id)).toBe(
      true,
    );

    await expect(
      prisma.folder.findUniqueOrThrow({ where: { id: otherWorkspaceFolder.id } }),
    ).resolves.toMatchObject({ status: "ACTIVE" });
    await expect(
      prisma.folder.findUniqueOrThrow({ where: { id: alreadyArchivedChild.id } }),
    ).resolves.toMatchObject({ status: "ARCHIVED", archivedAt });
    await expect(
      prisma.document.findUniqueOrThrow({ where: { id: alreadyArchivedDocument.id } }),
    ).resolves.toMatchObject({ status: "ARCHIVED", archivedAt });

    const auditLog = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "folder.archived",
        resourceId: parent.id,
      },
    });
    expect(auditLog.metadata).toMatchObject({
      path: "/operations",
      descendantFolderCount: 2,
      descendantDocumentCount: 2,
    });
  });

  it("still archives empty folders without cascade", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const folder = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Empty",
    });

    const archived = await archiveFolder({ folderId: folder.id, actorId: fixture.user.id });

    expect(archived.status).toBe("ARCHIVED");
    expect(archived.archivedAt).toBeInstanceOf(Date);
  });
```

- [ ] **Step 2: Run the service tests and verify the expected failure**

Run:

```bash
pnpm exec vitest run tests/folders/service.test.ts
```

Expected: the new cascade test fails because `ArchiveFolderInput` does not accept `cascade`, or because `archiveFolder()` still throws `FOLDER_NOT_EMPTY`.

- [ ] **Step 3: Extend the folder archive input type**

Replace `ArchiveFolderInput` in `lib/folders/types.ts` with:

```ts
export type ArchiveFolderInput = {
  folderId: string;
  actorId: string;
  cascade?: boolean;
};
```

- [ ] **Step 4: Add active descendant lookup and cascade archive implementation**

In `lib/folders/service.ts`, add this helper after `isDescendant()`:

```ts
async function getActiveDescendantFolderIds(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  folderId: string,
) {
  const descendantFolderIds: string[] = [];
  let parentFolderIds = [folderId];

  while (parentFolderIds.length > 0) {
    const childFolders = await tx.folder.findMany({
      where: {
        workspaceId,
        parentFolderId: { in: parentFolderIds },
        status: DocumentStatus.ACTIVE,
      },
      select: { id: true },
    });
    const childFolderIds = childFolders.map((childFolder) => childFolder.id);

    descendantFolderIds.push(...childFolderIds);
    parentFolderIds = childFolderIds;
  }

  return descendantFolderIds;
}
```

Replace the full `archiveFolder()` function in `lib/folders/service.ts` with:

```ts
export async function archiveFolder(input: ArchiveFolderInput) {
  const { folder, workspace } = await getFolderForWrite(input.folderId, input.actorId);

  if (!input.cascade) {
    const [childFolderCount, childDocumentCount] = await Promise.all([
      prisma.folder.count({
        where: { parentFolderId: folder.id, status: DocumentStatus.ACTIVE },
      }),
      prisma.document.count({
        where: { folderId: folder.id, status: DocumentStatus.ACTIVE },
      }),
    ]);

    if (childFolderCount > 0 || childDocumentCount > 0) {
      throw new Error(SERVICE_ERROR_CODES.FOLDER_NOT_EMPTY);
    }
  }

  return prisma.$transaction(async (tx) => {
    const descendantFolderIds = input.cascade
      ? await getActiveDescendantFolderIds(tx, folder.workspaceId, folder.id)
      : [];
    const archivedFolderIds = [folder.id, ...descendantFolderIds];
    const descendantDocuments = await tx.document.findMany({
      where: {
        workspaceId: folder.workspaceId,
        folderId: { in: archivedFolderIds },
        status: DocumentStatus.ACTIVE,
      },
      select: { id: true },
    });
    const descendantDocumentIds = descendantDocuments.map((document) => document.id);
    const archivedAt = new Date();

    if (descendantDocumentIds.length > 0) {
      await tx.document.updateMany({
        where: {
          id: { in: descendantDocumentIds },
          status: DocumentStatus.ACTIVE,
        },
        data: {
          status: DocumentStatus.ARCHIVED,
          archivedAt,
          updatedById: input.actorId,
        },
      });
    }

    if (descendantFolderIds.length > 0) {
      await tx.folder.updateMany({
        where: {
          id: { in: descendantFolderIds },
          status: DocumentStatus.ACTIVE,
        },
        data: {
          status: DocumentStatus.ARCHIVED,
          archivedAt,
          updatedById: input.actorId,
        },
      });
    }

    const archived = await tx.folder.update({
      where: { id: folder.id },
      data: {
        status: DocumentStatus.ARCHIVED,
        archivedAt,
        updatedById: input.actorId,
      },
    });

    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "folder.archived",
      resourceType: "folder",
      resourceId: archived.id,
      metadata: {
        path: archived.path,
        descendantFolderCount: descendantFolderIds.length,
        descendantDocumentCount: descendantDocumentIds.length,
      },
    });

    return archived;
  });
}
```

- [ ] **Step 5: Run the service tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/folders/service.test.ts
```

Expected: PASS for all folder service tests.

- [ ] **Step 6: Commit the service slice**

Run:

```bash
git add lib/folders/types.ts lib/folders/service.ts tests/folders/service.test.ts
git commit -m "feat: support cascade folder archive"
```

Expected: commit succeeds. The pre-commit wiki sync check may fail because source changed without wiki maintenance; if it fails, keep the changes staged and defer the commit until Task 5 wiki maintenance is staged.

---

### Task 2: Server Action Cascade Contract

**Files:**
- Modify: `tests/workspace-actions.test.ts`
- Modify: `app/workspaces/[workspaceSlug]/actions.ts`

- [ ] **Step 1: Write failing server action tests**

Add this import at the top of `tests/workspace-actions.test.ts`, below the Vitest import:

```ts
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
```

Add these tests after `createFolderAction returns a folder id instead of redirecting when redirect is false`:

```ts
  test("archiveFolderAction passes cascade when the form opts in", async () => {
    const { archiveFolderAction } = await import("@/app/workspaces/[workspaceSlug]/actions");
    const formData = new FormData();
    formData.set("folderId", "folder-engineering");
    formData.set("cascade", "true");

    const result = await archiveFolderAction("company-handbook", formData);

    expect(mocks.archiveFolder).toHaveBeenCalledWith({
      actorId: "user-1",
      folderId: "folder-engineering",
      cascade: true,
    });
    expect(result).toEqual({ folderId: "folder-engineering" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
  });

  test("archiveFolderAction keeps non-cascade folder-not-empty as an action result", async () => {
    mocks.archiveFolder.mockRejectedValue(new Error(SERVICE_ERROR_CODES.FOLDER_NOT_EMPTY));
    const { archiveFolderAction } = await import("@/app/workspaces/[workspaceSlug]/actions");
    const formData = new FormData();
    formData.set("folderId", "folder-engineering");

    const result = await archiveFolderAction("company-handbook", formData);

    expect(mocks.archiveFolder).toHaveBeenCalledWith({
      actorId: "user-1",
      folderId: "folder-engineering",
      cascade: false,
    });
    expect(result).toEqual({
      folderId: "folder-engineering",
      error: SERVICE_ERROR_CODES.FOLDER_NOT_EMPTY,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the action tests and verify the expected failure**

Run:

```bash
pnpm exec vitest run tests/workspace-actions.test.ts
```

Expected: the first new test fails because `archiveFolderAction()` does not pass `cascade`.

- [ ] **Step 3: Pass the cascade flag through the server action**

Replace `archiveFolderAction()` in `app/workspaces/[workspaceSlug]/actions.ts` with:

```ts
export async function archiveFolderAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const folderId = String(formData.get("folderId"));
  const cascade = formData.get("cascade") === "true";

  try {
    await archiveFolder({
      folderId,
      actorId: user.id,
      cascade,
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== SERVICE_ERROR_CODES.FOLDER_NOT_EMPTY) {
      throw error;
    }

    return { folderId, error: error.message };
  }

  revalidatePath(`/workspaces/${workspaceSlug}`);
  return { folderId };
}
```

- [ ] **Step 4: Run the action tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/workspace-actions.test.ts
```

Expected: PASS for `tests/workspace-actions.test.ts`.

- [ ] **Step 5: Commit the action slice**

Run:

```bash
git add 'app/workspaces/[workspaceSlug]/actions.ts' tests/workspace-actions.test.ts
git commit -m "feat: pass cascade folder archive through action"
```

Expected: commit succeeds, or pre-commit stops on wiki sync until Task 5 wiki maintenance is staged.

---

### Task 3: Sidebar Cascade Confirmation

**Files:**
- Create: `components/document-navigation/folder-trash.ts`
- Modify: `components/document-navigation/folder-row.tsx`
- Modify: `components/document-navigation.tsx`
- Modify: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Write failing component tests for confirmation and form data**

Add these tests before the final `shows feedback when folder menu creation fails` tests in `tests/components/document-list.test.tsx`:

```tsx
  it("submits cascade when moving a non-empty folder subtree to trash", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const archiveFolderAction = vi.fn(async (formData: FormData) => ({
      folderId: String(formData.get("folderId")),
    }));
    renderList({
      archiveFolderAction,
      documents: [
        ...baseProps.documents,
        {
          id: "doc-runbook",
          folderId: "folder-runbooks",
          title: "Deploy Checklist",
          path: "/engineering/runbooks/deploy-checklist",
          contentText: "Deploy body",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to trash" }));

    await waitFor(() => {
      expect(archiveFolderAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (archiveFolderAction.mock.calls as unknown as FormData[][])[0][0];
    expect(confirmSpy).toHaveBeenCalledWith(
      "Move this folder and 1 folder and 1 document to trash?",
    );
    expect(submittedFormData.get("folderId")).toBe("folder-engineering");
    expect(submittedFormData.get("cascade")).toBe("true");
    expect(router.refresh).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("navigates to the workspace root when cascade trash archives the selected document", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const archiveFolderAction = vi.fn(async (formData: FormData) => ({
      folderId: String(formData.get("folderId")),
    }));
    renderList({
      archiveFolderAction,
      selectedDocumentId: "doc-runbook",
      documents: [
        ...baseProps.documents,
        {
          id: "doc-runbook",
          folderId: "folder-runbooks",
          title: "Deploy Checklist",
          path: "/engineering/runbooks/deploy-checklist",
          contentText: "Deploy body",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to trash" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook");
    });
    expect(router.refresh).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("navigates to the workspace root when cascade trash archives the selected folder", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const archiveFolderAction = vi.fn(async (formData: FormData) => ({
      folderId: String(formData.get("folderId")),
    }));
    renderList({
      archiveFolderAction,
      selectedFolderId: "folder-runbooks",
      selectedDocumentId: null,
    });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to trash" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook");
    });
    expect(router.refresh).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("keeps empty folder trash as a non-cascade submit", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const archiveFolderAction = vi.fn(async (formData: FormData) => ({
      folderId: String(formData.get("folderId")),
    }));
    renderList({ archiveFolderAction });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Runbooks /engineering/runbooks",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to trash" }));

    await waitFor(() => {
      expect(archiveFolderAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (archiveFolderAction.mock.calls as unknown as FormData[][])[0][0];
    expect(confirmSpy).toHaveBeenCalledWith("Move this folder to trash?");
    expect(submittedFormData.get("folderId")).toBe("folder-runbooks");
    expect(submittedFormData.get("cascade")).toBeNull();

    confirmSpy.mockRestore();
  });

  it("cancels cascade folder trash when the confirmation is dismissed", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const archiveFolderAction = vi.fn(async (formData: FormData) => ({
      folderId: String(formData.get("folderId")),
    }));
    renderList({
      archiveFolderAction,
      documents: [
        ...baseProps.documents,
        {
          id: "doc-runbook",
          folderId: "folder-runbooks",
          title: "Deploy Checklist",
          path: "/engineering/runbooks/deploy-checklist",
          contentText: "Deploy body",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to trash" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Move this folder and 1 folder and 1 document to trash?",
    );
    expect(archiveFolderAction).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
```

- [ ] **Step 2: Run the component tests and verify the expected failure**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: the new cascade tests fail because the row always uses the empty-folder confirm copy and never submits `cascade=true`.

- [ ] **Step 3: Add the focused folder trash helper**

Create `components/document-navigation/folder-trash.ts`:

```ts
import type { DocumentListItem, FolderListItem } from "@/components/document-list";

export type FolderTrashSummary = {
  descendantFolderCount: number;
  descendantDocumentCount: number;
  selectedFolderWillBeArchived: boolean;
  selectedDocumentWillBeArchived: boolean;
};

export function getFolderTrashSummary({
  folderId,
  folders,
  documents,
  selectedFolderId,
  selectedDocumentId,
}: {
  folderId: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  selectedFolderId: string | null;
  selectedDocumentId: string | null;
}): FolderTrashSummary {
  const descendantFolderIds = new Set<string>();
  let parentFolderIds = [folderId];

  while (parentFolderIds.length > 0) {
    const childFolderIds = folders
      .filter((folder) => parentFolderIds.includes(folder.parentFolderId ?? ""))
      .map((folder) => folder.id);

    for (const childFolderId of childFolderIds) {
      descendantFolderIds.add(childFolderId);
    }

    parentFolderIds = childFolderIds;
  }

  const archivedFolderIds = new Set([folderId, ...descendantFolderIds]);
  const descendantDocumentCount = documents.filter((document) =>
    document.folderId ? archivedFolderIds.has(document.folderId) : false,
  ).length;
  const selectedDocument = selectedDocumentId
    ? documents.find((document) => document.id === selectedDocumentId)
    : undefined;

  return {
    descendantFolderCount: descendantFolderIds.size,
    descendantDocumentCount,
    selectedFolderWillBeArchived: selectedFolderId
      ? archivedFolderIds.has(selectedFolderId)
      : false,
    selectedDocumentWillBeArchived: selectedDocument?.folderId
      ? archivedFolderIds.has(selectedDocument.folderId)
      : false,
  };
}

export function hasTrashDescendants(summary: FolderTrashSummary) {
  return summary.descendantFolderCount > 0 || summary.descendantDocumentCount > 0;
}

export function folderTrashConfirmMessage(summary: FolderTrashSummary) {
  if (!hasTrashDescendants(summary)) return "Move this folder to trash?";

  const parts: string[] = [];
  if (summary.descendantFolderCount > 0) {
    parts.push(
      `${summary.descendantFolderCount} ${
        summary.descendantFolderCount === 1 ? "folder" : "folders"
      }`,
    );
  }
  if (summary.descendantDocumentCount > 0) {
    parts.push(
      `${summary.descendantDocumentCount} ${
        summary.descendantDocumentCount === 1 ? "document" : "documents"
      }`,
    );
  }

  return `Move this folder and ${parts.join(" and ")} to trash?`;
}
```

- [ ] **Step 4: Pass trash summary into folder rows**

In `components/document-navigation/folder-row.tsx`, update imports:

```ts
import type { FolderTrashSummary } from "@/components/document-navigation/folder-trash";
import {
  folderTrashConfirmMessage,
  hasTrashDescendants,
} from "@/components/document-navigation/folder-trash";
```

Update the `FolderToggleRow` destructuring and prop type:

```tsx
  trashSummary,
}: {
  folder: FolderListItem;
  expanded: boolean;
  selected: boolean;
  canWrite: boolean;
  renameFolderAction: (formData: FormData) => Promise<void>;
  archiveFolderAction: (formData: FormData) => Promise<void>;
  trashSummary: FolderTrashSummary;
  isFavorite: boolean;
  isRenaming: boolean;
  pendingCreateAction: string | null;
  openMenuId: string | null;
  onOpenMenu: OpenMenuHandler;
  onStartRename: (folderId: string) => void;
  onCancelRename: () => void;
  onAddFolder: AddFolderChildHandler;
  onAddDocument: AddFolderDocumentHandler;
  onToggleFavorite: ToggleFavoriteFolderHandler;
  onToggle: () => void;
}) {
```

Inside the component body, after `displayLabel`, add:

```ts
  const hasDescendantsToTrash = hasTrashDescendants(trashSummary);
  const trashConfirmMessage = folderTrashConfirmMessage(trashSummary);
```

Replace the archive form with:

```tsx
          <form action={archiveFolderAction}>
            <input type="hidden" name="folderId" value={folder.id} />
            {hasDescendantsToTrash ? (
              <input type="hidden" name="cascade" value="true" />
            ) : null}
            <button
              type="submit"
              role="menuitem"
              disabled={!canWrite}
              onClick={(event) => {
                if (!window.confirm(trashConfirmMessage)) {
                  event.preventDefault();
                }
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              Move to trash
            </button>
          </form>
```

- [ ] **Step 5: Compute trash summary in navigation**

In `components/document-navigation.tsx`, add this import:

```ts
import { getFolderTrashSummary } from "@/components/document-navigation/folder-trash";
```

In `renderTreeItems()`, before returning `<FolderToggleRow />`, add:

```ts
      const trashSummary = getFolderTrashSummary({
        folderId: item.folder.id,
        folders,
        documents,
        selectedFolderId,
        selectedDocumentId,
      });
```

Pass the prop to `FolderToggleRow`:

```tsx
            trashSummary={trashSummary}
```

In `archiveFolderFromMenu()`, add the summary before calling the server action:

```ts
  async function archiveFolderFromMenu(formData: FormData) {
    const folderId = String(formData.get("folderId"));
    const trashSummary = getFolderTrashSummary({
      folderId,
      folders,
      documents,
      selectedFolderId,
      selectedDocumentId,
    });
    const result = await archiveFolderAction(formData);
```

Then replace the success route condition with:

```ts
      if (
        result.folderId === selectedFolderId ||
        trashSummary.selectedFolderWillBeArchived ||
        trashSummary.selectedDocumentWillBeArchived
      ) {
        router.push(`/workspaces/${workspaceSlug}`);
        return;
      }
```

- [ ] **Step 6: Run the component tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: PASS for `tests/components/document-list.test.tsx`.

- [ ] **Step 7: Commit the sidebar confirmation slice**

Run:

```bash
git add components/document-navigation.tsx components/document-navigation/folder-row.tsx components/document-navigation/folder-trash.ts tests/components/document-list.test.tsx
git commit -m "feat: confirm cascade folder trash"
```

Expected: commit succeeds, or pre-commit stops on wiki sync until Task 5 wiki maintenance is staged.

---

### Task 4: E2E Recursive Trash Behavior

**Files:**
- Modify: `tests/e2e/login.spec.ts`

- [ ] **Step 1: Update the e2e flow to accept dialogs and expect cascade deletion**

In `tests/e2e/login.spec.ts`, replace this block:

```ts
  await productNotesAction.click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  const folderTrashToast = page.getByText("Empty this folder before moving it to trash.", {
    exact: true,
  });
  await expect(folderTrashToast).toBeVisible();
  await expect(folderTrashToast).toBeHidden({ timeout: 4000 });
  await expect(page).not.toHaveURL(/folderError=/);
  const productNotesDocumentLink = page.locator(
    `a[href*="document=${productNotesDocumentId}"]`,
  );
  const productNotesDocumentRow = productNotesDocumentLink.locator("..");
  const productNotesDocumentAction = productNotesDocumentRow.getByRole("button", {
    name: /^Open actions for Untitled · \/product-notes(?:-\d+)?\/untitled(?:-\d+)?$/,
  });
  await productNotesDocumentAction.click();
  await productNotesDocumentRow.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(productNotesDocumentLink).toHaveCount(0);
  await productNotesAction.click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(
    documentList.getByRole("button", { name: `Open actions for ${productNotesDisplayLabel}` }),
  ).toHaveCount(0);
```

with:

```ts
  const productNotesDocumentLink = page.locator(
    `a[href*="document=${productNotesDocumentId}"]`,
  );
  await expect(productNotesDocumentLink).toHaveCount(1);
  const cascadeDialogPromise = page.waitForEvent("dialog");
  await productNotesAction.click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  const cascadeDialog = await cascadeDialogPromise;
  expect(cascadeDialog.message()).toMatch(
    /^Move this folder and \d+ document(?:s)? to trash\?$/,
  );
  await cascadeDialog.accept();
  await expect(productNotesDocumentLink).toHaveCount(0);
  await expect(
    documentList.getByRole("button", { name: `Open actions for ${productNotesDisplayLabel}` }),
  ).toHaveCount(0);
```

Before the earlier empty-folder trash click, make the dialog explicit by replacing:

```ts
  await emptyFolderAction.click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
```

with:

```ts
  const emptyFolderDialogPromise = page.waitForEvent("dialog");
  await emptyFolderAction.click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  const emptyFolderDialog = await emptyFolderDialogPromise;
  expect(emptyFolderDialog.message()).toBe("Move this folder to trash?");
  await emptyFolderDialog.accept();
```

- [ ] **Step 2: Run the focused e2e test**

Run:

```bash
pnpm test:e2e tests/e2e/login.spec.ts
```

Expected: PASS. If the dev server or database is not ready, start the normal local stack for this repo, seed it, and rerun the command.

- [ ] **Step 3: Commit the e2e slice**

Run:

```bash
git add tests/e2e/login.spec.ts
git commit -m "test: cover cascade folder trash e2e"
```

Expected: commit succeeds, or pre-commit stops on wiki sync until Task 5 wiki maintenance is staged.

---

### Task 5: Wiki Maintenance And Full Verification

**Files:**
- Modify: `wiki/Folder Hierarchy Model.md`
- Modify: `wiki/Project PRD.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update durable wiki pages**

In `wiki/Folder Hierarchy Model.md`, update the Issue #92 archive policy paragraph so it uses implementation language:

```md
Issue #92 implements explicit cascade archive for folder trash. Sidebar `Move to trash` computes active descendant folder/document counts for confirmation copy, submits `cascade=true` only after user confirmation, and the server service recalculates the active subtree before archiving descendant documents, descendant folders, and the target folder in one transaction.
```

In `wiki/Project PRD.md`, update the Issue #92 paragraph to present tense:

```md
Issue #92 implements the archive side of the Issue #20 recursive archive/restore follow-up. Sidebar folder `Move to trash` includes descendant folder/document counts in the confirmation and sends `cascade=true` to the server action only after user acceptance. The server service recalculates the active descendant subtree and performs a soft-delete archive transaction. Recursive restore and hard delete remain outside the current implementation.
```

In `wiki/index.md`, keep the Issue #92 status-board entry and change `설계다` to `구현이다`.

At the top of `wiki/log.md`, add:

```md
## 2026-06-05T00:00:00+09:00 - issue-92 implementation

- Result: 폴더 휴지통 이동이 사용자 확인 후 하위 폴더와 문서를 함께 archive할 수 있게 되었다.
- Coverage: `archiveFolder()`는 기본 비어 있지 않은 folder guard를 유지하면서 `cascade=true`일 때 active descendant subtree를 다시 계산해 descendant documents, descendant folders, target folder를 하나의 transaction으로 `ARCHIVED` 처리한다. Sidebar는 descendant counts를 확인 문구에 포함하고, 삭제 대상에 현재 selected folder/document가 들어 있으면 workspace root로 이동한다.
- Pages: [[Folder Hierarchy Model]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #92, `lib/folders/service.ts`, `app/workspaces/[workspaceSlug]/actions.ts`, `components/document-navigation/folder-trash.ts`, `components/document-navigation.tsx`, `components/document-navigation/folder-row.tsx`, `tests/folders/service.test.ts`, `tests/workspace-actions.test.ts`, `tests/components/document-list.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts tests/workspace-actions.test.ts tests/components/document-list.test.tsx`; `pnpm test:e2e tests/e2e/login.spec.ts`; `pnpm exec tsc --noEmit`; `pnpm test`; `pnpm wiki:manifest`; `pnpm wiki:lint`; `pnpm wiki:sync-check --staged`.
```

- [ ] **Step 2: Regenerate and validate wiki**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: `pnpm wiki:manifest` writes `wiki/manifest.json`; `pnpm wiki:lint` passes with only the known existing `wiki/designs/sidebar.md` image-link warning.

- [ ] **Step 3: Run typecheck and automated tests**

Run:

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run tests/folders/service.test.ts tests/workspace-actions.test.ts tests/components/document-list.test.tsx
pnpm test
```

Expected: all commands pass. If DB-backed tests fail because PostgreSQL or pgvector is unavailable, repair the local DB state with the established repo flow before changing feature logic.

- [ ] **Step 4: Run e2e verification**

Run:

```bash
pnpm test:e2e tests/e2e/login.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Stage and run commit-time wiki sync**

Run:

```bash
git add lib/folders/types.ts lib/folders/service.ts 'app/workspaces/[workspaceSlug]/actions.ts' components/document-navigation.tsx components/document-navigation/folder-row.tsx components/document-navigation/folder-trash.ts tests/folders/service.test.ts tests/workspace-actions.test.ts tests/components/document-list.test.tsx tests/e2e/login.spec.ts wiki/Folder\ Hierarchy\ Model.md wiki/Project\ PRD.md wiki/index.md wiki/log.md wiki/manifest.json
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: sync-check passes and staged files include source, tests, and wiki maintenance.

- [ ] **Step 6: Commit the final implementation state**

Run:

```bash
git commit -m "feat: cascade folder trash confirmation"
```

Expected: commit succeeds. If earlier task commits were blocked by wiki sync, this commit includes all implementation changes.

---

### Task 6: Push, PR, Review, And CI Loop

**Files:**
- No source file edits unless review or CI finds an issue.

- [ ] **Step 1: Push the branch**

Run:

```bash
git status --short --branch
git push -u origin issue-92-cascade-folder-trash-confirmation
```

Expected: branch is pushed and the worktree is clean.

- [ ] **Step 2: Create or update the PR**

Run:

```bash
gh pr create --fill
```

Expected: a PR is created for issue #92. If a PR already exists, run:

```bash
gh pr ready
```

- [ ] **Step 3: Wait for review and CI**

Wait at least 5 minutes after the PR is ready.

Run:

```bash
gh pr checks --watch
gh pr view --json number,reviewDecision,statusCheckRollup
```

Expected: checks pass or report actionable failures. If `statusCheckRollup` is empty, rely on the local verification from Task 5 and still inspect review threads.

- [ ] **Step 4: Inspect review threads**

Use the repo's existing review-thread helper if available:

```bash
python3 /Users/andrewchoi/.codex/plugins/cache/openai-curated/github/6188456f/skills/gh-address-comments/scripts/fetch_comments.py --repo dschoi30/munjib --pr <PR_NUMBER>
```

Expected: no unresolved actionable review threads. If there is review feedback, fix it on the same branch, rerun the focused tests plus wiki sync, commit, push, wait at least 5 minutes, and repeat review/CI inspection.

- [ ] **Step 5: Final task-complete report**

Report:

```md
Implemented cascade folder trash confirmation for issue #92.
Verification: [list commands that passed]
PR: <URL>
Review/CI: [current status]
Known residual: wiki lint still warns about the pre-existing sidebar image wikilink, if still present.
```

Expected: final report includes PR review and CI/check status.
