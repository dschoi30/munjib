import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  inferLanguageFromBrowserHints,
  languageLabel,
  parseLanguage,
  SUPPORTED_LANGUAGES,
} from "@/lib/i18n/language";

describe("i18n language core", () => {
  it("accepts only supported display languages", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["en", "ko"]);
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("ko")).toBe(true);
    expect(isLanguage("ko-KR")).toBe(false);
    expect(isLanguage("fr")).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });

  it("parses unknown values as null", () => {
    expect(parseLanguage("en")).toBe("en");
    expect(parseLanguage("ko")).toBe("ko");
    expect(parseLanguage(" ko ")).toBeNull();
    expect(parseLanguage("")).toBeNull();
    expect(parseLanguage(undefined)).toBeNull();
  });

  it("infers Korean from browser or OS Korean hints", () => {
    expect(inferLanguageFromBrowserHints(["ko-KR", "en-US"])).toBe("ko");
    expect(inferLanguageFromBrowserHints(["KO", "en-US"])).toBe("ko");
    expect(inferLanguageFromBrowserHints(["en-US", "ko"])).toBe("ko");
  });

  it("falls back to English for non-Korean or missing hints", () => {
    expect(inferLanguageFromBrowserHints(["en-US"])).toBe("en");
    expect(inferLanguageFromBrowserHints(["ja-JP", "en-US"])).toBe("en");
    expect(inferLanguageFromBrowserHints([])).toBe("en");
    expect(inferLanguageFromBrowserHints(undefined)).toBe("en");
  });

  it("returns localized language labels", () => {
    expect(languageLabel("en", "en")).toBe("English");
    expect(languageLabel("ko", "en")).toBe("Korean");
    expect(languageLabel("en", "ko")).toBe("영어");
    expect(languageLabel("ko", "ko")).toBe("한국어");
  });
});
