import { NextResponse } from "next/server";
import {
  captureHandledAiUnavailable,
  captureTrialAiFailure,
} from "@/lib/observability/ai-unavailable";
import { INVALID_CHAT_MODEL_ERROR } from "@/lib/rag/client-model-settings";
import { isRagRuntimeError } from "@/lib/rag/errors";
import { WORKSPACE_CHAT_ERROR_CODES } from "@/lib/rag/workspace-chat";
import type { TrialAiAdmission } from "@/lib/rag/trial-ai-admission";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

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
  const message = error instanceof Error ? error.message : "";

  if (message === SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND) {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  if (message === INVALID_CHAT_MODEL_ERROR) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (message === WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (message === WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED) {
    return NextResponse.json({ error: message }, { status: 409 });
  }
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

  return NextResponse.json({ error: "WORKSPACE_CHAT_REQUEST_FAILED" }, { status: 500 });
}

export function workspaceChatTrialAdmissionDeniedResponse(
  admission: Extract<TrialAiAdmission, { kind: "denied" }>,
) {
  const status = admission.code === "TRIAL_AI_ADMISSION_UNAVAILABLE" ? 503 : 429;
  const headers = new Headers({ "cache-control": "private, no-store" });
  if (admission.resetsAt) {
    const resetTime = Date.parse(admission.resetsAt);
    if (Number.isFinite(resetTime)) {
      headers.set(
        "retry-after",
        String(Math.max(0, Math.ceil((resetTime - Date.now()) / 1_000))),
      );
    }
  }
  return NextResponse.json(
    {
      error: admission.code,
      code: admission.code,
      ...(admission.resetsAt ? { resetsAt: admission.resetsAt } : {}),
    },
    { status, headers },
  );
}

export function normalizeWorkspaceChatTrialFailure(remaining: 0 | 1 | 2) {
  captureTrialAiFailure({
    surface: "workspace_chat",
    resultCode: "AI_UNAVAILABLE",
    remaining,
  });
  return "AI_UNAVAILABLE" as const;
}

export function workspaceChatTrialFailureResponse(
  admission: Pick<Extract<TrialAiAdmission, { kind: "admitted" }>, "remaining" | "resetsAt">,
) {
  return NextResponse.json(
    {
      error: normalizeWorkspaceChatTrialFailure(admission.remaining),
      trialAi: {
        remaining: admission.remaining,
        resetsAt: admission.resetsAt,
      },
    },
    { status: 503, headers: { "cache-control": "private, no-store" } },
  );
}
