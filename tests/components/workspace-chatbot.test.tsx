// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceChatbot } from "@/components/workspace-chatbot";
import { writeStoredChatModel } from "@/lib/rag/client-model-settings";

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
      return jsonResponse({
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
            documentTitle: "Handbook",
            documentPath: "/handbook",
            headingPath: "Policy",
          },
        ],
      });
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
  it("opens, loads the thread, sends a message, and renders the assistant answer", async () => {
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId="doc-1" />);

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
        return jsonResponse({
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
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

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
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId="doc-1" />);

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
          chatProvider: "openai-compatible",
          chatModel: "google/gemma-4-31b-it:free",
        }),
      }),
    );
  });

  it("uses updated workspace chat model settings without remounting", async () => {
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId="doc-1" />);

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
          chatProvider: "openai-compatible",
          chatModel: "google/gemma-4-31b-it:free",
        }),
      }),
    );
  });

  it("resets the visible conversation", async () => {
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

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
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    expect(await screen.findByRole("region", { name: "Workspace AI chat" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close workspace AI chat" }));

    expect(screen.queryByRole("region", { name: "Workspace AI chat" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open workspace AI chat" })).toBeTruthy();
  });

  it("loads a new thread when the workspace changes", async () => {
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
      throw new Error(`Unexpected fetch ${url}`);
    });
    const { rerender } = render(
      <WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="alpha" selectedDocumentId={null} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    expect(await screen.findByText("Alpha answer.")).toBeTruthy();

    rerender(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="beta" selectedDocumentId={null} />);

    expect(await screen.findByText("Beta answer.")).toBeTruthy();
    expect(screen.queryByText("Alpha answer.")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/beta/assistant/thread");
  });

  it("keeps sent messages when a delayed thread load resolves", async () => {
    const threadLoad = createDeferred<Response>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return threadLoad.promise;
      }
      if (url.endsWith("/assistant/messages")) {
        return jsonResponse({
          assistantMessage: {
            id: "assistant-after-send",
            role: "ASSISTANT",
            content: "Fresh answer.",
          },
          citations: [],
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

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

  it("ignores a delayed send response after reset clears the conversation", async () => {
    const sendResponse = createDeferred<Response>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
      }
      if (url.endsWith("/assistant/messages")) {
        return sendResponse.promise;
      }
      if (url.endsWith("/assistant/thread/reset")) {
        return jsonResponse({ thread: null });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

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

    await act(async () => {
      sendResponse.resolve(
        jsonResponse({
          assistantMessage: {
            id: "late-assistant",
            role: "ASSISTANT",
            content: "Late answer.",
          },
          citations: [],
        }),
      );
      await sendResponse.promise;
    });

    expect(screen.queryByText("Late answer.")).toBeNull();
    expect(screen.getByText("Ask across this workspace.")).toBeTruthy();
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
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

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

  it("shows a recoverable error when initial thread loading returns an error", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/assistant/thread")) {
        return jsonResponse({ error: "AI_UNAVAILABLE" }, { status: 503 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

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
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Ask across this workspace.");
    fireEvent.click(screen.getByRole("button", { name: "Reset conversation" }));

    expect(await screen.findByText("Workspace AI is unavailable.")).toBeTruthy();
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
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Workspace AI");
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "What changed?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Workspace AI is unavailable.")).toBeTruthy();
  });
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
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
