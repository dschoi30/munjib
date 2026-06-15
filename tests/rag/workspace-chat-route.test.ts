import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as GET_THREAD } from "@/app/api/workspaces/[workspaceSlug]/assistant/thread/route";
import { POST as POST_MESSAGE } from "@/app/api/workspaces/[workspaceSlug]/assistant/messages/route";
import { POST as POST_RESET } from "@/app/api/workspaces/[workspaceSlug]/assistant/thread/reset/route";
import { requireCurrentUser } from "@/lib/auth/session";
import { RAG_ERROR_CODES } from "@/lib/rag/errors";
import {
  getOrCreateWorkspaceChatThread,
  resetWorkspaceChatThread,
  sendWorkspaceChatMessage,
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
  resetWorkspaceChatThread: vi.fn(),
  sendWorkspaceChatMessage: vi.fn(),
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
    vi.mocked(sendWorkspaceChatMessage).mockResolvedValue({
      thread,
      userMessage,
      assistantMessage,
      citations,
    });
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

  it("sends a workspace chat message with selected document pass-through", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({
        message: "  What changed?  ",
        selectedDocumentId: "doc-1",
        chatModel: "google/gemma-4-31b-it:free",
      }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({
      thread: jsonThread(),
      userMessage: jsonMessage(userMessage),
      assistantMessage: jsonMessage(assistantMessage),
      citations,
    });
    expect(response.status).toBe(200);
    expect(sendWorkspaceChatMessage).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      actorId: "user-1",
      message: "What changed?",
      selectedDocumentId: "doc-1",
      chatModelOverride: "google/gemma-4-31b-it:free",
    });
  });

  it("rejects invalid chat model overrides before calling the service", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({
        message: "What changed?",
        chatModel: "bad model",
      }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({ error: "INVALID_CHAT_MODEL" });
    expect(response.status).toBe(400);
    expect(sendWorkspaceChatMessage).not.toHaveBeenCalled();
  });

  it("rejects a blank message before calling the service", async () => {
    const response = await POST_MESSAGE(jsonRequest({ message: "   " }), routeContext());

    await expect(response.json()).resolves.toEqual({
      error: WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED,
    });
    expect(response.status).toBe(400);
    expect(sendWorkspaceChatMessage).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before calling the service", async () => {
    const response = await POST_MESSAGE(
      new Request("http://test.local", {
        method: "POST",
        body: "{",
      }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({ error: "INVALID_JSON" });
    expect(response.status).toBe(400);
    expect(sendWorkspaceChatMessage).not.toHaveBeenCalled();
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

  it("returns a generic unavailable response for RAG runtime failures", async () => {
    vi.mocked(sendWorkspaceChatMessage).mockRejectedValueOnce(
      new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED),
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
    expect(response.status).toBe(503);
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

  it("maps archived thread races to a stable conflict response", async () => {
    vi.mocked(sendWorkspaceChatMessage).mockRejectedValueOnce(
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
