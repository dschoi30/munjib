import { describe, expect, it } from "vitest";
import { parseDocumentMetadata } from "@/lib/document-metadata/parser";

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
});
