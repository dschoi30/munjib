# Wiki Links And Backlinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first Phase 2 knowledge-linking slice: parse `[[Wiki Links]]`, persist document links, show outgoing/backlink/broken-link panels, and create missing linked documents from broken links.

**Architecture:** Store extracted wiki links in a new Prisma `DocumentLink` table. Keep parsing and link reconciliation in focused `lib/wiki-links/*` utilities, and call reconciliation from existing document create/update services inside the same transaction. Add server actions and right-panel UI for outgoing links, backlinks, and broken links without replacing the current textarea editor.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, PostgreSQL, Server Actions, Vitest, existing Tailwind UI primitives.

---

## Scope

This plan implements only the durable link model and basic UX around it.

In scope:

- Parse `[[Document Title]]` and `[[Document Title|Alias]]`.
- Store outgoing links from one document to another document in the same workspace.
- Mark links as broken when the target title does not exist.
- Show outgoing links, backlinks, and broken links for the selected document.
- Allow creating a missing document from a broken link.
- Keep workspace write permissions enforced.

Out of scope:

- CodeMirror 6 editor integration.
- Inline autocomplete while typing `[[`.
- Automatic link rewrite when titles change.
- Graph view rendering.
- Full-text search.
- Tags and YAML frontmatter parsing.
- Image uploads and attachments.

## File Structure

- Modify `prisma/schema.prisma`: add `DocumentLink` model and relations from `Document`.
- Create `lib/wiki-links/parser.ts`: parse Obsidian-style wiki links from markdown.
- Create `lib/wiki-links/reconcile.ts`: replace a document's outgoing links inside a Prisma transaction.
- Create `lib/wiki-links/service.ts`: read outgoing links, backlinks, broken links, and create missing target documents.
- Create `lib/wiki-links/types.ts`: shared link panel DTOs.
- Modify `lib/documents/service.ts`: reconcile links after create/update, add create-from-broken-link use case.
- Modify `lib/documents/types.ts`: add input type for creating linked documents.
- Modify `app/workspaces/[workspaceSlug]/actions.ts`: add create-from-broken-link action.
- Modify `app/workspaces/[workspaceSlug]/page.tsx`: load link panels for selected document.
- Modify `components/metadata-panel.tsx`: render link panels and broken-link creation buttons.
- Modify `prisma/seed.ts`: seed at least one linked document pair and one broken link.
- Create `tests/wiki-links/parser.test.ts`: parser tests.
- Create `tests/wiki-links/reconcile.test.ts`: persistence and permission tests.

## Task 1: Wiki Link Parser

**Files:**
- Create: `lib/wiki-links/parser.ts`
- Test: `tests/wiki-links/parser.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `tests/wiki-links/parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseWikiLinks } from "@/lib/wiki-links/parser";

describe("parseWikiLinks", () => {
  it("extracts unique wiki links in first-seen order", () => {
    expect(
      parseWikiLinks("Read [[Engineering Guide]] and [[Runbook]]. Then [[Engineering Guide]] again."),
    ).toEqual([
      { targetTitleRaw: "Engineering Guide", alias: null },
      { targetTitleRaw: "Runbook", alias: null },
    ]);
  });

  it("extracts aliases without changing the raw target title", () => {
    expect(parseWikiLinks("See [[Incident Runbook|the runbook]].")).toEqual([
      { targetTitleRaw: "Incident Runbook", alias: "the runbook" },
    ]);
  });

  it("ignores empty, heading, and embed-style links", () => {
    expect(parseWikiLinks("[[]] [[#Heading]] ![[Image.png]] [[   ]]")).toEqual([]);
  });

  it("trims whitespace around title and alias", () => {
    expect(parseWikiLinks("[[  Product Spec  |  spec  ]]")).toEqual([
      { targetTitleRaw: "Product Spec", alias: "spec" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/wiki-links/parser.test.ts`

Expected: FAIL with module not found for `@/lib/wiki-links/parser`.

- [ ] **Step 3: Implement minimal parser**

Create `lib/wiki-links/parser.ts`:

```ts
export type ParsedWikiLink = {
  targetTitleRaw: string;
  alias: string | null;
};

export function parseWikiLinks(markdown: string): ParsedWikiLink[] {
  const links: ParsedWikiLink[] = [];
  const seen = new Set<string>();
  const withoutEmbeds = markdown.replace(/!\[\[[^\]]+\]\]/g, "");

  for (const match of withoutEmbeds.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const raw = match[1]?.trim() ?? "";
    if (!raw || raw.startsWith("#")) continue;

    const [targetPart, aliasPart] = raw.split("|");
    const targetTitleRaw = targetPart?.trim() ?? "";
    if (!targetTitleRaw || targetTitleRaw.startsWith("#")) continue;

    const alias = aliasPart?.trim() ? aliasPart.trim() : null;
    const key = targetTitleRaw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ targetTitleRaw, alias });
  }

  return links;
}
```

- [ ] **Step 4: Run parser tests**

Run: `pnpm exec vitest run tests/wiki-links/parser.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wiki-links/parser.ts tests/wiki-links/parser.test.ts
git commit -m "feat: add wiki link parser"
```

## Task 2: DocumentLink Schema And Reconciliation

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/wiki-links/reconcile.ts`
- Create: `lib/wiki-links/types.ts`
- Modify: `lib/documents/service.ts`
- Test: `tests/wiki-links/reconcile.test.ts`

- [ ] **Step 1: Write failing reconciliation tests**

Create `tests/wiki-links/reconcile.test.ts`:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createDocument, updateDocument } from "@/lib/documents/service";
import { getDocumentLinkPanels } from "@/lib/wiki-links/service";
import { prisma } from "@/lib/db/client";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("wiki link reconciliation", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("stores outgoing links and backlinks for existing target documents", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const target = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Runbook",
    });
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: "Read [[Runbook]].",
    });

    const sourcePanels = await getDocumentLinkPanels(source.id, fixture.user.id);
    const targetPanels = await getDocumentLinkPanels(target.id, fixture.user.id);

    expect(sourcePanels.outgoing).toEqual([
      {
        id: expect.any(String),
        targetTitleRaw: "Runbook",
        alias: null,
        isBroken: false,
        targetDocument: { id: target.id, title: "Runbook", slug: "runbook" },
      },
    ]);
    expect(targetPanels.backlinks).toEqual([
      {
        id: expect.any(String),
        sourceDocument: { id: source.id, title: "Incident Guide", slug: "incident-guide" },
      },
    ]);
  });

  it("marks links as broken when the target document does not exist", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: "Read [[Missing Runbook]].",
    });

    const panels = await getDocumentLinkPanels(source.id, fixture.user.id);

    expect(panels.brokenLinks).toEqual([
      {
        id: expect.any(String),
        targetTitleRaw: "Missing Runbook",
        alias: null,
      },
    ]);
  });

  it("replaces outgoing links when a document is updated", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Runbook",
    });
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: "Read [[Runbook]].",
    });

    await updateDocument({
      documentId: source.id,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: "No links now.",
    });

    await expect(prisma.documentLink.findMany({ where: { sourceDocumentId: source.id } })).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/reconcile.test.ts`

Expected: FAIL because `DocumentLink` model and `@/lib/wiki-links/service` do not exist.

- [ ] **Step 3: Add Prisma schema model**

Modify `prisma/schema.prisma`.

Add relations to `Document`:

```prisma
  outgoingLinks   DocumentLink[]     @relation("DocumentOutgoingLinks")
  incomingLinks   DocumentLink[]     @relation("DocumentIncomingLinks")
```

Add model after `DocumentVersion`:

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
  createdAt        DateTime  @default(now())
  workspace        Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  sourceDocument   Document  @relation("DocumentOutgoingLinks", fields: [sourceDocumentId], references: [id], onDelete: Cascade)
  targetDocument   Document? @relation("DocumentIncomingLinks", fields: [targetDocumentId], references: [id], onDelete: SetNull)

  @@index([workspaceId])
  @@index([sourceDocumentId])
  @@index([targetDocumentId])
  @@index([workspaceId, targetTitleRaw])
}
```

Add relation to `Workspace`:

```prisma
  documentLinks DocumentLink[]
```

- [ ] **Step 4: Create migration and generate client**

Run:

```bash
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm exec prisma migrate dev --name add_document_links
pnpm run db:generate
```

Expected: migration created and Prisma client generated.

- [ ] **Step 5: Add link DTO types**

Create `lib/wiki-links/types.ts`:

```ts
export type LinkedDocumentSummary = {
  id: string;
  title: string;
  slug: string;
};

export type OutgoingWikiLink = {
  id: string;
  targetTitleRaw: string;
  alias: string | null;
  isBroken: boolean;
  targetDocument: LinkedDocumentSummary | null;
};

export type BacklinkSummary = {
  id: string;
  sourceDocument: LinkedDocumentSummary;
};

export type BrokenWikiLink = {
  id: string;
  targetTitleRaw: string;
  alias: string | null;
};

export type DocumentLinkPanels = {
  outgoing: OutgoingWikiLink[];
  backlinks: BacklinkSummary[];
  brokenLinks: BrokenWikiLink[];
};
```

- [ ] **Step 6: Implement reconciliation and read service**

Create `lib/wiki-links/reconcile.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { parseWikiLinks } from "@/lib/wiki-links/parser";
import { slugifyTitle } from "@/lib/text/slug";

export async function reconcileDocumentLinks(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    sourceDocumentId: string;
    contentMarkdown: string;
  },
) {
  await tx.documentLink.deleteMany({
    where: { sourceDocumentId: input.sourceDocumentId },
  });

  const parsedLinks = parseWikiLinks(input.contentMarkdown);
  for (const parsedLink of parsedLinks) {
    const target = await tx.document.findFirst({
      where: {
        workspaceId: input.workspaceId,
        slug: slugifyTitle(parsedLink.targetTitleRaw),
        status: "ACTIVE",
      },
      select: { id: true },
    });

    await tx.documentLink.create({
      data: {
        workspaceId: input.workspaceId,
        sourceDocumentId: input.sourceDocumentId,
        targetDocumentId: target?.id ?? null,
        targetTitleRaw: parsedLink.targetTitleRaw,
        alias: parsedLink.alias,
        isBroken: !target,
      },
    });
  }
}
```

Create `lib/wiki-links/service.ts`:

```ts
import { prisma } from "@/lib/db/client";
import { assertCanReadWorkspace } from "@/lib/permissions/workspace";
import type { DocumentLinkPanels } from "@/lib/wiki-links/types";

async function getReadableDocument(documentId: string, actorId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      workspace: {
        include: {
          members: { where: { userId: actorId }, take: 1 },
        },
      },
    },
  });

  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  const role = document.workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  return document;
}

export async function getDocumentLinkPanels(documentId: string, actorId: string): Promise<DocumentLinkPanels> {
  await getReadableDocument(documentId, actorId);

  const [outgoing, backlinks] = await Promise.all([
    prisma.documentLink.findMany({
      where: { sourceDocumentId: documentId },
      orderBy: { targetTitleRaw: "asc" },
      include: { targetDocument: { select: { id: true, title: true, slug: true } } },
    }),
    prisma.documentLink.findMany({
      where: { targetDocumentId: documentId, isBroken: false },
      orderBy: { createdAt: "desc" },
      include: { sourceDocument: { select: { id: true, title: true, slug: true } } },
    }),
  ]);

  return {
    outgoing: outgoing.map((link) => ({
      id: link.id,
      targetTitleRaw: link.targetTitleRaw,
      alias: link.alias,
      isBroken: link.isBroken,
      targetDocument: link.targetDocument,
    })),
    backlinks: backlinks.map((link) => ({
      id: link.id,
      sourceDocument: link.sourceDocument,
    })),
    brokenLinks: outgoing
      .filter((link) => link.isBroken)
      .map((link) => ({
        id: link.id,
        targetTitleRaw: link.targetTitleRaw,
        alias: link.alias,
      })),
  };
}
```

- [ ] **Step 7: Reconcile links from document service**

Modify `lib/documents/service.ts`.

Import:

```ts
import { reconcileDocumentLinks } from "@/lib/wiki-links/reconcile";
```

After creating a document and before audit logging:

```ts
    await reconcileDocumentLinks(tx, {
      workspaceId: workspace.id,
      sourceDocumentId: document.id,
      contentMarkdown: document.contentMarkdown,
    });
```

After updating a document and before creating the audit log:

```ts
    await reconcileDocumentLinks(tx, {
      workspaceId: workspace.id,
      sourceDocumentId: updated.id,
      contentMarkdown: updated.contentMarkdown,
    });
```

- [ ] **Step 8: Run reconciliation tests**

Run: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/reconcile.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/wiki-links lib/documents/service.ts tests/wiki-links/reconcile.test.ts
git commit -m "feat: persist wiki document links"
```

## Task 3: Create Missing Document From Broken Link

**Files:**
- Modify: `lib/documents/types.ts`
- Modify: `lib/documents/service.ts`
- Modify: `lib/wiki-links/reconcile.ts`
- Test: `tests/wiki-links/reconcile.test.ts`

- [ ] **Step 1: Add failing create-from-broken-link tests**

Append to `tests/wiki-links/reconcile.test.ts`:

```ts
import { createDocumentFromBrokenLink } from "@/lib/documents/service";
```

Add tests inside the existing `describe` block:

```ts
  it("creates a missing target document from a broken link and repairs the link", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Incident Guide",
      contentMarkdown: "Read [[Missing Runbook]].",
    });
    const broken = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id, targetTitleRaw: "Missing Runbook" },
    });

    const created = await createDocumentFromBrokenLink({
      linkId: broken.id,
      actorId: fixture.user.id,
    });

    expect(created.title).toBe("Missing Runbook");
    const repaired = await prisma.documentLink.findUniqueOrThrow({ where: { id: broken.id } });
    expect(repaired.isBroken).toBe(false);
    expect(repaired.targetDocumentId).toBe(created.id);
  });

  it("prevents viewers from creating a missing target document", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.VIEWER);
    const editor = await prisma.user.create({
      data: { email: `test-editor-${fixture.workspace.id}@example.com`, name: "Editor User" },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId: fixture.workspace.id, userId: editor.id, role: WorkspaceRole.EDITOR },
    });
    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: editor.id,
      title: "Incident Guide",
      contentMarkdown: "Read [[Missing Runbook]].",
    });
    const broken = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id, targetTitleRaw: "Missing Runbook" },
    });

    await expect(
      createDocumentFromBrokenLink({
        linkId: broken.id,
        actorId: fixture.user.id,
      }),
    ).rejects.toThrow("WORKSPACE_WRITE_FORBIDDEN");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/reconcile.test.ts`

Expected: FAIL because `createDocumentFromBrokenLink` does not exist.

- [ ] **Step 3: Add service input type**

Modify `lib/documents/types.ts`:

```ts
export type CreateDocumentFromBrokenLinkInput = {
  linkId: string;
  actorId: string;
};
```

- [ ] **Step 4: Implement repairable reconciliation helper**

Modify `lib/wiki-links/reconcile.ts`.

Add:

```ts
export async function repairBrokenLinksForTarget(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    targetDocumentId: string;
    targetTitle: string;
  },
) {
  await tx.documentLink.updateMany({
    where: {
      workspaceId: input.workspaceId,
      targetTitleRaw: input.targetTitle,
      isBroken: true,
    },
    data: {
      targetDocumentId: input.targetDocumentId,
      isBroken: false,
    },
  });
}
```

- [ ] **Step 5: Implement createDocumentFromBrokenLink**

Modify `lib/documents/service.ts`.

Import:

```ts
import { repairBrokenLinksForTarget, reconcileDocumentLinks } from "@/lib/wiki-links/reconcile";
import type { CreateDocumentFromBrokenLinkInput } from "@/lib/documents/types";
```

Add function:

```ts
export async function createDocumentFromBrokenLink(input: CreateDocumentFromBrokenLinkInput) {
  const link = await prisma.documentLink.findUnique({
    where: { id: input.linkId },
    include: {
      workspace: {
        include: {
          organization: true,
          members: { where: { userId: input.actorId }, take: 1 },
        },
      },
    },
  });

  if (!link) throw new Error("DOCUMENT_LINK_NOT_FOUND");
  const role = link.workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  assertCanWriteWorkspace(role);

  const slug = slugifyTitle(link.targetTitleRaw);
  const contentMarkdown = `# ${link.targetTitleRaw}\n\nCreated from broken link.`;
  const contentText = markdownToPlainText(contentMarkdown);

  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        workspaceId: link.workspaceId,
        title: link.targetTitleRaw,
        slug,
        path: `/${slug}`,
        contentMarkdown,
        contentText,
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });

    await tx.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        title: document.title,
        contentMarkdown: document.contentMarkdown,
        createdById: input.actorId,
        changeSummary: "Created from broken wiki link",
      },
    });

    await repairBrokenLinksForTarget(tx, {
      workspaceId: link.workspaceId,
      targetDocumentId: document.id,
      targetTitle: link.targetTitleRaw,
    });

    await writeAuditLog(tx, {
      organizationId: link.workspace.organizationId,
      actorId: input.actorId,
      action: "document.created_from_broken_link",
      resourceType: "document",
      resourceId: document.id,
      metadata: { title: document.title, repairedLinkId: link.id },
    });

    return document;
  });
}
```

- [ ] **Step 6: Run tests**

Run: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/reconcile.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/documents/types.ts lib/documents/service.ts lib/wiki-links/reconcile.ts tests/wiki-links/reconcile.test.ts
git commit -m "feat: create documents from broken wiki links"
```

## Task 4: Link Panels In Workspace UI

**Files:**
- Modify: `app/workspaces/[workspaceSlug]/actions.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `components/metadata-panel.tsx`

- [ ] **Step 1: Add server action for broken links**

Modify `app/workspaces/[workspaceSlug]/actions.ts`.

Import:

```ts
import { revalidatePath } from "next/cache";
import { createDocumentFromBrokenLink } from "@/lib/documents/service";
```

Add:

```ts
export async function createDocumentFromBrokenLinkAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const document = await createDocumentFromBrokenLink({
    actorId: user.id,
    linkId: String(formData.get("linkId")),
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  redirect(`/workspaces/${workspaceSlug}?document=${document.id}`);
}
```

- [ ] **Step 2: Load link panels on workspace page**

Modify `app/workspaces/[workspaceSlug]/page.tsx`.

Import:

```ts
import { getDocumentLinkPanels } from "@/lib/wiki-links/service";
import { createDocumentFromBrokenLinkAction } from "./actions";
```

After loading `auditLogs`, add:

```ts
  const linkPanels = selectedDocument
    ? await getDocumentLinkPanels(selectedDocument.id, user.id)
    : { outgoing: [], backlinks: [], brokenLinks: [] };
```

Before return:

```ts
  const createFromBrokenLinkAction = createDocumentFromBrokenLinkAction.bind(null, workspaceSlug);
```

Replace right prop:

```tsx
      right={
        <MetadataPanel
          versions={versions}
          auditLogs={auditLogs}
          linkPanels={linkPanels}
          canWrite={canWrite}
          createFromBrokenLinkAction={createFromBrokenLinkAction}
        />
      }
```

- [ ] **Step 3: Render outgoing, backlinks, and broken links**

Modify `components/metadata-panel.tsx`:

```tsx
import type { AuditLog, DocumentVersion } from "@prisma/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { DocumentLinkPanels } from "@/lib/wiki-links/types";

export function MetadataPanel({
  versions,
  auditLogs,
  linkPanels,
  canWrite,
  createFromBrokenLinkAction,
}: {
  versions: DocumentVersion[];
  auditLogs: AuditLog[];
  linkPanels: DocumentLinkPanels;
  canWrite: boolean;
  createFromBrokenLinkAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold">Links</h2>
        <div className="mt-2 space-y-3 text-sm">
          <div>
            <p className="font-medium text-slate-700">Outgoing</p>
            <ul className="mt-1 space-y-1 text-slate-600">
              {linkPanels.outgoing.length === 0 ? <li>No outgoing links</li> : null}
              {linkPanels.outgoing.map((link) => (
                <li key={link.id}>
                  {link.targetDocument ? (
                    <Link className="underline" href={`?document=${link.targetDocument.id}`}>
                      {link.targetTitleRaw}
                    </Link>
                  ) : (
                    <span>{link.targetTitleRaw}</span>
                  )}
                  {link.isBroken ? <span className="ml-1 text-red-600">broken</span> : null}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-700">Backlinks</p>
            <ul className="mt-1 space-y-1 text-slate-600">
              {linkPanels.backlinks.length === 0 ? <li>No backlinks</li> : null}
              {linkPanels.backlinks.map((backlink) => (
                <li key={backlink.id}>
                  <Link className="underline" href={`?document=${backlink.sourceDocument.id}`}>
                    {backlink.sourceDocument.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-700">Broken links</p>
            <ul className="mt-1 space-y-2 text-slate-600">
              {linkPanels.brokenLinks.length === 0 ? <li>No broken links</li> : null}
              {linkPanels.brokenLinks.map((link) => (
                <li key={link.id} className="flex items-center justify-between gap-2">
                  <span>{link.targetTitleRaw}</span>
                  <form action={createFromBrokenLinkAction}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <Button type="submit" disabled={!canWrite} className="px-2 py-1 text-xs">
                      Create
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold">Properties</h2>
        <p className="mt-2 text-sm text-slate-500">
          Owner, status, and review fields will appear here.
        </p>
      </section>
      <section>
        <h2 className="text-sm font-semibold">Versions</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-600">
          {versions.map((version) => (
            <li key={version.id}>
              v{version.versionNumber}: {version.changeSummary}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-semibold">Audit log</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-600">
          {auditLogs.map((log) => (
            <li key={log.id}>{log.action}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run type/build check**

Run: `pnpm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/workspaces/[workspaceSlug]/actions.ts app/workspaces/[workspaceSlug]/page.tsx components/metadata-panel.tsx
git commit -m "feat: show wiki link panels"
```

## Task 5: Seed Linked Documents And Verify

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Update seed with visible links**

At the top of `prisma/seed.ts`, import:

```ts
import { reconcileDocumentLinks } from "../lib/wiki-links/reconcile";
```

Replace the existing Welcome document upsert with these two upserts:

```ts
const welcome = await prisma.document.upsert({
  where: { workspaceId_slug: { workspaceId: workspace.id, slug: "welcome" } },
  update: {
    contentMarkdown: "# Welcome\n\nThis is the first company handbook document.\n\nRead [[Engineering Runbook]] and [[Missing Policy]].",
    contentText: "Welcome This is the first company handbook document. Read Engineering Runbook and Missing Policy.",
  },
  create: {
    workspaceId: workspace.id,
    title: "Welcome",
    slug: "welcome",
    path: "/welcome",
    contentMarkdown: "# Welcome\n\nThis is the first company handbook document.\n\nRead [[Engineering Runbook]] and [[Missing Policy]].",
    contentText: "Welcome This is the first company handbook document. Read Engineering Runbook and Missing Policy.",
    createdById: owner.id,
    updatedById: owner.id,
  },
});

const engineeringRunbook = await prisma.document.upsert({
  where: { workspaceId_slug: { workspaceId: workspace.id, slug: "engineering-runbook" } },
  update: {
    contentMarkdown: "# Engineering Runbook\n\nBacklinked from [[Welcome]].",
    contentText: "Engineering Runbook Backlinked from Welcome.",
  },
  create: {
    workspaceId: workspace.id,
    title: "Engineering Runbook",
    slug: "engineering-runbook",
    path: "/engineering-runbook",
    contentMarkdown: "# Engineering Runbook\n\nBacklinked from [[Welcome]].",
    contentText: "Engineering Runbook Backlinked from Welcome.",
    createdById: owner.id,
    updatedById: owner.id,
  },
});
```

After both upserts:

```ts
await prisma.$transaction(async (tx) => {
  await reconcileDocumentLinks(tx, {
    workspaceId: workspace.id,
    sourceDocumentId: welcome.id,
    contentMarkdown: welcome.contentMarkdown,
  });
  await reconcileDocumentLinks(tx, {
    workspaceId: workspace.id,
    sourceDocumentId: engineeringRunbook.id,
    contentMarkdown: engineeringRunbook.contentMarkdown,
  });
});
```

- [ ] **Step 2: Run seed**

Run: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm run db:seed`

Expected: Seed succeeds.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm exec vitest run tests/wiki-links/parser.test.ts tests/wiki-links/reconcile.test.ts
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm test
pnpm wiki:find "wiki link"
pnpm wiki:lint
```

Expected:

- wiki-link tests pass.
- full test suite passes.
- `wiki:find "wiki link"` either returns existing wiki pages or prints `wiki miss, use rg next`.
- `wiki:lint` exits 0.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore: seed wiki link examples"
```

## Spec Coverage Review

- PRD Phase 2 wiki link parsing: Task 1 parses `[[...]]` syntax.
- PRD Phase 2 document_links table: Task 2 adds `DocumentLink`.
- Backlinks and outgoing links: Task 2 service and Task 4 UI expose both.
- Broken links: Task 2 marks broken links, Task 3 creates missing targets.
- Permissions: Task 2 read checks and Task 3 write checks enforce workspace role.
- Markdown editor upgrade: intentionally out of scope; current textarea remains.
- Graph view: intentionally out of scope; link table provides later graph input.

No required item in this scoped slice is intentionally omitted.
