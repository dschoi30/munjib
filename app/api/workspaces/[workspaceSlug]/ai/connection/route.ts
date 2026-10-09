import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { validateChatModelSetting } from "@/lib/rag/client-model-settings";
import { getRagGenerationConfig, getRagChatProviderAvailability } from "@/lib/rag/model-config";
import { checkModelConnection } from "@/lib/rag/check-model-connection";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceSlug: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ connected: false }, { status: 401, headers });
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ connected: false }, { status: 403, headers });
  }
  const body = await request.json().catch(() => null);
  const setting = validateChatModelSetting({
    chatProvider: body?.chatProvider,
    chatModel: body?.chatModel,
  });
  if (!setting.ok) return NextResponse.json({ connected: false }, { status: 400, headers });
  const { workspaceSlug } = await params;
  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug, archivedAt: null, members: { some: { userId: user.id } } },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ connected: false }, { status: 404, headers });

  try {
    if (!getRagChatProviderAvailability()[setting.value.chatProvider]) {
      return NextResponse.json({ connected: false }, { headers });
    }
    const { chat } = getRagGenerationConfig(process.env, {
      provider: setting.value.chatProvider,
      model: setting.value.chatModel,
    });
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
    const connected = await checkModelConnection(chat, signal);
    return NextResponse.json({ connected }, { headers });
  } catch {
    // Never expose provider errors, credentials, endpoints or response bodies.
    return NextResponse.json({ connected: false }, { headers });
  }
}
