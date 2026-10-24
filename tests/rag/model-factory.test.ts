import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatModel, createEmbeddingModel } from "@/lib/rag/model-factory";

class FakeChatOllama {
  constructor(readonly options: unknown) {}
}

class FakeOllamaEmbeddings {
  constructor(readonly options: unknown) {}
}

class FakeChatOpenAI {
  constructor(readonly options: unknown) {}
}

class FakeOpenAIEmbeddings {
  constructor(readonly options: unknown) {}
}

const constructors = {
  ChatOllama: FakeChatOllama,
  OllamaEmbeddings: FakeOllamaEmbeddings,
  ChatOpenAI: FakeChatOpenAI,
  OpenAIEmbeddings: FakeOpenAIEmbeddings,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RAG LangChain model factory", () => {
  it("creates an Ollama chat model with model and base URL", () => {
    const model = createChatModel(
      {
        provider: "ollama",
        model: "gemma4:e4b",
        baseUrl: "http://ollama.internal:11434",
      },
      constructors,
    );

    expect(model).toBeInstanceOf(FakeChatOllama);
    expect(model.options).toEqual({
      model: "gemma4:e4b",
      baseUrl: "http://ollama.internal:11434",
    });
  });

  it("creates an Ollama embedding model with model and base URL", () => {
    const model = createEmbeddingModel(
      {
        provider: "ollama",
        model: "bge-m3",
        baseUrl: "http://ollama.internal:11434",
        dimensions: 1024,
      },
      undefined,
      constructors,
    );

    expect(model).toBeInstanceOf(FakeOllamaEmbeddings);
    expect(model.options).toEqual({
      model: "bge-m3",
      baseUrl: "http://ollama.internal:11434",
      onFailedAttempt: expect.any(Function),
    });
  });

  it("binds the lease abort signal to the Ollama HTTP transport", async () => {
    const controller = new AbortController();
    const transport = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", transport);
    const model = createEmbeddingModel(
      {
        provider: "ollama",
        model: "bge-m3",
        baseUrl: "http://ollama.internal:11434",
        dimensions: 1024,
      },
      { signal: controller.signal },
      constructors,
    );

    const options = (model as FakeOllamaEmbeddings).options as { fetch: typeof fetch };
    await options.fetch("http://ollama.internal:11434/api/embed", {});

    expect(transport).toHaveBeenCalledWith(
      "http://ollama.internal:11434/api/embed",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("does not back off and retry an actual Ollama status_code 400 error", async () => {
    vi.useFakeTimers();
    const transport = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      error: "the input length exceeds the context length",
    }), { status: 400, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", transport);
    const model = createEmbeddingModel({
      provider: "ollama", model: "bge-m3", baseUrl: "http://ollama.internal:11434", dimensions: 1024,
    }, { signal: new AbortController().signal });

    const rejection = expect((model as { embedQuery(text: string): Promise<unknown> }).embedQuery("oversized synthetic input")).rejects.toThrow("context length");
    await vi.runAllTimersAsync();
    await rejection;
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("aborts an actual LangChain Ollama embedding request at the HTTP transport", async () => {
    const controller = new AbortController();
    let transportSignal: AbortSignal | null | undefined;
    const transport = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      transportSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        if (transportSignal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        transportSignal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", transport);
    const model = createEmbeddingModel(
      {
        provider: "ollama",
        model: "bge-m3",
        baseUrl: "http://ollama.internal:11434",
        dimensions: 1024,
      },
      { signal: controller.signal },
    );
    (model as unknown as { caller: { maxRetries: number } }).caller.maxRetries = 0;

    const request = (model as { embedQuery(text: string): Promise<unknown> }).embedQuery(
      "pending trial question",
    );
    await vi.waitFor(() => expect(transport).toHaveBeenCalled());
    controller.abort();

    await expect(request).rejects.toThrow();
    expect(transportSignal?.aborted).toBe(true);
  });

  it("creates an official OpenAI chat model with model and API key", () => {
    const model = createChatModel(
      {
        provider: "openai",
        model: "gpt-4.1-mini",
        apiKey: "sk-test",
      },
      constructors,
    );

    expect(model).toBeInstanceOf(FakeChatOpenAI);
    expect(model.options).toEqual({
      model: "gpt-4.1-mini",
      apiKey: "sk-test",
    });
  });

  it("passes an official OpenAI base URL override to chat models", () => {
    const model = createChatModel(
      {
        provider: "openai",
        model: "gpt-4.1-mini",
        apiKey: "sk-test",
        baseUrl: "https://openai-proxy.example.com/v1",
      },
      constructors,
    );

    expect(model).toBeInstanceOf(FakeChatOpenAI);
    expect(model.options).toEqual({
      model: "gpt-4.1-mini",
      apiKey: "sk-test",
      configuration: {
        baseURL: "https://openai-proxy.example.com/v1",
      },
    });
  });

  it("creates an official OpenAI embedding model with dimensions", () => {
    const model = createEmbeddingModel(
      {
        provider: "openai",
        model: "text-embedding-3-large",
        apiKey: "sk-test",
        dimensions: 1024,
      },
      undefined,
      constructors,
    );

    expect(model).toBeInstanceOf(FakeOpenAIEmbeddings);
    expect(model.options).toEqual({
      model: "text-embedding-3-large",
      apiKey: "sk-test",
      dimensions: 1024,
    });
  });

  it("binds the lease abort signal to the OpenAI HTTP transport", async () => {
    const controller = new AbortController();
    const transport = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", transport);
    const model = createEmbeddingModel(
      {
        provider: "openai",
        model: "text-embedding-3-large",
        apiKey: "sk-test",
        dimensions: 1024,
      },
      { signal: controller.signal },
      constructors,
    );

    const options = (model as FakeOpenAIEmbeddings).options as {
      configuration: { fetch: typeof fetch };
    };
    await options.configuration.fetch("https://api.openai.com/v1/embeddings", {});

    expect(transport).toHaveBeenCalledWith(
      "https://api.openai.com/v1/embeddings",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("aborts an actual LangChain OpenAI embedding request at the HTTP transport", async () => {
    const controller = new AbortController();
    let transportSignal: AbortSignal | null | undefined;
    const transport = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      transportSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        if (transportSignal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        transportSignal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", transport);
    const model = createEmbeddingModel(
      {
        provider: "openai",
        model: "text-embedding-3-large",
        apiKey: "sk-test",
        dimensions: 1024,
      },
      { signal: controller.signal },
    );
    (model as unknown as { caller: { maxRetries: number } }).caller.maxRetries = 0;

    const request = (model as { embedQuery(text: string): Promise<unknown> }).embedQuery(
      "pending trial question",
    );
    await vi.waitFor(() => expect(transport).toHaveBeenCalled());
    controller.abort();

    await expect(request).rejects.toThrow();
    expect(transportSignal?.aborted).toBe(true);
  });

  it("passes an official OpenAI base URL override to embedding models", () => {
    const model = createEmbeddingModel(
      {
        provider: "openai",
        model: "text-embedding-3-large",
        apiKey: "sk-test",
        baseUrl: "https://openai-proxy.example.com/v1",
        dimensions: 1024,
      },
      undefined,
      constructors,
    );

    expect(model).toBeInstanceOf(FakeOpenAIEmbeddings);
    expect(model.options).toEqual({
      model: "text-embedding-3-large",
      apiKey: "sk-test",
      dimensions: 1024,
      configuration: {
        baseURL: "https://openai-proxy.example.com/v1",
      },
    });
  });

  it("creates an OpenAI-compatible chat model with custom base URL", () => {
    const model = createChatModel(
      {
        provider: "openai-compatible",
        model: "qwen2.5",
        apiKey: "compat-key",
        baseUrl: "https://models.example.com/v1",
      },
      constructors,
    );

    expect(model).toBeInstanceOf(FakeChatOpenAI);
    expect(model.options).toEqual({
      model: "qwen2.5",
      apiKey: "compat-key",
      configuration: {
        baseURL: "https://models.example.com/v1",
      },
    });
  });

  it("uses a non-secret placeholder key for unauthenticated OpenAI-compatible chat endpoints", () => {
    const model = createChatModel(
      {
        provider: "openai-compatible",
        model: "qwen2.5",
        baseUrl: "http://localhost:1234/v1",
      },
      constructors,
    );

    expect(model).toBeInstanceOf(FakeChatOpenAI);
    expect(model.options).toEqual({
      model: "qwen2.5",
      apiKey: "not-needed",
      configuration: {
        baseURL: "http://localhost:1234/v1",
      },
    });
  });

  it("creates an OpenAI-compatible embedding model with custom base URL and dimensions", () => {
    const model = createEmbeddingModel(
      {
        provider: "openai-compatible",
        model: "bge-m3-compatible",
        apiKey: "compat-key",
        baseUrl: "https://models.example.com/v1",
        dimensions: 1024,
      },
      undefined,
      constructors,
    );

    expect(model).toBeInstanceOf(FakeOpenAIEmbeddings);
    expect(model.options).toEqual({
      model: "bge-m3-compatible",
      apiKey: "compat-key",
      dimensions: 1024,
      configuration: {
        baseURL: "https://models.example.com/v1",
      },
    });
  });

  it("uses a non-secret placeholder key for unauthenticated OpenAI-compatible embedding endpoints", () => {
    const model = createEmbeddingModel(
      {
        provider: "openai-compatible",
        model: "bge-m3-compatible",
        baseUrl: "http://localhost:1234/v1",
        dimensions: 1024,
      },
      undefined,
      constructors,
    );

    expect(model).toBeInstanceOf(FakeOpenAIEmbeddings);
    expect(model.options).toEqual({
      model: "bge-m3-compatible",
      apiKey: "not-needed",
      dimensions: 1024,
      configuration: {
        baseURL: "http://localhost:1234/v1",
      },
    });
  });
});
