import { beforeEach, describe, expect, it, vi } from "vitest";

const { findWorkspace, findMembership, findPermissions } = vi.hoisted(() => ({
  findWorkspace: vi.fn(),
  findMembership: vi.fn(),
  findPermissions: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    workspace: { findFirst: findWorkspace },
    workspaceMember: { findFirst: findMembership },
    permission: { findMany: findPermissions },
  },
}));

import { prepareAskDocumentQuestion } from "@/lib/rag/ask";

describe("Ask preparation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes an explicitly restricted active document for anonymous Trial without reading USER grants", async () => {
    findWorkspace.mockResolvedValue({
      id: "workspace-demo-1",
      slug: "public-demo",
      documents: [{
        id: "document-1",
        title: "Restricted",
        path: "/restricted",
        contentMarkdown: "private",
      }],
    });
    findPermissions.mockResolvedValue([{ resourceId: "document-1" }]);

    await expect(prepareAskDocumentQuestion({
      workspaceSlug: "public-demo",
      documentId: "document-1",
      question: "Can I read this?",
      authorizationPrincipal: anonymousPrincipal(),
    })).rejects.toThrow("DOCUMENT_NOT_FOUND");

    expect(findWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "workspace-demo-1", slug: "public-demo" }),
    }));
    expect(findPermissions).toHaveBeenCalledTimes(1);
    expect(findPermissions).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ subjectType: "USER" }),
    }));
    expect(findMembership).not.toHaveBeenCalled();
  });

  it("keeps authenticated duplicate-slug lookup scoped by membership", async () => {
    findWorkspace.mockResolvedValue(null);

    await expect(prepareAskDocumentQuestion({
      workspaceSlug: "shared-slug",
      documentId: "document-1",
      question: "Can I read this?",
      authorizationPrincipal: { kind: "user", userId: "user-1" },
    })).rejects.toThrow("WORKSPACE_NOT_FOUND");

    expect(findWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        slug: "shared-slug",
        members: { some: { userId: "user-1" } },
      }),
    }));
  });
});

function anonymousPrincipal() {
  return {
    kind: "anonymous-trial-demo" as const,
    capabilityId: "anonymous-trial-v1" as const,
    workspaceId: "workspace-demo-1",
    workspaceSlug: "public-demo",
    access: "viewer-only" as const,
    trialVisitorSubject: "visitor-1",
  };
}
