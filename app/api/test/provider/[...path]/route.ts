import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

const EMBEDDING_DIMENSIONS = 1024;

type ProviderParams = {
  params: Promise<{ path?: string[] }>;
};

/**
 * Deterministic local OpenAI-compatible transport used only by the zero-egress
 * Playwright process. It is deliberately disabled unless the test process opts
 * in, and it never proxies or dials an external provider.
 */
export async function POST(request: Request, context: ProviderParams) {
  if (!isTestTransportEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  const path = (await context.params).path?.join("/") ?? "";
  const payload = await request.json().catch(() => ({}));

  if (path.endsWith("embeddings") || path.endsWith("embed")) {
    const embedding = deterministicEmbedding(JSON.stringify(payload));
    if (path.endsWith("embed")) {
      return Response.json({ embeddings: [embedding] });
    }
    if (path.includes("api/embeddings") && !path.includes("v1/")) {
      return Response.json({ embedding });
    }
    return Response.json({
      object: "list",
      data: [
        {
          object: "embedding",
          embedding,
          index: 0,
        },
      ],
      model: typeof payload.model === "string" ? payload.model : "zero-egress-embedding",
      usage: { prompt_tokens: 1, total_tokens: 1 },
    });
  }

  if (path.endsWith("chat/completions")) {
    return streamChatCompletion(payload);
  }

  return new Response("Not found", { status: 404 });
}

function isTestTransportEnabled() {
  const deployment = process.env.MUNJIB_DEPLOYMENT_ENV?.trim().toLowerCase();
  return (
    process.env.MUNJIB_E2E_PROVIDER_TRANSPORT === "true" &&
    (process.env.NODE_ENV !== "production" ||
      deployment === "test" ||
      deployment === "development")
  );
}

function deterministicEmbedding(input: string) {
  const digest = createHash("sha256").update(input).digest();
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => {
    const byte = digest[index % digest.length] ?? 0;
    return (byte / 255 - 0.5) / 10;
  });
}

function streamChatCompletion(payload: Record<string, unknown>) {
  const prompt = JSON.stringify(payload.messages ?? "");
  const url = prompt.match(/https?:\/\/[^\s"'()\]]+/i)?.[0];
  const attackerOrigin =
    process.env.MUNJIB_E2E_ATTACKER_ORIGIN?.trim() ||
    (url ? safeOrigin(url) : "https://attacker.example");
  const answer = "![completed](" + attackerOrigin + "/answer.png)";
  const tokens = answer.match(/.{1,16}/g) ?? [answer];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const token of tokens) {
        controller.enqueue(
          encoder.encode(
            "data: " + JSON.stringify({
              id: "zero-egress-completion",
              object: "chat.completion.chunk",
              choices: [{ index: 0, delta: { content: token }, finish_reason: null }],
            }) + "\n\n",
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}

function safeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "https://attacker.example";
  }
}
