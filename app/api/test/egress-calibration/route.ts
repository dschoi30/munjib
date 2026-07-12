import { isTestTransportEnabled } from "@/lib/security/test-transport";

export const dynamic = "force-dynamic";

/**
 * Test-only server-side calibration. The fetch is deliberately performed by
 * the Next/Node process so the egress oracle proves server reachability rather
 * than merely proving that the Playwright runner can reach the probe.
 */
export async function GET() {
  if (!isTestTransportEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  const probeOrigin = process.env.MUNJIB_EGRESS_PROBE_SERVER_ORIGIN?.trim();
  if (!probeOrigin) {
    return new Response("Not found", { status: 404 });
  }

  let probeUrl: URL;
  try {
    probeUrl = new URL("/server-canary", probeOrigin);
    if (probeUrl.protocol !== "http:" && probeUrl.protocol !== "https:") {
      return new Response("Not found", { status: 404 });
    }
  } catch {
    return new Response("Not found", { status: 404 });
  }

  try {
    const response = await fetch(probeUrl, {
      cache: "no-store",
      headers: { "x-egress-probe-caller": "server" },
    });
    if (!response.ok) {
      return new Response("Probe calibration failed", { status: 502 });
    }
  } catch {
    return new Response("Probe calibration failed", { status: 502 });
  }

  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
