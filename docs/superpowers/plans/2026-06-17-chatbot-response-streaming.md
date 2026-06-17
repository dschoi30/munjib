# Chatbot Response Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream Workspace AI assistant answer text over the existing message POST route while preserving validation, persistence, citations, and reset race behavior.

**Architecture:** Keep `POST /api/workspaces/[workspaceSlug]/assistant/messages` as the single send endpoint. Split Workspace AI service work into preparation, answer generation, and final persistence. Use LangChain `chatModel.stream()` in a new answer-chain helper, send NDJSON events from the route, and update `WorkspaceChatbot` to consume `ReadableStream` events into an assistant placeholder bubble.

**Tech Stack:** Next.js App Router route handlers, React 19 client component state, Prisma/PostgreSQL, LangChain chat models, Vitest, Testing Library, newline-delimited JSON over `fetch()`.

---

## File Structure

- Modify `lib/rag/answer-chain.ts`: add streaming chat model support and token extraction.
- Modify `tests/rag/answer-chain.test.ts`: cover streaming success, provider failure, and empty output.
- Modify `lib/rag/workspace-chat.ts`: extract preparation/finalization helpers, keep `sendWorkspaceChatMessage()`, add streaming service entrypoint.
- Modify `tests/rag/workspace-chat.test.ts`: cover streamed tokens and persistence after completion.
- Modify `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`: return NDJSON stream after successful validation and preparation.
- Modify `tests/rag/workspace-chat-route.test.ts`: cover stream response and existing JSON validation errors.
- Create `components/workspace-chatbot-stream.ts`: parse NDJSON events from `fetch()` responses.
- Modify `components/workspace-chatbot.tsx`: consume stream events, manage placeholder bubble, abort active request on reset/workspace change.
- Modify `tests/components/workspace-chatbot.test.tsx`: cover token rendering, done citations, stream error, and reset race.
- Modify `wiki/RAG Process Workflow.md`, `wiki/log.md`, and `wiki/manifest.json`: record the implemented Issue #105 behavior.

---

### Task 1: Add Streaming Answer Chain Seam

**Files:**
- Modify: `lib/rag/answer-chain.ts`
- Test: `tests/rag/answer-chain.test.ts`

- [ ] **Step 1: Write failing tests for streamed answer chunks**

Add these imports and tests to `tests/rag/answer-chain.test.ts`:

```ts
import { AIMessageChunk } from "@langchain/core/messages";
import {
  invokeAnswerChain,
  RAG_ERROR_CODES,
  streamAnswerChain,
  type ChatModelLike,
} from "@/lib/rag/answer-chain";
```

```ts
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
```

Add this helper below `fakeChatModel()`:

```ts
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
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm exec vitest run tests/rag/answer-chain.test.ts --reporter=dot
```

Expected: fail because `streamAnswerChain` is not exported and `ChatModelLike` does not include `stream`.

- [ ] **Step 3: Implement `streamAnswerChain()`**

Update `lib/rag/answer-chain.ts`:

```ts
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

export type StreamAnswerChainInput = InvokeAnswerChainInput & {
  onToken: (token: string) => Promise<void> | void;
};
```

Add this function after `invokeAnswerChain()`:

```ts
export async function streamAnswerChain(input: StreamAnswerChainInput): Promise<string> {
  try {
    if (!input.chatModel.stream) {
      throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    }

    const promptValue = buildPromptValue(input);
    const stream = await input.chatModel.stream(promptValue, buildInvocationConfig(input));
    const parser = new StringOutputParser();
    const chunks: string[] = [];

    for await (const chunk of stream) {
      const token = await parser.invoke(
        chunk as Parameters<StringOutputParser["invoke"]>[0],
      );
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
    console.error("RAG answer chain streaming failed:", error);
    throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
  }
}
```

Extract prompt construction so `invokeAnswerChain()` and `streamAnswerChain()` share it:

```ts
function buildPromptValue(input: Pick<InvokeAnswerChainInput, "systemPrompt" | "userPrompt">) {
  return new ChatPromptValue([
    new SystemMessage(input.systemPrompt),
    new HumanMessage(input.userPrompt),
  ]);
}
```

Then update `invokeAnswerChain()` to call `buildPromptValue(input)` instead of constructing `new ChatPromptValue(...)` inline.

- [ ] **Step 4: Run answer-chain tests to verify GREEN**

Run:

```bash
pnpm exec vitest run tests/rag/answer-chain.test.ts --reporter=dot
```

Expected: all `tests/rag/answer-chain.test.ts` tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/rag/answer-chain.ts tests/rag/answer-chain.test.ts
git commit -m "feat: add streaming answer chain"
```

---

### Task 2: Add Workspace Chat Streaming Service

**Files:**
- Modify: `lib/rag/workspace-chat.ts`
- Test: `tests/rag/workspace-chat.test.ts`

- [ ] **Step 1: Write failing service tests**

Update imports in `tests/rag/workspace-chat.test.ts`:

```ts
import {
  getOrCreateWorkspaceChatThread,
  prepareWorkspaceChatMessageStream,
  resetWorkspaceChatThread,
  sendPreparedWorkspaceChatMessageStream,
  sendWorkspaceChatMessage,
  WORKSPACE_CHAT_ERROR_CODES,
} from "@/lib/rag/workspace-chat";
```

Add a streaming fake before the new tests:

```ts
function mockStreamingAnswer(chunks: string[]) {
  vi.mocked(invokeAnswerChain).mockReset();
  vi.mocked(invokeAnswerChain).mockResolvedValue(chunks.join(""));
  chatModel.stream = vi.fn().mockImplementation(async function* () {
    for (const chunk of chunks) {
      yield { content: chunk };
    }
  });
}
```

Add this test near the existing successful send tests:

```ts
it("streams workspace answer tokens and persists the final normalized answer", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const document = await createSavedDocument({
    workspaceId: fixture.workspace.id,
    userId: fixture.user.id,
    title: "Handbook",
    contentMarkdown: "Workspace evidence.",
  });
  vi.mocked(searchSimilarChunks).mockResolvedValueOnce([
    {
      id: "chunk-1",
      documentId: document.id,
      documentTitle: document.title,
      documentPath: document.path,
      headingPath: "Policy",
      content: "Workspace evidence.",
      distance: 0.1,
    },
  ]);
  mockStreamingAnswer(["Workspace ", "answer ", "[1]."]);
  const tokens: string[] = [];

  const prepared = await prepareWorkspaceChatMessageStream({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    message: "What should I know?",
  });
  const result = await sendPreparedWorkspaceChatMessageStream(prepared, {
    onToken: (token) => tokens.push(token),
  });

  expect(tokens).toEqual(["Workspace ", "answer ", "[1]."]);
  expect(result.assistantMessage.content).toBe("Workspace answer [1].");
  expect(result.citations).toEqual([
    expect.objectContaining({
      index: 1,
      documentId: document.id,
      documentTitle: "Handbook",
    }),
  ]);
  await expect(
    prisma.aiChatMessage.findMany({
      where: { threadId: result.thread.id },
      orderBy: { createdAt: "asc" },
    }),
  ).resolves.toMatchObject([
    { role: "USER", content: "What should I know?" },
    { role: "ASSISTANT", content: "Workspace answer [1]." },
  ]);
});
```

Add this failure test:

```ts
it("does not persist messages when streaming answer generation fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  await createSavedDocument({
    workspaceId: fixture.workspace.id,
    userId: fixture.user.id,
    title: "Handbook",
    contentMarkdown: "Workspace evidence.",
  });
  chatModel.stream = vi.fn().mockImplementation(async function* () {
    yield { content: "Partial " };
    throw new Error("provider down");
  });
  const tokens: string[] = [];

  const prepared = await prepareWorkspaceChatMessageStream({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    message: "What should I know?",
  });

  await expect(
    sendPreparedWorkspaceChatMessageStream(prepared, {
      onToken: (token) => tokens.push(token),
    }),
  ).rejects.toThrow("RAG_CHAT_REQUEST_FAILED");

  expect(tokens).toEqual(["Partial "]);
  await expect(prisma.aiChatMessage.count()).resolves.toBe(0);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm exec vitest run tests/rag/workspace-chat.test.ts --reporter=dot
```

Expected: fail because the streaming service exports do not exist.

- [ ] **Step 3: Implement preparation and streaming service**

In `lib/rag/workspace-chat.ts`, update imports:

```ts
import {
  invokeAnswerChain,
  streamAnswerChain,
  type ChatModelLike,
} from "@/lib/rag/answer-chain";
```

Add types near existing input/result types:

```ts
export type WorkspaceChatPreparedMessage = {
  threadId: string;
  message: string;
  prompt: ReturnType<typeof buildRagPrompt>;
  promptChunkCount: number;
  citationChunkIds: string[];
  trace: ReturnType<typeof createLangfuseCallbackConfig>;
  chatModel: ChatModelLike;
  chatModelName: string;
};

export type WorkspaceChatStreamCallbacks = {
  onToken: (token: string) => Promise<void> | void;
};
```

Extract the current `sendWorkspaceChatMessage()` body from after `const message = input.message.trim()` through trace creation into a new exported preparation function:

```ts
export async function prepareWorkspaceChatMessageStream(
  input: SendWorkspaceChatMessageInput,
): Promise<WorkspaceChatPreparedMessage> {
  const message = input.message.trim();
  if (!message) throw new Error(WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED);

  const workspace = await loadWorkspaceForChat(input);
  const thread = await getOrCreateActiveThread({
    workspaceId: workspace.id,
    actorId: input.actorId,
  });

  const effectiveModelConfig = resolveWorkspaceChatModelConfig(input);
  assertCurrentEmbeddingIndex(effectiveModelConfig);

  const orderedThreadMessages = orderedMessagesForDisplay(thread.messages);
  const conversationContext = await buildWorkspaceConversationContext({
    thread,
    messages: orderedThreadMessages,
    currentMessage: message,
    modelConfig: effectiveModelConfig,
  });
  const conversationQuestion = conversationContext.question;
  const readableDocumentIds = workspace.readableDocuments.map((document) => document.id);
  const selectedDocumentId = readableDocumentIds.includes(input.selectedDocumentId ?? "")
    ? (input.selectedDocumentId ?? undefined)
    : undefined;

  await ensureWorkspaceChatRetrievalIndex({
    workspaceId: workspace.id,
    readableDocuments: workspace.readableDocuments,
    query: conversationQuestion,
    embeddingModel: effectiveModelConfig.embedding.indexId,
    selectedDocumentId,
  });

  const embedding = await embedText(conversationQuestion, { config: effectiveModelConfig });
  const globalChunks = await searchSimilarChunks({
    workspaceId: workspace.id,
    embeddingModel: effectiveModelConfig.embedding.indexId,
    embedding,
    readableDocumentIds,
    limit: RETRIEVAL_LIMIT,
  });
  const selectedDocumentChunks = selectedDocumentId
    ? await searchSimilarChunks({
        workspaceId: workspace.id,
        embeddingModel: effectiveModelConfig.embedding.indexId,
        embedding,
        readableDocumentIds: [selectedDocumentId],
        limit: PROMPT_CHUNK_LIMIT,
      })
    : [];
  const chunks = mergeRetrievedChunks(globalChunks, selectedDocumentChunks);
  const promptChunks = capPromptChunks(prioritizeSelectedDocumentChunks(chunks, selectedDocumentId));
  const prompt = buildRagPrompt({
    question: conversationQuestion,
    chunks: promptChunks,
  });
  const citationChunkIds = promptChunks.map((chunk) => chunk.id);
  const trace = createLangfuseCallbackConfig({
    enabled: effectiveModelConfig.langfuse.enabled,
    captureMode: effectiveModelConfig.langfuse.captureMode,
    operation: "rag.workspace_chat",
    chatProvider: effectiveModelConfig.chat.provider,
    chatModel: effectiveModelConfig.chat.model,
    embeddingProvider: effectiveModelConfig.embedding.provider,
    embeddingModel: effectiveModelConfig.embedding.indexId,
    embeddingDimensions: effectiveModelConfig.embedding.dimensions,
    retrievedChunkCount: promptChunks.length,
    citationDocumentIds: prompt.citations.map((citation) => citation.documentId),
    citationChunkIds,
    metadata: {
      workspaceSlug: input.workspaceSlug,
      workspaceId: workspace.id,
      threadId: thread.id,
      actorId: input.actorId,
      ...(selectedDocumentId ? { selectedDocumentId } : {}),
    },
  });

  return {
    threadId: thread.id,
    message,
    prompt,
    promptChunkCount: promptChunks.length,
    citationChunkIds,
    trace,
    chatModel: createChatModel(effectiveModelConfig.chat) as ChatModelLike,
    chatModelName: effectiveModelConfig.chat.model,
  };
}
```

Extract provider/model validation into a helper used by preparation:

```ts
function resolveWorkspaceChatModelConfig(input: SendWorkspaceChatMessageInput): RagModelConfig {
  if (input.chatProviderOverride && !input.chatModelOverride) {
    throw new Error(INVALID_CHAT_MODEL_ERROR);
  }
  const defaultModelConfig = input.chatProviderOverride ? null : getRagModelConfig();
  const chatProvider = input.chatProviderOverride ?? defaultModelConfig?.chat.provider;
  if (!chatProvider) {
    throw new Error(INVALID_CHAT_MODEL_ERROR);
  }
  if (
    input.chatModelOverride &&
    !isChatModelCompatibleWithProvider({
      chatProvider,
      chatModel: input.chatModelOverride,
    })
  ) {
    throw new Error(INVALID_CHAT_MODEL_ERROR);
  }
  if (input.chatProviderOverride || input.chatModelOverride) {
    return getRagModelConfig(process.env, {
      provider: input.chatProviderOverride,
      model: input.chatModelOverride,
    });
  }
  return defaultModelConfig ?? getRagModelConfig();
}
```

Add finalization helpers:

```ts
export async function sendPreparedWorkspaceChatMessageStream(
  prepared: WorkspaceChatPreparedMessage,
  callbacks: WorkspaceChatStreamCallbacks,
) {
  const answer = await streamAnswerChain({
    systemPrompt: prepared.prompt.system,
    userPrompt: prepared.prompt.user,
    chatModel: prepared.chatModel,
    callbacks: prepared.trace.callbacks,
    metadata: prepared.trace.metadata,
    onToken: callbacks.onToken,
  });
  return persistWorkspaceChatAnswer(prepared, answer);
}

async function persistWorkspaceChatAnswer(
  prepared: WorkspaceChatPreparedMessage,
  answer: string,
) {
  const normalizedAnswer = normalizeAnswerCitations(answer, prepared.prompt.citations);
  const answerCitations = normalizedAnswer.citations;
  const contextMeta = {
    retrievedChunkCount: prepared.promptChunkCount,
    citationChunkIds: prepared.citationChunkIds,
  };
  const { userMessage, assistantMessage, updatedThread } = await prisma.$transaction(async (tx) => {
    const activeThread = await tx.aiChatThread.updateMany({
      where: { id: prepared.threadId, status: "ACTIVE" },
      data: { lastMessageAt: new Date() },
    });
    if (activeThread.count === 0) {
      throw new Error(WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED);
    }

    const persistedUserMessage = await tx.aiChatMessage.create({
      data: {
        threadId: prepared.threadId,
        role: "USER",
        content: prepared.message,
      },
    });
    const persistedAssistantMessage = await tx.aiChatMessage.create({
      data: {
        threadId: prepared.threadId,
        role: "ASSISTANT",
        content: normalizedAnswer.answer,
        citations: answerCitations as Prisma.InputJsonValue,
        contextMeta,
        model: prepared.chatModelName,
      },
    });
    const persistedThread = await tx.aiChatThread.update({
      where: { id: prepared.threadId },
      data: { lastMessageAt: persistedAssistantMessage.createdAt },
      include: {
        messages: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: THREAD_MESSAGE_LIMIT,
        },
      },
    });

    return {
      userMessage: persistedUserMessage,
      assistantMessage: persistedAssistantMessage,
      updatedThread: persistedThread,
    };
  });

  return {
    thread: withDisplayOrderedMessages(updatedThread),
    userMessage,
    assistantMessage,
    citations: answerCitations,
  };
}
```

Simplify `sendWorkspaceChatMessage()` to reuse preparation and finalization:

```ts
export async function sendWorkspaceChatMessage(input: SendWorkspaceChatMessageInput) {
  const prepared = await prepareWorkspaceChatMessageStream(input);
  const answer = await invokeAnswerChain({
    systemPrompt: prepared.prompt.system,
    userPrompt: prepared.prompt.user,
    chatModel: prepared.chatModel,
    callbacks: prepared.trace.callbacks,
    metadata: prepared.trace.metadata,
  });
  return persistWorkspaceChatAnswer(prepared, answer);
}
```

- [ ] **Step 4: Run workspace chat tests to verify GREEN**

Run:

```bash
pnpm exec vitest run tests/rag/workspace-chat.test.ts --reporter=dot
```

Expected: all workspace chat tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/rag/workspace-chat.ts tests/rag/workspace-chat.test.ts
git commit -m "feat: stream workspace chat service answers"
```

---

### Task 3: Stream NDJSON From Message Route

**Files:**
- Modify: `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`
- Test: `tests/rag/workspace-chat-route.test.ts`

- [ ] **Step 1: Write failing route tests**

Update the workspace-chat mock in `tests/rag/workspace-chat-route.test.ts`:

```ts
import {
  getOrCreateWorkspaceChatThread,
  prepareWorkspaceChatMessageStream,
  resetWorkspaceChatThread,
  sendPreparedWorkspaceChatMessageStream,
  sendWorkspaceChatMessage,
  WORKSPACE_CHAT_ERROR_CODES,
} from "@/lib/rag/workspace-chat";
```

```ts
vi.mock("@/lib/rag/workspace-chat", () => ({
  WORKSPACE_CHAT_ERROR_CODES: {
    MESSAGE_REQUIRED: "MESSAGE_REQUIRED",
    THREAD_ARCHIVED: "THREAD_ARCHIVED",
  },
  getOrCreateWorkspaceChatThread: vi.fn(),
  prepareWorkspaceChatMessageStream: vi.fn(),
  resetWorkspaceChatThread: vi.fn(),
  sendPreparedWorkspaceChatMessageStream: vi.fn(),
  sendWorkspaceChatMessage: vi.fn(),
}));
```

In `beforeEach()`, add:

```ts
vi.mocked(prepareWorkspaceChatMessageStream).mockResolvedValue({
  threadId: "thread-1",
  message: "What changed?",
  prompt: { system: "system", user: "user", citations },
  promptChunkCount: 1,
  citationChunkIds: ["chunk-1"],
  trace: { callbacks: [], metadata: {} },
  chatModel: { invoke: vi.fn(), stream: vi.fn() },
  chatModelName: "gemma4:e4b",
});
vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementation(
  async (_prepared, callbacks) => {
    await callbacks.onToken("The workspace ");
    await callbacks.onToken("changed [1].");
    return {
      thread,
      userMessage,
      assistantMessage,
      citations,
    };
  },
);
```

Replace the existing successful send route test with:

```ts
it("streams a workspace chat message with selected document pass-through", async () => {
  const response = await POST_MESSAGE(
    jsonRequest({
      message: "  What changed?  ",
      selectedDocumentId: "doc-1",
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    }),
    routeContext(),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/x-ndjson");
  expect(await readNdjson(response)).toEqual([
    { type: "start" },
    { type: "token", content: "The workspace " },
    { type: "token", content: "changed [1]." },
    {
      type: "done",
      thread: jsonThread(),
      userMessage: jsonMessage(userMessage),
      assistantMessage: jsonMessage(assistantMessage),
      citations,
    },
  ]);
  expect(prepareWorkspaceChatMessageStream).toHaveBeenCalledWith({
    workspaceSlug: "company-handbook",
    actorId: "user-1",
    message: "What changed?",
    selectedDocumentId: "doc-1",
    chatProviderOverride: "openai-compatible",
    chatModelOverride: "google/gemma-4-31b-it:free",
  });
});
```

Add route streaming failure test:

```ts
it("returns a stream error event when answer streaming fails after start", async () => {
  vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementationOnce(
    async (_prepared, callbacks) => {
      await callbacks.onToken("Partial ");
      throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    },
  );

  const response = await POST_MESSAGE(jsonRequest({ message: "What changed?" }), routeContext());

  expect(response.status).toBe(200);
  expect(await readNdjson(response)).toEqual([
    { type: "start" },
    { type: "token", content: "Partial " },
    { type: "error", error: "AI_UNAVAILABLE" },
  ]);
});
```

Add helper at the bottom of the test file:

```ts
async function readNdjson(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}
```

- [ ] **Step 2: Run route tests to verify RED**

Run:

```bash
pnpm exec vitest run tests/rag/workspace-chat-route.test.ts --reporter=dot
```

Expected: fail because the route still returns JSON and does not call streaming service functions.

- [ ] **Step 3: Implement NDJSON route response**

Update imports in `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`:

```ts
import { RAG_ERROR_CODES } from "@/lib/rag/errors";
import {
  prepareWorkspaceChatMessageStream,
  sendPreparedWorkspaceChatMessageStream,
  WORKSPACE_CHAT_ERROR_CODES,
} from "@/lib/rag/workspace-chat";
```

Replace the `try` body that calls `sendWorkspaceChatMessage()` with:

```ts
  try {
    const prepared = await prepareWorkspaceChatMessageStream({
      workspaceSlug,
      actorId: user.id,
      message,
      ...(selectedDocumentId !== undefined ? { selectedDocumentId } : {}),
      ...(chatProviderValidation?.ok
        ? { chatProviderOverride: chatProviderValidation.value }
        : {}),
      ...(chatModelValidation?.ok ? { chatModelOverride: chatModelValidation.value } : {}),
    });

    return workspaceChatStreamResponse(prepared);
  } catch (error) {
    return workspaceChatErrorResponse(error);
  }
```

Add helpers below `POST()`:

```ts
function workspaceChatStreamResponse(
  prepared: Awaited<ReturnType<typeof prepareWorkspaceChatMessageStream>>,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      write({ type: "start" });
      try {
        const result = await sendPreparedWorkspaceChatMessageStream(prepared, {
          onToken: (content) => write({ type: "token", content }),
        });
        write({
          type: "done",
          thread: result.thread,
          userMessage: result.userMessage,
          assistantMessage: result.assistantMessage,
          citations: result.citations,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        write({
          type: "error",
          error: message === WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED
            ? WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED
            : "AI_UNAVAILABLE",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
```

Remove the now-unused `sendWorkspaceChatMessage` import. Keep validation failures unchanged.

- [ ] **Step 4: Run route tests to verify GREEN**

Run:

```bash
pnpm exec vitest run tests/rag/workspace-chat-route.test.ts --reporter=dot
```

Expected: route tests pass.

- [ ] **Step 5: Commit**

```bash
git add 'app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts' tests/rag/workspace-chat-route.test.ts
git commit -m "feat: stream workspace chat route events"
```

---

### Task 4: Add Client NDJSON Stream Reader And UI Integration

**Files:**
- Create: `components/workspace-chatbot-stream.ts`
- Modify: `components/workspace-chatbot.tsx`
- Test: `tests/components/workspace-chatbot.test.tsx`

- [ ] **Step 1: Write failing component tests**

Add these helpers to `tests/components/workspace-chatbot.test.tsx`:

```ts
function ndjsonResponse(events: unknown[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/x-ndjson; charset=utf-8" },
    },
  );
}

function deferredNdjsonResponse() {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controllerRef = controller;
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/x-ndjson; charset=utf-8" },
    },
  );

  return {
    response,
    write(event: unknown) {
      controllerRef?.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
    },
    close() {
      controllerRef?.close();
    },
  };
}
```

Update default `/assistant/messages` mock to return NDJSON:

```ts
if (url.endsWith("/assistant/messages")) {
  return ndjsonResponse([
    { type: "start" },
    { type: "token", content: "Workspace " },
    { type: "token", content: "answer." },
    {
      type: "done",
      assistantMessage: {
        id: "message-3",
        role: "ASSISTANT",
        content: "Workspace answer.",
      },
      citations: [
        {
          index: 1,
          documentTitle: "Handbook",
          documentPath: "/handbook",
          headingPath: "Policy",
        },
      ],
    },
  ]);
}
```

Add a streaming-specific test:

```ts
it("renders streamed assistant tokens before the done event adds citations", async () => {
  const stream = deferredNdjsonResponse();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/assistant/thread")) {
      return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
    }
    if (url.endsWith("/assistant/messages")) {
      return stream.response;
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

  fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
  await screen.findByText("Ask across this workspace.");
  fireEvent.change(screen.getByLabelText("Workspace chat message"), {
    target: { value: "Stream this" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));

  await act(async () => {
    stream.write({ type: "start" });
    stream.write({ type: "token", content: "Streaming " });
  });
  expect(screen.getByText("Streaming")).toBeTruthy();
  expect(screen.queryByText("Thinking...")).toBeNull();

  await act(async () => {
    stream.write({ type: "token", content: "answer [1]." });
    stream.write({
      type: "done",
      assistantMessage: {
        id: "assistant-streamed",
        role: "ASSISTANT",
        content: "Streaming answer [1].",
      },
      citations: [
        {
          index: 1,
          documentId: "doc-1",
          documentTitle: "Handbook",
          documentPath: "/handbook",
          headingPath: "Policy",
        },
      ],
    });
    stream.close();
  });

  expect(await screen.findByText("Streaming answer")).toBeTruthy();
  expect(screen.getByRole("link", { name: "[1] Handbook > Policy" })).toBeTruthy();
});
```

Add an error test:

```ts
it("removes partial assistant content when the stream reports an error", async () => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/assistant/thread")) {
      return jsonResponse({ thread: { id: "thread-1" }, messages: [] });
    }
    if (url.endsWith("/assistant/messages")) {
      return ndjsonResponse([
        { type: "start" },
        { type: "token", content: "Partial answer" },
        { type: "error", error: "AI_UNAVAILABLE" },
      ]);
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

  fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
  await screen.findByText("Ask across this workspace.");
  fireEvent.change(screen.getByLabelText("Workspace chat message"), {
    target: { value: "Fail while streaming" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));

  expect(await screen.findByText("Workspace AI is unavailable.")).toBeTruthy();
  expect(screen.queryByText("Partial answer")).toBeNull();
  expect(screen.queryByText("Fail while streaming")).toBeNull();
});
```

- [ ] **Step 2: Run component tests to verify RED**

Run:

```bash
pnpm exec vitest run tests/components/workspace-chatbot.test.tsx --reporter=dot
```

Expected: fail because the client still calls `response.json()` and cannot parse NDJSON.

- [ ] **Step 3: Create stream parser**

Create `components/workspace-chatbot-stream.ts`:

```ts
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
      assistantMessage?: WorkspaceChatStreamMessage;
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
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseWorkspaceChatStreamLine(line);
      if (event) onEvent(event);
    }
  }

  buffer += decoder.decode();
  const event = parseWorkspaceChatStreamLine(buffer);
  if (event) onEvent(event);
}

function parseWorkspaceChatStreamLine(line: string): WorkspaceChatStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const value = JSON.parse(trimmed) as Partial<WorkspaceChatStreamEvent>;
  if (value.type === "start") return { type: "start" };
  if (value.type === "token" && typeof value.content === "string") {
    return { type: "token", content: value.content };
  }
  if (value.type === "done") {
    return {
      type: "done",
      assistantMessage: "assistantMessage" in value ? value.assistantMessage : undefined,
      citations: "citations" in value ? value.citations : undefined,
    } as WorkspaceChatStreamEvent;
  }
  if (value.type === "error" && typeof value.error === "string") {
    return { type: "error", error: value.error };
  }
  throw new Error("WORKSPACE_CHAT_STREAM_EVENT_INVALID");
}
```

- [ ] **Step 4: Integrate streaming into `WorkspaceChatbot`**

Update imports:

```ts
import {
  readWorkspaceChatStream,
  type WorkspaceChatStreamEvent,
} from "@/components/workspace-chatbot-stream";
```

Add a ref near existing refs:

```ts
const activeSendAbortRef = useRef<AbortController | null>(null);
```

Abort active sends in the workspace-change effect:

```ts
activeSendAbortRef.current?.abort();
activeSendAbortRef.current = null;
```

Replace the `handleSubmit()` fetch/JSON body handling with:

```ts
    const abortController = new AbortController();
    activeSendAbortRef.current?.abort();
    activeSendAbortRef.current = abortController;
    const placeholderId = `streaming-${sendGeneration}-${Date.now()}`;

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/assistant/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          message: trimmedMessage,
          ...(selectedDocumentId ? { selectedDocumentId } : {}),
          ...(chatModelOverride
            ? {
                chatProvider: chatModelOverride.chatProvider,
                chatModel: chatModelOverride.chatModel,
              }
            : {}),
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as SendMessageResponse;
        throw new Error(body.error || "WORKSPACE_CHAT_FAILED");
      }
      if (sendGeneration !== requestGenerationRef.current) {
        return;
      }

      let hasAssistantPlaceholder = false;
      await readWorkspaceChatStream(response, (event) => {
        if (sendGeneration !== requestGenerationRef.current) return;
        handleStreamEvent(event);
      });

      function handleStreamEvent(event: WorkspaceChatStreamEvent) {
        if (event.type === "start") return;
        if (event.type === "token") {
          if (!hasAssistantPlaceholder) {
            hasAssistantPlaceholder = true;
            setMessages((current) => [
              ...current,
              { id: placeholderId, role: "ASSISTANT", content: event.content, citations: [] },
            ]);
          } else {
            setMessages((current) =>
              current.map((message) =>
                message.id === placeholderId
                  ? { ...message, content: `${message.content}${event.content}` }
                  : message,
              ),
            );
          }
          return;
        }
        if (event.type === "done") {
          const assistantMessage = event.assistantMessage;
          messageVersionRef.current += 1;
          setMessages((current) => {
            const finalized = {
              id: assistantMessage?.id,
              role: "ASSISTANT" as const,
              content: assistantMessage?.content ?? "",
              citations: event.citations ?? assistantMessage?.citations ?? [],
            };
            return hasAssistantPlaceholder
              ? current.map((message) => (message.id === placeholderId ? finalized : message))
              : [...current, finalized];
          });
          return;
        }
        if (event.type === "error") {
          throw new Error(event.error);
        }
      }
    } catch (sendError) {
      if (
        sendGeneration === requestGenerationRef.current &&
        !(sendError instanceof DOMException && sendError.name === "AbortError")
      ) {
        setMessages((current) =>
          current.filter(
            (message) => message !== userMessage && message.id !== placeholderId,
          ),
        );
        setError("Workspace AI is unavailable.");
      }
    } finally {
      if (activeSendAbortRef.current === abortController) {
        activeSendAbortRef.current = null;
      }
      if (sendGeneration === requestGenerationRef.current) {
        setIsLoading(false);
      }
    }
```

In `handleReset()`, abort any active send before calling reset:

```ts
activeSendAbortRef.current?.abort();
activeSendAbortRef.current = null;
```

- [ ] **Step 5: Run component tests to verify GREEN**

Run:

```bash
pnpm exec vitest run tests/components/workspace-chatbot.test.tsx --reporter=dot
```

Expected: component tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/workspace-chatbot.tsx components/workspace-chatbot-stream.ts tests/components/workspace-chatbot.test.tsx
git commit -m "feat: render streamed workspace chat responses"
```

---

### Task 5: Update Wiki And Run Full Verification

**Files:**
- Modify: `wiki/RAG Process Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update wiki content**

In `wiki/RAG Process Workflow.md`, update the Issue #105 paragraph to current tense:

```md
Issue #105 streams Workspace AI answer bodies over newline-delimited JSON on the existing `/assistant/messages` POST route. Validation and retrieval/preparation failures still return existing JSON errors before the stream is created. Once answer generation begins, the route emits `start`, `token`, `done`, or `error` events; `done` carries the persisted assistant message and answer-referenced citations. Ask AI remains non-streaming in this slice.
```

Add this `wiki/log.md` entry:

```md
## 2026-06-17T23:45:00+0900 - issue-105 chatbot response streaming implementation

- Result: Workspace AI now streams assistant answer text while keeping the existing send request shape and final persisted message/citation contract.
- Coverage: The message route returns NDJSON events for successful answer generation, validation/preparation errors remain JSON responses, the client renders streamed tokens into an assistant placeholder, and reset/workspace-change guards abort or ignore stale streams.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #105, `lib/rag/answer-chain.ts`, `lib/rag/workspace-chat.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `components/workspace-chatbot.tsx`, `components/workspace-chatbot-stream.ts`, streaming tests.
- Verification: `pnpm exec vitest run tests/rag/answer-chain.test.ts tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.
```

- [ ] **Step 2: Regenerate manifest and run wiki checks**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-plan --staged
```

Expected: manifest writes successfully; wiki lint may keep the existing `wiki/designs/sidebar.md` unresolved image warning; sync plan should show source and wiki maintenance files.

- [ ] **Step 3: Run full targeted verification**

Run:

```bash
pnpm exec vitest run tests/rag/answer-chain.test.ts tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx --reporter=dot
pnpm exec vitest run tests/rag/client-model-settings.test.ts tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx tests/rag/ask-route.test.ts tests/rag/ask.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
git diff --check
```

Expected: all tests pass, TypeScript exits 0, and `git diff --check` prints no output.

- [ ] **Step 4: Stage and run commit-time wiki gate**

Run:

```bash
git add lib/rag/answer-chain.ts lib/rag/workspace-chat.ts 'app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts' components/workspace-chatbot.tsx components/workspace-chatbot-stream.ts tests/rag/answer-chain.test.ts tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx 'wiki/RAG Process Workflow.md' wiki/log.md wiki/manifest.json
pnpm wiki:install-hooks
pnpm wiki:sync-check --staged
git diff --staged --check
```

Expected: sync-check passes and staged diff has no whitespace errors.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: stream workspace chat responses"
```

---

### Task 6: Push, PR, Review, And Issue Closure

**Files:**
- No code files.

- [ ] **Step 1: Push branch**

Run:

```bash
git push -u origin codex/issue-105-chatbot-response-streaming
```

Expected: branch pushes to GitHub.

- [ ] **Step 2: Open pull request**

Run:

```bash
gh pr create --title "Stream workspace chat responses" --body "$(cat <<'EOF'
## Summary
- stream Workspace AI assistant answer tokens over the existing message POST route
- preserve validation JSON errors, final message persistence, and citation normalization
- render streamed tokens in the chatbot panel with reset/workspace-change guards

## Test Plan
- [ ] pnpm exec vitest run tests/rag/answer-chain.test.ts tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx --reporter=dot
- [ ] pnpm exec vitest run tests/rag/client-model-settings.test.ts tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx tests/rag/ask-route.test.ts tests/rag/ask.test.ts --reporter=dot
- [ ] pnpm exec tsc --noEmit --pretty false
- [ ] pnpm wiki:lint
- [ ] pnpm wiki:sync-check --staged
EOF
)"
```

Expected: PR URL is returned.

- [ ] **Step 3: Wait and inspect PR checks/reviews**

Run:

```bash
sleep 300
gh pr checks --watch
gh pr view --json number,url,state,isDraft,reviewDecision,latestReviews,comments
PR_NUMBER=$(gh pr view --json number -q .number)
python3 /Users/developer/.codex/plugins/cache/openai-curated-remote/github/0.1.2/skills/gh-address-comments/scripts/fetch_comments.py --pr "$PR_NUMBER" --repo dschoi30/munjib
```

Expected: CI passes or any failing check/review feedback is identified.

- [ ] **Step 4: Address PR feedback if present**

If review or CI finds actionable feedback, apply the receiving-code-review workflow:

```bash
pnpm exec vitest run tests/rag/answer-chain.test.ts tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx --reporter=dot
pnpm exec tsc --noEmit --pretty false
git add lib/rag/answer-chain.ts lib/rag/workspace-chat.ts 'app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts' components/workspace-chatbot.tsx components/workspace-chatbot-stream.ts tests/rag/answer-chain.test.ts tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx 'wiki/RAG Process Workflow.md' wiki/log.md wiki/manifest.json
git commit -m "fix: address workspace chat streaming review"
git push
```

Expected: updated branch passes local verification before re-checking PR.

- [ ] **Step 5: Close Issue #105 after merge**

After PR merge:

```bash
PR_NUMBER=$(gh pr view --json number -q .number)
gh issue close 105 --comment "Implemented and merged via PR #$PR_NUMBER."
```

Expected: Issue #105 is closed only after the implementation PR is merged.
