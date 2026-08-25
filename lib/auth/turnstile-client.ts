const TURNSTILE_SCRIPT_ID = "munjib-turnstile-script";
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_TIMEOUT_MS = 15_000;

type TurnstileApi = {
  render(container: HTMLElement, options: {
    sitekey: string;
    action: string;
    callback(token: string): void;
    "error-callback"(): void;
    "expired-callback"(): void;
    "timeout-callback"(): void;
  }): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export async function requestTurnstileToken(siteKey: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(siteKey)) throw new Error("TURNSTILE_SITE_KEY_INVALID");
  await loadTurnstileScript();
  const api = window.turnstile;
  if (!api) throw new Error("TURNSTILE_API_UNAVAILABLE");

  const container = document.createElement("div");
  container.setAttribute("aria-label", "Trial verification");
  document.body.append(container);

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let widgetId: string | undefined;
    let timeoutId = 0;
    const finish = (token?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (widgetId) api.remove(widgetId);
      container.remove();
      if (token && token.length <= 4096) resolve(token);
      else reject(new Error("TURNSTILE_CHALLENGE_FAILED"));
    };
    timeoutId = window.setTimeout(() => finish(), TURNSTILE_TIMEOUT_MS);
    widgetId = api.render(container, {
      sitekey: siteKey,
      action: "trial_entitlement",
      callback: (token) => finish(token),
      "error-callback": () => finish(),
      "expired-callback": () => finish(),
      "timeout-callback": () => finish(),
    });
  });
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) return waitForScript(existing);
  const script = document.createElement("script");
  script.id = TURNSTILE_SCRIPT_ID;
  script.src = TURNSTILE_SCRIPT_URL;
  script.async = true;
  script.defer = true;
  document.head.append(script);
  return waitForScript(script);
}

function waitForScript(script: HTMLScriptElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    let timeoutId = 0;
    const finish = (error?: Error) => {
      window.clearTimeout(timeoutId);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (error) {
        script.remove();
        reject(error);
      }
      else resolve();
    };
    const onLoad = () => finish(window.turnstile ? undefined : new Error("TURNSTILE_API_UNAVAILABLE"));
    const onError = () => finish(new Error("TURNSTILE_SCRIPT_FAILED"));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    timeoutId = window.setTimeout(
      () => finish(new Error("TURNSTILE_SCRIPT_TIMEOUT")),
      TURNSTILE_TIMEOUT_MS,
    );
  });
}
