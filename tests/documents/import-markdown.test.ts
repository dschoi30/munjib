import { describe, expect, it } from "vitest";
import {
  deriveMarkdownImportTitle,
  isSupportedMarkdownImportFile,
} from "@/lib/documents/import-markdown";

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

  it("treats YAML block-scalar title markers as missing and falls back to heading", () => {
    expect(
      deriveMarkdownImportTitle({
        fileName: "fallback.md",
        contentMarkdown: "---\ntitle: |-\n---\n# Imported Workflow\nBody",
      }),
    ).toBe("Imported Workflow");
  });

  it("skips fenced code blocks when finding the first ATX h1 heading", () => {
    expect(
      deriveMarkdownImportTitle({
        fileName: "fallback.md",
        contentMarkdown: "```sh\n# install\n```\n\n# Real Heading\nBody",
      }),
    ).toBe("Real Heading");
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

describe("isSupportedMarkdownImportFile", () => {
  it("accepts markdown extensions and markdown MIME types", () => {
    expect(isSupportedMarkdownImportFile({ name: "workflow.md", type: "", size: 10 })).toBe(
      true,
    );
    expect(
      isSupportedMarkdownImportFile({
        name: "workflow.txt",
        type: "text/markdown",
        size: 10,
      }),
    ).toBe(true);
  });

  it("rejects empty files and unsupported file types", () => {
    expect(isSupportedMarkdownImportFile({ name: "", type: "", size: 0 })).toBe(false);
    expect(
      isSupportedMarkdownImportFile({
        name: "workflow.pdf",
        type: "application/pdf",
        size: 10,
      }),
    ).toBe(false);
  });
});
