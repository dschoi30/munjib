import { AsyncLocalStorage } from "node:async_hooks";

export type EvaluationChunk = { documentId: string; content: string };
export type EvaluationEvent =
  | { stage: "context"; surface: "workspace" | "ask"; question: string; retrievalQuestion: string; global: EvaluationChunk[]; selected: EvaluationChunk[]; merged: EvaluationChunk[]; prompt: EvaluationChunk[]; systemPrompt: string; userPrompt: string; partial?: boolean }
  | { stage: "index"; documentId: string; status: "candidate" | "fresh" | "indexed" | "failed" }
  | { stage: "answer"; raw: string; answer: string }
  | { stage: "usage"; input: number; output: number };
export type EvaluationCapture = { events: EvaluationEvent[]; failed: boolean; generationLimit?: number };
const storage = new AsyncLocalStorage<EvaluationCapture>();

/** CLI-only context. Routes never open this scope; no content goes to telemetry. */
export function withEvaluationCapture<T>(capture: EvaluationCapture, work: () => Promise<T>): Promise<T> {
  return storage.run(capture, work);
}

export function captureEvaluation(event: () => EvaluationEvent): void {
  const capture = storage.getStore();
  if (!capture) return;
  try { capture.events.push(structuredClone(event())); }
  catch { capture.failed = true; }
}

export function evaluationModelOptions(provider: string): Record<string, number> {
  const scope = storage.getStore();
  if (!scope?.generationLimit) return {};
  return provider === "ollama" ? { numPredict: scope.generationLimit, temperature: 0, maxRetries: 0 } : { maxTokens: scope.generationLimit, temperature: 0, maxRetries: 0, timeout: 60000 };
}
