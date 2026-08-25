// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { requestTurnstileToken } from "@/lib/auth/turnstile-client";

const scriptSelector = "#munjib-turnstile-script";
const siteKey = "0x4AAAAAAAtest-site-key";

afterEach(() => {
  vi.useRealTimers();
  delete window.turnstile;
  document.querySelectorAll(scriptSelector).forEach((script) => script.remove());
});

describe("Turnstile client script loading", () => {
  it("removes a failed script so a retry inserts and loads a fresh element", async () => {
    const firstRequest = requestTurnstileToken(siteKey);
    const failedScript = document.querySelector(scriptSelector) as HTMLScriptElement;
    failedScript.dispatchEvent(new Event("error"));

    await expect(firstRequest).rejects.toThrow("TURNSTILE_SCRIPT_FAILED");
    expect(document.querySelector(scriptSelector)).toBeNull();

    const secondRequest = requestTurnstileToken(siteKey);
    const retryScript = document.querySelector(scriptSelector) as HTMLScriptElement;
    expect(retryScript).not.toBe(failedScript);
    installSuccessfulApi("retry-token");
    retryScript.dispatchEvent(new Event("load"));

    await expect(secondRequest).resolves.toBe("retry-token");
  });

  it("removes a timed-out script so a later request can retry", async () => {
    vi.useFakeTimers();
    const request = requestTurnstileToken(siteKey);
    const rejection = expect(request).rejects.toThrow("TURNSTILE_SCRIPT_TIMEOUT");

    await vi.advanceTimersByTimeAsync(15_000);

    await rejection;
    expect(document.querySelector(scriptSelector)).toBeNull();
  });

  it("shares one pending script across concurrent requests", async () => {
    const firstRequest = requestTurnstileToken(siteKey);
    const secondRequest = requestTurnstileToken(siteKey);
    const scripts = document.querySelectorAll(scriptSelector);
    expect(scripts).toHaveLength(1);

    installSuccessfulApi("shared-token");
    scripts[0]!.dispatchEvent(new Event("load"));

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      "shared-token",
      "shared-token",
    ]);
  });
});

function installSuccessfulApi(token: string) {
  window.turnstile = {
    render: vi.fn((_container, options) => {
      queueMicrotask(() => options.callback(token));
      return "widget-1";
    }),
    remove: vi.fn(),
  };
}
