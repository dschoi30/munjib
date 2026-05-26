import { describe, expect, it } from "vitest";
import { parseDocumentMetadata, stripDocumentFrontmatter } from "@/lib/document-metadata/parser";

describe("parseDocumentMetadata", () => {
  it("extracts YAML frontmatter properties and inline tags", () => {
    expect(
      parseDocumentMetadata(`---
owner: Platform
status: draft
review_due_at: 2026-05-01
priority: 2
published: false
---

# Runbook

Use #incident and #platform notes.`),
    ).toEqual({
      tags: ["incident", "platform"],
      properties: [
        { key: "owner", value: "Platform", valueType: "string" },
        { key: "status", value: "draft", valueType: "string" },
        { key: "review_due_at", value: "2026-05-01", valueType: "date" },
        { key: "priority", value: 2, valueType: "number" },
        { key: "published", value: false, valueType: "boolean" },
      ],
    });
  });

  it("ignores duplicate tags and fenced code blocks", () => {
    expect(parseDocumentMetadata("#one #one\n```md\n#ignored\n```").tags).toEqual(["one"]);
  });

  it("extracts Korean inline tags", () => {
    expect(parseDocumentMetadata("관련 내용 #LangChain #로드맵 #AI_요약").tags).toEqual([
      "LangChain",
      "로드맵",
      "AI_요약",
    ]);
  });

  it("extracts frontmatter tags and deduplicates them with inline tags", () => {
    expect(
      parseDocumentMetadata(`---
tags:
  - LangChain
  - "#로드맵"
---

본문 #로드맵 #AI_요약`).tags,
    ).toEqual(["LangChain", "로드맵", "AI_요약"]);
  });

  it("accepts CRLF frontmatter from browser editors", () => {
    expect(parseDocumentMetadata("---\r\nowner: Platform\r\n---\r\n# Title").properties).toEqual([
      { key: "owner", value: "Platform", valueType: "string" },
    ]);
  });

  it("parses standard YAML values without splitting on colons or newlines", () => {
    expect(
      parseDocumentMetadata(`---
summary: "Owner: Platform"
notes: |
  first line
  second line
owners:
  - Platform
  - Design
settings:
  review: true
---

# Plan`).properties,
    ).toEqual([
      { key: "summary", value: "Owner: Platform", valueType: "string" },
      { key: "notes", value: "first line\nsecond line\n", valueType: "string" },
      { key: "owners", value: ["Platform", "Design"], valueType: "array" },
      { key: "settings", value: { review: true }, valueType: "object" },
    ]);
  });

  it("strips leading YAML frontmatter from preview body content", () => {
    expect(
      stripDocumentFrontmatter(`---
owner: Platform
links:
  - "[[Welcome]]"
---

# Plan

See [[Welcome]].`),
    ).toBe("# Plan\n\nSee [[Welcome]].");
  });

  it("keeps markdown unchanged when there is no leading YAML frontmatter block", () => {
    expect(stripDocumentFrontmatter("# Plan\n\n---\nnot frontmatter")).toBe(
      "# Plan\n\n---\nnot frontmatter",
    );
  });
});
