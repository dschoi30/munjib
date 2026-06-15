import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { getOrCreateWorkspaceChatThread } from "@/lib/rag/workspace-chat";
import { workspaceChatErrorResponse } from "../error-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceSlug: string }> },
) {
  const user = await requireCurrentUser();
  const { workspaceSlug } = await params;

  try {
    const result = await getOrCreateWorkspaceChatThread({
      workspaceSlug,
      actorId: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    return workspaceChatErrorResponse(error);
  }
}
