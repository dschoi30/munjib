import { describe, expect, it } from "vitest";
import { getMessage, messages } from "@/lib/i18n/messages";

describe("i18n message catalog", () => {
  it("has matching English and Korean keys", () => {
    expect(Object.keys(messages.ko).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it("returns localized strings by key", () => {
    expect(getMessage("en", "settings.title")).toBe("Settings");
    expect(getMessage("ko", "settings.title")).toBe("설정");
  });

  it("supports parameter interpolation", () => {
    expect(getMessage("en", "settings.language.pending", { language: "Korean" })).toBe(
      "Korean will apply after you save.",
    );
    expect(getMessage("ko", "settings.language.pending", { language: "영어" })).toBe(
      "저장하면 영어로 적용됩니다.",
    );
  });
});
