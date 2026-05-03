import { describe, expect, it } from "vitest";
import {
  buildWikiLinkPreviewCandidateMap,
  renderPreviewMarkdownWithWikiLinks,
} from "@/lib/wiki-links/preview";

describe("renderPreviewMarkdownWithWikiLinks", () => {
  const candidateBySlug = buildWikiLinkPreviewCandidateMap([
    { id: "doc-runbook", title: "Engineering Runbook" },
    { id: "doc-welcome", title: "Welcome" },
  ]);

  it("renders resolved wiki links as markdown links to the selected document", () => {
    expect(renderPreviewMarkdownWithWikiLinks("See [[Engineering Runbook]].", candidateBySlug)).toBe(
      "See [Engineering Runbook](?document=doc-runbook).",
    );
  });

  it("uses aliases for link labels while resolving by target title", () => {
    expect(
      renderPreviewMarkdownWithWikiLinks("See [[Engineering Runbook|the runbook]].", candidateBySlug),
    ).toBe("See [the runbook](?document=doc-runbook).");
  });

  it("removes brackets from unresolved page links without creating a navigation target", () => {
    expect(renderPreviewMarkdownWithWikiLinks("See [[Missing Policy]].", candidateBySlug)).toBe(
      "See Missing Policy.",
    );
  });

  it("leaves embeds and code untouched", () => {
    expect(
      renderPreviewMarkdownWithWikiLinks(
        "Keep ![[Image.png]] and `[[Welcome]]` literal.\n\n```\n[[Welcome]]\n```",
        candidateBySlug,
      ),
    ).toBe("Keep ![[Image.png]] and `[[Welcome]]` literal.\n\n```\n[[Welcome]]\n```");
  });

  it("leaves even-length backtick code spans untouched", () => {
    expect(
      renderPreviewMarkdownWithWikiLinks("Keep ``[[Welcome]]`` literal.", candidateBySlug),
    ).toBe("Keep ``[[Welcome]]`` literal.");
  });

  it("does not close longer fenced code blocks with shorter fences", () => {
    expect(
      renderPreviewMarkdownWithWikiLinks(
        "````\n```\n[[Welcome]]\n````\nOutside [[Welcome]]",
        candidateBySlug,
      ),
    ).toBe("````\n```\n[[Welcome]]\n````\nOutside [Welcome](?document=doc-welcome)");
  });
});
