import { describe, expect, it } from "vitest";
import { parseFrontmatterWikiLinks, parseWikiLinks } from "@/lib/wiki-links/parser";

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

  it("extracts links only from YAML frontmatter links in file order", () => {
    expect(
      parseFrontmatterWikiLinks(`---
links:
  - "[[Runbook]]"
  - "[[Engineering Guide|guide]]"
---

Content [[Ignored Link]].`),
    ).toEqual([
      { targetTitleRaw: "Runbook", alias: null },
      { targetTitleRaw: "Engineering Guide", alias: "guide" },
    ]);
  });

  it("extracts plain title strings from YAML frontmatter links", () => {
    expect(
      parseFrontmatterWikiLinks(`---
links:
  - Runbook
  - "[[Engineering Guide|guide]]"
---

Content [[Ignored Link]].`),
    ).toEqual([
      { targetTitleRaw: "Runbook", alias: null },
      { targetTitleRaw: "Engineering Guide", alias: "guide" },
    ]);
  });

  it("ignores frontmatter links that are embeds or external URLs", () => {
    expect(
      parseFrontmatterWikiLinks(`---
links:
  - "![[Image.png]]"
  - "https://example.com/runbook"
  - "[External Runbook](https://example.com/runbook)"
---
`),
    ).toEqual([]);
  });

  it("ignores content links when frontmatter links are missing", () => {
    expect(parseFrontmatterWikiLinks("# Plan\n\nSee [[Runbook]].")).toEqual([]);
  });
});
