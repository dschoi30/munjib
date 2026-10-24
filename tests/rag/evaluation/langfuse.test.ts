import { beforeEach, describe, expect, it, vi } from "vitest";
const calls=vi.hoisted(()=>({payloads:[] as unknown[], scores:[] as {id:string;traceId:string}[]}));
vi.mock("@langfuse/client",()=>({LangfuseClient:class {
  api={datasets:{create:async(body:unknown)=>{calls.payloads.push(body);}},datasetItems:{create:async(body:unknown)=>{calls.payloads.push(body);}},datasetRunItems:{create:async(body:unknown)=>{calls.payloads.push(body);}},observations:{getMany:async()=>({data:calls.scores.map(s=>({traceId:s.traceId}))})},scores:{getMany:async()=>({data:calls.scores})}};
  score={create:(body:{id:string;traceId:string})=>{calls.scores.push(body);calls.payloads.push(body);}};
  async flush(){} async shutdown(){}
}}));
vi.mock("@langfuse/otel",()=>({LangfuseSpanProcessor:class {onStart(){} onEnd(span: {attributes: unknown}){calls.payloads.push(span.attributes);} async forceFlush(){} async shutdown(){}}}));
import { publishReport } from "@/lib/rag/evaluation/langfuse";
import type { EvalReport } from "@/lib/rag/evaluation/report";
beforeEach(()=>{calls.payloads.length=0;calls.scores.length=0;});
describe("score-only Langfuse publishing",()=>{
  it("never uploads capture/judge text and uses stable per-run score IDs",async()=>{
    const report={version:1,runId:"r",datasetVersion:"synthetic",corpusHash:"h",rubricVersion:"v",configHash:"c",gitSha:"s",dirtyDiffHash:"d",mode:"e2e",index:"warm",createdAt:"now",publish:"pending",config:{},results:[{id:"ko-01",surface:"ask",category:["direct"],split:"regression",status:"completed",indexingStatus:"not_applicable",durationMs:1,forbiddenEvidence:false,scores:{faithfulness:{status:"scored",value:1},other:{status:"not_applicable"}},capture:[{stage:"answer",answer:"PRIVATE ANSWER",raw:"PRIVATE RAW"}],judge:{reason:"PRIVATE REASON",claims:[],relevance:1,behavior:"answered"}}]} as EvalReport;
    const env={NODE_ENV:"test",RAG_EVAL_LANGFUSE_PUBLIC_KEY:"pk-test",RAG_EVAL_LANGFUSE_SECRET_KEY:"sk-test",RAG_EVAL_LANGFUSE_BASE_URL:"https://langfuse.invalid"} as NodeJS.ProcessEnv;
    await publishReport(report,env);
    const id=calls.scores[0].id;
    expect(JSON.stringify(calls.payloads)).not.toContain("PRIVATE");
    expect(calls.scores).toHaveLength(1);
    await publishReport(report,env);
    expect(calls.scores[1].id).toBe(id);
  });
});
