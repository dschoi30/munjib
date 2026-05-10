import { describe, expect, it } from "vitest";
import {
  buildHeadingFoldTree,
  createHeadingFoldStorageValue,
  getValidFoldedHeadingKeys,
  parseHeadingFoldStorageValue,
} from "@/lib/markdown/folding";

describe("buildHeadingFoldTree", () => {
  it("builds nested heading sections by markdown hierarchy", () => {
    const result = buildHeadingFoldTree(`# A
Intro
## B
B body
### C
C body
## D
D body
# E
E body`);

    expect(result.sections).toMatchObject([
      {
        level: 1,
        title: "A",
        bodyMarkdown: "Intro\n",
        children: [
          {
            level: 2,
            title: "B",
            bodyMarkdown: "B body\n",
            children: [{ level: 3, title: "C", bodyMarkdown: "C body\n", children: [] }],
          },
          { level: 2, title: "D", bodyMarkdown: "D body\n", children: [] },
        ],
      },
      { level: 1, title: "E", bodyMarkdown: "E body", children: [] },
    ]);
  });

  it("creates stable unique keys for repeated headings under the same parent", () => {
    const result = buildHeadingFoldTree(`# Root
## Notes
One
## Notes
Two`);

    expect(result.sections[0]?.children.map((section) => section.key)).toEqual([
      "1-root-0/2-notes-0",
      "1-root-0/2-notes-1",
    ]);
  });

  it("ignores frontmatter and code block heading-like text", () => {
    const result = buildHeadingFoldTree(`---
title: "# Not a heading"
---
# Real
\`\`\`
## Not a heading
\`\`\`
    ### Also not a heading
Body`);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.title).toBe("Real");
    expect(result.sections[0]?.bodyMarkdown).toContain("## Not a heading");
    expect(result.sections[0]?.bodyMarkdown).toContain("### Also not a heading");
  });

  it("does not close fenced code blocks when fence markers have trailing text", () => {
    const result = buildHeadingFoldTree(`# Intro
\`\`\`
\`\`\` not a closing fence
# Still code
\`\`\`
# Real
Body`);

    expect(result.sections).toHaveLength(2);
    expect(result.sections.map((section) => section.title)).toEqual(["Intro", "Real"]);
    expect(result.sections[0]?.bodyMarkdown).toContain("``` not a closing fence");
    expect(result.sections[0]?.bodyMarkdown).toContain("# Still code");
    expect(result.sections[1]?.bodyMarkdown).toBe("Body");
  });

  it("recognizes headings after CRLF fenced code blocks", () => {
    const result = buildHeadingFoldTree("```ts\r\nconst value = 1;\r\n```\r\n# Real\r\nBody");

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.title).toBe("Real");
    expect(result.sections[0]?.bodyMarkdown).toBe("Body");
  });

  it("returns editor line ranges for heading bodies", () => {
    const result = buildHeadingFoldTree(`# A
Intro
## B
B body
# C`);

    expect(result.sections[0]?.editorRange).toEqual({ fromLine: 2, toLine: 4 });
    expect(result.sections[0]?.children[0]?.editorRange).toEqual({ fromLine: 4, toLine: 4 });
  });

  it("indexes finalized sections by key", () => {
    const result = buildHeadingFoldTree("# A\n## B\nBody");
    const child = result.sections[0]?.children[0];

    expect(child).toBeDefined();
    expect(result.sectionByKey.get(child!.key)).toBe(child);
  });
});

describe("folded heading storage helpers", () => {
  it("keeps only keys that still exist in the current document", () => {
    const result = buildHeadingFoldTree("# A\nBody");

    expect(getValidFoldedHeadingKeys(["1-a-0", "missing"], result.headingKeys)).toEqual(["1-a-0"]);
  });

  it("serializes folded keys as a stable JSON array", () => {
    expect(createHeadingFoldStorageValue(new Set(["b", "a"]))).toBe("[\"a\",\"b\"]");
  });

  it("parses only valid string array storage values", () => {
    expect(parseHeadingFoldStorageValue("[\"a\",\"b\"]")).toEqual(["a", "b"]);
    expect(parseHeadingFoldStorageValue("[\"a\",1]")).toEqual([]);
    expect(parseHeadingFoldStorageValue("{\"a\":true}")).toEqual([]);
    expect(parseHeadingFoldStorageValue("not-json")).toEqual([]);
    expect(parseHeadingFoldStorageValue(null)).toEqual([]);
  });
});
