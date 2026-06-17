import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as GET_THREAD } from "@/app/api/workspaces/[workspaceSlug]/assistant/thread/route";
import { POST as POST_MESSAGE } from "@/app/api/workspaces/[workspaceSlug]/assistant/messages/route";
import { POST as POST_RESET } from "@/app/api/workspaces/[workspaceSlug]/assistant/thread/reset/route";
import { requireCurrentUser } from "@/lib/auth/session";
import { RAG_ERROR_CODES } from "@/lib/rag/errors";
import {
  getOrCreateWorkspaceChatThread,
  prepareWorkspaceChatMessageStream,
  resetWorkspaceChatThread,
  sendPreparedWorkspaceChatMessageStream,
  WORKSPACE_CHAT_ERROR_CODES,
} from "@/lib/rag/workspace-chat";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rag/workspace-chat", () => ({
  WORKSPACE_CHAT_ERROR_CODES: {
    MESSAGE_REQUIRED: "MESSAGE_REQUIRED",
    THREAD_ARCHIVED: "THREAD_ARCHIVED",
  },
  getOrCreateWorkspaceChatThread: vi.fn(),
  prepareWorkspaceChatMessageStream: vi.fn(),
  resetWorkspaceChatThread: vi.fn(),
  sendPreparedWorkspaceChatMessageStream: vi.fn(),
}));

const thread = {
  id: "thread-1",
  createdAt: new Date("2026-06-15T00:00:00.000Z"),
  updatedAt: new Date("2026-06-15T00:00:01.000Z"),
  workspaceId: "workspace-1",
  userId: "user-1",
  title: null,
  status: "ACTIVE" as const,
  lastMessageAt: null,
  memorySummary: null,
  memoryUpdatedAt: null,
  messages: [],
};

const userMessage = {
  id: "message-user-1",
  createdAt: new Date("2026-06-15T00:00:02.000Z"),
  updatedAt: new Date("2026-06-15T00:00:03.000Z"),
  threadId: "thread-1",
  role: "USER" as const,
  content: "What changed?",
  citations: null,
  contextMeta: null,
  model: null,
};

const assistantMessage = {
  id: "message-assistant-1",
  createdAt: new Date("2026-06-15T00:00:04.000Z"),
  updatedAt: new Date("2026-06-15T00:00:05.000Z"),
  threadId: "thread-1",
  role: "ASSISTANT" as const,
  content: "The workspace changed [1].",
  citations: null,
  contextMeta: null,
  model: "gemma4:e4b",
};

const citations = [
  {
    index: 1,
    documentId: "doc-1",
    documentTitle: "Handbook",
    documentPath: "Handbook",
    headingPath: null,
  },
];

const preparedWorkspaceChatMessage = {
  threadId: "thread-1",
  message: "What changed?",
} as unknown as Awaited<ReturnType<typeof prepareWorkspaceChatMessageStream>>;

describe("workspace chat routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
    });
    vi.mocked(getOrCreateWorkspaceChatThread).mockResolvedValue({
      thread,
      messages: [userMessage],
    });
    vi.mocked(prepareWorkspaceChatMessageStream).mockResolvedValue(
      preparedWorkspaceChatMessage,
    );
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementation(
      async (_prepared, { onToken }) => {
        await onToken("The workspace ");
        await onToken("changed [1].");
        return {
          thread,
          userMessage,
          assistantMessage,
          citations,
        };
      },
    );
    vi.mocked(resetWorkspaceChatThread).mockResolvedValue({ thread: null });
  });

  it("returns the current workspace chat thread and messages", async () => {
    const response = await GET_THREAD(new Request("http://test.local"), routeContext());

    await expect(response.json()).resolves.toEqual({
      thread: jsonThread(),
      messages: [jsonMessage(userMessage)],
    });
    expect(response.status).toBe(200);
    expect(getOrCreateWorkspaceChatThread).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      actorId: "user-1",
    });
  });

  it("streams workspace chat message events with selected document pass-through", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({
        message: "  What changed?  ",
        selectedDocumentId: "doc-1",
        chatProvider: "openai-compatible",
        chatModel: "google/gemma-4-31b-it:free",
      }),
      routeContext(),
    );

    await expect(readNdjson(response)).resolves.toEqual([
      { type: "start" },
      { type: "token", content: "The workspace " },
      { type: "token", content: "changed [1]." },
      {
        type: "done",
        thread: jsonThread(),
        userMessage: jsonMessage(userMessage),
        assistantMessage: jsonMessage(assistantMessage),
        citations,
      },
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(prepareWorkspaceChatMessageStream).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      actorId: "user-1",
      message: "What changed?",
      selectedDocumentId: "doc-1",
      chatProviderOverride: "openai-compatible",
      chatModelOverride: "google/gemma-4-31b-it:free",
    });
    expect(sendPreparedWorkspaceChatMessageStream).toHaveBeenCalledWith(
      preparedWorkspaceChatMessage,
      { onToken: expect.any(Function) },
    );
  });

  it("streams an error event when sending fails after a token", async () => {
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementationOnce(
      async (_prepared, { onToken }) => {
        await onToken("Partial answer");
        throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
      },
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await expect(readNdjson(response)).resolves.toEqual([
      { type: "start" },
      { type: "token", content: "Partial answer" },
      { type: "error", error: "AI_UNAVAILABLE" },
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
  });

  it("rejects invalid chat model overrides before calling the streaming service", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({
        message: "What changed?",
        chatModel: "bad model",
      }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({ error: "INVALID_CHAT_MODEL" });
    expect(response.status).toBe(400);
    expect(prepareWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it("rejects provider-only chat overrides before calling the streaming service", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({
        message: "What changed?",
        chatProvider: "openai-compatible",
      }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({ error: "INVALID_CHAT_MODEL" });
    expect(response.status).toBe(400);
    expect(prepareWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it("rejects a blank message before calling the streaming service", async () => {
    const response = await POST_MESSAGE(jsonRequest({ message: "   " }), routeContext());

    await expect(response.json()).resolves.toEqual({
      error: WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED,
    });
    expect(response.status).toBe(400);
    expect(prepareWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before calling the streaming service", async () => {
    const response = await POST_MESSAGE(
      new Request("http://test.local", {
        method: "POST",
        body: "{",
      }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({ error: "INVALID_JSON" });
    expect(response.status).toBe(400);
    expect(prepareWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it("rejects invalid selected documents before calling the streaming service", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?", selectedDocumentId: 123 }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({
      error: "INVALID_SELECTED_DOCUMENT_ID",
    });
    expect(response.status).toBe(400);
    expect(prepareWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it("resets the current workspace chat thread", async () => {
    vi.mocked(resetWorkspaceChatThread).mockResolvedValueOnce({ thread });

    const response = await POST_RESET(new Request("http://test.local", {
      method: "POST",
    }), routeContext());

    await expect(response.json()).resolves.toEqual({ thread: jsonThread() });
    expect(response.status).toBe(200);
    expect(resetWorkspaceChatThread).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      actorId: "user-1",
    });
  });

  it("does not swallow auth redirects", async () => {
    const redirectError = new Error("NEXT_REDIRECT");
    vi.mocked(requireCurrentUser).mockRejectedValueOnce(redirectError);

    await expect(
      GET_THREAD(new Request("http://test.local"), routeContext()),
    ).rejects.toBe(redirectError);

    expect(getOrCreateWorkspaceChatThread).not.toHaveBeenCalled();
  });

  it("maps workspace not found to not found", async () => {
    vi.mocked(getOrCreateWorkspaceChatThread).mockRejectedValueOnce(
      new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND),
    );

    const response = await GET_THREAD(new Request("http://test.local"), routeContext());

    await expect(response.json()).resolves.toEqual({
      error: SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND,
    });
    expect(response.status).toBe(404);
  });

  it("returns a generic unavailable response when preparation fails before streaming", async () => {
    vi.mocked(prepareWorkspaceChatMessageStream).mockRejectedValueOnce(
      new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED),
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
    expect(response.status).toBe(503);
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it("uses the shared unavailable response for reset RAG runtime failures", async () => {
    vi.mocked(resetWorkspaceChatThread).mockRejectedValueOnce(
      new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED),
    );

    const response = await POST_RESET(new Request("http://test.local", {
      method: "POST",
    }), routeContext());

    await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
    expect(response.status).toBe(503);
  });

  it("maps archived thread races before streaming to a stable conflict response", async () => {
    vi.mocked(prepareWorkspaceChatMessageStream).mockRejectedValueOnce(
      new Error(WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED),
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({
      error: WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED,
    });
    expect(response.status).toBe(409);
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });
});

function routeContext(workspaceSlug = "company-handbook") {
  return {
    params: Promise.resolve({ workspaceSlug }),
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://test.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readNdjson(response: Response) {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function jsonThread() {
  return {
    ...thread,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  };
}

function jsonMessage(message: typeof userMessage | typeof assistantMessage) {
  return {
    ...message,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}
