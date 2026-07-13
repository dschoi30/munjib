import { readFileSync } from "node:fs";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const IMAGE_DIGEST = /^[^@\s]+@sha256:[a-f0-9]{64}$/;
const PUBLIC_HOST = /^(?:0\.0\.0\.0|\[?::\]?|\*|localhost)$/i;
const DISALLOWED_PORTS = new Set([2019, 2375, 2376, 5432, 55432, 9229, 11434]);

export interface PrivateSecretBinding {
  name: string;
  path?: string;
  uid: number;
  gid: number;
  mode: string;
}

export interface PrivateBindingEvidence {
  platform: string;
  image: string;
  postgresImage: string;
  user: string;
  networkMode?: string;
  networks?: readonly string[];
  readOnly: boolean;
  capDrop: readonly string[];
  noNewPrivileges: boolean;
  tmpfs: readonly string[];
  listeners: readonly string[];
  caddyAdmin: string;
  postgresHostPorts: readonly number[];
  secrets: readonly PrivateSecretBinding[];
}

export interface BindingVerificationResult {
  ok: boolean;
  reason?: string;
}

function fail(reason: string): BindingVerificationResult {
  return { ok: false, reason };
}

function isDigestImage(value: unknown): value is string {
  return typeof value === "string" && IMAGE_DIGEST.test(value);
}

function parseEndpoint(endpoint: string): { host: string; port: number } | undefined {
  const unix = endpoint.match(/^unix:(?:\/\/)?(.+)$/i);
  if (unix) return undefined;
  const ipv6 = endpoint.match(/^\[([^\]]+)\]:(\d+)$/);
  if (ipv6) return { host: ipv6[1]!, port: Number(ipv6[2]) };
  const match = endpoint.match(/^([^:]+):(\d+)$/);
  if (!match) return undefined;
  return { host: match[1]!, port: Number(match[2]) };
}

export function verifyPrivateBindings(input: PrivateBindingEvidence): BindingVerificationResult {
  if (!input || typeof input !== "object") return fail("private binding evidence is missing");
  if (input.platform !== "linux/arm64") return fail("candidate platform must be linux/arm64");
  if (!isDigestImage(input.image) || !isDigestImage(input.postgresImage)) {
    return fail("application and postgres images must use immutable digests");
  }
  if (input.user !== "10001:10001") return fail("runtime user namespace drift");
  if (input.networkMode !== "private") return fail("runtime network mode must be private");
  if (!Array.isArray(input.networks) || input.networks.length !== 1 || input.networks[0] !== "private") {
    return fail("runtime network binding must be the fixed private network");
  }
  if (input.readOnly !== true) return fail("runtime filesystem must be read-only");
  if (!Array.isArray(input.capDrop) || input.capDrop.length !== 1 || input.capDrop[0] !== "ALL") {
    return fail("runtime must drop all Linux capabilities");
  }
  if (input.noNewPrivileges !== true) return fail("no-new-privileges is required");
  if (!Array.isArray(input.tmpfs) || !input.tmpfs.includes("/tmp") || !input.tmpfs.includes("/run")) {
    return fail("runtime writes must be limited to /tmp and /run tmpfs");
  }
  if (!Array.isArray(input.postgresHostPorts) || input.postgresHostPorts.length !== 0) {
    return fail("postgres must not publish host ports");
  }
  if (!Array.isArray(input.listeners) || input.listeners.length === 0) return fail("listener inventory is missing");
  for (const listener of input.listeners) {
    if (typeof listener !== "string") return fail("listener inventory contains an invalid entry");
    const endpoint = parseEndpoint(listener);
    if (!endpoint || PUBLIC_HOST.test(endpoint.host)) return fail(`public listener: ${listener}`);
    if (DISALLOWED_PORTS.has(endpoint.port)) return fail(`disallowed listener port: ${endpoint.port}`);
  }
  if (typeof input.caddyAdmin !== "string") return fail("Caddy admin binding is missing");
  if (!/^unix(?::)?\/\//.test(input.caddyAdmin)) {
    const endpoint = parseEndpoint(input.caddyAdmin);
    if (!endpoint || PUBLIC_HOST.test(endpoint.host) || endpoint.port === 2019) {
      return fail("Caddy admin must be a private Unix socket");
    }
  }
  if (!Array.isArray(input.secrets) || input.secrets.length === 0) return fail("runtime credentials are missing");
  const names = new Set<string>();
  const allowedSecretNames = new Set([
    "nextauth-current",
    "web-current",
    "migrator-current",
    "rag-current",
    "google-client-current",
  ]);
  for (const secret of input.secrets) {
    if (!secret || typeof secret.name !== "string" || names.has(secret.name) || !allowedSecretNames.has(secret.name)) {
      return fail("secret binding names must be unique");
    }
    if (secret.path && (!secret.path.startsWith("/etc/munjib/secrets/") || secret.path.includes(".."))) {
      return fail("secret paths must be fixed root-owned files");
    }
    names.add(secret.name);
    if (secret.uid !== 10001 || secret.gid !== 10001 || secret.mode !== "0400") {
      return fail(`secret ownership or mode drift: ${secret.name}`);
    }
  }
  return { ok: true };
}

export function readPrivateBindingEvidence(path: string): PrivateBindingEvidence {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as PrivateBindingEvidence;
  return parsed;
}

if (process.argv[1]?.endsWith("verify-private-bindings.ts")) {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write("usage: verify-private-bindings.ts <evidence.json>\n");
    process.exitCode = 2;
  } else {
    const result = verifyPrivateBindings(readPrivateBindingEvidence(path));
    process.stdout.write(JSON.stringify(result) + "\n");
    if (!result.ok) process.exitCode = 1;
  }
}
