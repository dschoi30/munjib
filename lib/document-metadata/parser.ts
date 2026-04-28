export type ParsedDocumentProperty = {
  key: string;
  value: string | boolean | number;
  valueType: "string" | "boolean" | "number" | "date";
};

export type ParsedDocumentMetadata = {
  tags: string[];
  properties: ParsedDocumentProperty[];
};

export function parseDocumentMetadata(markdown: string): ParsedDocumentMetadata {
  const properties = parseFrontmatter(markdown);
  const tags = parseTags(markdown);

  return { tags, properties };
}

function parseFrontmatter(markdown: string): ParsedDocumentProperty[] {
  const normalizedMarkdown = markdown.replace(/\r\n/g, "\n").trimStart();
  if (!normalizedMarkdown.startsWith("---\n")) return [];

  const end = normalizedMarkdown.indexOf("\n---", 4);
  if (end === -1) return [];

  const raw = normalizedMarkdown.slice(4, end).trim();
  if (!raw) return [];

  const properties: ParsedDocumentProperty[] = [];
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (!match) continue;

    const key = normalizePropertyKey(match[1] ?? "");
    const rawValue = (match[2] ?? "").trim().replace(/^["']|["']$/g, "");
    if (!key || rawValue === "") continue;

    properties.push({
      key,
      ...coercePropertyValue(rawValue),
    });
  }

  return properties;
}

function parseTags(markdown: string) {
  const tags: string[] = [];
  const seen = new Set<string>();
  const withoutCodeBlocks = markdown.replace(/```[\s\S]*?```/g, "");

  for (const match of withoutCodeBlocks.matchAll(/(^|[\s([>])#([A-Za-z0-9][A-Za-z0-9_-]*)\b/g)) {
    const tag = match[2] ?? "";
    const normalized = normalizeTag(tag);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(tag);
  }

  return tags;
}

function normalizePropertyKey(key: string) {
  return key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

export function normalizeTag(tag: string) {
  return tag.trim().toLowerCase();
}

function coercePropertyValue(rawValue: string): Omit<ParsedDocumentProperty, "key"> {
  if (rawValue === "true" || rawValue === "false") {
    return { value: rawValue === "true", valueType: "boolean" };
  }

  const numberValue = Number(rawValue);
  if (Number.isFinite(numberValue) && rawValue.trim() !== "") {
    return { value: numberValue, valueType: "number" };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return { value: rawValue, valueType: "date" };
  }

  return { value: rawValue, valueType: "string" };
}
