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
  calibrateBrowserAndServer(page: Page): Promise<void>;
  calibration(): { browser: number; server: number };
  reset(): void;
  requests(): EgressProbeRequest[];
  close(): Promise<void>;
};

function hashPath(path: string) {
  return createHash("sha256").update(path).digest("hex");
}
function callerFor(value: string | undefined): EgressProbeRequest["caller"] {
  if (value === "browser" || value === "server") return value;
  return "unknown";
}

/**
 * A local-only listener used by the browser/server oracle.  It intentionally
 * stores only a path digest and a caller label, never query strings, headers,
 * cookies, request bodies, or credentials.
 */
export async function startEgressProbeServer(): Promise<EgressProbe> {
  const requests: EgressProbeRequest[] = [];
  const calibrationCounts = { browser: 0, server: 0 };
  let server: Server | null = null;

  server = createServer((request: IncomingMessage, response: ServerResponse) => {
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
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    throw new Error("The egress probe did not receive a TCP address.");
  }
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    browserAndServerReachableOrigin: origin,
    async calibrateBrowserAndServer(page) {
      await page.evaluate(async (url) => {
        await fetch(`${url}/browser-canary`, {
          headers: { "x-egress-probe-caller": "browser" },
        });
      }, origin);
      await fetch(`${origin}/server-canary`, {
        headers: { "x-egress-probe-caller": "server" },
      });
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
