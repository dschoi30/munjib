import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptValue } from "@langchain/core/prompt_values";
import { RAG_ERROR_CODES } from "@/lib/rag/errors";

export { RAG_ERROR_CODES };

export type ChatPromptMessage = {
  role: "system" | "user";
  content: string;
};

export type AnswerChainInvocationConfig = {
  callbacks?: unknown[];
  metadata?: Record<string, unknown>;
  tags?: string[];
  [key: string]: unknown;
};

export type ChatModelLike = {
  invoke: (
    promptValue: unknown,
    config?: AnswerChainInvocationConfig,
  ) => Promise<unknown> | unknown;
  stream?: (
    promptValue: unknown,
    config?: AnswerChainInvocationConfig,
  ) => Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>;
};

export type InvokeAnswerChainInput = {
  systemPrompt: string;
  userPrompt: string;
  chatModel: ChatModelLike;
  config?: AnswerChainInvocationConfig;
  callbacks?: unknown[];
  metadata?: Record<string, unknown>;
  privacySafeLogging?: boolean;
};

export type StreamAnswerChainInput = InvokeAnswerChainInput & {
  onToken: (token: string) => Promise<void> | void;
  privacySafeLogging?: boolean;
};

export async function invokeAnswerChain(input: InvokeAnswerChainInput): Promise<string> {
  try {
    const promptValue = buildPromptValue(input);
    const result = await input.chatModel.invoke(promptValue, buildInvocationConfig(input));
    const answer = (
      await new StringOutputParser().invoke(
        result as Parameters<StringOutputParser["invoke"]>[0],
      )
    ).trim();
    if (!answer) {
      throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    }
    return answer;
  } catch (error) {
    if (input.privacySafeLogging) {
      console.error("RAG answer chain failed", {
        code: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
        surface: "invoke",
      });
    } else {
      console.error("RAG answer chain invocation failed:", error);
    }
    throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
  }
}

export async function streamAnswerChain(input: StreamAnswerChainInput): Promise<string> {
  try {
    if (!input.chatModel.stream) {
      throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    }

    const promptValue = buildPromptValue(input);
    const stream = await input.chatModel.stream(promptValue, buildInvocationConfig(input));
    const chunks: string[] = [];

    for await (const chunk of stream) {
      const token = extractStreamToken(chunk);
      if (!token) continue;
      chunks.push(token);
      await input.onToken(token);
    }

    const answer = chunks.join("").trim();
    if (!answer) {
      throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    }
    return answer;
  } catch (error) {
    if (input.privacySafeLogging) {
      console.error("RAG answer chain failed", {
        code: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
        surface: "stream",
      });
    } else {
      console.error("RAG answer chain streaming failed:", error);
    }
    throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
  }
}

function buildPromptValue(input: Pick<InvokeAnswerChainInput, "systemPrompt" | "userPrompt">) {
  return new ChatPromptValue([
    new SystemMessage(input.systemPrompt),
    new HumanMessage(input.userPrompt),
  ]);
}

function extractStreamToken(chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (!isRecord(chunk) || !("content" in chunk)) return "";

  const content = chunk.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!isRecord(part)) return "";
      return typeof part.text === "string" ? part.text : "";
    })
    .join("");
}

function buildInvocationConfig(input: InvokeAnswerChainInput): AnswerChainInvocationConfig {
  const config = { ...(input.config ?? {}) };
  if (input.callbacks) {
    config.callbacks = input.callbacks;
  }
  if (input.metadata) {
    config.metadata = input.metadata;
  }
  return config;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
