import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

describe("invite-first signup readiness handoff", () => {
  test("documents the dependency-safe boundary", () => {
    const runbook = read("docs/runbooks/invite-signup-gate-readiness.md");

    expect(runbook).toContain("Issue #161");
    expect(runbook).toContain("#162");
    expect(runbook).toContain("#180");
    expect(runbook).toContain("#184");
    expect(runbook).toContain("#185");
    expect(runbook).toContain("Leaf 2");
    expect(runbook).toContain("PREPARATION_ONLY");
    expect(runbook).toMatch(/does not add invitation tables, attempt cookies, link grants/i);
    expect(runbook).toMatch(/Issue #161 remains open/i);
  });

  test("does not include an executable operation or secret material", () => {
    const runbook = read("docs/runbooks/invite-signup-gate-readiness.md");

    expect(runbook).not.toMatch(/\|\|\s*true|docker\s+(run|compose\s+(up|exec|run))|\bsudo\b|\bsetuid\b/i);
    expect(runbook).not.toMatch(/(?:postgres(?:ql)?:\/\/|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,})/);
  });

  test("keeps the checked-in contract free of activation or credentials", () => {
    const contract = read("deploy/security/signup/invite-first-readiness-v1.json");

    expect(contract).toContain("PREPARATION_ONLY");
    expect(contract).not.toMatch(/ACTIVE|ACCEPTED|production-ready/i);
    expect(contract).not.toMatch(/(?:secret|token|password|privateKey|credential|cookie)\s*[:\"]\s*[^\s,}\"]+/i);
  });
});
