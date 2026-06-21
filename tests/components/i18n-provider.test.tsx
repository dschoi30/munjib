// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "@/components/i18n-provider";
import { APP_LANGUAGE_STORAGE_KEY } from "@/lib/i18n/storage";

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "languages", {
    configurable: true,
    value: ["ko-KR", "en-US"],
  });
});

afterEach(() => {
  cleanup();
});

function Probe() {
  const { language, setLanguage, t } = useI18n();

  return (
    <div>
      <p>{language}</p>
      <p>{t("settings.title")}</p>
      <button type="button" onClick={() => setLanguage("en")}>
        Set English
      </button>
    </div>
  );
}

describe("I18nProvider", () => {
  it("infers Korean from browser hints when no language is stored", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("ko")).toBeTruthy();
    expect(screen.getByText("설정")).toBeTruthy();
    expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.lang).toBe("ko");
  });

  it("uses the stored language before browser hints", () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, "en");

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("en")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  it("updates language and stores explicit user selection", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Set English" }));

    expect(screen.getByText("en")).toBeTruthy();
    expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
