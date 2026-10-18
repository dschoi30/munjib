// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { useSplitWorkspace } from "@/components/split-workspace-session";
import { SplitWorkspaceProvider, SplitWorkspaceCenter } from "@/components/split-workspace";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
afterEach(cleanup);
it("offers nested split controls after restoring a user's open tabs", async () => {
  function DirtySession() {
    const session = useSplitWorkspace();
    session.dirty.current.add("dirty-document");
    return <SplitWorkspaceCenter />;
  }
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { unmount } = render(<I18nProvider><SplitWorkspaceProvider userId="user" workspaceId="workspace" workspaceSlug="wiki"
    documents={[]} selectedDocumentId={null} initialDetail={null} specialView={false}
    editorProps={{ workspaceSlug: "wiki", defaultChatModel: "test", defaultChatProvider: "ollama",
      availableChatProviders: { ollama: true, openai: false, "openai-compatible": false }, linkCandidates: [], action: async () => {}, uploadAttachmentAction: async () => {},
      pasteImageAttachmentAction: async () => ({ markdown: "" }), createCommentAction: async () => {}, createFromBrokenLinkAction: async () => {} }}
    restoreVersionAction={async () => {}}><DirtySession /></SplitWorkspaceProvider></I18nProvider>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Add tab" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Add tab" }));
  expect(screen.getByRole("button", { name: "Pane actions" })).toBeTruthy();
  expect(window.dispatchEvent(new Event("munjib:before-sign-out", { cancelable: true }))).toBe(false);
  expect(confirm).toHaveBeenCalledOnce();
  unmount();
  expect(window.dispatchEvent(new Event("munjib:before-sign-out", { cancelable: true }))).toBe(true);
  expect(confirm).toHaveBeenCalledOnce();
  confirm.mockRestore();
});

it("restores nested panes and merges their tabs without dropping a document", async () => {
  const { createLayout, openDocument, getPanes, moveTab, layoutStorageKey } = await import("@/lib/workspace-layout");
  let layout = createLayout("a");
  layout = openDocument(layout, "b");
  layout = moveTab(layout, getPanes(layout)[0].activeTabId!, layout.activePaneId, "right");
  layout = openDocument(layout, "c");
  layout = moveTab(layout, getPanes(layout)[1].activeTabId!, layout.activePaneId, "bottom");
  const stored = new Map([[layoutStorageKey("nested-user", "workspace"), JSON.stringify(layout)]]);
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
  } });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const id = url.split("/").at(-2)!;
    return { ok: true, status: 200, json: async () => ({ document: { id, title: id.toUpperCase(), path: `/${id}`, contentMarkdown: "" },
      canWrite: true, versions: [], attachments: [], auditLogs: [], tags: [], properties: [], comments: [],
      linkPanels: { outgoing: [], backlinks: [], brokenLinks: [], ambiguousLinks: [] } }) };
  }));
  render(<I18nProvider><SplitWorkspaceProvider userId="nested-user" workspaceId="workspace" workspaceSlug="wiki"
    documents={["a", "b", "c"].map(id => ({ id, title: id.toUpperCase(), path: `/${id}` }))}
    selectedDocumentId={null} initialDetail={null} specialView={false}
    editorProps={{ workspaceSlug: "wiki", defaultChatModel: "test", defaultChatProvider: "ollama",
      availableChatProviders: { ollama: true, openai: false, "openai-compatible": false }, linkCandidates: [], action: async () => {}, uploadAttachmentAction: async () => {},
      pasteImageAttachmentAction: async () => ({ markdown: "" }), createCommentAction: async () => {}, createFromBrokenLinkAction: async () => {} }}
    restoreVersionAction={async () => {}}><SplitWorkspaceCenter /></SplitWorkspaceProvider></I18nProvider>);
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Pane actions" })).toHaveLength(3));
  fireEvent.click(screen.getAllByRole("button", { name: "Pane actions" })[0]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Arrange vertically" }));
  expect(screen.getAllByRole("separator")[0].getAttribute("aria-orientation")).toBe("horizontal");
  fireEvent.click(screen.getAllByRole("button", { name: "Pane actions" })[0]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Merge all panes" }));
  expect(screen.getAllByRole("button", { name: "Pane actions" })).toHaveLength(1);
  for (const title of ["A", "B", "C"]) expect(screen.getByRole("button", { name: title })).toBeTruthy();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.change(await screen.findByDisplayValue("A"), { target: { value: "Dirty A" } });
  fireEvent.click(screen.getByRole("button", { name: "Close A" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(window.dispatchEvent(new Event("munjib:before-sign-out", { cancelable: true }))).toBe(true);
  expect(confirm).toHaveBeenCalledOnce();
  confirm.mockRestore();
  vi.unstubAllGlobals();
});
