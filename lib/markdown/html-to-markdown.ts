type RenderContext = {
  listDepth: number;
};

export function htmlToMarkdown(html: string) {
  if (typeof DOMParser === "undefined" || html.trim().length === 0) {
    return "";
  }

  const document = new DOMParser().parseFromString(html, "text/html");

  return normalizeMarkdown(renderChildren(document.body.childNodes, { listDepth: 0 }));
}

function renderChildren(nodes: NodeListOf<ChildNode> | ChildNode[], context: RenderContext) {
  return Array.from(nodes)
    .map((node) => renderNode(node, context))
    .join("");
}

function renderNode(node: ChildNode, context: RenderContext): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";

    return text.trim().length > 0 ? text.replace(/\s+/g, " ") : "";
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  const tagName = node.tagName.toLowerCase();

  if (tagName === "br") {
    return "\n";
  }

  if (/^h[1-6]$/.test(tagName)) {
    const level = Number(tagName.slice(1));
    return block(`${"#".repeat(level)} ${renderInlineChildren(node, context).trim()}`);
  }

  if (tagName === "p" || tagName === "div" || tagName === "section" || tagName === "article") {
    return block(renderChildren(node.childNodes, context).trim());
  }

  if (tagName === "strong" || tagName === "b") {
    return wrapInline("**", renderInlineChildren(node, context));
  }

  if (tagName === "em" || tagName === "i") {
    return wrapInline("_", renderInlineChildren(node, context));
  }

  if (tagName === "code") {
    return wrapCode(renderInlineChildren(node, context));
  }

  if (tagName === "pre") {
    return block(`\`\`\`\n${node.textContent?.replace(/\n+$/, "") ?? ""}\n\`\`\``);
  }

  if (tagName === "a") {
    const label = renderInlineChildren(node, context).trim() || node.getAttribute("href") || "";
    const href = node.getAttribute("href");

    return href ? `[${label}](${href})` : label;
  }

  if (tagName === "ul" || tagName === "ol") {
    return block(renderList(node, tagName === "ol", context));
  }

  if (tagName === "li") {
    return renderListItem(node, "-", context);
  }

  if (tagName === "blockquote") {
    const quote = normalizeMarkdown(renderChildren(node.childNodes, context));
    return block(
      quote
        .split("\n")
        .map((line) => (line.length > 0 ? `> ${line}` : ">"))
        .join("\n"),
    );
  }

  return renderChildren(node.childNodes, context);
}

function renderInlineChildren(node: HTMLElement, context: RenderContext) {
  return renderChildren(node.childNodes, context).trim();
}

function renderList(node: HTMLElement, ordered: boolean, context: RenderContext) {
  return Array.from(node.children)
    .filter((child) => child.tagName.toLowerCase() === "li")
    .map((child, index) => renderListItem(child as HTMLElement, ordered ? `${index + 1}.` : "-", context))
    .join("\n");
}

function renderListItem(node: HTMLElement, marker: string, context: RenderContext) {
  const nextContext = { ...context, listDepth: context.listDepth + 1 };
  const content = normalizeMarkdown(renderChildren(node.childNodes, nextContext)).replace(/\n\n/g, "\n");
  const indentation = "  ".repeat(context.listDepth);
  const continuationIndentation = `${indentation}  `;
  const lines = content.split("\n");
  const firstLine = `${indentation}${marker} ${lines[0]?.trim() ?? ""}`;
  const rest = lines
    .slice(1)
    .map((line) => (line.trim().length > 0 ? `${continuationIndentation}${line.trim()}` : ""))
    .join("\n");

  return rest ? `${firstLine}\n${rest}` : firstLine;
}

function block(content: string) {
  const trimmed = content.trim();

  return trimmed ? `${trimmed}\n\n` : "";
}

function wrapInline(marker: string, content: string) {
  const trimmed = content.trim();

  return trimmed ? `${marker}${trimmed}${marker}` : "";
}

function wrapCode(content: string) {
  const marker = content.includes("`") ? "``" : "`";

  return `${marker}${content.trim()}${marker}`;
}

function normalizeMarkdown(markdown: string) {
  return markdown
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
