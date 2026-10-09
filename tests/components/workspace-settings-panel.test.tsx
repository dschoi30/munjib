// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { WorkspaceSettingsPanel } from "@/components/workspace-settings-panel";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import type { ArchivedDocumentRetentionPolicyValue } from "@/lib/workspaces/retention-policy";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false }) }));
  router.refresh.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSettingsPanel(
  props: Partial<React.ComponentProps<typeof WorkspaceSettingsPanel>> = {},
) {
  const defaultProps: React.ComponentProps<typeof WorkspaceSettingsPanel> = {
    canWrite: true,
    defaultChatModel: "gemma4:e4b",
    defaultChatProvider: "openai-compatible",
    availableChatProviders: {
      ollama: true,
      openai: true,
      "openai-compatible": true,
    },
    folders: [
      {
        id: "folder-engineering",
        path: "/engineering",
        displayPath: "Engineering",
      },
      {
        id: "folder-runbooks",
        path: "/engineering/runbooks",
        displayPath: "Engineering / Runbooks",
      },
    ],
    canManageWorkspace: true,
    workspaceName: "Company Handbook",
    renameWorkspaceAction: async (formData: FormData) => ({
      workspaceName: String(formData.get("name") ?? ""),
    }),
    archiveWorkspaceAction: async () => ({ error: undefined }),
    importMarkdownAction: async () => ({
      documentIds: ["doc-imported"],
      imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
      failed: [],
    }),
    archivedDocumentRetentionPolicy: "DAYS_30" as ArchivedDocumentRetentionPolicyValue,
    updateRetentionPolicyAction: async (formData: FormData) => ({
      archivedDocumentRetentionPolicy: String(
        formData.get("archivedDocumentRetentionPolicy"),
      ) as ArchivedDocumentRetentionPolicyValue,
    }),
    onClose: () => {},
    workspaceSlug: "company-handbook",
  };

  return render(
    <I18nProvider>
      <WorkspaceSettingsPanel {...defaultProps} {...props} />
    </I18nProvider>,
  );
}

describe("WorkspaceSettingsPanel", () => {
  it("checks only in the AI tab, then rechecks a saved model and tab reopen", async () => {
    renderSettingsPanel();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    await screen.findByText("Could not connect");
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Use OpenRouter Fusion" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)).toEqual({
      chatProvider: "openai-compatible", chatModel: "openrouter/fusion",
    });
    fireEvent.click(screen.getByRole("button", { name: "Workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  });

  it("opens to workspace management before import settings", () => {
    renderSettingsPanel();

    expect(screen.getByRole("heading", { name: "Workspace" })).toBeTruthy();
    const nameInput = screen.getByRole("textbox", {
      name: "Workspace name",
    }) as HTMLInputElement;
    expect(nameInput.value).toBe("Company Handbook");

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(screen.getByRole("heading", { name: "Import your contents" })).toBeTruthy();
  });

  it("submits workspace rename from the workspace section", async () => {
    const renameWorkspaceAction = vi.fn(async (formData: FormData) => ({
      workspaceName: String(formData.get("name") ?? ""),
    }));
    renderSettingsPanel({ renameWorkspaceAction });

    fireEvent.change(screen.getByRole("textbox", { name: "Workspace name" }), {
      target: { value: "Launch HQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save workspace name" }));

    await waitFor(() => {
      expect(renameWorkspaceAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = renameWorkspaceAction.mock.calls[0][0];
    expect(submittedFormData.get("name")).toBe("Launch HQ");
  });

  it("shows the last-workspace archive guard in the workspace section", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const archiveWorkspaceAction = vi.fn(async () => ({
      error: SERVICE_ERROR_CODES.WORKSPACE_ARCHIVE_LAST_ACTIVE,
    }));
    renderSettingsPanel({ archiveWorkspaceAction });

    fireEvent.click(screen.getByRole("button", { name: "Archive workspace" }));

    await waitFor(() => {
      expect(archiveWorkspaceAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    expect(
      await screen.findByText("You need another active workspace before archiving this one."),
    ).toBeTruthy();
  });

  it("does not archive the workspace when confirmation is cancelled", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const archiveWorkspaceAction = vi.fn(async () => ({ error: undefined }));
    renderSettingsPanel({ archiveWorkspaceAction });

    fireEvent.click(screen.getByRole("button", { name: "Archive workspace" }));

    expect(confirm).toHaveBeenCalledWith("Archive this workspace?");
    expect(archiveWorkspaceAction).not.toHaveBeenCalled();
  });

  it("hides chat providers that are unavailable in server env", () => {
    window.localStorage.setItem(
      "munjib:rag-chat-model:company-handbook",
      JSON.stringify({
        chatProvider: "openai-compatible",
        chatModel: "google/gemma-4-31b-it:free",
      }),
    );

    renderSettingsPanel({
      defaultChatProvider: "ollama",
      availableChatProviders: {
        ollama: true,
        openai: false,
        "openai-compatible": false,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    const providerSelect = screen.getByRole("combobox", { name: "AI provider" });
    expect(within(providerSelect).getByRole("option", { name: "Ollama" })).toBeTruthy();
    expect(within(providerSelect).queryByRole("option", { name: "OpenAI" })).toBeNull();
    expect(
      within(providerSelect).queryByRole("option", {
        name: "OpenRouter / OpenAI-compatible",
      }),
    ).toBeNull();
    expect(screen.getByText("Server default")).toBeTruthy();
    expect(screen.getAllByText("gemma4:e4b").length).toBeGreaterThan(0);
    expect(screen.queryByText("Google Gemma 4 31B IT Free")).toBeNull();
  });

  it("uses folder display paths in the import destination picker and progress", async () => {
    const importMarkdownAction = vi.fn(async () => ({
      documentIds: ["doc-imported"],
      imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
      failed: [],
    }));
    renderSettingsPanel({ importMarkdownAction });

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.click(screen.getByRole("button", { name: "Import destination: /" }));

    expect(screen.getByRole("treeitem", { name: "Engineering" })).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: "Engineering / Runbooks" })).toBeTruthy();

    fireEvent.click(screen.getByRole("treeitem", { name: "Engineering / Runbooks" }));

    const selectedDestinationButton = screen.getByRole("button", {
      name: "Import destination: Engineering / Runbooks",
    });
    expect(selectedDestinationButton.textContent).toBe("Engineering / Runbooks");

    const importedFile = new File(["# Imported"], "imported.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [importedFile],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.get("folderId")).toBe("folder-runbooks");
    expect(await screen.findByText("Destination: Engineering / Runbooks")).toBeTruthy();
  });

  it("uses Honen surface and primary tokens across settings controls", () => {
    renderSettingsPanel();

    const dialog = screen.getByRole("dialog", { name: "Workspace settings" });
    expect(dialog.className).toContain("border-border");
    expect(dialog.className).toContain("bg-surface");
    expect(dialog.className).not.toContain("border-slate-200");
    expect(dialog.className).not.toContain("bg-white");

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    const importDropzone = screen.getByRole("button", { name: /Markdown files/ });
    expect(importDropzone.className).toContain("border-primary");
    expect(importDropzone.className).toContain("bg-primary-muted");
    expect(importDropzone.className).not.toContain("bg-primary-muted/70");
    expect(importDropzone.className).not.toContain("sky");

    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    const providerSelect = screen.getByRole("combobox", { name: "AI provider" });
    expect(providerSelect.className).toContain("border-border");
    expect(providerSelect.className).toContain("bg-surface-control");
    expect(providerSelect.className).toContain("focus:border-primary");
    expect(providerSelect.className).not.toContain("sky");

    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    const appliedLanguageCard = screen.getAllByText("English")[0].closest("label");
    const currentBadge = screen.getByText("Current");
    expect(appliedLanguageCard?.className).toContain("ring-primary-muted-hover");
    expect(currentBadge.className).toContain("bg-primary-muted");
    expect(currentBadge.className).toContain("text-primary");
    expect(currentBadge.className).not.toContain("sky");
  });
});
