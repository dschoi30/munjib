// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  options: { isDevLoginEnabled?: boolean } = {},
) {
  return render(
    <I18nProvider>
      <LoginForm
        {...(callbackUrl ? { callbackUrl } : {})}
        isDevLoginEnabled={options.isDevLoginEnabled ?? true}
      />
    </I18nProvider>,
  );
}

describe("LoginForm", () => {
  it("waits for the stored Korean display language before rendering auth text", async () => {
    window.localStorage.setItem("munjib:language", "ko");

    renderLoginForm();

    expect(screen.queryByRole("heading", { name: "Welcome back" })).toBeNull();
    expect(await screen.findByRole("heading", { name: "다시 오신 것을 환영합니다" })).toBeTruthy();
    expect(screen.getByText("문집을 계속 사용하려면 로그인하세요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Google로 계속하기" })).toBeTruthy();
    expect(screen.getByLabelText("이메일")).toBeTruthy();
    expect(screen.getByLabelText("비밀번호")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "데모 둘러보기(읽기 전용) 가입 없이" })).toBeTruthy();
  });

  it("renders the Hypothesis #3 Real Auth Stack hierarchy in English", async () => {
    renderLoginForm();

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(screen.getByText("Sign in to continue to Munjib.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByText("or")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("Don't have an account?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create one" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Explore demo (read-only) No signup" })).toBeTruthy();
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

  it("starts the trial provider without sending a password", async () => {
    authMock.signIn.mockResolvedValue({
      url: "http://localhost:3000/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
    });

    renderLoginForm();

    fireEvent.click(await screen.findByRole("button", { name: "Explore demo (read-only) No signup" }));

    await waitFor(() => {
      expect(authMock.signIn).toHaveBeenCalledWith("trial", {
        redirect: false,
        callbackUrl: "/login/redirect?callbackUrl=%2Fworkspaces%2Fcompany-handbook",
      });
    });
  });

  it("keeps development login shortcuts hidden when the server gate is off", async () => {
    renderLoginForm(undefined, { isDevLoginEnabled: false });

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
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
