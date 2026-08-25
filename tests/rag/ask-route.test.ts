import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route";
import { requireAiActor } from "@/lib/auth/session";
import {
  captureHandledAiUnavailable,
  captureTrialAiFailure,
} from "@/lib/observability/ai-unavailable";
import {
  ASK_ERROR_CODES,
  answerPreparedAskDocumentQuestion,
  prepareAskDocumentQuestion,
} from "@/lib/rag/ask";
import { RAG_ERROR_CODES } from "@/lib/rag/errors";
import { admitTrialAiRequest, releaseTrialAiLease, startTrialAiLeaseHeartbeat } from "@/lib/rag/trial-ai-admission";

vi.mock("@/lib/auth/session", () => ({ requireAiActor: vi.fn() }));
vi.mock("@/lib/rag/ask", () => ({
  ASK_ERROR_CODES: { QUESTION_REQUIRED: "QUESTION_REQUIRED" },
  prepareAskDocumentQuestion: vi.fn(),
  answerPreparedAskDocumentQuestion: vi.fn(),
}));
vi.mock("@/lib/rag/trial-ai-admission", () => ({
  admitTrialAiRequest: vi.fn(),
  releaseTrialAiLease: vi.fn(),
  startTrialAiLeaseHeartbeat: vi.fn(),
}));
vi.mock("@/lib/observability/ai-unavailable", () => ({
  captureHandledAiUnavailable: vi.fn(),
  captureTrialAiFailure: vi.fn(),
}));

const preparedAsk = { workspaceId: "workspace-1" };

describe("RAG ask route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAiActor).mockResolvedValue({
      admissionActor: { kind: "authenticated-user", userId: "user-1" },
      authorizationPrincipal: { kind: "user", userId: "user-1" },
      kstDate: "2026-08-25",
    });
    vi.mocked(prepareAskDocumentQuestion).mockResolvedValue(preparedAsk as never);
    vi.mocked(answerPreparedAskDocumentQuestion).mockResolvedValue({ answer: "Saved answer", citations: [] });
    vi.mocked(admitTrialAiRequest).mockResolvedValue({ kind: "not-applicable" });
    vi.mocked(releaseTrialAiLease).mockResolvedValue();
    vi.mocked(startTrialAiLeaseHeartbeat).mockReturnValue({
      signal: new AbortController().signal,
      stop: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("does not swallow auth redirects", async () => {
    const redirectError = new Error("NEXT_REDIRECT");
    vi.mocked(requireAiActor).mockRejectedValueOnce(redirectError);

    await expect(post({ question: "What is saved?" })).rejects.toBe(redirectError);

    expect(prepareAskDocumentQuestion).not.toHaveBeenCalled();
    expect(admitTrialAiRequest).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before admission", async () => {
    vi.mocked(prepareAskDocumentQuestion).mockRejectedValueOnce(new Error(ASK_ERROR_CODES.QUESTION_REQUIRED));

    const response = await POST(new Request("http://test.local", { method: "POST", body: "{" }), context());

    await expect(response.json()).resolves.toEqual({ error: "QUESTION_REQUIRED" });
    expect(response.status).toBe(400);
    expect(admitTrialAiRequest).not.toHaveBeenCalled();
    expect(answerPreparedAskDocumentQuestion).not.toHaveBeenCalled();
  });

  it("rejects invalid chat model input before actor resolution and admission", async () => {
    const response = await post({ question: "What is saved?", chatModel: "bad model" });

    await expect(response.json()).resolves.toEqual({ error: "INVALID_CHAT_MODEL" });
    expect(response.status).toBe(400);
    expect(requireAiActor).not.toHaveBeenCalled();
    expect(prepareAskDocumentQuestion).not.toHaveBeenCalled();
    expect(admitTrialAiRequest).not.toHaveBeenCalled();
  });

  it("rejects anonymous client provider overrides before authorization, admission, or provider work", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousActor());

    const response = await post({
      question: "What is saved?",
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });

    await expect(response.json()).resolves.toEqual({ error: "INVALID_CHAT_MODEL" });
    expect(response.status).toBe(400);
    expect(prepareAskDocumentQuestion).not.toHaveBeenCalled();
    expect(admitTrialAiRequest).not.toHaveBeenCalled();
    expect(answerPreparedAskDocumentQuestion).not.toHaveBeenCalled();
  });

  it("does not admit a request when document authorization fails", async () => {
    vi.mocked(prepareAskDocumentQuestion).mockRejectedValueOnce(new Error("DOCUMENT_NOT_FOUND"));

    const response = await post({ question: "What is saved?" });

    await expect(response.json()).resolves.toEqual({ error: "DOCUMENT_NOT_FOUND" });
    expect(response.status).toBe(404);
    expect(admitTrialAiRequest).not.toHaveBeenCalled();
    expect(answerPreparedAskDocumentQuestion).not.toHaveBeenCalled();
  });

  it("does not admit an anonymous request disconnected during document preparation", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousActor());
    let finishPreparation!: (value: typeof preparedAsk) => void;
    vi.mocked(prepareAskDocumentQuestion).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPreparation = resolve;
        }) as never,
    );
    const controller = new AbortController();
    const responsePromise = POST(
      jsonRequest({ question: "What is saved?" }, controller.signal),
      context(),
    );

    await vi.waitFor(() => expect(prepareAskDocumentQuestion).toHaveBeenCalledOnce());
    controller.abort();
    finishPreparation(preparedAsk);
    const response = await responsePromise;

    await expect(response.json()).resolves.toEqual({ error: "ASK_REQUEST_ABORTED" });
    expect(response.status).toBe(499);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(admitTrialAiRequest).not.toHaveBeenCalled();
    expect(answerPreparedAskDocumentQuestion).not.toHaveBeenCalled();
  });

  it("returns private no-store 429 without calling the provider when Trial admission is denied", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousActor());
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "denied",
      code: "TRIAL_AI_DAILY_LIMIT_REACHED",
      resetsAt: "2099-08-25T15:00:00.000Z",
    });

    const response = await post({ question: "What is saved?" });

    await expect(response.json()).resolves.toEqual({
      code: "TRIAL_AI_DAILY_LIMIT_REACHED",
      resetsAt: "2099-08-25T15:00:00.000Z",
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(answerPreparedAskDocumentQuestion).not.toHaveBeenCalled();
    expect(releaseTrialAiLease).not.toHaveBeenCalled();
  });

  it("returns private no-store 503 without calling the provider when Trial admission is unavailable", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousActor());
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "denied",
      code: "TRIAL_AI_ADMISSION_UNAVAILABLE",
    });

    const response = await post({ question: "What is saved?" });

    await expect(response.json()).resolves.toEqual({ code: "TRIAL_AI_ADMISSION_UNAVAILABLE" });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("retry-after")).toBeNull();
    expect(answerPreparedAskDocumentQuestion).not.toHaveBeenCalled();
  });

  it("omits daily reset and Retry-After for a transient concurrent-request denial", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousActor());
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "denied",
      code: "TRIAL_AI_REQUEST_IN_PROGRESS",
    });

    const response = await post({ question: "What is saved?" });

    await expect(response.json()).resolves.toEqual({ code: "TRIAL_AI_REQUEST_IN_PROGRESS" });
    expect(response.headers.get("retry-after")).toBeNull();
  });

  it("runs exact authorization before admission and returns remaining Trial entitlement on success", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousActor());
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "admitted",
      leaseId: "lease-1",
      remaining: 2,
      resetsAt: "2026-08-25T15:00:00.000Z",
    });

    const response = await post({ question: "What is saved?" });

    await expect(response.json()).resolves.toEqual({
      answer: "Saved answer",
      citations: [],
      trialAi: { remaining: 2, resetsAt: "2026-08-25T15:00:00.000Z" },
    });
    expect(vi.mocked(prepareAskDocumentQuestion).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(admitTrialAiRequest).mock.invocationCallOrder[0]!,
    );
    expect(vi.mocked(admitTrialAiRequest).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(answerPreparedAskDocumentQuestion).mock.invocationCallOrder[0]!,
    );
    expect(admitTrialAiRequest).toHaveBeenCalledWith({
      actor: anonymousActor().admissionActor,
      surface: "ask_document",
      workspaceId: "workspace-1",
      kstDate: "2026-08-25",
      networkBucketDigest: "network-digest-1",
    });
    expect(releaseTrialAiLease).toHaveBeenCalledWith("lease-1");
    expect(startTrialAiLeaseHeartbeat).toHaveBeenCalledWith("lease-1");
    expect(answerPreparedAskDocumentQuestion).toHaveBeenCalledWith(
      preparedAsk,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(
      vi.mocked(startTrialAiLeaseHeartbeat).mock.results[0]?.value.stop,
    ).toHaveBeenCalledOnce();
  });

  it("uses coarse Trial telemetry and releases the lease when the anonymous provider fails", async () => {
    const error = new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousActor());
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce({
      kind: "admitted",
      leaseId: "lease-1",
      remaining: 2,
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    vi.mocked(answerPreparedAskDocumentQuestion).mockRejectedValueOnce(error);

    const response = await post({ question: "What is saved?" });

    await expect(response.json()).resolves.toEqual({
      error: "AI_UNAVAILABLE",
      trialAi: { remaining: 2, resetsAt: "2026-08-25T15:00:00.000Z" },
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(releaseTrialAiLease).toHaveBeenCalledWith("lease-1");
    expect(captureTrialAiFailure).toHaveBeenCalledWith({
      surface: "ask_document",
      resultCode: "AI_UNAVAILABLE",
      remaining: 2,
    });
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("releases an admitted lease when provider work aborts without refunding admission", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousActor());
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce(admitted());
    vi.mocked(answerPreparedAskDocumentQuestion).mockRejectedValueOnce(new Error("AbortError"));

    const response = await post({ question: "What is saved?" });

    await expect(response.json()).resolves.toEqual({ error: "RAG_REQUEST_FAILED" });
    expect(response.status).toBe(500);
    expect(releaseTrialAiLease).toHaveBeenCalledWith("lease-1");
  });

  it("does not mask a successful answer when lease release fails", async () => {
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousActor());
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce(admitted());
    vi.mocked(releaseTrialAiLease).mockRejectedValueOnce(new Error("lease store unavailable"));

    const response = await post({ question: "What is saved?" });

    await expect(response.json()).resolves.toEqual({
      answer: "Saved answer",
      citations: [],
      trialAi: { remaining: 2, resetsAt: "2026-08-25T15:00:00.000Z" },
    });
    expect(response.status).toBe(200);
  });

  it("does not mask the original provider failure when lease release fails", async () => {
    const error = new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    vi.mocked(requireAiActor).mockResolvedValueOnce(anonymousActor());
    vi.mocked(admitTrialAiRequest).mockResolvedValueOnce(admitted());
    vi.mocked(answerPreparedAskDocumentQuestion).mockRejectedValueOnce(error);
    vi.mocked(releaseTrialAiLease).mockRejectedValueOnce(new Error("lease store unavailable"));

    const response = await post({ question: "What is saved?" });

    await expect(response.json()).resolves.toEqual({
      error: "AI_UNAVAILABLE",
      trialAi: { remaining: 2, resetsAt: "2026-08-25T15:00:00.000Z" },
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(captureTrialAiFailure).toHaveBeenCalledWith({
      surface: "ask_document",
      resultCode: "AI_UNAVAILABLE",
      remaining: 2,
    });
    expect(captureHandledAiUnavailable).not.toHaveBeenCalled();
  });

  it("keeps normal authenticated behavior outside the Trial ledger", async () => {
    const response = await post({ question: "What is saved?", uiLanguage: "jp" });

    await expect(response.json()).resolves.toEqual({ answer: "Saved answer", citations: [] });
    expect(admitTrialAiRequest).toHaveBeenCalledWith({
      actor: { kind: "authenticated-user", userId: "user-1" },
      surface: "ask_document",
      workspaceId: "workspace-1",
      kstDate: "2026-08-25",
    });
    expect(releaseTrialAiLease).not.toHaveBeenCalled();
  });
});

function anonymousActor() {
  return {
    admissionActor: { kind: "anonymous-trial" as const, trialVisitorSubject: "visitor-1" },
    authorizationPrincipal: {
      kind: "anonymous-trial-demo" as const,
      capabilityId: "anonymous-trial-v1" as const,
      workspaceId: "workspace-1",
      workspaceSlug: "company-handbook",
      access: "viewer-only" as const,
      trialVisitorSubject: "visitor-1",
    },
    networkBucketDigest: "network-digest-1",
    kstDate: "2026-08-25",
  };
}

function admitted() {
  return {
    kind: "admitted" as const,
    leaseId: "lease-1",
    remaining: 2 as const,
    resetsAt: "2026-08-25T15:00:00.000Z",
  };
}

function context() {
  return { params: Promise.resolve({ workspaceSlug: "company-handbook", documentId: "doc-1" }) };
}

function post(body: unknown) {
  return POST(jsonRequest(body), context());
}

function jsonRequest(body: unknown, signal?: AbortSignal) {
  return new Request("http://test.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}
