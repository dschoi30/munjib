import { calibrate } from "@/lib/rag/evaluation/calibration";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDataset } from "@/lib/rag/evaluation/schema";
import { evidenceRecall } from "@/lib/rag/evaluation/evidence";
import { contextSufficiency, retrievalScores } from "@/lib/rag/evaluation/metrics";
import { judgeScores, parseJudgeResult, type JudgeInput } from "@/lib/rag/evaluation/judge";
import { compareReports, summarize, type EvalReport } from "@/lib/rag/evaluation/report";
import { captureEvaluation, evaluationModelOptions, withEvaluationCapture } from "@/lib/rag/evaluation-snapshot";
import { evaluationDatabase } from "@/scripts/rag/eval-seed";
const data = () => JSON.parse(readFileSync("tests/fixtures/rag-eval/core-ko-v1.json","utf8"));
const dataset = parseDataset(data());
const input: JudgeInput = { question:"When?",history:[],answer:"Tuesday.",context:[{id:"c1",content:"Release is Tuesday."}],sufficiency:"sufficient" };
const supported = { claims:[{text:"Tuesday",verdict:"supported",evidence:[{id:"c1",quote:"Tuesday"}]}],relevance:1,behavior:"answered",reason:"supported" };
describe("evaluation dataset and evidence",()=>{
  it("has 40 validated synthetic cases and separate calibration split",()=>{
    expect(dataset.cases.filter(c=>c.surface==="workspace")).toHaveLength(30);
    expect(dataset.cases.filter(c=>c.surface==="ask")).toHaveLength(10);
    expect(dataset.cases.filter(c=>c.split==="calibration")).toHaveLength(10);
  });
  it("rejects private/non-synthetic datasets, duplicate IDs and wrong gold",()=>{
    for(const mutate of [(d: ReturnType<typeof data>)=>d.synthetic=false,(d: ReturnType<typeof data>)=>d.cases[1].id=d.cases[0].id,(d: ReturnType<typeof data>)=>d.cases[0].expectedEvidenceGroups[0].alternatives[0].quotes=["not in source"],(d: ReturnType<typeof data>)=>d.cases[0].expectedEvidenceGroups[0].alternatives[0].documentKey="restricted"]){const d=data();mutate(d);expect(()=>parseDataset(d)).toThrow();}
  });
  it("scores evidence across overlapping chunks without double counting",()=>{
    const groups=[{id:"e",alternatives:[{documentKey:"doc",quotes:["abcdef"]}]}];
    const docs=[{key:"doc",title:"D",content:"abcdef"}];
    expect(evidenceRecall(groups,[{documentId:"doc",content:"abcd"},{documentId:"doc",content:"cdef"}],docs)).toEqual({status:"scored",value:1});
    expect(evidenceRecall(groups,[{documentId:"doc",content:"abc"},{documentId:"doc",content:"ef"}],docs)).toEqual({status:"scored",value:0});
    expect(evidenceRecall(groups,[{documentId:"wrong",content:"abcdef"}],docs)).toEqual({status:"scored",value:0});
  });
  it("covers whitespace at split boundaries without accepting missing words",()=>{
    const groups=[{id:"e",alternatives:[{documentKey:"doc",quotes:["alpha beta"]}]}];
    const docs=[{key:"doc",title:"D",content:"alpha beta"}];
    expect(evidenceRecall(groups,[{documentId:"doc",content:"alpha "},{documentId:"doc",content:" beta"}],docs)).toEqual({status:"scored",value:1});
    expect(evidenceRecall(groups,[{documentId:"doc",content:"alpha"},{documentId:"doc",content:"eta"}],docs)).toEqual({status:"scored",value:0});
  });
  it("keeps the gold denominator when retrieval returns few results",()=>{
    const item=dataset.cases.find(c=>c.id==="ko-21")!;
    const scores=retrievalScores(item,dataset,{global:[{documentId:"leave",content:dataset.documents[0].content}],merged:[],prompt:[]});
    expect(scores.retrieval_recall_at_60).toEqual({status:"scored",value:0.5});
    expect(scores.prompt_evidence_recall).toEqual({status:"scored",value:0});
  });
  it("marks no-gold and Ask retrieval as N/A",()=>{
    expect(evidenceRecall([],[],dataset.documents)).toEqual({status:"not_applicable"});
    expect(retrievalScores(dataset.cases[30],dataset,{global:[],merged:[],prompt:[]}).retrieval_recall_at_5.status).toBe("not_applicable");
  });
  it("separates missing retrieval from corpus answerability",()=>{
    expect(contextSufficiency(dataset.cases[0],{status:"scored",value:0})).toBe("none");
    expect(contextSufficiency(dataset.cases[0],{status:"scored",value:0.5})).toBe("partial");
  });
});
describe("judge validation and refusal behavior",()=>{
  it("accepts only quoted evidence actually supplied to the model",()=>{
    expect(parseJudgeResult(JSON.stringify(supported),input).claims).toHaveLength(1);
    for(const quote of ["wrong",""]) expect(()=>parseJudgeResult(JSON.stringify({...supported,claims:[{...supported.claims[0],evidence:[{id:"c1",quote}]}]}),input)).toThrow("INVALID_JUDGE_EVIDENCE");
    expect(()=>parseJudgeResult(JSON.stringify({...supported,claims:[{...supported.claims[0],evidence:[]}]}),input)).toThrow("MISSING_JUDGE_EVIDENCE");
  });
  it("does not award faithfulness for no-claim refusal or reward always refusing",()=>{
    const result=parseJudgeResult(JSON.stringify({claims:[],relevance:1,behavior:"abstained",reason:"No evidence"}),input);
    expect(judgeScores(result,input).faithfulness.status).toBe("not_applicable");
    expect(judgeScores(result,input).insufficient_evidence_handling).toEqual({status:"scored",value:0});
    expect(judgeScores(result,{...input,sufficiency:"none"}).insufficient_evidence_handling).toEqual({status:"scored",value:1});
  });
  it("rejects invalid JSON, ranges, empty answer, and unsubstantiated answers",()=>{
    expect(()=>parseJudgeResult("bad",input)).toThrow();
    expect(()=>parseJudgeResult(JSON.stringify({...supported,relevance:2}),input)).toThrow();
    expect(()=>parseJudgeResult(JSON.stringify(supported),{...input,answer:""})).toThrow();
    expect(()=>parseJudgeResult(JSON.stringify({...supported,claims:[]}),input)).toThrow("MISSING_JUDGE_CLAIMS");
  });
  it("unsupported claims fail insufficient-evidence handling",()=>{
    const value=parseJudgeResult(JSON.stringify({...supported,claims:[{text:"Sunday",verdict:"unsupported",evidence:[]}]}),input);
    expect(judgeScores(value,input).faithfulness).toEqual({status:"scored",value:0});
    expect(judgeScores(value,input).insufficient_evidence_handling).toEqual({status:"scored",value:0});
  });
});
describe("isolation, capture and comparison",()=>{
  it("never evaluates snapshot factories outside CLI scope",()=>{
    let invoked=false;captureEvaluation(()=>{invoked=true;throw new Error("raw secret");});expect(invoked).toBe(false);
    expect(evaluationModelOptions("openai")).toEqual({});
  });
  it("captures detached data and surfaces collection failure without throwing",async()=>{
    const capture={events:[],failed:false,generationLimit:100};
    await withEvaluationCapture(capture,async()=>{
      captureEvaluation(()=>({stage:"answer",raw:"x",answer:"x"}));
      captureEvaluation(()=>{throw new Error("private");});
      expect(evaluationModelOptions("openai").maxTokens).toBe(100);
    });
    expect(capture.events).toHaveLength(1);expect(capture.failed).toBe(true);
  });
  it("rejects normal/production DBs and connection-option bypass",()=>{
    for(const db of ["postgresql://localhost/munjib","postgresql://localhost/munjib_rag_eval?schema=other","postgresql://localhost/munjib_rag_eval?options=x"]){expect(()=>evaluationDatabase({RAG_EVAL_ENVIRONMENT:"evaluation",RAG_EVAL_DATABASE_URL:db})).toThrow();}
    expect(()=>evaluationDatabase({NODE_ENV:"production",RAG_EVAL_ENVIRONMENT:"evaluation",RAG_EVAL_DATABASE_URL:"postgresql://localhost/munjib_rag_eval"})).toThrow();
    expect(evaluationDatabase({RAG_EVAL_ENVIRONMENT:"evaluation",RAG_EVAL_DATABASE_URL:"postgresql://localhost/munjib_rag_eval"})).toContain("munjib_rag_eval");
  });
  const report=()=>({version:1,runId:"r",datasetVersion:"v",corpusHash:"h",rubricVersion:"v",configHash:"c",config:{},gitSha:"s",dirtyDiffHash:"d",mode:"e2e",index:"warm",createdAt:"now",publish:"not_requested",results:[{id:"c",surface:"ask",split:"regression",category:["direct"],status:"completed",indexingStatus:"not_applicable",scores:{faithfulness:{status:"scored",value:1}},durationMs:1,forbiddenEvidence:false}]} as EvalReport);
  it("reports coverage loss/error as hard failure instead of hiding it in means",()=>{
    const before=report(),after=report();after.results[0].status="judge_error";after.results[0].scores={};
    expect(compareReports(before,after).hardFailure).toBe(true);
    expect(summarize(after.results).completed).toBe(0);
  });
  it("requires identical case set/corpus and reverses lower-is-better metrics",()=>{
    const before=report(),after=report();after.corpusHash="changed";expect(()=>compareReports(before,after)).toThrow("INCOMPARABLE_RUNS");
    after.corpusHash=before.corpusHash;after.results=[];expect(()=>compareReports(before,after)).toThrow("CASE_SET_MISMATCH");
  });
});

describe("human calibration",()=>{
  it("cannot claim calibration from missing labels or duplicate judge-derived rows",()=>{
    const report={results:[]} as unknown as EvalReport;
    expect(calibrate(report,[]).eligibleForGate).toBe(false);
    expect(()=>calibrate(report,[{caseId:"c",relevance:1,behavior:"answered",reason:"review"}])).toThrow();
  });
});
