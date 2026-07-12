import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("auth downstream extension contract", () => {
  it("pins the hook boundary and final image sanitizer", () => {
    const contract = readFileSync("lib/auth/downstream/contract.ts", "utf8");
    const config = readFileSync("lib/auth/config.ts", "utf8");
    expect(contract).toContain("AuthDownstreamHooks");
    expect(contract).toContain("Object.freeze");
    expect(config).toContain("sanitizeInternalSessionImage");
  });
});
