// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DocumentProperties } from "@/components/document-editor/document-properties";
import { I18nProvider } from "@/components/i18n-provider";

afterEach(() => {
  cleanup();
});

function renderDocumentProperties() {
  return render(
    <I18nProvider>
      <DocumentProperties
        document={{ id: "doc-1", title: "Welcome", contentMarkdown: "" }}
        tags={[]}
        properties={[
          {
            id: "property-tags",
            key: "tags",
            valueJson: ["planning"],
          },
        ]}
        comments={[]}
        linkPanels={{
          outgoing: [
            {
              id: "link-1",
              targetTitleRaw: "Runbook",
              alias: null,
              isBroken: false,
              isAmbiguous: false,
              targetDocument: { id: "doc-2", title: "Runbook", slug: "runbook", path: "/runbook" },
            },
            {
              id: "link-2",
              targetTitleRaw: "Missing",
              alias: null,
              isBroken: true,
              isAmbiguous: false,
              targetDocument: null,
            },
          ],
          backlinks: [],
          brokenLinks: [],
          ambiguousLinks: [],
        }}
        canWrite
        createFromBrokenLinkAction={async () => {}}
        createCommentAction={async () => {}}
      />
    </I18nProvider>,
  );
}

describe("DocumentProperties", () => {
  it("uses the primary green theme for tag and wiki link affordances", () => {
    renderDocumentProperties();

    const tagButton = screen.getByRole("button", { name: "Search tag #planning" });
    const resolvedLink = screen.getByRole("link", { name: "Runbook" });
    const brokenLinkButton = screen.getByRole("button", { name: "Missing" });

    expect(tagButton.className).toContain("bg-primary-muted");
    expect(tagButton.className).toContain("text-primary");
    expect(tagButton.className).not.toContain("violet");
    expect(resolvedLink.className).toContain("text-primary");
    expect(resolvedLink.className).not.toContain("violet");
    expect(brokenLinkButton.className).toContain("hover:text-primary");
    expect(brokenLinkButton.className).not.toContain("violet");
  });
});
