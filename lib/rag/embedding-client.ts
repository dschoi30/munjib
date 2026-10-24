import { observeAiStage } from "@/lib/rag/ai-observation";
import { isEmbeddingInputLimitError, RAG_ERROR_CODES } from "@/lib/rag/errors";

export { RAG_ERROR_CODES };

const CURRENT_EMBEDDING_DIMENSIONS = 1024;

export type LangChainEmbeddingModel = {
  embedQuery: (text: string) => Promise<unknown>;
};

type EmbeddingIndexIdentity =
  | {
      isCurrentIndexedIdentity: boolean;
      indexCompatible?: boolean;
    }
  | {
      isCurrentIndexedIdentity?: boolean;
      indexCompatible: boolean;
    };

export type RagEmbeddingClientConfig = {
  embedding: {
    provider?: string;
    model?: string;
    dimensions: number;
  } & EmbeddingIndexIdentity;
};

export type EmbedTextOptions = {
  config?: RagEmbeddingClientConfig;
  privacySafeLogging?: boolean;
  signal?: AbortSignal;
  embeddingModel?: LangChainEmbeddingModel;
  expectedDimensions?: number;
  getRagModelConfig?: () => RagEmbeddingClientConfig | Promise<RagEmbeddingClientConfig>;
  createEmbeddingModel?: (
    config: RagEmbeddingClientConfig,
    options?: Readonly<{ signal?: AbortSignal }>,
  ) => LangChainEmbeddingModel | Promise<LangChainEmbeddingModel>;
};

type RagModelConfigModule = {
  getRagModelConfig?: () => RagEmbeddingClientConfig | Promise<RagEmbeddingClientConfig>;
};

type RagModelFactoryModule = {
  createEmbeddingModel?: (
    config: RagEmbeddingClientConfig["embedding"],
    options?: Readonly<{ signal?: AbortSignal }>,
  ) => LangChainEmbeddingModel | Promise<LangChainEmbeddingModel>;
};

export function validateEmbedding(embedding: unknown, expectedDimensions: number): number[] {
  if (
    !Array.isArray(embedding) ||
    embedding.length === 0 ||
    embedding.length !== expectedDimensions ||
    embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error(RAG_ERROR_CODES.INVALID_EMBEDDING);
  }

  return embedding;
}

export function assertCurrentEmbeddingIndex(config: RagEmbeddingClientConfig) {
  const isCurrentIndexedIdentity =
    config.embedding.isCurrentIndexedIdentity ?? config.embedding.indexCompatible;
  if (isCurrentIndexedIdentity === false) {
    throw new Error(RAG_ERROR_CODES.EMBEDDING_INDEX_INCOMPATIBLE);
  }
}

export async function embedText(text: string, options: EmbedTextOptions = {}): Promise<number[]> {
  throwIfAborted(options.signal);
  const config =
    options.config ?? (options.embeddingModel ? undefined : await loadRagModelConfig(options));
  if (config) {
    assertCurrentEmbeddingIndex(config);
  }

  const embeddingModel =
    options.embeddingModel ?? (await loadEmbeddingModel(options, requireConfig(config)));
  throwIfAborted(options.signal);

  return observeAiStage("embedding", async () => {
    let embedding: unknown;
    try {
      embedding = await embeddingModel.embedQuery(text);
    } catch (error) {
      if (isEmbeddingInputLimitError(error)) {
        throw new Error(RAG_ERROR_CODES.EMBEDDING_INPUT_TOO_LONG);
      }
      if (options.privacySafeLogging) {
        console.error("Embedding request failed", {
          code: RAG_ERROR_CODES.EMBEDDING_REQUEST_FAILED,
          surface: "embedding",
        });
      } else {
        console.error("Embedding request failed:", error);
      }
      throw new Error(RAG_ERROR_CODES.EMBEDDING_REQUEST_FAILED);
    }

    return validateEmbedding(
      embedding,
      options.expectedDimensions ?? config?.embedding.dimensions ?? CURRENT_EMBEDDING_DIMENSIONS,
    );
  }, { embeddingModel: config?.embedding.model, embeddingProvider: config?.embedding.provider, embeddingDimensions: config?.embedding.dimensions });
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Aborted", "AbortError");
}

async function loadRagModelConfig(options: EmbedTextOptions) {
  if (options.getRagModelConfig) {
    return options.getRagModelConfig();
  }

  const configModule = (await import("@/lib/rag/config")) as unknown as RagModelConfigModule;
  if (!configModule.getRagModelConfig) {
    throw new Error(RAG_ERROR_CODES.EMBEDDING_REQUEST_FAILED);
  }
  return configModule.getRagModelConfig();
}

async function loadEmbeddingModel(options: EmbedTextOptions, config: RagEmbeddingClientConfig) {
  if (options.createEmbeddingModel) {
    return options.createEmbeddingModel(config, { signal: options.signal });
  }

  const factoryModule = (await import(
    "@/lib/rag/model-factory"
  )) as unknown as RagModelFactoryModule;
  if (!factoryModule.createEmbeddingModel) {
    throw new Error(RAG_ERROR_CODES.EMBEDDING_REQUEST_FAILED);
  }
  return factoryModule.createEmbeddingModel(config.embedding, { signal: options.signal });
}

function requireConfig(config: RagEmbeddingClientConfig | undefined) {
  if (!config) {
    throw new Error(RAG_ERROR_CODES.EMBEDDING_REQUEST_FAILED);
  }
  return config;
}
