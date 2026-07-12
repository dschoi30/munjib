import { NextResponse } from "next/server";

export const SIGNUP_NOT_ALLOWED = "SIGNUP_NOT_ALLOWED" as const;

export async function POST() {
  return NextResponse.json(
    { ok: false, code: SIGNUP_NOT_ALLOWED },
    {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
