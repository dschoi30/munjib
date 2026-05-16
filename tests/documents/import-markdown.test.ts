import { describe, expect, it } from "vitest";
import { deriveMarkdownImportTitle } from "@/lib/documents/import-markdown";

describe("deriveMarkdownImportTitle", () => {
  it("uses string frontmatter title before headings and file names", () => {
    expect(
      deriveMarkdownImportTitle({
        fileName: "fallback.md",
        contentMarkdown: "---\ntitle: Document Knowledge Model\n---\n# Heading Title\nBody",
      }),
    ).toBe("Document Knowledge Model");
  });

  it("uses the first ATX h1 heading when frontmatter title is missing", () => {
    expect(
      deriveMarkdownImportTitle({
        fileName: "fallback.md",
        contentMarkdown: "Intro\n\n# Imported Workflow\n\n## Details",
      }),
    ).toBe("Imported Workflow");
  });

  it("uses the file name without markdown extension when content has no title candidate", () => {
    expect(
      deriveMarkdownImportTitle({
        fileName: "Document Editing Workflow.markdown",
        contentMarkdown: "Body only",
      }),
    ).toBe("Document Editing Workflow");
  });
});
