import { NextResponse } from "next/server";
import { requireAiActor } from "@/lib/auth/session";
import { parseLanguage } from "@/lib/i18n/language";
import {
  captureHandledAiUnavailable,
  captureTrialAiFailure,
} from "@/lib/observability/ai-unavailable";
import {
  ASK_ERROR_CODES,
  answerPreparedAskDocumentQuestion,
  prepareAskDocumentQuestion,
} from "@/lib/rag/ask";
import {
  INVALID_CHAT_MODEL_ERROR,
  validateChatProvider,
  validateChatModelId,
} from "@/lib/rag/client-model-settings";
import { isRagRuntimeError, RAG_ERROR_CODES } from "@/lib/rag/errors";
import {
  admitTrialAiRequest,
  releaseTrialAiLease,
  startTrialAiLeaseHeartbeat,
  type TrialAiLeaseHeartbeat,
} from "@/lib/rag/trial-ai-admission";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceSlug: string; documentId: string }> },
) {
  const { workspaceSlug, documentId } = await params;
  const body = await parseJsonBody(request);
  const question = typeof body.question === "string" ? body.question : "";
  const uiLanguage = parseLanguage(body.uiLanguage);
  const hasChatProvider = body.chatProvider !== undefined && body.chatProvider !== null;
  const hasChatModel = body.chatModel !== undefined && body.chatModel !== null;
  if (hasChatProvider && !hasChatModel) {
    return NextResponse.json({ error: INVALID_CHAT_MODEL_ERROR }, { status: 400 });
  }
  const chatProviderValidation = !hasChatProvider ? null : validateChatProvider(body.chatProvider);
  if (chatProviderValidation && !chatProviderValidation.ok) {
    return NextResponse.json({ error: INVALID_CHAT_MODEL_ERROR }, { status: 400 });
  }
  const chatModelValidation = !hasChatModel
    ? null
    : validateChatModelId(
      body.chatModel,
      chatProviderValidation?.ok ? chatProviderValidation.value : undefined,
    );
  if (chatModelValidation && !chatModelValidation.ok) {
    return NextResponse.json({ error: INVALID_CHAT_MODEL_ERROR }, { status: 400 });
  }

  const actor = await requireAiActor(request);
  if (actor.admissionActor.kind === "anonymous-trial" && (hasChatProvider || hasChatModel)) {
    return NextResponse.json({ error: INVALID_CHAT_MODEL_ERROR }, { status: 400 });
  }
  let admittedLeaseId: string | undefined;
  let admittedTrialAi: { remaining: 0 | 1 | 2; resetsAt: string } | undefined;
  let leaseHeartbeat: TrialAiLeaseHeartbeat | undefined;
  try {
    const prepared = await prepareAskDocumentQuestion({
      workspaceSlug,
      documentId,
      authorizationPrincipal: actor.authorizationPrincipal,
      question,
      ...(uiLanguage ? { uiLanguage } : {}),
      ...(chatProviderValidation?.ok
        ? { chatProviderOverride: chatProviderValidation.value }
        : {}),
      ...(chatModelValidation?.ok ? { chatModelOverride: chatModelValidation.value } : {}),
    });
    if (request.signal.aborted) {
      return NextResponse.json(
        { error: "ASK_REQUEST_ABORTED" },
        { status: 499, headers: { "cache-control": "private, no-store" } },
      );
    }
    const admission = await admitTrialAiRequest({
      actor: actor.admissionActor,
      surface: "ask_document",
      workspaceId: prepared.workspaceId,
      kstDate: actor.kstDate,
      ...(actor.networkBucketDigest ? { networkBucketDigest: actor.networkBucketDigest } : {}),
    });
    if (admission.kind === "denied") return trialAdmissionDeniedResponse(admission);
    if (admission.kind === "admitted") {
      admittedLeaseId = admission.leaseId;
      admittedTrialAi = { remaining: admission.remaining, resetsAt: admission.resetsAt };
      leaseHeartbeat = startTrialAiLeaseHeartbeat(admission.leaseId);
    }

    const providerSignal = leaseHeartbeat
      ? AbortSignal.any([request.signal, leaseHeartbeat.signal])
      : request.signal;
    const result = leaseHeartbeat
      ? await answerPreparedAskDocumentQuestion(prepared, { signal: providerSignal })
      : await answerPreparedAskDocumentQuestion(prepared);
    if (leaseHeartbeat?.signal.aborted) throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
    return NextResponse.json({
      ...result,
      ...(admission.kind === "admitted"
        ? { trialAi: { remaining: admission.remaining, resetsAt: admission.resetsAt } }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === ASK_ERROR_CODES.QUESTION_REQUIRED || message === INVALID_CHAT_MODEL_ERROR) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (
      message === SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND ||
      message === SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND
    ) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (isRagRuntimeError(message)) {
      if (
        actor.authorizationPrincipal.kind === "anonymous-trial-demo" &&
        admittedTrialAi
      ) {
        captureTrialAiFailure({
          surface: "ask_document",
          resultCode: "AI_UNAVAILABLE",
          remaining: admittedTrialAi.remaining,
        });
      } else {
        captureHandledAiUnavailable({
          error,
          surface: "ask_document",
          workspaceSlug,
          status: 503,
          ragErrorCode: message,
          ...(chatProviderValidation?.ok ? { chatProvider: chatProviderValidation.value } : {}),
          ...(chatModelValidation?.ok ? { chatModel: chatModelValidation.value } : {}),
        });
      }
      return NextResponse.json(
        {
          error: "AI_UNAVAILABLE",
          ...(actor.authorizationPrincipal.kind === "anonymous-trial-demo" && admittedTrialAi
            ? { trialAi: admittedTrialAi }
            : {}),
        },
        {
          status: 503,
          ...(actor.authorizationPrincipal.kind === "anonymous-trial-demo" && admittedTrialAi
            ? { headers: { "cache-control": "private, no-store" } }
            : {}),
        },
      );
    }
    return NextResponse.json({ error: "RAG_REQUEST_FAILED" }, { status: 500 });
  } finally {
    await leaseHeartbeat?.stop();
    if (admittedLeaseId) {
      await releaseTrialAiLease(admittedLeaseId).catch(() => undefined);
    }
  }
}

function trialAdmissionDeniedResponse(
  admission: Extract<Awaited<ReturnType<typeof admitTrialAiRequest>>, { kind: "denied" }>,
) {
  const unavailable = admission.code === "TRIAL_AI_ADMISSION_UNAVAILABLE";
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  if (!unavailable && admission.resetsAt) {
    const resetAt = new Date(admission.resetsAt).getTime();
    if (Number.isFinite(resetAt)) {
      headers.set("Retry-After", String(Math.max(0, Math.ceil((resetAt - Date.now()) / 1_000))));
    }
  }
  return NextResponse.json(
    {
      code: admission.code,
      ...(admission.resetsAt ? { resetsAt: admission.resetsAt } : {}),
    },
    { status: unavailable ? 503 : 429, headers },
  );
}

async function parseJsonBody(request: Request) {
  const value = await request.json().catch(() => ({}));
  return toRecord(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
