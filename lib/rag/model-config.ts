import { RAG_ERROR_CODES } from "@/lib/rag/errors";

export type RagProvider = "ollama" | "openai" | "openai-compatible";
export type RagLangfuseCapture = "metadata" | "full";
export type RagEnv = Record<string, string | undefined>;

export type RagChatModelConfig = {
  provider: RagProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
};

export type RagEmbeddingModelConfig = {
  provider: RagProvider;
  model: string;
  dimensions: number;
  baseUrl?: string;
  apiKey?: string;
  indexId: string;
  isCurrentIndexedIdentity: boolean;
  indexCompatible: boolean;
};

export type RagLangfuseConfig = {
  enabled: boolean;
  capture: RagLangfuseCapture;
  captureMode: RagLangfuseCapture;
  environment: string;
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
  host?: string;
};

export type RagModelConfig = {
  chat: RagChatModelConfig;
  embedding: RagEmbeddingModelConfig;
  langfuse: RagLangfuseConfig;
};

export const RAG_CONFIG_ERROR_CODES = {
  INVALID_CONFIG: RAG_ERROR_CODES.INVALID_CONFIG,
} as const;

export const CURRENT_EMBEDDING_INDEX = {
  provider: "ollama",
  model: "bge-m3",
  dimensions: 1024,
  indexId: "bge-m3",
} as const satisfies {
  provider: RagProvider;
  model: string;
  dimensions: number;
  indexId: string;
};

const DEFAULTS = {
  chatProvider: "ollama",
  embedProvider: "ollama",
  ollamaBaseUrl: "http://localhost:11434",
  chatModel: "gemma4:e4b",
  embedModel: "bge-m3",
  embedDimensions: 1024,
} as const;

const PROVIDERS = new Set<RagProvider>(["ollama", "openai", "openai-compatible"]);

export function getRagModelConfig(env: RagEnv = process.env): RagModelConfig {
  const chatProvider = readProvider(env, "MUNJIB_RAG_CHAT_PROVIDER", DEFAULTS.chatProvider);
  const embedProvider = readProvider(env, "MUNJIB_RAG_EMBED_PROVIDER", DEFAULTS.embedProvider);
  const embedDimensions = readEmbedDimensions(env);
  const chat = buildProviderConfig({
    env,
    provider: chatProvider,
    model: readModel(env, "MUNJIB_RAG_CHAT_MODEL", chatProvider, DEFAULTS.chatModel),
  });
  const embeddingProviderConfig = buildProviderConfig({
    env,
    provider: embedProvider,
    model: readModel(env, "MUNJIB_RAG_EMBED_MODEL", embedProvider, DEFAULTS.embedModel),
  });
  const isCurrentIndexedIdentity =
    embeddingProviderConfig.provider === CURRENT_EMBEDDING_INDEX.provider &&
    embeddingProviderConfig.model === CURRENT_EMBEDDING_INDEX.model &&
    embedDimensions === CURRENT_EMBEDDING_INDEX.dimensions;
  const embedding: RagEmbeddingModelConfig = {
    ...embeddingProviderConfig,
    dimensions: embedDimensions,
    indexId: isCurrentIndexedIdentity
      ? CURRENT_EMBEDDING_INDEX.indexId
      : `${embeddingProviderConfig.provider}:${embeddingProviderConfig.model}:${embedDimensions}`,
    isCurrentIndexedIdentity,
    indexCompatible: isCurrentIndexedIdentity,
  };

  return {
    chat,
    embedding,
    langfuse: readLangfuseConfig(env),
  };
}

function buildProviderConfig({
  env,
  provider,
  model,
}: {
  env: RagEnv;
  provider: RagProvider;
  model: string;
}): RagChatModelConfig {
  if (provider === "ollama") {
    return {
      provider,
      model,
      baseUrl: readOptionalEnv(env, "MUNJIB_OLLAMA_BASE_URL") ?? DEFAULTS.ollamaBaseUrl,
    };
  }

  if (provider === "openai") {
    const config: RagChatModelConfig = {
      provider,
      model,
      apiKey: readRequiredEnv(env, ["OPENAI_API_KEY", "MUNJIB_OPENAI_API_KEY"]),
    };
    const baseUrl = readOptionalEnv(env, "MUNJIB_OPENAI_BASE_URL");
    return baseUrl ? { ...config, baseUrl } : config;
  }

  const apiKey = readOptionalEnv(env, "MUNJIB_OPENAI_COMPATIBLE_API_KEY");
  return {
    provider,
    model,
    baseUrl: readRequiredEnv(env, "MUNJIB_OPENAI_COMPATIBLE_BASE_URL"),
    ...(apiKey ? { apiKey } : {}),
  };
}

function readProvider(env: RagEnv, name: string, fallback: RagProvider): RagProvider {
  const value = readOptionalEnv(env, name);
  if (!value) {
    return fallback;
  }

  const provider = value.toLowerCase();
  if (PROVIDERS.has(provider as RagProvider)) {
    return provider as RagProvider;
  }

  throwInvalidConfig();
}

function readModel(env: RagEnv, name: string, provider: RagProvider, fallback: string): string {
  const value = readOptionalEnv(env, name);
  if (value) {
    return value;
  }
  if (provider === "ollama") {
    return fallback;
  }

  throwInvalidConfig();
}

function readEmbedDimensions(env: RagEnv): number {
  const value = readOptionalEnv(env, "MUNJIB_RAG_EMBED_DIMENSIONS");
  if (!value) {
    return DEFAULTS.embedDimensions;
  }

  const dimensions = Number(value);
  if (!Number.isInteger(dimensions) || dimensions !== CURRENT_EMBEDDING_INDEX.dimensions) {
    throwInvalidConfig();
  }
  return dimensions;
}

function readLangfuseConfig(env: RagEnv): RagLangfuseConfig {
  const publicKey = readOptionalEnv(env, "LANGFUSE_PUBLIC_KEY");
  const secretKey = readOptionalEnv(env, "LANGFUSE_SECRET_KEY");
  if (!publicKey || !secretKey) {
    return {
      enabled: false,
      capture: "metadata",
      captureMode: "metadata",
      environment: readOptionalEnv(env, "LANGFUSE_TRACING_ENVIRONMENT") ?? "development",
    };
  }

  const captureEnv =
    readOptionalEnv(env, "MUNJIB_LANGFUSE_CAPTURE_MODE") ??
    readOptionalEnv(env, "MUNJIB_LANGFUSE_CAPTURE");
  const capture = captureEnv?.toLowerCase() === "full" ? "full" : "metadata";
  const baseUrl = readOptionalEnv(env, "LANGFUSE_BASEURL") ?? readOptionalEnv(env, "LANGFUSE_HOST");
  return {
    enabled: true,
    capture,
    captureMode: capture,
    environment: readOptionalEnv(env, "LANGFUSE_TRACING_ENVIRONMENT") ?? "development",
    publicKey,
    secretKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(baseUrl ? { host: baseUrl } : {}),
  };
}

function readOptionalEnv(env: RagEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readRequiredEnv(env: RagEnv, names: string | readonly string[]): string {
  const candidates = Array.isArray(names) ? names : [names];
  for (const name of candidates) {
    const value = readOptionalEnv(env, name);
    if (value) {
      return value;
    }
  }

  throwInvalidConfig();
}

function throwInvalidConfig(): never {
  throw new Error(RAG_CONFIG_ERROR_CODES.INVALID_CONFIG);
}
