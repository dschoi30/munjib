import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const layoutRelativePath = "deploy/delivery/bundle-layout-v1.json";
const manifestName = "manifest.json";
const digestName = "bundle.sha256";
const payloadDirectory = "payload";

type BundleFileLayout = {
  artifact?: string;
  source?: string;
  destination: string;
  type: "binary" | "repository";
  owner: "root:root";
  mode: "0400" | "0755";
  sha256?: string;
};

type ExternalInput = {
  name: string;
  destination: string;
  owner: "root:root";
  mode: "0400";
  provisioning: "root-bootstrap";
};

type BundleLayout = {
  format: "munjib-delivery-bundle-layout-v1";
  version: 1;
  bundle: "delivery-substrate-v1";
  target: { goos: "linux"; goarch: "arm64" };
  files: BundleFileLayout[];
  externalInputs: ExternalInput[];
};

export type DeliveryBundleManifest = {
  format: "munjib-delivery-bundle-manifest-v2";
  version: 2;
  bundle: "delivery-substrate-v1";
  target: { goos: "linux"; goarch: "arm64" };
  payloadDirectory: "payload";
  layoutSha256: string;
  files: Array<BundleFileLayout & { sha256: string }>;
  externalInputs: ExternalInput[];
};

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function assertRelativePath(value: string, field: string): void {
  if (!value || isAbsolute(value) || value.split("/").includes("..") || value.split("\\").includes("..")) {
    throw new Error(`${field} must be a fixed relative path`);
  }
}

function assertDestination(value: string): void {
  if (!value.startsWith("/") || value.includes("\0") || value.split("/").includes("..")) {
    throw new Error(`bundle destination is not fixed: ${value}`);
  }
  if (!(value.startsWith("/usr/local/libexec/") || value.startsWith("/etc/"))) {
    throw new Error(`bundle destination is outside the delivery allowlist: ${value}`);
  }
}

function assertLayout(layout: BundleLayout): void {
  if (layout.format !== "munjib-delivery-bundle-layout-v1" || layout.version !== 1 || layout.bundle !== "delivery-substrate-v1") {
    throw new Error("invalid delivery bundle layout");
  }
  if (layout.target.goos !== "linux" || layout.target.goarch !== "arm64") {
    throw new Error("delivery bundle target must be linux/arm64");
  }
  if (!Array.isArray(layout.files) || layout.files.length !== 8) throw new Error("delivery bundle file layout is incomplete");
  const destinations = new Set<string>();
  const artifacts = new Set<string>();
  for (const file of layout.files) {
    assertDestination(file.destination);
    if (destinations.has(file.destination)) throw new Error(`duplicate bundle destination: ${file.destination}`);
    destinations.add(file.destination);
    if (file.owner !== "root:root" || !["0400", "0755"].includes(file.mode)) throw new Error(`invalid bundle ownership or mode: ${file.destination}`);
    if (file.type === "binary") {
      if (!file.artifact || file.source || file.mode !== "0755") throw new Error(`invalid binary layout: ${file.destination}`);
      assertRelativePath(file.artifact, "binary artifact");
      if (artifacts.has(file.artifact)) throw new Error(`duplicate binary artifact: ${file.artifact}`);
      artifacts.add(file.artifact);
    } else if (file.type === "repository") {
      if (!file.source || file.artifact || file.mode !== "0400" || !/^[a-f0-9]{64}$/.test(file.sha256 ?? "")) {
        throw new Error(`invalid repository layout: ${file.destination}`);
      }
      assertRelativePath(file.source, "repository source");
    } else {
      throw new Error(`invalid bundle file type: ${file.destination}`);
    }
  }
  if (layout.externalInputs.length !== 1 || layout.externalInputs[0]?.name !== "release-verify.pub") {
    throw new Error("delivery bundle must declare the root-bootstrap trust key input");
  }
  for (const input of layout.externalInputs) {
    if (input.owner !== "root:root" || input.mode !== "0400" || input.provisioning !== "root-bootstrap") {
      throw new Error(`invalid external input policy: ${input.name}`);
    }
    if (!input.destination.startsWith("/var/lib/munjib/security/bootstrap/") || input.destination.split("/").includes("..")) {
      throw new Error(`invalid external input destination: ${input.destination}`);
    }
  }
}

function readLayout(rootDir: string): { root: string; layout: BundleLayout; layoutSha256: string } {
  const root = resolve(rootDir);
  const layoutBytes = readFileSync(join(root, layoutRelativePath));
  const layout = JSON.parse(layoutBytes.toString("utf8")) as BundleLayout;
  assertLayout(layout);
  return { root, layout, layoutSha256: sha256(canonicalJson(layout)) };
}

function assertInside(parent: string, candidate: string, label: string): void {
  if (relative(parent, candidate).startsWith("..")) throw new Error(`${label} escapes its fixed root`);
}

function ensureRegularFile(path: string, label: string): void {
  if (!lstatSync(path).isFile()) throw new Error(`${label} is not a regular non-symlink file`);
}

function assertLinuxArm64Elf(bytes: Buffer, label: string): void {
  const osAbi = bytes[7];
  const fileType = bytes.length >= 18 ? bytes.readUInt16LE(16) : 0;
  const isArm64Elf =
    bytes.length >= 64 &&
    bytes[0] === 0x7f &&
    bytes.subarray(1, 4).toString("ascii") === "ELF" &&
    bytes[4] === 2 &&
    bytes[5] === 1 &&
    bytes[6] === 1 &&
    (osAbi === 0 || osAbi === 3) &&
    (fileType === 2 || fileType === 3) &&
    bytes.readUInt16LE(18) === 183 &&
    bytes.readUInt32LE(20) === 1 &&
    bytes.readUInt16LE(52) === 64;
  if (!isArm64Elf) throw new Error(`${label} must be an ELF64 little-endian AArch64 binary`);
}

function copyFixedFile(source: string, destination: string, mode: string): void {
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  copyFileSync(source, destination);
  chmodSync(destination, parseInt(mode, 8));
}

function relativePayloadPath(destination: string): string {
  return join(payloadDirectory, destination.slice(1));
}

export function buildDeliveryBundle(rootDir: string, artifactDir: string, outputDir: string): DeliveryBundleManifest {
  const { root, layout, layoutSha256 } = readLayout(rootDir);
  const realRoot = realpathSync(root);
  const artifacts = resolve(artifactDir);
  const realArtifacts = realpathSync(artifacts);
  const output = resolve(outputDir);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  if (readdirSync(output).length !== 0) throw new Error("delivery bundle output must be empty");
  const payloadRoot = join(output, payloadDirectory);
  mkdirSync(payloadRoot, { recursive: true, mode: 0o700 });

  const files = [...layout.files]
    .sort((left, right) => left.destination.localeCompare(right.destination))
    .map((entry) => {
      let sourcePath: string;
      if (entry.type === "binary") {
        sourcePath = resolve(artifacts, entry.artifact!);
        assertInside(artifacts, sourcePath, "binary artifact");
      } else {
        sourcePath = resolve(root, entry.source!);
        assertInside(root, sourcePath, "repository source");
      }
      ensureRegularFile(sourcePath, entry.type === "binary" ? entry.artifact! : entry.source!);
      const realSource = realpathSync(sourcePath);
      assertInside(entry.type === "binary" ? realArtifacts : realRoot, realSource, "bundle source");
      const bytes = readFileSync(sourcePath);
      if (entry.type === "binary") assertLinuxArm64Elf(bytes, entry.artifact!);
      const digest = sha256(bytes);
      if (entry.type === "repository" && digest !== entry.sha256) throw new Error(`repository checksum mismatch: ${entry.source}`);
      const destination = join(output, relativePayloadPath(entry.destination));
      assertInside(output, destination, "payload destination");
      copyFixedFile(sourcePath, destination, entry.mode);
      return { ...entry, sha256: digest };
    });

  const manifest: DeliveryBundleManifest = {
    format: "munjib-delivery-bundle-manifest-v2",
    version: 2,
    bundle: "delivery-substrate-v1",
    target: layout.target,
    payloadDirectory,
    layoutSha256,
    files,
    externalInputs: layout.externalInputs,
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(output, manifestName), manifestBytes, { mode: 0o400 });
  writeFileSync(join(output, digestName), `${sha256(manifestBytes)}  ${manifestName}\n`, { mode: 0o400 });
  return manifest;
}

function readManifest(bundleDir: string): { bundle: string; manifest: DeliveryBundleManifest; bytes: Buffer } {
  const bundle = resolve(bundleDir);
  ensureRegularFile(join(bundle, manifestName), manifestName);
  const bytes = readFileSync(join(bundle, manifestName));
  const manifest = JSON.parse(bytes.toString("utf8")) as DeliveryBundleManifest;
  if (manifest.format !== "munjib-delivery-bundle-manifest-v2" || manifest.version !== 2 || manifest.bundle !== "delivery-substrate-v1") {
    throw new Error("invalid delivery bundle manifest");
  }
  return { bundle, manifest, bytes };
}

function walkPayload(root: string, current: string, files: Set<string>): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`payload contains a symlink: ${relative(root, path)}`);
    if (entry.isDirectory()) walkPayload(root, path, files);
    else if (entry.isFile()) files.add(relative(root, path));
    else throw new Error(`payload contains an unsupported entry: ${relative(root, path)}`);
  }
}

export function verifyDeliveryBundle(rootDir: string, bundleDir: string): DeliveryBundleManifest {
  const { layoutSha256, layout } = readLayout(rootDir);
  const { bundle, manifest, bytes } = readManifest(bundleDir);
  const topLevel = readdirSync(bundle, { withFileTypes: true });
  const allowedTopLevel = new Set([manifestName, digestName, payloadDirectory]);
  for (const entry of topLevel) {
    if (entry.isSymbolicLink() || !allowedTopLevel.has(entry.name)) throw new Error(`delivery bundle contains an unexpected top-level entry: ${entry.name}`);
  }
  ensureRegularFile(join(bundle, digestName), digestName);
  if (!lstatSync(join(bundle, payloadDirectory)).isDirectory()) throw new Error("delivery bundle payload root is not a directory");
  if (manifest.target.goos !== "linux" || manifest.target.goarch !== "arm64" || manifest.payloadDirectory !== payloadDirectory) {
    throw new Error("delivery bundle target or payload root is invalid");
  }
  if (manifest.layoutSha256 !== layoutSha256) throw new Error("delivery bundle layout digest mismatch");
  if (JSON.stringify(manifest.externalInputs) !== JSON.stringify(layout.externalInputs)) throw new Error("external input policy mismatch");
  const expected = [...layout.files].sort((left, right) => left.destination.localeCompare(right.destination));
  if (manifest.files.length !== expected.length) throw new Error("delivery bundle file count mismatch");
  const expectedPayload = new Set<string>();
  for (let index = 0; index < expected.length; index += 1) {
    const expectedEntry = expected[index]!;
    const actual = manifest.files[index]!;
    if (actual.destination !== expectedEntry.destination || actual.type !== expectedEntry.type || actual.owner !== expectedEntry.owner || actual.mode !== expectedEntry.mode) {
      throw new Error(`delivery bundle entry mismatch: ${expectedEntry.destination}`);
    }
    if (expectedEntry.type === "binary" && actual.artifact !== expectedEntry.artifact) throw new Error(`binary artifact mismatch: ${expectedEntry.destination}`);
    if (expectedEntry.type === "repository" && (actual.source !== expectedEntry.source || actual.sha256 !== expectedEntry.sha256)) {
      throw new Error(`repository source or checksum mismatch: ${expectedEntry.destination}`);
    }
    if (!/^[a-f0-9]{64}$/.test(actual.sha256)) throw new Error(`invalid artifact checksum: ${expectedEntry.destination}`);
    const payloadPath = join(bundle, relativePayloadPath(actual.destination));
    assertInside(bundle, payloadPath, "payload file");
    ensureRegularFile(payloadPath, actual.destination);
    if ((statSync(payloadPath).mode & 0o777).toString(8).padStart(4, "0") !== actual.mode) throw new Error(`payload mode mismatch: ${actual.destination}`);
    const payloadBytes = readFileSync(payloadPath);
    if (sha256(payloadBytes) !== actual.sha256) throw new Error(`payload checksum mismatch: ${actual.destination}`);
    if (expectedEntry.type === "binary") assertLinuxArm64Elf(payloadBytes, actual.destination);
    expectedPayload.add(relative(bundle, payloadPath));
  }
  const payloadRoot = join(bundle, payloadDirectory);
  const actualPayload = new Set<string>();
  walkPayload(bundle, payloadRoot, actualPayload);
  if (actualPayload.size !== expectedPayload.size || [...actualPayload].some((path) => !expectedPayload.has(path))) throw new Error("payload contains an unexpected file");
  const digest = readFileSync(join(bundle, digestName), "utf8");
  if (digest !== `${sha256(bytes)}  ${manifestName}\n`) throw new Error("delivery bundle manifest digest mismatch");
  return manifest;
}
