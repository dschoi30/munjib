// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Skeleton } from "@/components/ui/skeleton";

afterEach(() => {
  cleanup();
});

describe("Skeleton", () => {
  it("renders as decorative loading chrome with caller classes", () => {
    render(<Skeleton data-testid="loading-bar" className="h-2 w-24 rounded-full" />);

    const skeleton = screen.getByTestId("loading-bar");
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton.className).toContain("munjib-skeleton");
    expect(skeleton.className).toContain("h-2");
    expect(skeleton.className).toContain("w-24");
    expect(skeleton.className).toContain("rounded-full");
  });
});
