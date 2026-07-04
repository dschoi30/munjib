// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AiAnswer, AiCitations } from "@/components/ai/answer";

afterEach(() => {
  cleanup();
});

describe("AiAnswer", () => {
  it("uses the primary green theme for markdown answer links", () => {
    render(<AiAnswer content="[Runbook](https://example.com)" />);

    const link = screen.getByRole("link", { name: "Runbook" });
    expect(link.className).toContain("text-primary");
    expect(link.className).not.toContain("violet");
  });

  it("uses the primary green theme for citation links", () => {
    render(
      <AiCitations
        workspaceSlug="company-handbook"
        citations={[
          {
            index: 1,
            documentId: "doc-1",
            documentTitle: "Runbook",
          },
        ]}
      />,
    );

    const citationLink = screen.getByRole("link", { name: "[1] Runbook" });
    expect(citationLink.className).toContain("text-primary");
    expect(citationLink.className).not.toContain("violet");
  });
});
