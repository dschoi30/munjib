export type RagConfig = {
  ollamaBaseUrl: string;
  chatModel: string;
  embedModel: string;
  embedDimensions: number;
};

export function getRagConfig(): RagConfig {
  return {
    ollamaBaseUrl: process.env.MUNJIB_OLLAMA_BASE_URL ?? "http://localhost:11434",
    chatModel: process.env.MUNJIB_RAG_CHAT_MODEL ?? "gemma4:e4b",
    embedModel: process.env.MUNJIB_RAG_EMBED_MODEL ?? "bge-m3",
    embedDimensions: Number(process.env.MUNJIB_RAG_EMBED_DIMENSIONS ?? 1024),
  };
}
