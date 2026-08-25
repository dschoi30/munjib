import { NextResponse } from "next/server";
import { resolveTrialEntitlement } from "@/lib/auth/trial-entitlement";

export const dynamic = "force-dynamic";

async function entitlementResponse(request: Request) {
  const result = await resolveTrialEntitlement(request);
  const response = NextResponse.json(result.body, {
    status: result.status,
    headers: { "cache-control": "private, no-store" },
  });
  if (result.setCookie) response.headers.set("set-cookie", result.setCookie);
  return response;
}

export async function GET(request: Request) {
  return entitlementResponse(request);
}

export async function POST(request: Request) {
  return entitlementResponse(request);
}
