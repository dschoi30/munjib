// @vitest-environment jsdom
import React, { useEffect } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell, useHeadingNavigation } from "@/components/app-shell";

afterEach(() => {
  cleanup();
});

function HeadingNavigationProbe({ onNavigate }: { onNavigate: () => void }) {
  const headingNavigation = useHeadingNavigation();

  useEffect(() => {
    headingNavigation?.setHeadingNavigator(() => {
      onNavigate();
      return true;
    });
    return () => headingNavigation?.setHeadingNavigator(null);
  }, [headingNavigation, onNavigate]);

  return (
    <button
      type="button"
      onClick={() => headingNavigation?.navigateToHeading({ id: "heading", lineNumber: 1 })}
    >
      Navigate heading
    </button>
  );
}

describe("AppShell", () => {
  it("starts the left sidebar at the same vertical origin as the center chrome", () => {
    render(
      <AppShell left={<div>Left</div>} center={<div>Center</div>} right={<div>Right</div>} />,
    );

    const leftSidebar = screen.getByText("Left").closest("aside");
    const rightSidebar = screen.getByText("Right").closest("aside");

    expect(leftSidebar?.className).toContain("pt-0");
    expect(rightSidebar?.className).toContain("pt-0");
    expect(rightSidebar?.className).not.toContain("p-4");
  });

  it("can collapse the right metadata panel to a single reopen button without a sidebar rail", () => {
    render(
      <AppShell
        left={<div>Left</div>}
        center={<div>Center</div>}
        right={({ collapse }) => <button onClick={collapse}>Close metadata panel</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close metadata panel" }));

    expect(screen.queryByRole("button", { name: "Close metadata panel" })).toBeNull();
    const openButton = screen.getByRole("button", { name: "Open metadata panel" });
    expect(openButton).toBeTruthy();
    expect(openButton.className).toContain("right-4");
    expect(openButton.className).toContain("top-1.5");
    expect(screen.getAllByRole("complementary")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Open metadata panel" }));

    expect(screen.getByRole("button", { name: "Close metadata panel" })).toBeTruthy();
    expect(screen.getAllByRole("complementary")).toHaveLength(2);
  });

  it("shows a tooltip for the metadata panel reopen icon", async () => {
    render(
      <AppShell
        left={<div>Left</div>}
        center={<div>Center</div>}
        right={({ collapse }) => <button onClick={collapse}>Close metadata panel</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close metadata panel" }));
    fireEvent.pointerMove(screen.getByRole("button", { name: "Open metadata panel" }));

    expect(await screen.findByRole("tooltip", { name: "Open metadata panel" })).toBeTruthy();
  });

  it("shares heading navigation between center content and the metadata panel area", () => {
    const onNavigate = vi.fn();

    render(
      <AppShell
        left={<div>Left</div>}
        center={<HeadingNavigationProbe onNavigate={onNavigate} />}
        right={<div>Right</div>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Navigate heading" }));

    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
