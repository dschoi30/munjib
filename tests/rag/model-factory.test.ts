import { describe, expect, it } from "vitest";
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
      constructors,
    );

    expect(model).toBeInstanceOf(FakeOllamaEmbeddings);
    expect(model.options).toEqual({
      model: "bge-m3",
      baseUrl: "http://ollama.internal:11434",
    });
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

  it("creates an official OpenAI embedding model with dimensions", () => {
    const model = createEmbeddingModel(
      {
        provider: "openai",
        model: "text-embedding-3-large",
        apiKey: "sk-test",
        dimensions: 1024,
      },
      constructors,
    );

    expect(model).toBeInstanceOf(FakeOpenAIEmbeddings);
    expect(model.options).toEqual({
      model: "text-embedding-3-large",
      apiKey: "sk-test",
      dimensions: 1024,
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

  it("creates an OpenAI-compatible embedding model with custom base URL and dimensions", () => {
    const model = createEmbeddingModel(
      {
        provider: "openai-compatible",
        model: "bge-m3-compatible",
        apiKey: "compat-key",
        baseUrl: "https://models.example.com/v1",
        dimensions: 1024,
      },
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
});
