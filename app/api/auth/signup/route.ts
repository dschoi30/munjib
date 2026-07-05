import { NextResponse } from "next/server";
import { createPasswordSignup } from "@/lib/auth/provisioning";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_EMAIL" }, { status: 400 });
  }

  const payload = body as { email?: unknown; password?: unknown; language?: unknown };
  const result = await createPasswordSignup({
    email: payload.email,
    password: payload.password,
    language: payload.language,
  });
  if (!result.ok) {
    const status = result.code === "EMAIL_IN_USE" ? 409 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
