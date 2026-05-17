// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "@/lib/markdown/html-to-markdown";

describe("htmlToMarkdown", () => {
  it("converts common rich clipboard HTML into semantic markdown", () => {
    expect(
      htmlToMarkdown(`
        <h2>Release Notes</h2>
        <p><strong>Bold</strong> and <em>italic</em> text with <a href="https://example.com">a link</a>.</p>
        <ul><li>First</li><li><code>Second</code></li></ul>
        <blockquote>Quoted text</blockquote>
      `),
    ).toBe(
      [
        "## Release Notes",
        "",
        "**Bold** and _italic_ text with [a link](https://example.com).",
        "",
        "- First",
        "- `Second`",
        "",
        "> Quoted text",
      ].join("\n"),
    );
  });

  it("preserves pasted line breaks from HTML fragments", () => {
    expect(htmlToMarkdown("<p>First<br>Second</p><p>Third</p>")).toBe("First\nSecond\n\nThird");
  });
});
