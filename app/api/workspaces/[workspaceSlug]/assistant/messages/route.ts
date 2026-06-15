import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
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

  try {
    const result = await sendWorkspaceChatMessage({
      workspaceSlug,
      actorId: user.id,
      message,
      ...(selectedDocumentId !== undefined ? { selectedDocumentId } : {}),
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
