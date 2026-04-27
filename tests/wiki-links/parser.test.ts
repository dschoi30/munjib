import { describe, expect, it } from "vitest";
import { parseWikiLinks } from "@/lib/wiki-links/parser";

describe("parseWikiLinks", () => {
  it("extracts unique wiki links in first-seen order", () => {
    expect(
      parseWikiLinks("Read [[Engineering Guide]] and [[Runbook]]. Then [[Engineering Guide]] again."),
    ).toEqual([
      { targetTitleRaw: "Engineering Guide", alias: null },
      { targetTitleRaw: "Runbook", alias: null },
    ]);
  });

  it("extracts aliases without changing the raw target title", () => {
    expect(parseWikiLinks("See [[Incident Runbook|the runbook]].")).toEqual([
      { targetTitleRaw: "Incident Runbook", alias: "the runbook" },
    ]);
  });

  it("ignores empty, heading, and embed-style links", () => {
    expect(parseWikiLinks("[[]] [[#Heading]] ![[Image.png]] [[   ]]")).toEqual([]);
  });

  it("trims whitespace around title and alias", () => {
    expect(parseWikiLinks("[[  Product Spec  |  spec  ]]")).toEqual([
      { targetTitleRaw: "Product Spec", alias: "spec" },
    ]);
  });
});
