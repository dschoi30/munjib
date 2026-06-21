export const SUPPORTED_LANGUAGES = ["en", "ko"] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";

export type LanguageOption = {
  value: Language;
  nativeName: string;
  labels: Record<Language, string>;
};

export const LANGUAGE_OPTIONS = [
  {
    value: "en",
    nativeName: "English",
    labels: {
      en: "English",
      ko: "영어",
    },
  },
  {
    value: "ko",
    nativeName: "한국어",
    labels: {
      en: "Korean",
      ko: "한국어",
    },
  },
] as const satisfies readonly LanguageOption[];

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as Language);
}

export function parseLanguage(value: unknown): Language | null {
  return isLanguage(value) ? value : null;
}

export function inferLanguageFromBrowserHints(hints: readonly string[] | undefined): Language {
  if (!hints || hints.length === 0) return DEFAULT_LANGUAGE;
  return hints.some((hint) => isKoreanLanguageHint(hint)) ? "ko" : DEFAULT_LANGUAGE;
}

export function languageLabel(language: Language, displayLanguage: Language) {
  return (
    LANGUAGE_OPTIONS.find((option) => option.value === language)?.labels[displayLanguage] ??
    language
  );
}

function isKoreanLanguageHint(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "ko" || normalized.startsWith("ko-");
}
