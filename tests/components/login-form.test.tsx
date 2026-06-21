// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    value: { assign: vi.fn() },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderLoginForm() {
  return render(
    <I18nProvider>
      <LoginForm />
    </I18nProvider>,
  );
}

describe("LoginForm", () => {
  it("uses the selected Korean display language for login chrome and errors", async () => {
    window.localStorage.setItem("munjib:language", "ko");
    authMock.signIn.mockResolvedValue({ error: "CredentialsSignin" });

    renderLoginForm();

    expect(await screen.findByRole("heading", { name: "개발 로그인" })).toBeTruthy();
    expect(screen.getByText("owner@example.com, editor@example.com, viewer@example.com 중 하나를 사용하세요.")).toBeTruthy();
    expect(screen.getByLabelText("이메일")).toHaveProperty("value", "owner@example.com");
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "로컬 세션 지우기" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(
      await screen.findByText(
        "일치하는 개발 사용자를 찾을 수 없습니다. pnpm run db:seed를 실행한 뒤 목록의 계정 중 하나로 다시 시도하세요.",
      ),
    ).toBeTruthy();
  });
});
