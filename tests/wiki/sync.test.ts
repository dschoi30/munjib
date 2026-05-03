import { describe, expect, it } from "vitest";
import { selectCandidatePages, WikiSyncRequiredError } from "@/lib/wiki/sync";
import type { WikiManifestPage } from "@/lib/wiki/types";

const pages: WikiManifestPage[] = [
  page("wiki/index.md", "Wiki Index", "Repository wiki index."),
  page("wiki/Project PRD.md", "Project PRD", "Product requirements and source notes."),
  page("wiki/Munjib.md", "Munjib", "Product definition."),
  page("wiki/Wiki Schema.md", "Wiki Schema", "Wiki schema and maintenance rules."),
  page("wiki/Local Development Workflow.md", "Local Development Workflow", "Local development commands."),
  page("wiki/Wiki Links And Backlinks.md", "Wiki Links And Backlinks", "Wiki link behavior."),
  page("wiki/Document Editing Workflow.md", "Document Editing Workflow", "Document editing flow."),
  page("wiki/Document Knowledge Model.md", "Document Knowledge Model", "Core data model."),
  page("wiki/Auth And Permissions Workflow.md", "Auth And Permissions Workflow", "Auth and permissions flow."),
];

describe("wiki sync", () => {
  it("maps wiki tooling changes to schema and local workflow pages", () => {
    const candidates = selectCandidatePages(["lib/wiki/sync.ts", "scripts/wiki/sync-check.ts"], pages);

    expect(candidates.map((candidate) => candidate.title)).toEqual(["Local Development Workflow", "Wiki Schema"]);
  });

  it("maps document editor changes to document workflow pages", () => {
    const candidates = selectCandidatePages(["components/document-editor.tsx"], pages);

    expect(candidates.map((candidate) => candidate.title)).toEqual([
      "Document Editing Workflow",
      "Document Knowledge Model",
      "Wiki Index",
    ]);
  });

  it("uses index and PRD fallback for source files without a specific rule", () => {
    const candidates = selectCandidatePages(["styles/unknown.css"], pages);

    expect(candidates.map((candidate) => candidate.title)).toEqual(["Wiki Index", "Project PRD"]);
  });

  it("carries the plan on sync-required errors", () => {
    const error = new WikiSyncRequiredError({
      changedFiles: ["components/document-editor.tsx"],
      sourceFiles: ["components/document-editor.tsx"],
      wikiFiles: [],
      candidatePages: selectCandidatePages(["components/document-editor.tsx"], pages),
      required: true,
      wikiTouched: false,
      message: "Source changes were detected without wiki maintenance changes.",
    });

    expect(error.name).toBe("WikiSyncRequiredError");
    expect(error.plan.candidatePages[0]?.title).toBe("Document Editing Workflow");
  });
});

function page(path: string, title: string, summary: string): WikiManifestPage {
  return {
    id: title.toLowerCase().replaceAll(" ", "-"),
    path,
    title,
    type: "workflow",
    status: "active",
    summary,
    tags: ["test"],
    links: [],
    source_count: 1,
    searchPriority: 50,
  };
}
