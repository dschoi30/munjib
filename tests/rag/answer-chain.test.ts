import { afterEach, describe, expect, it, vi } from "vitest";
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  invokeAnswerChain,
  RAG_ERROR_CODES,
  streamAnswerChain,
  type ChatModelLike,
} from "@/lib/rag/answer-chain";

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

  it("streams chat model chunks and returns the accumulated answer", async () => {
    const callbacks = [{ name: "langfuse-callback" }];
    const metadata = { operation: "rag.workspace_chat", chatModel: "gemma4:e4b" };
    const chatModel = fakeStreamingChatModel([
      new AIMessageChunk("Hello"),
      new AIMessageChunk(" workspace"),
      new AIMessageChunk(" [1]."),
    ]);
    const tokens: string[] = [];

    const answer = await streamAnswerChain({
      systemPrompt: "Use workspace context.",
      userPrompt: "Question: What changed?",
      chatModel,
      callbacks,
      metadata,
      config: { tags: ["workspace-chat"] },
      onToken: (token) => {
        tokens.push(token);
      },
    });

    expect(tokens).toEqual(["Hello", " workspace", " [1]."]);
    expect(answer).toBe("Hello workspace [1].");
    expect(chatModel.stream).toHaveBeenCalledWith(expect.anything(), {
      tags: ["workspace-chat"],
      callbacks,
      metadata,
    });
  });

  it("extracts streamed token text without invoking the output parser for each chunk", async () => {
    const parserInvoke = vi.spyOn(
      StringOutputParser.prototype,
      "invoke",
    );
    const chatModel = fakeStreamingChatModel([
      "Plain ",
      { content: "object " },
      new AIMessageChunk("chunk."),
    ]);
    const tokens: string[] = [];

    const answer = await streamAnswerChain({
      systemPrompt: "system",
      userPrompt: "user",
      chatModel,
      onToken: (token) => {
        tokens.push(token);
      },
    });

    expect(tokens).toEqual(["Plain ", "object ", "chunk."]);
    expect(answer).toBe("Plain object chunk.");
    expect(parserInvoke).not.toHaveBeenCalled();
  });

  it("maps streaming provider failures to a recoverable RAG error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const providerError = new Error("provider unavailable");
    const chatModel = fakeStreamingChatModel(providerError);

    await expect(
      streamAnswerChain({
        systemPrompt: "system",
        userPrompt: "user",
        chatModel,
        onToken: vi.fn(),
      }),
    ).rejects.toThrow(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);

    expect(consoleError).toHaveBeenCalledWith(
      "RAG answer chain streaming failed:",
      providerError,
    );
  });

  it("logs only stable metadata for privacy-safe streaming failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const secretPrompt = "SECRET_PROMPT customer merger plans";
    const secretResponse = "SECRET_PROVIDER_RESPONSE upstream payload";
    const chatModel = fakeStreamingChatModel(
      new Error(`${secretPrompt}; ${secretResponse}`),
    );

    await expect(
      streamAnswerChain({
        systemPrompt: secretPrompt,
        userPrompt: "SECRET_QUESTION",
        chatModel,
        privacySafeLogging: true,
        onToken: vi.fn(),
      }),
    ).rejects.toThrow(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("RAG answer chain failed", {
      code: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      surface: "stream",
    });
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain(secretPrompt);
    expect(logged).not.toContain(secretResponse);
    expect(logged).not.toContain("SECRET_QUESTION");
  });

  it("maps empty streamed output to a recoverable RAG error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const chatModel = fakeStreamingChatModel([
      new AIMessageChunk(" "),
      new AIMessageChunk("\n"),
    ]);

    await expect(
      streamAnswerChain({
        systemPrompt: "system",
        userPrompt: "user",
        chatModel,
        onToken: vi.fn(),
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

function fakeStreamingChatModel(output: unknown[] | Error): ChatModelLike {
  return {
    invoke: vi.fn(),
    stream: vi.fn().mockImplementation(async function* () {
      if (output instanceof Error) throw output;
      for (const chunk of output) {
        yield chunk;
      }
    }),
  };
}
