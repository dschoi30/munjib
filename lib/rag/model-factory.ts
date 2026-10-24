import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { providerErrorStatus } from "@/lib/rag/errors";
import type {
  RagChatModelConfig,
  RagEmbeddingModelConfig,
} from "@/lib/rag/model-config";

export type RagModelProvider = "ollama" | "openai" | "openai-compatible";
export type RagEmbeddingFactoryConfig = Pick<
  RagEmbeddingModelConfig,
  "provider" | "model" | "baseUrl" | "apiKey" | "dimensions"
>;

export type EmbeddingTransportOptions = Readonly<{ signal?: AbortSignal }>;

type ModelConstructor = new (options: unknown) => unknown;

export type LangChainModelConstructors = {
  ChatOllama: ModelConstructor;
  OllamaEmbeddings: ModelConstructor;
  ChatOpenAI: ModelConstructor;
  OpenAIEmbeddings: ModelConstructor;
};

type ChatConstructors = Pick<LangChainModelConstructors, "ChatOllama" | "ChatOpenAI">;
type EmbeddingConstructors = Pick<
  LangChainModelConstructors,
  "OllamaEmbeddings" | "OpenAIEmbeddings"
>;
type ConstructorInstance<T> = T extends new (...args: any[]) => infer Instance ? Instance : never;

const OPENAI_COMPATIBLE_PLACEHOLDER_API_KEY = "not-needed";

const defaultConstructors: LangChainModelConstructors = {
  ChatOllama: ChatOllama as ModelConstructor,
  OllamaEmbeddings: OllamaEmbeddings as ModelConstructor,
  ChatOpenAI: ChatOpenAI as ModelConstructor,
  OpenAIEmbeddings: OpenAIEmbeddings as ModelConstructor,
};

export function createChatModel<C extends ChatConstructors = ChatConstructors>(
  config: RagChatModelConfig,
  constructors?: C,
): ConstructorInstance<C["ChatOllama"]> | ConstructorInstance<C["ChatOpenAI"]> {
  const resolved = constructors ?? getDefaultConstructors();

  if (config.provider === "ollama") {
    return new resolved.ChatOllama({
      model: config.model,
      baseUrl: config.baseUrl,
    }) as ConstructorInstance<C["ChatOllama"]>;
  }

  if (config.provider === "openai") {
    return new resolved.ChatOpenAI({
      model: config.model,
      ...apiKeyOption(config.apiKey),
      ...baseUrlConfiguration(config.baseUrl),
    }) as ConstructorInstance<C["ChatOpenAI"]>;
  }

  return new resolved.ChatOpenAI({
    model: config.model,
    ...openAiCompatibleApiKeyOption(config.apiKey),
    configuration: {
      baseURL: requireBaseUrl(config.baseUrl),
    },
  }) as ConstructorInstance<C["ChatOpenAI"]>;
}

export function createEmbeddingModel<C extends EmbeddingConstructors = EmbeddingConstructors>(
  config: RagEmbeddingFactoryConfig,
  transportOptions?: EmbeddingTransportOptions,
  constructors?: C,
): ConstructorInstance<C["OllamaEmbeddings"]> | ConstructorInstance<C["OpenAIEmbeddings"]> {
  const resolved = constructors ?? getDefaultConstructors();
  const abortableFetch = createAbortableFetch(transportOptions?.signal);

  if (config.provider === "ollama") {
    return new resolved.OllamaEmbeddings({
      model: config.model,
      baseUrl: config.baseUrl,
      onFailedAttempt: handleOllamaEmbeddingFailedAttempt,
      ...(abortableFetch ? { fetch: abortableFetch } : {}),
    }) as ConstructorInstance<C["OllamaEmbeddings"]>;
  }

  if (config.provider === "openai") {
    return new resolved.OpenAIEmbeddings({
      model: config.model,
      ...apiKeyOption(config.apiKey),
      dimensions: config.dimensions,
      ...baseUrlConfiguration(config.baseUrl, abortableFetch),
    }) as ConstructorInstance<C["OpenAIEmbeddings"]>;
  }

  return new resolved.OpenAIEmbeddings({
    model: config.model,
    ...openAiCompatibleApiKeyOption(config.apiKey),
    dimensions: config.dimensions,
    configuration: {
      baseURL: requireBaseUrl(config.baseUrl),
      ...(abortableFetch ? { fetch: abortableFetch } : {}),
    },
  }) as ConstructorInstance<C["OpenAIEmbeddings"]>;
}

function handleOllamaEmbeddingFailedAttempt(error: unknown) {
  const status = providerErrorStatus(error);
  if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    throw error;
  }
  if (error instanceof Error && (error.name === "AbortError" || /^(Cancel|AbortError)/.test(error.message))) {
    throw error;
  }
  if (error && typeof error === "object" && "code" in error && error.code === "ECONNABORTED") throw error;
}

function apiKeyOption(apiKey: string | undefined): { apiKey?: string } {
  return apiKey === undefined ? {} : { apiKey };
}

function openAiCompatibleApiKeyOption(apiKey: string | undefined): { apiKey: string } {
  return { apiKey: apiKey ?? OPENAI_COMPATIBLE_PLACEHOLDER_API_KEY };
}

function baseUrlConfiguration(
  baseUrl: string | undefined,
  abortableFetch?: typeof fetch,
): { configuration?: { baseURL?: string; fetch?: typeof fetch } } {
  if (!baseUrl && !abortableFetch) return {};
  return {
    configuration: {
      ...(baseUrl ? { baseURL: baseUrl } : {}),
      ...(abortableFetch ? { fetch: abortableFetch } : {}),
    },
  };
}

function createAbortableFetch(signal: AbortSignal | undefined): typeof fetch | undefined {
  if (!signal) return undefined;
  return (input, init) => {
    const requestSignal = init?.signal;
    const combinedSignal = requestSignal
      ? AbortSignal.any([signal, requestSignal])
      : signal;
    return fetch(input, { ...init, signal: combinedSignal });
  };
}

function requireBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) {
    throw new Error("RAG_INVALID_CONFIG");
  }
  return baseUrl;
}

function getDefaultConstructors(): LangChainModelConstructors {
  return defaultConstructors;
}
