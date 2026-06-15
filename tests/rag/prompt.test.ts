import { describe, expect, it } from "vitest";
import {
  buildDirectDocumentPrompt,
  buildRagPrompt,
  filterCitationsToAnswer,
} from "@/lib/rag/prompt";

describe("RAG prompt builder", () => {
  it("labels citation context with document title and heading path", () => {
    const prompt = buildRagPrompt({
      question: "What is the rollback plan?",
      chunks: [
        {
          id: "chunk-1",
          documentId: "doc-1",
          documentTitle: "Incident Runbook",
          documentPath: "/operations/incident-runbook",
          headingPath: "Rollback",
          content: "Use the previous stable deployment.",
          distance: 0.1,
          score: 1.2,
        },
        {
          id: "chunk-2",
          documentId: "doc-2",
          documentTitle: "Release Notes",
          documentPath: "/release-notes",
          headingPath: null,
          content: "Current stable version is 2026.05.",
          distance: 0.2,
          score: 1.1,
        },
      ],
    });

    expect(prompt.user).toContain("[1] Incident Runbook > Rollback");
    expect(prompt.user).toContain("[2] Release Notes");
    expect(prompt.citations).toEqual([
      {
        index: 1,
        documentId: "doc-1",
        documentTitle: "Incident Runbook",
        documentPath: "/operations/incident-runbook",
        headingPath: "Rollback",
      },
      {
        index: 2,
        documentId: "doc-2",
        documentTitle: "Release Notes",
        documentPath: "/release-notes",
        headingPath: null,
      },
    ]);
  });

  it("instructs the model to use only saved document context", () => {
    const prompt = buildRagPrompt({
      question: "초안 내용도 반영했나요?",
      chunks: [],
    });

    expect(prompt.system).toContain("Use only the saved document context");
    expect(prompt.system).toContain("Do not use unsaved editor drafts");
    expect(prompt.system).toContain("Do not use outside knowledge");
  });

  it("requires an insufficient-context answer when saved docs lack evidence", () => {
    const prompt = buildRagPrompt({
      question: "What did the customer say yesterday?",
      chunks: [],
    });

    expect(prompt.system).toContain("saved documents do not contain enough evidence");
    expect(prompt.system).toContain("same language as the question");
  });

  it("keeps only citations referenced by the answer text", () => {
    const citations = [
      {
        index: 1,
        documentId: "doc-1",
        documentTitle: "Welcome",
        documentPath: "/welcome",
        headingPath: null,
      },
      {
        index: 2,
        documentId: "doc-2",
        documentTitle: "Policy",
        documentPath: "/policy",
        headingPath: "Approvals",
      },
    ];

    expect(filterCitationsToAnswer("Requests require approval [2].", citations)).toEqual([
      citations[1],
    ]);
    expect(filterCitationsToAnswer("Requests use both sources [1, 2].", citations)).toEqual(
      citations,
    );
    expect(filterCitationsToAnswer("The saved documents do not contain enough evidence.", citations))
      .toEqual([]);
  });
});

describe("direct current document prompt builder", () => {
  it("instructs the model to answer only from the current saved document", () => {
    const prompt = buildDirectDocumentPrompt({
      question: "What is the rollout plan?",
      currentDocumentContext: {
        context: "# Rollout\n\nShip the saved plan.",
        partial: false,
        sections: [
          {
            index: 1,
            documentTitle: "Launch Plan",
            documentPath: "/launch-plan",
            headingPath: "Rollout",
          },
        ],
      },
    });

    expect(prompt.system).toContain("current saved document");
    expect(prompt.system).toContain("Do not use other workspace documents");
    expect(prompt.system).toContain("Do not use unsaved editor drafts");
  });

  it("includes the provided current document context in the user prompt", () => {
    const prompt = buildDirectDocumentPrompt({
      question: "What is saved?",
      currentDocumentContext: {
        context: "# Facts\n\nSaved database content",
        labeledContext: "[1] Saved Title > Facts\n# Facts\n\nSaved database content",
        partial: false,
        sections: [
          {
            index: 1,
            documentTitle: "Saved Title",
            documentPath: "/saved-title",
            headingPath: "Facts",
          },
        ],
      },
    });

    expect(prompt.user).toContain("Question:\nWhat is saved?");
    expect(prompt.user).toContain(
      "Current saved document context:\n[1] Saved Title > Facts\n# Facts\n\nSaved database content",
    );
  });

  it("labels each current document context section inline with its content", () => {
    const prompt = buildDirectDocumentPrompt({
      question: "Which sections matter?",
      currentDocumentContext: {
        context: "# First\n\nAlpha\n\n# Second\n\nBeta",
        labeledContext: [
          "[1] Saved Title > First\n# First\n\nAlpha",
          "[2] Saved Title > Second\n# Second\n\nBeta",
        ].join("\n\n"),
        partial: false,
        sections: [
          {
            index: 1,
            documentTitle: "Saved Title",
            documentPath: "/saved-title",
            headingPath: "First",
          },
          {
            index: 2,
            documentTitle: "Saved Title",
            documentPath: "/saved-title",
            headingPath: "Second",
          },
        ],
      },
    });

    expect(prompt.user).toContain("[1] Saved Title > First\n# First\n\nAlpha");
    expect(prompt.user).toContain("[2] Saved Title > Second\n# Second\n\nBeta");
  });

  it("maps current document sections to current-document citations", () => {
    const prompt = buildDirectDocumentPrompt({
      question: "Which sections matter?",
      currentDocumentContext: {
        context: "# First\n\nAlpha\n\n# Second\n\nBeta",
        partial: false,
        sections: [
          {
            index: 1,
            documentTitle: "Saved Title",
            documentPath: "/saved-title",
            headingPath: "First",
          },
          {
            index: 2,
            documentTitle: "Saved Title",
            documentPath: "/saved-title",
            headingPath: "Second",
          },
        ],
      },
    });

    expect(prompt.user).toContain("[1] Saved Title > First");
    expect(prompt.user).toContain("[2] Saved Title > Second");
    expect(prompt.citations).toEqual([
      {
        index: 1,
        documentId: "current",
        documentTitle: "Saved Title",
        documentPath: "/saved-title",
        headingPath: "First",
      },
      {
        index: 2,
        documentId: "current",
        documentTitle: "Saved Title",
        documentPath: "/saved-title",
        headingPath: "Second",
      },
    ]);
  });

  it("notes when only selected sections of a long document were included", () => {
    const prompt = buildDirectDocumentPrompt({
      question: "What is the incident rollback?",
      currentDocumentContext: {
        context: "# Incident\n\nRollback with health checks.",
        partial: true,
        sections: [
          {
            index: 1,
            documentTitle: "Operations Manual",
            documentPath: "/ops-manual",
            headingPath: "Incident",
          },
        ],
      },
    });

    expect(prompt.user).toContain("Only selected sections of this long document were included.");
  });
});
