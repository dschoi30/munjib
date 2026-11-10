// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/app/login/login-form";
import { I18nProvider } from "@/components/i18n-provider";

const authMock = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: authMock.signIn,
  signOut: authMock.signOut,
}));

beforeEach(() => {
  let store: Record<string, string> = {};
  authMock.signIn.mockReset();
  authMock.signOut.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ redirectPath: "/workspaces/company-handbook" }),
    }),
  );

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => {
        store = {};
      },
      getItem: (key: string) => store[key] ?? null,
      removeItem: (key: string) => {
        delete store[key];
      },
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    },
  });

  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: vi.fn(), origin: "https://munjib.example" },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderLoginForm(
  callbackUrl?: string,
  options: {
    isDevLoginEnabled?: boolean;
    isGoogleLoginEnabled?: boolean;
    isTrialLoginEnabled?: boolean;
    trialTurnstileSiteKey?: string;
    requestTrialChallengeToken?: (siteKey: string) => Promise<string>;
    isSignupEnabled?: boolean;
    startDemoOnMount?: boolean;
  } = {},
) {
  return render(
    <I18nProvider>
      <LoginForm
        {...(callbackUrl ? { callbackUrl } : {})}
        isDevLoginEnabled={options.isDevLoginEnabled ?? true}
        isGoogleLoginEnabled={options.isGoogleLoginEnabled ?? true}
        isTrialLoginEnabled={options.isTrialLoginEnabled ?? true}
        trialTurnstileSiteKey={options.trialTurnstileSiteKey}
        requestTrialChallengeToken={options.requestTrialChallengeToken}
        isSignupEnabled={options.isSignupEnabled ?? true}
        startDemoOnMount={options.startDemoOnMount ?? false}
      />
    </I18nProvider>,
  );
}

describe("LoginForm", () => {
  it("starts the real Trial entitlement flow when opened from the landing demo button", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ entry: { path: "/trial/workspaces/company-handbook" } }),
    } as Response);

    renderLoginForm(undefined, { startDemoOnMount: true });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith("/api/trial/entitlement", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      signal: expect.any(AbortSignal),
    });
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith("/trial/workspaces/company-handbook"),
    );
  });

  it("cancels demo entry when its dialog closes before the entitlement arrives", async () => {
    let resolveEntitlement!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveEntitlement = resolve;
    }));

    const view = renderLoginForm(undefined, { startDemoOnMount: true });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;

    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolveEntitlement({
        ok: true,
        json: async () => ({ entry: { path: "/trial/workspaces/company-handbook" } }),
      } as Response);
    });
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("cancels manually started Trial entry when its dialog closes", async () => {
    let resolveEntitlement!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveEntitlement = resolve;
    }));

    const view = renderLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: "Explore demo (read-only) No signup" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;

    view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolveEntitlement({
        ok: true,
        json: async () => ({ entry: { path: "/trial/workspaces/company-handbook" } }),
      } as Response);
    });
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("opens the seeded read-only viewer when Trial is closed in local development", async () => {
    authMock.signIn.mockResolvedValue({
      url: "https://munjib.example/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
    });

    renderLoginForm(undefined, {
      isTrialLoginEnabled: false,
      isDevLoginEnabled: true,
      startDemoOnMount: true,
    });

    await waitFor(() => expect(authMock.signIn).toHaveBeenCalledTimes(1));
    expect(authMock.signIn).toHaveBeenCalledWith("development-login", expect.objectContaining({
      email: "viewer@example.com",
      redirect: false,
    }));
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith(
      "/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
    ));
  });

  it("omits account-creation controls when signup is disabled", async () => {
    renderLoginForm(undefined, { isSignupEnabled: false });

    expect(await screen.findByRole("heading", { name: "Welcome to Munjib" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create one" })).toBeNull();
    expect(screen.queryByText("Don't have an account?")).toBeNull();
  });

  it("waits for the stored Korean display language before rendering auth text", async () => {
    window.localStorage.setItem("munjib:language", "ko");

    renderLoginForm();

    expect(screen.queryByRole("heading", { name: "Welcome to Munjib" })).toBeNull();
    expect(await screen.findByRole("heading", { name: "문집에 오신 것을 환영합니다" })).toBeTruthy();
    expect(screen.getByText("로그인하여 문집을 사용해 보세요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Google로 계속하기" })).toBeTruthy();
    expect(screen.getByLabelText("이메일")).toBeTruthy();
    expect(screen.getByLabelText("비밀번호")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "데모 둘러보기(읽기 전용) 가입 없이" })).toBeTruthy();
  });

  it("renders the Hypothesis #3 Real Auth Stack hierarchy in English", async () => {
    renderLoginForm();

    expect(await screen.findByRole("heading", { name: "Welcome to Munjib" })).toBeTruthy();
    expect(screen.getByText("Sign in to use Munjib.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByText("or")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Forgot password?" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Password reset is coming soon.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("Don't have an account?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create one" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Explore demo (read-only) No signup" })).toBeTruthy();
  });

  it("hides the Google provider block when Google login is not configured", async () => {
    renderLoginForm(undefined, { isGoogleLoginEnabled: false });

    expect(await screen.findByRole("heading", { name: "Welcome to Munjib" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByText("or")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("hides the trial provider when the server deployment gate is off", async () => {
    renderLoginForm(undefined, { isTrialLoginEnabled: false });

    expect(await screen.findByRole("heading", { name: "Welcome to Munjib" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Explore demo (read-only) No signup" })).toBeNull();
  });

  it("submits email and password through the password provider", async () => {
    authMock.signIn.mockResolvedValue({
      url: "http://localhost:3000/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
    });

    renderLoginForm();

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(authMock.signIn).toHaveBeenCalledWith("password", {
        email: "member@example.com",
        password: "correct horse",
        redirect: false,
        callbackUrl: "/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
      });
    });
    expect(window.location.assign).toHaveBeenCalledWith(
      "/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
    );
  });

  it("does not navigate when password login finishes after the dialog closes", async () => {
    let resolveSignIn!: (result: { url: string }) => void;
    authMock.signIn.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSignIn = resolve;
    }));

    const view = renderLoginForm();
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "member@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct horse" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(authMock.signIn).toHaveBeenCalledWith("password", expect.anything()));

    view.unmount();
    await act(async () => {
      resolveSignIn({ url: "/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook" });
    });
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("locks auth controls while password submission is in flight", async () => {
    authMock.signIn.mockReturnValue(new Promise(() => {}));

    renderLoginForm();

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(authMock.signIn).toHaveBeenCalledWith("password", {
        email: "member@example.com",
        password: "correct horse",
        redirect: false,
        callbackUrl: "/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
      });
    });

    expect(screen.getByLabelText("Email")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Password")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Show password" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Forgot password?" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Signing in..." })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Create one" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Explore demo (read-only) No signup" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("starts Google sign-in with the hydrated post-auth redirect", async () => {
    authMock.signIn.mockResolvedValue(undefined);

    renderLoginForm("/workspaces/team-handbook");

    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(authMock.signIn).toHaveBeenCalledWith("google", {
        callbackUrl: "/login/redirect?callbackUrl=%2Fworkspaces%2Fteam-handbook",
      });
    });
  });

  it("recovers the sign-in button when the authentication request fails", async () => {
    authMock.signIn.mockRejectedValue(new Error("network unavailable"));
    renderLoginForm();

    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "viewer@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "example-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Sign in failed. Clear the local session and try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveProperty("disabled", false);
  });

  it("creates an email account with the hydrated language before signing in", async () => {
    window.localStorage.setItem("munjib:language", "ko");
    authMock.signIn.mockResolvedValue({
      url: "http://localhost:3000/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        email: "new-member@example.com",
        redirectPath: "/workspaces/my-workspace-user-1",
      }),
    } as Response);

    renderLoginForm();

    fireEvent.click(await screen.findByRole("button", { name: "만들기" }));
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "new-member@example.com" },
    });
    fireEvent.change(screen.getByLabelText("비밀번호"), {
      target: { value: "correct horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "계정 만들기" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "new-member@example.com",
          password: "correct horse",
          language: "ko",
        }),
      });
    });
    await waitFor(() => {
      expect(authMock.signIn).toHaveBeenCalledWith("password", {
        email: "new-member@example.com",
        password: "correct horse",
        redirect: false,
        callbackUrl: "/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
      });
    });
  });

  it("creates an anonymous Trial entitlement and follows only the server entry projection", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        remaining: 3,
        limit: 3,
        resetsAt: "2026-08-25T15:00:00.000Z",
        entry: { path: "/trial/workspaces/company-handbook" },
      }),
    } as Response);

    renderLoginForm();

    fireEvent.click(await screen.findByRole("button", { name: "Explore demo (read-only) No signup" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/trial/entitlement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
        signal: expect.any(AbortSignal),
      });
    });
    expect(authMock.signIn).not.toHaveBeenCalledWith("trial", expect.anything());
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith("/trial/workspaces/company-handbook"),
    );
  });

  it("fails closed when Trial entitlement returns an external or malformed entry path", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        remaining: 3,
        limit: 3,
        resetsAt: "2026-08-25T15:00:00.000Z",
        entry: { path: "https://evil.example/trial/workspaces/company-handbook" },
      }),
    } as Response);

    renderLoginForm();
    fireEvent.click(await screen.findByRole("button", { name: "Explore demo (read-only) No signup" }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(window.location.assign).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Sign in failed. Clear the local session and try again."),
    ).toBeTruthy();
  });

  it("solves a required Turnstile challenge and resubmits exactly once", async () => {
    const requestTrialChallengeToken = vi.fn().mockResolvedValue("single-use-token");
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ challengeRequired: true }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entry: { path: "/trial/workspaces/company-handbook" } }),
      } as Response);

    renderLoginForm(undefined, {
      trialTurnstileSiteKey: "0x4AAAAAAAtest-site-key",
      requestTrialChallengeToken,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Explore demo (read-only) No signup" }));

    await waitFor(() => expect(requestTrialChallengeToken).toHaveBeenCalledTimes(1));
    expect(requestTrialChallengeToken).toHaveBeenCalledWith("0x4AAAAAAAtest-site-key", expect.any(HTMLElement));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/trial/entitlement", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeToken: "single-use-token" }),
      signal: expect.any(AbortSignal),
    });
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith("/trial/workspaces/company-handbook"),
    );
  });

  it("fails closed without retry when Turnstile configuration or solving fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ challengeRequired: true }),
    } as Response);
    const requestTrialChallengeToken = vi.fn().mockRejectedValue(new Error("widget failed"));

    renderLoginForm(undefined, { requestTrialChallengeToken });
    fireEvent.click(await screen.findByRole("button", { name: "Explore demo (read-only) No signup" }));

    await screen.findByText("Sign in failed. Clear the local session and try again.");
    expect(requestTrialChallengeToken).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps development login shortcuts hidden when the server gate is off", async () => {
    renderLoginForm(undefined, { isDevLoginEnabled: false });

    expect(await screen.findByRole("heading", { name: "Welcome to Munjib" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "owner@example.com" })).toBeNull();
    expect(screen.queryByText("Development email login")).toBeNull();
  });

  it("keeps the default post-login redirect on the current browser origin", async () => {
    authMock.signIn.mockResolvedValue({
      url: "http://localhost:3000/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
    });

    renderLoginForm();

    fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(authMock.signIn).toHaveBeenCalledWith("password", {
        email: "",
        password: "",
        redirect: false,
        callbackUrl: "/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
      });
    });
    expect(window.location.assign).toHaveBeenCalledWith(
      "/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
    );
  });

  it("falls back to the default post-login redirect for browser-normalized external callback paths", async () => {
    authMock.signIn.mockResolvedValue({
      url: "https://evil.example/phish",
    });

    renderLoginForm("/\\evil.example");

    fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(authMock.signIn).toHaveBeenCalledWith("password", {
        email: "",
        password: "",
        redirect: false,
        callbackUrl: "/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
      });
    });
    expect(window.location.assign).toHaveBeenCalledWith(
      "/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
    );
  });
});
