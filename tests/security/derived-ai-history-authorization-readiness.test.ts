import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runbook = readFileSync(
  new URL(
    "../../docs/runbooks/derived-ai-history-authorization-readiness.md",
    import.meta.url,
  ),
  "utf8",
);

describe("derived AI history authorization readiness contract", () => {
  it("keeps the branch documentation-only and dependency-gated", () => {
    expect(runbook).toContain("does not change the schema, API routes");
    expect(runbook).toContain("No runtime implementation, schema migration");
    expect(runbook).toContain("Leaf 2");
    expect(runbook).toContain("Leaf 4");
    expect(runbook).toContain("Leaf 6");
    expect(runbook).toContain("Leaf 13B");
  });

  it("requires lineage proof for source-backed, source-free, and legacy rows", () => {
    expect(runbook).toContain("Source-backed");
    expect(runbook).toContain("Source-free");
    expect(runbook).toContain("Unproven legacy");
    expect(runbook).toContain("not replayable");
  });

  it("covers every derived-history visibility boundary", () => {
    expect(runbook).toContain("Thread load");
    expect(runbook).toContain("Follow-up preparation");
    expect(runbook).toContain("Memory refresh");
    expect(runbook).toContain("Finalization/persistence");
    expect(runbook).toContain("Citation navigation");
  });

  it("requires non-enumerating whole-turn redaction", () => {
    expect(runbook).toContain("whole derived turn");
    expect(runbook).toContain("non-enumerating tombstone");
    expect(runbook).toMatch(/no answer text,\s+citations, source ids/);
    expect(runbook).toMatch(/must not\s+reveal whether a denied source existed/);
  });

  it("keeps destructive data operations outside this leaf", () => {
    expect(runbook).toMatch(/not a destructive\s+purge/);
    expect(runbook).toContain("does not request broker installation");
    expect(runbook).toContain("Out of scope for Issue #163");
  });
});
