import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { decode, encode } from "next-auth/jwt";
import { parse } from "yaml";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const packageJson = JSON.parse(read("package.json")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  pnpm?: { overrides?: Record<string, string> };
};
const lockfile = parse(read("pnpm-lock.yaml")) as {
  packages?: Record<string, unknown>;
  snapshots?: Record<string, { dependencies?: Record<string, string> }>;
};

const packageKeys = Object.keys(lockfile.packages ?? {});
const snapshots = lockfile.snapshots ?? {};

describe("production dependency audit remediation", () => {
  test("pins every advisory package to its patched compatibility floor", () => {
    expect(packageJson.pnpm?.overrides).toMatchObject({
      postcss: "8.5.23",
      uuid: "11.1.1",
      "minimatch@10.2.5>brace-expansion": "5.0.12",
      "@opentelemetry/core": "2.8.0",
      "@opentelemetry/propagator-jaeger": "2.9.0",
      "fast-uri": "3.1.9",
      "zod@4": "4.6.6",
      "nanoid": "3.3.18",
      "protobufjs": "7.6.5",
      "sharp": "0.35.5",
      "deepmerge-ts": "8.0.0",
    });
  });

  test("does not retain a vulnerable PostCSS package in the lock graph", () => {
    expect(packageKeys).not.toContain("postcss@8.4.31");
  });

  test("does not retain a vulnerable NextAuth UUID package in the lock graph", () => {
    expect(packageKeys).not.toContain("uuid@8.3.2");
  });

  test("does not retain a vulnerable Sentry brace-expansion package in the lock graph", () => {
    expect(packageKeys).not.toContain("brace-expansion@5.0.5");
  });

  test("does not retain an outdated OpenTelemetry core package in the lock graph", () => {
    expect(packageKeys).not.toContain("@opentelemetry/core@2.7.1");
  });

  test("does not retain the vulnerable DeepmergeTS package in the lock graph", () => {
    expect(packageKeys).not.toContain("deepmerge-ts@7.1.5");
    expect(packageKeys).toContain("deepmerge-ts@8.0.0");
  });

  test("scopes brace-expansion v5 to minimatch v10 without a global override", () => {
    expect(packageJson.pnpm?.overrides).toMatchObject({
      "minimatch@10.2.5>brace-expansion": "5.0.12",
    });
    expect(packageJson.pnpm?.overrides).not.toHaveProperty("brace-expansion");
    expect(packageKeys).toEqual(
      expect.arrayContaining(["brace-expansion@1.1.16", "brace-expansion@5.0.12"]),
    );
    expect(snapshots["minimatch@3.1.5"]?.dependencies?.["brace-expansion"]).toBe(
      "1.1.16",
    );
    expect(snapshots["minimatch@10.2.5"]?.dependencies?.["brace-expansion"]).toBe(
      "5.0.12",
    );
  });

  test("keeps minimatch 3 callable with its brace-expansion 1 API", () => {
    const rootRequire = createRequire(join(root, "package.json"));
    const eslintRequire = createRequire(rootRequire.resolve("eslint/package.json"));
    const minimatchPath = eslintRequire.resolve("minimatch");
    const minimatch3 = createRequire(minimatchPath)("./") as (
      value: string,
      pattern: string,
    ) => boolean;

    expect(typeof minimatch3).toBe("function");
    expect(minimatch3("report.md", "{report,notes}.md")).toBe(true);
    expect(minimatch3("image.png", "{report,notes}.md")).toBe(false);
  });

  test("keeps NextAuth JWT UUID generation compatible with the patched uuid package", async () => {
    const secret = "dependency-audit-test-secret";
    const encoded = await encode({ secret, token: { sub: "user-1" } });
    const decoded = await decode({ secret, token: encoded });

    expect(decoded?.sub).toBe("user-1");
    expect(decoded?.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  test("loads Sentry and OpenTelemetry runtime entry points", async () => {
    const [sentry, opentelemetry] = await Promise.all([
      import("@sentry/nextjs"),
      import("@opentelemetry/sdk-node"),
    ]);

    expect(typeof sentry.init).toBe("function");
    expect(typeof opentelemetry.NodeSDK).toBe("function");
  });
});
