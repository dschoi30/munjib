// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "@/components/app-shell";

afterEach(() => {
  cleanup();
});

describe("AppShell", () => {
  it("starts the left sidebar at the same vertical origin as the center chrome", () => {
    render(
      <AppShell left={<div>Left</div>} center={<div>Center</div>} right={<div>Right</div>} />,
    );

    const leftSidebar = screen.getByText("Left").closest("aside");

    expect(leftSidebar?.className).toContain("pt-0");
  });
});
