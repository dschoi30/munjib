// @vitest-environment jsdom
import React from "react";
import { cleanup, render as testingRender, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));
vi.mock("@/lib/auth/trial-entitlement", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/trial-entitlement")>();
  return {
    ...original,
    resolveAnonymousTrialCapability: vi.fn(() => ({ capabilityId: "anonymous-trial-v1" })),
    resolveAnonymousTrialActor: vi.fn(() => ({
      admissionActor: { kind: "anonymous-trial", trialVisitorSubject: "opaque-subject" },
      authorizationPrincipal: {
        kind: "anonymous-trial-demo",
        capabilityId: "anonymous-trial-v1",
        workspaceId: "workspace-demo-1",
        workspaceSlug: "company-handbook",
        access: "viewer-only",
        trialVisitorSubject: "opaque-subject",
      },
      networkBucketDigest: "opaque-network",
      kstDate: "2026-08-25",
    })),
    resolveTrialEntitlement: vi.fn(async () => ({
      status: 200,
      body: {
        remaining: 2,
        limit: 3,
        resetsAt: "2099-08-25T15:00:00.000Z",
        entry: { path: "/trial/workspaces/company-handbook" },
      },
    })),
  };
});
vi.mock("@/lib/workspaces/trial-viewer", () => ({
  loadTrialWorkspaceViewer: vi.fn(async () => ({
    slug: "company-handbook",
    name: "Company Handbook",
    documents: [
      { id: "doc-open", title: "Welcome", contentMarkdown: "Hello", status: "ACTIVE" },
    ],
  })),
}));
vi.mock("@/lib/rag/model-config", () => ({
  getDefaultRagChatProvider: () => "openai-compatible",
  getDefaultRagChatModel: () => "server/owned-model",
  getRagChatProviderAvailability: () => ({ ollama: true, openai: true, "openai-compatible": true }),
}));

afterEach(cleanup);

describe("Trial workspace page", () => {
  it("renders Ask AI for the selected allowed document with server-projected allowance", async () => {
    const { default: TrialWorkspacePage } = await import("@/app/trial/workspaces/[workspaceSlug]/page");
    const page = await TrialWorkspacePage({
      params: Promise.resolve({ workspaceSlug: "company-handbook" }),
      searchParams: Promise.resolve({ document: "doc-open" }),
    });

    testingRender(<I18nProvider>{page}</I18nProvider>);

    expect(screen.getByRole("region", { name: "AI assistant" })).toBeTruthy();
    expect(screen.getAllByText("2 of 3 trial AI uses remaining today").length).toBeGreaterThan(0);
    expect(screen.getAllByText("server/owned-model").length).toBeGreaterThan(0);
  });
});
