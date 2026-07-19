export const EDGE_BINDINGS_CONTRACT_FORMAT = "munjib-edge-bindings-v1" as const;
export const EDGE_BINDINGS_CANONICAL_ORIGIN = "https://munjib.example.invalid" as const;

const REQUIRED_HEADER_VALUES = [
  { name: "strict-transport-security", value: "max-age=31536000; includeSubDomains" },
  { name: "x-content-type-options", value: "nosniff" },
  { name: "x-frame-options", value: "DENY" },
  { name: "referrer-policy", value: "strict-origin-when-cross-origin" },
  { name: "permissions-policy", value: "camera=(), microphone=(), geolocation=()" },
] as const;

const REQUIRED_NO_STORE_PREFIXES = ["/api/", "/login", "/workspaces/"] as const;
const REQUIRED_REDACTED_FIELDS = [
  "authorization",
  "cookie",
  "set-cookie",
  "query",
  "requestBody",
  "responseBody",
  "clientIp",
] as const;
const REQUIRED_TELEMETRY_FIELDS = [
  "probeId",
  "status",
  "latencyMs",
  "observedAt",
  "outcome",
] as const;
const REQUIRED_DEPENDENCIES = [3, 4, 7, 8, 9, 10, 11, "13B"] as const;
const REQUIRED_EVIDENCE = [
  "edge-owner-approval",
  "tls-certificate-and-dns-binding",
  "origin-loopback-binding",
  "header-conformance-probe",
  "continuous-probe-alert-routing",
  "immutable-runtime-broker-attestation",
] as const;
const UNKNOWN_PROBE_ID = "unknown" as const;
const UNKNOWN_OBSERVED_AT = "1970-01-01T00:00:00.000Z" as const;

export type EdgeHeaderContract = {
  name: string;
  value: string;
};

export type EdgeProbe = {
  id: "public-https" | "origin-loopback" | "unknown-host-rejection";
  transport: "https" | "http-loopback";
  method: "GET";
  path: string;
  host: string;
  address?: string;
  connectAddress?: string;
  expectedStatus?: number;
  expectedStatusClass?: "4xx";
  requiredHeaders?: string[];
  cadenceSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
  bodyPolicy: "discard";
};

export type EdgeBindingsContract = {
  format: typeof EDGE_BINDINGS_CONTRACT_FORMAT;
  version: 1;
  state: "PREPARATORY";
  activation: "DISABLED";
  owner: "edge-header-continuous-probes";
  canonicalOrigin: typeof EDGE_BINDINGS_CANONICAL_ORIGIN;
  origin: {
    transport: "http-loopback";
    address: "127.0.0.1:3000";
    hostHeader: "munjib.example.invalid";
    publiclyRoutable: false;
  };
  requiredHeaders: EdgeHeaderContract[];
  cachePolicy: {
    noStorePathPrefixes: string[];
    probeResponse: "no-store";
  };
  probes: EdgeProbe[];
  telemetry: {
    allowedFields: string[];
    redactedFields: string[];
    retainResponseBody: false;
  };
  activationGates: {
    dependencies: Array<number | "13B">;
    requiredEvidence: string[];
    productionMutationAllowed: false;
  };
};

export type EdgeProbeHeaders =
  | Headers
  | Record<string, string | null | undefined | readonly string[]>;

export type EdgeProbeObservation = {
  status: number;
  latencyMs: number;
  observedAt: string;
  headers: EdgeProbeHeaders;
  request: EdgeProbeRequestMetadata;
  [field: string]: unknown;
};

export type EdgeProbeRequestMetadata = {
  method: string;
  transport: string;
  connectAddress: string;
  host: string;
  path: string;
};

export type EdgeProbeEvaluation = {
  probeId: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  observedAt: string;
  reasons: string[];
};

export type EdgeProbeTelemetry = {
  probeId: string;
  status: number;
  latencyMs: number;
  observedAt: string;
  outcome: "success" | "failure";
};

export class EdgeBindingsConfigError extends Error {
  constructor(message: string) {
    super(`EDGE_BINDINGS_CONFIG_INVALID: ${message}`);
    this.name = "EdgeBindingsConfigError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fail = (message: string): never => {
  throw new EdgeBindingsConfigError(message);
};

const requireRecord = (value: unknown, path: string): Record<string, unknown> =>
  isRecord(value) ? value : fail(`${path} must be an object`);

const requireString = (value: unknown, path: string): string =>
  typeof value === "string" && value.length > 0 ? value : fail(`${path} must be a non-empty string`);

const requireBoolean = (value: unknown, expected: boolean, path: string): boolean =>
  value === expected ? value : fail(`${path} must be ${String(expected)}`);

const requireNumber = (value: unknown, path: string): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fail(`${path} must be a finite number`);

const requireExactArray = <T>(
  value: unknown,
  expected: readonly T[],
  path: string,
): T[] => {
  if (!Array.isArray(value) || value.length !== expected.length) {
    return fail(`${path} does not match the required list`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (value[index] !== expected[index]) {
      return fail(`${path} does not match the required list`);
    }
  }
  return [...value] as T[];
};

const requireAllowedKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
) => {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail(`${path}.${key} is not an allowed field`);
    }
  }
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
};

const validateHeaders = (value: unknown): EdgeHeaderContract[] => {
  if (!Array.isArray(value) || value.length !== REQUIRED_HEADER_VALUES.length) {
    return fail("requiredHeaders must contain the exact security-header set");
  }
  return value.map((entry, index) => {
    const header = requireRecord(entry, `requiredHeaders[${index}]`);
    requireAllowedKeys(header, ["name", "value"], `requiredHeaders[${index}]`);
    const expected = REQUIRED_HEADER_VALUES[index];
    const name = requireString(header.name, `requiredHeaders[${index}].name`);
    const headerValue = requireString(header.value, `requiredHeaders[${index}].value`);
    if (name !== expected.name || headerValue !== expected.value) {
      return fail(`requiredHeaders[${index}] is not the exact required value`);
    }
    return { name, value: headerValue };
  });
};

const validateProbe = (value: unknown, index: number): EdgeProbe => {
  const probe = requireRecord(value, `probes[${index}]`);
  const id = requireString(probe.id, `probes[${index}].id`);
  const commonKeys = [
    "id",
    "transport",
    "method",
    "path",
    "host",
    "address",
    "connectAddress",
    "expectedStatus",
    "expectedStatusClass",
    "requiredHeaders",
    "cadenceSeconds",
    "timeoutSeconds",
    "failureThreshold",
    "bodyPolicy",
  ] as const;
  requireAllowedKeys(probe, commonKeys, `probes[${index}]`);
  const base = {
    id,
    transport: requireString(probe.transport, `probes[${index}].transport`),
    method: requireString(probe.method, `probes[${index}].method`),
    path: requireString(probe.path, `probes[${index}].path`),
    host: requireString(probe.host, `probes[${index}].host`),
    cadenceSeconds: requireNumber(probe.cadenceSeconds, `probes[${index}].cadenceSeconds`),
    timeoutSeconds: requireNumber(probe.timeoutSeconds, `probes[${index}].timeoutSeconds`),
    failureThreshold: requireNumber(probe.failureThreshold, `probes[${index}].failureThreshold`),
    bodyPolicy: requireString(probe.bodyPolicy, `probes[${index}].bodyPolicy`),
  };
  if (base.method !== "GET" || base.bodyPolicy !== "discard") {
    return fail(`probes[${index}] must be a GET probe that discards its body`);
  }
  if (base.cadenceSeconds <= 0 || base.timeoutSeconds <= 0 || base.failureThreshold <= 0) {
    return fail(`probes[${index}] cadence, timeout, and threshold must be positive`);
  }

  if (id === "public-https") {
    requireAllowedKeys(
      probe,
      [
        "id",
        "transport",
        "method",
        "path",
        "host",
        "connectAddress",
        "expectedStatus",
        "requiredHeaders",
        "cadenceSeconds",
        "timeoutSeconds",
        "failureThreshold",
        "bodyPolicy",
      ],
      `probes[${index}]`,
    );
    if (
      base.transport !== "https" ||
      base.path !== "/api/auth/providers" ||
      base.host !== "munjib.example.invalid" ||
      probe.connectAddress !== "munjib.example.invalid" ||
      base.cadenceSeconds !== 60 ||
      base.timeoutSeconds !== 10 ||
      base.failureThreshold !== 3 ||
      probe.expectedStatus !== 200
    ) {
      return fail("public-https probe does not match the bounded contract");
    }
    const requiredHeaders = requireExactArray(
      probe.requiredHeaders,
      REQUIRED_HEADER_VALUES.map((header) => header.name),
      "probes[public-https].requiredHeaders",
    );
    return {
      ...base,
      id: "public-https",
      transport: "https",
      method: "GET",
      connectAddress: "munjib.example.invalid",
      expectedStatus: 200,
      requiredHeaders,
      bodyPolicy: "discard",
    };
  }

  if (id === "origin-loopback") {
    requireAllowedKeys(
      probe,
      [
        "id",
        "transport",
        "method",
        "path",
        "host",
        "address",
        "expectedStatus",
        "cadenceSeconds",
        "timeoutSeconds",
        "failureThreshold",
        "bodyPolicy",
      ],
      `probes[${index}]`,
    );
    if (
      base.transport !== "http-loopback" ||
      base.path !== "/api/auth/providers" ||
      base.host !== "munjib.example.invalid" ||
      base.cadenceSeconds !== 60 ||
      base.timeoutSeconds !== 5 ||
      base.failureThreshold !== 3 ||
      probe.address !== "127.0.0.1:3000" ||
      probe.connectAddress !== undefined ||
      probe.expectedStatus !== 200
    ) {
      return fail("origin-loopback probe does not match the bounded contract");
    }
    return {
      ...base,
      id: "origin-loopback",
      transport: "http-loopback",
      method: "GET",
      address: "127.0.0.1:3000",
      expectedStatus: 200,
      bodyPolicy: "discard",
    };
  }

  if (id === "unknown-host-rejection") {
    requireAllowedKeys(
      probe,
      [
        "id",
        "transport",
        "method",
        "path",
        "host",
        "connectAddress",
        "expectedStatusClass",
        "cadenceSeconds",
        "timeoutSeconds",
        "failureThreshold",
        "bodyPolicy",
      ],
      `probes[${index}]`,
    );
    if (
      base.transport !== "https" ||
      base.path !== "/api/auth/providers" ||
      base.host !== "unknown.invalid" ||
      probe.connectAddress !== "munjib.example.invalid" ||
      base.cadenceSeconds !== 300 ||
      base.timeoutSeconds !== 10 ||
      base.failureThreshold !== 1 ||
      probe.expectedStatusClass !== "4xx"
    ) {
      return fail("unknown-host-rejection probe does not match the bounded contract");
    }
    return {
      ...base,
      id: "unknown-host-rejection",
      transport: "https",
      method: "GET",
      connectAddress: "munjib.example.invalid",
      expectedStatusClass: "4xx",
      bodyPolicy: "discard",
    };
  }

  return fail(`probes[${index}].id is not recognized`);
};

export function parseEdgeBindingsContract(value: unknown): Readonly<EdgeBindingsContract> {
  const source = requireRecord(value, "contract");
  requireAllowedKeys(
    source,
    [
      "format",
      "version",
      "state",
      "activation",
      "owner",
      "canonicalOrigin",
      "origin",
      "requiredHeaders",
      "cachePolicy",
      "probes",
      "telemetry",
      "activationGates",
    ],
    "contract",
  );
  if (source.format !== EDGE_BINDINGS_CONTRACT_FORMAT) return fail("format is unsupported");
  if (source.version !== 1) return fail("version is unsupported");
  if (source.state !== "PREPARATORY") return fail("state must remain PREPARATORY");
  if (source.activation !== "DISABLED") return fail("activation must remain DISABLED");
  if (source.owner !== "edge-header-continuous-probes") return fail("owner is unsupported");
  if (source.canonicalOrigin !== EDGE_BINDINGS_CANONICAL_ORIGIN) {
    return fail("canonicalOrigin is unsupported");
  }

  const origin = requireRecord(source.origin, "origin");
  requireAllowedKeys(origin, ["transport", "address", "hostHeader", "publiclyRoutable"], "origin");
  if (
    origin.transport !== "http-loopback" ||
    origin.address !== "127.0.0.1:3000" ||
    origin.hostHeader !== "munjib.example.invalid"
  ) {
    return fail("origin must be the fixed loopback binding");
  }
  requireBoolean(origin.publiclyRoutable, false, "origin.publiclyRoutable");

  const cachePolicy = requireRecord(source.cachePolicy, "cachePolicy");
  requireAllowedKeys(cachePolicy, ["noStorePathPrefixes", "probeResponse"], "cachePolicy");
  const noStorePathPrefixes = requireExactArray(
    cachePolicy.noStorePathPrefixes,
    REQUIRED_NO_STORE_PREFIXES,
    "cachePolicy.noStorePathPrefixes",
  );
  if (cachePolicy.probeResponse !== "no-store") return fail("cachePolicy.probeResponse must be no-store");

  const probesValue = source.probes;
  if (!Array.isArray(probesValue) || probesValue.length !== 3) {
    return fail("probes must contain exactly the public, loopback, and negative probes");
  }
  const probes = probesValue.map(validateProbe);
  if (new Set(probes.map((probe) => probe.id)).size !== 3) {
    return fail("probes must have unique ids");
  }

  const telemetry = requireRecord(source.telemetry, "telemetry");
  requireAllowedKeys(telemetry, ["allowedFields", "redactedFields", "retainResponseBody"], "telemetry");
  const allowedFields = requireExactArray(
    telemetry.allowedFields,
    REQUIRED_TELEMETRY_FIELDS,
    "telemetry.allowedFields",
  );
  const redactedFields = requireExactArray(
    telemetry.redactedFields,
    REQUIRED_REDACTED_FIELDS,
    "telemetry.redactedFields",
  );
  requireBoolean(telemetry.retainResponseBody, false, "telemetry.retainResponseBody");

  const activationGates = requireRecord(source.activationGates, "activationGates");
  requireAllowedKeys(
    activationGates,
    ["dependencies", "requiredEvidence", "productionMutationAllowed"],
    "activationGates",
  );
  const dependencies = requireExactArray(
    activationGates.dependencies,
    REQUIRED_DEPENDENCIES,
    "activationGates.dependencies",
  );
  const requiredEvidence = requireExactArray(
    activationGates.requiredEvidence,
    REQUIRED_EVIDENCE,
    "activationGates.requiredEvidence",
  );
  requireBoolean(
    activationGates.productionMutationAllowed,
    false,
    "activationGates.productionMutationAllowed",
  );

  return deepFreeze({
    format: EDGE_BINDINGS_CONTRACT_FORMAT,
    version: 1,
    state: "PREPARATORY",
    activation: "DISABLED",
    owner: "edge-header-continuous-probes",
    canonicalOrigin: EDGE_BINDINGS_CANONICAL_ORIGIN,
    origin: {
      transport: "http-loopback",
      address: "127.0.0.1:3000",
      hostHeader: "munjib.example.invalid",
      publiclyRoutable: false,
    },
    requiredHeaders: validateHeaders(source.requiredHeaders),
    cachePolicy: { noStorePathPrefixes, probeResponse: "no-store" },
    probes,
    telemetry: { allowedFields, redactedFields, retainResponseBody: false },
    activationGates: { dependencies, requiredEvidence, productionMutationAllowed: false },
  });
}

export function parseEdgeBindingsContractJson(raw: string): Readonly<EdgeBindingsContract> {
  try {
    return parseEdgeBindingsContract(JSON.parse(raw) as unknown);
  } catch (error) {
    if (error instanceof EdgeBindingsConfigError) throw error;
    throw new EdgeBindingsConfigError("contract is not valid JSON");
  }
}

const headerMap = (
  headers: unknown,
): { values: Map<string, string>; duplicates: Set<string>; invalid: boolean } => {
  const values = new Map<string, string>();
  const duplicates = new Set<string>();
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    for (const [rawName, rawValue] of headers.entries()) {
      const name = rawName.trim().toLowerCase();
      if (!name) return { values, duplicates, invalid: true };
      if (values.has(name)) duplicates.add(name);
      values.set(name, rawValue);
    }
    return { values, duplicates, invalid: false };
  }
  if (!isRecord(headers)) return { values, duplicates, invalid: true };
  const entries = Object.entries(headers);
  for (const [rawName, rawValue] of entries) {
    if (typeof rawName !== "string" || rawName.trim().length === 0) {
      return { values, duplicates, invalid: true };
    }
    if (rawValue === null || rawValue === undefined) continue;
    const value = Array.isArray(rawValue)
      ? rawValue.every((part) => typeof part === "string")
        ? rawValue.join(", ")
        : null
      : typeof rawValue === "string"
        ? rawValue
        : null;
    if (value === null) return { values, duplicates, invalid: true };
    const name = rawName.trim().toLowerCase();
    if (values.has(name)) duplicates.add(name);
    values.set(name, value);
  }
  return { values, duplicates, invalid: false };
};

export function isNoStorePath(contract: Readonly<EdgeBindingsContract>, path: unknown): boolean {
  if (typeof path !== "string") return false;
  let pathname = path;
  try {
    pathname = new URL(path, contract.canonicalOrigin).pathname;
  } catch {
    pathname = path.split(/[?#]/, 1)[0] ?? path;
  }
  return contract.cachePolicy.noStorePathPrefixes.some((prefix) => {
    const root = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    return pathname === root || pathname.startsWith(`${root}/`);
  });
}

const hasNoStoreDirective = (value: string | undefined): boolean =>
  value?.split(",").some((part) => part.trim().toLowerCase() === "no-store") ?? false;

export function evaluateEdgeProbe(
  contract: Readonly<EdgeBindingsContract>,
  probeId: string,
  observation: EdgeProbeObservation,
): EdgeProbeEvaluation {
  const reasons: string[] = [];
  const probe = contract.probes.find((candidate) => candidate.id === probeId);
  const source: Record<string, unknown> = isRecord(observation) ? observation : {};
  const status = typeof source.status === "number" ? source.status : Number.NaN;
  const latencyMs = typeof source.latencyMs === "number" ? source.latencyMs : Number.NaN;
  const observedAt = typeof source.observedAt === "string" ? source.observedAt : "";
  if (!probe) {
    return { probeId, ok: false, status, latencyMs, observedAt, reasons: ["UNKNOWN_PROBE"] };
  }
  if (!Number.isInteger(status) || status < 100 || status > 599) reasons.push("STATUS_INVALID");
  if (!Number.isFinite(latencyMs) || latencyMs < 0) reasons.push("LATENCY_INVALID");
  if (Number.isFinite(latencyMs) && latencyMs > probe.timeoutSeconds * 1000) {
    reasons.push("LATENCY_TIMEOUT_EXCEEDED");
  }
  if (!isStrictObservedAt(observedAt)) reasons.push("OBSERVED_AT_INVALID");
  if (probe.expectedStatus !== undefined && status !== probe.expectedStatus) {
    reasons.push(`STATUS_MISMATCH:${probe.expectedStatus}`);
  }
  if (probe.expectedStatusClass === "4xx" && (status < 400 || status > 499)) {
    reasons.push("STATUS_CLASS_MISMATCH:4xx");
  }

  const request = source.request;
  if (!isRecord(request)) {
    reasons.push("REQUEST_INVALID");
  } else {
    if (typeof request.method !== "string" || request.method !== probe.method) {
      reasons.push("REQUEST_METHOD_MISMATCH");
    }
    if (typeof request.transport !== "string" || request.transport !== probe.transport) {
      reasons.push("REQUEST_TRANSPORT_MISMATCH");
    }
    const expectedConnectAddress =
      probe.connectAddress ?? probe.address ?? new URL(contract.canonicalOrigin).host;
    if (
      typeof request.connectAddress !== "string" ||
      request.connectAddress !== expectedConnectAddress
    ) {
      reasons.push("REQUEST_CONNECT_ADDRESS_MISMATCH");
    }
    if (typeof request.host !== "string" || request.host !== probe.host) {
      reasons.push("REQUEST_HOST_MISMATCH");
    }
    if (typeof request.path !== "string") {
      reasons.push("REQUEST_PATH_INVALID");
    } else if (request.path !== probe.path) {
      reasons.push("REQUEST_PATH_MISMATCH");
    }
  }

  const headers = headerMap(source.headers);
  if (headers.invalid) reasons.push("HEADERS_INVALID");
  for (const duplicate of headers.duplicates) reasons.push(`HEADER_DUPLICATE:${duplicate}`);
  if (probe.requiredHeaders) {
    for (const requiredName of probe.requiredHeaders) {
      const expected = contract.requiredHeaders.find((header) => header.name === requiredName);
      const actual = headers.values.get(requiredName);
      if (!expected || actual === undefined) {
        reasons.push(`HEADER_MISSING:${requiredName}`);
      } else if (actual !== expected.value) {
        reasons.push(`HEADER_MISMATCH:${requiredName}`);
      }
    }
  }
  if (contract.cachePolicy.probeResponse === "no-store" || isNoStorePath(contract, probe.path)) {
    if (!hasNoStoreDirective(headers.values.get("cache-control"))) {
      reasons.push("CACHE_CONTROL_NO_STORE_MISSING");
    }
  }

  return {
    probeId,
    ok: reasons.length === 0,
    status,
    latencyMs,
    observedAt,
    reasons,
  };
}

function isStrictObservedAt(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

export function redactProbeTelemetry(
  contract: Readonly<EdgeBindingsContract>,
  evaluation: EdgeProbeEvaluation,
): EdgeProbeTelemetry {
  const knownProbe = contract.probes.some((probe) => probe.id === evaluation.probeId);
  const candidate: EdgeProbeTelemetry = {
    probeId: knownProbe ? evaluation.probeId : UNKNOWN_PROBE_ID,
    status: evaluation.status,
    latencyMs: evaluation.latencyMs,
    observedAt: isStrictObservedAt(evaluation.observedAt)
      ? evaluation.observedAt
      : UNKNOWN_OBSERVED_AT,
    outcome: evaluation.ok ? "success" : "failure",
  };
  const redacted: Record<string, unknown> = {};
  for (const field of contract.telemetry.allowedFields) {
    if (field in candidate) redacted[field] = candidate[field as keyof EdgeProbeTelemetry];
  }
  return redacted as EdgeProbeTelemetry;
}
