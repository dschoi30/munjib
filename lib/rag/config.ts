import {
  getRagModelConfig,
  RAG_CONFIG_ERROR_CODES as PROVIDER_RAG_CONFIG_ERROR_CODES,
} from "@/lib/rag/model-config";

export {
  CURRENT_EMBEDDING_INDEX,
  getRagModelConfig,
  getRagGenerationConfig,
  type RagChatModelConfig,
  type RagEmbeddingModelConfig,
  type RagEnv,
  type RagGenerationConfig,
  type RagLangfuseCapture,
  type RagLangfuseConfig,
  type RagModelConfig,
  type RagProvider,
} from "@/lib/rag/model-config";

export type RagConfig = {
  ollamaBaseUrl: string;
  chatModel: string;
  embedModel: string;
  embedDimensions: number;
};

export const RAG_CONFIG_ERROR_CODES = {
  ...PROVIDER_RAG_CONFIG_ERROR_CODES,
  INVALID_EMBED_DIMENSIONS: PROVIDER_RAG_CONFIG_ERROR_CODES.INVALID_CONFIG,
} as const;

export function getRagConfig(): RagConfig {
  const config = getRagModelConfig();
  return {
    ollamaBaseUrl: readLegacyOllamaBaseUrl(config),
    chatModel: config.chat.model,
    embedModel: config.embedding.model,
    embedDimensions: config.embedding.dimensions,
  };
}

function readLegacyOllamaBaseUrl(config: ReturnType<typeof getRagModelConfig>): string {
  if (config.chat.provider === "ollama" && config.chat.baseUrl) {
    return config.chat.baseUrl;
  }
  if (config.embedding.provider === "ollama" && config.embedding.baseUrl) {
    return config.embedding.baseUrl;
  }
  return process.env.MUNJIB_OLLAMA_BASE_URL?.trim() || "http://localhost:11434";
}
