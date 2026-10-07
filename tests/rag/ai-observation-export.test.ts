import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { AIMessage } from "@langchain/core/messages";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("exports real answer-chain OTLP metadata without prompt, output, or caller identifiers", async () => {
  const bodies: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk.toString(); });
    req.on("end", () => { bodies.push(body); res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    vi.stubEnv("LANGFUSE_BASEURL", `http://127.0.0.1:${address.port}`);
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-test"); vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-test");
    vi.stubEnv("MUNJIB_LANGFUSE_ENABLED", "true"); vi.stubEnv("MUNJIB_LANGFUSE_CAPTURE_MODE", "metadata");
    vi.stubEnv("LANGFUSE_TRACING_ENVIRONMENT", "test");
    const { startAiObservation, flushAiObservations } = await import("@/lib/rag/ai-observation");
    const { invokeAnswerChain, streamAnswerChain } = await import("@/lib/rag/answer-chain");
    const observation = startAiObservation("ask_document", true);
    const input = {
      systemPrompt: "PRIVATE_DOCUMENT", userPrompt: "PRIVATE_QUESTION",
      metadata: { chatModel: "gpt-test", chatProvider: "openai", actorId: "PRIVATE_ACTOR", workspaceSlug: "PRIVATE_WORKSPACE" },
      chatModel: { invoke: async () => new AIMessage({ content: "PRIVATE_ANSWER", usage_metadata: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } }) },
    };
    expect(await observation.run(() => invokeAnswerChain(input))).toBe("PRIVATE_ANSWER");
    observation.end();
    const failed = startAiObservation("workspace_chat", false);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(failed.run(() => streamAnswerChain({ ...input, privacySafeLogging: true, chatModel: { ...input.chatModel, stream: async () => { throw new Error("PRIVATE_PROVIDER_ERROR"); } }, onToken: () => {} }))).rejects.toThrow("RAG_CHAT_REQUEST_FAILED");
    failed.end(new Error("RAG_CHAT_REQUEST_FAILED"));
    await flushAiObservations();
    expect(bodies.length).toBeGreaterThan(0);
    const wire = bodies.join("");
    expect(wire).toContain("generation"); expect(wire).toContain("gpt-test");
    expect(wire).toContain("usage_details"); expect(wire).toContain("RAG_CHAT_REQUEST_FAILED");
    expect(wire).not.toContain("PRIVATE_"); expect(wire).not.toContain("sk-test");
    expect(wire).not.toContain('"key":"langfuse.observation.input"');
    expect(wire).not.toContain('"key":"langfuse.observation.output"');
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
