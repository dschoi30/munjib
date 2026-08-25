import { describe, expect, it, vi } from "vitest";
import { issueTrialVisitorToken } from "@/lib/auth/trial-visitor";
import { requireAiActor } from "@/lib/auth/session";
import type { AnonymousTrialCapability } from "@/lib/auth/trial-entitlement";
import { resolveAiWorkspaceAuthorization } from "@/lib/auth/trial-entitlement";

const now = new Date("2026-08-25T02:00:00.000Z");

describe("AI route actor isolation", () => {
  it("preserves an authenticated user as the existing user authorization principal", async () => {
    const resolveAnonymousTrialActor = vi.fn();

    const actor = await requireAiActor(new Request("https://munjib.example/api/ai"), {
      getCurrentUser: async () => ({ id: "user-1", email: "user@example.com" }),
      resolveAnonymousTrialActor,
      now: () => now,
    });

    expect(actor).toEqual({
      admissionActor: { kind: "authenticated-user", userId: "user-1" },
      authorizationPrincipal: { kind: "user", userId: "user-1" },
      kstDate: "2026-08-25",
    });
    expect(resolveAnonymousTrialActor).not.toHaveBeenCalled();
  });

  it("returns a viewer-only anonymous principal for only the exact capability workspace", async () => {
    const capability = testCapability();
    const token = issueTrialVisitorToken({
      key: capability.visitorSigningKeys[0],
      now,
      randomBytesSource: (size) => new Uint8Array(size).fill(0xab),
    });
    const request = new Request("https://munjib.example/api/ai", {
      headers: {
        cookie: `munjib.trial-visitor=${token}`,
        "x-munjib-trusted-client-ip": "203.0.113.42",
      },
    });

    const actor = await requireAiActor(request, {
      getCurrentUser: async () => null,
      resolveAnonymousTrialActor: undefined,
      resolveCapability: () => capability,
      now: () => now,
    });

    expect(actor).toEqual({
      admissionActor: {
        kind: "anonymous-trial",
        trialVisitorSubject: "1qy0UPa-aQlxk4Ej4w7HqQMmU37K7HcUWVH1w6MYUh8",
      },
      authorizationPrincipal: {
        kind: "anonymous-trial-demo",
        capabilityId: "anonymous-trial-v1",
        workspaceSlug: "public-demo",
        access: "viewer-only",
        trialVisitorSubject: "1qy0UPa-aQlxk4Ej4w7HqQMmU37K7HcUWVH1w6MYUh8",
      },
      networkBucketDigest: "ovzHjdOfkha42czGlhvmX6jJfCxmUmiRhHJcanA3wrE",
      kstDate: "2026-08-25",
    });
    expect(actor.authorizationPrincipal).not.toHaveProperty("userId");
    expect(JSON.stringify(actor)).not.toContain("legacy-account-2@example.invalid");
  });

  it("fails closed instead of mapping a forged visitor token to a legacy or shared user", async () => {
    const capability = testCapability();
    const request = new Request("https://munjib.example/api/ai", {
      headers: {
        cookie: "munjib.trial-visitor=forged.token",
        "x-munjib-trusted-client-ip": "203.0.113.42",
      },
    });

    await expect(requireAiActor(request, {
      getCurrentUser: async () => null,
      resolveAnonymousTrialActor: undefined,
      resolveCapability: () => capability,
      now: () => now,
      onUnauthenticated: () => {
        throw new Error("AI_ACTOR_REQUIRED");
      },
    })).rejects.toThrow("AI_ACTOR_REQUIRED");
  });

  it("authorizes anonymous reads only as viewer on the exact demo workspace without USER grants", async () => {
    const principal = {
      kind: "anonymous-trial-demo" as const,
      capabilityId: "anonymous-trial-v1" as const,
      workspaceSlug: "public-demo",
      access: "viewer-only" as const,
      trialVisitorSubject: "visitor-subject-1",
    };

    expect(resolveAiWorkspaceAuthorization(principal, "public-demo")).toEqual({
      kind: "anonymous-trial-demo",
      role: "VIEWER",
      userGrantSubjectId: null,
      conversationPersistence: "visitor-keyed-or-stateless",
      trialVisitorSubject: "visitor-subject-1",
    });
    expect(resolveAiWorkspaceAuthorization(principal, "another-workspace")).toBeNull();
  });
});

function testCapability(): AnonymousTrialCapability {
  return {
    capabilityId: "anonymous-trial-v1",
    demoWorkspaceSlug: "public-demo",
    trustedNetworkHeader: "x-munjib-trusted-client-ip",
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
