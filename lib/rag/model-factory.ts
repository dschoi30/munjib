import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import type {
  RagChatModelConfig,
  RagEmbeddingModelConfig,
} from "@/lib/rag/model-config";

export type RagModelProvider = "ollama" | "openai" | "openai-compatible";
export type RagEmbeddingFactoryConfig = Pick<
  RagEmbeddingModelConfig,
  "provider" | "model" | "baseUrl" | "apiKey" | "dimensions"
>;

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
    }) as ConstructorInstance<C["ChatOpenAI"]>;
  }

  return new resolved.ChatOpenAI({
    model: config.model,
    ...apiKeyOption(config.apiKey),
    configuration: {
      baseURL: requireBaseUrl(config.baseUrl),
    },
  }) as ConstructorInstance<C["ChatOpenAI"]>;
}

export function createEmbeddingModel<C extends EmbeddingConstructors = EmbeddingConstructors>(
  config: RagEmbeddingFactoryConfig,
  constructors?: C,
): ConstructorInstance<C["OllamaEmbeddings"]> | ConstructorInstance<C["OpenAIEmbeddings"]> {
  const resolved = constructors ?? getDefaultConstructors();

  if (config.provider === "ollama") {
    return new resolved.OllamaEmbeddings({
      model: config.model,
      baseUrl: config.baseUrl,
    }) as ConstructorInstance<C["OllamaEmbeddings"]>;
  }

  if (config.provider === "openai") {
    return new resolved.OpenAIEmbeddings({
      model: config.model,
      ...apiKeyOption(config.apiKey),
      dimensions: config.dimensions,
    }) as ConstructorInstance<C["OpenAIEmbeddings"]>;
  }

  return new resolved.OpenAIEmbeddings({
    model: config.model,
    ...apiKeyOption(config.apiKey),
    dimensions: config.dimensions,
    configuration: {
      baseURL: requireBaseUrl(config.baseUrl),
    },
  }) as ConstructorInstance<C["OpenAIEmbeddings"]>;
}

function apiKeyOption(apiKey: string | undefined): { apiKey?: string } {
  return apiKey === undefined ? {} : { apiKey };
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
