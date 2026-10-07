import { after } from "next/server";
import { AsyncLocalStorage } from "node:async_hooks";
import { api, tracing } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { validateChatModelId } from "@/lib/rag/client-model-settings";
import { isRagRuntimeError } from "@/lib/rag/errors";

type Surface = "ask_document" | "workspace_chat";
type Stage = "preparation" | "indexing" | "embedding" | "retrieval" | "generation";
type Metadata = Record<string, unknown>;
export type AiObservation = { run<T>(work: () => Promise<T>): Promise<T>; end(error?: unknown): void };

// This provider is deliberately private: Sentry and automatic instrumentation
// cannot add request headers, prompts, identifiers, or exceptions to these spans.
export function createAiObserver(tracer?: api.Tracer) {
  const storage = new AsyncLocalStorage<api.Span>();
  const safe = (work: () => void) => { try { work(); } catch { /* Telemetry is best effort. */ } };
  function startSpan(name: string, attributes: api.Attributes, parent?: api.Span) {
    try { return tracer?.startSpan(name, { attributes }, parent ? api.trace.setSpan(api.ROOT_CONTEXT, parent) : api.ROOT_CONTEXT); }
    catch { return undefined; }
  }
  function finish(span: api.Span | undefined, error?: unknown) {
    safe(() => {
      if (error !== undefined) {
        const code = error instanceof Error && isRagRuntimeError(error.message) ? error.message : "AI_STAGE_FAILED";
        span?.setStatus({ code: api.SpanStatusCode.ERROR });
        span?.setAttribute("langfuse.observation.level", "ERROR");
        span?.setAttribute("langfuse.observation.status_message", code);
      } else span?.setStatus({ code: api.SpanStatusCode.OK });
      span?.end();
    });
  }
  return {
    start(surface: Surface, anonymousTrial: boolean): AiObservation {
      const span = startSpan(surface, {
        "langfuse.trace.name": surface,
        "langfuse.trace.metadata": JSON.stringify({ anonymousTrial, captureMode: "metadata" }),
        "langfuse.observation.type": "span",
      });
      let ended = false;
      return {
        run: work => span ? storage.run(span, work) : work(),
        end(error) { if (!ended) { ended = true; finish(span, error); } },
      };
    },
    async stage<T>(stage: Stage, work: () => Promise<T>, metadata: Metadata = {}): Promise<T> {
      const parent = storage.getStore();
      if (!parent) return work();
      const attributes: api.Attributes = { "langfuse.observation.type": stage === "generation" ? "generation" : "span" };
      // Do not spread caller metadata. Even authenticated metadata contains IDs.
      for (const key of ["chatModel", "chatProvider", "embeddingModel", "embeddingProvider"] as const) {
        const value = metadata[key];
        if (typeof value === "string" && (key === "chatModel" ? validateChatModelId(value).ok : /^[a-zA-Z0-9][a-zA-Z0-9._:/@+-]{0,159}$/.test(value))) {
          attributes[key === "chatModel" ? "langfuse.observation.model.name" : `langfuse.observation.metadata.${key}`] = value;
        }
      }
      for (const key of ["retrievedChunkCount", "embeddingDimensions"] as const) {
        const value = metadata[key];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) attributes[`langfuse.observation.metadata.${key}`] = JSON.stringify(value);
      }
      const span = startSpan(stage, attributes, parent);
      try {
        const result = await (span ? storage.run(span, work) : work());
        if (stage === "retrieval" && Array.isArray(result)) safe(() => { span?.setAttribute("langfuse.observation.metadata.retrievedChunkCount", JSON.stringify(result.length)); });
        finish(span);
        return result;
      } catch (error) { finish(span, error); throw error; }
    },
    usage(result: unknown) {
      safe(() => {
        if (!result || typeof result !== "object") return;
        const usage = (result as { usage_metadata?: Record<string, unknown> }).usage_metadata;
        if (!usage) return;
        const values: Record<string, number> = {};
        for (const [source, target] of [["input_tokens", "input"], ["output_tokens", "output"], ["total_tokens", "total"]]) {
          const value = usage[source];
          if (typeof value === "number" && Number.isFinite(value) && value >= 0) values[target] = value;
        }
        if (Object.keys(values).length) storage.getStore()?.setAttribute("langfuse.observation.usage_details", JSON.stringify(values));
      });
    },
  };
}

let observer: ReturnType<typeof createAiObserver> | undefined;
let provider: tracing.BasicTracerProvider | undefined;
let lastFailure = 0;
function reportFailure() {
  if (Date.now() - lastFailure > 60_000) {
    lastFailure = Date.now();
    console.error("Langfuse metadata export failed", { code: "LANGFUSE_EXPORT_FAILED" });
  }
}
function getObserver() {
  if (observer) return observer;
  const env = process.env;
  if (["false", "0", "off", "no"].includes(env.MUNJIB_LANGFUSE_ENABLED?.trim().toLowerCase() ?? "") || !env.LANGFUSE_PUBLIC_KEY?.trim() || !env.LANGFUSE_SECRET_KEY?.trim()) return createAiObserver();
  try {
    const baseUrl = env.LANGFUSE_BASEURL?.trim() || env.LANGFUSE_BASE_URL?.trim() || env.LANGFUSE_HOST?.trim() || "https://cloud.langfuse.com";
    const exporter = createSafeSpanExporter(new OTLPTraceExporter({
      url: `${baseUrl.replace(/\/$/, "")}/api/public/otel/v1/traces`,
      headers: { Authorization: `Basic ${Buffer.from(`${env.LANGFUSE_PUBLIC_KEY.trim()}:${env.LANGFUSE_SECRET_KEY.trim()}`).toString("base64")}`, "x-langfuse-ingestion-version": "4" },
      timeoutMillis: 5000,
    }));
    const processor = new LangfuseSpanProcessor({
      exporter,
      publicKey: env.LANGFUSE_PUBLIC_KEY.trim(), secretKey: env.LANGFUSE_SECRET_KEY.trim(),
      baseUrl: env.LANGFUSE_BASEURL?.trim() || env.LANGFUSE_BASE_URL?.trim() || env.LANGFUSE_HOST?.trim(),
      environment: env.LANGFUSE_TRACING_ENVIRONMENT?.trim() || "development",
      shouldExportSpan: ({ otelSpan }) => otelSpan.instrumentationScope.name === "munjib-ai-metadata",
      timeout: 5, flushInterval: 2,
      additionalHeaders: { "x-langfuse-ingestion-version": "4" },
    });
    provider = new tracing.BasicTracerProvider({ spanProcessors: [processor] });
    observer = createAiObserver(provider.getTracer("munjib-ai-metadata"));
    return observer;
  } catch { reportFailure(); return createAiObserver(); }
}
export function startAiObservation(surface: Surface, anonymousTrial: boolean) { return getObserver().start(surface, anonymousTrial); }
export function observeAiStage<T>(stage: Stage, work: () => Promise<T>, metadata?: Metadata) { return getObserver().stage(stage, work, metadata); }
export function recordAiUsage(result: unknown) { getObserver().usage(result); }
// Call from Next after() so a short request is not frozen before its batch flush.
export async function flushAiObservations() { try { await provider?.forceFlush(); } catch { reportFailure(); } }

export function scheduleAiObservationFlush() {
  try { after(flushAiObservations); } catch { /* Non-request scripts use explicit flush. */ }
}

export function createSafeSpanExporter(exporter: tracing.SpanExporter): tracing.SpanExporter {
  return {
    export(spans, callback) {
      try {
        exporter.export(spans, result => {
          if (result.code !== 0) reportFailure();
          callback({ code: result.code });
        });
      } catch { reportFailure(); callback({ code: 1 }); }
    },
    async shutdown() { try { await exporter.shutdown(); } catch { reportFailure(); } },
  };
}
