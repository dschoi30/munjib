/**
 * Dependency-safe boundary primitives for the server-owned AI provider policy.
 *
 * This module deliberately has no Prisma, network, secret, or route imports.
 * It can therefore be tested and adopted by the policy/transport owner only
 * after the Leaf 9/13B dependency gates are satisfied.
 */

export type ProviderBoundaryEnvironment = "production" | "development" | "test";
export type AiProviderId = "ollama" | "openai" | "openai-compatible";
export type AiProviderOutcome = "success" | "error" | "denied" | "timeout" | "cancelled";

export type ProviderEndpointPolicy = Readonly<{
  id: string;
  origin: string;
  path: string;
  /** Local endpoints are legal only under an explicit non-production gate. */
  allowLoopback?: boolean;
}>;

export type ProviderSelection = Readonly<{
  selectionId: string;
  provider: AiProviderId;
  model: string;
  endpoint: ProviderEndpointPolicy;
  enabled: boolean;
}>;

export type ProviderBoundaryPolicy = Readonly<{
  environment: ProviderBoundaryEnvironment;
  resolve: (selectionId: string) => ProviderSelection;
  list: () => readonly ProviderSelection[];
}>;

type ProviderSelectionInput = {
  selectionId: string;
  provider: AiProviderId;
  model: string;
  endpoint: ProviderEndpointPolicy;
  enabled?: boolean;
};

const PROVIDERS = new Set<AiProviderId>(["ollama", "openai", "openai-compatible"]);
const SELECTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const ENDPOINT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const OPERATION_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const OUTCOMES = new Set<AiProviderOutcome>([
  "success",
  "error",
  "denied",
  "timeout",
  "cancelled",
]);
const ENVIRONMENTS = new Set<ProviderBoundaryEnvironment>(["production", "development", "test"]);

export function createProviderBoundaryPolicy(input: {
  environment: ProviderBoundaryEnvironment;
  selections: readonly ProviderSelectionInput[];
}): ProviderBoundaryPolicy {
  if (
    !input ||
    !ENVIRONMENTS.has(input.environment) ||
    !Array.isArray(input.selections) ||
    input.selections.length === 0
  ) {
    throw new Error("AI_PROVIDER_POLICY_INVALID");
  }

  const seen = new Set<string>();
  const selections = input.selections.map((candidate) => {
    if (
      !candidate ||
      typeof candidate.selectionId !== "string" ||
      !SELECTION_ID_PATTERN.test(candidate.selectionId) ||
      seen.has(candidate.selectionId) ||
      typeof candidate.provider !== "string" ||
      !PROVIDERS.has(candidate.provider) ||
      typeof candidate.model !== "string" ||
      !MODEL_ID_PATTERN.test(candidate.model) ||
      (candidate.enabled !== undefined && typeof candidate.enabled !== "boolean")
    ) {
      throw new Error("AI_PROVIDER_POLICY_INVALID");
    }
    seen.add(candidate.selectionId);
    const endpoint = normalizeEndpointPolicy(candidate.endpoint);
    return Object.freeze({
      selectionId: candidate.selectionId,
      provider: candidate.provider,
      model: candidate.model,
      endpoint,
      enabled: candidate.enabled ?? true,
    });
  });
  const byId = new Map(selections.map((selection) => [selection.selectionId, selection]));
  const frozenSelections = Object.freeze(selections.slice());

  return Object.freeze({
    environment: input.environment,
    resolve(selectionId: string) {
      if (typeof selectionId !== "string" || !SELECTION_ID_PATTERN.test(selectionId)) {
        throw new Error("AI_PROVIDER_SELECTION_FORBIDDEN");
      }
      const selection = byId.get(selectionId);
      if (!selection || !selection.enabled) {
        throw new Error("AI_PROVIDER_SELECTION_FORBIDDEN");
      }
      return selection;
    },
    list() {
      return frozenSelections;
    },
  });
}

/** Parse the browser-controlled portion of a request. No configuration is accepted here. */
export function parseOpaqueProviderRequest(value: unknown): { selectionId?: string } {
  if (!isRecord(value)) {
    throw new Error("AI_PROVIDER_REQUEST_INVALID");
  }
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "selectionId")) {
    throw new Error("AI_PROVIDER_REQUEST_INVALID");
  }
  const hasSelectionId = Object.prototype.hasOwnProperty.call(value, "selectionId");
  if (!hasSelectionId) {
    return {};
  }
  if (typeof value.selectionId !== "string" || !SELECTION_ID_PATTERN.test(value.selectionId)) {
    throw new Error("AI_PROVIDER_REQUEST_INVALID");
  }
  return { selectionId: value.selectionId };
}

/**
 * Validate the exact destination selected by a server-owned endpoint catalog.
 * This is intentionally syntactic; each network connect must separately
 * resolve and validate all A/AAAA answers before opening a socket.
 */
export function validateProviderDestination(
  rawUrl: string,
  endpoint: ProviderEndpointPolicy,
  environment: ProviderBoundaryEnvironment,
): string {
  const expected = normalizeEndpointPolicy(endpoint);
  if (typeof rawUrl !== "string" || rawUrl.length > 2048) {
    throw new Error("AI_PROVIDER_DESTINATION_FORBIDDEN");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("AI_PROVIDER_DESTINATION_FORBIDDEN");
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.origin !== expected.origin ||
    parsed.pathname !== expected.path ||
    (hasLiteralAddress(parsed.hostname) && environment === "production")
  ) {
    throw new Error("AI_PROVIDER_DESTINATION_FORBIDDEN");
  }

  if (environment === "production" && parsed.protocol !== "https:") {
    throw new Error("AI_PROVIDER_DESTINATION_FORBIDDEN");
  }
  if (environment === "production" && expected.allowLoopback) {
    throw new Error("AI_PROVIDER_DESTINATION_FORBIDDEN");
  }
  if (
    isPrivateOrMetadataHost(parsed.hostname) &&
    !(expected.allowLoopback && environment !== "production")
  ) {
    throw new Error("AI_PROVIDER_DESTINATION_FORBIDDEN");
  }
  return parsed.toString();
}

export type AiProviderTelemetryInput = {
  operation: unknown;
  provider: unknown;
  model: unknown;
  policyVersion: unknown;
  outcome: unknown;
  latencyMs: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  [key: string]: unknown;
};

export type AiProviderTelemetry = {
  operation: string;
  provider: AiProviderId;
  model: string;
  policyVersion: number;
  outcome: AiProviderOutcome;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
};

/** Return only the fixed metadata allowlist; prompt/content/identity fields never pass through. */
export function sanitizeAiProviderTelemetry(input: AiProviderTelemetryInput): AiProviderTelemetry {
  if (
    !isRecord(input) ||
    typeof input.operation !== "string" ||
    !OPERATION_PATTERN.test(input.operation) ||
    typeof input.provider !== "string" ||
    !PROVIDERS.has(input.provider as AiProviderId) ||
    typeof input.model !== "string" ||
    !MODEL_ID_PATTERN.test(input.model) ||
    !isBoundedInteger(input.policyVersion, 0, 2_147_483_647) ||
    typeof input.outcome !== "string" ||
    !OUTCOMES.has(input.outcome as AiProviderOutcome) ||
    !isBoundedNumber(input.latencyMs, 0, 86_400_000)
  ) {
    throw new Error("AI_PROVIDER_TELEMETRY_INVALID");
  }

  const metadata: AiProviderTelemetry = {
    operation: input.operation,
    provider: input.provider as AiProviderId,
    model: input.model,
    policyVersion: input.policyVersion as number,
    outcome: input.outcome as AiProviderOutcome,
    latencyMs: input.latencyMs as number,
  };
  if (input.inputTokens !== undefined) {
    if (!isBoundedInteger(input.inputTokens, 0, 1_000_000_000)) {
      throw new Error("AI_PROVIDER_TELEMETRY_INVALID");
    }
    metadata.inputTokens = input.inputTokens as number;
  }
  if (input.outputTokens !== undefined) {
    if (!isBoundedInteger(input.outputTokens, 0, 1_000_000_000)) {
      throw new Error("AI_PROVIDER_TELEMETRY_INVALID");
    }
    metadata.outputTokens = input.outputTokens as number;
  }
  return metadata;
}

function normalizeEndpointPolicy(endpoint: ProviderEndpointPolicy): ProviderEndpointPolicy {
  if (
    !endpoint ||
    typeof endpoint.id !== "string" ||
    !ENDPOINT_ID_PATTERN.test(endpoint.id) ||
    typeof endpoint.origin !== "string" ||
    typeof endpoint.path !== "string" ||
    (endpoint.allowLoopback !== undefined && typeof endpoint.allowLoopback !== "boolean")
  ) {
    throw new Error("AI_PROVIDER_POLICY_INVALID");
  }
  let origin: URL;
  try {
    origin = new URL(endpoint.origin);
  } catch {
    throw new Error("AI_PROVIDER_POLICY_INVALID");
  }
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    !["http:", "https:"].includes(origin.protocol) ||
    !endpoint.path.startsWith("/") ||
    endpoint.path.includes("?") ||
    endpoint.path.includes("#") ||
    endpoint.path.includes("//")
  ) {
    throw new Error("AI_PROVIDER_POLICY_INVALID");
  }
  const normalizedOrigin = origin.origin;
  const expectedPort = endpoint.allowLoopback
    ? "11434"
    : origin.protocol === "https:"
      ? "443"
      : "80";
  if (origin.port && origin.port !== expectedPort) {
    // The sole non-default port is the fixed internal Ollama overlay.
    throw new Error("AI_PROVIDER_POLICY_INVALID");
  }
  if (
    endpoint.allowLoopback &&
    (origin.protocol !== "http:" || origin.hostname !== "ollama" || origin.port !== "11434")
  ) {
    throw new Error("AI_PROVIDER_POLICY_INVALID");
  }
  return Object.freeze({
    id: endpoint.id,
    origin: normalizedOrigin,
    path: endpoint.path,
    ...(endpoint.allowLoopback ? { allowLoopback: true } : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isBoundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function hasLiteralAddress(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "");
  return isIpv4(normalized) || normalized.includes(":");
}

function isPrivateOrMetadataHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  const mappedIpv4 = ipv4MappedIpv6(normalized);
  if (mappedIpv4) {
    return isPrivateOrMetadataHost(mappedIpv4);
  }
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "metadata.google.internal" ||
    normalized === "metadata.google" ||
    normalized === "instance-data" ||
    normalized === "instance-data.ec2.internal" ||
    normalized === "ollama"
  ) {
    return true;
  }
  if (isIpv4(normalized)) {
    const octets = normalized.split(".").map(Number);
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && b >= 18 && b <= 19) ||
      a >= 224
    );
  }
  if (normalized.includes(":")) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("fec") ||
      normalized.startsWith("fed") ||
      normalized.startsWith("fee") ||
      normalized.startsWith("fef")
    );
  }
  return false;
}

function ipv4MappedIpv6(value: string): string | undefined {
  if (!value.includes(":")) return undefined;
  const pieces = value.split("::");
  if (pieces.length > 2) return undefined;
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces[1] ? pieces[1].split(":") : [];
  if (left.length + right.length > 8) return undefined;
  const groups = [
    ...left,
    ...Array.from({ length: 8 - left.length - right.length }, () => "0"),
    ...right,
  ];
  if (
    groups.length !== 8 ||
    groups.slice(0, 5).some((group) => group !== "0") ||
    groups[5] !== "ffff"
  ) {
    return undefined;
  }
  const high = Number.parseInt(groups[6], 16);
  const low = Number.parseInt(groups[7], 16);
  if (!Number.isInteger(high) || !Number.isInteger(low) || high > 0xffff || low > 0xffff) {
    return undefined;
  }
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isIpv4(value: string): boolean {
  const octets = value.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => /^(?:0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255)
  );
}
