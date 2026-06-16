import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  INVALID_CHAT_MODEL_ERROR,
  validateChatProvider,
  validateChatModelId,
} from "@/lib/rag/client-model-settings";
import {
  sendWorkspaceChatMessage,
  WORKSPACE_CHAT_ERROR_CODES,
} from "@/lib/rag/workspace-chat";
import { workspaceChatErrorResponse } from "../error-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceSlug: string }> },
) {
  const user = await requireCurrentUser();
  const { workspaceSlug } = await params;
  const body = await parseJsonBody(request);

  if (!body.ok) {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const message = typeof body.value.message === "string" ? body.value.message.trim() : "";
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

  const chatProviderValidation =
    body.value.chatProvider === undefined || body.value.chatProvider === null
      ? null
      : validateChatProvider(body.value.chatProvider);
  if (chatProviderValidation && !chatProviderValidation.ok) {
    return NextResponse.json({ error: INVALID_CHAT_MODEL_ERROR }, { status: 400 });
  }

  const chatModelValidation =
    body.value.chatModel === undefined || body.value.chatModel === null
      ? null
      : validateChatModelId(
          body.value.chatModel,
          chatProviderValidation?.ok ? chatProviderValidation.value : undefined,
        );
  if (chatModelValidation && !chatModelValidation.ok) {
    return NextResponse.json({ error: INVALID_CHAT_MODEL_ERROR }, { status: 400 });
  }

  try {
    const result = await sendWorkspaceChatMessage({
      workspaceSlug,
      actorId: user.id,
      message,
      ...(selectedDocumentId !== undefined ? { selectedDocumentId } : {}),
      ...(chatProviderValidation?.ok
        ? { chatProviderOverride: chatProviderValidation.value }
        : {}),
      ...(chatModelValidation?.ok ? { chatModelOverride: chatModelValidation.value } : {}),
    });

    return NextResponse.json(result);
  } catch (error) {
    return workspaceChatErrorResponse(error);
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
