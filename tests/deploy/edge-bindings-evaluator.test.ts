import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateEdgeProbe,
  isNoStorePath,
  parseEdgeBindingsContract,
  parseEdgeBindingsContractJson,
  redactProbeTelemetry,
} from "@/lib/deploy/edge-bindings";

const contractJson = readFileSync("deploy/security/edge-bindings-v1.json", "utf8");

describe("edge bindings contract evaluator", () => {
  it("parses the preparatory contract and keeps production activation disabled", () => {
    const contract = parseEdgeBindingsContractJson(contractJson);

    expect(contract.state).toBe("PREPARATORY");
    expect(contract.activation).toBe("DISABLED");
    expect(contract.origin).toMatchObject({
      transport: "http-loopback",
      address: "127.0.0.1:3000",
      hostHeader: "munjib.andrewchoi.link",
      publiclyRoutable: false,
    });
    expect(contract.activationGates.productionMutationAllowed).toBe(false);
  });

  it("fails closed when a required header is missing or has a non-exact value", () => {
    const contract = parseEdgeBindingsContractJson(contractJson);
    const valid = evaluateEdgeProbe(contract, "public-https", {
      status: 200,
      latencyMs: 42,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Cache-Control": "no-store",
      },
    });
    expect(valid.ok).toBe(true);

    const missing = evaluateEdgeProbe(contract, "public-https", {
      status: 200,
      latencyMs: 42,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Cache-Control": "no-store",
      },
    });
    expect(missing.ok).toBe(false);
    expect(missing.reasons).toContain("HEADER_MISSING:permissions-policy");

    const nonExact = evaluateEdgeProbe(contract, "public-https", {
      status: 200,
      latencyMs: 42,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Cache-Control": "no-store",
      },
    });
    expect(nonExact.ok).toBe(false);
    expect(nonExact.reasons).toContain(
      "HEADER_MISMATCH:strict-transport-security",
    );
  });

  it("applies no-store only at path boundaries and requires the directive", () => {
    const contract = parseEdgeBindingsContractJson(contractJson);

    expect(isNoStorePath(contract, "/api/auth/providers")).toBe(true);
    expect(isNoStorePath(contract, "/login?callbackUrl=%2F")).toBe(true);
    expect(isNoStorePath(contract, "/workspaces/acme")).toBe(true);
    expect(isNoStorePath(contract, "/login-help")).toBe(false);
    expect(isNoStorePath(contract, "https://munjib.andrewchoi.link/api/auth/providers")).toBe(true);

    const noStoreMissing = evaluateEdgeProbe(contract, "origin-loopback", {
      status: 200,
      latencyMs: 4,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: {},
    });
    expect(noStoreMissing.ok).toBe(false);
    expect(noStoreMissing.reasons).toContain("CACHE_CONTROL_NO_STORE_MISSING");

    const noStorePresent = evaluateEdgeProbe(contract, "origin-loopback", {
      status: 200,
      latencyMs: 4,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "cache-control": "private, no-store" },
    });
    expect(noStorePresent.ok).toBe(true);
  });

  it("requires the unknown-host probe to remain in the 4xx class", () => {
    const contract = parseEdgeBindingsContractJson(contractJson);
    const rejected = evaluateEdgeProbe(contract, "unknown-host-rejection", {
      status: 421,
      latencyMs: 18,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "cache-control": "no-store" },
    });
    expect(rejected.ok).toBe(true);

    const accepted = evaluateEdgeProbe(contract, "unknown-host-rejection", {
      status: 200,
      latencyMs: 18,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "cache-control": "no-store" },
    });
    expect(accepted.ok).toBe(false);
    expect(accepted.reasons).toContain("STATUS_CLASS_MISMATCH:4xx");
  });

  it("emits only redacted, allowlisted telemetry fields", () => {
    const contract = parseEdgeBindingsContractJson(contractJson);
    const evaluation = evaluateEdgeProbe(contract, "public-https", {
      status: 200,
      latencyMs: 42,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Cache-Control": "no-store",
        Authorization: "Bearer should-never-appear",
        Cookie: "session=should-never-appear",
      },
      responseBody: "secret response body",
      clientIp: "192.0.2.1",
    });
    const telemetry = redactProbeTelemetry(contract, evaluation);

    expect(Object.keys(telemetry).sort()).toEqual([
      "latencyMs",
      "observedAt",
      "outcome",
      "probeId",
      "status",
    ]);
    expect(telemetry).toEqual({
      probeId: "public-https",
      status: 200,
      latencyMs: 42,
      observedAt: "2026-07-13T00:00:00.000Z",
      outcome: "success",
    });
    expect(JSON.stringify(telemetry)).not.toContain("should-never-appear");
  });

  it("rejects an attempted activation or unsafe origin in the input contract", () => {
    const source = JSON.parse(contractJson) as Record<string, unknown>;
    expect(() =>
      parseEdgeBindingsContract({
        ...source,
        activation: "ENABLED",
      }),
    ).toThrow(/activation/i);

    expect(() =>
      parseEdgeBindingsContract({
        ...source,
        origin: {
          ...(source.origin as Record<string, unknown>),
          address: "0.0.0.0:3000",
          publiclyRoutable: true,
        },
      }),
    ).toThrow(/origin|public/i);
  });
});
