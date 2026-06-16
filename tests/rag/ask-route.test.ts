import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route";
import { requireCurrentUser } from "@/lib/auth/session";
import { ASK_ERROR_CODES, askDocumentQuestion } from "@/lib/rag/ask";
import { RAG_ERROR_CODES } from "@/lib/rag/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rag/ask", () => ({
  ASK_ERROR_CODES: { QUESTION_REQUIRED: "QUESTION_REQUIRED" },
  askDocumentQuestion: vi.fn(),
}));

describe("RAG ask route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
    });
    vi.mocked(askDocumentQuestion).mockResolvedValue({
      answer: "Saved answer",
      citations: [],
    });
  });

  it("does not swallow auth redirects", async () => {
    const redirectError = new Error("NEXT_REDIRECT");
    vi.mocked(requireCurrentUser).mockRejectedValueOnce(redirectError);

    await expect(
      POST(jsonRequest({ question: "What is saved?" }), {
        params: Promise.resolve({ workspaceSlug: "company-handbook", documentId: "doc-1" }),
      }),
    ).rejects.toBe(redirectError);

    expect(askDocumentQuestion).not.toHaveBeenCalled();
  });

  it("treats malformed JSON as a missing question", async () => {
    vi.mocked(askDocumentQuestion).mockRejectedValueOnce(new Error(ASK_ERROR_CODES.QUESTION_REQUIRED));

    const response = await POST(new Request("http://test.local", {
      method: "POST",
      body: "{",
    }), {
      params: Promise.resolve({ workspaceSlug: "company-handbook", documentId: "doc-1" }),
    });

    await expect(response.json()).resolves.toEqual({ error: "QUESTION_REQUIRED" });
    expect(response.status).toBe(400);
    expect(askDocumentQuestion).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      documentId: "doc-1",
      actorId: "user-1",
      question: "",
    });
  });

  it("passes the question and valid chat model override to the ask service", async () => {
    await POST(jsonRequest({
      question: "What is saved?",
      chatProvider: "openai-compatible",
      chatModel: "moonshotai/kimi-k2.7-code",
      draftTitle: "Unsaved",
      draftContentMarkdown: "Do not send me",
      contentMarkdown: "Draft body",
    }), {
      params: Promise.resolve({ workspaceSlug: "company-handbook", documentId: "doc-1" }),
    });

    expect(askDocumentQuestion).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      documentId: "doc-1",
      actorId: "user-1",
      question: "What is saved?",
      chatProviderOverride: "openai-compatible",
      chatModelOverride: "moonshotai/kimi-k2.7-code",
    });
  });

  it("rejects invalid chat model override input", async () => {
    const response = await POST(jsonRequest({
      question: "What is saved?",
      chatModel: "bad model",
    }), {
      params: Promise.resolve({ workspaceSlug: "company-handbook", documentId: "doc-1" }),
    });

    await expect(response.json()).resolves.toEqual({ error: "INVALID_CHAT_MODEL" });
    expect(response.status).toBe(400);
    expect(askDocumentQuestion).not.toHaveBeenCalled();
  });

  it("treats null chat model override as absent", async () => {
    await POST(jsonRequest({
      question: "What is saved?",
      chatModel: null,
    }), {
      params: Promise.resolve({ workspaceSlug: "company-handbook", documentId: "doc-1" }),
    });

    expect(askDocumentQuestion).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      documentId: "doc-1",
      actorId: "user-1",
      question: "What is saved?",
    });
  });

  it("returns a generic unavailable response for RAG runtime failures", async () => {
    vi.mocked(askDocumentQuestion).mockRejectedValueOnce(
      new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED),
    );

    const response = await POST(jsonRequest({ question: "What is saved?" }), {
      params: Promise.resolve({ workspaceSlug: "company-handbook", documentId: "doc-1" }),
    });

    await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
    expect(response.status).toBe(503);
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://test.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
