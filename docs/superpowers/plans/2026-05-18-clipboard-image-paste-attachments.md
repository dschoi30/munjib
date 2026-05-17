# Clipboard Image Paste Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store pasted clipboard image files as document attachments and insert the returned image Markdown at the current editor cursor while keeping document body persistence on Save.

**Architecture:** Add a paste-only attachment service path that creates attachment records and audit logs without mutating document content or versions. Expose it through a workspace-bound server action, pass that action into `DocumentEditor`, and have the CodeMirror paste handler prioritize clipboard image files over existing rich HTML conversion.

**Tech Stack:** Next.js App Router server actions, React, CodeMirror, Prisma, Vitest, Testing Library, existing Munjib wiki tooling.

---

## File Structure

- `lib/service-errors.ts`: add reusable attachment error constants used by actions and services.
- `lib/attachments/service.ts`: add `uploadPastedDocumentImageAttachment()` and shared helpers for attachment creation, markdown link construction, filename fallback, and audit logging.
- `tests/attachments/service.test.ts`: prove paste-only upload creates attachment/audit data but does not update document markdown or create a document version.
- `app/workspaces/[workspaceSlug]/actions.ts`: add `pasteDocumentImageAttachmentAction()` and wire it to the new service.
- `tests/workspace-actions.test.ts`: mock and verify the new paste action contract.
- `components/document-editor/types.ts`: add a `pasteImageAttachmentAction` prop returning `{ markdown: string }`.
- `app/workspaces/[workspaceSlug]/page.tsx`: bind and pass the paste action into `DocumentEditor`.
- `components/document-editor.tsx`: detect clipboard image files before HTML paste, upload via the new action, and insert returned Markdown at the original selection.
- `tests/components/document-editor-preview.test.tsx`: extend the CodeMirror harness tests for image paste and rich HTML fallback.
- `wiki/Document Editing Workflow.md`, `wiki/log.md`, `wiki/manifest.json`: document the durable behavior after implementation.

---

### Task 1: Paste-Only Attachment Service

**Files:**
- Modify: `lib/service-errors.ts`
- Modify: `lib/attachments/service.ts`
- Test: `tests/attachments/service.test.ts`

- [ ] **Step 1: Add failing service tests**

Add imports and tests to `tests/attachments/service.test.ts`:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  uploadDocumentAttachment,
  uploadPastedDocumentImageAttachment,
} from "@/lib/attachments/service";
import { prisma } from "@/lib/db/client";
import { createDocument } from "@/lib/documents/service";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

// Keep existing tests. Add these tests inside describe("attachment service", ...).

it("uploads a pasted image attachment without changing document markdown or versions", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const document = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title: "Paste Target",
    contentMarkdown: "# Paste Target",
  });

  const attachment = await uploadPastedDocumentImageAttachment({
    documentId: document.id,
    actorId: fixture.user.id,
    fileName: "clipboard.png",
    mimeType: "image/png",
    bytes: new Uint8Array([137, 80, 78, 71]),
  });

  expect(attachment.fileName).toBe("clipboard.png");
  expect(attachment.markdown).toBe(`![clipboard.png](/api/attachments/${attachment.id})`);

  const updated = await prisma.document.findUniqueOrThrow({
    where: { id: document.id },
    include: { versions: true },
  });
  expect(updated.contentMarkdown).toBe("# Paste Target");
  expect(updated.versions).toHaveLength(1);
  await expect(
    prisma.auditLog.findMany({
      where: { resourceType: "attachment", resourceId: attachment.id },
    }),
  ).resolves.toHaveLength(1);
});

it("uses a fallback file name for unnamed pasted images", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const document = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title: "Fallback Target",
    contentMarkdown: "# Fallback Target",
  });

  const attachment = await uploadPastedDocumentImageAttachment({
    documentId: document.id,
    actorId: fixture.user.id,
    fileName: "",
    mimeType: "image/png",
    bytes: new Uint8Array([1, 2, 3]),
  });

  expect(attachment.fileName).toBe("pasted-image.png");
  expect(attachment.markdown).toBe(`![pasted-image.png](/api/attachments/${attachment.id})`);
});

it("rejects non-image pasted attachments", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const document = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title: "Reject Target",
    contentMarkdown: "# Reject Target",
  });

  await expect(
    uploadPastedDocumentImageAttachment({
      documentId: document.id,
      actorId: fixture.user.id,
      fileName: "notes.txt",
      mimeType: "text/plain",
      bytes: new TextEncoder().encode("hello"),
    }),
  ).rejects.toThrow(SERVICE_ERROR_CODES.ATTACHMENT_MIME_TYPE_FORBIDDEN);
});
```

- [ ] **Step 2: Run the failing service test**

Run:

```bash
pnpm exec vitest run tests/attachments/service.test.ts
```

Expected: fail because `uploadPastedDocumentImageAttachment` and attachment error constants do not exist yet.

- [ ] **Step 3: Add attachment error constants**

Update `lib/service-errors.ts`:

```ts
export const SERVICE_ERROR_CODES = {
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
  FOLDER_NOT_FOUND: "FOLDER_NOT_FOUND",
  PARENT_FOLDER_NOT_FOUND: "PARENT_FOLDER_NOT_FOUND",
  FOLDER_MOVE_CYCLE: "FOLDER_MOVE_CYCLE",
  FOLDER_NOT_EMPTY: "FOLDER_NOT_EMPTY",
  DOCUMENT_NOT_FOUND: "DOCUMENT_NOT_FOUND",
  DOCUMENT_VERSION_NOT_FOUND: "DOCUMENT_VERSION_NOT_FOUND",
  DOCUMENT_LINK_NOT_FOUND: "DOCUMENT_LINK_NOT_FOUND",
  DOCUMENT_SLUG_RETRY_EXHAUSTED: "DOCUMENT_SLUG_RETRY_EXHAUSTED",
  MARKDOWN_IMPORT_FILE_REQUIRED: "MARKDOWN_IMPORT_FILE_REQUIRED",
  MARKDOWN_IMPORT_UNSUPPORTED_FILE: "MARKDOWN_IMPORT_UNSUPPORTED_FILE",
  ATTACHMENT_FILE_REQUIRED: "ATTACHMENT_FILE_REQUIRED",
  ATTACHMENT_EMPTY: "ATTACHMENT_EMPTY",
  ATTACHMENT_TOO_LARGE: "ATTACHMENT_TOO_LARGE",
  ATTACHMENT_MIME_TYPE_FORBIDDEN: "ATTACHMENT_MIME_TYPE_FORBIDDEN",
} as const;
```

- [ ] **Step 4: Implement paste-only upload helper**

Modify `lib/attachments/service.ts`:

```ts
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
```

Replace direct attachment error throws in `uploadDocumentAttachment()`:

```ts
  if (input.bytes.byteLength === 0) throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_EMPTY);
  if (input.bytes.byteLength > maxAttachmentBytes) throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_TOO_LARGE);
  if (!allowedMimeTypes.has(input.mimeType)) throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_MIME_TYPE_FORBIDDEN);
```

Add the new function below `uploadDocumentAttachment()`:

```ts
export async function uploadPastedDocumentImageAttachment(input: UploadDocumentAttachmentInput) {
  if (input.bytes.byteLength === 0) throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_EMPTY);
  if (input.bytes.byteLength > maxAttachmentBytes) throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_TOO_LARGE);
  if (!isAllowedPastedImageMimeType(input.mimeType)) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_MIME_TYPE_FORBIDDEN);
  }

  const { document, role, access } = await getWritableDocument(input.documentId, input.actorId);
  assertCanWriteWorkspace(role);
  assertCanWriteDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  const safeFileName = sanitizePastedImageFileName(input.fileName, input.mimeType);
  const storageKey = `${document.workspaceId}/${randomUUID()}-${safeFileName}`;
  const absolutePath = attachmentPath(storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.bytes);

  try {
    const attachment = await prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          documentId: document.id,
          fileName: safeFileName,
          mimeType: input.mimeType,
          size: input.bytes.byteLength,
          storageKey,
          uploadedById: input.actorId,
        },
      });

      await writeAuditLog(tx, {
        organizationId: document.workspace.organizationId,
        actorId: input.actorId,
        action: "attachment.uploaded",
        resourceType: "attachment",
        resourceId: created.id,
        metadata: {
          documentId: document.id,
          fileName: created.fileName,
          mimeType: created.mimeType,
          size: created.size,
          source: "clipboard-paste",
        },
      });

      return created;
    });

    return {
      ...attachment,
      markdown: imageMarkdownLink(attachment.fileName, attachment.id),
    };
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
}
```

Add helpers near the bottom of `lib/attachments/service.ts`:

```ts
function isAllowedPastedImageMimeType(mimeType: string) {
  return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/gif" || mimeType === "image/webp";
}

function sanitizePastedImageFileName(fileName: string, mimeType: string) {
  const safeFileName = sanitizeFileName(fileName);
  if (safeFileName !== "attachment") return safeFileName;

  return `pasted-image.${extensionForImageMimeType(mimeType)}`;
}

function extensionForImageMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function imageMarkdownLink(fileName: string, attachmentId: string) {
  return `![${fileName}](/api/attachments/${attachmentId})`;
}
```

- [ ] **Step 5: Run the service test**

Run:

```bash
pnpm exec vitest run tests/attachments/service.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add lib/service-errors.ts lib/attachments/service.ts tests/attachments/service.test.ts
git commit -m "feat: add paste-only image attachment service"
```

---

### Task 2: Server Action Contract

**Files:**
- Modify: `app/workspaces/[workspaceSlug]/actions.ts`
- Test: `tests/workspace-actions.test.ts`

- [ ] **Step 1: Add failing action test**

Update the hoisted mocks in `tests/workspace-actions.test.ts`:

```ts
const mocks = vi.hoisted(() => ({
  archiveDocument: vi.fn(),
  archiveFolder: vi.fn(),
  createComment: vi.fn(),
  createDocument: vi.fn(),
  createDocumentFromBrokenLink: vi.fn(),
  createFolder: vi.fn(),
  deriveMarkdownImportTitle: vi.fn(),
  isSupportedMarkdownImportFile: vi.fn(),
  pasteDocumentImageAttachment: vi.fn(),
  redirect: vi.fn(),
  renameFolder: vi.fn(),
  requireCurrentUser: vi.fn(),
  restoreDocumentVersion: vi.fn(),
  revalidatePath: vi.fn(),
  updateDocument: vi.fn(),
  uploadDocumentAttachment: vi.fn(),
}));
```

Update the attachments mock:

```ts
vi.mock("@/lib/attachments/service", () => ({
  uploadDocumentAttachment: mocks.uploadDocumentAttachment,
  uploadPastedDocumentImageAttachment: mocks.pasteDocumentImageAttachment,
}));
```

Add tests inside `describe("workspace document actions", ...)`:

```ts
test("pasteDocumentImageAttachmentAction uploads an image and returns markdown without redirect", async () => {
  mocks.pasteDocumentImageAttachment.mockResolvedValue({
    id: "attachment-1",
    documentId: "doc-1",
    markdown: "![clipboard.png](/api/attachments/attachment-1)",
  });
  const { pasteDocumentImageAttachmentAction } = await import("@/app/workspaces/[workspaceSlug]/actions");
  const formData = new FormData();
  formData.set("documentId", "doc-1");
  formData.set("attachment", new File(["image"], "clipboard.png", { type: "image/png" }));

  const result = await pasteDocumentImageAttachmentAction("company-handbook", formData);

  expect(mocks.pasteDocumentImageAttachment).toHaveBeenCalledWith({
    actorId: "user-1",
    bytes: expect.any(Uint8Array),
    documentId: "doc-1",
    fileName: "clipboard.png",
    mimeType: "image/png",
  });
  expect(result).toEqual({ markdown: "![clipboard.png](/api/attachments/attachment-1)" });
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
  expect(mocks.redirect).not.toHaveBeenCalled();
});

test("pasteDocumentImageAttachmentAction requires a file", async () => {
  const { pasteDocumentImageAttachmentAction } = await import("@/app/workspaces/[workspaceSlug]/actions");
  const formData = new FormData();
  formData.set("documentId", "doc-1");

  await expect(pasteDocumentImageAttachmentAction("company-handbook", formData)).rejects.toThrow(
    "ATTACHMENT_FILE_REQUIRED",
  );
});
```

- [ ] **Step 2: Run the failing action test**

Run:

```bash
pnpm exec vitest run tests/workspace-actions.test.ts
```

Expected: fail because the action is not exported.

- [ ] **Step 3: Implement the action**

Modify imports in `app/workspaces/[workspaceSlug]/actions.ts`:

```ts
import {
  uploadDocumentAttachment,
  uploadPastedDocumentImageAttachment,
} from "@/lib/attachments/service";
```

Add the action below `uploadDocumentAttachmentAction()`:

```ts
export async function pasteDocumentImageAttachmentAction(
  workspaceSlug: string,
  formData: FormData,
) {
  const user = await requireCurrentUser();
  const file = formData.get("attachment");
  const documentId = String(formData.get("documentId"));

  if (!(file instanceof File)) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_FILE_REQUIRED);
  }

  const attachment = await uploadPastedDocumentImageAttachment({
    documentId,
    actorId: user.id,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes: new Uint8Array(await file.arrayBuffer()),
  });

  revalidatePath(`/workspaces/${workspaceSlug}`);
  return { markdown: attachment.markdown };
}
```

- [ ] **Step 4: Run the action test**

Run:

```bash
pnpm exec vitest run tests/workspace-actions.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add 'app/workspaces/[workspaceSlug]/actions.ts' tests/workspace-actions.test.ts
git commit -m "feat: add pasted image attachment action"
```

---

### Task 3: DocumentEditor Paste Integration

**Files:**
- Modify: `components/document-editor/types.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `components/document-editor.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`

- [ ] **Step 1: Add failing component tests**

Update `baseProps` in `tests/components/document-editor-preview.test.tsx`:

```ts
const baseProps = {
  canWrite: true,
  action: async () => {},
  uploadAttachmentAction: async () => {},
  pasteImageAttachmentAction: async () => ({ markdown: "![clipboard.png](/api/attachments/attachment-1)" }),
  linkCandidates: [],
  tags: [],
  properties: [],
  comments: [],
  linkPanels: { outgoing: [], backlinks: [], brokenLinks: [], ambiguousLinks: [] },
  createFromBrokenLinkAction: async () => {},
  createCommentAction: async () => {},
};
```

Add tests near the existing rich paste test:

```ts
it("uploads clipboard image files and inserts returned markdown at the selection", async () => {
  const pasteImageAttachmentAction = vi.fn(async () => ({
    markdown: "![clipboard.png](/api/attachments/attachment-1)",
  }));
  renderEditor("Intro", { pasteImageAttachmentAction });

  fireEvent.click(screen.getByRole("button", { name: /edit/i }));
  await screen.findByLabelText("Markdown editor");

  const preventDefault = vi.fn();
  const dispatch = vi.fn();
  const replaceSelection = vi.fn((text: string) => ({ changes: text }));
  const image = new File(["image"], "clipboard.png", { type: "image/png" });
  const event = {
    preventDefault,
    clipboardData: {
      files: [image],
      items: [],
      getData: () => "",
    },
  } as unknown as ClipboardEvent;

  expect(codeMirrorHarness.pasteHandlers[0](event, {
    state: { replaceSelection },
    dispatch,
  })).toBe(true);

  await vi.waitFor(() => {
    expect(pasteImageAttachmentAction).toHaveBeenCalledWith(expect.any(FormData));
  });
  expect(preventDefault).toHaveBeenCalled();
  expect(replaceSelection).toHaveBeenCalledWith("![clipboard.png](/api/attachments/attachment-1)");
  expect(dispatch).toHaveBeenCalledWith({
    changes: "![clipboard.png](/api/attachments/attachment-1)",
  });
});

it("keeps rich HTML paste behavior when no image file is present", async () => {
  const pasteImageAttachmentAction = vi.fn(async () => ({
    markdown: "![clipboard.png](/api/attachments/attachment-1)",
  }));
  renderEditor("Intro", { pasteImageAttachmentAction });

  fireEvent.click(screen.getByRole("button", { name: /edit/i }));
  await screen.findByLabelText("Markdown editor");

  const preventDefault = vi.fn();
  const dispatch = vi.fn();
  const replaceSelection = vi.fn((text: string) => ({ changes: text }));
  const event = {
    preventDefault,
    clipboardData: {
      files: [],
      items: [],
      getData: (type: string) => (type === "text/html" ? "<p><strong>Styled</strong></p>" : "Styled"),
    },
  } as unknown as ClipboardEvent;

  expect(codeMirrorHarness.pasteHandlers[0](event, {
    state: { replaceSelection },
    dispatch,
  })).toBe(true);

  expect(pasteImageAttachmentAction).not.toHaveBeenCalled();
  expect(replaceSelection).toHaveBeenCalledWith("**Styled**");
});
```

- [ ] **Step 2: Run the failing component test**

Run:

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx
```

Expected: fail because `pasteImageAttachmentAction` is not in props and the paste handler does not handle image files.

- [ ] **Step 3: Add the prop type**

Modify `components/document-editor/types.ts`:

```ts
  uploadAttachmentAction: (formData: FormData) => Promise<void>;
  pasteImageAttachmentAction: (formData: FormData) => Promise<{ markdown: string }>;
```

- [ ] **Step 4: Pass the bound action from the workspace page**

In `app/workspaces/[workspaceSlug]/page.tsx`, import and bind the new action where other workspace actions are bound:

```ts
import {
  createCommentAction,
  createDocumentAction,
  createDocumentFromBrokenLinkAction,
  importMarkdownDocumentAction,
  pasteDocumentImageAttachmentAction,
  restoreDocumentVersionAction,
  updateDocumentAction,
  uploadDocumentAttachmentAction,
} from "./actions";
```

Add the bound action:

```ts
const pasteImageAttachmentAction = pasteDocumentImageAttachmentAction.bind(null, workspaceSlug);
```

Pass it to `DocumentEditor`:

```tsx
<DocumentEditor
  document={
    selectedDocument
      ? {
          id: selectedDocument.id,
          title: selectedDocument.title,
          contentMarkdown: selectedDocument.contentMarkdown,
        }
      : null
  }
  canWrite={canWriteSelectedDocument}
  action={updateAction}
  uploadAttachmentAction={uploadAttachmentAction}
  pasteImageAttachmentAction={pasteImageAttachmentAction}
  linkCandidates={readableDocuments.map((document) => ({
    id: document.id,
    slug: document.slug,
    title: document.title,
    path: document.path,
  }))}
  tags={documentTags.map((documentTag) => documentTag.tag)}
  properties={documentProperties}
  comments={comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    user: comment.user,
  }))}
  linkPanels={linkPanels}
  createFromBrokenLinkAction={createFromBrokenLinkAction}
  createCommentAction={commentAction}
/>
```

- [ ] **Step 5: Implement image detection and upload in `DocumentEditor`**

Modify the component signature:

```ts
  uploadAttachmentAction,
  pasteImageAttachmentAction,
```

Add helpers above `DocumentEditor`:

```ts
const pastedImageMimeTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function getClipboardImageFile(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return null;

  const itemFile = Array.from(dataTransfer.items ?? [])
    .find((item) => item.kind === "file" && pastedImageMimeTypes.has(item.type))
    ?.getAsFile();
  if (itemFile) return itemFile;

  return Array.from(dataTransfer.files ?? []).find((file) => pastedImageMimeTypes.has(file.type)) ?? null;
}
```

Update the paste handler before the `text/html` branch:

```ts
        paste: (event, view) => {
          if (!canWrite) {
            return false;
          }

          const imageFile = getClipboardImageFile(event.clipboardData);

          if (imageFile) {
            event.preventDefault();
            const formData = new FormData();
            formData.set("documentId", document?.id ?? "");
            formData.set("attachment", imageFile);

            void pasteImageAttachmentAction(formData).then(({ markdown }) => {
              view.dispatch(view.state.replaceSelection(markdown));
            });

            return true;
          }

          const html = event.clipboardData?.getData("text/html") ?? "";
          const markdown = htmlToMarkdown(html);
```

Update the `useMemo` dependency list:

```ts
    [canWrite, document?.id, pasteImageAttachmentAction],
```

- [ ] **Step 6: Run the component test**

Run:

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add components/document-editor/types.ts 'app/workspaces/[workspaceSlug]/page.tsx' components/document-editor.tsx tests/components/document-editor-preview.test.tsx
git commit -m "feat: paste clipboard images into markdown editor"
```

---

### Task 4: Wiki Maintenance

**Files:**
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

- [ ] **Step 1: Update Document Editing Workflow**

In `wiki/Document Editing Workflow.md`, update the attachment paragraph under `## Version restore, attachment, comment`:

```md
`uploadDocumentAttachmentAction()`은 file upload를 받아 `uploadDocumentAttachment()`로 넘긴다. service는 5MB 이하의 허용 MIME type만 받아 `storage/attachments/`에 저장하고, image는 `![file](/api/attachments/<id>)`, 그 외 파일은 `[file](/api/attachments/<id>)` markdown link를 본문 끝에 append한다. DB transaction 실패 시 이미 쓴 파일은 삭제한다.

`pasteDocumentImageAttachmentAction()`은 Markdown editor의 clipboard image paste에서 호출된다. `image/png`, `image/jpeg`, `image/gif`, `image/webp` file blob을 attachment로 즉시 저장하고 `![file](/api/attachments/<id>)` markdown을 반환하지만, `Document.contentMarkdown`와 `DocumentVersion`은 바로 갱신하지 않는다. `DocumentEditor`가 반환된 markdown을 현재 CodeMirror selection에 삽입하고, 사용자가 Save를 누를 때 기존 `updateDocument()` 흐름이 본문 저장, version 생성, metadata/link reconciliation, audit log를 확정한다. Remote `<img>` 다운로드와 Markdown import image 수집은 Issue #52 범위에서 제외한다.
```

- [ ] **Step 2: Add wiki log entry**

Add an entry at the top of `wiki/log.md` and update frontmatter `updated` and `source_count`:

```md
## 2026-05-18T00:00:00+09:00 - implementation

- Result: Issue #52 clipboard image paste attachment 동작을 구현했다.
- Coverage: Markdown editor paste handler는 clipboard image file을 rich HTML 변환보다 우선 처리해 attachment로 저장하고, 반환된 image markdown을 현재 CodeMirror selection에 삽입한다. Paste-only attachment service는 document content/version을 즉시 바꾸지 않고 attachment row와 audit log만 만든다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #52, `docs/superpowers/specs/2026-05-18-clipboard-image-paste-design.md`, `docs/superpowers/plans/2026-05-18-clipboard-image-paste-attachments.md`, `components/document-editor.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `lib/attachments/service.ts`.
- Verification: `pnpm exec vitest run tests/attachments/service.test.ts tests/workspace-actions.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.
```

- [ ] **Step 3: Regenerate and lint wiki**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: both pass; `wiki/manifest.json` updates if frontmatter changed.

- [ ] **Step 4: Commit Task 4**

```bash
git add wiki/Document\ Editing\ Workflow.md wiki/log.md wiki/manifest.json
git commit -m "docs: record clipboard image paste workflow"
```

---

### Task 5: Final Verification And PR Workflow

**Files:**
- No new source files. This task verifies and publishes the branch.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/attachments/service.test.ts tests/workspace-actions.test.ts tests/components/document-editor-preview.test.tsx
```

Expected: pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: pass.

- [ ] **Step 3: Run wiki sync commands on staged changes**

If there are uncommitted implementation or wiki changes, stage only intentional files and run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: sync check reports source and wiki maintenance changes when source files are staged.

- [ ] **Step 4: Inspect final status**

Run:

```bash
git status --short --branch
```

Expected: only unrelated existing untracked design images may remain:

```text
?? wiki/designs/notion2.png
?? wiki/designs/notion3.png
?? wiki/designs/obsidian3.png
```

- [ ] **Step 5: Push and open PR**

Run:

```bash
git push -u origin issue-52-clipboard-image-paste-attachments
gh pr create --draft --title "[codex] Clipboard image paste attachments" --body "Implements Issue #52 clipboard image paste attachments."
gh pr ready
```

Expected: branch pushes and PR is marked ready.

- [ ] **Step 6: Review checks after waiting**

Wait at least 5 minutes, then run:

```bash
gh pr checks
gh pr view --json reviewDecision,mergeStateStatus,statusCheckRollup
```

Expected: report CI/check and review status. If checks fail or actionable review feedback appears, fix on the same branch and repeat focused verification, wiki sync, commit, push, and review check.
