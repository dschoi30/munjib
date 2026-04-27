import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export async function resetTestData() {
  await prisma.auditLog.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.document.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}

export async function seedWorkspaceFixture(role: WorkspaceRole) {
  const user = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}@example.com`,
      name: `${role} User`,
    },
  });

  const organization = await prisma.organization.create({
    data: {
      name: "Test Org",
      slug: `test-org-${Date.now()}`,
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      organizationId: organization.id,
      name: "Test Workspace",
      slug: `test-workspace-${Date.now()}`,
    },
  });

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role,
    },
  });

  return { user, organization, workspace };
}
