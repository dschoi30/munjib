import type { RagChatModelConfig } from "@/lib/rag/model-config";

/** A bounded, content-free probe of the selected model, not just its provider. */
export async function checkModelConnection(
  config: RagChatModelConfig,
  signal: AbortSignal,
): Promise<boolean> {
  const ollama = config.provider === "ollama";
  const baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${ollama ? "/api/chat" : "/chat/completions"}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(!ollama ? { Authorization: `Bearer ${config.apiKey ?? "not-needed"}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: "Reply OK." }],
      stream: false,
      ...(ollama
        ? { options: { num_predict: 1 } }
        : config.provider === "openai"
          ? { max_completion_tokens: 16 }
          : { max_tokens: 16 }),
    }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) return false;
  const body = await response.json();
  return ollama
    ? body?.done === true && typeof body?.message?.content === "string"
    : Array.isArray(body?.choices) && body.choices.some(
        (choice: { message?: { role?: string } } | null) => choice?.message?.role === "assistant",
      );
}
