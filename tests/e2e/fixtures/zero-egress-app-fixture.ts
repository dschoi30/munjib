import { randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/auth/passwords";
import { prisma } from "@/lib/db/client";

type InstallZeroEgressAppFixtureInput = {
  savedDocumentMarkdown: string;
};

export type ZeroEgressAppFixture = {
  ownerEmail: string;
  ownerPassword: string;
  workspaceSlug: string;
  documentId: string;
  savedDocumentUrl: string;
  providerProfile: { image: string; picture: string };
  jwtPayload: { picture: string; image: string };
  sessionPayload: { user: { image: string } };
  cleanup(): Promise<void>;
};

function firstAbsoluteHttpUrl(markdown: string) {
  const match = markdown.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? "https://attacker.example/fixture.png";
}

/**
 * Install only durable workspace/document state. The AI answer is intentionally
 * not seeded: the browser test signs in this password user and drives the real
 * Workspace AI route through the test-only local provider transport.
 */
export async function installZeroEgressAppFixture(
  input: InstallZeroEgressAppFixtureInput,
): Promise<ZeroEgressAppFixture> {
  const id = randomUUID();
  const attackerOrigin = new URL(firstAbsoluteHttpUrl(input.savedDocumentMarkdown)).origin;
  const ownerEmail = "zero-egress-" + id + "@example.com";
  const ownerPassword = "zero-egress-password";
  const workspaceSlug = "zero-egress-" + id;

  const user = await prisma.user.create({
    data: {
      email: ownerEmail,
      name: "Zero Egress Owner",
      image: attackerOrigin + "/user-avatar.png",
      passwordHash: await hashPassword(ownerPassword),
    },
  });
  const organization = await prisma.organization.create({
    data: { name: "Zero Egress Organization", slug: workspaceSlug + "-org" },
  });
  const workspace = await prisma.workspace.create({
    data: {
      organizationId: organization.id,
      name: "Zero Egress Workspace",
      slug: workspaceSlug,
    },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
  });

  const document = await prisma.document.create({
    data: {
      workspaceId: workspace.id,
      title: "Egress check",
      slug: "egress-check",
      path: "/egress-check",
      contentMarkdown: input.savedDocumentMarkdown,
      contentText: input.savedDocumentMarkdown,
      createdById: user.id,
      updatedById: user.id,
    },
  });

  const providerProfile = {
    image: attackerOrigin + "/provider-image.png",
    picture: attackerOrigin + "/provider-picture.png",
  };
  const jwtPayload = {
    picture: attackerOrigin + "/jwt-picture.png",
    image: attackerOrigin + "/jwt-image.png",
  };
  const sessionPayload = { user: { image: attackerOrigin + "/session-image.png" } };

  return {
    ownerEmail,
    ownerPassword,
    workspaceSlug,
    documentId: document.id,
    savedDocumentUrl: "/workspaces/" + workspaceSlug + "?document=" + document.id,
    providerProfile,
    jwtPayload,
    sessionPayload,
    async cleanup() {
      await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    },
  };
}
