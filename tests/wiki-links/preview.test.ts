import { describe, expect, it } from "vitest";
import {
  buildWikiLinkPreviewCandidateMap,
  renderPreviewMarkdownWithWikiLinks,
} from "@/lib/wiki-links/preview";

describe("renderPreviewMarkdownWithWikiLinks", () => {
  const candidateBySlug = buildWikiLinkPreviewCandidateMap([
    {
      id: "doc-runbook",
      slug: "engineering-runbook",
      title: "Engineering Runbook",
      path: "/engineering-runbook",
    },
    { id: "doc-welcome", slug: "welcome", title: "Welcome", path: "/welcome" },
  ]);

  it("renders resolved wiki links as markdown links to the selected document", () => {
    expect(renderPreviewMarkdownWithWikiLinks("See [[Engineering Runbook]].", candidateBySlug)).toBe(
      "See [Engineering Runbook](?document=doc-runbook).",
    );
  });

  it("preserves heading markdown while converting wiki links", () => {
    expect(renderPreviewMarkdownWithWikiLinks("# Runbook\nSee [[Welcome]].", candidateBySlug)).toBe(
      "# Runbook\nSee [Welcome](?document=doc-welcome).",
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

  it("leaves escaped wiki links untouched", () => {
    expect(
      renderPreviewMarkdownWithWikiLinks("Keep \\[[Welcome]] literal.", candidateBySlug),
    ).toBe("Keep \\[[Welcome]] literal.");
  });

  it("leaves indented code blocks untouched", () => {
    expect(
      renderPreviewMarkdownWithWikiLinks(
        "    [[Welcome]]\n\t[[Welcome]]\nOutside [[Welcome]]",
        candidateBySlug,
      ),
    ).toBe("    [[Welcome]]\n\t[[Welcome]]\nOutside [Welcome](?document=doc-welcome)");
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

  it("preserves code span state across line endings", () => {
    expect(
      renderPreviewMarkdownWithWikiLinks("Keep `code\n[[Welcome]]\ncode` literal.", candidateBySlug),
    ).toBe("Keep `code\n[[Welcome]]\ncode` literal.");
  });

  it("does not link ambiguous title slug collisions", () => {
    const ambiguousCandidates = buildWikiLinkPreviewCandidateMap([
      { id: "first", slug: "runbook", title: "Runbook", path: "/first/runbook" },
      { id: "second", slug: "runbook-2", title: "Runbook", path: "/second/runbook" },
    ]);

    expect(renderPreviewMarkdownWithWikiLinks("See [[Runbook]].", ambiguousCandidates)).toBe(
      "See Runbook.",
    );
  });

  it("still links explicit stored slugs when title slugs collide", () => {
    const ambiguousCandidates = buildWikiLinkPreviewCandidateMap([
      { id: "first", slug: "runbook", title: "Runbook", path: "/first/runbook" },
      { id: "second", slug: "runbook-2", title: "Runbook", path: "/second/runbook-2" },
    ]);

    expect(renderPreviewMarkdownWithWikiLinks("See [[Runbook 2]].", ambiguousCandidates)).toBe(
      "See [Runbook 2](?document=second).",
    );
  });

  it("renders path-qualified links and leaves ambiguous title-only links as text", () => {
    const candidates = buildWikiLinkPreviewCandidateMap([
      { id: "ops", slug: "onboarding", title: "Onboarding", path: "/operations/onboarding" },
      { id: "eng", slug: "onboarding", title: "Onboarding", path: "/engineering/onboarding" },
      {
        id: "incident",
        slug: "incident-runbook",
        title: "Incident Runbook",
        path: "/operations/incident-runbook",
      },
    ]);

    expect(renderPreviewMarkdownWithWikiLinks("[[Operations/Onboarding]]", candidates)).toBe(
      "[Operations/Onboarding](?document=ops)",
    );
    expect(renderPreviewMarkdownWithWikiLinks("[[Operations/Incident Runbook]]", candidates)).toBe(
      "[Operations/Incident Runbook](?document=incident)",
    );
    expect(renderPreviewMarkdownWithWikiLinks("[[Onboarding]]", candidates)).toBe("Onboarding");
  });

  it("falls back to slash-containing titles when no path candidate matches", () => {
    const candidates = buildWikiLinkPreviewCandidateMap([
      { id: "plan", slug: "q1-q2-plan", title: "Q1/Q2 Plan", path: "/q1-q2-plan" },
    ]);

    expect(renderPreviewMarkdownWithWikiLinks("[[Q1/Q2 Plan]]", candidates)).toBe(
      "[Q1/Q2 Plan](?document=plan)",
    );
  });

  it("keeps punctuation-compatible title fallback matching", () => {
    const candidates = buildWikiLinkPreviewCandidateMap([
      { id: "plan", slug: "q1-q2-plan", title: "Q1/Q2 Plan", path: "/q1-q2-plan" },
    ]);

    expect(renderPreviewMarkdownWithWikiLinks("[[Q1Q2 Plan]]", candidates)).toBe(
      "[Q1Q2 Plan](?document=plan)",
    );
  });

  it("keeps hyphen-compatible title fallback matching", () => {
    const candidates = buildWikiLinkPreviewCandidateMap([
      { id: "plan", slug: "a-b", title: "A-B", path: "/a-b" },
    ]);

    expect(renderPreviewMarkdownWithWikiLinks("[[A - B]]", candidates)).toBe(
      "[A - B](?document=plan)",
    );
  });

  it("resolves underscore targets to titles with spaces", () => {
    const candidates = buildWikiLinkPreviewCandidateMap([
      {
        id: "suez",
        slug: "수에즈-운하-위기",
        title: "수에즈 운하 위기",
        path: "/수에즈-운하-위기",
      },
    ]);

    expect(renderPreviewMarkdownWithWikiLinks("[[수에즈_운하_위기]]", candidates)).toBe(
      "[수에즈_운하_위기](?document=suez)",
    );
  });

  it("resolves underscore path-qualified targets segment by segment", () => {
    const candidates = buildWikiLinkPreviewCandidateMap([
      {
        id: "suez",
        slug: "수에즈-운하-위기",
        title: "수에즈 운하 위기",
        path: "/history/untitled",
      },
    ]);

    expect(renderPreviewMarkdownWithWikiLinks("[[History/수에즈_운하_위기]]", candidates)).toBe(
      "[History/수에즈_운하_위기](?document=suez)",
    );
  });

  it("resolves path-qualified targets with non-ASCII parent folders", () => {
    const candidates = buildWikiLinkPreviewCandidateMap([
      {
        id: "suez",
        slug: "수에즈-운하-위기",
        title: "수에즈 운하 위기",
        path: "/untitled/untitled",
      },
    ]);

    expect(renderPreviewMarkdownWithWikiLinks("[[역사/수에즈_운하_위기]]", candidates)).toBe(
      "[역사/수에즈_운하_위기](?document=suez)",
    );
  });
});
