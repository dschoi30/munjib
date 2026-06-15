import { describe, expect, it } from "vitest";
import { buildCurrentDocumentContext } from "@/lib/rag/document-context";

describe("current document context", () => {
  it("uses the full saved document when it fits the budget", () => {
    const context = buildCurrentDocumentContext({
      documentTitle: "Incident Runbook",
      documentPath: "/incident-runbook",
      contentMarkdown: "# Rollback\n\nUse the previous stable deployment.",
      question: "What is the rollback plan?",
      maxTokens: 200,
    });

    expect(context.partial).toBe(false);
    expect(context.context).toContain("# Rollback");
    expect(context.context).toContain("Use the previous stable deployment.");
    expect(context.sections).toEqual([
      {
        index: 1,
        documentTitle: "Incident Runbook",
        documentPath: "/incident-runbook",
        headingPath: "Rollback",
      },
    ]);
  });

  it("selects relevant heading sections when the document exceeds the budget", () => {
    const context = buildCurrentDocumentContext({
      documentTitle: "Operations Manual",
      documentPath: "/ops-manual",
      contentMarkdown: [
        "# Billing",
        "Invoices renewal discounts procurement.",
        "# Incident Response",
        "Rollback uses the previous stable deployment and verifies health checks.",
        "# Hiring",
        "Interview loops onboarding compensation.",
      ].join("\n\n"),
      question: "How do we rollback during an incident?",
      maxTokens: 18,
    });

    expect(context.partial).toBe(true);
    expect(context.context).toContain("Incident Response");
    expect(context.context).toContain("Rollback uses the previous stable deployment");
    expect(context.context).not.toContain("Interview loops");
    expect(context.sections).toEqual([
      {
        index: 1,
        documentTitle: "Operations Manual",
        documentPath: "/ops-manual",
        headingPath: "Incident Response",
      },
    ]);
  });

  it("strips frontmatter from the packed context", () => {
    const context = buildCurrentDocumentContext({
      documentTitle: "Incident Runbook",
      documentPath: "/incident-runbook",
      contentMarkdown: [
        "---",
        "title: Hidden Metadata",
        "tags:",
        "  - incident",
        "---",
        "# Visible Runbook",
        "",
        "Use the saved markdown body for answers.",
      ].join("\n"),
      question: "What does the saved markdown body say?",
      maxTokens: 200,
    });

    expect(context.partial).toBe(false);
    expect(context.context).toContain("# Visible Runbook");
    expect(context.context).toContain("Use the saved markdown body for answers.");
    expect(context.context).not.toContain("Hidden Metadata");
    expect(context.context).not.toContain("tags:");
    expect(context.context).not.toContain("---");
    expect(context.sections).toEqual([
      {
        index: 1,
        documentTitle: "Incident Runbook",
        documentPath: "/incident-runbook",
        headingPath: "Visible Runbook",
      },
    ]);
  });

  it("ignores headings inside fenced code blocks when building sections", () => {
    const context = buildCurrentDocumentContext({
      documentTitle: "Markdown Guide",
      documentPath: "/markdown-guide",
      contentMarkdown: [
        "# Runbook",
        "The next block is an example, not a section boundary.",
        "",
        "```md",
        "# Example Heading",
        "Do not treat this as a document section.",
        "```",
        "",
        "## Real Step",
        "Follow this actual runbook step.",
      ].join("\n"),
      question: "What is the real runbook step?",
      maxTokens: 200,
    });

    expect(context.sections).toEqual([
      {
        index: 1,
        documentTitle: "Markdown Guide",
        documentPath: "/markdown-guide",
        headingPath: "Runbook",
      },
      {
        index: 2,
        documentTitle: "Markdown Guide",
        documentPath: "/markdown-guide",
        headingPath: "Runbook > Real Step",
      },
    ]);
    expect(context.context).toContain("# Example Heading");
  });

  it("supports indented headings and longer closing fences", () => {
    const context = buildCurrentDocumentContext({
      documentTitle: "Markdown Guide",
      documentPath: "/markdown-guide",
      contentMarkdown: [
        "  # Indented Runbook",
        "Intro text.",
        "",
        "```md",
        "# Example Heading",
        "Do not treat this as a document section.",
        "````",
        "",
        "   ## Indented Step",
        "Follow the real indented step.",
      ].join("\n"),
      question: "What is the indented step?",
      maxTokens: 200,
    });

    expect(context.sections).toEqual([
      {
        index: 1,
        documentTitle: "Markdown Guide",
        documentPath: "/markdown-guide",
        headingPath: "Indented Runbook",
      },
      {
        index: 2,
        documentTitle: "Markdown Guide",
        documentPath: "/markdown-guide",
        headingPath: "Indented Runbook > Indented Step",
      },
    ]);
  });

  it("preserves nested heading paths", () => {
    const context = buildCurrentDocumentContext({
      documentTitle: "Product Handbook",
      documentPath: "/product-handbook",
      contentMarkdown: [
        "# Parent",
        "Parent overview.",
        "",
        "## Child",
        "Child details.",
        "",
        "### Grandchild",
        "Grandchild details.",
        "",
        "## Sibling",
        "Sibling details.",
      ].join("\n"),
      question: "What are the child details?",
      maxTokens: 200,
    });

    expect(context.sections).toEqual([
      {
        index: 1,
        documentTitle: "Product Handbook",
        documentPath: "/product-handbook",
        headingPath: "Parent",
      },
      {
        index: 2,
        documentTitle: "Product Handbook",
        documentPath: "/product-handbook",
        headingPath: "Parent > Child",
      },
      {
        index: 3,
        documentTitle: "Product Handbook",
        documentPath: "/product-handbook",
        headingPath: "Parent > Child > Grandchild",
      },
      {
        index: 4,
        documentTitle: "Product Handbook",
        documentPath: "/product-handbook",
        headingPath: "Parent > Sibling",
      },
    ]);
  });

  it("preserves document order when selected oversized sections were ranked by score", () => {
    const context = buildCurrentDocumentContext({
      documentTitle: "Operations Manual",
      documentPath: "/ops-manual",
      contentMarkdown: [
        "# Early Rollback Note",
        "Rollback uses the previously deployed build.",
        "",
        "# Irrelevant Reference",
        Array.from({ length: 18 }, (_, index) => `Reference filler paragraph ${index}.`).join(
          " ",
        ),
        "",
        "# Later Incident Rollback",
        "Incident rollback verifies health checks and deployment stability.",
      ].join("\n"),
      question: "How do we handle incident rollback with health checks?",
      maxTokens: 45,
    });

    const earlyIndex = context.context.indexOf("# Early Rollback Note");
    const laterIndex = context.context.indexOf("# Later Incident Rollback");

    expect(context.partial).toBe(true);
    expect(earlyIndex).toBeGreaterThanOrEqual(0);
    expect(laterIndex).toBeGreaterThan(earlyIndex);
    expect(context.context).not.toContain("# Irrelevant Reference");
    expect(context.sections).toEqual([
      {
        index: 1,
        documentTitle: "Operations Manual",
        documentPath: "/ops-manual",
        headingPath: "Early Rollback Note",
      },
      {
        index: 2,
        documentTitle: "Operations Manual",
        documentPath: "/ops-manual",
        headingPath: "Later Incident Rollback",
      },
    ]);
  });

  it("selects relevant paragraph chunks in long documents without headings", () => {
    const context = buildCurrentDocumentContext({
      documentTitle: "Imported Notes",
      documentPath: "/imported-notes",
      contentMarkdown: [
        Array.from({ length: 12 }, (_, index) => `Intro filler paragraph ${index}.`).join(
          "\n\n",
        ),
        "Refund policy exceptions require CFO approval and legal review.",
        Array.from({ length: 12 }, (_, index) => `Trailing filler paragraph ${index}.`).join(
          "\n\n",
        ),
      ].join("\n\n"),
      question: "What are the refund policy exceptions?",
      maxTokens: 20,
    });

    expect(context.partial).toBe(true);
    expect(context.context).toContain("Refund policy exceptions");
    expect(context.context).not.toContain("Intro filler paragraph 0");
    expect(context.sections).toEqual([
      {
        index: 1,
        documentTitle: "Imported Notes",
        documentPath: "/imported-notes",
        headingPath: null,
      },
    ]);
  });

  it("returns no sections for an empty saved document", () => {
    const context = buildCurrentDocumentContext({
      documentTitle: "Empty",
      documentPath: "/empty",
      contentMarkdown: "   \n",
      question: "What is here?",
      maxTokens: 200,
    });

    expect(context.context).toBe("");
    expect(context.sections).toEqual([]);
    expect(context.partial).toBe(false);
  });
});
