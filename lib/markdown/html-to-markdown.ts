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

    return text.replace(/\s+/g, " ");
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
    return block(renderList(node, tagName === "ol", context), { preserveLeadingWhitespace: true });
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

function renderList(node: HTMLElement, ordered: boolean, context: RenderContext): string {
  return Array.from(node.children)
    .filter((child) => child.tagName.toLowerCase() === "li")
    .map((child, index) => renderListItem(child as HTMLElement, ordered ? `${index + 1}.` : "-", context))
    .join("\n");
}

function renderListItem(node: HTMLElement, marker: string, context: RenderContext): string {
  const nextContext = { ...context, listDepth: context.listDepth + 1 };
  const childNodes = Array.from(node.childNodes);
  const nestedLists: HTMLElement[] = [];
  const contentNodes = childNodes.filter((child) => {
    if (
      child instanceof HTMLElement &&
      ["ul", "ol"].includes(child.tagName.toLowerCase())
    ) {
      nestedLists.push(child);
      return false;
    }

    return true;
  });
  const content = normalizeMarkdown(renderChildren(contentNodes, nextContext)).replace(/\n\n/g, "\n");
  const indentation = "  ".repeat(context.listDepth);
  const continuationIndentation = `${indentation}  `;
  const lines = content.split("\n");
  const firstLine = `${indentation}${marker} ${lines[0]?.trim() ?? ""}`;
  const rest = lines
    .slice(1)
    .map((line) => (line.trim().length > 0 ? `${continuationIndentation}${line.trim()}` : ""))
    .join("\n");
  const ownContent = rest ? `${firstLine}\n${rest}` : firstLine;
  const nestedContent: string = nestedLists
    .map((list) => renderList(list, list.tagName.toLowerCase() === "ol", nextContext))
    .filter((list) => list.trim().length > 0)
    .join("\n");

  return nestedContent ? `${ownContent}\n${nestedContent}` : ownContent;
}

function block(content: string, options: { preserveLeadingWhitespace?: boolean } = {}) {
  const trimmed = options.preserveLeadingWhitespace
    ? content.replace(/^\n+/, "").trimEnd()
    : content.trim();

  return trimmed ? `${trimmed}\n\n` : "";
}

function wrapInline(marker: string, content: string) {
  const trimmed = content.trim();

  return trimmed ? `${marker}${trimmed}${marker}` : "";
}

function wrapCode(content: string) {
  const trimmed = content.trim();

  if (!trimmed) {
    return "";
  }

  const longestBacktickRun = Math.max(
    0,
    ...Array.from(trimmed.matchAll(/`+/g), (match) => match[0].length),
  );
  const marker = "`".repeat(longestBacktickRun + 1);
  const padding = trimmed.startsWith("`") || trimmed.endsWith("`") ? " " : "";

  return `${marker}${padding}${trimmed}${padding}${marker}`;
}

function normalizeMarkdown(markdown: string) {
  return markdown
    .replace(/\u00a0/g, " ")
    .replace(/^[ \t]+$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n\n[ \t]+/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
