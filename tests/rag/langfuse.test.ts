import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLangfuseCallbackConfig,
  type LangfuseCallbackFactory,
} from "@/lib/rag/langfuse";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RAG Langfuse callback config", () => {
  it("returns no callbacks when tracing is disabled", () => {
    const config = createLangfuseCallbackConfig({
      enabled: false,
      chatProvider: "ollama",
      chatModel: "gemma4:e4b",
      embeddingProvider: "ollama",
      embeddingModel: "bge-m3",
      embeddingDimensions: 1024,
    });

    expect(config.callbacks).toEqual([]);
  });

  it("attaches callbacks and metadata when tracing is enabled", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-test");
    const callback = { handler: "fake-langfuse" };
    const callbackFactory: LangfuseCallbackFactory = vi.fn(() => callback);

    const config = createLangfuseCallbackConfig({
      enabled: true,
      callbackFactory,
      operation: "rag.answer",
      chatProvider: "ollama",
      chatModel: "gemma4:e4b",
      embeddingProvider: "ollama",
      embeddingModel: "bge-m3",
      embeddingDimensions: 1024,
      retrievedChunkCount: 3,
      citationDocumentIds: ["doc-1", "doc-2", "doc-1"],
      citationChunkIds: ["chunk-1"],
      errorCode: "RAG_CHAT_REQUEST_FAILED",
      metadata: { workspaceSlug: "handbook", selectedDocumentId: "doc-1" },
    });

    expect(config.callbacks).toEqual([callback]);
    expect(config.metadata).toEqual({
      operation: "rag.answer",
      chatProvider: "ollama",
      chatModel: "gemma4:e4b",
      embeddingProvider: "ollama",
      embeddingModel: "bge-m3",
      embeddingDimensions: 1024,
      retrievedChunkCount: 3,
      citationDocumentIds: ["doc-1", "doc-2"],
      citationChunkIds: ["chunk-1"],
      errorCode: "RAG_CHAT_REQUEST_FAILED",
      workspaceSlug: "handbook",
      selectedDocumentId: "doc-1",
      captureMode: "metadata",
    });
    expect(callbackFactory).toHaveBeenCalledWith({
      publicKey: "pk-test",
      secretKey: "sk-test",
      baseUrl: undefined,
    });
  });

  it("omits prompt, question, answer, and raw context in metadata capture mode", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-test");

    const config = createLangfuseCallbackConfig({
      enabled: true,
      callbackFactory: vi.fn(() => ({ handler: "fake-langfuse" })),
      chatProvider: "ollama",
      chatModel: "gemma4:e4b",
      embeddingProvider: "ollama",
      embeddingModel: "bge-m3",
      embeddingDimensions: 1024,
      metadata: {
        systemPrompt: "secret prompt",
        userPrompt: "saved chunk text",
        prompt: "full prompt",
        question: "raw user question",
        answer: "raw model answer",
        rawContext: "raw saved content",
        retrievedChunkText: "retrieved chunk body",
        workspaceSlug: "handbook",
      },
    });

    const serialized = JSON.stringify(config.metadata);
    expect(serialized).toContain("handbook");
    expect(serialized).not.toContain("secret prompt");
    expect(serialized).not.toContain("saved chunk text");
    expect(serialized).not.toContain("full prompt");
    expect(serialized).not.toContain("raw user question");
    expect(serialized).not.toContain("raw model answer");
    expect(serialized).not.toContain("raw saved content");
    expect(serialized).not.toContain("retrieved chunk body");
  });

  it("continues without callbacks when enabled tracing cannot create a handler", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-test");

    const config = createLangfuseCallbackConfig({
      enabled: true,
      callbackFactory: () => {
        throw new Error("Langfuse unavailable");
      },
      chatProvider: "ollama",
      chatModel: "gemma4:e4b",
      embeddingProvider: "ollama",
      embeddingModel: "bge-m3",
      embeddingDimensions: 1024,
    });

    expect(config.callbacks).toEqual([]);
  });
});
