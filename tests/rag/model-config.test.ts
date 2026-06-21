import { afterEach, describe, expect, it, vi } from "vitest";
import { getRagConfig } from "@/lib/rag/config";
import { isRagRuntimeError, RAG_ERROR_CODES } from "@/lib/rag/errors";
import {
  CURRENT_EMBEDDING_INDEX,
  getDefaultRagChatModel,
  getRagGenerationConfig,
  getRagModelConfig,
  RAG_CONFIG_ERROR_CODES,
} from "@/lib/rag/model-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RAG model configuration", () => {
  it("preserves the current Ollama defaults and legacy config shape", () => {
    expect(CURRENT_EMBEDDING_INDEX).toEqual({
      provider: "ollama",
      model: "bge-m3",
      dimensions: 1024,
      indexId: "bge-m3",
    });
    expect(getRagModelConfig()).toEqual({
      chat: {
        provider: "ollama",
        model: "gemma4:e4b",
        baseUrl: "http://localhost:11434",
      },
      embedding: {
        provider: "ollama",
        model: "bge-m3",
        dimensions: 1024,
        baseUrl: "http://localhost:11434",
        indexId: "bge-m3",
        isCurrentIndexedIdentity: true,
        indexCompatible: true,
      },
      langfuse: {
        enabled: false,
        capture: "metadata",
        captureMode: "metadata",
        environment: "development",
      },
    });
    expect(getRagConfig()).toEqual({
      ollamaBaseUrl: "http://localhost:11434",
      chatModel: "gemma4:e4b",
      embedModel: "bge-m3",
      embedDimensions: 1024,
    });
  });

  it("reads the default chat model for display without requiring provider credentials", () => {
    vi.stubEnv("MUNJIB_RAG_CHAT_PROVIDER", "openai-compatible");
    vi.stubEnv("MUNJIB_RAG_CHAT_MODEL", "openrouter/fusion");
    vi.stubEnv("MUNJIB_OPENAI_COMPATIBLE_BASE_URL", "");

    expect(getDefaultRagChatModel()).toBe("openrouter/fusion");
  });

  it("falls back to the Ollama default display model when no chat model env is set", () => {
    vi.stubEnv("MUNJIB_RAG_CHAT_MODEL", "");

    expect(getDefaultRagChatModel()).toBe("gemma4:e4b");
  });

  it("reads chat generation config without validating embedding index settings", () => {
    vi.stubEnv("MUNJIB_RAG_EMBED_DIMENSIONS", "768");

    expect(getRagGenerationConfig()).toEqual({
      chat: {
        provider: "ollama",
        model: "gemma4:e4b",
        baseUrl: "http://localhost:11434",
      },
      langfuse: {
        enabled: false,
        capture: "metadata",
        captureMode: "metadata",
        environment: "development",
      },
    });
    expect(() => getRagModelConfig()).toThrow(RAG_CONFIG_ERROR_CODES.INVALID_CONFIG);
  });

  it("builds runtime chat provider overrides independently from the default provider", () => {
    vi.stubEnv("MUNJIB_RAG_CHAT_PROVIDER", "ollama");
    vi.stubEnv("MUNJIB_RAG_CHAT_MODEL", "gemma4:e4b");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai");
    vi.stubEnv("MUNJIB_OPENAI_COMPATIBLE_BASE_URL", "https://openrouter.ai/api/v1");
    vi.stubEnv("MUNJIB_OPENAI_COMPATIBLE_API_KEY", "sk-openrouter");

    expect(
      getRagGenerationConfig(process.env, {
        provider: "openai",
        model: "gpt-4.1-mini",
      }).chat,
    ).toEqual({
      provider: "openai",
      model: "gpt-4.1-mini",
      apiKey: "sk-openai",
    });
    expect(
      getRagGenerationConfig(process.env, {
        provider: "openai-compatible",
        model: "google/gemma-4-31b-it:free",
      }).chat,
    ).toEqual({
      provider: "openai-compatible",
      model: "google/gemma-4-31b-it:free",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-openrouter",
    });
    expect(getRagGenerationConfig().chat).toEqual({
      provider: "ollama",
      model: "gemma4:e4b",
      baseUrl: "http://localhost:11434",
    });
  });

  it("uses trimmed official OpenAI chat environment values", () => {
    vi.stubEnv("MUNJIB_RAG_CHAT_PROVIDER", " openai ");
    vi.stubEnv("MUNJIB_RAG_CHAT_MODEL", " gpt-4.1-mini ");
    vi.stubEnv("MUNJIB_OPENAI_BASE_URL", " https://api.openai.example/v1 ");
    vi.stubEnv("OPENAI_API_KEY", " sk-test ");

    expect(getRagModelConfig().chat).toEqual({
      provider: "openai",
      model: "gpt-4.1-mini",
      baseUrl: "https://api.openai.example/v1",
      apiKey: "sk-test",
    });
  });

  it("uses OpenAI-compatible base URL and API key while marking a non-current embedding identity incompatible", () => {
    vi.stubEnv("MUNJIB_RAG_EMBED_PROVIDER", " openai-compatible ");
    vi.stubEnv("MUNJIB_RAG_EMBED_MODEL", " text-embedding-3-large ");
    vi.stubEnv("MUNJIB_OPENAI_COMPATIBLE_BASE_URL", " https://llm.example.test/v1 ");
    vi.stubEnv("MUNJIB_OPENAI_COMPATIBLE_API_KEY", " compat-key ");

    expect(getRagModelConfig().embedding).toEqual({
      provider: "openai-compatible",
      model: "text-embedding-3-large",
      dimensions: 1024,
      baseUrl: "https://llm.example.test/v1",
      apiKey: "compat-key",
      indexId: "openai-compatible:text-embedding-3-large:1024",
      isCurrentIndexedIdentity: false,
      indexCompatible: false,
    });
  });

  it("allows OpenAI-compatible providers without an API key for local deployments", () => {
    vi.stubEnv("MUNJIB_RAG_CHAT_PROVIDER", " openai-compatible ");
    vi.stubEnv("MUNJIB_RAG_CHAT_MODEL", " llama3.1 ");
    vi.stubEnv("MUNJIB_OPENAI_COMPATIBLE_BASE_URL", " http://localhost:1234/v1 ");

    expect(getRagModelConfig().chat).toEqual({
      provider: "openai-compatible",
      model: "llama3.1",
      baseUrl: "http://localhost:1234/v1",
    });
  });

  it.each([
    ["MUNJIB_RAG_CHAT_PROVIDER", "anthropic"],
    ["MUNJIB_RAG_EMBED_PROVIDER", "azure-openai"],
  ])("rejects unsupported provider %s=%s", (name, value) => {
    vi.stubEnv(name, value);

    expect(() => getRagModelConfig()).toThrow(RAG_CONFIG_ERROR_CODES.INVALID_CONFIG);
  });

  it.each(["768", "0", "-1", "1.5", "not-a-number"])(
    "rejects non-1024 embedding dimensions %s",
    (dimensions) => {
      vi.stubEnv("MUNJIB_RAG_EMBED_DIMENSIONS", dimensions);

      expect(() => getRagModelConfig()).toThrow(RAG_CONFIG_ERROR_CODES.INVALID_CONFIG);
    },
  );

  it.each([
    ["official OpenAI API key", { MUNJIB_RAG_CHAT_PROVIDER: "openai", MUNJIB_RAG_CHAT_MODEL: "gpt-4.1-mini" }],
    [
      "OpenAI-compatible base URL",
      {
        MUNJIB_RAG_CHAT_PROVIDER: "openai-compatible",
        MUNJIB_RAG_CHAT_MODEL: "llama3.1",
        MUNJIB_OPENAI_COMPATIBLE_API_KEY: "compat-key",
      },
    ],
  ])("rejects missing required %s", (_label, env) => {
    for (const [name, value] of Object.entries(env)) {
      vi.stubEnv(name, value);
    }

    expect(() => getRagModelConfig()).toThrow(RAG_CONFIG_ERROR_CODES.INVALID_CONFIG);
  });

  it("enables Langfuse with full capture only through explicit env", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", " pk-test ");
    vi.stubEnv("LANGFUSE_SECRET_KEY", " sk-test ");
    vi.stubEnv("LANGFUSE_BASEURL", " https://cloud.langfuse.com ");
    vi.stubEnv("MUNJIB_LANGFUSE_CAPTURE", " full ");

    expect(getRagModelConfig().langfuse).toEqual({
      enabled: true,
      capture: "full",
      captureMode: "full",
      environment: "development",
      publicKey: "pk-test",
      secretKey: "sk-test",
      baseUrl: "https://cloud.langfuse.com",
      host: "https://cloud.langfuse.com",
    });
  });

  it("accepts the Langfuse base URL alias used by environment examples", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", " pk-test ");
    vi.stubEnv("LANGFUSE_SECRET_KEY", " sk-test ");
    vi.stubEnv("LANGFUSE_BASE_URL", " https://langfuse.example.com ");
    vi.stubEnv("MUNJIB_LANGFUSE_CAPTURE_MODE", " full ");

    expect(getRagModelConfig().langfuse).toMatchObject({
      enabled: true,
      capture: "full",
      captureMode: "full",
      baseUrl: "https://langfuse.example.com",
      host: "https://langfuse.example.com",
    });
  });

  it("keeps Langfuse disabled when the explicit disable flag is set with credentials present", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", " pk-test ");
    vi.stubEnv("LANGFUSE_SECRET_KEY", " sk-test ");
    vi.stubEnv("MUNJIB_LANGFUSE_ENABLED", " false ");
    vi.stubEnv("MUNJIB_LANGFUSE_CAPTURE_MODE", " full ");

    expect(getRagModelConfig().langfuse).toMatchObject({
      enabled: false,
      capture: "full",
      captureMode: "full",
    });
  });

  it("honors the legacy full Langfuse capture alias even when capture mode defaults to metadata", () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", " pk-test ");
    vi.stubEnv("LANGFUSE_SECRET_KEY", " sk-test ");
    vi.stubEnv("MUNJIB_LANGFUSE_CAPTURE_MODE", " metadata ");
    vi.stubEnv("MUNJIB_LANGFUSE_CAPTURE", " full ");

    expect(getRagModelConfig().langfuse).toMatchObject({
      enabled: true,
      capture: "full",
      captureMode: "full",
    });
  });

  it("recognizes provider-neutral RAG runtime error codes", () => {
    expect(isRagRuntimeError(RAG_ERROR_CODES.INVALID_EMBEDDING)).toBe(true);
    expect(isRagRuntimeError(RAG_ERROR_CODES.EMBEDDING_INDEX_INCOMPATIBLE)).toBe(true);
    expect(isRagRuntimeError("SOME_OTHER_ERROR")).toBe(false);
  });
});
