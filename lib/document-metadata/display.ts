export type DisplayDocumentProperty = {
  key: string;
};

const CANONICAL_PROPERTY_ROWS = new Set(["links", "tags"]);

export function visibleDocumentProperties<T extends DisplayDocumentProperty>(properties: T[]) {
  return properties.filter((property) => !CANONICAL_PROPERTY_ROWS.has(property.key));
}
