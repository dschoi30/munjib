import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveAnonymousTrialActor,
  resolveAnonymousTrialCapability,
  projectTrialAiAllowance,
  resolveTrialEntitlement,
  verifyTurnstileChallenge,
  type AnonymousTrialCapability,
} from "@/lib/auth/trial-entitlement";
import {
  TRIAL_VISITOR_COOKIE_NAME,
  issueTrialVisitorToken,
} from "@/lib/auth/trial-visitor";
import { GET as GET_ENTITLEMENT } from "@/app/api/trial/entitlement/route";

const now = new Date("2026-08-25T02:00:00.000Z");
const secretFiles = {
  "/run/secrets/munjib_trial_visitor_signing_key": "trial-current-signing-key",
  "/run/secrets/munjib_trial_visitor_previous_signing_key": "trial-previous-signing-key",
  "/run/secrets/munjib_trial_visitor_digest_key": "trial-visitor-digest-key",
  "/run/secrets/munjib_trial_network_bucket_key": "trial-network-bucket-key",
  "/run/secrets/munjib_trial_edge_proof_secret": "trial-edge-proof-secret",
  "/run/secrets/munjib_turnstile_secret": "turnstile-secret-value",
} as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Trial entitlement route", () => {
  it("returns one private no-store unavailable response while capability is closed", async () => {
    vi.stubEnv("MUNJIB_ANONYMOUS_TRIAL_ENABLED", "false");

    const response = await GET_ENTITLEMENT(new Request("https://munjib.example/api/trial/entitlement"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ code: "TRIAL_ENTITLEMENT_UNAVAILABLE" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("anonymous Trial runtime capability", () => {
  it("keeps production closed by default without reading any secret", () => {
    const readStrictSecretFile = vi.fn();

    expect(resolveAnonymousTrialCapability({
      MUNJIB_DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
    }, { readStrictSecretFile })).toBeNull();
    expect(readStrictSecretFile).not.toHaveBeenCalled();
  });

  it("keeps the capability closed until the global daily ceiling is a positive integer", () => {
    const readStrictSecretFile = vi.fn(({ path }: { path: string }) =>
      secretFiles[path as keyof typeof secretFiles],
    );
    const { MUNJIB_TRIAL_AI_GLOBAL_DAILY_LIMIT: _removed, ...missingLimit } = productionEnv();

    expect(resolveAnonymousTrialCapability(missingLimit, { readStrictSecretFile })).toBeNull();
    expect(resolveAnonymousTrialCapability({
      ...productionEnv(),
      MUNJIB_TRIAL_AI_GLOBAL_DAILY_LIMIT: "0",
    }, { readStrictSecretFile })).toBeNull();
  });

  it("keeps production closed when the signed edge-proof secret file is not configured", () => {
    const readStrictSecretFile = vi.fn(({ path }: { path: string }) =>
      secretFiles[path as keyof typeof secretFiles],
    );
    const { MUNJIB_TRIAL_EDGE_PROOF_SECRET_FILE: _removed, ...missingProofConfig } = productionEnv();

    expect(resolveAnonymousTrialCapability(missingProofConfig, { readStrictSecretFile })).toBeNull();
  });

  it("opens only with the exact demo workspace, trusted header, and fixed file-backed secrets", () => {
    const readStrictSecretFile = vi.fn(({ path }: { path: string }) => {
      const value = secretFiles[path as keyof typeof secretFiles];
      if (!value) throw new Error("unexpected secret path");
      return value;
    });

    const capability = resolveAnonymousTrialCapability(productionEnv(), { readStrictSecretFile });

    expect(capability).toMatchObject({
      capabilityId: "anonymous-trial-v1",
      demoWorkspaceId: "workspace-demo-1",
      demoWorkspaceSlug: "public-demo",
      trustedNetworkHeader: "x-munjib-trusted-client-ip",
      networkEvidence: {
        kind: "signed-edge-proof",
        secret: "trial-edge-proof-secret",
        maxSkewSeconds: 30,
      },
      visitorSigningKeys: ["trial-current-signing-key"],
      visitorDigestKey: "trial-visitor-digest-key",
      networkBucketKey: "trial-network-bucket-key",
      turnstile: {
        secret: "turnstile-secret-value",
        hostname: "munjib.example",
        action: "trial_entitlement",
        timeoutMs: 1_000,
      },
    });
    expect(readStrictSecretFile).toHaveBeenCalledTimes(5);
  });

  it("allows explicit local development activation without weakening production file requirements", () => {
    expect(resolveAnonymousTrialCapability({
      MUNJIB_DEPLOYMENT_ENV: "development",
      NODE_ENV: "production",
      NEXTAUTH_URL: "http://localhost:3000",
      MUNJIB_ANONYMOUS_TRIAL_ENABLED: "true",
      MUNJIB_TRIAL_AI_GLOBAL_DAILY_LIMIT: "100",
      MUNJIB_TRIAL_DEMO_WORKSPACE_ID: "workspace-demo-1",
      MUNJIB_TRIAL_DEMO_WORKSPACE_SLUG: "public-demo",
      MUNJIB_TRIAL_TRUSTED_NETWORK_HEADER: "x-munjib-trusted-client-ip",
      MUNJIB_TRIAL_DEV_TRUST_RAW_NETWORK_HEADER: "true",
      MUNJIB_TRIAL_VISITOR_SIGNING_KEY: "trial-current-signing-key",
      MUNJIB_TRIAL_VISITOR_DIGEST_KEY: "trial-visitor-digest-key",
      MUNJIB_TRIAL_NETWORK_BUCKET_KEY: "trial-network-bucket-key",
      MUNJIB_TURNSTILE_SECRET: "turnstile-secret-value",
      MUNJIB_TURNSTILE_HOSTNAME: "localhost",
      MUNJIB_TURNSTILE_ACTION: "trial_entitlement",
    })).toMatchObject({
      demoWorkspaceId: "workspace-demo-1",
      demoWorkspaceSlug: "public-demo",
      turnstile: { hostname: "localhost" },
    });
  });

  it("rejects direct production secrets and malformed workspace capability", () => {
    const readStrictSecretFile = vi.fn(({ path }: { path: string }) =>
      secretFiles[path as keyof typeof secretFiles],
    );

    expect(resolveAnonymousTrialCapability({
      ...productionEnv(),
      MUNJIB_TRIAL_VISITOR_SIGNING_KEY: "direct-secret-is-forbidden",
    }, { readStrictSecretFile })).toBeNull();
    expect(resolveAnonymousTrialCapability({
      ...productionEnv(),
      MUNJIB_TRIAL_DEMO_WORKSPACE_SLUG: "Public-Demo",
    }, { readStrictSecretFile })).toBeNull();
  });

  it("rejects a Turnstile hostname outside the canonical origin and invalid optional key rotation config", () => {
    const readStrictSecretFile = vi.fn(({ path }: { path: string }) =>
      secretFiles[path as keyof typeof secretFiles],
    );

    expect(resolveAnonymousTrialCapability({
      ...productionEnv(),
      MUNJIB_TURNSTILE_HOSTNAME: "other.example",
    }, { readStrictSecretFile })).toBeNull();
    expect(resolveAnonymousTrialCapability({
      ...productionEnv(),
      MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY: "forbidden-direct-previous-key",
    }, { readStrictSecretFile })).toBeNull();
    expect(resolveAnonymousTrialCapability({
      ...productionEnv(),
      MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY_FILE: "/run/secrets/wrong-file",
    }, { readStrictSecretFile })).toBeNull();
  });

  it("fails closed when a configured previous key cannot be read or runtime identity is invalid", () => {
    const env = {
      ...productionEnv(),
      MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY_FILE: "/run/secrets/munjib_trial_visitor_previous_signing_key",
    };
    const readStrictSecretFile = vi.fn(({ path }: { path: string }) => {
      if (path.endsWith("previous_signing_key")) throw new Error("unavailable");
      return secretFiles[path as keyof typeof secretFiles];
    });

    expect(resolveAnonymousTrialCapability(env, { readStrictSecretFile })).toBeNull();
    expect(resolveAnonymousTrialCapability({
      ...productionEnv(),
      MUNJIB_DEPLOYMENT_ENV: "preview",
    }, { readStrictSecretFile })).toBeNull();
  });

  it("requires a canonical cutoff for the previous verification key", () => {
    const readStrictSecretFile = vi.fn(({ path }: { path: string }) => {
      const value = secretFiles[path as keyof typeof secretFiles];
      if (!value) throw new Error("unavailable");
      return value;
    });
    const rotationEnv = {
      ...productionEnv(),
      MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY_FILE: "/run/secrets/munjib_trial_visitor_previous_signing_key",
    };

    expect(resolveAnonymousTrialCapability(rotationEnv, { readStrictSecretFile })).toBeNull();
    expect(resolveAnonymousTrialCapability({
      ...rotationEnv,
      MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY_CUTOFF: "2026-08-26T00:00:00.000Z",
    }, { readStrictSecretFile })).toMatchObject({
      visitorSigningKeys: ["trial-current-signing-key", "trial-previous-signing-key"],
      previousSigningKeyCutoff: "2026-08-26T00:00:00.000Z",
    });
  });

  it("rejects secret reuse across visitor signing, visitor digest, and network buckets", () => {
    const readStrictSecretFile = vi.fn(({ path }: { path: string }) => {
      if (path === "/run/secrets/munjib_trial_visitor_digest_key") return "trial-current-signing-key";
      return secretFiles[path as keyof typeof secretFiles];
    });

    expect(resolveAnonymousTrialCapability(productionEnv(), { readStrictSecretFile })).toBeNull();
  });
});

describe("anonymous Trial actor and entitlement", () => {
  it("projects only the public allowance needed to bootstrap Trial AI surfaces", () => {
    const projection = projectTrialAiAllowance({
      status: 200,
      body: {
        remaining: 2,
        limit: 3,
        resetsAt: "2026-08-25T15:00:00.000Z",
        entry: { path: "/trial/workspaces/public-demo" },
      },
    });

    expect(projection).toEqual({
      remaining: 2,
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    expect(JSON.stringify(projection)).not.toContain("workspace");
    expect(JSON.stringify(projection)).not.toContain("digest");
    expect(projectTrialAiAllowance({
      status: 200,
      body: {
        remaining: 3,
        limit: 3,
        resetsAt: "2026-08-25T15:00:00.000Z",
        challengeRequired: true,
      },
    })).toBeNull();
  });

  it("verifies capability, cookie token, and trusted network evidence together", () => {
    const capability = testCapability();
    const token = issueTrialVisitorToken({
      key: capability.visitorSigningKeys[0],
      now,
      randomBytesSource: (size) => new Uint8Array(size).fill(0xab),
    });
    const actor = resolveAnonymousTrialActor(request({ token }), capability, now);

    expect(actor).toEqual({
      admissionActor: {
        kind: "anonymous-trial",
        trialVisitorSubject: "1qy0UPa-aQlxk4Ej4w7HqQMmU37K7HcUWVH1w6MYUh8",
      },
      authorizationPrincipal: {
        kind: "anonymous-trial-demo",
        capabilityId: "anonymous-trial-v1",
        workspaceId: "workspace-demo-1",
        workspaceSlug: "public-demo",
        access: "viewer-only",
        trialVisitorSubject: "1qy0UPa-aQlxk4Ej4w7HqQMmU37K7HcUWVH1w6MYUh8",
      },
      networkBucketDigest: "ovzHjdOfkha42czGlhvmX6jJfCxmUmiRhHJcanA3wrE",
      kstDate: "2026-08-25",
    });
    expect(resolveAnonymousTrialActor(request({ token: `${token}tampered` }), capability, now)).toBeNull();
    expect(resolveAnonymousTrialActor(request({ token, network: undefined }), capability, now)).toBeNull();
  });

  it("rejects missing, spoofed, and stale production network evidence", () => {
    const capability = testCapability();
    const token = issueTrialVisitorToken({ key: capability.visitorSigningKeys[0], now });

    expect(resolveAnonymousTrialActor(request({ token, proof: "missing" }), capability, now)).toBeNull();
    expect(resolveAnonymousTrialActor(request({ token, proof: "spoofed" }), capability, now)).toBeNull();
    expect(resolveAnonymousTrialActor(request({ token, proof: "stale" }), capability, now)).toBeNull();
    expect(resolveAnonymousTrialActor(request({ token, network: "203.0.113.43" }), capability, now)).toBeNull();
  });

  it("rejects spoofed entitlement evidence before reading usage", async () => {
    const readUsage = vi.fn();

    await expect(resolveTrialEntitlement(request({ proof: "spoofed" }), {
      capability: testCapability(),
      now: () => now,
      store: { readUsage },
    })).resolves.toEqual({
      status: 503,
      body: { code: "TRIAL_ENTITLEMENT_UNAVAILABLE" },
    });
    expect(readUsage).not.toHaveBeenCalled();
  });

  it("accepts the previous signing key only before its strict cutoff", () => {
    const capability: AnonymousTrialCapability = {
      ...testCapability(),
      visitorSigningKeys: ["trial-current-signing-key", "trial-previous-signing-key"],
      previousSigningKeyCutoff: "2026-08-26T00:00:00.000Z",
    };
    const token = issueTrialVisitorToken({
      key: "trial-previous-signing-key",
      now,
    });

    expect(resolveAnonymousTrialActor(request({ token }), capability, now)).not.toBeNull();
    const afterCutoff = new Date("2026-08-26T00:00:00.000Z");
    expect(resolveAnonymousTrialActor(request({ token, proofNow: afterCutoff }), capability, afterCutoff)).toBeNull();
  });

  it("returns only public entitlement fields for an existing visitor", async () => {
    const capability = testCapability();
    const token = issueTrialVisitorToken({
      key: capability.visitorSigningKeys[0],
      now,
      randomBytesSource: (size) => new Uint8Array(size).fill(0xab),
    });

    const verifyChallenge = vi.fn();
    const result = await resolveTrialEntitlement(request({ token }), {
      capability,
      now: () => now,
      verifyChallenge,
      store: {
        readUsage: async () => ({ visitorAdmittedCount: 1, networkHasTraffic: true }),
      },
    });

    expect(result).toEqual({
      status: 200,
      body: {
        remaining: 2,
        limit: 3,
        resetsAt: "2026-08-25T15:00:00.000Z",
        entry: { path: "/trial/workspaces/public-demo" },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/visitor|network|subject|digest|token|workspaceId/i);
    expect(verifyChallenge).not.toHaveBeenCalled();
  });

  it("issues one secure opaque visitor cookie on a network with no prior Trial traffic", async () => {
    const result = await resolveTrialEntitlement(request({ method: "POST" }), {
      capability: testCapability(),
      now: () => now,
      randomBytesSource: (size) => new Uint8Array(size).fill(0xab),
      store: {
        readUsage: async () => ({ visitorAdmittedCount: 0, networkHasTraffic: false }),
      },
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      remaining: 3,
      limit: 3,
      resetsAt: "2026-08-25T15:00:00.000Z",
      entry: { path: "/trial/workspaces/public-demo" },
    });
    expect(result.setCookie).toMatch(new RegExp(`^${TRIAL_VISITOR_COOKIE_NAME}=[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{43};`));
    expect(result.setCookie).toContain("Max-Age=15552000");
    expect(result.setCookie).toContain("Path=/");
    expect(result.setCookie).toContain("HttpOnly");
    expect(result.setCookie).toContain("Secure");
    expect(result.setCookie).toContain("SameSite=Lax");
  });

  it("requires a one-attempt challenge before issuing another token on a used network", async () => {
    const verifyChallenge = vi.fn();
    const deps = {
      capability: testCapability(),
      now: () => now,
      store: {
        readUsage: async () => ({ visitorAdmittedCount: 0, networkHasTraffic: true }),
      },
      verifyChallenge,
    };

    const result = await resolveTrialEntitlement(request({ method: "POST" }), deps);

    expect(result).toEqual({
      status: 200,
      body: {
        remaining: 3,
        limit: 3,
        resetsAt: "2026-08-25T15:00:00.000Z",
        challengeRequired: true,
      },
    });
    expect(result).not.toHaveProperty("setCookie");
    expect(verifyChallenge).not.toHaveBeenCalled();
  });

  it("issues a token only after one successful challenge verification on a used network", async () => {
    const verifyChallenge = vi.fn(async () => true);
    const result = await resolveTrialEntitlement(request({
      method: "POST",
      challengeToken: "single-use-challenge",
    }), {
      capability: testCapability(),
      now: () => now,
      randomBytesSource: (size) => new Uint8Array(size).fill(0xab),
      store: {
        readUsage: async () => ({ visitorAdmittedCount: 0, networkHasTraffic: true }),
      },
      verifyChallenge,
    });

    expect(result.status).toBe(200);
    expect(result.setCookie).toContain(`${TRIAL_VISITOR_COOKIE_NAME}=`);
    expect(verifyChallenge).toHaveBeenCalledOnce();
    expect(verifyChallenge).toHaveBeenCalledWith("single-use-challenge", testCapability().turnstile);
    expect(JSON.stringify(result.body)).not.toContain("single-use-challenge");
  });

  it("rejects a malformed challenge before the external verifier seam", async () => {
    const verifyChallenge = vi.fn(async () => true);
    const result = await resolveTrialEntitlement(request({
      method: "POST",
      challengeToken: "   ",
    }), {
      capability: testCapability(),
      now: () => now,
      store: {
        readUsage: async () => ({ visitorAdmittedCount: 0, networkHasTraffic: true }),
      },
      verifyChallenge,
    });

    expect(result).toEqual({ status: 403, body: { code: "TRIAL_CHALLENGE_INVALID" } });
    expect(result).not.toHaveProperty("setCookie");
    expect(verifyChallenge).not.toHaveBeenCalled();
  });
});

describe("Turnstile verification", () => {
  it("accepts only an exact hostname and action", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      hostname: "munjib.example",
      action: "trial_entitlement",
    }), { status: 200 }));

    await expect(verifyTurnstileChallenge("challenge-token", testCapability().turnstile, { fetchImpl })).resolves.toBe(true);

    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      hostname: "evil.example",
      action: "trial_entitlement",
    }), { status: 200 }));
    await expect(verifyTurnstileChallenge("challenge-token", testCapability().turnstile, { fetchImpl })).resolves.toBe(false);

    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      hostname: "munjib.example",
      action: "login",
    }), { status: 200 }));
    await expect(verifyTurnstileChallenge("challenge-token", testCapability().turnstile, { fetchImpl })).resolves.toBe(false);

    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      hostname: "munjib.example",
      action: "login",
    }), { status: 200 }));
    await expect(verifyTurnstileChallenge("challenge-token", {
      ...testCapability().turnstile,
      action: "login",
    }, { fetchImpl })).resolves.toBe(false);
  });

  it("aborts a stalled verifier within the configured bound without logging the challenge", async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const pending = verifyTurnstileChallenge("never-log-this-challenge", {
      ...testCapability().turnstile,
      timeoutMs: 25,
    }, { fetchImpl });

    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toBe(false);
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("cancels the Turnstile response stream as soon as it exceeds 8 KiB", async () => {
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(new Uint8Array(8_193).fill(0x20));
          return;
        }
        controller.error(new Error("verifier read beyond bound"));
      },
      cancel() {
        cancelled = true;
      },
    }, { highWaterMark: 0 });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));

    await expect(verifyTurnstileChallenge(
      "challenge-token",
      testCapability().turnstile,
      { fetchImpl },
    )).resolves.toBe(false);

    expect(pulls).toBe(1);
    expect(cancelled).toBe(true);
  });
});

function productionEnv() {
  return {
    MUNJIB_DEPLOYMENT_ENV: "production",
    NODE_ENV: "production",
    MUNJIB_ANONYMOUS_TRIAL_ENABLED: "true",
    MUNJIB_TRIAL_AI_GLOBAL_DAILY_LIMIT: "100",
    NEXTAUTH_URL: "https://munjib.example",
    MUNJIB_TRIAL_DEMO_WORKSPACE_ID: "workspace-demo-1",
    MUNJIB_TRIAL_DEMO_WORKSPACE_SLUG: "public-demo",
    MUNJIB_TRIAL_TRUSTED_NETWORK_HEADER: "x-munjib-trusted-client-ip",
    MUNJIB_TRIAL_VISITOR_SIGNING_KEY_FILE: "/run/secrets/munjib_trial_visitor_signing_key",
    MUNJIB_TRIAL_VISITOR_DIGEST_KEY_FILE: "/run/secrets/munjib_trial_visitor_digest_key",
    MUNJIB_TRIAL_NETWORK_BUCKET_KEY_FILE: "/run/secrets/munjib_trial_network_bucket_key",
    MUNJIB_TRIAL_EDGE_PROOF_SECRET_FILE: "/run/secrets/munjib_trial_edge_proof_secret",
    MUNJIB_TURNSTILE_SECRET_FILE: "/run/secrets/munjib_turnstile_secret",
    MUNJIB_TURNSTILE_HOSTNAME: "munjib.example",
    MUNJIB_TURNSTILE_ACTION: "trial_entitlement",
  };
}

function testCapability(): AnonymousTrialCapability {
  return {
    capabilityId: "anonymous-trial-v1",
    demoWorkspaceId: "workspace-demo-1",
    demoWorkspaceSlug: "public-demo",
    trustedNetworkHeader: "x-munjib-trusted-client-ip",
    networkEvidence: {
      kind: "signed-edge-proof",
      secret: "trial-edge-proof-secret",
      maxSkewSeconds: 30,
    },
    visitorSigningKeys: ["trial-current-signing-key"],
    visitorDigestKey: "trial-visitor-digest-key",
    networkBucketKey: "trial-network-bucket-key",
    turnstile: {
      secret: "turnstile-secret-value",
      hostname: "munjib.example",
      action: "trial_entitlement",
      timeoutMs: 1_000,
    },
  };
}

function request(options: {
  method?: "GET" | "POST";
  token?: string;
  network?: string;
  challengeToken?: string;
  proof?: "valid" | "missing" | "spoofed" | "stale";
  proofNow?: Date;
} = {}) {
  const headers = new Headers();
  if (options.token) headers.set("cookie", `${TRIAL_VISITOR_COOKIE_NAME}=${options.token}`);
  if (options.network !== undefined) {
    headers.set("x-munjib-trusted-client-ip", options.network);
  } else if (!("network" in options)) {
    headers.set("x-munjib-trusted-client-ip", "203.0.113.42");
  }
  if (options.proof !== "missing" && headers.has("x-munjib-trusted-client-ip")) {
    const proofNow = options.proofNow ?? now;
    const timestamp = options.proof === "stale"
      ? Math.floor(proofNow.getTime() / 1_000) - 31
      : Math.floor(proofNow.getTime() / 1_000);
    const method = options.method ?? "GET";
    const proof = options.proof === "spoofed"
      ? "A".repeat(43)
      : edgeProof({
          timestamp,
          method,
          path: "/api/trial/entitlement",
          normalizedIp: "v4:203.0.113.42",
        });
    headers.set("x-munjib-trusted-network-timestamp", timestamp.toString(10));
    headers.set("x-munjib-trusted-network-proof", proof);
  }
  if (options.challengeToken) headers.set("content-type", "application/json");
  return new Request("https://munjib.example/api/trial/entitlement", {
    method: options.method ?? "GET",
    headers,
    body: options.challengeToken ? JSON.stringify({ challengeToken: options.challengeToken }) : undefined,
  });
}

function edgeProof(input: { timestamp: number; method: string; path: string; normalizedIp: string }) {
  return createHmac("sha256", "trial-edge-proof-secret")
    .update("munjib/trial-network-evidence/v1\0")
    .update(input.timestamp.toString(10))
    .update("\0")
    .update(input.method)
    .update("\0")
    .update(input.path)
    .update("\0")
    .update(input.normalizedIp)
    .digest("base64url");
}
