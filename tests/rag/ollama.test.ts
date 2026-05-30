import { afterEach, describe, expect, it, vi } from "vitest";
import { embedText, chatWithContext } from "@/lib/rag/ollama";
import { getRagConfig } from "@/lib/rag/config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("RAG Ollama client", () => {
  it("uses default model configuration", () => {
    expect(getRagConfig()).toEqual({
      ollamaBaseUrl: "http://localhost:11434",
      chatModel: "gemma4:e4b",
      embedModel: "bge-m3",
      embedDimensions: 1024,
    });
  });

  it("posts embedding requests to Ollama", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(embedText("hello")).resolves.toEqual([0.1, 0.2, 0.3]);
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
});
