export const RAG_ERROR_CODES = {
  INVALID_CONFIG: "RAG_INVALID_CONFIG",
  EMBEDDING_REQUEST_FAILED: "RAG_EMBEDDING_REQUEST_FAILED",
  EMBEDDING_INPUT_TOO_LONG: "RAG_EMBEDDING_INPUT_TOO_LONG",
  INDEXING_FAILED: "RAG_INDEXING_FAILED",
  INVALID_EMBEDDING: "RAG_INVALID_EMBEDDING",
  CHAT_REQUEST_FAILED: "RAG_CHAT_REQUEST_FAILED",
  EMBEDDING_INDEX_INCOMPATIBLE: "RAG_EMBEDDING_INDEX_INCOMPATIBLE",
} as const;

export type RagErrorCode = (typeof RAG_ERROR_CODES)[keyof typeof RAG_ERROR_CODES];

const RAG_RUNTIME_ERROR_CODES = new Set<string>(Object.values(RAG_ERROR_CODES));

export function isRagRuntimeError(message: unknown): message is RagErrorCode {
  return typeof message === "string" && RAG_RUNTIME_ERROR_CODES.has(message);
}

/** Ollama's SDK uses status_code; LangChain's default retry handler checks status. */
export function providerErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("status_code" in error && typeof error.status_code === "number") return error.status_code;
  if ("status" in error && typeof error.status === "number") return error.status;
  if ("response" in error && error.response && typeof error.response === "object" &&
      "status" in error.response && typeof error.response.status === "number") return error.response.status;
  return undefined;
}

export function isEmbeddingInputLimitError(error: unknown): boolean {
  return providerErrorStatus(error) === 400 && error instanceof Error &&
    /input length exceeds the context length|input .*too large to process.*batch size/i.test(error.message);
}
