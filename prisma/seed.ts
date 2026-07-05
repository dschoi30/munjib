import { PrismaClient, WorkspaceRole } from "@prisma/client";
import { hashPassword } from "../lib/auth/passwords";
import {
  backfillLaunchMembershipsForAllWorkspaces,
  ensureWorkspaceLaunchMemberships,
  launchAccountSeeds,
} from "../lib/workspaces/membership-bootstrap";
import { reconcileDocumentLinks } from "../lib/wiki-links/reconcile";

const prisma = new PrismaClient();

const launchAccountPasswords = {
  "mjadmin@munjib.com": "mjadmin",
  "mjtrial@munjib.com": "mjtrial",
} as const satisfies Record<(typeof launchAccountSeeds)[number]["email"], string>;

async function main() {
  for (const account of launchAccountSeeds) {
    const existingUser = await prisma.user.findUnique({
      where: { email: account.email },
      select: { passwordHash: true },
    });
    const passwordHash =
      existingUser?.passwordHash ?? (await hashPassword(launchAccountPasswords[account.email]));
    const emailVerified = new Date();

    await prisma.user.upsert({
      where: { email: account.email },
      update: {
        name: account.name,
        emailVerified,
        ...(existingUser?.passwordHash ? {} : { passwordHash }),
      },
      create: {
        email: account.email,
        name: account.name,
        passwordHash,
        emailVerified,
      },
    });
  }

  const owner = await prisma.user.upsert({
    where: { email: "owner@example.com" },
    update: {},
    create: { email: "owner@example.com", name: "Owner User" },
  });

  const editor = await prisma.user.upsert({
    where: { email: "editor@example.com" },
    update: {},
    create: { email: "editor@example.com", name: "Editor User" },
  });

  const viewer = await prisma.user.upsert({
    where: { email: "viewer@example.com" },
    update: {},
    create: { email: "viewer@example.com", name: "Viewer User" },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "acme" },
    update: {},
    create: { name: "Acme", slug: "acme" },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: owner.id } },
    update: { role: "OWNER" },
    create: { organizationId: organization.id, userId: owner.id, role: "OWNER" },
  });

  const workspace = await prisma.workspace.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug: "company-handbook" } },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Company Handbook",
      slug: "company-handbook",
    },
  });

  for (const [user, role] of [
    [editor, WorkspaceRole.EDITOR],
    [viewer, WorkspaceRole.VIEWER],
  ] as const) {
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      update: { role },
      create: { workspaceId: workspace.id, userId: user.id, role },
    });
  }

  await ensureWorkspaceLaunchMemberships(prisma, workspace.id, {
    userId: owner.id,
    role: WorkspaceRole.OWNER,
  });
  await backfillLaunchMembershipsForAllWorkspaces(prisma);

  const welcome = await prisma.document.upsert({
    where: { workspaceId_path: { workspaceId: workspace.id, path: "/welcome" } },
    update: {
      folderId: null,
      title: "Welcome",
      slug: "welcome",
      status: "ACTIVE",
      contentMarkdown:
        "# Welcome\n\nThis is the first company handbook document.\n\nRead [[Engineering Runbook]] and [[Missing Policy]].",
      contentText:
        "Welcome This is the first company handbook document. Read Engineering Runbook and Missing Policy.",
    },
    create: {
      workspaceId: workspace.id,
      title: "Welcome",
      slug: "welcome",
      path: "/welcome",
      contentMarkdown:
        "# Welcome\n\nThis is the first company handbook document.\n\nRead [[Engineering Runbook]] and [[Missing Policy]].",
      contentText:
        "Welcome This is the first company handbook document. Read Engineering Runbook and Missing Policy.",
      createdById: owner.id,
      updatedById: owner.id,
    },
  });

  const engineeringRunbook = await prisma.document.upsert({
    where: { workspaceId_path: { workspaceId: workspace.id, path: "/engineering-runbook" } },
    update: {
      folderId: null,
      title: "Engineering Runbook",
      slug: "engineering-runbook",
      status: "ACTIVE",
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

  const operationsFolder = await prisma.folder.upsert({
    where: { workspaceId_path: { workspaceId: workspace.id, path: "/operations" } },
    update: { status: "ACTIVE" },
    create: {
      workspaceId: workspace.id,
      name: "Operations",
      slug: "operations",
      path: "/operations",
      createdById: owner.id,
      updatedById: owner.id,
    },
  });

  const operationsRunbook = await prisma.document.upsert({
    where: { workspaceId_path: { workspaceId: workspace.id, path: "/operations/operations-runbook" } },
    update: {
      folderId: operationsFolder.id,
      title: "Operations Runbook",
      slug: "operations-runbook",
      status: "ACTIVE",
      contentMarkdown: "# Operations Runbook\n\nA folder-based runbook linked from [[Welcome]].",
      contentText: "Operations Runbook A folder-based runbook linked from Welcome.",
    },
    create: {
      workspaceId: workspace.id,
      folderId: operationsFolder.id,
      title: "Operations Runbook",
      slug: "operations-runbook",
      path: "/operations/operations-runbook",
      contentMarkdown: "# Operations Runbook\n\nA folder-based runbook linked from [[Welcome]].",
      contentText: "Operations Runbook A folder-based runbook linked from Welcome.",
      createdById: owner.id,
      updatedById: owner.id,
    },
  });

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
    await reconcileDocumentLinks(tx, {
      workspaceId: workspace.id,
      sourceDocumentId: operationsRunbook.id,
      contentMarkdown: operationsRunbook.contentMarkdown,
    });
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
