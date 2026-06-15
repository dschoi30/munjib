import { NextResponse } from "next/server";
import { isRagRuntimeError } from "@/lib/rag/errors";
import { WORKSPACE_CHAT_ERROR_CODES } from "@/lib/rag/workspace-chat";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

export function workspaceChatErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND) {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  if (message === WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (message === WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED) {
    return NextResponse.json({ error: message }, { status: 409 });
  }
  if (isRagRuntimeError(message)) {
    return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 503 });
  }

  return NextResponse.json({ error: "WORKSPACE_CHAT_REQUEST_FAILED" }, { status: 500 });
}
