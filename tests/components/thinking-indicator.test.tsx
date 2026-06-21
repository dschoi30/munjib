// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render as testingRender, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";
import { I18nProvider } from "@/components/i18n-provider";

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ThinkingIndicator", () => {
  it("advances through the English elapsed-time messages", () => {
    render(<ThinkingIndicator active />);

    expect(screen.getByText("Thinking...")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("Reviewing the relevant document context...")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText("Organizing the evidence and drafting an answer...")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("This is taking longer than usual. Thanks for your patience...")).toBeTruthy();
  });

  it("advances through the Korean elapsed-time messages from the selected UI language", () => {
    window.localStorage.setItem("munjib:language", "ko");

    render(<ThinkingIndicator active />);

    expect(screen.getByText("생각 중...")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("관련 문서 맥락을 검토하고 있습니다...")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText("근거를 정리하고 답변을 작성하고 있습니다...")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("평소보다 오래 걸리고 있습니다. 기다려 주셔서 감사합니다...")).toBeTruthy();
  });

  it("renders nothing when inactive", () => {
    const { container } = render(<ThinkingIndicator active={false} />);

    expect(container.textContent).toBe("");
  });
});

function render(ui: React.ReactElement) {
  return testingRender(<I18nProvider>{ui}</I18nProvider>);
}
