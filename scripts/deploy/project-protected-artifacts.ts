import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";

export const NEXT_RUNTIME_PROJECTION = "next-runtime-dependencies-v1" as const;
export const NEXT_RUNTIME_OWNER = "secure-next-runtime" as const;

type JsonRecord = Record<string, unknown>;
type RootName = "next" | "react" | "react-dom";

export type ProjectionNode = {
  key: string;
  value: JsonRecord;
};

export type NextRuntimeProjection = {
  selector: typeof NEXT_RUNTIME_PROJECTION;
  owner: typeof NEXT_RUNTIME_OWNER;
  version: 1;
  status: "ACTIVE";
  roots: Array<{
    name: RootName;
    manifest: string;
    specifier: string;
    resolution: string;
    packageKey: string;
    snapshotKey: string;
  }>;
  packages: ProjectionNode[];
  snapshots: ProjectionNode[];
  hash: string;
};

function assertRecord(value: unknown, label: string): asserts value is JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function parseLockfile(text: string): JsonRecord {
  const document = parseDocument(text, { strict: true, uniqueKeys: true, version: "1.2" });
  if (document.errors.length > 0 || document.warnings.length > 0) {
    throw new Error("lockfile YAML is ambiguous or invalid");
  }
  const value = document.toJS();
  assertRecord(value, "lockfile");
  return value;
}

function baseVersion(version: string): string {
  const match = version.match(/^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  if (!match) throw new Error(`lock resolution is ambiguous: ${version}`);
  return match[1]!;
}

function resolveKey(table: JsonRecord, name: string, resolution: string): string {
  const base = `${name}@${baseVersion(resolution)}`;
  const matches = Object.keys(table).filter((key) => key === base || key.startsWith(`${base}(`));
  if (matches.length !== 1) {
    throw new Error(`lock graph resolution for ${name} is missing or ambiguous`);
  }
  return matches[0]!;
}

function dependencyEntries(value: JsonRecord): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  for (const field of ["dependencies", "optionalDependencies"]) {
    const dependencies = value[field];
    if (dependencies === undefined) continue;
    assertRecord(dependencies, `${field} entry`);
    for (const [name, resolution] of Object.entries(dependencies)) {
      if (typeof resolution !== "string") throw new Error("lock dependency resolution must be a string");
      result.push([name, resolution]);
    }
  }
  return result;
}

function validateOwners(ownerMapText: string): void {
  let ownerMap: unknown;
  try {
    ownerMap = JSON.parse(ownerMapText);
  } catch {
    throw new Error("protected owner map is invalid JSON");
  }
  assertRecord(ownerMap, "protected owner map");
  if (ownerMap.format !== "munjib-protected-artifact-owners-v1" || ownerMap.version !== 1) {
    throw new Error("protected owner map schema is invalid");
  }
  const owners = ownerMap.owners;
  if (!Array.isArray(owners)) throw new Error("protected owner map owners must be an array");
  const projectionEntries = owners.filter((entry): entry is JsonRecord => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    return (entry as JsonRecord).selector === `projection:${NEXT_RUNTIME_PROJECTION}`;
  });
  if (projectionEntries.length !== 1) throw new Error("Next.js projection owner is missing or duplicated");
  const projection = projectionEntries[0]!;
  if (projection.kind !== "NORMALIZED_PROJECTION" || projection.owner !== NEXT_RUNTIME_OWNER || projection.version !== 1 || projection.status !== "ACTIVE") {
    throw new Error("Next.js projection owner is invalid");
  }
  for (const entry of owners) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("owner entry is invalid");
    const selector = (entry as JsonRecord).selector;
    if (selector === "path:package.json" || selector === "path:pnpm-lock.yaml") {
      throw new Error("projection source cannot have FULL_PATH ownership");
    }
  }
}

export function projectionHash(projection: Omit<NextRuntimeProjection, "hash"> | NextRuntimeProjection): string {
  const { hash: _ignored, ...withoutHash } = projection as NextRuntimeProjection;
  return createHash("sha256").update(canonical(withoutHash)).digest("hex");
}

export function projectNextRuntimeDependencies(input: {
  packageJsonText: string;
  lockfileText: string;
  ownerMapText: string;
  expectedHash?: string;
}): NextRuntimeProjection {
  validateOwners(input.ownerMapText);
  let manifest: JsonRecord;
  try {
    manifest = JSON.parse(input.packageJsonText);
  } catch {
    throw new Error("package manifest is invalid JSON");
  }
  assertRecord(manifest, "package manifest");
  const dependencies: JsonRecord = {};
  for (const field of ["dependencies", "devDependencies"]) {
    const section = manifest[field];
    if (section === undefined) continue;
    assertRecord(section, `${field} section`);
    Object.assign(dependencies, section);
  }
  const lockfile = parseLockfile(input.lockfileText);
  assertRecord(lockfile.importers, "lock importers");
  const importer = lockfile.importers["."];
  assertRecord(importer, "root importer");
  const importerDependencies: JsonRecord = {};
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const section = importer[field];
    if (section === undefined) continue;
    assertRecord(section, `${field} importer`);
    Object.assign(importerDependencies, section);
  }
  const packages = lockfile.packages;
  const snapshots = lockfile.snapshots;
  assertRecord(packages, "lock packages");
  assertRecord(snapshots, "lock snapshots");
  const rootNames: RootName[] = ["next", "react", "react-dom"];
  const roots: NextRuntimeProjection["roots"] = [];
  const packageKeys = new Set<string>();
  const snapshotKeys = new Set<string>();
  const queue: Array<{ name: string; resolution: string }> = [];
  for (const name of rootNames) {
    const manifestValue = dependencies[name];
    if (typeof manifestValue !== "string" || !manifestValue) throw new Error(`${name} is missing from package manifest`);
    const rootResolution = importerDependencies[name];
    assertRecord(rootResolution, `${name} root importer`);
    if (typeof rootResolution.specifier !== "string" || typeof rootResolution.version !== "string") {
      throw new Error(`${name} root importer specifier/resolution is missing`);
    }
    const packageKey = resolveKey(packages, name, rootResolution.version);
    const snapshotKey = resolveKey(snapshots, name, rootResolution.version);
    roots.push({ name, manifest: manifestValue, specifier: rootResolution.specifier, resolution: rootResolution.version, packageKey, snapshotKey });
    queue.push({ name, resolution: rootResolution.version });
  }
  while (queue.length > 0) {
    const item = queue.shift()!;
    const packageKey = resolveKey(packages, item.name, item.resolution);
    const snapshotKey = resolveKey(snapshots, item.name, item.resolution);
    if (packageKeys.has(packageKey) && snapshotKeys.has(snapshotKey)) continue;
    packageKeys.add(packageKey);
    snapshotKeys.add(snapshotKey);
    const packageRecord = packages[packageKey];
    const snapshotRecord = snapshots[snapshotKey];
    assertRecord(packageRecord, `${packageKey} package`);
    assertRecord(snapshotRecord, `${snapshotKey} snapshot`);
    for (const [name, resolution] of dependencyEntries(snapshotRecord)) {
      resolveKey(packages, name, resolution);
      resolveKey(snapshots, name, resolution);
      queue.push({ name, resolution });
    }
  }
  const selectedPackages = [...packageKeys].sort().map((key) => ({ key, value: packages[key] as JsonRecord }));
  const selectedSnapshots = [...snapshotKeys].sort().map((key) => ({ key, value: snapshots[key] as JsonRecord }));
  const projectionWithoutHash = { selector: NEXT_RUNTIME_PROJECTION, owner: NEXT_RUNTIME_OWNER, version: 1 as const, status: "ACTIVE" as const, roots, packages: selectedPackages, snapshots: selectedSnapshots };
  const hash = projectionHash(projectionWithoutHash);
  if (input.expectedHash !== undefined && input.expectedHash !== hash) {
    throw new Error("protected projection hash was not recomputed from the candidate");
  }
  return { ...projectionWithoutHash, hash };
}

export function projectFromRepository(root = process.cwd()): NextRuntimeProjection {
  return projectNextRuntimeDependencies({
    packageJsonText: readFileSync(join(root, "package.json"), "utf8"),
    lockfileText: readFileSync(join(root, "pnpm-lock.yaml"), "utf8"),
    ownerMapText: readFileSync(join(root, "deploy/security/protected-artifact-owners.json"), "utf8"),
  });
}
