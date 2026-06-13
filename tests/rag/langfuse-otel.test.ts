import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeLangfuseOtel } from "@/lib/rag/langfuse-otel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Langfuse OpenTelemetry startup", () => {
  it("does not load OpenTelemetry modules outside explicit full capture", async () => {
    const loadModules = vi.fn();

    await expect(
      initializeLangfuseOtel({
        env: {
          NEXT_RUNTIME: "nodejs",
          LANGFUSE_PUBLIC_KEY: "pk-test",
          LANGFUSE_SECRET_KEY: "sk-test",
          MUNJIB_LANGFUSE_CAPTURE_MODE: "metadata",
        },
        loadModules,
        state: {},
      }),
    ).resolves.toEqual({ started: false, reason: "metadata-capture" });

    expect(loadModules).not.toHaveBeenCalled();
  });

  it("starts a NodeSDK with the Langfuse span processor for full capture", async () => {
    const start = vi.fn();
    const processorInstances: unknown[] = [];
    const sdkConfigs: unknown[] = [];
    class FakeLangfuseSpanProcessor {
      constructor(readonly options: unknown) {
        processorInstances.push(this);
      }
    }
    class FakeNodeSDK {
      constructor(readonly config: unknown) {
        sdkConfigs.push(config);
      }

      start() {
        start();
      }
    }

    await expect(
      initializeLangfuseOtel({
        env: {
          NEXT_RUNTIME: "nodejs",
          LANGFUSE_PUBLIC_KEY: " pk-test ",
          LANGFUSE_SECRET_KEY: " sk-test ",
          LANGFUSE_BASE_URL: " https://langfuse.example.com ",
          LANGFUSE_TRACING_ENVIRONMENT: " production ",
          MUNJIB_LANGFUSE_CAPTURE_MODE: " full ",
        },
        loadModules: vi.fn().mockResolvedValue({
          NodeSDK: FakeNodeSDK,
          LangfuseSpanProcessor: FakeLangfuseSpanProcessor,
        }),
        state: {},
      }),
    ).resolves.toEqual({ started: true, reason: "started" });

    expect(start).toHaveBeenCalledTimes(1);
    expect(processorInstances).toHaveLength(1);
    expect((processorInstances[0] as FakeLangfuseSpanProcessor).options).toEqual({
      publicKey: "pk-test",
      secretKey: "sk-test",
      baseUrl: "https://langfuse.example.com",
      environment: "production",
    });
    expect(sdkConfigs).toEqual([{ spanProcessors: processorInstances }]);
  });

  it("is idempotent once the SDK has started", async () => {
    const start = vi.fn();
    class FakeLangfuseSpanProcessor {}
    class FakeNodeSDK {
      start() {
        start();
      }
    }
    const state = {};
    const input = {
      env: {
        NEXT_RUNTIME: "nodejs",
        LANGFUSE_PUBLIC_KEY: "pk-test",
        LANGFUSE_SECRET_KEY: "sk-test",
        MUNJIB_LANGFUSE_CAPTURE_MODE: "full",
      },
      loadModules: vi.fn().mockResolvedValue({
        NodeSDK: FakeNodeSDK,
        LangfuseSpanProcessor: FakeLangfuseSpanProcessor,
      }),
      state,
    };

    await expect(initializeLangfuseOtel(input)).resolves.toEqual({
      started: true,
      reason: "started",
    });
    await expect(initializeLangfuseOtel(input)).resolves.toEqual({
      started: false,
      reason: "already-started",
    });

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("fails open when startup dependencies throw", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("otel unavailable");

    await expect(
      initializeLangfuseOtel({
        env: {
          NEXT_RUNTIME: "nodejs",
          LANGFUSE_PUBLIC_KEY: "pk-test",
          LANGFUSE_SECRET_KEY: "sk-test",
          MUNJIB_LANGFUSE_CAPTURE_MODE: "full",
        },
        loadModules: vi.fn().mockRejectedValue(error),
        state: {},
      }),
    ).resolves.toEqual({ started: false, reason: "failed" });

    expect(consoleError).toHaveBeenCalledWith("Langfuse OpenTelemetry startup failed:", error);
  });
});
