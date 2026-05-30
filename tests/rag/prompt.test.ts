import { describe, expect, it } from "vitest";
import { buildRagPrompt } from "@/lib/rag/prompt";

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
});
