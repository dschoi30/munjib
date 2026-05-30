export type RagConfig = {
  ollamaBaseUrl: string;
  chatModel: string;
  embedModel: string;
  embedDimensions: number;
};

export const RAG_CONFIG_ERROR_CODES = {
  INVALID_EMBED_DIMENSIONS: "RAG_INVALID_EMBED_DIMENSIONS",
} as const;

const DEFAULT_RAG_CONFIG = {
  ollamaBaseUrl: "http://localhost:11434",
  chatModel: "gemma4:e4b",
  embedModel: "bge-m3",
  embedDimensions: 1024,
} as const;

export function getRagConfig(): RagConfig {
  return {
    ollamaBaseUrl: readStringEnv("MUNJIB_OLLAMA_BASE_URL", DEFAULT_RAG_CONFIG.ollamaBaseUrl),
    chatModel: readStringEnv("MUNJIB_RAG_CHAT_MODEL", DEFAULT_RAG_CONFIG.chatModel),
    embedModel: readStringEnv("MUNJIB_RAG_EMBED_MODEL", DEFAULT_RAG_CONFIG.embedModel),
    embedDimensions: readEmbedDimensions(),
  };
}

function readStringEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function readEmbedDimensions(): number {
  const value = process.env.MUNJIB_RAG_EMBED_DIMENSIONS?.trim();
  if (!value) {
    return DEFAULT_RAG_CONFIG.embedDimensions;
  }

  const dimensions = Number(value);
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error(RAG_CONFIG_ERROR_CODES.INVALID_EMBED_DIMENSIONS);
  }

  return dimensions;
}
