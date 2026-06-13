import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
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
};

export type InvokeAnswerChainInput = {
  systemPrompt: string;
  userPrompt: string;
  chatModel: ChatModelLike;
  config?: AnswerChainInvocationConfig;
  callbacks?: unknown[];
  metadata?: Record<string, unknown>;
};

export async function invokeAnswerChain(input: InvokeAnswerChainInput): Promise<string> {
  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", input.systemPrompt],
      ["human", input.userPrompt],
    ]);
    const promptValue = await prompt.invoke({});
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
    console.error("RAG answer chain invocation failed:", error);
    throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
  }
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
