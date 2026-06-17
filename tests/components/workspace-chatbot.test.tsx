// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceChatbot } from "@/components/workspace-chatbot";
import { readWorkspaceChatStream } from "@/components/workspace-chatbot-stream";
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
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

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
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

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
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

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
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

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
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

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
    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByText("Workspace AI");
    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "What changed?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Workspace AI is unavailable.")).toBeTruthy();
    expect(screen.queryByText("What changed?")).toBeNull();
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}
