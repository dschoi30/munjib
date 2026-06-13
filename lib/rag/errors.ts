export const RAG_ERROR_CODES = {
  INVALID_CONFIG: "RAG_INVALID_CONFIG",
  EMBEDDING_REQUEST_FAILED: "RAG_EMBEDDING_REQUEST_FAILED",
  INVALID_EMBEDDING: "RAG_INVALID_EMBEDDING",
  CHAT_REQUEST_FAILED: "RAG_CHAT_REQUEST_FAILED",
  EMBEDDING_INDEX_INCOMPATIBLE: "RAG_EMBEDDING_INDEX_INCOMPATIBLE",
} as const;

export type RagErrorCode = (typeof RAG_ERROR_CODES)[keyof typeof RAG_ERROR_CODES];

const RAG_RUNTIME_ERROR_CODES = new Set<string>(Object.values(RAG_ERROR_CODES));

export function isRagRuntimeError(message: unknown): message is RagErrorCode {
  return typeof message === "string" && RAG_RUNTIME_ERROR_CODES.has(message);
}
