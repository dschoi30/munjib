import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { resetWorkspaceChatThread } from "@/lib/rag/workspace-chat";
import { workspaceChatErrorResponse } from "../../error-response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceSlug: string }> },
) {
  const user = await requireCurrentUser();
  const { workspaceSlug } = await params;

  try {
    const result = await resetWorkspaceChatThread({
      workspaceSlug,
      actorId: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    return workspaceChatErrorResponse(error);
  }
}
