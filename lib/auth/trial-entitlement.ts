import { createHmac, timingSafeEqual } from "node:crypto";
import type { TrialAiAdmissionInput } from "@/lib/rag/trial-ai-admission";
import { prisma } from "@/lib/db/client";
import {
  issueTrialVisitorToken,
  serializeTrialVisitorCookie,
  TRIAL_VISITOR_COOKIE_NAME,
  verifyTrialVisitorToken,
  type RandomBytesSource,
} from "@/lib/auth/trial-visitor";
import {
  deriveTrialNetworkBucket,
  normalizeTrialNetworkInput,
  resolveKstUsageWindow,
} from "@/lib/security/trial-network-bucket";
import {
  readStrictSecretFile,
  type StrictSecretFileInput,
} from "@/lib/security/strict-secret-file";

const CAPABILITY_ID = "anonymous-trial-v1" as const;
const TRUSTED_NETWORK_HEADER = "x-munjib-trusted-client-ip";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 1_000;
const TURNSTILE_ACTION = "trial_entitlement";
const VISITOR_DAILY_LIMIT = 3 as const;
const MAX_CHALLENGE_TOKEN_BYTES = 2_048;
const MAX_TURNSTILE_RESPONSE_BYTES = 8_192;
const NETWORK_EVIDENCE_DOMAIN = "munjib/trial-network-evidence/v1\0";
const NETWORK_EVIDENCE_MAX_SKEW_SECONDS = 30;
const NETWORK_TIMESTAMP_HEADER = "x-munjib-trusted-network-timestamp";
const NETWORK_PROOF_HEADER = "x-munjib-trusted-network-proof";

export const TRIAL_VISITOR_SIGNING_KEY_PATH = "/run/secrets/munjib_trial_visitor_signing_key";
export const TRIAL_VISITOR_PREVIOUS_SIGNING_KEY_PATH = "/run/secrets/munjib_trial_visitor_previous_signing_key";
export const TRIAL_VISITOR_DIGEST_KEY_PATH = "/run/secrets/munjib_trial_visitor_digest_key";
export const TRIAL_NETWORK_BUCKET_KEY_PATH = "/run/secrets/munjib_trial_network_bucket_key";
export const TRIAL_EDGE_PROOF_SECRET_PATH = "/run/secrets/munjib_trial_edge_proof_secret";
export const TURNSTILE_SECRET_PATH = "/run/secrets/munjib_turnstile_secret";

export type TurnstileRuntime = Readonly<{
  secret: string;
  hostname: string;
  action: string;
  timeoutMs: number;
}>;

export type AnonymousTrialCapability = Readonly<{
  capabilityId: typeof CAPABILITY_ID;
  demoWorkspaceId: string;
  demoWorkspaceSlug: string;
  trustedNetworkHeader: typeof TRUSTED_NETWORK_HEADER;
  networkEvidence:
    | Readonly<{
        kind: "signed-edge-proof";
        secret: string;
        maxSkewSeconds: typeof NETWORK_EVIDENCE_MAX_SKEW_SECONDS;
      }>
    | Readonly<{ kind: "development-raw" }>;
  visitorSigningKeys: readonly [string, ...string[]];
  previousSigningKeyCutoff?: string;
  visitorDigestKey: string;
  networkBucketKey: string;
  turnstile: TurnstileRuntime;
}>;

export type AiAuthorizationPrincipal =
  | Readonly<{ kind: "user"; userId: string }>
  | Readonly<{
      kind: "anonymous-trial-demo";
      capabilityId: typeof CAPABILITY_ID;
      workspaceId: string;
      workspaceSlug: string;
      access: "viewer-only";
      trialVisitorSubject: string;
    }>;

export type AiWorkspaceAuthorization =
  | Readonly<{ kind: "user"; userId: string }>
  | Readonly<{
      kind: "anonymous-trial-demo";
      role: "VIEWER";
      userGrantSubjectId: null;
      conversationPersistence: "visitor-keyed-or-stateless";
      trialVisitorSubject: string;
    }>;

export type AiRouteActor = Readonly<{
  admissionActor: TrialAiAdmissionInput["actor"];
  authorizationPrincipal: AiAuthorizationPrincipal;
  networkBucketDigest?: string;
  kstDate: string;
}>;

/**
 * Projects a route principal into the existing workspace authorization layer.
 * Trial callers must not query USER grants or persist under a shared User row.
 */
export function resolveAiWorkspaceAuthorization(
  principal: AiAuthorizationPrincipal,
  resolvedWorkspace: Readonly<{ id: string; slug: string }>,
): AiWorkspaceAuthorization | null {
  if (principal.kind === "user") return { kind: "user", userId: principal.userId };
  if (resolvedWorkspace.id !== principal.workspaceId) return null;
  return {
    kind: "anonymous-trial-demo",
    role: "VIEWER",
    userGrantSubjectId: null,
    conversationPersistence: "visitor-keyed-or-stateless",
    trialVisitorSubject: principal.trialVisitorSubject,
  };
}

export type AnonymousTrialCapabilityDependencies = Readonly<{
  readStrictSecretFile: (input: StrictSecretFileInput) => string;
}>;

export type TrialEntitlementStore = Readonly<{
  readUsage(input: Readonly<{
    visitorDigest?: string;
    networkDigest: string;
    kstDate: string;
  }>): Promise<Readonly<{ visitorAdmittedCount: number; networkHasTraffic: boolean }>>;
}>;

export type TrialEntitlementResult = Readonly<{
  status: number;
  body:
    | Readonly<{
        remaining: number;
        limit: 3;
        resetsAt: string;
        entry: Readonly<{ path: string }>;
      }>
    | Readonly<{
        remaining: number;
        limit: 3;
        resetsAt: string;
        challengeRequired: true;
      }>
    | Readonly<{ code: "TRIAL_ENTITLEMENT_UNAVAILABLE" | "TRIAL_CHALLENGE_INVALID" }>;
  setCookie?: string;
}>;

type TrialEntitlementDependencies = Readonly<{
  capability?: AnonymousTrialCapability | null;
  now?: () => Date;
  store?: TrialEntitlementStore;
  randomBytesSource?: RandomBytesSource;
  verifyChallenge?: (token: string, runtime: TurnstileRuntime) => Promise<boolean>;
}>;

type TurnstileDependencies = Readonly<{
  fetchImpl?: typeof fetch;
}>;

function effectiveUid(): number {
  if (typeof process.geteuid === "function") return process.geteuid();
  if (typeof process.getuid === "function") return process.getuid();
  return 0;
}

function exactEnabled(value: string | undefined): boolean {
  return value === "true";
}

function validWorkspaceSlug(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function validWorkspaceId(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

function validHostname(value: string | undefined): value is string {
  if (typeof value !== "string" || value !== value.toLowerCase() || value.length > 253) return false;
  if (value === "localhost") return true;
  if (value.startsWith(".") || value.endsWith(".")) return false;
  return value.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function validSecret(value: string | undefined): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 256 && value === value.trim() &&
    !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value);
}

function canonicalTimestamp(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== value) return undefined;
  return value;
}

function readCapabilitySecret(
  env: Record<string, string | undefined>,
  deps: AnonymousTrialCapabilityDependencies,
  input: Readonly<{
    directName: string;
    fileName: string;
    exactPath: string;
    logicalName: string;
    strict: boolean;
    optional?: boolean;
  }>,
): string | undefined {
  if (input.strict) {
    if (env[input.directName] !== undefined) return undefined;
    const configuredPath = env[input.fileName];
    if (input.optional && configuredPath === undefined) return undefined;
    if (configuredPath !== input.exactPath) return undefined;
    try {
      return deps.readStrictSecretFile({
        logicalName: input.logicalName,
        path: input.exactPath,
        expectedUid: effectiveUid(),
        maximumBytes: 256,
      });
    } catch {
      return undefined;
    }
  }
  if (env[input.fileName] !== undefined) return undefined;
  return env[input.directName];
}

/** Resolves the server-owned, exact-workspace Trial capability; every invalid or incomplete state is closed. */
export function resolveAnonymousTrialCapability(
  env: Record<string, string | undefined> = process.env,
  deps: AnonymousTrialCapabilityDependencies = { readStrictSecretFile },
): AnonymousTrialCapability | null {
  if (!exactEnabled(env.MUNJIB_ANONYMOUS_TRIAL_ENABLED)) return null;
  if (!/^[1-9]\d{0,8}$/.test(env.MUNJIB_TRIAL_AI_GLOBAL_DAILY_LIMIT ?? "")) return null;
  if (!validWorkspaceId(env.MUNJIB_TRIAL_DEMO_WORKSPACE_ID)) return null;
  if (!validWorkspaceSlug(env.MUNJIB_TRIAL_DEMO_WORKSPACE_SLUG)) return null;
  if (env.MUNJIB_TRIAL_TRUSTED_NETWORK_HEADER !== TRUSTED_NETWORK_HEADER) return null;
  if (!validHostname(env.MUNJIB_TURNSTILE_HOSTNAME)) return null;
  if (env.MUNJIB_TURNSTILE_ACTION !== TURNSTILE_ACTION) return null;

  const deployment = env.MUNJIB_DEPLOYMENT_ENV?.trim().toLowerCase();
  if (deployment !== "development" && deployment !== "staging" && deployment !== "production") return null;
  const strict = deployment === "production" || deployment === "staging";
  if (strict && env.MUNJIB_TURNSTILE_HOSTNAME === "localhost") return null;
  let canonicalOrigin: URL;
  try {
    canonicalOrigin = new URL(env.NEXTAUTH_URL ?? "");
  } catch {
    return null;
  }
  if (
    canonicalOrigin.hostname !== env.MUNJIB_TURNSTILE_HOSTNAME ||
    canonicalOrigin.pathname !== "/" ||
    canonicalOrigin.search !== "" ||
    canonicalOrigin.hash !== "" ||
    canonicalOrigin.username !== "" ||
    canonicalOrigin.password !== "" ||
    (strict && canonicalOrigin.protocol !== "https:")
  ) return null;
  if (
    strict &&
    (env.MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY !== undefined ||
      (env.MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY_FILE !== undefined &&
        env.MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY_FILE !== TRIAL_VISITOR_PREVIOUS_SIGNING_KEY_PATH))
  ) return null;
  const currentSigningKey = readCapabilitySecret(env, deps, {
    directName: "MUNJIB_TRIAL_VISITOR_SIGNING_KEY",
    fileName: "MUNJIB_TRIAL_VISITOR_SIGNING_KEY_FILE",
    exactPath: TRIAL_VISITOR_SIGNING_KEY_PATH,
    logicalName: "MUNJIB_TRIAL_VISITOR_SIGNING_KEY",
    strict,
  });
  const previousSigningKey = readCapabilitySecret(env, deps, {
    directName: "MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY",
    fileName: "MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY_FILE",
    exactPath: TRIAL_VISITOR_PREVIOUS_SIGNING_KEY_PATH,
    logicalName: "MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY",
    strict,
    optional: true,
  });
  const previousSigningKeyConfigured = strict
    ? env.MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY_FILE !== undefined
    : env.MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY !== undefined;
  const previousSigningKeyCutoff = canonicalTimestamp(
    env.MUNJIB_TRIAL_VISITOR_PREVIOUS_SIGNING_KEY_CUTOFF,
  );
  const visitorDigestKey = readCapabilitySecret(env, deps, {
    directName: "MUNJIB_TRIAL_VISITOR_DIGEST_KEY",
    fileName: "MUNJIB_TRIAL_VISITOR_DIGEST_KEY_FILE",
    exactPath: TRIAL_VISITOR_DIGEST_KEY_PATH,
    logicalName: "MUNJIB_TRIAL_VISITOR_DIGEST_KEY",
    strict,
  });
  const networkBucketKey = readCapabilitySecret(env, deps, {
    directName: "MUNJIB_TRIAL_NETWORK_BUCKET_KEY",
    fileName: "MUNJIB_TRIAL_NETWORK_BUCKET_KEY_FILE",
    exactPath: TRIAL_NETWORK_BUCKET_KEY_PATH,
    logicalName: "MUNJIB_TRIAL_NETWORK_BUCKET_KEY",
    strict,
  });
  const edgeProofSecret = strict
    ? readCapabilitySecret(env, deps, {
        directName: "MUNJIB_TRIAL_EDGE_PROOF_SECRET",
        fileName: "MUNJIB_TRIAL_EDGE_PROOF_SECRET_FILE",
        exactPath: TRIAL_EDGE_PROOF_SECRET_PATH,
        logicalName: "MUNJIB_TRIAL_EDGE_PROOF_SECRET",
        strict,
      })
    : undefined;
  const turnstileSecret = readCapabilitySecret(env, deps, {
    directName: "MUNJIB_TURNSTILE_SECRET",
    fileName: "MUNJIB_TURNSTILE_SECRET_FILE",
    exactPath: TURNSTILE_SECRET_PATH,
    logicalName: "MUNJIB_TURNSTILE_SECRET",
    strict,
  });

  if (
    !validSecret(currentSigningKey) ||
    (previousSigningKeyConfigured && !validSecret(previousSigningKey)) ||
    !validSecret(visitorDigestKey) ||
    !validSecret(networkBucketKey) ||
    (strict && !validSecret(edgeProofSecret)) ||
    !validSecret(turnstileSecret)
  ) return null;
  if (previousSigningKeyConfigured !== (previousSigningKeyCutoff !== undefined)) return null;
  if (!strict && env.MUNJIB_TRIAL_DEV_TRUST_RAW_NETWORK_HEADER !== "true") return null;
  if (!strict && (
    env.MUNJIB_TRIAL_EDGE_PROOF_SECRET !== undefined ||
    env.MUNJIB_TRIAL_EDGE_PROOF_SECRET_FILE !== undefined
  )) return null;
  const distinctSecrets = [
    currentSigningKey,
    previousSigningKey,
    visitorDigestKey,
    networkBucketKey,
    edgeProofSecret,
    turnstileSecret,
  ].filter((value): value is string => value !== undefined);
  if (new Set(distinctSecrets).size !== distinctSecrets.length) return null;

  const visitorSigningKeys = previousSigningKey
    ? [currentSigningKey, previousSigningKey] as const
    : [currentSigningKey] as const;
  return {
    capabilityId: CAPABILITY_ID,
    demoWorkspaceId: env.MUNJIB_TRIAL_DEMO_WORKSPACE_ID,
    demoWorkspaceSlug: env.MUNJIB_TRIAL_DEMO_WORKSPACE_SLUG,
    trustedNetworkHeader: TRUSTED_NETWORK_HEADER,
    networkEvidence: strict
      ? {
          kind: "signed-edge-proof",
          secret: edgeProofSecret!,
          maxSkewSeconds: NETWORK_EVIDENCE_MAX_SKEW_SECONDS,
        }
      : { kind: "development-raw" },
    visitorSigningKeys,
    ...(previousSigningKeyCutoff ? { previousSigningKeyCutoff } : {}),
    visitorDigestKey,
    networkBucketKey,
    turnstile: {
      secret: turnstileSecret,
      hostname: env.MUNJIB_TURNSTILE_HOSTNAME,
      action: env.MUNJIB_TURNSTILE_ACTION,
      timeoutMs: TURNSTILE_TIMEOUT_MS,
    },
  };
}

function requestCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  const matches = cookieHeader.split(";").map((item) => item.trim()).filter((item) => item.startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  const value = matches[0].slice(name.length + 1);
  return value || undefined;
}

function trustedNetworkDigest(
  request: Request,
  capability: AnonymousTrialCapability,
  kstDate: string,
  now: Date,
): string | null {
  const networkInput = request.headers.get(capability.trustedNetworkHeader);
  if (!networkInput || networkInput !== networkInput.trim()) return null;
  try {
    if (capability.networkEvidence.kind === "signed-edge-proof") {
      const rawTimestamp = request.headers.get(NETWORK_TIMESTAMP_HEADER);
      const receivedProof = request.headers.get(NETWORK_PROOF_HEADER);
      if (!rawTimestamp || !/^[1-9]\d{9}$/.test(rawTimestamp)) return null;
      if (!receivedProof || !/^[A-Za-z0-9_-]{43}$/.test(receivedProof)) return null;
      const timestamp = Number(rawTimestamp);
      const nowSeconds = Math.floor(now.getTime() / 1_000);
      if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(nowSeconds)) return null;
      if (Math.abs(nowSeconds - timestamp) > capability.networkEvidence.maxSkewSeconds) return null;
      const method = request.method;
      const path = new URL(request.url).pathname;
      if (!/^[A-Z]{3,10}$/.test(method) || path.length < 1 || path.length > 2_048) return null;
      const normalizedIp = normalizeTrialNetworkInput(networkInput);
      const expectedProof = createHmac("sha256", capability.networkEvidence.secret)
        .update(NETWORK_EVIDENCE_DOMAIN)
        .update(rawTimestamp)
        .update("\0")
        .update(method)
        .update("\0")
        .update(path)
        .update("\0")
        .update(normalizedIp)
        .digest();
      const receivedProofBytes = Buffer.from(receivedProof, "base64url");
      if (
        receivedProofBytes.length !== expectedProof.length ||
        !timingSafeEqual(receivedProofBytes, expectedProof)
      ) return null;
    }
    return deriveTrialNetworkBucket(networkInput, kstDate, capability.networkBucketKey);
  } catch {
    return null;
  }
}

/** Resolves no User identity: the capability grants viewer-only access to one exact demo workspace. */
export function resolveAnonymousTrialActor(
  request: Request,
  capability: AnonymousTrialCapability | null = resolveAnonymousTrialCapability(),
  now: Date = new Date(),
): AiRouteActor | null {
  if (!capability) return null;
  const { kstDate } = resolveKstUsageWindow(now);
  const networkBucketDigest = trustedNetworkDigest(request, capability, kstDate, now);
  if (!networkBucketDigest) return null;
  const verification = verifyTrialVisitorToken(
    requestCookie(request, TRIAL_VISITOR_COOKIE_NAME),
    capability.visitorSigningKeys.length === 2 &&
      capability.previousSigningKeyCutoff !== undefined &&
      now.getTime() < new Date(capability.previousSigningKeyCutoff).getTime()
      ? capability.visitorSigningKeys
      : [capability.visitorSigningKeys[0]],
    { now, visitorDigestKey: capability.visitorDigestKey },
  );
  if (!verification.ok) return null;
  return {
    admissionActor: {
      kind: "anonymous-trial",
      trialVisitorSubject: verification.trialVisitorSubject,
    },
    authorizationPrincipal: {
      kind: "anonymous-trial-demo",
      capabilityId: capability.capabilityId,
      workspaceId: capability.demoWorkspaceId,
      workspaceSlug: capability.demoWorkspaceSlug,
      access: "viewer-only",
      trialVisitorSubject: verification.trialVisitorSubject,
    },
    networkBucketDigest,
    kstDate,
  };
}

function validChallengeToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CHALLENGE_TOKEN_BYTES &&
    value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

export async function verifyTurnstileChallenge(
  challengeToken: unknown,
  runtime: TurnstileRuntime,
  deps: TurnstileDependencies = {},
): Promise<boolean> {
  if (!validChallengeToken(challengeToken)) return false;
  if (!validHostname(runtime.hostname) || runtime.action !== TURNSTILE_ACTION) return false;
  if (!validSecret(runtime.secret) || !Number.isSafeInteger(runtime.timeoutMs) || runtime.timeoutMs < 1 || runtime.timeoutMs > TURNSTILE_TIMEOUT_MS) {
    return false;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), runtime.timeoutMs);
  try {
    const body = new URLSearchParams({ secret: runtime.secret, response: challengeToken });
    const response = await (deps.fetchImpl ?? fetch)(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: abortController.signal,
    });
    if (!response.ok) return false;
    const text = await readBoundedResponseText(response, MAX_TURNSTILE_RESPONSE_BYTES);
    if (text === null) return false;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
    const value = parsed as Record<string, unknown>;
    return value.success === true && value.hostname === runtime.hostname && value.action === runtime.action;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedResponseText(response: Response, maximumBytes: number): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, totalBytes));
  } catch {
    return null;
  }
}

function boundedCount(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function parseChallengeToken(request: Request): Promise<unknown> {
  if (request.method !== "POST") return undefined;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    return (parsed as Record<string, unknown>).challengeToken;
  } catch {
    return undefined;
  }
}

export async function resolveTrialEntitlement(
  request: Request,
  deps: TrialEntitlementDependencies = {},
): Promise<TrialEntitlementResult> {
  const capability = deps.capability === undefined ? resolveAnonymousTrialCapability() : deps.capability;
  if (!capability) return unavailable();
  const now = (deps.now ?? (() => new Date()))();
  let usageWindow: ReturnType<typeof resolveKstUsageWindow>;
  try {
    usageWindow = resolveKstUsageWindow(now);
  } catch {
    return unavailable();
  }
  const networkDigest = trustedNetworkDigest(request, capability, usageWindow.kstDate, now);
  if (!networkDigest) return unavailable();

  const existingActor = resolveAnonymousTrialActor(request, capability, now);
  const visitorDigest = existingActor?.admissionActor.kind === "anonymous-trial"
    ? existingActor.admissionActor.trialVisitorSubject
    : undefined;
  let usage: Awaited<ReturnType<TrialEntitlementStore["readUsage"]>>;
  try {
    usage = await (deps.store ?? prismaTrialEntitlementStore).readUsage({
      visitorDigest,
      networkDigest,
      kstDate: usageWindow.kstDate,
    });
  } catch {
    return unavailable();
  }
  const visitorCount = boundedCount(usage.visitorAdmittedCount);
  if (visitorCount === null || typeof usage.networkHasTraffic !== "boolean") return unavailable();

  if (visitorDigest) {
    return {
      status: 200,
      body: publicEntitlement(visitorCount, usageWindow.resetsAt, capability.demoWorkspaceSlug),
    };
  }

  if (usage.networkHasTraffic) {
    const challengeToken = await parseChallengeToken(request);
    if (challengeToken === undefined) {
      return {
        status: 200,
        body: {
          remaining: VISITOR_DAILY_LIMIT,
          limit: VISITOR_DAILY_LIMIT,
          resetsAt: usageWindow.resetsAt,
          challengeRequired: true,
        },
      };
    }
    if (!validChallengeToken(challengeToken)) {
      return { status: 403, body: { code: "TRIAL_CHALLENGE_INVALID" } };
    }
    const challengeOk = await (deps.verifyChallenge ?? verifyTurnstileChallenge)(
      challengeToken,
      capability.turnstile,
    );
    if (!challengeOk) {
      return { status: 403, body: { code: "TRIAL_CHALLENGE_INVALID" } };
    }
  }

  try {
    const token = issueTrialVisitorToken({
      key: capability.visitorSigningKeys[0],
      now,
      randomBytesSource: deps.randomBytesSource,
    });
    const verification = verifyTrialVisitorToken(token, capability.visitorSigningKeys, {
      now,
      visitorDigestKey: capability.visitorDigestKey,
    });
    if (!verification.ok) return unavailable();
    return {
      status: 200,
      body: publicEntitlement(0, usageWindow.resetsAt, capability.demoWorkspaceSlug),
      setCookie: serializeTrialVisitorCookie(token),
    };
  } catch {
    return unavailable();
  }
}

function publicEntitlement(admittedCount: number, resetsAt: string, workspaceSlug: string) {
  return {
    remaining: Math.max(0, VISITOR_DAILY_LIMIT - admittedCount),
    limit: VISITOR_DAILY_LIMIT,
    resetsAt,
    entry: { path: `/trial/workspaces/${workspaceSlug}` },
  } as const;
}

function unavailable(): TrialEntitlementResult {
  return { status: 503, body: { code: "TRIAL_ENTITLEMENT_UNAVAILABLE" } };
}

const prismaTrialEntitlementStore: TrialEntitlementStore = {
  async readUsage({ visitorDigest, networkDigest, kstDate }) {
    const [visitor, network] = await Promise.all([
      visitorDigest
        ? prisma.trialAiVisitorDailyUsage.findUnique({
            where: { visitorDigest_kstDate: { visitorDigest, kstDate } },
            select: { admittedCount: true },
          })
        : Promise.resolve(null),
      prisma.trialAiNetworkDailyUsage.findUnique({
        where: { networkDigest_kstDate: { networkDigest, kstDate } },
        select: { admittedCount: true },
      }),
    ]);
    return {
      visitorAdmittedCount: visitor?.admittedCount ?? 0,
      networkHasTraffic: (network?.admittedCount ?? 0) > 0,
    };
  },
};
