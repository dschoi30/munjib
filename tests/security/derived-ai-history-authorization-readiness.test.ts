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
    expect(runbook).toMatch(/union of all\s+source lineages consumed/i);
    expect(runbook).toMatch(/cannot be relabeled `source-free-v1`/i);
    expect(runbook).toMatch(/every source supplied\s+to the current prompt/i);
    expect(runbook).toMatch(/displayed citations are not a\s+complete authorization record/i);
  });

  it("covers every derived-history visibility boundary", () => {
    expect(runbook).toContain("thread load");
    expect(runbook).toContain("follow-up context");
    expect(runbook).toContain("memory refresh");
    expect(runbook).toContain("finalization");
    expect(runbook).toContain("citation serialization");
    expect(runbook).toContain("send-completion/`done` serialization");
    expect(runbook).toContain("reset-response serialization");
    expect(runbook).toMatch(/reauthorize immediately before\s+each token/i);
    expect(runbook).toMatch(/buffer the entire response\s+until a final authority recheck/i);
  });

  it("requires non-enumerating whole-turn redaction", () => {
    expect(runbook).toContain("whole turn");
    expect(runbook).toContain("non-enumerating tombstone");
    expect(runbook).toMatch(/answer text,\s+citations,\s+source ids/);
    expect(runbook).toContain("One denied source hides the whole turn");
    expect(runbook).toMatch(/suppress each denied `USER`\+`ASSISTANT` turn\s+at list level/i);
    expect(runbook).toMatch(/never\s+emit one tombstone per hidden turn/i);
    expect(runbook).toMatch(/suppress each denied `USER`\+`ASSISTANT` turn/i);
    expect(runbook).toMatch(/whole\s+pair/i);
    expect(runbook).toMatch(/durable turn-correlation\s+key/i);
    expect(runbook).toMatch(/turn-granular pagination/i);
    expect(runbook).toMatch(/authorization\s+must happen before page limits\/cursor calculation/i);
  });

  it("keeps destructive data operations outside this leaf", () => {
    expect(runbook).toContain("purge job");
    expect(runbook).toMatch(/production\s+mutation/);
    expect(runbook).toMatch(/No direct\s+membership\s+fallback/);
  });
});
