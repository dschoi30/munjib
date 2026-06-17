import type { AiCitation } from "@/components/ai/answer";

export type WorkspaceChatStreamMessage = {
  id?: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: AiCitation[] | null;
};

export type WorkspaceChatStreamEvent =
  | { type: "start" }
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

  while (true) {
    const { done, value } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });

    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      emitWorkspaceChatStreamEvent(line, onEvent);
    }

    if (done) {
      emitWorkspaceChatStreamEvent(buffered, onEvent);
      return;
    }
  }
}

function emitWorkspaceChatStreamEvent(
  line: string,
  onEvent: (event: WorkspaceChatStreamEvent) => void,
) {
  if (!line.trim()) return;

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
}

function parseWorkspaceChatStreamEvent(value: unknown): WorkspaceChatStreamEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  if (value.type === "start") {
    return { type: "start" };
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
