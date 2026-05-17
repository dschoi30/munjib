import type { FavoriteState } from "@/components/document-navigation/types";

export const emptyFavorites: FavoriteState = { documents: [], folders: [] };

export function parseFavorites(raw: string | null): FavoriteState {
  if (!raw) return emptyFavorites;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return { documents: parsed.filter(isString), folders: [] };
    if (!parsed || typeof parsed !== "object") return emptyFavorites;

    const value = parsed as Partial<Record<keyof FavoriteState, unknown>>;
    return {
      documents: Array.isArray(value.documents) ? value.documents.filter(isString) : [],
      folders: Array.isArray(value.folders) ? value.folders.filter(isString) : [],
    };
  } catch {
    return emptyFavorites;
  }
}

export function toggleListValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
