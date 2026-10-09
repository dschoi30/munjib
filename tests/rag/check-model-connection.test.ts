import { afterEach, describe, expect, it, vi } from "vitest";
import { checkModelConnection } from "@/lib/rag/check-model-connection";
afterEach(() => vi.unstubAllGlobals());
describe("model connection probe", () => {
  it.each(["ollama", "openai", "openai-compatible"] as const)("probes %s with the exact model and bounded output", async (provider) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(provider === "ollama" ? { done: true, message: { content: "OK" } } : { choices: [{ message: { role: "assistant", content: "OK" } }] }));
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    expect(await checkModelConnection({ provider, model: "selected-model", baseUrl: "https://provider.example/v1/", apiKey: "test-key" }, signal)).toBe(true);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`https://provider.example/v1/${provider === "ollama" ? "api/chat" : "chat/completions"}`);
    expect(init.signal).toBe(signal); expect(init.cache).toBe("no-store");
    expect(JSON.parse(init.body)).toMatchObject({ model: "selected-model", messages: [{ role: "user", content: "Reply OK." }], stream: false, ...(provider === "ollama" ? { options: { num_predict: 1 } } : provider === "openai" ? { max_completion_tokens: 16 } : { max_tokens: 16 }) });
  });
  it.each([new Response("unauthorized", { status: 401 }), Response.json({ error: "missing model" }), Response.json({ choices: [] })])("does not accept an error or empty completion as connected", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect(await checkModelConnection({ provider: "openai", model: "missing" }, new AbortController().signal)).toBe(false);
  });
});
