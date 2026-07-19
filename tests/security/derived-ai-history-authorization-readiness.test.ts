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
    expect(runbook).toMatch(/does\s+not activate a route, migration, purge job, provider call, or production\s+mutation/);
    expect(runbook).toContain("Leaf 2");
    expect(runbook).toContain("Leaf 4");
    expect(runbook).toContain("Leaf 6");
    expect(runbook).toContain("Leaf 13B");
  });

  it("requires lineage proof for source-backed, source-free, and legacy rows", () => {
    expect(runbook).toContain("Source-backed");
    expect(runbook).toContain("source-free-v1");
    expect(runbook).toContain("legacy-unproven");
    expect(runbook).toContain("fails closed");
  });

  it("covers every derived-history visibility boundary", () => {
    expect(runbook).toContain("thread load");
    expect(runbook).toContain("follow-up context");
    expect(runbook).toContain("memory refresh");
    expect(runbook).toContain("finalization");
    expect(runbook).toContain("citation serialization");
    expect(runbook).toMatch(/reauthorize immediately before\s+each token/i);
    expect(runbook).toMatch(/buffer the entire response\s+until a final authority recheck/i);
  });

  it("requires non-enumerating whole-turn redaction", () => {
    expect(runbook).toContain("whole turn");
    expect(runbook).toContain("non-enumerating tombstone");
    expect(runbook).toMatch(/answer text,\s+citations,\s+source ids/);
    expect(runbook).toContain("One denied source hides the whole turn");
  });

  it("keeps destructive data operations outside this leaf", () => {
    expect(runbook).toContain("purge job");
    expect(runbook).toMatch(/production\s+mutation/);
    expect(runbook).toMatch(/No direct membership\s+fallback/);
  });
});
