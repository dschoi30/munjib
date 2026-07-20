import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Issue #166 edge bindings readiness contract", () => {
  it("keeps the edge contract preparatory and loopback-only", () => {
    const contract = JSON.parse(read("deploy/security/edge-bindings-v1.json"));

    expect(contract).toMatchObject({
      format: "munjib-edge-bindings-v1",
      version: 1,
      state: "PREPARATORY",
      activation: "DISABLED",
      canonicalOrigin: "https://munjib.andrewchoi.link",
      origin: {
        transport: "http-loopback",
        address: "127.0.0.1:3000",
        publiclyRoutable: false,
      },
    });
    expect(contract.activationGates.productionMutationAllowed).toBe(false);
    expect(contract.activationGates.dependencies).toEqual([3, 4, 7, 8, 9, 10, 11, "13B"]);
  });

  it("pins the required security headers and no-store boundary", () => {
    const contract = JSON.parse(read("deploy/security/edge-bindings-v1.json"));

    expect(contract.requiredHeaders).toEqual([
      { name: "strict-transport-security", value: "max-age=31536000; includeSubDomains" },
      { name: "x-content-type-options", value: "nosniff" },
      { name: "x-frame-options", value: "DENY" },
      { name: "referrer-policy", value: "strict-origin-when-cross-origin" },
      { name: "permissions-policy", value: "camera=(), microphone=(), geolocation=()" },
    ]);
    expect(contract.cachePolicy.noStorePathPrefixes).toEqual([
      "/api/",
      "/login",
      "/workspaces/",
    ]);
    expect(contract.cachePolicy.probeResponse).toBe("no-store");
  });

  it("uses bounded probes and rejects unknown hosts without retaining secrets", () => {
    const contract = JSON.parse(read("deploy/security/edge-bindings-v1.json"));
    const publicProbe = contract.probes.find((probe: { id: string }) => probe.id === "public-https");
    const originProbe = contract.probes.find((probe: { id: string }) => probe.id === "origin-loopback");
    const negativeProbe = contract.probes.find(
      (probe: { id: string }) => probe.id === "unknown-host-rejection",
    );

    expect(publicProbe).toMatchObject({
      path: "/api/auth/providers",
      expectedStatus: 200,
      cadenceSeconds: 60,
      timeoutSeconds: 10,
      failureThreshold: 3,
      bodyPolicy: "discard",
    });
    expect(originProbe).toMatchObject({
      address: "127.0.0.1:3000",
      transport: "http-loopback",
      expectedStatus: 200,
      bodyPolicy: "discard",
    });
    expect(negativeProbe).toMatchObject({
      host: "unknown.invalid",
      expectedStatusClass: "4xx",
      bodyPolicy: "discard",
    });
    expect(contract.telemetry).toMatchObject({ retainResponseBody: false });
    expect(contract.telemetry.redactedFields).toEqual(
      expect.arrayContaining(["authorization", "cookie", "set-cookie", "query", "requestBody", "responseBody", "clientIp"]),
    );
  });

  it("documents the same non-activation boundary for operators", () => {
    const runbook = read("docs/runbooks/edge-bindings-readiness.md");

    expect(runbook).toContain("activation: DISABLED");
    expect(runbook).toContain("Do not edit `/etc/caddy/Caddyfile`, DNS, TLS state, firewall rules, or host");
    expect(runbook).toContain("/api/auth/providers");
    expect(runbook).toContain("response bodies, cookies, authorization headers");
    expect(runbook).toContain("Leaves 3, 4, 7, 8, 9, 10, 11, and 13B");
    expect(runbook).toContain("13A/13B immutable broker evidence");
  });
});
