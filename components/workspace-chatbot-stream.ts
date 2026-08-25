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
let trialAiAllowanceExpiryTimer: ReturnType<typeof setTimeout> | null = null;

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
  const merged = mergeTrialAiAllowance(currentTrialAiAllowance, allowance, Date.now());
  if (!merged) return;
  currentTrialAiAllowance = merged;
  scheduleTrialAiAllowanceExpiry();
  window.dispatchEvent(
    new CustomEvent<TrialAiAllowance>(TRIAL_AI_ALLOWANCE_EVENT, { detail: merged }),
  );
}

export function subscribeToTrialAiAllowance(
  listener: (allowance: TrialAiAllowance | null) => void,
) {
  const handleAllowance = (event: Event) => {
    if ((event as CustomEvent<unknown>).detail === null) {
      listener(null);
      return;
    }
    const allowance = parseTrialAiAllowance((event as CustomEvent<unknown>).detail);
    if (allowance) {
      const merged = mergeTrialAiAllowance(currentTrialAiAllowance, allowance, Date.now());
      if (!merged) return;
      currentTrialAiAllowance = merged;
      scheduleTrialAiAllowanceExpiry();
      listener(merged);
    }
  };
  trialAiAllowanceSubscriberCount += 1;
  window.addEventListener(TRIAL_AI_ALLOWANCE_EVENT, handleAllowance);
  clearExpiredTrialAiAllowance();
  if (currentTrialAiAllowance) {
    listener(currentTrialAiAllowance);
    scheduleTrialAiAllowanceExpiry();
  }
  return () => {
    window.removeEventListener(TRIAL_AI_ALLOWANCE_EVENT, handleAllowance);
    trialAiAllowanceSubscriberCount = Math.max(0, trialAiAllowanceSubscriberCount - 1);
    if (trialAiAllowanceSubscriberCount === 0) {
      currentTrialAiAllowance = null;
      if (trialAiAllowanceExpiryTimer) clearTimeout(trialAiAllowanceExpiryTimer);
      trialAiAllowanceExpiryTimer = null;
    }
  };
}

function mergeTrialAiAllowance(
  current: TrialAiAllowance | null,
  candidate: TrialAiAllowance,
  now: number,
): TrialAiAllowance | null {
  const candidateReset = Date.parse(candidate.resetsAt);
  if (candidateReset <= now) return null;
  if (!current) return candidate;
  const currentReset = Date.parse(current.resetsAt);
  if (candidateReset < currentReset) return current;
  if (candidateReset > currentReset) return candidate;
  return candidate.remaining < current.remaining ? candidate : current;
}

function scheduleTrialAiAllowanceExpiry() {
  if (trialAiAllowanceExpiryTimer) clearTimeout(trialAiAllowanceExpiryTimer);
  trialAiAllowanceExpiryTimer = null;
  if (!currentTrialAiAllowance || trialAiAllowanceSubscriberCount === 0) return;
  const delay = Date.parse(currentTrialAiAllowance.resetsAt) - Date.now();
  if (delay <= 0) {
    clearExpiredTrialAiAllowance();
    return;
  }
  trialAiAllowanceExpiryTimer = setTimeout(
    () => {
      trialAiAllowanceExpiryTimer = null;
      if (!clearExpiredTrialAiAllowance()) scheduleTrialAiAllowanceExpiry();
    },
    Math.min(delay, 2_147_483_647),
  );
}

function clearExpiredTrialAiAllowance() {
  if (!currentTrialAiAllowance) return false;
  if (Date.parse(currentTrialAiAllowance.resetsAt) > Date.now()) return false;
  currentTrialAiAllowance = null;
  window.dispatchEvent(new CustomEvent<null>(TRIAL_AI_ALLOWANCE_EVENT, { detail: null }));
  return true;
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
