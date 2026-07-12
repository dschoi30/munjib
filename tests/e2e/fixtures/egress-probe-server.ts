import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { Page } from "@playwright/test";

export type EgressProbeRequest = {
  method: string;
  pathHash: string;
  caller: "browser" | "server" | "unknown";
};

export type EgressProbe = {
  browserAndServerReachableOrigin: string;
  serverReachableOrigin: string;
  calibrateBrowserAndServer(page: Page): Promise<void>;
  calibration(): { browser: number; server: number };
  reset(): void;
  requests(): EgressProbeRequest[];
  close(): Promise<void>;
};

const PROBE_PORT = readProbePort();
// The in-process Playwright oracle is local-only by default. A containerized
// probe must opt into its own network listener explicitly (the test Compose
// overlay does that for the separate `egress-probe` service).
const PROBE_BIND_HOST = process.env.MUNJIB_EGRESS_PROBE_BIND_HOST?.trim() || "127.0.0.1";
const PROBE_ORIGIN = process.env.MUNJIB_EGRESS_PROBE_ORIGIN?.trim();
const PROBE_BROWSER_ORIGIN =
  process.env.MUNJIB_EGRESS_PROBE_BROWSER_ORIGIN?.trim() ||
  PROBE_ORIGIN ||
  "http://localhost:" + PROBE_PORT;
const PROBE_SERVER_ORIGIN =
  process.env.MUNJIB_EGRESS_PROBE_SERVER_ORIGIN?.trim() ||
  PROBE_ORIGIN ||
  PROBE_BROWSER_ORIGIN;

function readProbePort() {
  const value = Number(process.env.MUNJIB_EGRESS_PROBE_PORT ?? "39158");
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error("MUNJIB_EGRESS_PROBE_PORT must be a TCP port between 1024 and 65535.");
  }
  return value;
}

function hashPath(path: string) {
  return createHash("sha256").update(path).digest("hex");
}

function callerFor(value: string | undefined): EgressProbeRequest["caller"] {
  if (value === "browser" || value === "server") return value;
  return "unknown";
}

function writeCors(response: ServerResponse) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET, OPTIONS");
  response.setHeader("access-control-allow-headers", "x-egress-probe-caller");
  response.setHeader("cache-control", "no-store");
}

/**
 * A local-only listener used by the browser/server oracle. It stores only a
 * path digest and caller label, never query strings, headers, cookies, bodies,
 * credentials, or provider responses.
 */
export async function startEgressProbeServer(): Promise<EgressProbe> {
  const requests: EgressProbeRequest[] = [];
  const calibrationCounts = { browser: 0, server: 0 };
  let server: Server | null = null;

  server = createServer((request: IncomingMessage, response: ServerResponse) => {
    writeCors(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const requestPath = request.url?.split("?", 1)[0] ?? "/";
    const caller = callerFor(
      typeof request.headers["x-egress-probe-caller"] === "string"
        ? request.headers["x-egress-probe-caller"]
        : undefined,
    );
    requests.push({
      method: request.method ?? "GET",
      pathHash: hashPath(requestPath),
      caller,
    });
    if (requestPath === "/browser-canary" && caller === "browser") calibrationCounts.browser += 1;
    if (requestPath === "/server-canary" && caller === "server") calibrationCounts.server += 1;
    response.writeHead(204);
    response.end();
  });

  server.listen(PROBE_PORT, PROBE_BIND_HOST);
  await once(server, "listening");

  return {
    browserAndServerReachableOrigin: PROBE_BROWSER_ORIGIN,
    serverReachableOrigin: PROBE_SERVER_ORIGIN,
    async calibrateBrowserAndServer(page) {
      await page.evaluate(async (url) => {
        const response = await fetch(url + "/browser-canary", {
          headers: { "x-egress-probe-caller": "browser" },
        });
        if (!response.ok) throw new Error("Browser calibration failed: " + response.status);
      }, PROBE_BROWSER_ORIGIN);
      // The server calibration must travel through the Next/Node app route.
      // Calling the probe directly from this Playwright process would only
      // prove runner reachability, not server-process reachability.
      const response = await page.request.get("/api/test/egress-calibration");
      if (!response.ok) throw new Error("Server calibration failed: " + response.status);
    },
    calibration() {
      return { ...calibrationCounts };
    },
    reset() {
      requests.length = 0;
      calibrationCounts.browser = 0;
      calibrationCounts.server = 0;
    },
    requests() {
      return requests.map((request) => ({ ...request }));
    },
    async close() {
      if (!server) return;
      const current = server;
      server = null;
      await new Promise<void>((resolve, reject) => {
        current.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
