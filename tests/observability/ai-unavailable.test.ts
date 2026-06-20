import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { captureHandledAiUnavailable } from "@/lib/observability/ai-unavailable";
import { RAG_ERROR_CODES } from "@/lib/rag/errors";

const sentryMock = vi.hoisted(() => {
  const scope = {
    setContext: vi.fn(),
    setLevel: vi.fn(),
    setTag: vi.fn(),
  };

  return {
    captureException: vi.fn(),
    scope,
    withScope: vi.fn((callback: (scope: typeof scope) => void) => callback(scope)),
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryMock.captureException,
  withScope: sentryMock.withScope,
}));

describe("captureHandledAiUnavailable", () => {
  beforeEach(() => {
    sentryMock.captureException.mockReset();
    sentryMock.scope.setContext.mockReset();
    sentryMock.scope.setLevel.mockReset();
    sentryMock.scope.setTag.mockReset();
    sentryMock.withScope.mockReset();
    sentryMock.withScope.mockImplementation((callback) => callback(sentryMock.scope));
  });

  test("captures a sanitized handled AI unavailable event", () => {
    captureHandledAiUnavailable({
      error: new Error("provider response included raw details"),
      surface: "ask_document",
      workspaceSlug: "company-handbook",
      status: 503,
      ragErrorCode: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });

    expect(Sentry.withScope).toHaveBeenCalledTimes(1);
    expect(sentryMock.scope.setLevel).toHaveBeenCalledWith("error");
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith("ai.surface", "ask_document");
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith("ai.status", "503");
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith(
      "ai.rag_error_code",
      RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
    );
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith("ai.chat_provider", "openai-compatible");
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith(
      "ai.chat_model",
      "google/gemma-4-31b-it:free",
    );
    expect(sentryMock.scope.setContext).toHaveBeenCalledWith("ai_unavailable", {
      chat_model: "google/gemma-4-31b-it:free",
      chat_provider: "openai-compatible",
      rag_error_code: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      status: 503,
      surface: "ask_document",
      workspace_slug: "company-handbook",
    });

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    const capturedError = sentryMock.captureException.mock.calls[0]?.[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError.name).toBe("HandledAiUnavailableError");
    expect(capturedError.message).toBe("Handled AI provider failure returned AI_UNAVAILABLE");
    expect(capturedError.cause).toBeUndefined();
    expect(capturedError.message).not.toContain("raw details");
  });

  test("omits optional provider and model fields when unknown", () => {
    captureHandledAiUnavailable({
      error: new Error("provider response included raw details"),
      surface: "workspace_chat_prepare",
      workspaceSlug: "company-handbook",
      ragErrorCode: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
    });

    expect(sentryMock.scope.setTag).not.toHaveBeenCalledWith("ai.chat_provider", expect.anything());
    expect(sentryMock.scope.setTag).not.toHaveBeenCalledWith("ai.chat_model", expect.anything());
    expect(sentryMock.scope.setContext).toHaveBeenCalledWith("ai_unavailable", {
      rag_error_code: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      surface: "workspace_chat_prepare",
      workspace_slug: "company-handbook",
    });
  });

  test("swallows Sentry SDK failures", () => {
    sentryMock.withScope.mockImplementation(() => {
      throw new Error("Sentry SDK failed");
    });

    expect(() =>
      captureHandledAiUnavailable({
        error: new Error("provider response included raw details"),
        surface: "workspace_chat_stream",
        workspaceSlug: "company-handbook",
        status: 503,
        ragErrorCode: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
        chatProvider: "openai-compatible",
        chatModel: "google/gemma-4-31b-it:free",
      }),
    ).not.toThrow();
  });
});
