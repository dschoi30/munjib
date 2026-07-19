import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

describe("encrypted recovery readiness runbook", () => {
  test("documents a preparation-only boundary and all dependency gates", () => {
    const runbook = read("docs/runbooks/encrypted-recovery-readiness.md");

    expect(runbook).toContain("Issue #168");
    expect(runbook).toContain("Phase A");
    expect(runbook).toContain("Phase B");
    expect(runbook).toContain("#184");
    expect(runbook).toContain("#185");
    expect(runbook).toContain("Leaf 2");
    expect(runbook).toContain("Leaf 9");
    expect(runbook).toContain("Leaf 11");
    expect(runbook).toMatch(/Issue #168 remains open/i);
    expect(runbook).toMatch(/does not perform a snapshot, restore, destructive purge/i);
  });

  test("contains no executable production-operation recipe or secret material", () => {
    const runbook = read("docs/runbooks/encrypted-recovery-readiness.md");

    expect(runbook).not.toMatch(/\|\|\s*true|docker\s+(run|compose\s+(up|exec|run))|\bsudo\b|\bsetuid\b/i);
    expect(runbook).not.toMatch(/(?:postgres(?:ql)?:\/\/|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,})/);
  });

  test("checks the contract artifact is referenced without embedding a readiness claim", () => {
    const runbook = read("docs/runbooks/encrypted-recovery-readiness.md");
    const contract = read("deploy/backup/recovery-readiness-v1.json");

    expect(runbook).toContain("deploy/backup/recovery-readiness-v1.json");
    expect(contract).not.toMatch(/PASS|ACCEPTED|production-ready/i);
    expect(contract).not.toMatch(/secret|token|password|privateKey|credential/i);
  });
});
