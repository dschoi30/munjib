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

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("delivery substrate bundle", () => {
  it("builds a deterministic linux/arm64 manifest with fixed ownership and external trust input", () => {
    const artifactDir = temporaryDirectory("munjib-delivery-artifacts-");
    const outputDir = temporaryDirectory("munjib-delivery-output-");
    for (const name of ["munjib-release-broker", "munjib-release-submit", "munjib-release-verify"]) {
      const path = join(artifactDir, name);
      writeFileSync(path, `fake-${name}\n`);
      chmodSync(path, 0o755);
    }

    const manifest = buildDeliveryBundle(rootDir, artifactDir, outputDir);
    expect(manifest).toMatchObject({
      format: "munjib-delivery-bundle-manifest-v1",
      version: 1,
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

  it("rejects a tampered payload before any installer can consume it", () => {
    const artifactDir = temporaryDirectory("munjib-delivery-artifacts-");
    const outputDir = temporaryDirectory("munjib-delivery-output-");
    for (const name of ["munjib-release-broker", "munjib-release-submit", "munjib-release-verify"]) writeFileSync(join(artifactDir, name), name);
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
    for (const name of ["munjib-release-submit", "munjib-release-verify"]) writeFileSync(join(artifactDir, name), name);
    expect(() => buildDeliveryBundle(rootDir, artifactDir, outputDir)).toThrow("regular non-symlink");
  });
});
