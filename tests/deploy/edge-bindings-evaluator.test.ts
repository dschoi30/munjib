import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateEdgeProbe,
  isNoStorePath,
  parseEdgeBindingsContract,
  parseEdgeBindingsContractJson,
  redactProbeTelemetry,
} from "@/lib/deploy/edge-bindings";

let contractJson = "";
const contractPath = fileURLToPath(
  new URL("../../deploy/security/edge-bindings-v1.json", import.meta.url),
);
beforeAll(() => {
  contractJson = readFileSync(contractPath, "utf8");
});
const requestFor = (probeId: string) =>
  probeId === "origin-loopback"
      ? {
        method: "GET",
        credentials: "omit",
        authorizationHeaderPresent: false,
        cookieHeaderPresent: false,
        transport: "http-loopback",
        connectAddress: "127.0.0.1:3000",
        host: "munjib.example.invalid",
        path: "/api/auth/providers",
        tlsVerified: false,
        tlsServerName: "",
        redirectCount: 0,
      }
    : probeId === "unknown-host-rejection"
      ? {
          method: "GET",
          credentials: "omit",
          authorizationHeaderPresent: false,
          cookieHeaderPresent: false,
          transport: "https",
          connectAddress: "munjib.example.invalid",
          host: "unknown.invalid",
          path: "/api/auth/providers",
          tlsVerified: true,
          tlsServerName: "munjib.example.invalid",
          redirectCount: 0,
        }
      : {
          method: "GET",
          credentials: "omit",
          authorizationHeaderPresent: false,
          cookieHeaderPresent: false,
          transport: "https",
          connectAddress: "munjib.example.invalid",
          host: "munjib.example.invalid",
          tlsVerified: true,
          tlsServerName: "munjib.example.invalid",
          redirectCount: 0,
          path:
            probeId === "public-login"
              ? "/login"
              : probeId === "public-workspace"
                ? "/workspaces/probe"
                : "/api/auth/providers",
        };

describe("edge bindings contract evaluator", () => {
  it("parses the preparatory contract and keeps production activation disabled", () => {
    const contract = parseEdgeBindingsContractJson(contractJson);

    expect(contract.state).toBe("PREPARATORY");
    expect(contract.activation).toBe("DISABLED");
    expect(contract.origin).toMatchObject({
      transport: "http-loopback",
      address: "127.0.0.1:3000",
      hostHeader: "munjib.example.invalid",
      publiclyRoutable: false,
    });
    expect(contract.probes.map((probe) => probe.id)).toEqual([
      "public-https",
      "public-login",
      "public-workspace",
      "origin-loopback",
      "unknown-host-rejection",
    ]);
    expect(contract.activationGates.productionMutationAllowed).toBe(false);
  });

  it("covers every declared no-store route class with a public probe", () => {
    const contract = parseEdgeBindingsContractJson(contractJson);
    const headers = {
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cache-Control": "no-store",
    };
    for (const probeId of ["public-login", "public-workspace"]) {
      const evaluation = evaluateEdgeProbe(contract, probeId, {
        status: 200,
        latencyMs: 42,
        observedAt: "2026-07-13T00:00:00.000Z",
        headers,
        request: requestFor(probeId),
      });
      expect(evaluation.ok).toBe(true);
    }
  });

  it("rejects fields that do not belong to a probe variant", () => {
    const raw = JSON.parse(contractJson) as Record<string, any>;
    const unknownHost = raw.probes.find((probe: Record<string, unknown>) => probe.id === "unknown-host-rejection");
    unknownHost.expectedStatus = 200;

    expect(() => parseEdgeBindingsContract(raw)).toThrow("EDGE_BINDINGS_CONFIG_INVALID");
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
      request: requestFor("public-https"),
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
      request: requestFor("public-https"),
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
      request: requestFor("public-https"),
    });
    expect(nonExact.ok).toBe(false);
    expect(nonExact.reasons).toContain(
      "HEADER_MISMATCH:strict-transport-security",
    );
  });

  it("applies no-store only at path boundaries and requires the directive", () => {
    const contract = parseEdgeBindingsContractJson(contractJson);

    expect(isNoStorePath(contract, "/api/auth/providers")).toBe(true);
    expect(isNoStorePath(contract, "/api")).toBe(true);
    expect(isNoStorePath(contract, "/login?callbackUrl=%2F")).toBe(true);
    expect(isNoStorePath(contract, "/workspaces/acme")).toBe(true);
    expect(isNoStorePath(contract, "/workspaces")).toBe(true);
    expect(isNoStorePath(contract, "/login-help")).toBe(false);
    expect(isNoStorePath(contract, "https://munjib.example.invalid/api/auth/providers")).toBe(true);

    const noStoreMissing = evaluateEdgeProbe(contract, "origin-loopback", {
      status: 200,
      latencyMs: 4,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: {},
      request: requestFor("origin-loopback"),
    });
    expect(noStoreMissing.ok).toBe(false);
    expect(noStoreMissing.reasons).toContain("CACHE_CONTROL_NO_STORE_MISSING");

    const noStorePresent = evaluateEdgeProbe(contract, "origin-loopback", {
      status: 200,
      latencyMs: 4,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "cache-control": "private, no-store" },
      request: requestFor("origin-loopback"),
    });
    expect(noStorePresent.ok).toBe(true);

    const tooSlow = evaluateEdgeProbe(contract, "origin-loopback", {
      status: 200,
      latencyMs: 5_001,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "cache-control": "no-store" },
      request: requestFor("origin-loopback"),
    });
    expect(tooSlow.ok).toBe(false);
    expect(tooSlow.reasons).toContain("LATENCY_TIMEOUT_EXCEEDED");

    const malformedSeparator = evaluateEdgeProbe(contract, "origin-loopback", {
      status: 200,
      latencyMs: 4,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "cache-control": "private; no-store" },
      request: requestFor("origin-loopback"),
    });
    expect(malformedSeparator.ok).toBe(false);
    expect(malformedSeparator.reasons).toContain("CACHE_CONTROL_NO_STORE_MISSING");
  });

  it("requires the unknown-host probe to remain in the 4xx class", () => {
    const contract = parseEdgeBindingsContractJson(contractJson);
    const rejected = evaluateEdgeProbe(contract, "unknown-host-rejection", {
      status: 421,
      latencyMs: 18,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "cache-control": "no-store" },
      request: requestFor("unknown-host-rejection"),
    });
    expect(rejected.ok).toBe(true);

    const accepted = evaluateEdgeProbe(contract, "unknown-host-rejection", {
      status: 200,
      latencyMs: 18,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "cache-control": "no-store" },
      request: requestFor("unknown-host-rejection"),
    });
    expect(accepted.ok).toBe(false);
    expect(accepted.reasons).toContain("STATUS_CLASS_MISMATCH:4xx");
  });

  it("rejects reduced activation evidence and malformed timestamps", () => {
    const raw = JSON.parse(contractJson) as Record<string, any>;
    raw.activationGates.requiredEvidence = ["edge-owner-approval"];
    expect(() => parseEdgeBindingsContract(raw)).toThrow("EDGE_BINDINGS_CONFIG_INVALID");

    const contract = parseEdgeBindingsContractJson(contractJson);
    const base = {
      status: 200,
      latencyMs: 1,
      headers: { "cache-control": "no-store" },
      request: requestFor("origin-loopback"),
    };
    expect(evaluateEdgeProbe(contract, "origin-loopback", {
      ...base,
      observedAt: "2026-02-31T00:00:00.000Z",
    }).reasons).toContain("OBSERVED_AT_INVALID");
    expect(evaluateEdgeProbe(contract, "origin-loopback", {
      ...base,
      observedAt: "0",
    }).reasons).toContain("OBSERVED_AT_INVALID");
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
      request: requestFor("public-https"),
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

    const untrustedFailure = redactProbeTelemetry(contract, {
      probeId: "x".repeat(100_000),
      ok: false,
      status: Number.NaN,
      latencyMs: Number.POSITIVE_INFINITY,
      observedAt: "not-a-timestamp-" + "x".repeat(100_000),
      reasons: ["OBSERVED_AT_INVALID"],
    });
    expect(untrustedFailure.probeId).toBe("unknown");
    expect(untrustedFailure.status).toBe(0);
    expect(untrustedFailure.latencyMs).toBe(0);
    expect(untrustedFailure.observedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(JSON.stringify(untrustedFailure)).not.toContain("x".repeat(1_000));
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

  it("binds every observation to the configured transport, connect address, host, and path", () => {
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
      request: {
        method: "GET",
        credentials: "omit",
        authorizationHeaderPresent: false,
        cookieHeaderPresent: false,
        transport: "https",
        connectAddress: "munjib.example.invalid",
        host: "munjib.example.invalid",
        path: "/api/auth/providers",
        tlsVerified: true,
        tlsServerName: "munjib.example.invalid",
        redirectCount: 0,
      },
    });
    expect(valid.ok).toBe(true);

    const wrongHost = evaluateEdgeProbe(contract, "public-https", {
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
      request: {
        method: "GET",
        credentials: "omit",
        authorizationHeaderPresent: false,
        cookieHeaderPresent: false,
        transport: "https",
        connectAddress: "munjib.example.invalid",
        host: "attacker.invalid",
        path: "/api/auth/providers",
        tlsVerified: true,
        tlsServerName: "munjib.example.invalid",
        redirectCount: 0,
      },
    });
    expect(wrongHost.ok).toBe(false);
    expect(wrongHost.reasons).toContain("REQUEST_HOST_MISMATCH");

    const wrongPath = evaluateEdgeProbe(contract, "public-https", {
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
      request: {
        method: "GET",
        credentials: "omit",
        authorizationHeaderPresent: false,
        cookieHeaderPresent: false,
        transport: "https",
        connectAddress: "munjib.example.invalid",
        host: "munjib.example.invalid",
        path: "/login",
        tlsVerified: true,
        tlsServerName: "munjib.example.invalid",
        redirectCount: 0,
      },
    });
    expect(wrongPath.ok).toBe(false);
    expect(wrongPath.reasons).toContain("REQUEST_PATH_MISMATCH");

    const wrongMethod = evaluateEdgeProbe(contract, "public-https", {
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
      request: {
        method: "POST",
        credentials: "omit",
        authorizationHeaderPresent: false,
        cookieHeaderPresent: false,
        transport: "https",
        connectAddress: "munjib.example.invalid",
        host: "munjib.example.invalid",
        path: "/api/auth/providers",
        tlsVerified: true,
        tlsServerName: "munjib.example.invalid",
        redirectCount: 0,
      },
    });
    expect(wrongMethod.ok).toBe(false);
    expect(wrongMethod.reasons).toContain("REQUEST_METHOD_MISMATCH");

    const credentialed = evaluateEdgeProbe(contract, "public-https", {
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
      request: {
        method: "GET",
        credentials: "include",
        authorizationHeaderPresent: true,
        cookieHeaderPresent: true,
        transport: "https",
        connectAddress: "munjib.example.invalid",
        host: "munjib.example.invalid",
        path: "/api/auth/providers",
        tlsVerified: true,
        tlsServerName: "munjib.example.invalid",
        redirectCount: 0,
      },
    });
    expect(credentialed.ok).toBe(false);
    expect(credentialed.reasons).toEqual(
      expect.arrayContaining(["REQUEST_CREDENTIALS_MISMATCH", "REQUEST_AUTHORIZATION_PRESENT", "REQUEST_COOKIE_PRESENT"]),
    );
  });

  it("pins the unknown-host negative probe to the canonical connect address", () => {
    const contract = parseEdgeBindingsContractJson(contractJson);
    const valid = evaluateEdgeProbe(contract, "unknown-host-rejection", {
      status: 421,
      latencyMs: 18,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "cache-control": "no-store" },
      request: {
        method: "GET",
        credentials: "omit",
        authorizationHeaderPresent: false,
        cookieHeaderPresent: false,
        transport: "https",
        connectAddress: "munjib.example.invalid",
        host: "unknown.invalid",
        path: "/api/auth/providers",
        tlsVerified: true,
        tlsServerName: "munjib.example.invalid",
        redirectCount: 0,
      },
    });
    expect(valid.ok).toBe(true);

    const directDns = evaluateEdgeProbe(contract, "unknown-host-rejection", {
      status: 421,
      latencyMs: 18,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "cache-control": "no-store" },
      request: {
        method: "GET",
        credentials: "omit",
        authorizationHeaderPresent: false,
        cookieHeaderPresent: false,
        transport: "https",
        connectAddress: "unknown.invalid",
        host: "unknown.invalid",
        path: "/api/auth/providers",
        tlsVerified: true,
        tlsServerName: "munjib.example.invalid",
        redirectCount: 0,
      },
    });
    expect(directDns.ok).toBe(false);
    expect(directDns.reasons).toContain("REQUEST_CONNECT_ADDRESS_MISMATCH");
  });

  it("returns a failure result instead of throwing on malformed observation values", () => {
    const contract = parseEdgeBindingsContractJson(contractJson);
    const malformedHeaders = evaluateEdgeProbe(contract, "public-https", {
      status: 200,
      latencyMs: 42,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: undefined as never,
      request: {
        method: "GET",
        credentials: "omit",
        authorizationHeaderPresent: false,
        cookieHeaderPresent: false,
        transport: "https",
        connectAddress: "munjib.example.invalid",
        host: "munjib.example.invalid",
        path: "/api/auth/providers",
        tlsVerified: true,
        tlsServerName: "munjib.example.invalid",
        redirectCount: 0,
      },
    });
    expect(malformedHeaders.ok).toBe(false);
    expect(malformedHeaders.reasons).toContain("HEADERS_INVALID");

    const paddedHeaderName = evaluateEdgeProbe(contract, "origin-loopback", {
      status: 200,
      latencyMs: 4,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { " Cache-Control ": "no-store" },
      request: requestFor("origin-loopback"),
    });
    expect(paddedHeaderName.ok).toBe(false);
    expect(paddedHeaderName.reasons).toContain("HEADERS_INVALID");

    const invalidHeaderName = evaluateEdgeProbe(contract, "origin-loopback", {
      status: 200,
      latencyMs: 4,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "bad header": "no-store" },
      request: requestFor("origin-loopback"),
    });
    expect(invalidHeaderName.ok).toBe(false);
    expect(invalidHeaderName.reasons).toContain("HEADERS_INVALID");

    const malformedHeaderValue = evaluateEdgeProbe(contract, "origin-loopback", {
      status: 200,
      latencyMs: 4,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "cache-control": "no-store", "x-extra": "ok\r\ninjected" },
      request: requestFor("origin-loopback"),
    });
    expect(malformedHeaderValue.ok).toBe(false);
    expect(malformedHeaderValue.reasons).toContain("HEADERS_INVALID");

    const quotedCacheControl = evaluateEdgeProbe(contract, "origin-loopback", {
      status: 200,
      latencyMs: 4,
      observedAt: "2026-07-13T00:00:00.000Z",
      headers: { "cache-control": 'foo="x,no-store,y"' },
      request: requestFor("origin-loopback"),
    });
    expect(quotedCacheControl.ok).toBe(false);
    expect(quotedCacheControl.reasons).toContain("CACHE_CONTROL_NO_STORE_MISSING");

    const unverifiedTls = evaluateEdgeProbe(contract, "public-https", {
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
      request: { ...requestFor("public-https"), tlsVerified: false },
    });
    expect(unverifiedTls.ok).toBe(false);
    expect(unverifiedTls.reasons).toContain("REQUEST_TLS_UNVERIFIED");

    const redirected = evaluateEdgeProbe(contract, "public-https", {
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
      request: { ...requestFor("public-https"), redirectCount: 1 },
    });
    expect(redirected.ok).toBe(false);
    expect(redirected.reasons).toContain("REQUEST_REDIRECTED");

    const malformedDateAndPath = evaluateEdgeProbe(contract, "public-https", {
      status: 200,
      latencyMs: 42,
      observedAt: Symbol("date") as never,
      headers: {},
      request: {
        method: "GET",
        credentials: "omit",
        authorizationHeaderPresent: false,
        cookieHeaderPresent: false,
        transport: "https",
        connectAddress: "munjib.example.invalid",
        host: "munjib.example.invalid",
        path: Symbol("path") as never,
        tlsVerified: true,
        tlsServerName: "munjib.example.invalid",
        redirectCount: 0,
      },
    });
    expect(malformedDateAndPath.ok).toBe(false);
    expect(malformedDateAndPath.reasons).toEqual(
      expect.arrayContaining(["OBSERVED_AT_INVALID", "REQUEST_PATH_INVALID"]),
    );
  });
});
