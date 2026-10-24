import type { EvaluationChunk } from "../evaluation-snapshot";
import type { EvalDataset, EvidenceGroup } from "./schema";
export type Score = { status: "scored"; value: number } | { status: "not_applicable" | "unscorable" };
export const normalize = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();

/** Match source intervals: overlap chunks cannot double-count a gold group. */
export function evidenceRecall(groups: EvidenceGroup[], chunks: EvaluationChunk[], corpus: EvalDataset["documents"]): Score {
  if (!groups.length) return { status: "not_applicable" };
  const covered = groups.filter(group => group.alternatives.some(alt => {
    const source = corpus.find(doc => doc.key === alt.documentKey)?.content;
    if (!source) return false;
    const body = normalize(source);
    const contents = chunks.filter(c => c.documentId === alt.documentKey).map(c => normalize(c.content));
    return alt.quotes.every(quote => {
      const target = normalize(quote);
      if (contents.some(c => c.includes(target))) return true;
      const start = body.indexOf(target);
      if (start < 0) return false;
      const intervals: [number, number][] = [];
      for (const content of contents) {
        let index = body.indexOf(content);
        while (content && index !== -1) {
          intervals.push([index, index + content.length]);
          index = body.indexOf(content, index + 1);
        }
      }
      let cursor = start;
      for (const [left, right] of intervals.sort((a,b) => a[0]-b[0])) {
        if (left > cursor && body.slice(cursor,left).trim()) break;
        if (right > cursor) cursor = right;
      }
      return cursor >= start + target.length;
    });
  })).length;
  return { status: "scored", value: covered / groups.length };
}
