import { parseDocument } from "yaml";

type ParsedDocumentPropertyValue =
  | string
  | boolean
  | number
  | ParsedDocumentPropertyValue[]
  | { [key: string]: ParsedDocumentPropertyValue };

export type ParsedDocumentProperty = {
  key: string;
  value: ParsedDocumentPropertyValue;
  valueType: "string" | "boolean" | "number" | "date" | "array" | "object";
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

export function stripDocumentFrontmatter(markdown: string) {
  const normalizedMarkdown = markdown.replace(/\r\n/g, "\n").trimStart();
  const match = normalizedMarkdown.match(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/);
  if (!match) return markdown;

  return normalizedMarkdown.slice(match[0].length).replace(/^\n/, "");
}

function parseFrontmatter(markdown: string): ParsedDocumentProperty[] {
  const normalizedMarkdown = markdown.replace(/\r\n/g, "\n").trimStart();
  if (!normalizedMarkdown.startsWith("---\n")) return [];

  const end = normalizedMarkdown.indexOf("\n---", 4);
  if (end === -1) return [];

  const raw = normalizedMarkdown.slice(4, end).trim();
  if (!raw) return [];

  const document = parseDocument(raw);
  if (document.errors.length > 0) return [];

  const parsed = document.toJSON();
  if (!isPlainObject(parsed)) return [];

  const properties: ParsedDocumentProperty[] = [];
  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    const key = normalizePropertyKey(rawKey);
    if (!key || rawValue == null) continue;

    const value = normalizeFrontmatterValue(rawValue);
    if (value == null) continue;

    properties.push({ key, value, valueType: propertyValueType(value) });
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

function normalizeFrontmatterValue(value: unknown): ParsedDocumentPropertyValue | null {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeFrontmatterValue(item))
      .filter((item): item is ParsedDocumentPropertyValue => item != null);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, normalizeFrontmatterValue(item)] as const)
        .filter((entry): entry is readonly [string, ParsedDocumentPropertyValue] => entry[1] != null),
    );
  }

  return null;
}

function propertyValueType(value: ParsedDocumentPropertyValue): ParsedDocumentProperty["valueType"] {
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
  return "string";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
