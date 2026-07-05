import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureCurrentUserWorkspaceAndRedirect } from "@/lib/auth/provisioning";
import { parseLanguage } from "@/lib/i18n/language";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 });
  }

  let payload: { language?: unknown; callbackUrl?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const redirectPath = await ensureCurrentUserWorkspaceAndRedirect({
    userId: user.id,
    language: parseLanguage(payload.language) ?? "en",
    callbackPath: typeof payload.callbackUrl === "string" ? payload.callbackUrl : null,
  });

  return NextResponse.json({ ok: true, redirectPath });
}
