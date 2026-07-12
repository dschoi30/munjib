import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

interface BundleFile {
  source: string;
  destination: string;
  type: "regular";
  mode: "0400";
  sha256: string;
}

interface DatabaseRoleManifest {
  format: "munjib-database-role-bundle-v1";
  version: 1;
  bundle: "database-role-v1";
  files: BundleFile[];
}

const manifestRelativePath = "deploy/host-bundles/database-role-v1/manifest.json";

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildDatabaseRoleBundle(rootDir: string, outputDir: string): string[] {
  const root = resolve(rootDir);
  const manifestPath = join(root, manifestRelativePath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as DatabaseRoleManifest;
  if (manifest.format !== "munjib-database-role-bundle-v1" || manifest.version !== 1 || manifest.bundle !== "database-role-v1") {
    throw new Error("invalid database role bundle manifest");
  }
  const output = resolve(outputDir);
  const copied: string[] = [];
  for (const entry of manifest.files) {
    if (entry.type !== "regular" || entry.mode !== "0400" || !entry.source || !entry.destination || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`invalid database role bundle entry: ${entry.source}`);
    }
    if (isAbsolute(entry.source) || entry.source.includes("..") || !entry.source.startsWith("deploy/")) {
      throw new Error(`manifest source escapes repository: ${entry.source}`);
    }
    const source = resolve(root, entry.source);
    if (relative(root, source).startsWith("..")) throw new Error("manifest source escapes root");
    if (!statSync(source).isFile()) throw new Error(`bundle source is not a regular file: ${entry.source}`);
    const bytes = readFileSync(source);
    if (sha256(bytes) !== entry.sha256) throw new Error(`bundle checksum mismatch: ${entry.source}`);
    const relativeDestination = entry.destination.replace(/^\/var\/lib\/munjib\/database-role-v1\//, "");
    if (!relativeDestination || relativeDestination.includes("..") || relativeDestination.includes("/")) {
      throw new Error(`invalid bundle destination: ${entry.destination}`);
    }
    const destination = join(output, relativeDestination);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    copyFileSync(source, destination);
    chmodSync(destination, 0o400);
    copied.push(destination);
  }
  writeFileSync(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o400 });
  return copied;
}

if (process.argv[1]?.endsWith("build-database-role-bundle.ts")) {
  const outputDir = process.argv[2] ?? "/tmp/munjib-database-role-v1";
  buildDatabaseRoleBundle(process.cwd(), outputDir);
}
