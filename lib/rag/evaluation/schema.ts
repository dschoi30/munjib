export type Behavior = "answered" | "partial" | "abstained" | "clarified" | "fabricated";
export type Evidence = { documentKey: string; quotes: string[] };
export type EvidenceGroup = { id: string; alternatives: Evidence[] };
export type EvalDocument = { key: string; title: string; content: string };
export type EvalCase = {
  id: string; surface: "workspace" | "ask"; category: string[]; split: "calibration" | "regression";
  question: string; selectedDocumentKey?: string; readableDocumentKeys: string[];
  history: { role: "USER" | "ASSISTANT"; content: string }[];
  expectedEvidenceGroups: EvidenceGroup[]; requiredFacts: string[];
  corpusAnswerability: "sufficient" | "partial" | "none" | "ambiguous";
  expectedBehavior: Exclude<Behavior, "fabricated">; language: "ko";
};
export type EvalDataset = { version: string; corpusVersion: string; synthetic: true; documents: EvalDocument[]; cases: EvalCase[] };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
export function parseDataset(value: unknown): EvalDataset {
  if (!record(value) || value.synthetic !== true || typeof value.version !== "string" || typeof value.corpusVersion !== "string" || !Array.isArray(value.documents) || !Array.isArray(value.cases)) throw new Error("INVALID_DATASET");
  const docs = new Map<string, string>();
  for (const doc of value.documents) {
    if (!record(doc) || typeof doc.key !== "string" || !/^[a-z0-9-]+$/.test(doc.key) || typeof doc.title !== "string" || typeof doc.content !== "string" || docs.has(doc.key)) throw new Error("INVALID_DOCUMENT");
    docs.set(doc.key, doc.content);
  }
  const ids = new Set<string>();
  for (const item of value.cases) {
    if (!record(item) || typeof item.id !== "string" || !/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id) || !["ask", "workspace"].includes(String(item.surface)) || !["calibration", "regression"].includes(String(item.split)) || typeof item.question !== "string" || !item.question.trim() || !strings(item.category) || !strings(item.readableDocumentKeys) || !strings(item.requiredFacts) || !Array.isArray(item.expectedEvidenceGroups) || !Array.isArray(item.history) || item.language !== "ko" || !["sufficient", "partial", "none", "ambiguous"].includes(String(item.corpusAnswerability)) || !["answered", "partial", "abstained", "clarified"].includes(String(item.expectedBehavior))) throw new Error("INVALID_CASE");
    ids.add(item.id);
    if (item.readableDocumentKeys.some(key => !docs.has(key))) throw new Error("UNKNOWN_DOCUMENT");
    if (item.selectedDocumentKey !== undefined && (typeof item.selectedDocumentKey !== "string" || !item.readableDocumentKeys.includes(item.selectedDocumentKey))) throw new Error("INVALID_SELECTION");
    if (item.surface === "ask" && !item.selectedDocumentKey) throw new Error("ASK_REQUIRES_DOCUMENT");
    for (const turn of item.history) if (!record(turn) || !["USER", "ASSISTANT"].includes(String(turn.role)) || typeof turn.content !== "string") throw new Error("INVALID_HISTORY");
    const evidenceIds = new Set<string>();
    for (const group of item.expectedEvidenceGroups) {
      if (!record(group) || typeof group.id !== "string" || evidenceIds.has(group.id) || !Array.isArray(group.alternatives) || !group.alternatives.length) throw new Error("INVALID_EVIDENCE");
      evidenceIds.add(group.id);
      for (const alt of group.alternatives) {
        if (!record(alt) || typeof alt.documentKey !== "string" || !item.readableDocumentKeys.includes(alt.documentKey) || (item.surface === "ask" && alt.documentKey !== item.selectedDocumentKey) || !strings(alt.quotes) || !alt.quotes.length || alt.quotes.some(q => !q.trim() || !docs.get(String(alt.documentKey))?.includes(q))) throw new Error("INVALID_GOLD_QUOTE");
      }
    }
    if (["sufficient", "partial"].includes(String(item.corpusAnswerability)) && !item.expectedEvidenceGroups.length) throw new Error("MISSING_GOLD");
  }
  return value as unknown as EvalDataset;
}
