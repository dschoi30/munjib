import type { EvaluationChunk } from "../evaluation-snapshot";
import { evidenceRecall, type Score } from "./evidence";
import type { EvalCase, EvalDataset } from "./schema";
export type Scores = Record<string, Score>;
export function retrievalScores(item: EvalCase, dataset: EvalDataset, stages: { global: EvaluationChunk[]; merged: EvaluationChunk[]; prompt: EvaluationChunk[] }): Scores {
  const score = (chunks: EvaluationChunk[]) => evidenceRecall(item.expectedEvidenceGroups, chunks, dataset.documents);
  if (item.surface === "ask") return { context_evidence_recall: score(stages.prompt), retrieval_recall_at_5: { status: "not_applicable" }, retrieval_recall_at_12: { status: "not_applicable" }, retrieval_recall_at_60: { status: "not_applicable" } };
  return { retrieval_recall_at_5: score(stages.global.slice(0,5)), retrieval_recall_at_12: score(stages.global.slice(0,12)), retrieval_recall_at_60: score(stages.global.slice(0,60)), merged_evidence_recall: score(stages.merged), prompt_evidence_recall: score(stages.prompt) };
}
export function contextSufficiency(item: EvalCase, recall: Score): "sufficient" | "partial" | "none" | "ambiguous" {
  if (item.corpusAnswerability === "ambiguous") return "ambiguous";
  if (recall.status !== "scored" || recall.value === 0) return "none";
  if (recall.value < 1 || item.corpusAnswerability === "partial") return "partial";
  return "sufficient";
}
