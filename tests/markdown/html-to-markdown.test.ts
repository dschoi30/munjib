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

  it("preserves whitespace between inline HTML elements", () => {
    expect(htmlToMarkdown("<p><span>Alpha</span> <span>Beta</span></p>")).toBe("Alpha Beta");
  });

  it("wraps inline code with a delimiter longer than the pasted backtick runs", () => {
    expect(htmlToMarkdown("<p><code>`code` and ``more``</code></p>")).toBe(
      "``` `code` and ``more`` ```",
    );
  });

  it("preserves nested list indentation", () => {
    expect(htmlToMarkdown("<ul><li>Parent<ul><li>Child</li></ul></li></ul>")).toBe(
      "- Parent\n  - Child",
    );
  });

  it("preserves table cell and row boundaries", () => {
    expect(
      htmlToMarkdown("<table><tr><td>A1</td><td>B1</td></tr><tr><td>A2</td><td>B2</td></tr></table>"),
    ).toBe("A1\tB1\nA2\tB2");
  });

  it("preserves significant whitespace inside inline code", () => {
    expect(htmlToMarkdown("<p><code>const  value\t=\t1</code></p>")).toBe("`const  value\t=\t1`");
  });
});
