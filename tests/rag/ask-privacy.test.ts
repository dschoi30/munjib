import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerPreparedAskDocumentQuestion } from "@/lib/rag/ask";
import { invokeAnswerChain } from "@/lib/rag/answer-chain";
import { createLangfuseCallbackConfig } from "@/lib/rag/langfuse";

vi.mock("@/lib/rag/answer-chain", () => ({ invokeAnswerChain: vi.fn() }));
vi.mock("@/lib/rag/model-factory", () => ({ createChatModel: vi.fn(() => ({ invoke: vi.fn() })) }));
vi.mock("@/lib/rag/langfuse", () => ({ createLangfuseCallbackConfig: vi.fn() }));

describe("prepared Ask AI privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createLangfuseCallbackConfig).mockImplementation((input) => ({
      callbacks: input.captureMode === "metadata" ? [] : ["content-capturing-callback"],
      metadata: { captureMode: input.captureMode },
    }));
    vi.mocked(invokeAnswerChain).mockResolvedValue("private answer");
  });

  it("forces anonymous Trial Ask execution to metadata-only callbacks", async () => {
    await answerPreparedAskDocumentQuestion({
      workspaceId: "workspace-1",
      workspaceSlug: "public-demo",
      selectedDocumentId: "document-1",
      question: "private question",
      prompt: {
        system: "private context",
        user: "private question with private context",
        citations: [],
      },
      citations: [],
      effectiveModelConfig: {
        chat: { provider: "ollama", model: "gemma4:e4b" },
        langfuse: { enabled: true, captureMode: "full" },
      },
      contextPartial: false,
      privacyMode: "anonymous-trial",
    } as unknown as Parameters<typeof answerPreparedAskDocumentQuestion>[0]);

    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(expect.objectContaining({
      captureMode: "metadata",
    }));
    expect(invokeAnswerChain).toHaveBeenCalledWith(expect.objectContaining({
      callbacks: [],
      privacySafeLogging: true,
    }));
    expect(JSON.stringify(vi.mocked(createLangfuseCallbackConfig).mock.calls[0])).not.toContain(
      "private question",
    );
    expect(JSON.stringify(vi.mocked(createLangfuseCallbackConfig).mock.calls[0])).not.toContain(
      "private context",
    );
  });
});
