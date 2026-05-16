import { describe, expect, it } from "vitest";
import { buildMarkdownOutline } from "@/lib/markdown/folding";

describe("buildMarkdownOutline", () => {
  it("returns # through #### headings as a nested outline", () => {
    const outline = buildMarkdownOutline(`# Root
Intro
## Setup
Body
### Install
Body
#### Env
Body
##### Hidden
Body
## Workflow`);

    expect(outline).toMatchObject([
      {
        level: 1,
        title: "Root",
        lineNumber: 1,
        children: [
          {
            level: 2,
            title: "Setup",
            lineNumber: 3,
            children: [
              {
                level: 3,
                title: "Install",
                lineNumber: 5,
                children: [{ level: 4, title: "Env", lineNumber: 7, children: [] }],
              },
            ],
          },
          { level: 2, title: "Workflow", lineNumber: 11, children: [] },
        ],
      },
    ]);
    expect(JSON.stringify(outline)).not.toContain("Hidden");
  });

  it("normalizes closing hash markers and keeps repeated headings uniquely addressable", () => {
    const outline = buildMarkdownOutline(`# Root
## Notes ##
## Notes`);

    expect(outline[0]?.children.map((item) => ({ id: item.id, title: item.title }))).toEqual([
      { id: "1-root-0/2-notes-0", title: "Notes" },
      { id: "1-root-0/2-notes-1", title: "Notes" },
    ]);
  });

  it("ignores frontmatter and fenced code block heading-like lines", () => {
    const outline = buildMarkdownOutline(`---
title: "# Not a heading"
---
# Real
\`\`\`sh
## Also not a heading
\`\`\`
Body`);

    expect(outline).toHaveLength(1);
    expect(outline[0]?.title).toBe("Real");
    expect(outline[0]?.children).toEqual([]);
  });

  it("excludes empty and closing-marker-only ATX headings", () => {
    const outline = buildMarkdownOutline(`#
## ##
###   ###
# Real`);

    expect(outline.map((item) => item.title)).toEqual(["Real"]);
  });

  it("excludes closing-marker-only root headings", () => {
    const outline = buildMarkdownOutline(`## ##
# Real`);

    expect(outline.map((item) => item.title)).toEqual(["Real"]);
  });

  it("preserves visible descendants under the nearest visible outline parent", () => {
    const outline = buildMarkdownOutline(`# Root
##
### Child`);

    expect(outline).toMatchObject([
      {
        title: "Root",
        children: [{ level: 3, title: "Child", lineNumber: 3, children: [] }],
      },
    ]);
  });
});
