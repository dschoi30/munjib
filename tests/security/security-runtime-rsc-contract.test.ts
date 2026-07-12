import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const source = readFileSync(
  join(process.cwd(), "tests/e2e/security-runtime.spec.ts"),
  "utf8",
);

describe("security runtime RSC smoke contract", () => {
  test("captures the streamed RSC body in a route handler before fulfilling it", () => {
    expect(source).toContain('page.route("**/*_rsc=*"');
    expect(source).toContain("const upstream = await route.fetch();");
    expect(source).toContain("const body = await upstream.body();");
    expect(source).toContain("await route.fulfill({ response: upstream, body });");
    expect(source).not.toContain("await response.body()");
  });
});
