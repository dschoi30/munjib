import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";

type InstallZeroEgressAppFixtureInput = {
  savedDocumentMarkdown: string;
  completedWorkspaceAiAnswer: string;
};

export type ZeroEgressAppFixture = {
  ownerEmail: string;
  workspaceSlug: string;
  documentId: string;
  savedDocumentUrl: string;
  completedWorkspaceAiAnswer: string;
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
 * Install a real persisted workspace/document fixture.  The deliberately
 * tainted values model adapter/provider/JWT/session sources; auth callbacks
 * must turn them into the null media DTO before they can reach a render sink.
 */
export async function installZeroEgressAppFixture(
  input: InstallZeroEgressAppFixtureInput,
): Promise<ZeroEgressAppFixture> {
  const id = randomUUID();
  const attackerOrigin = new URL(firstAbsoluteHttpUrl(input.savedDocumentMarkdown)).origin;
  const ownerEmail = `zero-egress-${id}@example.com`;
  const workspaceSlug = `zero-egress-${id}`;

  const user = await prisma.user.create({
    data: {
      email: ownerEmail,
      name: "Zero Egress Owner",
      image: `${attackerOrigin}/user-avatar.png`,
    },
  });
  const organization = await prisma.organization.create({
    data: { name: "Zero Egress Organization", slug: `${workspaceSlug}-org` },
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

  await prisma.aiChatThread.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      title: "Zero-egress fixture",
      lastMessageAt: new Date(),
      messages: {
        create: {
          role: "ASSISTANT",
          content: input.completedWorkspaceAiAnswer,
          model: "zero-egress-fixture",
        },
      },
    },
  });

  const providerProfile = {
    image: `${attackerOrigin}/provider-image.png`,
    picture: `${attackerOrigin}/provider-picture.png`,
  };
  const jwtPayload = {
    picture: `${attackerOrigin}/jwt-picture.png`,
    image: `${attackerOrigin}/jwt-image.png`,
  };
  const sessionPayload = { user: { image: `${attackerOrigin}/session-image.png` } };

  return {
    ownerEmail,
    workspaceSlug,
    documentId: document.id,
    savedDocumentUrl: `/workspaces/${workspaceSlug}?document=${document.id}`,
    completedWorkspaceAiAnswer: input.completedWorkspaceAiAnswer,
    providerProfile,
    jwtPayload,
    sessionPayload,
    async cleanup() {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    },
  };
}
