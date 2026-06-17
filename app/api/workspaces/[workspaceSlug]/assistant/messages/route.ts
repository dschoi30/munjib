import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  INVALID_CHAT_MODEL_ERROR,
  validateChatProvider,
  validateChatModelId,
} from "@/lib/rag/client-model-settings";
import {
  prepareWorkspaceChatMessageStream,
  sendPreparedWorkspaceChatMessageStream,
  type WorkspaceChatPreparedMessage,
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

  const hasChatProvider =
    body.value.chatProvider !== undefined && body.value.chatProvider !== null;
  const hasChatModel = body.value.chatModel !== undefined && body.value.chatModel !== null;
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

  let prepared: WorkspaceChatPreparedMessage;
  try {
    prepared = await prepareWorkspaceChatMessageStream({
      workspaceSlug,
      actorId: user.id,
      message,
      ...(selectedDocumentId !== undefined ? { selectedDocumentId } : {}),
      ...(chatProviderValidation?.ok
        ? { chatProviderOverride: chatProviderValidation.value }
        : {}),
      ...(chatModelValidation?.ok ? { chatModelOverride: chatModelValidation.value } : {}),
    });
  } catch (error) {
    return workspaceChatErrorResponse(error);
  }

  return workspaceChatStreamResponse(prepared);
}

function workspaceChatStreamResponse(prepared: WorkspaceChatPreparedMessage) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeEvent = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      writeEvent({ type: "start" });
      try {
        const result = await sendPreparedWorkspaceChatMessageStream(prepared, {
          onToken(token) {
            writeEvent({ type: "token", content: token });
          },
        });
        writeEvent({ type: "done", ...result });
      } catch (error) {
        const streamError =
          error instanceof Error &&
          error.message === WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED
            ? WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED
            : "AI_UNAVAILABLE";
        writeEvent({ type: "error", error: streamError });
      } finally {
        controller.close();
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
