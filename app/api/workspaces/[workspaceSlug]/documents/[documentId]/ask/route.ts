import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { ASK_ERROR_CODES, askDocumentQuestion } from "@/lib/rag/ask";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceSlug: string; documentId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { workspaceSlug, documentId } = await params;
    const body = (await request.json()) as { question?: unknown };
    const question = typeof body.question === "string" ? body.question : "";
    const result = await askDocumentQuestion({
      workspaceSlug,
      documentId,
      actorId: user.id,
      question,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === ASK_ERROR_CODES.QUESTION_REQUIRED) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (
      message === SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND ||
      message === SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND
    ) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: "RAG_REQUEST_FAILED" }, { status: 500 });
  }
}
