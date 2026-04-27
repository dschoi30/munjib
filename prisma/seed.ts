import { PrismaClient, WorkspaceRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
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
    [owner, WorkspaceRole.OWNER],
    [editor, WorkspaceRole.EDITOR],
    [viewer, WorkspaceRole.VIEWER],
  ] as const) {
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      update: { role },
      create: { workspaceId: workspace.id, userId: user.id, role },
    });
  }

  await prisma.document.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: "welcome" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      title: "Welcome",
      slug: "welcome",
      path: "/welcome",
      contentMarkdown: "# Welcome\n\nThis is the first company handbook document.",
      contentText: "Welcome This is the first company handbook document.",
      createdById: owner.id,
      updatedById: owner.id,
    },
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
