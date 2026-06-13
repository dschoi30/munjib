import { CallbackHandler } from "@langfuse/langchain";

export type LangfuseCallbackFactory = (options: {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}) => unknown;

export type LangfuseCallbackConfigInput = {
  enabled?: boolean;
  callbackFactory?: LangfuseCallbackFactory;
  operation?: string;
  chatProvider: string;
  chatModel: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  retrievedChunkCount?: number;
  citationDocumentIds?: string[];
  citationChunkIds?: string[];
  errorCode?: string;
  metadata?: Record<string, unknown>;
};

export type LangfuseCallbackConfig = {
  callbacks: unknown[];
  metadata: Record<string, unknown>;
};

const BLOCKED_METADATA_KEYS = new Set([
  "answer",
  "chunktext",
  "content",
  "contentmarkdown",
  "context",
  "documentcontent",
  "fullprompt",
  "prompt",
  "question",
  "rawcontext",
  "retrievedchunktext",
  "retrievedcontext",
  "savedcontent",
  "systemprompt",
  "userprompt",
]);

export function createLangfuseCallbackConfig(
  input: LangfuseCallbackConfigInput,
): LangfuseCallbackConfig {
  const metadata = buildMetadata(input);
  if (!isLangfuseEnabled(input)) {
    return { callbacks: [], metadata };
  }

  const credentials = readLangfuseCredentials();
  if (!credentials) {
    return { callbacks: [], metadata };
  }

  try {
    return {
      callbacks: [
        input.callbackFactory ? input.callbackFactory(credentials) : createCallback(metadata),
      ],
      metadata,
    };
  } catch {
    return { callbacks: [], metadata };
  }
}

function buildMetadata(input: LangfuseCallbackConfigInput): Record<string, unknown> {
  return {
    operation: input.operation ?? "rag.answer",
    chatProvider: input.chatProvider,
    chatModel: input.chatModel,
    embeddingProvider: input.embeddingProvider,
    embeddingModel: input.embeddingModel,
    embeddingDimensions: input.embeddingDimensions,
    ...(typeof input.retrievedChunkCount === "number"
      ? { retrievedChunkCount: input.retrievedChunkCount }
      : {}),
    ...(input.citationDocumentIds
      ? { citationDocumentIds: uniqueStrings(input.citationDocumentIds) }
      : {}),
    ...(input.citationChunkIds ? { citationChunkIds: uniqueStrings(input.citationChunkIds) } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    ...sanitizeExtraMetadata(input.metadata ?? {}),
    captureMode: "metadata",
  };
}

function sanitizeExtraMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (BLOCKED_METADATA_KEYS.has(normalizeKey(key))) {
      continue;
    }
    const safeValue = sanitizeMetadataValue(value);
    if (safeValue !== undefined) {
      sanitized[key] = safeValue;
    }
  }
  return sanitized;
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const safeItems = value.filter(
    (item) =>
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean",
  );
  return safeItems.length === value.length ? safeItems : undefined;
}

function isLangfuseEnabled(input: LangfuseCallbackConfigInput): boolean {
  if (input.enabled !== undefined) {
    return input.enabled;
  }
  const configured = readBooleanEnv("MUNJIB_LANGFUSE_ENABLED");
  if (configured !== undefined) {
    return configured;
  }
  return Boolean(readStringEnv("LANGFUSE_PUBLIC_KEY") && readStringEnv("LANGFUSE_SECRET_KEY"));
}

function readLangfuseCredentials() {
  const publicKey = readStringEnv("LANGFUSE_PUBLIC_KEY");
  const secretKey = readStringEnv("LANGFUSE_SECRET_KEY");
  if (!publicKey || !secretKey) {
    return undefined;
  }
  return {
    publicKey,
    secretKey,
    baseUrl:
      readStringEnv("LANGFUSE_BASEURL") ??
      readStringEnv("LANGFUSE_BASE_URL") ??
      readStringEnv("LANGFUSE_HOST"),
  };
}

function createCallback(metadata: Record<string, unknown>) {
  return new CallbackHandler({ traceMetadata: metadata });
}

function readBooleanEnv(name: string): boolean | undefined {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return undefined;
  }
  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }
  return undefined;
}

function readStringEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
