import { afterEach, expect, it, vi } from "vitest";
import { api, tracing } from "@opentelemetry/sdk-node";
import { createAiObserver } from "@/lib/rag/ai-observation";

const providers: tracing.BasicTracerProvider[] = [];
afterEach(async () => { await Promise.all(providers.splice(0).map(p => p.shutdown())); vi.restoreAllMocks(); });
function setup() {
  const exporter = new tracing.InMemorySpanExporter();
  const provider = new tracing.BasicTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(exporter)] });
  providers.push(provider);
  return { exporter, observer: createAiObserver(provider.getTracer("munjib-ai-metadata")) };
}
it("exports metadata-only stages with a shared trace, even with hostile content and errors", async () => {
  const { exporter, observer } = setup();
  const secret = "PRIVATE QUESTION document answer email@example.com sk-secret";
  const request = observer.start("workspace_chat", true);
  await request.run(async () => {
    await observer.stage("embedding", async () => secret, { chatModel: "bge-m3", question: secret, actorId: secret });
    await expect(observer.stage("retrieval", async () => { throw new Error(secret); })).rejects.toThrow(secret);
  });
  request.end();
  const spans = exporter.getFinishedSpans();
  expect(spans.map(s => s.name)).toEqual(["embedding", "retrieval", "workspace_chat"]);
  expect(new Set(spans.map(s => s.spanContext().traceId)).size).toBe(1);
  expect(spans[0].attributes["langfuse.observation.model.name"]).toBe("bge-m3");
  expect(spans[1].status.code).toBe(api.SpanStatusCode.ERROR);
  expect(JSON.stringify(spans.map(s => ({ attributes: s.attributes, events: s.events, status: s.status })))).not.toContain(secret);
  expect(JSON.parse(String(spans[2].attributes["langfuse.trace.metadata"]))).toEqual({ anonymousTrial: true, captureMode: "metadata" });
});
it("keeps concurrent requests isolated and accepts only finite numeric usage", async () => {
  const { exporter, observer } = setup();
  const a = observer.start("ask_document", false), b = observer.start("workspace_chat", true);
  await Promise.all([a, b].map(request => request.run(() => observer.stage("generation", async () => {
    await Promise.resolve();
    observer.usage({ usage_metadata: { input_tokens: 12, output_tokens: 4, total_tokens: 16 }, content: "PRIVATE" });
    observer.usage({ usage_metadata: { input_tokens: NaN, output_tokens: -1 } });
  }, { chatModel: "gpt-test", chatProvider: "openai" }))));
  a.end(); b.end();
  const spans = exporter.getFinishedSpans();
  const generations = spans.filter(s => s.name === "generation");
  expect(new Set(generations.map(s => s.spanContext().traceId)).size).toBe(2);
  expect(generations.map(s => s.attributes["langfuse.observation.usage_details"])).toEqual([
    JSON.stringify({ input: 12, output: 4, total: 16 }), JSON.stringify({ input: 12, output: 4, total: 16 }),
  ]);
});
it("does not create unscoped spans and cannot replace application outcomes if tracing fails", async () => {
  const { exporter, observer } = setup();
  expect(await observer.stage("generation", async () => "answer")).toBe("answer");
  expect(exporter.getFinishedSpans()).toEqual([]);
  const broken = createAiObserver({ startSpan() { throw new Error("tracer failed"); } } as unknown as api.Tracer);
  const request = broken.start("ask_document", false);
  expect(await request.run(() => broken.stage("generation", async () => "answer"))).toBe("answer");
  request.end();
});

it("reports exporter failures without logging exporter errors or blocking callbacks", async () => {
  const { createSafeSpanExporter } = await import("@/lib/rag/ai-observation");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const callback = vi.fn();
  const exporter = createSafeSpanExporter({
    export(_spans, done) { done({ code: 1, error: new Error("sk-secret https://private-host") }); },
    shutdown: async () => {},
  });
  exporter.export([], callback);
  expect(callback).toHaveBeenCalledWith({ code: 1 });
  expect(log).toHaveBeenCalledWith("Langfuse metadata export failed", { code: "LANGFUSE_EXPORT_FAILED" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("sk-secret");
});
