import { describe, expect, it, vi } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { invokeAnswerChain, RAG_ERROR_CODES, type ChatModelLike } from "@/lib/rag/answer-chain";

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

  it("maps chat model request failures to a recoverable RAG error", async () => {
    const chatModel = fakeChatModel(new Error("provider unavailable"));

    await expect(
      invokeAnswerChain({
        systemPrompt: "system",
        userPrompt: "user",
        chatModel,
      }),
    ).rejects.toThrow(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
  });

  it("maps empty model output to a recoverable RAG error", async () => {
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
