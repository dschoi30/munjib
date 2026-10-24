import type { EvaluationEvent } from "../evaluation-snapshot";
import type { Scores } from "./metrics";
import type { JudgeResult } from "./judge";
export type CaseResult = {
  id: string; surface: "workspace" | "ask"; category: string[]; split: string;
  status: "completed" | "pipeline_error" | "judge_error" | "timed_out" | "aborted";
  indexingStatus: "complete" | "failed" | "not_applicable";
  scores: Scores; durationMs: number; capture?: EvaluationEvent[]; judge?: JudgeResult; judgeUsage?: { input: number; output: number } | null;
  contextSufficiency?: string; errorCode?: string; forbiddenEvidence: boolean;
};
export type EvalReport = {
  version: 1; runId: string; datasetVersion: string; corpusHash: string; rubricVersion: string;
  configHash: string; config: Record<string, unknown>; gitSha: string; dirtyDiffHash: string;
  mode: "retrieval" | "e2e"; index: string; createdAt: string; results: CaseResult[];
  publish: "not_requested" | "pending" | "published" | "publish_failed";
};
export function summarize(results: CaseResult[]) {
  const metrics: Record<string, { mean: number | null; valid: number; notApplicable: number; unscorable: number }> = {};
  for (const result of results) for (const [name, score] of Object.entries(result.scores)) {
    const entry = metrics[name] ??= { mean: null, valid: 0, notApplicable: 0, unscorable: 0 };
    if (score.status === "scored") { entry.mean = ((entry.mean ?? 0)*entry.valid + score.value)/(entry.valid+1); entry.valid++; }
    else if (score.status === "not_applicable") entry.notApplicable++;
    else entry.unscorable++;
  }
  return { total: results.length, completed: results.filter(r => r.status === "completed").length, errors: results.filter(r => r.status !== "completed").length, forbiddenEvidence: results.filter(r => r.forbiddenEvidence).length, metrics };
}
export function reportMarkdown(report: EvalReport): string {
  const summary = summarize(report.results);
  const categories = [...new Set(report.results.flatMap(r => r.category))];
  return [`# RAG evaluation ${report.runId}`, "", `Mode: ${report.mode}; index: ${report.index}; dataset: ${report.datasetVersion}; rubric: ${report.rubricVersion}`, `Completed: ${summary.completed}/${summary.total}; errors: ${summary.errors}; forbidden evidence: ${summary.forbiddenEvidence}; publish: ${report.publish}`, "", "| Metric | Mean | Valid N | N/A | Unscorable |", "| --- | --- | --- | --- | --- |", ...Object.entries(summary.metrics).map(([name,m]) => `| ${name} | ${m.mean?.toFixed(3) ?? "unknown"} | ${m.valid} | ${m.notApplicable} | ${m.unscorable} |`), "", "## Categories", ...categories.map(c => `- ${c}: ${JSON.stringify(summarize(report.results.filter(r => r.category.includes(c))))}`), "", "## Cases", ...report.results.map(r => `- ${r.id}: ${r.status}, ${r.durationMs}ms${r.errorCode ? ` (${r.errorCode})` : ""}`), "", "Scores are advisory until human calibration; failures and N/A are never imputed as zero or perfect scores.", ""].join("\n");
}
export function compareReports(baseline: EvalReport, candidate: EvalReport) {
  if (baseline.datasetVersion !== candidate.datasetVersion || baseline.corpusHash !== candidate.corpusHash || baseline.rubricVersion !== candidate.rubricVersion || baseline.mode !== candidate.mode || baseline.index !== candidate.index) throw new Error("INCOMPARABLE_RUNS");
  const keys = (r: EvalReport) => r.results.map(x => x.id).sort().join("\n");
  if (keys(baseline) !== keys(candidate) || new Set(candidate.results.map(x => x.id)).size !== candidate.results.length) throw new Error("CASE_SET_MISMATCH");
  const before = summarize(baseline.results), after = summarize(candidate.results);
  const regressions = candidate.results.flatMap(next => {
    const previous = baseline.results.find(x => x.id === next.id)!;
    return Object.entries(next.scores).flatMap(([name, score]) => {
      const old = previous.scores[name];
      const lowerIsBetter = ["unsupported_answer_rate", "false_abstention_rate"].includes(name);
      return score.status === "scored" && old?.status === "scored" && (lowerIsBetter ? score.value > old.value : score.value < old.value) ? [{ caseId: next.id, metric: name, before: old.value, after: score.value }] : [];
    });
  });
  const coverageDropped = Object.entries(before.metrics).some(([name, m]) => (after.metrics[name]?.valid ?? 0) < m.valid);
  return { before, after, regressions, changedConfiguration: baseline.configHash !== candidate.configHash,
    hardFailure: after.forbiddenEvidence > 0 || after.errors > before.errors || coverageDropped };
}
