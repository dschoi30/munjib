import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("disables DNS prefetch on every application response", async () => {
  const source = await readFile("next.config.mjs", "utf8");
  expect(source).toContain('source: "/:path*"');
  expect(source).toContain('key: "X-DNS-Prefetch-Control"');
  expect(source).toContain('value: "off"');
});
