import { createHash, randomBytes } from "node:crypto";
import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { tracing, resources } from "@opentelemetry/sdk-node";
import type { EvalReport } from "./report";
const stableId = (value: string, length = 32) => createHash("sha256").update(value).digest("hex").slice(0,length);

/** A private OTel provider and explicit API payloads: never upload raw captures. */
export async function publishReport(report: EvalReport, env: NodeJS.ProcessEnv) {
  const publicKey = env.RAG_EVAL_LANGFUSE_PUBLIC_KEY;
  const secretKey = env.RAG_EVAL_LANGFUSE_SECRET_KEY;
  const baseUrl = env.RAG_EVAL_LANGFUSE_BASE_URL;
  if (!publicKey || !secretKey || !baseUrl) throw new Error("EVAL_LANGFUSE_CONFIG_REQUIRED");
  const client = new LangfuseClient({ publicKey, secretKey, baseUrl, timeout: 10 });
  const processor = new LangfuseSpanProcessor({ publicKey, secretKey, baseUrl, environment: "evaluation", timeout: 10, shouldExportSpan: ({ otelSpan }) => otelSpan.instrumentationScope.name === "munjib-rag-evaluation" });
  let activeTraceId = stableId(report.runId);
  const provider = new tracing.BasicTracerProvider({
    resource: resources.resourceFromAttributes({ "service.name": "munjib-rag-evaluation" }),
    idGenerator: { generateTraceId: () => activeTraceId, generateSpanId: () => randomBytes(8).toString("hex") },
    spanProcessors: [processor],
  });
  const datasetName = `munjib-rag-eval-${report.datasetVersion}-${report.corpusHash.slice(0,12)}`;
  const metadata = { datasetVersion: report.datasetVersion, corpusHash: report.corpusHash, rubricVersion: report.rubricVersion, configHash: report.configHash, gitSha: report.gitSha, dirtyDiffHash: report.dirtyDiffHash, mode: report.mode, index: report.index, captureMode: "scores-only" };
  for (const key of ["chatProvider", "chatModel", "judgeProvider", "judgeModel", "embedding"] as const) {
    const value = report.config[key];
    if (typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/@+-]{0,159}$/.test(value)) Object.assign(metadata, { [key]: value });
  }
  const publishedAfter = new Date(Date.now()-1000).toISOString();
  try {
    await client.api.datasets.create({ name: datasetName, metadata: { synthetic: true, captureMode: "scores-only" } });
    const traces: { id: string; scores: string[] }[] = [];
    for (const result of report.results) {
      const itemId = stableId(`${datasetName}:${result.id}`);
      await client.api.datasetItems.create({ id: itemId, datasetName, input: { caseId: result.id }, metadata: { surface: result.surface, category: result.category, split: result.split } });
      activeTraceId = stableId(`${report.runId}:${result.id}`);
      const span = provider.getTracer("munjib-rag-evaluation").startSpan("rag_evaluation");
      span.setAttributes({ "langfuse.trace.name": "rag_evaluation", "langfuse.observation.type": "span", "langfuse.trace.metadata": JSON.stringify({ ...metadata, caseId: result.id, status: result.status }), "langfuse.observation.metadata.caseStatus": result.status, "langfuse.observation.metadata.durationMs": String(result.durationMs) });
      span.end();
      const scoreIds: string[] = [];
      for (const [name, score] of Object.entries(result.scores)) if (score.status === "scored") {
        const id = stableId(`${report.runId}:${result.id}:${name}:${report.rubricVersion}`);
        client.score.create({ id, traceId: activeTraceId, name, value: score.value, dataType: "NUMERIC" });
        scoreIds.push(id);
      }
      await client.api.datasetRunItems.create({ runName: report.runId, datasetItemId: itemId, traceId: activeTraceId, metadata });
      traces.push({ id: activeTraceId, scores: scoreIds });
    }
    await provider.forceFlush();
    await client.flush();
    // Modern read APIs avoid the deprecated per-trace endpoint's tight rate limit.
    const expectedScores = traces.flatMap(trace => trace.scores);
    let verified = false;
    for (let attempt=0;attempt<8;attempt++) {
      const observations = await client.api.observations.getMany({ name: "rag_evaluation", fromStartTime: publishedAfter, limit: 1000, fields: "core" });
      const visibleTraces = new Set(observations.data.map(row => row.traceId));
      const visibleScores = new Set<string>();
      for (let i=0;i<expectedScores.length;i+=100) {
        const scores = await client.api.scores.getMany({ scoreIds: expectedScores.slice(i,i+100).join(","), limit: 100 });
        scores.data.forEach(score => visibleScores.add(score.id));
      }
      if (traces.every(trace => visibleTraces.has(trace.id)) && expectedScores.every(id => visibleScores.has(id))) { verified = true; break; }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    if (!verified) throw new Error("LANGFUSE_INGESTION_UNCONFIRMED");
    return { datasetName, runName: report.runId, verifiedCases: traces.length };
  } finally { await provider.shutdown(); await client.shutdown(); }
}
