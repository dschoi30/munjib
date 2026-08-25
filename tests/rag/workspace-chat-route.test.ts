import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as GET_THREAD } from "@/app/api/workspaces/[workspaceSlug]/assistant/thread/route";
import { POST as POST_MESSAGE } from "@/app/api/workspaces/[workspaceSlug]/assistant/messages/route";
import { POST as POST_RESET } from "@/app/api/workspaces/[workspaceSlug]/assistant/thread/reset/route";
import { requireAiActor, requireCurrentUser } from "@/lib/auth/session";
import {
  captureHandledAiUnavailable,
  captureTrialAiFailure,
} from "@/lib/observability/ai-unavailable";
import { RAG_ERROR_CODES } from "@/lib/rag/errors";
import { admitTrialAiRequest, releaseTrialAiLease } from "@/lib/rag/trial-ai-admission";
import {
  preflightWorkspaceChatMessageStream,
  getOrCreateWorkspaceChatThread,
  preparePreflightedWorkspaceChatMessageStream,
  prepareWorkspaceChatMessageStream,
  resetWorkspaceChatThread,
  sendPreparedWorkspaceChatMessageStream,
  WORKSPACE_CHAT_ERROR_CODES,
} from "@/lib/rag/workspace-chat";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

vi.mock("@/lib/auth/session", () => ({
  requireAiActor: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rag/trial-ai-admission", () => ({
  admitTrialAiRequest: vi.fn(),
  releaseTrialAiLease: vi.fn(),
}));

vi.mock("@/lib/observability/ai-unavailable", () => ({
  captureHandledAiUnavailable: vi.fn(),
  captureTrialAiFailure: vi.fn(),
}));

vi.mock("@/lib/rag/workspace-chat", () => ({
  WORKSPACE_CHAT_ERROR_CODES: {
    MESSAGE_REQUIRED: "MESSAGE_REQUIRED",
    THREAD_ARCHIVED: "THREAD_ARCHIVED",
  },
  preflightWorkspaceChatMessageStream: vi.fn(),
  getOrCreateWorkspaceChatThread: vi.fn(),
  preparePreflightedWorkspaceChatMessageStream: vi.fn(),
  prepareWorkspaceChatMessageStream: vi.fn(),
  resetWorkspaceChatThread: vi.fn(),
  sendPreparedWorkspaceChatMessageStream: vi.fn(),
}));

const thread = {
  id: "thread-1",
  createdAt: new Date("2026-06-15T00:00:00.000Z"),
  updatedAt: new Date("2026-06-15T00:00:01.000Z"),
  workspaceId: "workspace-1",
  userId: "user-1",
  title: null,
  status: "ACTIVE" as const,
  lastMessageAt: null,
  memorySummary: null,
  memoryUpdatedAt: null,
  messages: [],
};

const userMessage = {
  id: "message-user-1",
  createdAt: new Date("2026-06-15T00:00:02.000Z"),
  updatedAt: new Date("2026-06-15T00:00:03.000Z"),
  threadId: "thread-1",
  role: "USER" as const,
  content: "What changed?",
  citations: null,
  contextMeta: null,
  model: null,
};

const assistantMessage = {
  id: "message-assistant-1",
  createdAt: new Date("2026-06-15T00:00:04.000Z"),
  updatedAt: new Date("2026-06-15T00:00:05.000Z"),
  threadId: "thread-1",
  role: "ASSISTANT" as const,
  content: "The workspace changed [1].",
  citations: null,
  contextMeta: null,
  model: "gemma4:e4b",
};

const citations = [
  {
    index: 1,
    documentId: "doc-1",
    documentTitle: "Handbook",
    documentPath: "Handbook",
    headingPath: null,
  },
];

const preparedWorkspaceChatMessage = {
  kind: "persistent",
  threadId: "thread-1",
  message: "What changed?",
  chatProviderName: "openai-compatible",
  chatModelName: "google/gemma-4-31b-it:free",
} as unknown as Awaited<ReturnType<typeof prepareWorkspaceChatMessageStream>>;

const authenticatedActor = {
  admissionActor: { kind: "authenticated-user" as const, userId: "user-1" },
  authorizationPrincipal: { kind: "user" as const, userId: "user-1" },
  kstDate: "2026-08-25",
};

const anonymousTrialActor = {
  admissionActor: {
    kind: "anonymous-trial" as const,
    trialVisitorSubject: "visitor-digest-1",
  },
  authorizationPrincipal: {
    kind: "anonymous-trial-demo" as const,
    capabilityId: "anonymous-trial-v1" as const,
    workspaceId: "workspace-demo-1",
    workspaceSlug: "company-handbook",
    access: "viewer-only" as const,
    trialVisitorSubject: "visitor-digest-1",
  },
  networkBucketDigest: "network-digest-1",
  kstDate: "2026-08-25",
};

const persistentPreflight = {
  kind: "persistent" as const,
  workspaceId: "workspace-1",
  workspaceSlug: "company-handbook",
  actorId: "user-1",
  readableDocuments: [],
};

const statelessTrialPreflight = {
  kind: "stateless-trial" as const,
  workspaceId: "workspace-demo-1",
  workspaceSlug: "company-handbook",
  readableDocuments: [],
};

describe("workspace chat routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAiActor).mockResolvedValue(authenticatedActor);
    vi.mocked(requireCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
    });
    vi.mocked(preflightWorkspaceChatMessageStream).mockResolvedValue(
      persistentPreflight as never,
    );
    vi.mocked(admitTrialAiRequest).mockResolvedValue({ kind: "not-applicable" });
    vi.mocked(releaseTrialAiLease).mockResolvedValue(undefined);
    vi.mocked(getOrCreateWorkspaceChatThread).mockResolvedValue({
      thread,
      messages: [userMessage],
    });
    vi.mocked(prepareWorkspaceChatMessageStream).mockResolvedValue(
      preparedWorkspaceChatMessage,
    );
    vi.mocked(preparePreflightedWorkspaceChatMessageStream).mockResolvedValue(
      preparedWorkspaceChatMessage,
    );
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementation(
      async (_prepared, { onToken }) => {
        await onToken("The workspace ");
        await onToken("changed [1].");
        return {
          thread,
          userMessage,
          assistantMessage,
          citations,
        };
      },
    );
    vi.mocked(resetWorkspaceChatThread).mockResolvedValue({ thread: null });
  });

  it("returns a JSON quota denial before preparation or NDJSON streaming", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousTrialActor);
    vi.mocked(preflightWorkspaceChatMessageStream).mockResolvedValueOnce(
      statelessTrialPreflight as never,
    );
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "denied",
      code: "TRIAL_AI_DAILY_LIMIT_REACHED",
      resetsAt: "2026-08-25T15:00:00.000Z",
    });

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({
      error: "TRIAL_AI_DAILY_LIMIT_REACHED",
      code: "TRIAL_AI_DAILY_LIMIT_REACHED",
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-type")).not.toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("retry-after")).not.toBeNull();
    expect(preparePreflightedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(releaseTrialAiLease).not.toHaveBeenCalled();
  });

  it("returns JSON 503 when Trial admission is unavailable", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousTrialActor);
    vi.mocked(preflightWorkspaceChatMessageStream).mockResolvedValueOnce(
      statelessTrialPreflight as never,
    );
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "denied",
      code: "TRIAL_AI_ADMISSION_UNAVAILABLE",
    });

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({
      error: "TRIAL_AI_ADMISSION_UNAVAILABLE",
      code: "TRIAL_AI_ADMISSION_UNAVAILABLE",
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).not.toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(preparePreflightedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it("fails closed when anonymous Trial admission is unexpectedly not applicable", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousTrialActor);
    vi.mocked(preflightWorkspaceChatMessageStream).mockResolvedValueOnce(
      statelessTrialPreflight as never,
    );
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({ kind: "not-applicable" });

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({
      error: "TRIAL_AI_ADMISSION_UNAVAILABLE",
      code: "TRIAL_AI_ADMISSION_UNAVAILABLE",
    });
    expect(response.status).toBe(503);
    expect(preparePreflightedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "valid provider and model",
      body: {
        message: "What changed?",
        chatProvider: "openai-compatible",
        chatModel: "google/gemma-4-31b-it:free",
      },
    },
    {
      name: "incompatible model",
      body: { message: "What changed?", chatModel: "bad model" },
    },
  ])("rejects anonymous Trial $name overrides before admission", async ({ body }) => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousTrialActor);

    const response = await POST_MESSAGE(jsonRequest(body), routeContext());

    await expect(response.json()).resolves.toEqual({
      error: "TRIAL_AI_MODEL_OVERRIDE_NOT_ALLOWED",
    });
    expect(response.status).toBe(400);
    expect(preflightWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(admitTrialAiRequest).not.toHaveBeenCalled();
    expect(preparePreflightedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it("skips admission when the request aborts while authorization preflight is pending", async () => {
    const abortController = new AbortController();
    const deferredPreflight = createDeferred<typeof statelessTrialPreflight>();
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousTrialActor);
    vi.mocked(preflightWorkspaceChatMessageStream).mockReturnValueOnce(
      deferredPreflight.promise as never,
    );

    const responsePromise = POST_MESSAGE(
      jsonRequest({ message: "What changed?" }, { signal: abortController.signal }),
      routeContext(),
    );
    await vi.waitFor(() => expect(preflightWorkspaceChatMessageStream).toHaveBeenCalled());
    abortController.abort();
    deferredPreflight.resolve(statelessTrialPreflight);
    const response = await responsePromise;

    await expect(response.json()).resolves.toEqual({ error: "WORKSPACE_CHAT_REQUEST_ABORTED" });
    expect(response.status).toBe(499);
    expect(admitTrialAiRequest).not.toHaveBeenCalled();
    expect(preparePreflightedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it("authorizes and admits an anonymous Trial before preparing and exposes remaining quota in start", async () => {
    const release = createDeferred<void>();
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousTrialActor);
    vi.mocked(preflightWorkspaceChatMessageStream).mockResolvedValueOnce(
      statelessTrialPreflight as never,
    );
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "admitted",
      leaseId: "lease-1",
      remaining: 2,
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    vi.mocked(releaseTrialAiLease).mockReturnValueOnce(release.promise);

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    const eventsPromise = readNdjson(response);
    await vi.waitFor(() => expect(releaseTrialAiLease).toHaveBeenCalledWith("lease-1"));
    let settled = false;
    void eventsPromise.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release.resolve();
    const events = await eventsPromise;
    expect(events[0]).toEqual({
      type: "start",
      trialAi: { remaining: 2, resetsAt: "2026-08-25T15:00:00.000Z" },
    });
    expect(preflightWorkspaceChatMessageStream).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      authorizationPrincipal: anonymousTrialActor.authorizationPrincipal,
    });
    expect(admitTrialAiRequest).toHaveBeenCalledWith({
      actor: anonymousTrialActor.admissionActor,
      surface: "workspace_chat",
      workspaceId: "workspace-demo-1",
      kstDate: "2026-08-25",
      networkBucketDigest: "network-digest-1",
    });
    expect(preparePreflightedWorkspaceChatMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        preflight: statelessTrialPreflight,
        message: "What changed?",
      }),
    );
    expect(vi.mocked(admitTrialAiRequest).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(preparePreflightedWorkspaceChatMessageStream).mock.invocationCallOrder[0]!,
    );
    expect(releaseTrialAiLease).toHaveBeenCalledWith("lease-1");
  });

  it("awaits best-effort lease release after a Trial stream error", async () => {
    const release = createDeferred<void>();
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousTrialActor);
    vi.mocked(preflightWorkspaceChatMessageStream).mockResolvedValueOnce(
      statelessTrialPreflight as never,
    );
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "admitted",
      leaseId: "lease-error",
      remaining: 1,
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockRejectedValueOnce(
      new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED),
    );
    vi.mocked(releaseTrialAiLease).mockReturnValueOnce(release.promise);

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );
    const bodyPromise = readNdjson(response);
    await vi.waitFor(() => expect(releaseTrialAiLease).toHaveBeenCalledWith("lease-error"));
    let settled = false;
    void bodyPromise.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release.resolve();

    await expect(bodyPromise).resolves.toEqual([
      {
        type: "start",
        trialAi: { remaining: 1, resetsAt: "2026-08-25T15:00:00.000Z" },
      },
      { type: "error", error: "AI_UNAVAILABLE" },
    ]);
    expect(captureTrialAiFailure).toHaveBeenCalledWith({
      surface: "workspace_chat",
      resultCode: "AI_UNAVAILABLE",
      remaining: 1,
    });
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("releases an admitted lease when post-admission preparation fails", async () => {
    const release = createDeferred<void>();
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousTrialActor);
    vi.mocked(preflightWorkspaceChatMessageStream).mockResolvedValueOnce(
      statelessTrialPreflight as never,
    );
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "admitted",
      leaseId: "lease-prepare",
      remaining: 0,
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    vi.mocked(preparePreflightedWorkspaceChatMessageStream).mockRejectedValueOnce(
      new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED),
    );
    vi.mocked(releaseTrialAiLease).mockReturnValueOnce(release.promise);

    const responsePromise = POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );
    await vi.waitFor(() => expect(releaseTrialAiLease).toHaveBeenCalledWith("lease-prepare"));
    let settled = false;
    void responsePromise.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release.resolve();
    const response = await responsePromise;

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "AI_UNAVAILABLE",
      trialAi: {
        remaining: 0,
        resetsAt: "2026-08-25T15:00:00.000Z",
      },
    });
    expect(releaseTrialAiLease).toHaveBeenCalledWith("lease-prepare");
    expect(captureTrialAiFailure).toHaveBeenCalledWith({
      surface: "workspace_chat",
      resultCode: "AI_UNAVAILABLE",
      remaining: 0,
    });
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("preserves a successful Trial stream when best-effort lease release rejects", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousTrialActor);
    vi.mocked(preflightWorkspaceChatMessageStream).mockResolvedValueOnce(
      statelessTrialPreflight as never,
    );
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "admitted",
      leaseId: "lease-release-success",
      remaining: 2,
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    vi.mocked(releaseTrialAiLease).mockRejectedValueOnce(
      new Error("lease storage response included sensitive details"),
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );
    const events = await readNdjson(response);

    expect(events.at(-1)).toMatchObject({
      type: "done",
      assistantMessage: jsonMessage(assistantMessage),
    });
    expect(releaseTrialAiLease).toHaveBeenCalledWith("lease-release-success");
  });

  it("preserves the sanitized Trial error when best-effort lease release rejects", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousTrialActor);
    vi.mocked(preflightWorkspaceChatMessageStream).mockResolvedValueOnce(
      statelessTrialPreflight as never,
    );
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "admitted",
      leaseId: "lease-release-error",
      remaining: 1,
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockRejectedValueOnce(
      new Error("raw provider response included prompt and answer"),
    );
    vi.mocked(releaseTrialAiLease).mockRejectedValueOnce(
      new Error("lease storage response included sensitive details"),
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await expect(readNdjson(response)).resolves.toEqual([
      {
        type: "start",
        trialAi: { remaining: 1, resetsAt: "2026-08-25T15:00:00.000Z" },
      },
      { type: "error", error: "AI_UNAVAILABLE" },
    ]);
    expect(releaseTrialAiLease).toHaveBeenCalledWith("lease-release-error");
    expect(captureTrialAiFailure).toHaveBeenCalledWith({
      surface: "workspace_chat",
      resultCode: "AI_UNAVAILABLE",
      remaining: 1,
    });
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("returns the current workspace chat thread and messages", async () => {
    const response = await GET_THREAD(new Request("http://test.local"), routeContext());

    await expect(response.json()).resolves.toEqual({
      thread: jsonThread(),
      messages: [jsonMessage(userMessage)],
    });
    expect(response.status).toBe(200);
    expect(getOrCreateWorkspaceChatThread).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      actorId: "user-1",
    });
  });

  it("streams workspace chat message events with selected document pass-through", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({
        message: "  What changed?  ",
        selectedDocumentId: "doc-1",
        chatProvider: "openai-compatible",
        chatModel: "google/gemma-4-31b-it:free",
        uiLanguage: "ko",
      }),
      routeContext(),
    );

    await expect(readNdjson(response)).resolves.toEqual([
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
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(preparePreflightedWorkspaceChatMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        preflight: persistentPreflight,
        message: "What changed?",
        selectedDocumentId: "doc-1",
        chatProviderOverride: "openai-compatible",
        chatModelOverride: "google/gemma-4-31b-it:free",
        uiLanguage: "ko",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(sendPreparedWorkspaceChatMessageStream).toHaveBeenCalledWith(
      preparedWorkspaceChatMessage,
      expect.objectContaining({ onToken: expect.any(Function) }),
    );
  });

  it("ignores invalid UI language input without rejecting workspace messages", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({
        message: "What changed?",
        uiLanguage: "jp",
      }),
      routeContext(),
    );

    await readNdjson(response);

    expect(response.status).toBe(200);
    const preparationInput = vi.mocked(preparePreflightedWorkspaceChatMessageStream).mock.calls[0]?.[0];
    expect(preparationInput).toEqual(
      expect.objectContaining({
        preflight: persistentPreflight,
        message: "What changed?",
      }),
    );
    expect(preparationInput).not.toHaveProperty("uiLanguage");
  });

  it("passes the request abort signal into the streaming service", async () => {
    const abortController = new AbortController();

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }, { signal: abortController.signal }),
      routeContext(),
    );

    await readNdjson(response);

    const callbacks = vi.mocked(sendPreparedWorkspaceChatMessageStream).mock.calls[0]?.[1];
    expect(callbacks).toEqual(
      expect.objectContaining({
        onToken: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(callbacks?.signal?.aborted).toBe(false);
    abortController.abort();
    expect(callbacks?.signal?.aborted).toBe(true);
  });

  it("passes the request abort signal into message preparation", async () => {
    const abortController = new AbortController();

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }, { signal: abortController.signal }),
      routeContext(),
    );

    await readNdjson(response);

    const preparationInput = vi.mocked(preparePreflightedWorkspaceChatMessageStream).mock.calls[0]?.[0];
    expect(preparationInput).toEqual(
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(preparationInput?.signal?.aborted).toBe(false);
    abortController.abort();
    expect(preparationInput?.signal?.aborted).toBe(true);
  });

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

  it("does not capture an aborted stream failure as an AI provider failure", async () => {
    const abortController = new AbortController();
    const release = createDeferred<void>();
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousTrialActor);
    vi.mocked(preflightWorkspaceChatMessageStream).mockResolvedValueOnce(
      statelessTrialPreflight as never,
    );
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "admitted",
      leaseId: "lease-abort",
      remaining: 0,
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementationOnce(
      async (_prepared, { onToken }) => {
        await onToken("Partial answer");
        abortController.abort();
        throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
      },
    );
    vi.mocked(releaseTrialAiLease).mockReturnValueOnce(release.promise);

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }, { signal: abortController.signal }),
      routeContext(),
    );

    const bodyPromise = readNdjson(response);
    await vi.waitFor(() => expect(releaseTrialAiLease).toHaveBeenCalledWith("lease-abort"));
    let settled = false;
    void bodyPromise.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release.resolve();

    await expect(bodyPromise).resolves.toEqual([
      {
        type: "start",
        trialAi: { remaining: 0, resetsAt: "2026-08-25T15:00:00.000Z" },
      },
      { type: "token", content: "Partial answer" },
    ]);
    expect(response.status).toBe(200);
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
    expect(releaseTrialAiLease).toHaveBeenCalledWith("lease-abort");
  });

  it("streams an archived thread error when sending fails after a token", async () => {
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementationOnce(
      async (_prepared, { onToken }) => {
        await onToken("Partial answer");
        throw new Error(WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED);
      },
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await expect(readNdjson(response)).resolves.toEqual([
      { type: "start" },
      { type: "token", content: "Partial answer" },
      { type: "error", error: WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED },
    ]);
    expect(response.status).toBe(200);
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("disables response transformation for streaming messages", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await readNdjson(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-transform");
  });

  it("ignores late stream writes after the response body is cancelled", async () => {
    const releaseToken = createDeferred<void>();
    vi.mocked(sendPreparedWorkspaceChatMessageStream).mockImplementationOnce(
      async (_prepared, { onToken }) => {
        await releaseToken.promise;
        await onToken("Late token");
        return {
          thread,
          userMessage,
          assistantMessage,
          citations,
        };
      },
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );
    expect(sendPreparedWorkspaceChatMessageStream).toHaveBeenCalled();
    const sendPromise = vi.mocked(sendPreparedWorkspaceChatMessageStream).mock.results[0]
      ?.value as Promise<unknown>;

    await response.body?.cancel();
    releaseToken.resolve();

    await expect(sendPromise).resolves.toMatchObject({
      assistantMessage,
    });
  });

  it("rejects invalid chat model overrides before calling the streaming service", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({
        message: "What changed?",
        chatModel: "bad model",
      }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({ error: "INVALID_CHAT_MODEL" });
    expect(response.status).toBe(400);
    expect(preparePreflightedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("rejects provider-only chat overrides before calling the streaming service", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({
        message: "What changed?",
        chatProvider: "openai-compatible",
      }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({ error: "INVALID_CHAT_MODEL" });
    expect(response.status).toBe(400);
    expect(preparePreflightedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("rejects a blank message before calling the streaming service", async () => {
    const response = await POST_MESSAGE(jsonRequest({ message: "   " }), routeContext());

    await expect(response.json()).resolves.toEqual({
      error: WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED,
    });
    expect(response.status).toBe(400);
    expect(preparePreflightedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before calling the streaming service", async () => {
    const response = await POST_MESSAGE(
      new Request("http://test.local", {
        method: "POST",
        body: "{",
      }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({ error: "INVALID_JSON" });
    expect(response.status).toBe(400);
    expect(preparePreflightedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it("rejects invalid selected documents before calling the streaming service", async () => {
    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?", selectedDocumentId: 123 }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({
      error: "INVALID_SELECTED_DOCUMENT_ID",
    });
    expect(response.status).toBe(400);
    expect(preparePreflightedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
  });

  it("resets the current workspace chat thread", async () => {
    vi.mocked(resetWorkspaceChatThread).mockResolvedValueOnce({ thread });

    const response = await POST_RESET(new Request("http://test.local", {
      method: "POST",
    }), routeContext());

    await expect(response.json()).resolves.toEqual({ thread: jsonThread() });
    expect(response.status).toBe(200);
    expect(resetWorkspaceChatThread).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      actorId: "user-1",
    });
  });

  it("does not swallow auth redirects", async () => {
    const redirectError = new Error("NEXT_REDIRECT");
    vi.mocked(requireCurrentUser).mockRejectedValueOnce(redirectError);

    await expect(
      GET_THREAD(new Request("http://test.local"), routeContext()),
    ).rejects.toBe(redirectError);

    expect(getOrCreateWorkspaceChatThread).not.toHaveBeenCalled();
  });

  it("maps workspace not found to not found", async () => {
    vi.mocked(getOrCreateWorkspaceChatThread).mockRejectedValueOnce(
      new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND),
    );

    const response = await GET_THREAD(new Request("http://test.local"), routeContext());

    await expect(response.json()).resolves.toEqual({
      error: SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND,
    });
    expect(response.status).toBe(404);
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("captures and returns a generic unavailable response when preparation fails before streaming", async () => {
    const error = new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    vi.mocked(preparePreflightedWorkspaceChatMessageStream).mockRejectedValueOnce(error);

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

  it("uses the shared unavailable response for reset RAG runtime failures", async () => {
    vi.mocked(resetWorkspaceChatThread).mockRejectedValueOnce(
      new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED),
    );

    const response = await POST_RESET(new Request("http://test.local", {
      method: "POST",
    }), routeContext());

    await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
    expect(response.status).toBe(503);
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("maps archived thread races before streaming to a stable conflict response", async () => {
    vi.mocked(preparePreflightedWorkspaceChatMessageStream).mockRejectedValueOnce(
      new Error(WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED),
    );

    const response = await POST_MESSAGE(
      jsonRequest({ message: "What changed?" }),
      routeContext(),
    );

    await expect(response.json()).resolves.toEqual({
      error: WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED,
    });
    expect(response.status).toBe(409);
    expect(sendPreparedWorkspaceChatMessageStream).not.toHaveBeenCalled();
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });
});

function routeContext(workspaceSlug = "company-handbook") {
  return {
    params: Promise.resolve({ workspaceSlug }),
  };
}

function jsonRequest(body: unknown, init?: Pick<RequestInit, "signal">) {
  return new Request("http://test.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: init?.signal,
  });
}

async function readNdjson(response: Response) {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function jsonThread() {
  return {
    ...thread,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  };
}

function jsonMessage(message: typeof userMessage | typeof assistantMessage) {
  return {
    ...message,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}
