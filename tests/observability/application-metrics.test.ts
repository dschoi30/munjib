import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { captureMetricCount } from "@/lib/observability/application-metrics";

const sentryMock = vi.hoisted(() => ({
  metrics: {
    count: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  metrics: sentryMock.metrics,
}));

describe("captureMetricCount", () => {
  beforeEach(() => {
    sentryMock.metrics.count.mockReset();
  });

  test("captures a count metric with compacted attributes", () => {
    captureMetricCount("munjib.ai.unavailable", 1, {
      chat_model: undefined,
      chat_provider: "openai-compatible",
      rag_error_code: "RAG_CHAT_REQUEST_FAILED",
      status: 503,
      stream_started: false,
      surface: "ask_document",
    });

    expect(Sentry.metrics.count).toHaveBeenCalledWith("munjib.ai.unavailable", 1, {
      attributes: {
        chat_provider: "openai-compatible",
        rag_error_code: "RAG_CHAT_REQUEST_FAILED",
        status: 503,
        stream_started: false,
        surface: "ask_document",
      },
    });
  });

  test("omits options when no attributes remain", () => {
    captureMetricCount("munjib.document.saved", 1, {
      workspace_slug: undefined,
    });

    expect(Sentry.metrics.count).toHaveBeenCalledWith("munjib.document.saved", 1);
  });

  test("swallows Sentry metrics failures", () => {
    sentryMock.metrics.count.mockImplementationOnce(() => {
      throw new Error("Sentry metrics failed");
    });

    expect(() => captureMetricCount("munjib.ai.unavailable")).not.toThrow();
  });

  test("skips attribute compaction when Sentry metrics count is unavailable", () => {
    const originalCount = sentryMock.metrics.count;
    let attributeReads = 0;
    const attributes = Object.defineProperty({}, "surface", {
      enumerable: true,
      get() {
        attributeReads += 1;
        return "ask_document";
      },
    });

    try {
      delete (sentryMock.metrics as { count?: unknown }).count;

      captureMetricCount("munjib.ai.unavailable", 1, attributes);
    } finally {
      sentryMock.metrics.count = originalCount;
    }

    expect(attributeReads).toBe(0);
  });
});
