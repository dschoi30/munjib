// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_LANGUAGE_STORAGE_KEY,
  readStoredLanguage,
  subscribeToStoredLanguageChanges,
  writeStoredLanguage,
} from "@/lib/i18n/storage";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("language storage", () => {
  it("reads and writes a valid browser-global language", () => {
    expect(readStoredLanguage()).toBeNull();
    expect(writeStoredLanguage("ko")).toEqual({ language: "ko", stored: true });
    expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe("ko");
    expect(readStoredLanguage()).toBe("ko");
  });

  it("ignores invalid stored values", () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, "fr");
    expect(readStoredLanguage()).toBeNull();
  });

  it("reports storage write failure without throwing", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(writeStoredLanguage("ko")).toEqual({ language: "ko", stored: false });
  });

  it("notifies same-tab subscribers on write", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToStoredLanguageChanges(listener);

    writeStoredLanguage("ko");

    expect(listener).toHaveBeenCalledWith({ language: "ko" });
    unsubscribe();
  });
});
