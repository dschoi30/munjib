// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "@/components/landing-page";
import { I18nProvider } from "@/components/i18n-provider";

const authMock = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));

vi.mock("next-auth/react", () => authMock);
vi.mock("next/image", () => ({ default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} /> }));

beforeEach(() => {
  authMock.signIn.mockReset();
  authMock.signOut.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: vi.fn(), origin: "https://munjib.example" },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LandingPage login dialog", () => {
  it("stays open during Google OAuth navigation and can close after an error", async () => {
    let rejectSignIn!: (reason: Error) => void;
    authMock.signIn.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSignIn = reject;
    }));

    render(
      <I18nProvider>
        <LandingPage loginConfig={{
          isDevLoginEnabled: false,
          isGoogleLoginEnabled: true,
          isTrialLoginEnabled: false,
          isSignupEnabled: false,
        }} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(authMock.signIn).toHaveBeenCalledWith("google", expect.anything()));

    const closeButton = screen.getByRole("button", { name: "로그인 창 닫기" });
    expect(closeButton).toHaveProperty("disabled", true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "로그인" })).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("dialog", { name: "로그인" }));
    expect(screen.getByRole("dialog", { name: "로그인" })).toBeTruthy();

    await act(async () => rejectSignIn(new Error("OAuth unavailable")));
    await waitFor(() => expect(closeButton).toHaveProperty("disabled", false));
    fireEvent.click(closeButton);
    expect(screen.queryByRole("dialog", { name: "로그인" })).toBeNull();
  });
});
