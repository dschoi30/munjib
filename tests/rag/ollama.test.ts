import { afterEach, describe, expect, it, vi } from "vitest";
import { chatWithContext, embedText, RAG_ERROR_CODES } from "@/lib/rag/ollama";
import { getRagConfig, RAG_CONFIG_ERROR_CODES } from "@/lib/rag/config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("RAG Ollama client", () => {
  const defaultConfig = {
    ollamaBaseUrl: "http://localhost:11434",
    chatModel: "gemma4:e4b",
    embedModel: "bge-m3",
    embedDimensions: 1024,
  };
  const makeEmbedding = (dimensions = defaultConfig.embedDimensions) =>
    Array.from({ length: dimensions }, (_, index) => index / dimensions);

  it("uses default model configuration", () => {
    expect(getRagConfig()).toEqual(defaultConfig);
  });

  it("falls back to defaults for blank model configuration", () => {
    vi.stubEnv("MUNJIB_OLLAMA_BASE_URL", " ");
    vi.stubEnv("MUNJIB_RAG_CHAT_MODEL", "\n");
    vi.stubEnv("MUNJIB_RAG_EMBED_MODEL", "\t");
    vi.stubEnv("MUNJIB_RAG_EMBED_DIMENSIONS", "  ");

    expect(getRagConfig()).toEqual(defaultConfig);
  });

  it("uses trimmed environment model configuration", () => {
    vi.stubEnv("MUNJIB_OLLAMA_BASE_URL", " http://ollama.internal:11434 ");
    vi.stubEnv("MUNJIB_RAG_CHAT_MODEL", " llama3.2 ");
    vi.stubEnv("MUNJIB_RAG_EMBED_MODEL", " nomic-embed-text ");
    vi.stubEnv("MUNJIB_RAG_EMBED_DIMENSIONS", " 768 ");

    expect(getRagConfig()).toEqual({
      ollamaBaseUrl: "http://ollama.internal:11434",
      chatModel: "llama3.2",
      embedModel: "nomic-embed-text",
      embedDimensions: 768,
    });
  });

  it.each(["NaN", "0", "-1", "1.5"])(
    "throws a stable error for invalid embedding dimensions %s",
    (embedDimensions) => {
      vi.stubEnv("MUNJIB_RAG_EMBED_DIMENSIONS", embedDimensions);

      expect(() => getRagConfig()).toThrow(RAG_CONFIG_ERROR_CODES.INVALID_EMBED_DIMENSIONS);
    },
  );

  it("posts embedding requests to Ollama", async () => {
    const embedding = makeEmbedding();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [embedding] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(embedText("hello")).resolves.toEqual(embedding);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "bge-m3", input: "hello" }),
    });
  });

  it("posts chat requests to Ollama", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: "\n answer \n" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatWithContext("system", "question")).resolves.toBe("answer");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma4:e4b",
        stream: false,
        messages: [
          { role: "system", content: "system" },
          { role: "user", content: "question" },
        ],
      }),
    });
  });

  it("throws a recoverable error when Ollama returns a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "model error",
    }));

    await expect(embedText("hello")).rejects.toThrow("OLLAMA_REQUEST_FAILED");
  });

  it("throws a recoverable error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network failed")));

    await expect(embedText("hello")).rejects.toThrow(RAG_ERROR_CODES.OLLAMA_REQUEST_FAILED);
  });

  it("throws a recoverable error when Ollama returns invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("invalid json");
      },
    }));

    await expect(embedText("hello")).rejects.toThrow(RAG_ERROR_CODES.OLLAMA_REQUEST_FAILED);
  });

  it("throws a stable error when Ollama returns an empty embedding", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [[]] }),
    }));

    await expect(embedText("hello")).rejects.toThrow(RAG_ERROR_CODES.OLLAMA_EMPTY_EMBEDDING);
  });

  it("throws a stable error when embedding dimensions do not match config", async () => {
    vi.stubEnv("MUNJIB_RAG_EMBED_DIMENSIONS", "3");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [[0.1, 0.2]] }),
    }));

    await expect(embedText("hello")).rejects.toThrow(RAG_ERROR_CODES.OLLAMA_INVALID_EMBEDDING);
  });

  it("throws a stable error when embedding values are not finite", async () => {
    vi.stubEnv("MUNJIB_RAG_EMBED_DIMENSIONS", "3");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [[0.1, Number.POSITIVE_INFINITY, 0.3]] }),
    }));

    await expect(embedText("hello")).rejects.toThrow(RAG_ERROR_CODES.OLLAMA_INVALID_EMBEDDING);
  });

  it("throws a stable error when Ollama returns an empty chat response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: "\n  \t" } }),
    }));

    await expect(chatWithContext("system", "question")).rejects.toThrow(
      RAG_ERROR_CODES.OLLAMA_EMPTY_CHAT_RESPONSE,
    );
  });
});
