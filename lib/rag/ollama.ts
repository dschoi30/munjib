import { getRagConfig, type RagConfig } from "@/lib/rag/config";

export const RAG_ERROR_CODES = {
  OLLAMA_REQUEST_FAILED: "OLLAMA_REQUEST_FAILED",
  OLLAMA_EMPTY_EMBEDDING: "OLLAMA_EMPTY_EMBEDDING",
  OLLAMA_INVALID_EMBEDDING: "OLLAMA_INVALID_EMBEDDING",
  OLLAMA_EMPTY_CHAT_RESPONSE: "OLLAMA_EMPTY_CHAT_RESPONSE",
} as const;

async function postOllama<T>(config: RagConfig, path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.ollamaBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(RAG_ERROR_CODES.OLLAMA_REQUEST_FAILED);
  }

  if (!response.ok) {
    throw new Error(RAG_ERROR_CODES.OLLAMA_REQUEST_FAILED);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(RAG_ERROR_CODES.OLLAMA_REQUEST_FAILED);
  }
}

export async function embedText(text: string): Promise<number[]> {
  const config = getRagConfig();
  const result = await postOllama<{ embeddings?: number[][] }>(config, "/api/embed", {
    model: config.embedModel,
    input: text,
  });
  const embedding = result.embeddings?.[0];
  if (!embedding) {
    throw new Error(RAG_ERROR_CODES.OLLAMA_EMPTY_EMBEDDING);
  }
  if (!Array.isArray(embedding)) {
    throw new Error(RAG_ERROR_CODES.OLLAMA_INVALID_EMBEDDING);
  }
  if (embedding.length === 0) {
    throw new Error(RAG_ERROR_CODES.OLLAMA_EMPTY_EMBEDDING);
  }
  if (
    embedding.length !== config.embedDimensions ||
    embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error(RAG_ERROR_CODES.OLLAMA_INVALID_EMBEDDING);
  }
  return embedding;
}

export async function chatWithContext(systemPrompt: string, userPrompt: string): Promise<string> {
  const config = getRagConfig();
  const result = await postOllama<{ message?: { content?: string } }>(config, "/api/chat", {
    model: config.chatModel,
    stream: false,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const content = typeof result.message?.content === "string" ? result.message.content.trim() : "";
  if (!content) {
    throw new Error(RAG_ERROR_CODES.OLLAMA_EMPTY_CHAT_RESPONSE);
  }
  return content;
}
