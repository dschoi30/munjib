import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

async function source(path: string) {
  return readFile(resolve(root, path), "utf8");
}

describe("user/provider media source contract", () => {
  it("keeps an inventory of every ambient media vocabulary used by the app", () => {
    const inventory = [
      ".image",
      "avatar",
      "picture",
      "profile.image",
      "session.user.image",
      "<img",
      "next/image",
      "src",
      "srcSet",
      "poster",
      "url()",
      "preload",
    ];

    expect(inventory).toEqual(expect.arrayContaining([
      ".image",
      "avatar",
      "picture",
      "profile.image",
      "session.user.image",
      "<img",
      "next/image",
      "src",
      "srcSet",
      "poster",
      "url()",
      "preload",
    ]));
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
});
