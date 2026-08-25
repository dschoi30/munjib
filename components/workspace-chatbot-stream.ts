import type { AiCitation } from "@/components/ai/answer";

export type WorkspaceChatStreamMessage = {
  id?: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: AiCitation[] | null;
};

export type TrialAiAllowance = {
  remaining: 0 | 1 | 2 | 3;
  resetsAt: string;
};

const TRIAL_AI_ALLOWANCE_EVENT = "munjib:trial-ai-allowance";
let currentTrialAiAllowance: TrialAiAllowance | null = null;
let trialAiAllowanceSubscriberCount = 0;

export type WorkspaceChatStreamEvent =
  | { type: "start"; trialAi?: TrialAiAllowance }
  | { type: "token"; content: string }
  | {
      type: "done";
      thread?: unknown;
      userMessage?: WorkspaceChatStreamMessage;
      assistantMessage: WorkspaceChatStreamMessage;
      citations?: AiCitation[];
    }
  | { type: "error"; error: string };

export async function readWorkspaceChatStream(
  response: Response,
  onEvent: (event: WorkspaceChatStreamEvent) => void,
) {
  if (!response.body) {
    throw new Error("WORKSPACE_CHAT_STREAM_UNAVAILABLE");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let hasTerminalEvent = false;

  while (true) {
    const { done, value } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });

    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      hasTerminalEvent = emitWorkspaceChatStreamEvent(line, onEvent) || hasTerminalEvent;
    }

    if (done) {
      hasTerminalEvent = emitWorkspaceChatStreamEvent(buffered, onEvent) || hasTerminalEvent;
      if (!hasTerminalEvent) {
        throw new Error("WORKSPACE_CHAT_STREAM_INCOMPLETE");
      }
      return;
    }
  }
}

function emitWorkspaceChatStreamEvent(
  line: string,
  onEvent: (event: WorkspaceChatStreamEvent) => void,
) {
  if (!line.trim()) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error("WORKSPACE_CHAT_STREAM_EVENT_INVALID");
  }

  const event = parseWorkspaceChatStreamEvent(parsed);
  if (!event) {
    throw new Error("WORKSPACE_CHAT_STREAM_EVENT_INVALID");
  }
  onEvent(event);
  return event.type === "done" || event.type === "error";
}

function parseWorkspaceChatStreamEvent(value: unknown): WorkspaceChatStreamEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  if (value.type === "start") {
    const trialAi = value.trialAi === undefined ? undefined : parseTrialAiAllowance(value.trialAi);
    return value.trialAi !== undefined && !trialAi
      ? null
      : { type: "start", ...(trialAi ? { trialAi } : {}) };
  }

  if (value.type === "token") {
    return typeof value.content === "string"
      ? { type: "token", content: value.content }
      : null;
  }

  if (value.type === "done") {
    if (!isWorkspaceChatStreamMessage(value.assistantMessage)) return null;
    if (value.userMessage !== undefined && !isWorkspaceChatStreamMessage(value.userMessage)) {
      return null;
    }
    if (value.citations !== undefined && !Array.isArray(value.citations)) return null;

    return {
      type: "done",
      thread: value.thread,
      userMessage: value.userMessage,
      assistantMessage: value.assistantMessage,
      citations: value.citations,
    };
  }

  if (value.type === "error") {
    return typeof value.error === "string" ? { type: "error", error: value.error } : null;
  }

  return null;
}

export function parseTrialAiAllowance(value: unknown): TrialAiAllowance | null {
  if (!isRecord(value)) return null;
  if (
    value.remaining !== 0 &&
    value.remaining !== 1 &&
    value.remaining !== 2 &&
    value.remaining !== 3
  ) return null;
  if (typeof value.resetsAt !== "string" || !Number.isFinite(Date.parse(value.resetsAt))) {
    return null;
  }
  return { remaining: value.remaining, resetsAt: value.resetsAt };
}

export function trialAiAllowanceFromQuotaError(value: unknown): TrialAiAllowance | null {
  if (!isRecord(value) || typeof value.code !== "string") return null;
  if (
    value.code !== "TRIAL_AI_DAILY_LIMIT_REACHED" &&
    value.code !== "TRIAL_AI_NETWORK_LIMIT_REACHED" &&
    value.code !== "TRIAL_AI_GLOBAL_LIMIT_REACHED"
  ) return null;
  return parseTrialAiAllowance({ remaining: 0, resetsAt: value.resetsAt });
}

export function publishTrialAiAllowance(allowance: TrialAiAllowance) {
  currentTrialAiAllowance = allowance;
  window.dispatchEvent(
    new CustomEvent<TrialAiAllowance>(TRIAL_AI_ALLOWANCE_EVENT, { detail: allowance }),
  );
}

export function subscribeToTrialAiAllowance(listener: (allowance: TrialAiAllowance) => void) {
  const handleAllowance = (event: Event) => {
    const allowance = parseTrialAiAllowance((event as CustomEvent<unknown>).detail);
    if (allowance) {
      currentTrialAiAllowance = allowance;
      listener(allowance);
    }
  };
  trialAiAllowanceSubscriberCount += 1;
  window.addEventListener(TRIAL_AI_ALLOWANCE_EVENT, handleAllowance);
  if (currentTrialAiAllowance) listener(currentTrialAiAllowance);
  return () => {
    window.removeEventListener(TRIAL_AI_ALLOWANCE_EVENT, handleAllowance);
    trialAiAllowanceSubscriberCount = Math.max(0, trialAiAllowanceSubscriberCount - 1);
    if (trialAiAllowanceSubscriberCount === 0) currentTrialAiAllowance = null;
  };
}

function isWorkspaceChatStreamMessage(value: unknown): value is WorkspaceChatStreamMessage {
  if (!isRecord(value)) return false;
  if (value.role !== "USER" && value.role !== "ASSISTANT") return false;
  if (typeof value.content !== "string") return false;
  if (value.id !== undefined && typeof value.id !== "string") return false;
  if (value.citations !== undefined && value.citations !== null && !Array.isArray(value.citations)) {
    return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
