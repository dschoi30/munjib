// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render as testingRender, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { AiAssistantPanel } from "@/components/document-editor/ai-assistant-panel";
import { WorkspaceChatbot } from "@/components/workspace-chatbot";
import { readWorkspaceChatStream } from "@/components/workspace-chatbot-stream";
import { writeStoredChatModel } from "@/lib/rag/client-model-settings";
import { workspaceUiStateStorageKey } from "@/lib/workspace-ui-state";

const fetchMock = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/assistant/thread")) {
      return jsonResponse({
        thread: { id: "thread-1" },
        messages: [
          { id: "message-1", role: "ASSISTANT", content: "Earlier workspace answer." },
        ],
      });
    }
    if (url.endsWith("/assistant/messages")) {
      return ndjsonResponse([
        { type: "start" },
        {
          type: "done",
          thread: { id: "thread-1" },
          userMessage: { id: "message-2", role: "USER", content: "What is the policy?" },
          assistantMessage: {
            id: "message-3",
            role: "ASSISTANT",
            content: "Workspace answer.",
          },
          citations: [
            {
              index: 1,
              documentId: "doc-policy",
              documentTitle: "Handbook",
              documentPath: "/handbook",
              headingPath: "Policy",
            },
          ],
        },
      ]);
    }
    if (url.endsWith("/assistant/thread/reset")) {
      return jsonResponse({ thread: null });
    }
    throw new Error(`Unexpected fetch ${url} ${init?.method ?? "GET"}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WorkspaceChatbot", () => {
  it("keeps anonymous Trial workspace chat stateless and server-model-owned", async () => {
    window.localStorage.setItem(
      "munjib:rag-chat-model:company-handbook",
      "attacker/override-model",
    );
    render(
      <WorkspaceChatbot
        mode="anonymous-trial-readonly"
        initialTrialAiAllowance={{ remaining: 2, resetsAt: "2099-08-25T15:00:00.000Z" }}
        defaultChatModel="server/owned-model"
        defaultChatProvider="openai-compatible"
        availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }}
        workspaceSlug="company-handbook"
        selectedDocumentId="doc-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    expect(await screen.findByText("server/owned-model")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset conversation" })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/assistant/thread"))).toBe(false);

    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "What is the policy?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Workspace answer.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "[1] Handbook > Policy" }).getAttribute("href")).toBe(
      "/trial/workspaces/company-handbook?document=doc-policy",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/company-handbook/assistant/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({"X-Munjib-AI-Mode":"anonymous-trial-readonly"}),
        body: JSON.stringify({
          message: "What is the policy?",
          selectedDocumentId: "doc-1",
          uiLanguage: "en",
        }),
      }),
    );
  });

  it("keeps anonymous Trial Ask server-model-owned and bootstraps its allowance", async () => {
    window.localStorage.setItem(
      "munjib:rag-chat-model:company-handbook",
      "attacker/override-model",
    );
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/ask")) {
        return jsonResponse({
          answer: "Document answer [1]",
          citations: [{ index: 1, documentId: "doc-2", documentTitle: "Trial source" }],
        });
      }
      throw new Error(`Unexpected fetch ${url} ${init?.method ?? "GET"}`);
    });

    render(
      <AiAssistantPanel
        mode="anonymous-trial-readonly"
        initialTrialAiAllowance={{ remaining: 2, resetsAt: "2099-08-25T15:00:00.000Z" }}
        workspaceSlug="company-handbook"
        documentId="doc-1"
        hasUnsavedChanges={false}
        defaultChatModel="server/owned-model"
        defaultChatProvider="openai-compatible"
        availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }}
      />,
    );

    expect(screen.getByText("server/owned-model")).toBeTruthy();
    expect(screen.getByText("2 of 3 trial AI uses remaining today")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("AI question"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    expect(await screen.findByText("Document answer [1]")).toBeTruthy();
    expect(screen.getByRole("link", { name: "[1] Trial source" }).getAttribute("href")).toBe(
      "/trial/workspaces/company-handbook?document=doc-2",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/company-handbook/documents/doc-1/ask",
      expect.objectContaining({
        headers: expect.objectContaining({"X-Munjib-AI-Mode":"anonymous-trial-readonly"}),
        body: JSON.stringify({ question: "Question", uiLanguage: "en" }),
      }),
    );
  });

  it("hydrates stored open state and loads the thread automatically", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ workspaceChatOpen: true }),
    );

    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    expect(await screen.findByRole("region", { name: "Workspace AI chat" })).toBeTruthy();
    expect(await screen.findByText("Earlier workspace answer.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/company-handbook/assistant/thread",
    );
  });

  it("does not reset an open thread when only the selected document changes", async () => {
    const { rerender } = render(
      <WorkspaceChatbot
        defaultChatModel="openrouter/fusion"
        defaultChatProvider="openai-compatible"
        availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }}
        workspaceSlug="company-handbook"
        selectedDocumentId="doc-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    expect(await screen.findByText("Earlier workspace answer.")).toBeTruthy();
    const threadLoadCount = fetchMock.mock.calls.filter(
      ([url]) => typeof url === "string" && url.endsWith("/assistant/thread"),
    ).length;

    rerender(
      <WorkspaceChatbot
        defaultChatModel="openrouter/fusion"
        defaultChatProvider="openai-compatible"
        availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }}
        workspaceSlug="company-handbook"
        selectedDocumentId="doc-2"
      />,
    );

    expect(screen.getByText("Earlier workspace answer.")).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => typeof url === "string" && url.endsWith("/assistant/thread"),
      ).length,
    ).toBe(threadLoadCount);
  });

  it("uses the green primary token for the closed workspace AI launcher circle", () => {
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    const launcher = screen.getByRole("button", { name: "Open workspace AI chat" });
    expect(launcher.className).toContain("bg-primary");
    expect(launcher.className).toContain("text-primary-foreground");
    expect(launcher.className).toContain("hover:bg-primary-hover");
    expect(launcher.className).not.toContain("bg-surface-control");
    expect(launcher.className).not.toContain("hover:bg-slate-200");
    expect(launcher.className).not.toContain("text-ink");
  });

  it("persists opening and closing while preserving unrelated workspace UI state", async () => {
    const storageKey = workspaceUiStateStorageKey("company-handbook");
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        leftSidebarOpen: true,
        rightSidebarOpen: false,
        activeSidebarPanel: "favorites",
        graph: {
          settingsOpen: true,
          filters: { tag: true, orphans: false },
          display: {
            arrows: true,
            linkThickness: 2,
            nodeSize: 4,
            textFadeThreshold: 1.5,
          },
          forces: {
            center: 0.4,
            link: 0.7,
            linkDistance: 120,
            repel: -150,
          },
        },
      }),
    );

    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));

    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "{}")).toEqual({
      leftSidebarOpen: true,
      rightSidebarOpen: false,
      activeSidebarPanel: "favorites",
      workspaceChatOpen: true,
      graph: {
        settingsOpen: true,
        filters: { tag: true, orphans: false },
        display: {
          arrows: true,
          linkThickness: 2,
          nodeSize: 4,
          textFadeThreshold: 1.5,
        },
        forces: {
          center: 0.4,
          link: 0.7,
          linkDistance: 120,
          repel: -150,
        },
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Close workspace AI chat" }));

    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "{}")).toEqual({
      leftSidebarOpen: true,
      rightSidebarOpen: false,
      activeSidebarPanel: "favorites",
      workspaceChatOpen: false,
      graph: {
        settingsOpen: true,
        filters: { tag: true, orphans: false },
        display: {
          arrows: true,
          linkThickness: 2,
          nodeSize: 4,
          textFadeThreshold: 1.5,
        },
        forces: {
          center: 0.4,
          link: 0.7,
          linkDistance: 120,
          repel: -150,
        },
      },
    });
  });

  it("opens, loads the thread, sends a message, and renders the assistant answer", async () => {
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId="doc-1" />);

    const launcher = screen.getByRole("button", { name: "Open workspace AI chat" });
    expect(launcher.className).toContain("fixed");

    fireEvent.click(launcher);
    const panel = await screen.findByRole("region", { name: "Workspace AI chat" });
    expect(panel.className).toContain("max-h-[calc(100dvh-2rem)]");
    expect(await screen.findByText("Workspace AI")).toBeTruthy();
    expect(screen.getByText("Model")).toBeTruthy();
    expect(screen.getByText("openrouter/fusion")).toBeTruthy();
    expect(await screen.findByText("Earlier workspace answer.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "What is the policy?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Thinking...")).toBeTruthy();
    expect(await screen.findByText("Workspace answer.")).toBeTruthy();
    expect(screen.getByText("[1] Handbook > Policy")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/company-handbook/assistant/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "What is the policy?",
          selectedDocumentId: "doc-1",
          uiLanguage: "en",
        }),
      }),
    );
  });

  it("uses the selected Korean display language for workspace AI chrome and message payloads", async () => {
    window.localStorage.setItem("munjib:language", "ko");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
      }
      if (url.endsWith("/assistant/messages")) {
        return ndjsonResponse([
          { type: "start" },
          {
            type: "done",
            assistantMessage: {
              id: "message-3",
              role: "ASSISTANT",
              content: "Workspace answer.",
            },
            citations: [],
          },
        ]);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId="doc-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "워크스페이스 AI 채팅 열기" }));
    expect(await screen.findByRole("region", { name: "워크스페이스 AI 채팅" })).toBeTruthy();
    expect(screen.getByText("모델")).toBeTruthy();
    expect(await screen.findByText("이 워크스페이스 전체에 대해 질문해 보세요.")).toBeTruthy();
    expect(screen.getByPlaceholderText("이 워크스페이스 전체에 대해 질문하기")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("워크스페이스 채팅 메시지"), {
      target: { value: "무엇이 바뀌었나요?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));

    expect(screen.getByText("생각 중...")).toBeTruthy();
    expect(await screen.findByText("Workspace answer.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "대화 초기화" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "워크스페이스 AI 채팅 닫기" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/company-handbook/assistant/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "무엇이 바뀌었나요?",
          selectedDocumentId: "doc-1",
          uiLanguage: "ko",
        }),
      }),
    );
  });

  it("renders assistant markdown and links citations to source documents", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
      }
      if (url.endsWith("/assistant/messages")) {
        return ndjsonResponse([
          { type: "start" },
          {
            type: "done",
            assistantMessage: {
              id: "message-3",
              role: "ASSISTANT",
              content: "*   **CAPEX:** Investment continues [1].",
            },
            citations: [
              {
                index: 1,
                documentId: "doc-capex",
                documentTitle: "Hyperscaler CAPEX",
                documentPath: "/hyperscaler-capex",
                headingPath: "Investment",
              },
            ],
          },
        ]);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "Why keep investing?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    const strong = await screen.findByText("CAPEX:");
    expect(strong.tagName).toBe("STRONG");
    const citationLink = screen.getByRole("link", {
      name: "[1] Hyperscaler CAPEX > Investment",
    });
    expect(citationLink.getAttribute("href")).toBe(
      "/workspaces/company-handbook?document=doc-capex",
    );
  });

  it("sends the stored workspace chat model override with new messages", async () => {
    window.localStorage.setItem(
      "munjib:rag-chat-model:company-handbook",
      "google/gemma-4-31b-it:free",
    );
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId="doc-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Earlier workspace answer.");
    expect(screen.getByText("google/gemma-4-31b-it:free")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "What is the policy?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Workspace answer.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/company-handbook/assistant/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "What is the policy?",
          selectedDocumentId: "doc-1",
          uiLanguage: "en",
          chatProvider: "openai-compatible",
          chatModel: "google/gemma-4-31b-it:free",
        }),
      }),
    );
  });

  it("uses an available fallback override when the stored and default providers are unavailable", async () => {
    window.localStorage.setItem(
      "munjib:rag-chat-model:company-handbook",
      JSON.stringify({
        chatProvider: "openai-compatible",
        chatModel: "google/gemma-4-31b-it:free",
      }),
    );

    render(
      <WorkspaceChatbot
        defaultChatModel="openrouter/fusion"
        defaultChatProvider="openai-compatible"
        availableChatProviders={{ ollama: true, openai: false, "openai-compatible": false }}
        workspaceSlug="company-handbook"
        selectedDocumentId="doc-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Earlier workspace answer.");
    expect(screen.getByText("gemma4:e4b")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "What is the policy?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Workspace answer.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/company-handbook/assistant/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "What is the policy?",
          selectedDocumentId: "doc-1",
          uiLanguage: "en",
          chatProvider: "ollama",
          chatModel: "gemma4:e4b",
        }),
      }),
    );
  });

  it("uses updated workspace chat model settings without remounting", async () => {
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId="doc-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Earlier workspace answer.");
    await act(async () => {
      writeStoredChatModel("company-handbook", "google/gemma-4-31b-it:free");
    });
    expect(screen.getByText("google/gemma-4-31b-it:free")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "What is the policy?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Workspace answer.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/company-handbook/assistant/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "What is the policy?",
          selectedDocumentId: "doc-1",
          uiLanguage: "en",
          chatProvider: "openai-compatible",
          chatModel: "google/gemma-4-31b-it:free",
        }),
      }),
    );
  });

  it("resets the visible conversation", async () => {
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    expect(await screen.findByText("Earlier workspace answer.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset conversation" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/workspaces/company-handbook/assistant/thread/reset",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(screen.queryByText("Earlier workspace answer.")).toBeNull();
  });

  it("closes the panel back to the launcher", async () => {
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    expect(await screen.findByRole("region", { name: "Workspace AI chat" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close workspace AI chat" }));

    expect(screen.queryByRole("region", { name: "Workspace AI chat" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open workspace AI chat" })).toBeTruthy();
  });

  it("follows workspace-specific stored open state and loads only when open", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("alpha"),
      JSON.stringify({ workspaceChatOpen: true }),
    );
    window.localStorage.setItem(
      workspaceUiStateStorageKey("beta"),
      JSON.stringify({ workspaceChatOpen: false }),
    );
    window.localStorage.setItem(
      workspaceUiStateStorageKey("gamma"),
      JSON.stringify({ workspaceChatOpen: true }),
    );
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/alpha/assistant/thread")) {
        return jsonResponse({
          thread: { id: "thread-alpha" },
          messages: [{ id: "alpha-message", role: "ASSISTANT", content: "Alpha answer." }],
        });
      }
      if (url.endsWith("/beta/assistant/thread")) {
        return jsonResponse({
          thread: { id: "thread-beta" },
          messages: [{ id: "beta-message", role: "ASSISTANT", content: "Beta answer." }],
        });
      }
      if (url.endsWith("/gamma/assistant/thread")) {
        return jsonResponse({
          thread: { id: "thread-gamma" },
          messages: [{ id: "gamma-message", role: "ASSISTANT", content: "Gamma answer." }],
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    const { rerender } = render(
      <WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="alpha" selectedDocumentId={null} />,
    );

    expect(await screen.findByText("Alpha answer.")).toBeTruthy();

    rerender(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="beta" selectedDocumentId={null} />);

    expect(await screen.findByRole("button", { name: "Open workspace AI chat" })).toBeTruthy();
    expect(screen.queryByText("Alpha answer.")).toBeNull();
    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalledWith("/api/workspaces/beta/assistant/thread");
    });

    rerender(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="gamma" selectedDocumentId={null} />);

    expect(await screen.findByText("Gamma answer.")).toBeTruthy();
    expect(screen.queryByText("Beta answer.")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/gamma/assistant/thread");
  });

  it("keeps open and close interactions working when storage reads and writes throw", async () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("Storage read blocked");
      });
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Storage write blocked");
      });

    try {
      render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

      fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
      expect(await screen.findByRole("region", { name: "Workspace AI chat" })).toBeTruthy();
      expect(await screen.findByText("Earlier workspace answer.")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Close workspace AI chat" }));

      expect(screen.queryByRole("region", { name: "Workspace AI chat" })).toBeNull();
      expect(screen.getByRole("button", { name: "Open workspace AI chat" })).toBeTruthy();
    } finally {
      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });

  it("keeps sent messages when a delayed thread load resolves", async () => {
    const threadLoad = createDeferred<Response>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return threadLoad.promise;
      }
      if (url.endsWith("/assistant/messages")) {
        return ndjsonResponse([
          { type: "start" },
          {
            type: "done",
            assistantMessage: {
              id: "assistant-after-send",
              role: "ASSISTANT",
              content: "Fresh answer.",
            },
            citations: [],
          },
        ]);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "What is fresh?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Fresh answer.")).toBeTruthy();

    await act(async () => {
      threadLoad.resolve(
        jsonResponse({
          thread: { id: "thread-1" },
          messages: [{ id: "late-thread", role: "ASSISTANT", content: "Stale thread answer." }],
        }),
      );
      await threadLoad.promise;
    });

    expect(screen.getByText("Fresh answer.")).toBeTruthy();
    expect(screen.queryByText("Stale thread answer.")).toBeNull();
  });

  it("ignores a delayed send stream after reset clears the conversation", async () => {
    const sendStream = deferredNdjsonResponse();
    let sendSignal: AbortSignal | undefined;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
      }
      if (url.endsWith("/assistant/messages")) {
        sendSignal = init?.signal as AbortSignal | undefined;
        return sendStream.response;
      }
      if (url.endsWith("/assistant/thread/reset")) {
        return jsonResponse({ thread: null });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "Answer slowly" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset conversation" }));

    await waitFor(() => {
      expect(screen.queryByText("Answer slowly")).toBeNull();
    });
    expect(sendSignal?.aborted).toBe(true);

    await act(async () => {
      sendStream.enqueue({ type: "start" });
      sendStream.enqueue({ type: "token", content: "Late draft." });
      sendStream.enqueue({
        type: "done",
        assistantMessage: {
          id: "late-assistant",
          role: "ASSISTANT",
          content: "Late answer.",
        },
        citations: [],
      });
      sendStream.close();
    });

    expect(screen.queryByText("Late draft.")).toBeNull();
    expect(screen.queryByText("Late answer.")).toBeNull();
    expect(screen.getByText("Ask across this workspace.")).toBeTruthy();
  });

  it("renders streamed assistant tokens before done and hides thinking after the first token", async () => {
    const sendStream = deferredNdjsonResponse();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
      }
      if (url.endsWith("/assistant/messages")) {
        return sendStream.response;
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "Stream an answer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Thinking...")).toBeTruthy();

    await act(async () => {
      sendStream.enqueue({ type: "start" });
      sendStream.enqueue({ type: "token", content: "Draft " });
      sendStream.enqueue({ type: "token", content: "answer" });
    });

    expect(await screen.findByText("Draft answer")).toBeTruthy();
    expect(screen.queryByText("Thinking...")).toBeNull();

    await act(async () => {
      sendStream.enqueue({
        type: "done",
        assistantMessage: {
          id: "final-assistant",
          role: "ASSISTANT",
          content: "Final answer.",
        },
        citations: [],
      });
      sendStream.close();
    });

    expect(await screen.findByText("Final answer.")).toBeTruthy();
    expect(screen.queryByText("Draft answer")).toBeNull();
  });

  it("does not start a second send when the form submits while loading", async () => {
    const firstStream = deferredNdjsonResponse();
    const secondStream = deferredNdjsonResponse();
    let messageFetchCount = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
      }
      if (url.endsWith("/assistant/messages")) {
        messageFetchCount += 1;
        return messageFetchCount === 1 ? firstStream.response : secondStream.response;
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    const input = screen.getByLabelText("Workspace chat message");
    const form = input.closest("form") as HTMLFormElement;

    fireEvent.change(input, {
      target: { value: "First pending question" },
    });
    fireEvent.submit(form);

    expect(await screen.findByText("Thinking...")).toBeTruthy();
    expect(input).toHaveProperty("disabled", false);

    fireEvent.change(input, {
      target: { value: "Second question" },
    });
    fireEvent.submit(form);

    await act(async () => {});
    expect(messageFetchCount).toBe(1);
    expect(screen.queryByText("Second question")).toBeNull();

    await act(async () => {
      firstStream.enqueue({ type: "start" });
      firstStream.enqueue({
        type: "done",
        assistantMessage: {
          id: "first-final",
          role: "ASSISTANT",
          content: "First final answer.",
        },
        citations: [],
      });
      firstStream.close();
    });

    expect(await screen.findByText("First pending question")).toBeTruthy();
    expect(await screen.findByText("First final answer.")).toBeTruthy();
  });

  it("removes optimistic and partial messages when the stream sends an error event", async () => {
    const sendStream = deferredNdjsonResponse();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
      }
      if (url.endsWith("/assistant/messages")) {
        return sendStream.response;
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "Will this fail?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await act(async () => {
      sendStream.enqueue({ type: "start" });
      sendStream.enqueue({ type: "token", content: "Partial answer" });
    });
    expect(await screen.findByText("Partial answer")).toBeTruthy();

    await act(async () => {
      sendStream.enqueue({ type: "error", error: "AI_UNAVAILABLE" });
      sendStream.close();
    });

    expect(await screen.findByText("Workspace AI is unavailable.")).toBeTruthy();
    expect(screen.queryByText("Will this fail?")).toBeNull();
    expect(screen.queryByText("Partial answer")).toBeNull();
  });

  it("removes optimistic and partial messages when the stream ends without a terminal event", async () => {
    const sendStream = deferredNdjsonResponse();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
      }
      if (url.endsWith("/assistant/messages")) {
        return sendStream.response;
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "Will this end early?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await act(async () => {
      sendStream.enqueue({ type: "start" });
      sendStream.enqueue({ type: "token", content: "Partial before EOF" });
    });
    expect(await screen.findByText("Partial before EOF")).toBeTruthy();

    await act(async () => {
      sendStream.close();
    });

    expect(await screen.findByText("Workspace AI is unavailable.")).toBeTruthy();
    expect(screen.queryByText("Will this end early?")).toBeNull();
    expect(screen.queryByText("Partial before EOF")).toBeNull();
  });

  it("disables message input while reset is pending", async () => {
    const resetResponse = createDeferred<Response>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
      }
      if (url.endsWith("/assistant/thread/reset")) {
        return resetResponse.promise;
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "Do not send yet" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset conversation" }));

    expect(screen.getByLabelText("Workspace chat message")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Send message" })).toHaveProperty(
      "disabled",
      true,
    );

    await act(async () => {
      resetResponse.resolve(jsonResponse({ thread: null }));
      await resetResponse.promise;
    });

    expect(screen.getByLabelText("Workspace chat message")).toHaveProperty("disabled", false);
  });

  it("reads valid workspace chat NDJSON streams", async () => {
    const response = ndjsonChunkedResponse([
      `${JSON.stringify({ type: "start" })}\n${JSON.stringify({ type: "token", content: "Hel" })}`,
      `\n${JSON.stringify({ type: "token", content: "lo" })}\n`,
      `${JSON.stringify({
        type: "done",
        thread: { id: "thread-1" },
        userMessage: { id: "message-1", role: "USER", content: "Question" },
        assistantMessage: { id: "message-2", role: "ASSISTANT", content: "Hello" },
        citations: [],
      })}\n`,
    ]);
    const events: unknown[] = [];

    await readWorkspaceChatStream(response, (event) => {
      events.push(event);
    });

    expect(events).toEqual([
      { type: "start" },
      { type: "token", content: "Hel" },
      { type: "token", content: "lo" },
      {
        type: "done",
        thread: { id: "thread-1" },
        userMessage: { id: "message-1", role: "USER", content: "Question" },
        assistantMessage: { id: "message-2", role: "ASSISTANT", content: "Hello" },
        citations: [],
      },
    ]);
  });

  it("rejects missing or invalid workspace chat stream events", async () => {
    await expect(readWorkspaceChatStream(new Response(null), vi.fn())).rejects.toThrow(
      "WORKSPACE_CHAT_STREAM_UNAVAILABLE",
    );
    await expect(
      readWorkspaceChatStream(ndjsonResponse([{ type: "token" }]), vi.fn()),
    ).rejects.toThrow("WORKSPACE_CHAT_STREAM_EVENT_INVALID");
  });

  it("rejects incomplete workspace chat streams without done or error", async () => {
    await expect(
      readWorkspaceChatStream(
        ndjsonResponse([
          { type: "start" },
          { type: "token", content: "Partial answer" },
        ]),
        vi.fn(),
      ),
    ).rejects.toThrow("WORKSPACE_CHAT_STREAM_INCOMPLETE");

    await expect(
      readWorkspaceChatStream(
        new Response("\n\n", { headers: { "content-type": "application/x-ndjson" } }),
        vi.fn(),
      ),
    ).rejects.toThrow("WORKSPACE_CHAT_STREAM_INCOMPLETE");
  });

  it("shows a recoverable error when initial thread loading returns an error", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ error: "AI_UNAVAILABLE" }, { status: 503 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));

    expect(await screen.findByText("Workspace AI is unavailable.")).toBeTruthy();
  });

  it("shows a recoverable error when reset fails", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
      }
      if (url.endsWith("/assistant/thread/reset")) {
        return jsonResponse({ error: "AI_UNAVAILABLE" }, { status: 503 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.click(screen.getByRole("button", { name: "Reset conversation" }));

    expect(await screen.findByText("Workspace AI is unavailable.")).toBeTruthy();
  });

  it("removes an aborted pending send when reset fails", async () => {
    const sendStream = deferredNdjsonResponse();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
      }
      if (url.endsWith("/assistant/messages")) {
        return sendStream.response;
      }
      if (url.endsWith("/assistant/thread/reset")) {
        return jsonResponse({ error: "AI_UNAVAILABLE" }, { status: 503 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "Abort this pending turn" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await act(async () => {
      sendStream.enqueue({ type: "start" });
      sendStream.enqueue({ type: "token", content: "Partial reset draft" });
    });
    expect(await screen.findByText("Partial reset draft")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset conversation" }));

    expect(await screen.findByText("Workspace AI is unavailable.")).toBeTruthy();
    expect(screen.queryByText("Abort this pending turn")).toBeNull();
    expect(screen.queryByText("Partial reset draft")).toBeNull();
  });

  it("shows a recoverable error when sending fails", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
      }
      if (url.endsWith("/assistant/messages")) {
        return jsonResponse({ error: "AI_UNAVAILABLE" }, { status: 503 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Workspace AI");
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "What changed?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Workspace AI is unavailable.")).toBeTruthy();
    expect(screen.queryByText("What changed?")).toBeNull();
  });

  it("publishes the authoritative Trial allowance from a pre-stream 503", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/messages")) {
        return jsonResponse({
          error: "AI_UNAVAILABLE",
          trialAi: { remaining: 1, resetsAt: "2099-08-25T15:00:00.000Z" },
        }, { status: 503 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(
      <WorkspaceChatbot
        mode="anonymous-trial-readonly"
        initialTrialAiAllowance={{ remaining: 2, resetsAt: "2099-08-25T15:00:00.000Z" }}
        defaultChatModel="server/owned-model"
        defaultChatProvider="openai-compatible"
        availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }}
        workspaceSlug="company-handbook"
        selectedDocumentId={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "What changed?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Workspace AI is unavailable.")).toBeTruthy();
    expect(screen.getByText("1 of 3 trial AI uses remaining today")).toBeTruthy();
    expect(screen.queryByText("2 of 3 trial AI uses remaining today")).toBeNull();
  });

  it("shows the authoritative trial allowance from the workspace start event", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) return jsonResponse({ messages: [] });
      if (url.endsWith("/assistant/messages")) {
        return ndjsonResponse([
          {
            type: "start",
            trialAi: { remaining: 3, resetsAt: "2099-08-25T15:00:00.000Z" },
          },
          {
            type: "done",
            assistantMessage: { id: "answer-1", role: "ASSISTANT", content: "Answer" },
          },
        ]);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.change(screen.getByLabelText("Workspace chat message"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("3 of 3 trial AI uses remaining today")).toBeTruthy();
    expect(screen.getByText("Resets at midnight Korea time (KST).")).toBeTruthy();
  });

  it("synchronizes an Ask AI allowance update into Workspace AI without localStorage", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) return jsonResponse({ messages: [] });
      if (url.endsWith("/ask")) {
        return jsonResponse({
          answer: "Document answer",
          citations: [],
          trialAi: { remaining: 1, resetsAt: "2099-08-25T15:00:00.000Z" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(
      <>
        <AiAssistantPanel workspaceSlug="company-handbook" documentId="doc-1" hasUnsavedChanges={false} defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} />
        <WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.change(screen.getByLabelText("AI question"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    expect(await screen.findAllByText("1 of 3 trial AI uses remaining today")).toHaveLength(2);
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook"))).toContain('"workspaceChatOpen":true');
  });

  it("disables the Trial composer after a quota 429 while leaving ordinary errors recoverable", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) return jsonResponse({ messages: [] });
      if (url.endsWith("/assistant/messages")) {
        return jsonResponse(
          { code: "TRIAL_AI_DAILY_LIMIT_REACHED", resetsAt: "2099-08-25T15:00:00.000Z" },
          { status: 429 },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    const composer = screen.getByLabelText("Workspace chat message") as HTMLInputElement;
    fireEvent.change(composer, { target: { value: "Fourth question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(composer.disabled).toBe(true));
    expect(screen.getByText("0 of 3 trial AI uses remaining today")).toBeTruthy();
  });

  it("does not turn a transient concurrent-request 429 into a daily lockout", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) return jsonResponse({ messages: [] });
      if (url.endsWith("/assistant/messages")) {
        return jsonResponse(
          { code: "TRIAL_AI_REQUEST_IN_PROGRESS" },
          { status: 429 },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    const composer = screen.getByLabelText("Workspace chat message") as HTMLInputElement;
    fireEvent.change(composer, { target: { value: "Concurrent question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Workspace AI is unavailable.")).toBeTruthy();
    expect(composer.disabled).toBe(false);
    expect(screen.queryByText(/trial AI uses remaining/)).toBeNull();
  });

  it("replays the same-tab authoritative lockout to an Ask panel opened later", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) return jsonResponse({ messages: [] });
      if (url.endsWith("/assistant/messages")) {
        return jsonResponse(
          { code: "TRIAL_AI_DAILY_LIMIT_REACHED", resetsAt: "2099-08-25T15:00:00.000Z" },
          { status: 429 },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    function AllowanceReplayHarness() {
      const [showAsk, setShowAsk] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setShowAsk(true)}>Show Ask panel</button>
          {showAsk ? <AiAssistantPanel workspaceSlug="company-handbook" documentId="doc-1" hasUnsavedChanges={false} defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} /> : null}
          <WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />
        </>
      );
    }
    render(<AllowanceReplayHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.change(screen.getByLabelText("Workspace chat message"), { target: { value: "Fourth question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("0 of 3 trial AI uses remaining today");

    fireEvent.click(screen.getByRole("button", { name: "Show Ask panel" }));

    await waitFor(() => expect((screen.getByLabelText("AI question") as HTMLTextAreaElement).disabled).toBe(true));
  });

  it("keeps the lower allowance when cross-surface responses resolve out of order", async () => {
    const askResponse = createDeferred<Response>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) return jsonResponse({ messages: [] });
      if (url.endsWith("/ask")) return askResponse.promise;
      if (url.endsWith("/assistant/messages")) {
        return ndjsonResponse([
          { type: "start", trialAi: { remaining: 0, resetsAt: "2099-08-25T15:00:00.000Z" } },
          { type: "done", assistantMessage: { role: "ASSISTANT", content: "Workspace answer" } },
        ]);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(
      <>
        <AiAssistantPanel workspaceSlug="company-handbook" documentId="doc-1" hasUnsavedChanges={false} defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} />
        <WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.change(screen.getByLabelText("AI question"), { target: { value: "Slow ask" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    fireEvent.change(screen.getByLabelText("Workspace chat message"), { target: { value: "Fast workspace" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findAllByText("0 of 3 trial AI uses remaining today")).toHaveLength(2);

    await act(async () => {
      askResponse.resolve(jsonResponse({
        answer: "Late answer",
        citations: [],
        trialAi: { remaining: 1, resetsAt: "2099-08-25T15:00:00.000Z" },
      }));
    });

    expect(await screen.findAllByText("0 of 3 trial AI uses remaining today")).toHaveLength(2);
    expect(screen.queryByText("1 of 3 trial AI uses remaining today")).toBeNull();
  });

  it("clears an expired allowance without granting a guessed replacement", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T14:59:59.000Z"));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) return jsonResponse({ messages: [] });
      if (url.endsWith("/assistant/messages")) {
        return ndjsonResponse([
          { type: "start", trialAi: { remaining: 0, resetsAt: "2026-08-25T15:00:00.000Z" } },
          { type: "done", assistantMessage: { role: "ASSISTANT", content: "Answer" } },
        ]);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await act(async () => Promise.resolve());
    fireEvent.change(screen.getByLabelText("Workspace chat message"), { target: { value: "Last use" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await act(async () => Promise.resolve());
    expect((screen.getByLabelText("Workspace chat message") as HTMLInputElement).disabled).toBe(true);

    await act(async () => vi.advanceTimersByTimeAsync(1_001));

    expect((screen.getByLabelText("Workspace chat message") as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText(/trial AI uses remaining/)).toBeNull();
    expect(screen.queryByText("3 of 3 trial AI uses remaining today")).toBeNull();
  });

  it("announces allowance changes politely and connects disabled composers to reset guidance", async () => {
    vi.useRealTimers();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) return jsonResponse({ messages: [] });
      if (url.endsWith("/ask")) {
        return jsonResponse({
          code: "TRIAL_AI_DAILY_LIMIT_REACHED",
          resetsAt: "2099-08-25T15:00:00.000Z",
        }, { status: 429 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(
      <>
        <AiAssistantPanel workspaceSlug="company-handbook" documentId="doc-1" hasUnsavedChanges={false} defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} />
        <WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" availableChatProviders={{ ollama: true, openai: true, "openai-compatible": true }} workspaceSlug="company-handbook" selectedDocumentId={null} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.change(screen.getByLabelText("AI question"), { target: { value: "Fourth ask" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    await screen.findAllByText("0 of 3 trial AI uses remaining today");
    const statuses = screen.getAllByRole("status").filter((status) =>
      status.id.startsWith("trial-ai-allowance-"),
    );
    expect(statuses).toHaveLength(2);
    expect(statuses.every((status) => status.getAttribute("aria-live") === "polite")).toBe(true);
    const askInput = screen.getByLabelText("AI question");
    const workspaceInput = screen.getByLabelText("Workspace chat message");
    expect(document.getElementById(askInput.getAttribute("aria-describedby") ?? "")?.textContent).toContain("Resets at midnight");
    expect(document.getElementById(workspaceInput.getAttribute("aria-describedby") ?? "")?.textContent).toContain("Resets at midnight");
  });
});

function ndjsonResponse(events: unknown[], init?: ResponseInit) {
  return new Response(events.map((event) => `${JSON.stringify(event)}\n`).join(""), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/x-ndjson" },
  });
}

function ndjsonChunkedResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
    { headers: { "content-type": "application/x-ndjson" } },
  );
}

function deferredNdjsonResponse() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
      },
    }),
    { headers: { "content-type": "application/x-ndjson" } },
  );

  return {
    response,
    enqueue(event: unknown) {
      controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
    },
    close() {
      if (!closed) {
        closed = true;
        controller.close();
      }
    },
  };
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function render(ui: React.ReactElement) {
  const result = testingRender(<I18nProvider>{ui}</I18nProvider>);
  return {
    ...result,
    rerender: (nextUi: React.ReactElement) => result.rerender(<I18nProvider>{nextUi}</I18nProvider>),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}
