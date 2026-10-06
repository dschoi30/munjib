import { createHmac } from "node:crypto";
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

  it.each([false, true])("returns a viewer-only anonymous principal with coexisting login %s", async (coexistingLogin) => {
    const capability = testCapability();
    const token = issueTrialVisitorToken({
      key: capability.visitorSigningKeys[0],
      now,
      randomBytesSource: (size) => new Uint8Array(size).fill(0xab),
    });
    const request = new Request("https://munjib.example/api/ai", {
      headers: {
        cookie: `munjib.trial-visitor=${token}`,
        ...(coexistingLogin ? { "x-munjib-ai-mode": "anonymous-trial-readonly" } : {}),
        "x-munjib-trusted-client-ip": "203.0.113.42",
        "x-munjib-trusted-network-timestamp": "1787623200",
        "x-munjib-trusted-network-proof": edgeProof("GET", "/api/ai"),
      },
    });

    const actor = await requireAiActor(request, {
      getCurrentUser: async () => coexistingLogin ? {id:"user-1",email:"user@example.com"} : null,
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
        workspaceId: "workspace-demo-1",
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

  it("does not fall back to an authenticated owner when explicit Trial evidence is invalid", async () => {
    await expect(requireAiActor(new Request("https://munjib.example/api/ai", {
      headers: {"x-munjib-ai-mode":"anonymous-trial-readonly"},
    }), {
      getCurrentUser: async () => ({id:"owner",email:"owner@example.com"}),
      resolveAnonymousTrialActor: () => null,
      resolveCapability: () => null,
      onUnauthenticated: () => {throw new Error("AI_ACTOR_REQUIRED");},
    })).rejects.toThrow("AI_ACTOR_REQUIRED");
  });

  it("fails closed instead of mapping a forged visitor token to a legacy or shared user", async () => {
    const capability = testCapability();
    const request = new Request("https://munjib.example/api/ai", {
      headers: {
        cookie: "munjib.trial-visitor=forged.token",
        "x-munjib-trusted-client-ip": "203.0.113.42",
        "x-munjib-trusted-network-timestamp": "1787623200",
        "x-munjib-trusted-network-proof": edgeProof("GET", "/api/ai"),
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
      workspaceId: "workspace-demo-1",
      workspaceSlug: "public-demo",
      access: "viewer-only" as const,
      trialVisitorSubject: "visitor-subject-1",
    };

    expect(resolveAiWorkspaceAuthorization(principal, {
      id: "workspace-demo-1",
      slug: "public-demo",
    })).toEqual({
      kind: "anonymous-trial-demo",
      role: "VIEWER",
      userGrantSubjectId: null,
      conversationPersistence: "visitor-keyed-or-stateless",
      trialVisitorSubject: "visitor-subject-1",
    });
    expect(resolveAiWorkspaceAuthorization(principal, {
      id: "workspace-other-1",
      slug: "another-workspace",
    })).toBeNull();
  });

  it("rejects a cross-organization workspace row even when its slug matches the demo", () => {
    const principal = {
      kind: "anonymous-trial-demo" as const,
      capabilityId: "anonymous-trial-v1" as const,
      workspaceId: "workspace-demo-1",
      workspaceSlug: "public-demo",
      access: "viewer-only" as const,
      trialVisitorSubject: "visitor-subject-1",
    };

    expect(resolveAiWorkspaceAuthorization(principal, {
      id: "workspace-other-org-9",
      slug: "public-demo",
    })).toBeNull();
  });
});

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

function edgeProof(method: string, path: string) {
  return createHmac("sha256", "trial-edge-proof-secret")
    .update("munjib/trial-network-evidence/v1\0")
    .update("1787623200\0")
    .update(method)
    .update("\0")
    .update(path)
    .update("\0v4:203.0.113.42")
    .digest("base64url");
}
