import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { ASK_ERROR_CODES, askDocumentQuestion } from "@/lib/rag/ask";
import {
  INVALID_CHAT_MODEL_ERROR,
  validateChatModelId,
} from "@/lib/rag/client-model-settings";
import { isRagRuntimeError } from "@/lib/rag/errors";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceSlug: string; documentId: string }> },
) {
  const user = await requireCurrentUser();
  const { workspaceSlug, documentId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    question?: unknown;
    chatModel?: unknown;
  };
  const question = typeof body.question === "string" ? body.question : "";
  const chatModelValidation =
    body.chatModel === undefined || body.chatModel === null
      ? null
      : validateChatModelId(body.chatModel);

  if (chatModelValidation && !chatModelValidation.ok) {
    return NextResponse.json({ error: INVALID_CHAT_MODEL_ERROR }, { status: 400 });
  }

  try {
    const result = await askDocumentQuestion({
      workspaceSlug,
      documentId,
      actorId: user.id,
      question,
      ...(chatModelValidation?.ok ? { chatModelOverride: chatModelValidation.value } : {}),
    });

    return NextResponse.json(result);
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
      return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 503 });
    }

    return NextResponse.json({ error: "RAG_REQUEST_FAILED" }, { status: 500 });
  }
}
