import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureHandledAiUnavailable,
  captureTrialAiFailure,
} from "@/lib/observability/ai-unavailable";
import { RAG_ERROR_CODES } from "@/lib/rag/errors";

type ScopeMock = {
  setContext: ReturnType<typeof vi.fn>;
  setFingerprint: ReturnType<typeof vi.fn>;
  setLevel: ReturnType<typeof vi.fn>;
  setTag: ReturnType<typeof vi.fn>;
};

const sentryMock = vi.hoisted(() => {
  const scope: ScopeMock = {
    setContext: vi.fn(),
    setFingerprint: vi.fn(),
    setLevel: vi.fn(),
    setTag: vi.fn(),
  };

  return {
    captureException: vi.fn(),
    metrics: {
      count: vi.fn(),
    },
    scope,
    withScope: vi.fn((callback: (activeScope: ScopeMock) => void) => callback(scope)),
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryMock.captureException,
  metrics: sentryMock.metrics,
  withScope: sentryMock.withScope,
}));

describe("captureHandledAiUnavailable", () => {
  beforeEach(() => {
    sentryMock.captureException.mockReset();
    sentryMock.metrics.count.mockReset();
    sentryMock.scope.setContext.mockReset();
    sentryMock.scope.setFingerprint.mockReset();
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
      streamStarted: true,
      ragErrorCode: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });

    expect(Sentry.withScope).toHaveBeenCalledTimes(1);
    expect(sentryMock.scope.setLevel).toHaveBeenCalledWith("error");
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith("ai.surface", "ask_document");
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith("ai.status", "503");
    expect(sentryMock.scope.setTag).toHaveBeenCalledWith("ai.stream_started", "true");
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
      stream_started: true,
      surface: "ask_document",
      workspace_slug: "company-handbook",
    });
    expect(sentryMock.scope.setFingerprint).toHaveBeenCalledWith([
      "handled-ai-unavailable",
      "ask_document",
      RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
    ]);

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.metrics.count).toHaveBeenCalledWith("munjib.ai.unavailable", 1, {
      attributes: {
        chat_provider: "openai-compatible",
        rag_error_code: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
        status: 503,
        stream_started: true,
        surface: "ask_document",
      },
    });
    const capturedError = sentryMock.captureException.mock.calls[0]?.[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError.name).toBe("HandledAiUnavailableError");
    expect(capturedError.message).toBe("Handled AI provider failure returned AI_UNAVAILABLE");
    expect(capturedError.cause).toBeUndefined();
    expect(capturedError.message).not.toContain("raw details");
  });

  test("captures Trial failures with only approved coarse dimensions", () => {
    captureTrialAiFailure({
      surface: "workspace_chat",
      resultCode: "AI_UNAVAILABLE",
      remaining: 1,
      error: new Error("raw provider response and prompt"),
      workspaceSlug: "secret-workspace",
      chatProvider: "secret-provider",
      chatModel: "secret-model",
    } as never);

    expect(Sentry.metrics.count).toHaveBeenCalledWith("munjib.trial_ai.result", 1, {
      attributes: {
        anonymous_trial: true,
        remaining_bucket: "available",
        result_code: "AI_UNAVAILABLE",
        surface: "workspace_chat",
      },
    });
    expect(Sentry.withScope).not.toHaveBeenCalled();
    expect(JSON.stringify(sentryMock)).not.toContain("raw provider response");
    expect(JSON.stringify(sentryMock)).not.toContain("secret-workspace");
    expect(JSON.stringify(sentryMock)).not.toContain("secret-provider");
    expect(JSON.stringify(sentryMock)).not.toContain("secret-model");
  });

  test("names provider configuration failures distinctly", () => {
    captureHandledAiUnavailable({
      error: new Error("missing base url"),
      surface: "ask_document",
      workspaceSlug: "company-handbook",
      status: 503,
      ragErrorCode: RAG_ERROR_CODES.INVALID_CONFIG,
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });

    expect(sentryMock.scope.setContext).toHaveBeenCalledWith("ai_unavailable", {
      chat_model: "google/gemma-4-31b-it:free",
      chat_provider: "openai-compatible",
      rag_error_code: RAG_ERROR_CODES.INVALID_CONFIG,
      status: 503,
      surface: "ask_document",
      workspace_slug: "company-handbook",
    });
    expect(sentryMock.scope.setFingerprint).toHaveBeenCalledWith([
      "handled-ai-unavailable",
      "ask_document",
      RAG_ERROR_CODES.INVALID_CONFIG,
    ]);
    const capturedError = sentryMock.captureException.mock.calls[0]?.[0];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError.name).toBe("HandledAiConfigurationError");
    expect(capturedError.message).toBe(
      "Handled AI provider configuration failure returned AI_UNAVAILABLE",
    );
    expect(capturedError.message).not.toContain("missing base url");
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
    expect(sentryMock.scope.setFingerprint).toHaveBeenCalledWith([
      "handled-ai-unavailable",
      "workspace_chat_prepare",
      RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
    ]);
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
