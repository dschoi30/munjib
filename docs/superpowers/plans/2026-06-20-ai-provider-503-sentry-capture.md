# AI Provider 503 Sentry Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture handled Ask AI and workspace chat `AI_UNAVAILABLE` failures in Sentry without changing public API responses or sending prompt/document/provider secrets.

**Architecture:** Add one server-side observability helper that wraps Sentry capture with sanitized tags and context. Wire it into the existing document Ask route, workspace chat pre-stream error response, and workspace chat post-start NDJSON stream error branch. Keep all RAG/provider error normalization unchanged.

**Tech Stack:** Next.js App Router route handlers, Vitest, `@sentry/nextjs`, existing `lib/rag/errors.ts` RAG error codes, existing wiki maintenance tooling.

---

## File Structure

- Create `lib/observability/ai-unavailable.ts`: focused helper that safely captures handled AI unavailable errors in Sentry.
- Create `tests/observability/ai-unavailable.test.ts`: helper-level tests for sanitized context and fail-open behavior.
- Modify `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`: capture handled document Ask AI RAG runtime failures before returning `503`.
- Modify `tests/rag/ask-route.test.ts`: route-level regression tests for capture on RAG runtime failures and no capture on validation failures.
- Modify `app/api/workspaces/[workspaceSlug]/assistant/error-response.ts`: accept optional context and capture pre-stream workspace chat RAG runtime failures.
- Modify `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`: pass pre-stream context and capture post-start stream `AI_UNAVAILABLE` failures.
- Modify `tests/rag/workspace-chat-route.test.ts`: route-level regression tests for pre-stream capture, post-start capture, and no capture for archived thread races.
- Modify `wiki/RAG Process Workflow.md`, `wiki/Production Observability Workflow.md`, `wiki/index.md`, `wiki/log.md`, and regenerate `wiki/manifest.json` if implementation changes durable behavior.

---

### Task 1: Add A Sanitized Sentry Helper

**Files:**
- Create: `lib/observability/ai-unavailable.ts`
- Create: `tests/observability/ai-unavailable.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/observability/ai-unavailable.test.ts` with this content:

```ts
import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RAG_ERROR_CODES } from "@/lib/rag/errors";
import { captureHandledAiUnavailable } from "@/lib/observability/ai-unavailable";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  withScope: vi.fn((callback: (scope: MockScope) => void) => {
    const scope: MockScope = {
      setTag: vi.fn(),
      setContext: vi.fn(),
      setLevel: vi.fn(),
    };
    callback(scope);
  }),
}));

type MockScope = {
  setTag: ReturnType<typeof vi.fn>;
  setContext: ReturnType<typeof vi.fn>;
  setLevel: ReturnType<typeof vi.fn>;
};

describe("captureHandledAiUnavailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures a sanitized handled AI unavailable event", () => {
    const providerError = new Error("provider response included raw details");

    captureHandledAiUnavailable({
      error: providerError,
      surface: "ask_document",
      workspaceSlug: "company-handbook",
      status: 503,
      ragErrorCode: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });

    expect(Sentry.withScope).toHaveBeenCalledTimes(1);
    const scope = vi.mocked(Sentry.withScope).mock.calls[0]?.[0];
    const mockScope: MockScope = {
      setTag: vi.fn(),
      setContext: vi.fn(),
      setLevel: vi.fn(),
    };
    scope?.(mockScope as never);

    expect(mockScope.setLevel).toHaveBeenCalledWith("error");
    expect(mockScope.setTag).toHaveBeenCalledWith("ai.surface", "ask_document");
    expect(mockScope.setTag).toHaveBeenCalledWith("ai.status", "503");
    expect(mockScope.setTag).toHaveBeenCalledWith(
      "ai.rag_error_code",
      RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
    );
    expect(mockScope.setTag).toHaveBeenCalledWith("ai.chat_provider", "openai-compatible");
    expect(mockScope.setTag).toHaveBeenCalledWith(
      "ai.chat_model",
      "google/gemma-4-31b-it:free",
    );
    expect(mockScope.setContext).toHaveBeenCalledWith("ai_unavailable", {
      surface: "ask_document",
      workspaceSlug: "company-handbook",
      status: 503,
      ragErrorCode: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
    const capturedError = vi.mocked(Sentry.captureException).mock.calls[0]?.[0] as Error;
    expect(capturedError.name).toBe("HandledAiUnavailableError");
    expect(capturedError.message).toBe("Handled AI provider failure returned AI_UNAVAILABLE");
    expect(capturedError.message).not.toContain("raw details");
    expect(capturedError.cause).toBeUndefined();
  });

  it("omits optional provider and model fields when they are unknown", () => {
    captureHandledAiUnavailable({
      error: new Error(RAG_ERROR_CODES.INVALID_CONFIG),
      surface: "workspace_chat_prepare",
      workspaceSlug: "company-handbook",
      status: 503,
      ragErrorCode: RAG_ERROR_CODES.INVALID_CONFIG,
    });

    const scope = vi.mocked(Sentry.withScope).mock.calls[0]?.[0];
    const mockScope: MockScope = {
      setTag: vi.fn(),
      setContext: vi.fn(),
      setLevel: vi.fn(),
    };
    scope?.(mockScope as never);

    expect(mockScope.setTag).not.toHaveBeenCalledWith("ai.chat_provider", expect.anything());
    expect(mockScope.setTag).not.toHaveBeenCalledWith("ai.chat_model", expect.anything());
    expect(mockScope.setContext).toHaveBeenCalledWith("ai_unavailable", {
      surface: "workspace_chat_prepare",
      workspaceSlug: "company-handbook",
      status: 503,
      ragErrorCode: RAG_ERROR_CODES.INVALID_CONFIG,
    });
  });

  it("swallows Sentry SDK failures", () => {
    vi.mocked(Sentry.withScope).mockImplementationOnce(() => {
      throw new Error("sentry unavailable");
    });

    expect(() =>
      captureHandledAiUnavailable({
        error: new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED),
        surface: "workspace_chat_stream",
        workspaceSlug: "company-handbook",
        streamStarted: true,
        ragErrorCode: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/observability/ai-unavailable.test.ts --reporter=dot
```

Expected: FAIL because `@/lib/observability/ai-unavailable` does not exist.

- [ ] **Step 3: Implement the helper**

Create `lib/observability/ai-unavailable.ts` with this content:

```ts
import * as Sentry from "@sentry/nextjs";
import type { RagErrorCode } from "@/lib/rag/errors";

export type AiUnavailableSurface =
  | "ask_document"
  | "workspace_chat_prepare"
  | "workspace_chat_stream";

export type CaptureHandledAiUnavailableInput = {
  error: unknown;
  surface: AiUnavailableSurface;
  workspaceSlug: string;
  status?: 503;
  streamStarted?: boolean;
  ragErrorCode: RagErrorCode;
  chatProvider?: string;
  chatModel?: string;
};

export function captureHandledAiUnavailable(input: CaptureHandledAiUnavailableInput) {
  try {
    Sentry.withScope((scope) => {
      const context = buildContext(input);
      scope.setLevel("error");
      scope.setTag("ai.surface", input.surface);
      scope.setTag("ai.rag_error_code", input.ragErrorCode);
      if (input.status) {
        scope.setTag("ai.status", String(input.status));
      }
      if (input.streamStarted !== undefined) {
        scope.setTag("ai.stream_started", String(input.streamStarted));
      }
      if (input.chatProvider) {
        scope.setTag("ai.chat_provider", input.chatProvider);
      }
      if (input.chatModel) {
        scope.setTag("ai.chat_model", input.chatModel);
      }
      scope.setContext("ai_unavailable", context);
      Sentry.captureException(createHandledAiUnavailableError());
    });
  } catch {
    // Observability must not change the public AI error response.
  }
}

function buildContext(input: CaptureHandledAiUnavailableInput) {
  return {
    surface: input.surface,
    workspaceSlug: input.workspaceSlug,
    ...(input.status ? { status: input.status } : {}),
    ...(input.streamStarted !== undefined ? { streamStarted: input.streamStarted } : {}),
    ragErrorCode: input.ragErrorCode,
    ...(input.chatProvider ? { chatProvider: input.chatProvider } : {}),
    ...(input.chatModel ? { chatModel: input.chatModel } : {}),
  };
}

function createHandledAiUnavailableError() {
  const error = new Error("Handled AI provider failure returned AI_UNAVAILABLE");
  error.name = "HandledAiUnavailableError";
  return error;
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run:

```bash
pnpm exec vitest run tests/observability/ai-unavailable.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 5: Commit the helper**

Run:

```bash
git add lib/observability/ai-unavailable.ts tests/observability/ai-unavailable.test.ts
git commit -m "feat: add AI unavailable Sentry capture helper"
```

Expected: commit succeeds.

---

### Task 2: Capture Document Ask AI 503s

**Files:**
- Modify: `tests/rag/ask-route.test.ts`
- Modify: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`

- [ ] **Step 1: Write the failing route tests**

Update `tests/rag/ask-route.test.ts`:

1. Add this import:

```ts
import { captureHandledAiUnavailable } from "@/lib/observability/ai-unavailable";
```

2. Add this mock after the existing `vi.mock("@/lib/rag/ask", ...)` block:

```ts
vi.mock("@/lib/observability/ai-unavailable", () => ({
  captureHandledAiUnavailable: vi.fn(),
}));
```

3. Replace the existing `"returns a generic unavailable response for RAG runtime failures"` test with:

```ts
  it("captures and returns a generic unavailable response for RAG runtime failures", async () => {
    const error = new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    vi.mocked(askDocumentQuestion).mockRejectedValueOnce(error);

    const response = await POST(jsonRequest({
      question: "What is saved?",
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    }), {
      params: Promise.resolve({ workspaceSlug: "company-handbook", documentId: "doc-1" }),
    });

    await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
    expect(response.status).toBe(503);
    expect(captureHandledAiUnavailable).toHaveBeenCalledWith({
      error,
      surface: "ask_document",
      workspaceSlug: "company-handbook",
      status: 503,
      ragErrorCode: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });
  });
```

4. Add this test below it:

```ts
  it("does not capture invalid chat model input as an AI provider failure", async () => {
    const response = await POST(jsonRequest({
      question: "What is saved?",
      chatModel: "bad model",
    }), {
      params: Promise.resolve({ workspaceSlug: "company-handbook", documentId: "doc-1" }),
    });

    await expect(response.json()).resolves.toEqual({ error: "INVALID_CHAT_MODEL" });
    expect(response.status).toBe(400);
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the Ask route test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/rag/ask-route.test.ts --reporter=dot
```

Expected: FAIL because `captureHandledAiUnavailable` is not called from the Ask route.

- [ ] **Step 3: Wire the helper into the Ask route**

Update `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`:

1. Add this import:

```ts
import { captureHandledAiUnavailable } from "@/lib/observability/ai-unavailable";
```

2. Replace the RAG runtime error branch with:

```ts
    if (isRagRuntimeError(message)) {
      captureHandledAiUnavailable({
        error,
        surface: "ask_document",
        workspaceSlug,
        status: 503,
        ragErrorCode: message,
        ...(chatProviderValidation?.ok
          ? { chatProvider: chatProviderValidation.value }
          : {}),
        ...(chatModelValidation?.ok ? { chatModel: chatModelValidation.value } : {}),
      });
      return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 503 });
    }
```

- [ ] **Step 4: Run the Ask route test to verify it passes**

Run:

```bash
pnpm exec vitest run tests/rag/ask-route.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 5: Commit the Ask route capture**

Run:

```bash
git add 'app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts' tests/rag/ask-route.test.ts
git commit -m "feat: capture handled Ask AI provider failures"
```

Expected: commit succeeds.

---

### Task 3: Capture Workspace Chat 503s And Stream Errors

**Files:**
- Modify: `tests/rag/workspace-chat-route.test.ts`
- Modify: `app/api/workspaces/[workspaceSlug]/assistant/error-response.ts`
- Modify: `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`

- [ ] **Step 1: Write the failing workspace chat route tests**

Update `tests/rag/workspace-chat-route.test.ts`:

1. Add this import:

```ts
import { captureHandledAiUnavailable } from "@/lib/observability/ai-unavailable";
```

2. Add this mock after the existing `vi.mock("@/lib/rag/workspace-chat", ...)` block:

```ts
vi.mock("@/lib/observability/ai-unavailable", () => ({
  captureHandledAiUnavailable: vi.fn(),
}));
```

3. Replace `preparedWorkspaceChatMessage` with a typed object that includes model context:

```ts
const preparedWorkspaceChatMessage = {
  threadId: "thread-1",
  message: "What changed?",
  prompt: { system: "", user: "", citations: [] },
  promptChunkCount: 0,
  citationChunkIds: [],
  trace: { callbacks: [], metadata: {} },
  chatModel: { invoke: vi.fn() },
  chatModelName: "google/gemma-4-31b-it:free",
  chatProviderName: "openai-compatible",
} as unknown as Awaited<ReturnType<typeof prepareWorkspaceChatMessageStream>>;
```

4. Replace the `"streams an error event when sending fails after a token"` test with:

```ts
  it("captures and streams an error event when sending fails after a token", async () => {
    const error = new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementationOnce(
      async (_prepared, { onToken }) => {
        await onToken("Partial answer");
        throw error;
      },
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await expect(readNdjson(response)).resolves.toEqual([
      { type: "start" },
      { type: "token", content: "Partial answer" },
      { type: "error", error: "AI_UNAVAILABLE" },
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(captureHandledAiUnavailable).toHaveBeenCalledWith({
      error,
      surface: "workspace_chat_stream",
      workspaceSlug: "company-handbook",
      streamStarted: true,
      ragErrorCode: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });
  });
```

5. Add this assertion to the `"streams an archived thread error when sending fails after a token"` test, after `expect(response.status).toBe(200);`:

```ts
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
```

6. Replace the `"returns a generic unavailable response when preparation fails before streaming"` test with:

```ts
  it("captures and returns a generic unavailable response when preparation fails before streaming", async () => {
    const error = new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    vi.mocked(prepareWorkspaceChatMessageStream).mockRejectedValueOnce(error);

    const response = await POST_MESSAGE(
      jsonRequest({
        message: "What changed?",
        chatProvider: "openai-compatible",
        chatModel: "google/gemma-4-31b-it:free",
      }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
    expect(response.status).toBe(503);
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(captureHandledAiUnavailable).toHaveBeenCalledWith({
      error,
      surface: "workspace_chat_prepare",
      workspaceSlug: "company-handbook",
      status: 503,
      ragErrorCode: RAG_ERROR_CODES.CHAT_REQUEST_FAILED,
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });
  });
```

- [ ] **Step 2: Run the workspace route test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/rag/workspace-chat-route.test.ts --reporter=dot
```

Expected: FAIL because workspace chat does not call `captureHandledAiUnavailable` and `WorkspaceChatPreparedMessage` does not expose `chatProviderName`.

- [ ] **Step 3: Add prepared chat provider metadata**

Modify `lib/rag/workspace-chat.ts`:

1. Add a field to `WorkspaceChatPreparedMessage`:

```ts
  chatProviderName: string;
```

2. In the object returned by `prepareWorkspaceChatMessageStream()`, add:

```ts
    chatProviderName: effectiveModelConfig.chat.provider,
```

The return object already contains `chatModelName: effectiveModelConfig.chat.model`; keep that field unchanged.

- [ ] **Step 4: Wire pre-stream capture into the shared error response**

Modify `app/api/workspaces/[workspaceSlug]/assistant/error-response.ts`:

1. Add this import:

```ts
import { captureHandledAiUnavailable } from "@/lib/observability/ai-unavailable";
```

2. Change the function signature to:

```ts
export type WorkspaceChatErrorResponseContext = {
  surface: "workspace_chat_prepare";
  workspaceSlug: string;
  chatProvider?: string;
  chatModel?: string;
};

export function workspaceChatErrorResponse(
  error: unknown,
  context?: WorkspaceChatErrorResponseContext,
) {
```

3. Replace the RAG runtime branch with:

```ts
  if (isRagRuntimeError(message)) {
    if (context) {
      captureHandledAiUnavailable({
        error,
        surface: context.surface,
        workspaceSlug: context.workspaceSlug,
        status: 503,
        ragErrorCode: message,
        ...(context.chatProvider ? { chatProvider: context.chatProvider } : {}),
        ...(context.chatModel ? { chatModel: context.chatModel } : {}),
      });
    }
    return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 503 });
  }
```

- [ ] **Step 5: Pass context and capture stream failures from the message route**

Modify `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`:

1. Add this import:

```ts
import { captureHandledAiUnavailable } from "@/lib/observability/ai-unavailable";
import { isRagRuntimeError } from "@/lib/rag/errors";
```

2. Replace the preparation catch branch with:

```ts
  } catch (error) {
    return workspaceChatErrorResponse(error, {
      surface: "workspace_chat_prepare",
      workspaceSlug,
      ...(chatProviderValidation?.ok
        ? { chatProvider: chatProviderValidation.value }
        : {}),
      ...(chatModelValidation?.ok ? { chatModel: chatModelValidation.value } : {}),
    });
  }
```

3. Change the call to `workspaceChatStreamResponse`:

```ts
  return workspaceChatStreamResponse(prepared, request.signal, workspaceSlug);
```

4. Change the function signature:

```ts
function workspaceChatStreamResponse(
  prepared: WorkspaceChatPreparedMessage,
  signal: AbortSignal,
  workspaceSlug: string,
) {
```

5. Replace the stream catch branch with:

```ts
      } catch (error) {
        if (signal.aborted) return;
        const message = error instanceof Error ? error.message : "";
        const isArchivedThread = message === WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED;
        const streamError = isArchivedThread
          ? WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED
          : "AI_UNAVAILABLE";
        if (!isArchivedThread && isRagRuntimeError(message)) {
          captureHandledAiUnavailable({
            error,
            surface: "workspace_chat_stream",
            workspaceSlug,
            streamStarted: true,
            ragErrorCode: message,
            chatProvider: prepared.chatProviderName,
            chatModel: prepared.chatModelName,
          });
        }
        writeEvent({ type: "error", error: streamError });
      } finally {
```

- [ ] **Step 6: Run the workspace route test to verify it passes**

Run:

```bash
pnpm exec vitest run tests/rag/workspace-chat-route.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 7: Commit the workspace chat capture**

Run:

```bash
git add lib/rag/workspace-chat.ts 'app/api/workspaces/[workspaceSlug]/assistant/error-response.ts' 'app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts' tests/rag/workspace-chat-route.test.ts
git commit -m "feat: capture handled Workspace AI provider failures"
```

Expected: commit succeeds.

---

### Task 4: Update Wiki And Run Verification

**Files:**
- Modify: `wiki/RAG Process Workflow.md`
- Modify: `wiki/Production Observability Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update `wiki/RAG Process Workflow.md`**

In the `Observability And Privacy` section, add this paragraph after the Sentry paragraph:

```markdown
Issue #116 adds explicit Sentry capture for handled AI unavailable failures. Document Ask AI, workspace chat preparation, and workspace chat post-start stream failures still return the public `AI_UNAVAILABLE` shape, but the server records a sanitized Sentry event with surface, workspace, RAG error code, and effective chat provider/model when known. The event does not include question text, prompt text, saved markdown, retrieved chunk text, answer text, API keys, provider base URLs, headers, cookies, or raw provider response bodies.
```

In the `Failure Modes` section, update the sentence about chat request failure to mention Sentry:

```markdown
Answer and embedding provider catch blocks keep raw provider details in server logs, route responses stay normalized, and handled `AI_UNAVAILABLE` branches capture privacy-safe Sentry events when Sentry is configured.
```

- [ ] **Step 2: Update `wiki/Production Observability Workflow.md`**

In the Sentry SaaS scope list, add this bullet:

```markdown
- handled AI provider/runtime failures that are intentionally returned as `AI_UNAVAILABLE` 503 responses or post-start Workspace AI NDJSON error events.
```

In `Failure modes`, add:

```markdown
Handled AI 503 responses are no longer expected to rely on uncaught App Router error capture. Issue #116 routes those failures through an explicit sanitized Sentry event. Docker logs remain the place to inspect raw provider messages and startup/env/container failures.
```

- [ ] **Step 3: Update `wiki/index.md` and `wiki/log.md`**

In `wiki/index.md`, change the Issue #116 status line from design-only to implemented behavior:

```markdown
- AI/RAG observability: Issue #116 keeps handled Ask AI and Workspace AI provider/runtime failures public as `AI_UNAVAILABLE`, while capturing privacy-safe Sentry events for document Ask AI 503s, workspace chat pre-stream 503s, and workspace chat post-start NDJSON `AI_UNAVAILABLE` events. The capture excludes question, prompt, document body, retrieved chunks, answer, API keys, provider base URLs, and raw provider response bodies. 설계 근거는 `docs/superpowers/specs/2026-06-20-ai-provider-503-sentry-capture-design.md`이다.
```

At the top of `wiki/log.md`, add:

```markdown
## 2026-06-20T12:55:02+0900 - issue-116 handled AI 503 Sentry capture implementation

- Result: Issue #116 구현으로 handled Ask AI/Workspace AI provider failures가 public response는 `AI_UNAVAILABLE`로 유지하면서 Sentry에는 privacy-safe event로 기록된다.
- Coverage: Document Ask AI `503`, Workspace AI pre-stream `503`, Workspace AI post-start NDJSON `AI_UNAVAILABLE` event를 capture하고, validation failure와 archived-thread race는 provider unavailable event로 기록하지 않는다.
- Pages: [[RAG Process Workflow]], [[Production Observability Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/observability/ai-unavailable.ts`, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/error-response.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `lib/rag/workspace-chat.ts`, route and observability tests.
- Verification: `pnpm exec vitest run tests/observability/ai-unavailable.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts tests/observability/sentry-config.test.ts tests/observability/sentry-scrub-event.test.ts tests/observability/sentry-files.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`; `pnpm wiki:manifest`; `pnpm wiki:lint`; `pnpm wiki:sync-check --staged`.
```

- [ ] **Step 4: Regenerate manifest and run focused verification**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
pnpm exec vitest run tests/observability/ai-unavailable.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts tests/observability/sentry-config.test.ts tests/observability/sentry-scrub-event.test.ts tests/observability/sentry-files.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
```

Expected:

- `pnpm wiki:manifest` writes `wiki/manifest.json`.
- `pnpm wiki:lint` exits 0. It may continue to warn about `wiki/designs/sidebar.md` unresolved image link if that pre-existing warning remains.
- Vitest reports all selected test files passing.
- TypeScript exits 0.

- [ ] **Step 5: Run staged wiki sync check**

Run:

```bash
git add lib/observability/ai-unavailable.ts tests/observability/ai-unavailable.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts lib/rag/workspace-chat.ts 'app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts' 'app/api/workspaces/[workspaceSlug]/assistant/error-response.ts' 'app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts' wiki/RAG\ Process\ Workflow.md wiki/Production\ Observability\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
pnpm wiki:sync-check --staged
git diff --cached --check
```

Expected:

- `pnpm wiki:sync-check --staged` reports source and wiki maintenance changes.
- `git diff --cached --check` exits 0.

- [ ] **Step 6: Commit wiki and final verification updates**

Run:

```bash
git commit -m "docs: document handled AI provider failure capture"
```

Expected: commit succeeds.

---

## Final Verification Before PR

- [ ] Run the focused verification bundle:

```bash
pnpm exec vitest run tests/observability/ai-unavailable.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts tests/observability/sentry-config.test.ts tests/observability/sentry-scrub-event.test.ts tests/observability/sentry-files.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm wiki:manifest
pnpm wiki:lint
git diff --check
```

- [ ] Inspect final diff:

```bash
git status --short
git log --oneline origin/main..HEAD
```

- [ ] Follow `AGENTS.md` completion flow:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
git push -u origin issue-116-capture-handled-ai-provider-503-errors-in-sentry
gh pr create --draft --fill
gh pr ready
```

After marking the PR ready, wait at least 5 minutes, then inspect PR reviews,
unresolved threads, inline comments, and CI/check status. Fix actionable review
feedback or failing checks on the same branch and repeat verification before the
final task-complete response.
