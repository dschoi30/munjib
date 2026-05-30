import { getRagConfig } from "@/lib/rag/config";

export const RAG_ERROR_CODES = {
  OLLAMA_REQUEST_FAILED: "OLLAMA_REQUEST_FAILED",
  OLLAMA_EMPTY_EMBEDDING: "OLLAMA_EMPTY_EMBEDDING",
  OLLAMA_EMPTY_CHAT_RESPONSE: "OLLAMA_EMPTY_CHAT_RESPONSE",
} as const;

async function postOllama<T>(path: string, body: unknown): Promise<T> {
  const config = getRagConfig();
  const response = await fetch(`${config.ollamaBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(RAG_ERROR_CODES.OLLAMA_REQUEST_FAILED);
  }

  return response.json() as Promise<T>;
}

export async function embedText(text: string): Promise<number[]> {
  const config = getRagConfig();
  const result = await postOllama<{ embeddings?: number[][] }>("/api/embed", {
    model: config.embedModel,
    input: text,
  });
  const embedding = result.embeddings?.[0];
  if (!embedding || embedding.length === 0) {
    throw new Error(RAG_ERROR_CODES.OLLAMA_EMPTY_EMBEDDING);
  }
  return embedding;
}

export async function chatWithContext(systemPrompt: string, userPrompt: string): Promise<string> {
  const config = getRagConfig();
  const result = await postOllama<{ message?: { content?: string } }>("/api/chat", {
    model: config.chatModel,
    stream: false,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const content = result.message?.content?.trim();
  if (!content) {
    throw new Error(RAG_ERROR_CODES.OLLAMA_EMPTY_CHAT_RESPONSE);
  }
  return content;
}
