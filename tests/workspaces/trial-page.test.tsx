// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render as testingRender, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({push:vi.fn(),replace:vi.fn(),refresh:vi.fn()}), useSearchParams: () => new URLSearchParams(), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));
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
vi.mock("@/lib/workspaces/trial-viewer", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspaces/trial-viewer")>(),
  loadTrialDocumentDetails: vi.fn(async () => ({versions:[],attachments:[],properties:[],tags:[],comments:[],auditLogs:[]})),
  loadTrialWorkspaceViewer: vi.fn(async () => ({
    id:"workspace-demo-1", folders:[], links:[],
    slug: "company-handbook",
    name: "Company Handbook",
    documents: [
      { id: "doc-open", title: "Welcome", slug:"welcome",path:"/welcome",contentText:"Hello",folderId:null,updatedAt:new Date(),contentMarkdown: "Hello", status: "ACTIVE" },
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

    expect(screen.getByRole("button", { name: "Graph" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    expect((screen.getByLabelText("Document title") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Open AI assistant" }));
    expect(screen.getByRole("region", { name: "AI assistant" })).toBeTruthy();
    expect(screen.getAllByText("2 of 3 trial AI uses remaining today").length).toBeGreaterThan(0);
    expect(screen.getAllByText("server/owned-model").length).toBeGreaterThan(0);
  });
});


it("rejects Trial mutation actions without consulting an authenticated account", async () => {
  const { rejectTrialMutation } = await import("@/app/trial/workspaces/[workspaceSlug]/actions");
  await expect(rejectTrialMutation(new FormData())).rejects.toThrow("TRIAL_READ_ONLY");
});

it("opens the first readable document on a fresh Trial entry", async () => {
  const { default: Page } = await import("@/app/trial/workspaces/[workspaceSlug]/page");
  const page = await Page({params:Promise.resolve({workspaceSlug:"company-handbook"}),searchParams:Promise.resolve({})});
  testingRender(<I18nProvider>{page}</I18nProvider>);
  expect((screen.getByLabelText("Document title") as HTMLInputElement).value).toBe("Welcome");
});
it("does not substitute the first document for an invalid explicit ID", async () => {
  const { default: Page } = await import("@/app/trial/workspaces/[workspaceSlug]/page");
  await expect(Page({params:Promise.resolve({workspaceSlug:"company-handbook"}),searchParams:Promise.resolve({document:"missing"})})).rejects.toThrow("NOT_FOUND");
});
