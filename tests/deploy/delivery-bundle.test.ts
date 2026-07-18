import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDeliveryBundle, verifyDeliveryBundle } from "@/scripts/deploy/delivery-bundle";

const rootDir = process.cwd();
const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function linuxArm64Elf(label: string): Buffer {
  const bytes = Buffer.alloc(120);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
  bytes.writeUInt16LE(2, 16);
  bytes.writeUInt16LE(183, 18);
  bytes.writeUInt32LE(1, 20);
  bytes.writeUInt16LE(64, 52);
  bytes.writeUInt16LE(56, 54);
  bytes.writeUInt16LE(1, 56);
  bytes.writeUInt16LE(64, 58);
  bytes.writeBigUInt64LE(BigInt(64), 32);
  bytes.writeUInt32LE(1, 64);
  bytes.writeBigUInt64LE(BigInt(0), 72);
  bytes.writeBigUInt64LE(BigInt(bytes.length), 96);
  bytes.writeBigUInt64LE(BigInt(bytes.length), 104);
  bytes.write(label.slice(0, 4), 24, "utf8");
  return bytes;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("delivery substrate bundle", () => {
  it("accepts the pnpm argument separator in both CLI wrappers", () => {
    const buildCli = readFileSync(join(rootDir, "scripts/deploy/build-delivery-bundle.ts"), "utf8");
    const verifyCli = readFileSync(join(rootDir, "scripts/deploy/verify-delivery-bundle.ts"), "utf8");
    expect(buildCli).toContain('argument !== "--"');
    expect(verifyCli).toContain('argument !== "--"');
  });

  it("builds a deterministic linux/arm64 manifest with fixed ownership and external trust input", () => {
    const artifactDir = temporaryDirectory("munjib-delivery-artifacts-");
    const outputDir = temporaryDirectory("munjib-delivery-output-");
    for (const name of ["munjib-release-broker", "munjib-release-submit", "munjib-release-verify"]) {
      const path = join(artifactDir, name);
      writeFileSync(path, linuxArm64Elf(name));
      chmodSync(path, 0o755);
    }

    const manifest = buildDeliveryBundle(rootDir, artifactDir, outputDir);
    expect(manifest).toMatchObject({
      format: "munjib-delivery-bundle-manifest-v2",
      version: 2,
      bundle: "delivery-substrate-v1",
      target: { goos: "linux", goarch: "arm64" },
      payloadDirectory: "payload",
      externalInputs: [{ name: "release-verify.pub", provisioning: "root-bootstrap" }],
    });
    expect(manifest.files).toHaveLength(8);
    expect(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(readFileSync(join(outputDir, "bundle.sha256"), "utf8")).toMatch(/^[a-f0-9]{64}  manifest\.json\n$/);
    expect(verifyDeliveryBundle(rootDir, outputDir).files).toEqual(manifest.files);
  });

  it("rejects a non-ARM64 binary before labeling the bundle linux/arm64", () => {
    const artifactDir = temporaryDirectory("munjib-delivery-artifacts-");
    const outputDir = temporaryDirectory("munjib-delivery-output-");
    for (const name of ["munjib-release-broker", "munjib-release-submit", "munjib-release-verify"]) {
      writeFileSync(join(artifactDir, name), linuxArm64Elf(name));
    }
    const amd64 = linuxArm64Elf("amd64");
    amd64.writeUInt16LE(62, 18);
    writeFileSync(join(artifactDir, "munjib-release-broker"), amd64);

    expect(() => buildDeliveryBundle(rootDir, artifactDir, outputDir)).toThrow("must be an ELF64 little-endian AArch64 binary");
  });

  it("rejects an incomplete ELF header even when its machine field says AArch64", () => {
    const artifactDir = temporaryDirectory("munjib-delivery-artifacts-");
    const outputDir = temporaryDirectory("munjib-delivery-output-");
    for (const name of ["munjib-release-broker", "munjib-release-submit", "munjib-release-verify"]) {
      writeFileSync(join(artifactDir, name), linuxArm64Elf(name));
    }
    const incomplete = linuxArm64Elf("fake").subarray(0, 20);
    writeFileSync(join(artifactDir, "munjib-release-broker"), incomplete);

    expect(() => buildDeliveryBundle(rootDir, artifactDir, outputDir)).toThrow("must be an ELF64 little-endian AArch64 binary");
  });

  it("rejects a header-only ELF without a complete loadable program segment", () => {
    const artifactDir = temporaryDirectory("munjib-delivery-artifacts-");
    const outputDir = temporaryDirectory("munjib-delivery-output-");
    for (const name of ["munjib-release-broker", "munjib-release-submit", "munjib-release-verify"]) {
      writeFileSync(join(artifactDir, name), linuxArm64Elf(name));
    }
    const headerOnly = linuxArm64Elf("fake").subarray(0, 64);
    writeFileSync(join(artifactDir, "munjib-release-broker"), headerOnly);

    expect(() => buildDeliveryBundle(rootDir, artifactDir, outputDir)).toThrow("must be an ELF64 little-endian AArch64 binary");
  });

  it("rejects an empty PT_LOAD segment that cannot describe executable bytes", () => {
    const artifactDir = temporaryDirectory("munjib-delivery-artifacts-");
    const outputDir = temporaryDirectory("munjib-delivery-output-");
    for (const name of ["munjib-release-broker", "munjib-release-submit", "munjib-release-verify"]) {
      writeFileSync(join(artifactDir, name), linuxArm64Elf(name));
    }
    const emptySegment = linuxArm64Elf("fake");
    emptySegment.writeBigUInt64LE(BigInt(0), 96);
    writeFileSync(join(artifactDir, "munjib-release-broker"), emptySegment);

    expect(() => buildDeliveryBundle(rootDir, artifactDir, outputDir)).toThrow("must be an ELF64 little-endian AArch64 binary");
  });

  it("rejects a bundle whose checksums describe a non-ARM64 binary", () => {
    const artifactDir = temporaryDirectory("munjib-delivery-artifacts-");
    const outputDir = temporaryDirectory("munjib-delivery-output-");
    for (const name of ["munjib-release-broker", "munjib-release-submit", "munjib-release-verify"]) {
      writeFileSync(join(artifactDir, name), linuxArm64Elf(name));
    }
    buildDeliveryBundle(rootDir, artifactDir, outputDir);

    const amd64 = linuxArm64Elf("amd64");
    amd64.writeUInt16LE(62, 18);
    writeFileSync(join(outputDir, "payload/usr/local/libexec/munjib-release-broker"), amd64, { mode: 0o755 });
    const manifestPath = join(outputDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.files.find((file: { artifact?: string }) => file.artifact === "munjib-release-broker").sha256 = sha256(amd64);
    const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
    chmodSync(manifestPath, 0o600);
    chmodSync(join(outputDir, "bundle.sha256"), 0o600);
    writeFileSync(manifestPath, manifestBytes, { mode: 0o400 });
    writeFileSync(join(outputDir, "bundle.sha256"), `${sha256(manifestBytes)}  manifest.json\n`, { mode: 0o400 });

    expect(() => verifyDeliveryBundle(rootDir, outputDir)).toThrow("must be an ELF64 little-endian AArch64 binary");
  });

  it("rejects a tampered payload before any installer can consume it", () => {
    const artifactDir = temporaryDirectory("munjib-delivery-artifacts-");
    const outputDir = temporaryDirectory("munjib-delivery-output-");
    for (const name of ["munjib-release-broker", "munjib-release-submit", "munjib-release-verify"]) {
      writeFileSync(join(artifactDir, name), linuxArm64Elf(name));
    }
    buildDeliveryBundle(rootDir, artifactDir, outputDir);
    writeFileSync(join(outputDir, "payload/usr/local/libexec/munjib-release-broker"), "tampered");
    expect(() => verifyDeliveryBundle(rootDir, outputDir)).toThrow("payload checksum mismatch");
  });

  it("rejects symlinked build inputs instead of dereferencing them", () => {
    const artifactDir = temporaryDirectory("munjib-delivery-artifacts-");
    const outside = temporaryDirectory("munjib-delivery-outside-");
    const outputDir = temporaryDirectory("munjib-delivery-output-");
    writeFileSync(join(outside, "broker"), "not a build artifact");
    symlinkSync(join(outside, "broker"), join(artifactDir, "munjib-release-broker"));
    for (const name of ["munjib-release-submit", "munjib-release-verify"]) {
      writeFileSync(join(artifactDir, name), linuxArm64Elf(name));
    }
    expect(() => buildDeliveryBundle(rootDir, artifactDir, outputDir)).toThrow("regular non-symlink");
  });
});
