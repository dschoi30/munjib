import { describe, expect, it } from "vitest";
import {
  classifyMarkdownImageSource,
  externalOriginLabel,
  safeMarkdownLinkHref,
} from "@/lib/markdown/media-policy";

describe("Markdown media policy", () => {
  const allowed = new Set(["att-authorized"]);

  it("renders only an exact authorized attachment path", () => {
    expect(classifyMarkdownImageSource("/api/attachments/att-authorized", allowed)).toEqual({
      kind: "attachment",
      attachmentId: "att-authorized",
      src: "/api/attachments/att-authorized",
    });
    expect(classifyMarkdownImageSource("/api/attachments/att-forged", allowed)).toEqual({
      kind: "blocked",
    });
    expect(classifyMarkdownImageSource("/api/attachments/att-authorized?download=1", allowed)).toEqual({
      kind: "blocked",
    });
    expect(classifyMarkdownImageSource("/same-origin/private", allowed)).toEqual({
      kind: "blocked",
    });
  });

  it.each([
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "blob:https://munjib.example/id",
    "//attacker.example/pixel.png",
    String.raw`\\attacker.example/pixel.png`,
    String.raw`/\attacker.example/pixel.png`,
    "https://user:password@attacker.example/pixel.png",
    "https://attacker.example/pixel\u0000.png",
    "about:blank",
  ])("blocks unsafe image source %s", (src) => {
    expect(classifyMarkdownImageSource(src, allowed)).toEqual({ kind: "blocked" });
  });

  it("turns only absolute HTTP destinations into click-only external media", () => {
    expect(classifyMarkdownImageSource("https://cdn.example/path/pixel.png?q=secret", allowed)).toEqual({
      kind: "external",
      href: "https://cdn.example/path/pixel.png?q=secret",
      originLabel: "https://cdn.example",
    });
    expect(externalOriginLabel("https://cdn.example/path/pixel.png?q=secret")).toBe(
      "https://cdn.example",
    );
  });

  it("sanitizes ordinary links independently from image rendering", () => {
    expect(safeMarkdownLinkHref("https://example.com/runbook")).toBe(
      "https://example.com/runbook",
    );
    expect(safeMarkdownLinkHref("/workspaces/company-handbook?document=doc-1")).toBe(
      "/workspaces/company-handbook?document=doc-1",
    );
    expect(safeMarkdownLinkHref("#section")).toBe("#section");
    expect(safeMarkdownLinkHref("//attacker.example/path")).toBeNull();
    expect(safeMarkdownLinkHref("javascript:alert(1)")).toBeNull();
  });

  it.each([
    String.raw`\\attacker.example/path`,
    String.raw`/\attacker.example/path`,
    "//user:password@attacker.example/path",
    "https://user:password@example.com/path",
    "/safe\nattacker",
    "/safe\tattacker",
    "/safe\u0000attacker",
    "#safe\u007fattacker",
  ])("rejects backslash, control, authority, or credential smuggling: %s", (href) => {
    expect(safeMarkdownLinkHref(href)).toBeNull();
  });

  it("canonicalizes a safe relative URL only through the fixed sentinel", () => {
    expect(safeMarkdownLinkHref("/workspaces/company-handbook/../company-handbook?document=doc-1#section"))
      .toBe("/workspaces/company-handbook?document=doc-1#section");
    expect(safeMarkdownLinkHref("#section")).toBe("#section");
  });
});
