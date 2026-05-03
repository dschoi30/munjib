import { describe, expect, it } from "vitest";
import { renderPreviewMarkdownWithWikiLinks } from "@/lib/wiki-links/preview";

describe("renderPreviewMarkdownWithWikiLinks", () => {
  const candidates = [
    { id: "doc-runbook", title: "Engineering Runbook" },
    { id: "doc-welcome", title: "Welcome" },
  ];

  it("renders resolved wiki links as markdown links to the selected document", () => {
    expect(renderPreviewMarkdownWithWikiLinks("See [[Engineering Runbook]].", candidates)).toBe(
      "See [Engineering Runbook](?document=doc-runbook).",
    );
  });

  it("uses aliases for link labels while resolving by target title", () => {
    expect(
      renderPreviewMarkdownWithWikiLinks("See [[Engineering Runbook|the runbook]].", candidates),
    ).toBe("See [the runbook](?document=doc-runbook).");
  });

  it("removes brackets from unresolved page links without creating a navigation target", () => {
    expect(renderPreviewMarkdownWithWikiLinks("See [[Missing Policy]].", candidates)).toBe(
      "See Missing Policy.",
    );
  });

  it("leaves embeds and code untouched", () => {
    expect(
      renderPreviewMarkdownWithWikiLinks(
        "Keep ![[Image.png]] and `[[Welcome]]` literal.\n\n```\n[[Welcome]]\n```",
        candidates,
      ),
    ).toBe("Keep ![[Image.png]] and `[[Welcome]]` literal.\n\n```\n[[Welcome]]\n```");
  });
});
