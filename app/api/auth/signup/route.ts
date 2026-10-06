import { NextResponse } from "next/server";
import { resolvePublicSignupEnabled, isReservedSignupEmail } from "@/lib/auth/signup-policy";
import { createPasswordSignup } from "@/lib/auth/provisioning";

const headers = { "Cache-Control": "private, no-store" };
function failure(code: string, status: number) {
  return NextResponse.json({ ok: false, code }, { status, headers });
}

export async function POST(request: Request) {
  if (!resolvePublicSignupEnabled()) return failure("SIGNUP_NOT_ALLOWED", 403);
  // Account creation is a mutation; only the canonical site's form may submit it.
  try {
    const origin = new URL(process.env.NEXTAUTH_URL ?? "").origin;
    if (!request || request.headers.get("origin") !== origin) return failure("ORIGIN_NOT_ALLOWED", 403);
  } catch {
    return failure("ORIGIN_NOT_ALLOWED", 403);
  }
  let input;
  try {
    input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) return failure("INVALID_REQUEST", 400);
  } catch {
    return failure("INVALID_REQUEST", 400);
  }
  if (isReservedSignupEmail(input.email)) return failure("INVALID_EMAIL", 400);
  try {
    const result = await createPasswordSignup({ email: input.email, password: input.password, language: input.language });
    return NextResponse.json(result, { status: result.ok ? 201 : result.code === "EMAIL_IN_USE" ? 409 : 400, headers });
  } catch (error) {
    // A concurrent request may win the unique email constraint after the lookup.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return failure("EMAIL_IN_USE", 409);
    return failure("SIGNUP_UNAVAILABLE", 503);
  }
}
