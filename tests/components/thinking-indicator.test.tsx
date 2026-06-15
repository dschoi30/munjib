// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";

beforeEach(() => {
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

  it("renders nothing when inactive", () => {
    const { container } = render(<ThinkingIndicator active={false} />);

    expect(container.textContent).toBe("");
  });
});
