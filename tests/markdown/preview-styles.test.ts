import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("markdown preview styles", () => {
  test("preserves single line breaks inside preview paragraphs", async () => {
    const css = await readFile("app/globals.css", "utf8");

    expect(css).toMatch(/\.markdown-preview\s+p\s*\{[\s\S]*?white-space:\s*pre-wrap;/);
  });
});
