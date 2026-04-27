import { WorkspaceRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";

export async function resetTestData() {
  await prisma.organization.deleteMany({
    where: { slug: { startsWith: "test-org-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: "test-" } },
  });
}

export async function seedWorkspaceFixture(role: WorkspaceRole) {
  const id = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `test-${role.toLowerCase()}-${id}@example.com`,
      name: `${role} User`,
    },
  });

  const organization = await prisma.organization.create({
    data: {
      name: "Test Org",
      slug: `test-org-${id}`,
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      organizationId: organization.id,
      name: "Test Workspace",
      slug: `test-workspace-${id}`,
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
