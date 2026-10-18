import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadWorkspaceDocument } from "@/lib/documents/workspace-detail";

export async function GET(_request: Request, { params }: {
  params: Promise<{ workspaceSlug: string; documentId: string }>;
}) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  const { workspaceSlug, documentId } = await params;
  const detail = await loadWorkspaceDocument(workspaceSlug, documentId, user.id);
  if (!detail) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
  return NextResponse.json(detail, { headers });
}
