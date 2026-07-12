import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

async function source(path: string) {
  return readFile(resolve(root, path), "utf8");
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = directory + "/" + entry.name;
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(relative));
    } else if (/\.(?:ts|tsx|js|jsx|mjs|css)$/.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
}

describe("user/provider media source contract", () => {
  it("scans application source for ambient media sources and render sinks", async () => {
    const files = [
      ...(await sourceFiles("app")),
      ...(await sourceFiles("components")),
      ...(await sourceFiles("lib")),
      "next.config.mjs",
    ];
    const sourceVocabulary = /(?:\.image|avatar|picture|profile\.image|session\.user\.image)/i;
    const sinkVocabulary = /(?:<img|next\/image|\bsrc(?:Set)?\b|\bposter\b|url\(|preload|prefetch|preconnect)/i;
    const inventory = (await Promise.all(files.map(async (file) => {
      const contents = await source(file);
      return contents
        .split("\n")
        .map((line, index) => ({ file, line: index + 1, contents: line }))
        .filter((entry) => sourceVocabulary.test(entry.contents));
    }))).flat();

    expect(inventory.length).toBeGreaterThan(5);
    expect(inventory.some((entry) => entry.file === "lib/auth/config.ts")).toBe(true);
    expect(inventory.map((entry) => entry.contents).join("\n")).toMatch(/image|avatar|picture/i);
    const unguarded = inventory.filter((entry) =>
      sinkVocabulary.test(entry.contents) &&
      !entry.contents.includes("zeroAmbientSessionImage") &&
      !entry.contents.includes("classifyMarkdownImageSource"),
    );
    expect(unguarded).toEqual([]);
  });

  it("routes auth DTO construction through the reserved zero-media slot", async () => {
    const config = await source("lib/auth/config.ts");
    const leaf4 = await source("lib/auth/downstream/leaf4.ts");

    expect(config).toContain('from "@/lib/auth/downstream/leaf4"');
    expect(config).not.toMatch(/image:\s*user\.image/);
    expect(config).not.toMatch(/(?:profile|account)\s*\.\s*(?:image|picture)/);
    expect(leaf4).toContain("zeroAmbientSessionImage");
    expect(leaf4).toContain("stripAmbientTokenMedia");
    expect(leaf4).not.toContain("@/lib/auth/config");
    expect(leaf4).not.toContain("@/lib/auth/session-image");
    expect(leaf4).not.toContain("downstream/contract");
  });

  it("allows only the explicit authenticated attachment renderer", async () => {
    const safeMedia = await source("components/markdown/safe-media.tsx");
    const policy = await source("lib/markdown/media-policy.ts");
    const nextConfig = await source("next.config.mjs");

    expect(safeMedia).toContain("classifyMarkdownImageSource");
    expect(safeMedia).toContain("decision.kind === \"attachment\"");
    expect(safeMedia).not.toContain("next/image");
    expect(policy).toContain("allowedAttachmentIds");
    expect(policy).toContain("attachmentPath");
    expect(nextConfig).not.toMatch(/remotePatterns|images:\s*\{|loader:\s*["']/);
    expect(nextConfig).not.toMatch(/google|avatar|image-proxy/i);
  });

  it("does not expose ambient media through workspace user props", async () => {
    const page = await source("app/workspaces/[workspaceSlug]/page.tsx");
    const list = await source("components/document-list.tsx");
    const session = await source("lib/auth/session.ts");

    expect(page).toContain("currentUser={{ name: user.name ?? null, email: user.email ?? \"\" }}");
    expect(page).not.toContain("user.image");
    expect(list).not.toContain("currentUser.image");
    expect(session).not.toContain("session.user.image");
  });

  it("rejects test-only response and stream shortcuts in the browser oracle", async () => {
    const oracle = await source("tests/e2e/zero-egress-rendering.spec.ts");
    const fixture = await source("tests/e2e/fixtures/zero-egress-app-fixture.ts");
    const probe = await source("tests/e2e/fixtures/egress-probe-server.ts");
    for (const contents of [oracle, fixture]) {
      expect(contents).not.toMatch(/page\.route|route\.fulfill|route\.continue/);
      expect(contents).not.toMatch(/application\/x-ndjson|new\s+Response\s*\(/i);
      expect(contents).not.toMatch(/type\s*:\s*["'](?:start|token|done)["']/);
      expect(contents).not.toMatch(/addInitScript|setContent\s*\(/);
    }
    expect(probe).toContain("server.listen(PROBE_PORT, PROBE_BIND_HOST)");
    expect(probe).toContain('|| "127.0.0.1"');
    expect(probe).toContain("MUNJIB_EGRESS_PROBE_BIND_HOST");
    expect(probe).toMatch(/access-control-allow-headers/i);
    expect(probe).toContain("x-egress-probe-caller");
    expect(oracle).toContain("waitForTimeout");
    expect(oracle).toMatch(/script\[type=["']application\/json["']\]/);
    expect(oracle).toContain("style");
  });

  it("uses a real test-only provider transport and does not pre-seed assistant output", async () => {
    const fixture = await source("tests/e2e/fixtures/zero-egress-app-fixture.ts");
    const transport = await source("app/api/test/provider/[...path]/route.ts");
    const calibration = await source("app/api/test/egress-calibration/route.ts");
    const transportGate = await source("lib/security/test-transport.ts");
    expect(fixture).toContain("hashPassword");
    expect(fixture).toContain("passwordHash");
    expect(fixture).not.toContain("aiChatThread.create");
    expect(fixture).toContain("providerProfile");
    expect(fixture).toContain("jwtPayload");
    expect(fixture).toContain("sessionPayload");
    expect(transportGate).toContain("MUNJIB_E2E_PROVIDER_TRANSPORT");
    expect(transportGate).toContain("MUNJIB_DEPLOYMENT_ENV");
    expect(transport).toContain("chat/completions");
    expect(transport).toContain("embeddings");
    expect(calibration).toContain("MUNJIB_EGRESS_PROBE_SERVER_ORIGIN");
    expect(calibration).toContain("x-egress-probe-caller");
    expect(calibration).toContain('"server"');
    expect(calibration).toContain("isTestTransportEnabled");
  });

  it("keeps the in-process probe loopback-only and makes container reachability explicit", async () => {
    const probe = await source("tests/e2e/fixtures/egress-probe-server.ts");
    const overlay = await source("docker-compose.egress-test.yml");

    expect(probe).toMatch(
      /MUNJIB_EGRESS_PROBE_BIND_HOST\?\.trim\(\) \|\| "127\.0\.0\.1"/,
    );
    expect(overlay).toContain("MUNJIB_EGRESS_PROBE_BIND_HOST: 0.0.0.0");
    expect(overlay).toContain("process.env.MUNJIB_EGRESS_PROBE_BIND_HOST");
    expect(overlay).toContain('ports:\n      - "127.0.0.1:39158:39158"');
  });

  it("runs the zero-egress harness in a parsed non-production environment", async () => {
    const playwright = await source("playwright.config.ts");
    const overlay = await source("docker-compose.egress-test.yml");

    expect(playwright).toContain("NEXTAUTH_URL=http://localhost:3000");
    expect(playwright).toContain("MUNJIB_DEPLOYMENT_ENV=development");
    expect(playwright).toContain("MUNJIB_E2E_PROVIDER_TRANSPORT=true");
    expect(playwright).toContain("pnpm exec next dev --turbo");
    expect(overlay).toContain("MUNJIB_DEPLOYMENT_ENV: development");
    expect(overlay).toContain('MUNJIB_E2E_PROVIDER_TRANSPORT: "true"');
  });
});
