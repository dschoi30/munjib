import { NextResponse } from "next/server";
import { requireAiActor } from "@/lib/auth/session";
import { parseLanguage } from "@/lib/i18n/language";
import { captureHandledAiUnavailable } from "@/lib/observability/ai-unavailable";
import {
  INVALID_CHAT_MODEL_ERROR,
  validateChatProvider,
  validateChatModelId,
} from "@/lib/rag/client-model-settings";
import { isRagRuntimeError } from "@/lib/rag/errors";
import {
  preflightWorkspaceChatMessageStream,
  preparePreflightedWorkspaceChatMessageStream,
  sendPreparedWorkspaceChatMessageStream,
  type WorkspaceChatPreparedMessage,
  WORKSPACE_CHAT_ERROR_CODES,
} from "@/lib/rag/workspace-chat";
import {
  admitTrialAiRequest,
  releaseTrialAiLease,
  startTrialAiLeaseHeartbeat,
  type TrialAiAdmission,
  type TrialAiLeaseHeartbeat,
} from "@/lib/rag/trial-ai-admission";
import {
  normalizeWorkspaceChatTrialFailure,
  workspaceChatErrorResponse,
  workspaceChatTrialAdmissionDeniedResponse,
  workspaceChatTrialFailureResponse,
} from "../error-response";

const TRIAL_AI_MODEL_OVERRIDE_NOT_ALLOWED = "TRIAL_AI_MODEL_OVERRIDE_NOT_ALLOWED";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceSlug: string }> },
) {
  const actor = await requireAiActor(request);
  const { workspaceSlug } = await params;
  const body = await parseJsonBody(request);

  if (!body.ok) {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const message = typeof body.value.message === "string" ? body.value.message.trim() : "";
  const uiLanguage = parseLanguage(body.value.uiLanguage);
  if (!message) {
    return NextResponse.json(
      { error: WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED },
      { status: 400 },
    );
  }

  const selectedDocumentId = body.value.selectedDocumentId;
  if (
    selectedDocumentId !== undefined &&
    selectedDocumentId !== null &&
    typeof selectedDocumentId !== "string"
  ) {
    return NextResponse.json({ error: "INVALID_SELECTED_DOCUMENT_ID" }, { status: 400 });
  }

  const hasChatProvider =
    body.value.chatProvider !== undefined && body.value.chatProvider !== null;
  const hasChatModel = body.value.chatModel !== undefined && body.value.chatModel !== null;
  if (
    actor.admissionActor.kind === "anonymous-trial" &&
    (hasChatProvider || hasChatModel)
  ) {
    return NextResponse.json(
      { error: TRIAL_AI_MODEL_OVERRIDE_NOT_ALLOWED },
      { status: 400 },
    );
  }
  if (hasChatProvider && !hasChatModel) {
    return NextResponse.json({ error: INVALID_CHAT_MODEL_ERROR }, { status: 400 });
  }

  const chatProviderValidation =
    !hasChatProvider
      ? null
      : validateChatProvider(body.value.chatProvider);
  if (chatProviderValidation && !chatProviderValidation.ok) {
    return NextResponse.json({ error: INVALID_CHAT_MODEL_ERROR }, { status: 400 });
  }

  const chatModelValidation =
    !hasChatModel
      ? null
      : validateChatModelId(
          body.value.chatModel,
          chatProviderValidation?.ok ? chatProviderValidation.value : undefined,
        );
  if (chatModelValidation && !chatModelValidation.ok) {
    return NextResponse.json({ error: INVALID_CHAT_MODEL_ERROR }, { status: 400 });
  }

  let preflight;
  try {
    preflight = await preflightWorkspaceChatMessageStream({
      workspaceSlug,
      authorizationPrincipal: actor.authorizationPrincipal,
    });
  } catch (error) {
    return workspaceChatErrorResponse(error, {
      surface: "workspace_chat_prepare",
      workspaceSlug,
      ...(chatProviderValidation?.ok ? { chatProvider: chatProviderValidation.value } : {}),
      ...(chatModelValidation?.ok ? { chatModel: chatModelValidation.value } : {}),
    });
  }
  if (request.signal.aborted) {
    return NextResponse.json(
      { error: "WORKSPACE_CHAT_REQUEST_ABORTED" },
      { status: 499, headers: { "cache-control": "private, no-store" } },
    );
  }

  let admission: TrialAiAdmission;
  try {
    admission = await admitTrialAiRequest({
      actor: actor.admissionActor,
      surface: "workspace_chat",
      workspaceId: preflight.workspaceId,
      kstDate: actor.kstDate,
      ...(actor.networkBucketDigest
        ? { networkBucketDigest: actor.networkBucketDigest }
        : {}),
    });
  } catch {
    admission = { kind: "denied", code: "TRIAL_AI_ADMISSION_UNAVAILABLE" };
  }
  if (admission.kind === "denied") {
    return workspaceChatTrialAdmissionDeniedResponse(admission);
  }
  if (actor.admissionActor.kind === "anonymous-trial" && admission.kind !== "admitted") {
    return workspaceChatTrialAdmissionDeniedResponse({
      kind: "denied",
      code: "TRIAL_AI_ADMISSION_UNAVAILABLE",
    });
  }

  const leaseHeartbeat = admission.kind === "admitted"
    ? startTrialAiLeaseHeartbeat(admission.leaseId)
    : undefined;
  const providerSignal = leaseHeartbeat
    ? AbortSignal.any([request.signal, leaseHeartbeat.signal])
    : request.signal;

  let prepared: WorkspaceChatPreparedMessage;
  try {
    prepared = await preparePreflightedWorkspaceChatMessageStream({
      preflight,
      message,
      signal: providerSignal,
      ...(uiLanguage ? { uiLanguage } : {}),
      ...(selectedDocumentId !== undefined ? { selectedDocumentId } : {}),
      ...(chatProviderValidation?.ok
        ? { chatProviderOverride: chatProviderValidation.value }
        : {}),
      ...(chatModelValidation?.ok ? { chatModelOverride: chatModelValidation.value } : {}),
    });
  } catch (error) {
    await leaseHeartbeat?.stop();
    await releaseAdmissionLeaseBestEffort(admission);
    if (admission.kind === "admitted") {
      if (request.signal.aborted) {
        return NextResponse.json(
          { error: "WORKSPACE_CHAT_REQUEST_ABORTED" },
          { status: 499, headers: { "cache-control": "private, no-store" } },
        );
      }
      return workspaceChatTrialFailureResponse(admission);
    }
    return workspaceChatErrorResponse(error, {
      surface: "workspace_chat_prepare",
      workspaceSlug,
      ...(chatProviderValidation?.ok ? { chatProvider: chatProviderValidation.value } : {}),
      ...(chatModelValidation?.ok ? { chatModel: chatModelValidation.value } : {}),
    });
  }

  if (leaseHeartbeat?.signal.aborted && admission.kind === "admitted") {
    await leaseHeartbeat.stop();
    await releaseAdmissionLeaseBestEffort(admission);
    return workspaceChatTrialFailureResponse(admission);
  }

  return workspaceChatStreamResponse(
    prepared,
    request.signal,
    providerSignal,
    workspaceSlug,
    admission,
    leaseHeartbeat,
  );
}

function workspaceChatStreamResponse(
  prepared: WorkspaceChatPreparedMessage,
  requestSignal: AbortSignal,
  providerSignal: AbortSignal,
  workspaceSlug: string,
  admission: Exclude<TrialAiAdmission, { kind: "denied" }>,
  leaseHeartbeat?: TrialAiLeaseHeartbeat,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let streamClosed = false;
      const writeEvent = (event: unknown) => {
        if (streamClosed || controller.desiredSize === null) return false;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          return true;
        } catch {
          streamClosed = true;
          return false;
        }
      };

      writeEvent({
        type: "start",
        ...(admission.kind === "admitted"
          ? { trialAi: { remaining: admission.remaining, resetsAt: admission.resetsAt } }
          : {}),
      });
      try {
        const result = await sendPreparedWorkspaceChatMessageStream(prepared, {
          onToken(token) {
            writeEvent({ type: "token", content: token });
          },
          signal: providerSignal,
        });
        if (leaseHeartbeat?.signal.aborted) {
          throw new Error("TRIAL_AI_LEASE_RENEWAL_FAILED");
        }
        if (!requestSignal.aborted) {
          writeEvent({ type: "done", ...result });
        }
      } catch (error) {
        if (requestSignal.aborted) return;
        if (admission.kind === "admitted") {
          writeEvent({
            type: "error",
            error: normalizeWorkspaceChatTrialFailure(admission.remaining),
          });
          return;
        }
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
        await leaseHeartbeat?.stop();
        await releaseAdmissionLeaseBestEffort(admission);
        if (!streamClosed) {
          try {
            controller.close();
          } catch {
            streamClosed = true;
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}

async function releaseAdmissionLeaseBestEffort(
  admission: Exclude<TrialAiAdmission, { kind: "denied" }>,
) {
  if (admission.kind !== "admitted") return;
  try {
    await releaseTrialAiLease(admission.leaseId);
  } catch {
    // Lease expiry remains the recovery path; cleanup must not replace the request result.
  }
}

async function parseJsonBody(request: Request) {
  try {
    const value = await request.json();
    return { ok: true as const, value: toRecord(value) };
  } catch {
    return { ok: false as const };
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
