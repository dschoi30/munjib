import type { EvalReport } from "./report";
export type HumanLabel = { caseId: string; relevance: 0 | 0.5 | 1; behavior: string; reason: string };
export function calibrate(report: EvalReport, labels: HumanLabel[]) {
  if (!Array.isArray(labels) || new Set(labels.map(l=>l.caseId)).size!==labels.length) throw new Error("INVALID_HUMAN_LABELS");
  let matched=0;
  for (const label of labels) {
    const row=report.results.find(r=>r.id===label.caseId && r.split==="calibration");
    if (!row?.judge || ![0,0.5,1].includes(label.relevance) || !["answered","partial","abstained","clarified","fabricated"].includes(label.behavior) || !label.reason?.trim()) throw new Error("INVALID_CALIBRATION_LABEL");
    matched += Number(label.relevance===row.judge.relevance)+Number(label.behavior===row.judge.behavior);
  }
  const agreement=labels.length ? matched/(labels.length*2) : null;
  return { cases:labels.length,agreement,eligibleForGate:labels.length>=10 && agreement!==null && agreement>=0.8,warning:"Human labels are required. Small-sample agreement does not establish factual accuracy or replace review of disagreements." };
}
