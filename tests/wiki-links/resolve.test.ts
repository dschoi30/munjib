import { describe, expect, it } from "vitest";
import { createWikiLinkTargetResolver, resolveWikiLinkTarget } from "@/lib/wiki-links/resolve";

describe("indexed wiki link resolution", () => {
  const targets = [
    { id: "a", title: "Welcome", path: "/welcome" },
    { id: "b", title: "Duplicate", path: "/one/duplicate" },
    { id: "c", title: "Duplicate", path: "/two/duplicate" },
    { id: "d", title: "수에즈 운하 위기", path: "/untitled/untitled" },
    { id: "e", title: "Q1/Q2 Plan", path: "/q1q2-plan" },
    { id: "f", title: "A - B", path: "/a-b" },
    { id: "g", title: "Collision", path: "/same/collision-1" },
    { id: "h", title: "Collision", path: "/same/collision-2" },
  ];
  it.each(["Welcome", "welcome", "Duplicate", "one/Duplicate", "two/Duplicate", "역사/수에즈_운하_위기", "수에즈_운하_위기", "Q1/Q2 Plan", "A-B", "same/Collision", "Missing", "unknown/Missing"])("preserves resolution for %s", (raw) => {
    expect(createWikiLinkTargetResolver(targets)(raw)).toEqual(resolveWikiLinkTarget(targets, raw));
  });
  it("normalizes candidates only when building the index, even with thousands of links", () => {
    let reads = 0;
    const documents = Array.from({ length: 2000 }, (_, index) => ({
      id: String(index), path: `/doc-${index}`,
      get title() { reads++; return `Doc ${index}`; },
    }));
    const resolve = createWikiLinkTargetResolver(documents);
    const indexReads = reads;
    for (let i = 0; i < 2000; i++) {
      expect(resolve(`Doc ${i}`).targetDocumentId).toBe(String(i));
    }
    expect(reads).toBe(indexReads);
  });
});
