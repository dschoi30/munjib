import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as GET_THREAD } from "@/app/api/workspaces/[workspaceSlug]/assistant/thread/route";
import { POST as POST_MESSAGE } from "@/app/api/workspaces/[workspaceSlug]/assistant/messages/route";
import { POST as POST_RESET } from "@/app/api/workspaces/[workspaceSlug]/assistant/thread/reset/route";
import { requireCurrentUser } from "@/lib/auth/session";
import { captureHandledAiUnavailable } from "@/lib/observability/ai-unavailable";
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

vi.mock("@/lib/observability/ai-unavailable", () => ({
  captureHandledAiUnavailable: vi.fn(),
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
  chatProviderName: "openai-compatible",
  chatModelName: "google/gemma-4-31b-it:free",
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
    expect(prepareWorkspaceChatMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceSlug: "company-handbook",
        actorId: "user-1",
        message: "What changed?",
        selectedDocumentId: "doc-1",
        chatProviderOverride: "openai-compatible",
        chatModelOverride: "google/gemma-4-31b-it:free",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(sendPreparedWorkspaceChatMessageStream).toHaveBeenCalledWith(
      preparedWorkspaceChatMessage,
      expect.objectContaining({ onToken: expect.any(Function) }),
    );
  });

  it("passes the request abort signal into the streaming service", async () => {
    const abortController = new AbortController();

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }, { signal: abortController.signal }),
      routeContext(),
    );

    await readNdjson(response);

    const callbacks = vi.mocked(sendPreparedWorkspaceChatMessageStream).mock.calls[0]?.[1];
    expect(callbacks).toEqual(
      expect.objectContaining({
        onToken: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(callbacks?.signal?.aborted).toBe(false);
    abortController.abort();
    expect(callbacks?.signal?.aborted).toBe(true);
  });

  it("passes the request abort signal into message preparation", async () => {
    const abortController = new AbortController();

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }, { signal: abortController.signal }),
      routeContext(),
    );

    await readNdjson(response);

    const preparationInput = vi.mocked(prepareWorkspaceChatMessageStream).mock.calls[0]?.[0];
    expect(preparationInput).toEqual(
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(preparationInput?.signal?.aborted).toBe(false);
    abortController.abort();
    expect(preparationInput?.signal?.aborted).toBe(true);
  });

  it("captures and streams an error event when sending fails after a token", async () => {
    const error = new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementationOnce(
      async (_prepared, { onToken }) => {
        await onToken("Partial answer");
        throw error;
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
    expect(captureHandledAiUnavailable).toHaveBeenCalledWith({
      error,
      surface: "workspace_chat_stream",
      workspaceSlug: "company-handbook",
      streamStarted: true,
      ragErrorCode: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });
  });

  it("does not capture an aborted stream failure as an AI provider failure", async () => {
    const abortController = new AbortController();
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementationOnce(
      async (_prepared, { onToken }) => {
        await onToken("Partial answer");
        abortController.abort();
        throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
      },
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }, { signal: abortController.signal }),
      routeContext(),
    );

    await expect(readNdjson(response)).resolves.toEqual([
      { type: "start" },
      { type: "token", content: "Partial answer" },
    ]);
    expect(response.status).toBe(200);
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("streams an archived thread error when sending fails after a token", async () => {
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementationOnce(
      async (_prepared, { onToken }) => {
        await onToken("Partial answer");
        throw new Error(WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED);
      },
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await expect(readNdjson(response)).resolves.toEqual([
      { type: "start" },
      { type: "token", content: "Partial answer" },
      { type: "error", error: WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED },
    ]);
    expect(response.status).toBe(200);
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("disables response transformation for streaming messages", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await readNdjson(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-transform");
  });

  it("ignores late stream writes after the response body is cancelled", async () => {
    const releaseToken = createDeferred<void>();
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementationOnce(
      async (_prepared, { onToken }) => {
        await releaseToken.promise;
        await onToken("Late token");
        return {
          thread,
          userMessage,
          assistantMessage,
          citations,
        };
      },
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );
    expect(sendPreparedWorkspaceChatMessageStream).toHaveBeenCalled();
    const sendPromise = vi.mocked(sendPreparedWorkspaceChatMessageStream).mock.results[0]
      ?.value as Promise<unknown>;

    await response.body?.cancel();
    releaseToken.resolve();

    await expect(sendPromise).resolves.toMatchObject({
      assistantMessage,
    });
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
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
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
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
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
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("captures and returns a generic unavailable response when preparation fails before streaming", async () => {
    const error = new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    vi.mocked(prepareWorkspaceChatMessageStream).mockRejectedValueOnce(error);

    const response = await POST_MESSAGE(
      jsonRequest({
        message: "What changed?",
        chatProvider: "openai-compatible",
        chatModel: "google/gemma-4-31b-it:free",
      }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
    expect(response.status).toBe(503);
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(captureHandledAiUnavailable).toHaveBeenCalledWith({
      error,
      surface: "workspace_chat_prepare",
      workspaceSlug: "company-handbook",
      status: 503,
      ragErrorCode: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });
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
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
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
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });
});

function routeContext(workspaceSlug = "company-handbook") {
  return {
    params: Promise.resolve({ workspaceSlug }),
  };
}

function jsonRequest(body: unknown, init?: Pick<RequestInit, "signal">) {
  return new Request("http://test.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: init?.signal,
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}
