import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import { evaluationDatabase, seedEvaluationCase } from "./eval-seed";
import { parseDataset } from "../../lib/rag/evaluation/schema";
import { withEvaluationCapture, type EvaluationCapture, type EvaluationEvent } from "../../lib/rag/evaluation-snapshot";
import { retrievalScores, contextSufficiency } from "../../lib/rag/evaluation/metrics";
import { evaluateAnswer, judgeScores, RUBRIC_VERSION } from "../../lib/rag/evaluation/judge";
import { reportMarkdown, type EvalReport, type CaseResult } from "../../lib/rag/evaluation/report";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const positive = (v: string | undefined, fallback: number, max: number) => {
  const n = v === undefined ? fallback : Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error("INVALID_BUDGET");
  return n;
};
async function main() {
  const { values } = parseArgs({ options: { mode: { type: "string", default: "retrieval" }, dataset: { type: "string", default: "core-ko-v1" }, index: { type: "string", default: "warm" }, judge: { type: "string" }, case: { type: "string", multiple: true }, limit: { type: "string" }, "publish-langfuse": { type: "boolean" }, "publish-report": { type: "string" }, validate: { type: "boolean" } } });
  if (values.dataset !== "core-ko-v1" || !["retrieval","e2e"].includes(values.mode!) || !["warm","cold","stale"].includes(values.index!)) throw new Error("INVALID_EVAL_OPTIONS");
  const dataset = parseDataset(JSON.parse(await readFile(path.resolve("tests/fixtures/rag-eval/core-ko-v1.json"), "utf8")));
  if (values.validate) { console.log(`Validated ${dataset.cases.length} synthetic cases`); return; }
  if (values["publish-report"]) {
    const report = JSON.parse(await readFile(values["publish-report"], "utf8")) as EvalReport;
    // Only reports from this shipped synthetic dataset may be republished.
    if (report.datasetVersion !== dataset.version || report.corpusHash !== hash(JSON.stringify(dataset)) || report.results.some(r => !dataset.cases.some(c => c.id === r.id))) throw new Error("UNTRUSTED_PUBLISH_REPORT");
    const { publishReport } = await import("../../lib/rag/evaluation/langfuse");
    try { console.log(await publishReport(report, process.env)); report.publish = "published"; }
    catch (error) { report.publish = "publish_failed"; throw error; }
    finally {
      await writeFile(values["publish-report"],JSON.stringify(report,null,2)+"\n");
      await writeFile(path.join(path.dirname(values["publish-report"]),"report.md"),reportMarkdown(report));
    }
    return;
  }
  process.env.DATABASE_URL = evaluationDatabase(process.env);
  if (!process.env.RAG_EVAL_CHAT_PROVIDER || !process.env.RAG_EVAL_CHAT_MODEL || !process.env.RAG_EVAL_EMBED_BASE_URL) throw new Error("EVAL_PROVIDER_CONFIG_REQUIRED");
  if (values.mode === "e2e" && (!process.env.RAG_EVAL_JUDGE_PROVIDER || values.judge !== "configured")) throw new Error("EXPLICIT_JUDGE_REQUIRED");
  process.env.MUNJIB_RAG_CHAT_PROVIDER = process.env.RAG_EVAL_CHAT_PROVIDER;
  process.env.MUNJIB_RAG_CHAT_MODEL = process.env.RAG_EVAL_CHAT_MODEL;
  process.env.MUNJIB_OLLAMA_BASE_URL = process.env.RAG_EVAL_EMBED_BASE_URL;
  process.env.MUNJIB_RAG_EMBED_PROVIDER = "ollama";
  process.env.MUNJIB_RAG_EMBED_MODEL = "bge-m3";
  process.env.MUNJIB_RAG_EMBED_DIMENSIONS = "1024";
  process.env.MUNJIB_LANGFUSE_ENABLED = "false";
  const { prisma } = await import("../../lib/db/client");
  const { indexSavedDocument } = await import("../../lib/rag/index-document");
  const { embedText } = await import("../../lib/rag/embedding-client");
  const { prepareWorkspaceChatMessageStream, sendPreparedWorkspaceChatMessageStream } = await import("../../lib/rag/workspace-chat");
  const { prepareAskDocumentQuestion, answerPreparedAskDocumentQuestion } = await import("../../lib/rag/ask");
  const limit = positive(values.limit, dataset.cases.length, dataset.cases.length);
  const timeoutMs = positive(process.env.RAG_EVAL_CASE_TIMEOUT_MS, 120000, 600000);
  const totalTimeoutMs = positive(process.env.RAG_EVAL_RUN_TIMEOUT_MS, 1800000, 3600000);
  const maxTokenBudget = positive(process.env.RAG_EVAL_TOKEN_BUDGET, 1000000, 10000000);
  const generationLimit = positive(process.env.RAG_EVAL_MAX_OUTPUT_TOKENS, 1024, 4096);
  const cases = dataset.cases.filter(c => !values.case || values.case.includes(c.id)).slice(0,limit);
  if (!cases.length || values.case?.some(id => !dataset.cases.some(c => c.id === id))) throw new Error("UNKNOWN_CASE");
  const config = { chatProvider: process.env.RAG_EVAL_CHAT_PROVIDER, chatModel: process.env.RAG_EVAL_CHAT_MODEL, judgeProvider: process.env.RAG_EVAL_JUDGE_PROVIDER, judgeModel: process.env.RAG_EVAL_JUDGE_MODEL, embedding: "ollama:bge-m3:1024", generationLimit, judgeMaxOutput: 2048, judgeMaxAttempts: 2, caseTimeoutMs: timeoutMs, tokenBudget: maxTokenBudget, judgeSameModel: process.env.RAG_EVAL_CHAT_MODEL === process.env.RAG_EVAL_JUDGE_MODEL };
  const report: EvalReport = { version: 1, runId: `${Date.now()}-${randomUUID().slice(0,8)}`, datasetVersion: dataset.version, corpusHash: hash(JSON.stringify(dataset)), rubricVersion: RUBRIC_VERSION, configHash: hash(JSON.stringify(config)), config, gitSha: execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(), dirtyDiffHash: hash(execFileSync("git",["diff","HEAD"],{encoding:"utf8"})), mode: values.mode as "retrieval" | "e2e", index: values.index!, createdAt: new Date().toISOString(), results: [], publish: values["publish-langfuse"] ? "pending" : "not_requested" };
  const dir = path.resolve("test-results/rag-eval", report.runId);
  await mkdir(dir, { recursive: true });
  const save = async () => { await writeFile(path.join(dir,"report.json"),JSON.stringify(report,null,2)+"\n"); await writeFile(path.join(dir,"report.md"),reportMarkdown(report)); };
  const embeddings = new Map<string,number[]>();
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT",abort); process.once("SIGTERM",abort);
  const totalTimer = setTimeout(abort,totalTimeoutMs);
  let reservedTokens = 0;
  try {
    for (const item of cases) {
      const start = Date.now();
      const result: CaseResult = { id: item.id, surface: item.surface, category: item.category, split: item.split, status: "pipeline_error", indexingStatus: item.surface === "ask" ? "not_applicable" : "not_completed", scores: {}, durationMs: 0, forbiddenEvidence: false };
      const capture: EvaluationCapture = { events: [], failed: false, generationLimit };
      const caseController = new AbortController();
      const timer = setTimeout(()=>caseController.abort(), timeoutMs);
      const signal = AbortSignal.any([controller.signal,caseController.signal]);
      let fixture: Awaited<ReturnType<typeof seedEvaluationCase>> | undefined;
      let preparedObservation: { end(error?: unknown): void } | undefined;
      let judgePhase = false;
      try {
        signal.throwIfAborted();
        // Conservative reservation: one token per input character plus output caps.
        const sourceChars = dataset.documents.filter(d => item.readableDocumentKeys.includes(d.key) && (item.surface !== "ask" || d.key === item.selectedDocumentKey)).reduce((n,d)=>n+d.content.length,0);
        const reservation = values.mode === "e2e" ? Math.min(sourceChars,60000)*3 + generationLimit + 4096 + 10000 : 0;
        if (reservedTokens+reservation > maxTokenBudget) throw new Error("RUN_TOKEN_BUDGET_EXCEEDED");
        reservedTokens += reservation;
        fixture = await seedEvaluationCase(prisma,dataset,item,report.runId);
        const f = fixture;
        if (item.surface === "workspace") {
          // Seed probe evidence independently of the tested principal, including
          // cold runs, so a broken readable-document SQL predicate is observable.
          const indexKeys = dataset.documents.filter(doc => doc.authorizationProbe || (values.index !== "cold" && item.readableDocumentKeys.includes(doc.key))).map(doc => doc.key);
          for (const key of indexKeys) {
            const document = await prisma.document.findUniqueOrThrow({ where: { id: f.documentIds.get(key)! } });
            const indexed = await indexSavedDocument({ document, signal, privacySafeLogging: true, embedText: async text => {
              if (!embeddings.has(text)) embeddings.set(text,await embedText(text,{ signal,privacySafeLogging:true }));
              return embeddings.get(text)!;
            } });
            if (!indexed) throw new Error("WARM_INDEX_INCOMPLETE");
          }
          if (values.index === "stale") await prisma.document.update({ where: { id: f.documentIds.get(item.selectedDocumentKey ?? item.readableDocumentKeys[0])! }, data: { updatedAt: new Date(Date.now()+1000) } });
        }
        await withEvaluationCapture(capture,async () => {
          if (item.surface === "workspace") {
            const prepared = await prepareWorkspaceChatMessageStream({ workspaceSlug: f.workspace.slug, actorId: f.user.id, message: item.question, selectedDocumentId: f.documentIds.get(item.selectedDocumentKey ?? ""), uiLanguage: "ko", signal });
            preparedObservation = prepared.observation;
            if (values.mode === "e2e") await sendPreparedWorkspaceChatMessageStream(prepared,{ signal, onToken: ()=>{} });
          } else {
            const prepared = await prepareAskDocumentQuestion({ workspaceSlug:f.workspace.slug, documentId:f.documentIds.get(item.selectedDocumentKey!)!, authorizationPrincipal:{kind:"user",userId:f.user.id},question:item.question,uiLanguage:"ko" });
            preparedObservation = prepared.observation;
            if (values.mode === "e2e") await answerPreparedAskDocumentQuestion(prepared,{ signal });
          }
        });
        if (capture.failed) throw new Error("CAPTURE_FAILED");
        const context = capture.events.find((e): e is Extract<EvaluationEvent,{stage:"context"}> => e.stage === "context");
        if (!context) throw new Error("MISSING_CONTEXT_CAPTURE");
        result.indexingStatus = item.surface === "ask" ? "not_applicable" : "complete";
        const keyById = new Map([...f.documentIds].map(([key,id])=>[id,key]));
        const convert = (chunks: typeof context.prompt) => chunks.map(c=>({documentId:keyById.get(c.documentId) ?? "unknown",content:c.content}));
        result.forbiddenEvidence = [...context.global,...context.selected,...context.merged,...context.prompt].some(c=>!item.readableDocumentKeys.includes(keyById.get(c.documentId) ?? ""));
        result.scores = retrievalScores(item,dataset,{ global:convert(context.global),merged:convert(context.merged),prompt:convert(context.prompt) });
        const sufficiency = contextSufficiency(item,result.scores.prompt_evidence_recall ?? result.scores.context_evidence_recall);
        result.contextSufficiency = sufficiency;
        if (values.mode === "e2e") {
          judgePhase = true;
          const answer = capture.events.find((e): e is Extract<EvaluationEvent,{stage:"answer"}>=>e.stage==="answer");
          if (!answer) throw new Error("MISSING_FINAL_ANSWER");
          if (answer.answer.includes("EVAL-SECRET-9417") || answer.answer.includes("987654321")) result.forbiddenEvidence = true;
          const judgeInput = {question:item.question,history:item.history,answer:answer.answer,context:context.prompt.map((c,i)=>({id:`context-${i+1}`,content:c.content})),sufficiency};
          const judged = await evaluateAnswer(judgeInput,process.env,signal);
          result.judge = judged.result;
          result.judgeUsage = judged.usage;
          Object.assign(result.scores,judgeScores(judged.result,judgeInput));
        }
        result.status = "completed";
      } catch (error) {
        result.status = controller.signal.aborted ? "aborted" : caseController.signal.aborted ? "timed_out" : judgePhase ? "judge_error" : "pipeline_error";
        const code = error instanceof Error ? error.message : "EVAL_CASE_FAILED";
        result.errorCode = /^[A-Z][A-Z0-9_]{2,80}$/.test(code) ? code : "EVAL_CASE_FAILED";
      } finally {
        preparedObservation?.end(); clearTimeout(timer);
        result.capture = capture.events;
        if (capture.events.some(e=>e.stage==="index" && e.status==="failed")) result.indexingStatus="failed";
        if (fixture) {
          try { await fixture.cleanup(); }
          catch { result.status = "pipeline_error"; result.errorCode = "FIXTURE_CLEANUP_FAILED"; controller.abort(); }
        }
        result.durationMs=Date.now()-start; report.results.push(result); await save();
      }
      console.log(`${item.id}: ${result.status} (${result.durationMs}ms)${result.errorCode ? ` ${result.errorCode}` : ""}`);
      if (controller.signal.aborted) break;
    }
    if (values["publish-langfuse"]) {
      try { const { publishReport }=await import("../../lib/rag/evaluation/langfuse"); console.log(await publishReport(report,process.env)); report.publish="published"; }
      catch { report.publish="publish_failed"; process.exitCode=1; }
    }
    if (report.results.some(r=>r.status!=="completed" || r.forbiddenEvidence) || report.results.length!==cases.length) process.exitCode=1;
  } finally { clearTimeout(totalTimer); process.removeListener("SIGINT",abort); process.removeListener("SIGTERM",abort); await save(); await prisma.$disconnect(); console.log(`Report: ${path.join(dir,"report.json")}`); }
}
main().catch(error=>{ const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message) ? error.message : "EVALUATION_RUN_FAILED"; console.error(code); process.exitCode=1; });
