import { afterEach, describe, expect, it, vi } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { invokeAnswerChain, RAG_ERROR_CODES, type ChatModelLike } from "@/lib/rag/answer-chain";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RAG answer chain", () => {
  it("invokes the chat model with saved-context prompts and invocation config", async () => {
    const callbacks = [{ name: "langfuse-callback" }];
    const metadata = { operation: "rag.answer", chatModel: "gemma4:e4b" };
    const chatModel = fakeChatModel(new AIMessage("\n Saved answer with [1]. \n"));

    const answer = await invokeAnswerChain({
      systemPrompt: "Use only saved document context.",
      userPrompt: "Context: saved chunk\nQuestion: What is saved?",
      chatModel,
      callbacks,
      metadata,
      config: { tags: ["ask-ai"] },
    });

    expect(answer).toBe("Saved answer with [1].");
    expect(chatModel.invoke).toHaveBeenCalledWith(expect.anything(), {
      tags: ["ask-ai"],
      callbacks,
      metadata,
    });
    const promptValue = vi.mocked(chatModel.invoke).mock.calls[0]?.[0] as {
      toChatMessages(): unknown;
    };
    expect(promptValue?.toChatMessages()).toMatchObject([
      { content: "Use only saved document context." },
      { content: "Context: saved chunk\nQuestion: What is saved?" },
    ]);
  });

  it("passes saved context and questions with braces as literal message content", async () => {
    const chatModel = fakeChatModel(new AIMessage("Literal brace answer."));

    const answer = await invokeAnswerChain({
      systemPrompt: "Use JSON literally: {\"policy\":\"saved-only\"}",
      userPrompt: "Context: ```json\n{\"answer\":\"saved\"}\n```\nQuestion: What does {answer} mean?",
      chatModel,
    });

    expect(answer).toBe("Literal brace answer.");
    const promptValue = vi.mocked(chatModel.invoke).mock.calls[0]?.[0] as {
      toChatMessages(): unknown;
    };
    expect(promptValue?.toChatMessages()).toMatchObject([
      { content: "Use JSON literally: {\"policy\":\"saved-only\"}" },
      {
        content:
          "Context: ```json\n{\"answer\":\"saved\"}\n```\nQuestion: What does {answer} mean?",
      },
    ]);
  });

  it("maps chat model request failures to a recoverable RAG error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const providerError = new Error("provider unavailable");
    const chatModel = fakeChatModel(providerError);

    await expect(
      invokeAnswerChain({
        systemPrompt: "system",
        userPrompt: "user",
        chatModel,
      }),
    ).rejects.toThrow(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);

    expect(consoleError).toHaveBeenCalledWith(
      "RAG answer chain invocation failed:",
      providerError,
    );
  });

  it("maps empty model output to a recoverable RAG error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const chatModel = fakeChatModel(new AIMessage(" \n\t "));

    await expect(
      invokeAnswerChain({
        systemPrompt: "system",
        userPrompt: "user",
        chatModel,
      }),
    ).rejects.toThrow(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
  });
});

function fakeChatModel(output: unknown): ChatModelLike {
  return {
    invoke: vi.fn().mockImplementation(async () => {
      if (output instanceof Error) throw output;
      return output;
    }),
  };
}
