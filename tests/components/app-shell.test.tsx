// @vitest-environment jsdom
import React, { useEffect, useLayoutEffect, useRef } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell, useHeadingNavigation, useLeftPanel } from "@/components/app-shell";
import { I18nProvider } from "@/components/i18n-provider";
import { APP_LANGUAGE_STORAGE_KEY } from "@/lib/i18n/storage";
import { workspaceUiStateStorageKey } from "@/lib/workspace-ui-state";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
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

function LeftPanelProbe() {
  const leftPanel = useLeftPanel();
  return (
    <button type="button" onClick={() => leftPanel?.collapse()}>
      Close sidebar
    </button>
  );
}

function MountProbe({ onMount }: { onMount: () => void }) {
  useEffect(() => {
    onMount();
  }, [onMount]);

  return <div>Mounted panel content</div>;
}

function FirstCommitProbe({ onCommit }: { onCommit: () => void }) {
  const hasCommitted = useRef(false);

  useLayoutEffect(() => {
    if (hasCommitted.current) {
      return;
    }

    hasCommitted.current = true;
    onCommit();
  }, [onCommit]);

  return null;
}

function renderWithI18n(ui: React.ReactElement) {
  return render(
    <I18nProvider>
      {ui}
    </I18nProvider>,
  );
}

describe("AppShell", () => {
  it("shows skeleton chrome before language hydration and Korean reopen controls after stored closed state hydrates", async () => {
    let firstCommitHtml = "";
    let firstCommitText = "";
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, "ko");
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({
        leftSidebarOpen: false,
        rightSidebarOpen: false,
      }),
    );

    renderWithI18n(
      <AppShell
        workspaceSlug="company-handbook"
        left={<div>Left</div>}
        center={
          <>
            <FirstCommitProbe
              onCommit={() => {
                firstCommitHtml = document.body.innerHTML;
                firstCommitText = document.body.textContent ?? "";
              }}
            />
            <div>Center</div>
          </>
        }
        right={<div>Right</div>}
      />,
    );

    expect(firstCommitHtml).toContain('data-testid="left-sidebar-loading"');
    expect(firstCommitHtml).toContain('data-testid="right-sidebar-loading"');
    expect(firstCommitText).not.toContain("Open sidebar");
    expect(firstCommitText).not.toContain("Open metadata panel");

    expect(await screen.findByRole("button", { name: "사이드바 열기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "메타데이터 패널 열기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open sidebar" })).toBeNull();
  });

  it("renders skeleton content in open sidebars while workspace UI state hydration is pending", () => {
    let firstCommitHtml = "";

    renderWithI18n(
      <AppShell
        workspaceSlug="company-handbook"
        left={<div>Left</div>}
        center={
          <>
            <FirstCommitProbe
              onCommit={() => {
                firstCommitHtml = document.body.innerHTML;
              }}
            />
            <div>Center</div>
          </>
        }
        right={<div>Right</div>}
      />,
    );

    expect(firstCommitHtml).toContain('data-testid="left-sidebar-loading"');
    expect(firstCommitHtml).toContain('data-testid="right-sidebar-loading"');
    expect(firstCommitHtml).not.toContain(">Left<");
    expect(firstCommitHtml).not.toContain(">Right<");
  });

  it("restores and persists workspace sidebar open state", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({
        leftSidebarOpen: false,
        rightSidebarOpen: false,
        activeSidebarPanel: "favorites",
      }),
    );

    renderWithI18n(
      <AppShell
        workspaceSlug="company-handbook"
        left={<div>Left</div>}
        center={<div>Center</div>}
        right={({ collapse }) => <button onClick={collapse}>Close metadata panel</button>}
      />,
    );

    expect(await screen.findByRole("button", { name: "Open sidebar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open metadata panel" })).toBeTruthy();
    expect(screen.queryByText("Left")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close metadata panel" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    fireEvent.click(screen.getByRole("button", { name: "Open metadata panel" }));

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).toMatchObject({
        leftSidebarOpen: true,
        rightSidebarOpen: true,
        activeSidebarPanel: "favorites",
      });
    });
  });

  it("does not mount closed workspace sidebar contents before storage hydration", async () => {
    const onMount = vi.fn();
    let wasMountedOnFirstCommit = true;
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ leftSidebarOpen: false }),
    );

    renderWithI18n(
      <AppShell
        workspaceSlug="company-handbook"
        left={<MountProbe onMount={onMount} />}
        center={
          <>
            <FirstCommitProbe
              onCommit={() => {
                wasMountedOnFirstCommit = onMount.mock.calls.length > 0;
              }}
            />
            <div>Center</div>
          </>
        }
        right={<div>Right</div>}
      />,
    );

    expect(wasMountedOnFirstCommit).toBe(false);
    expect(await screen.findByRole("button", { name: "Open sidebar" })).toBeTruthy();
    expect(screen.queryByText("Mounted panel content")).toBeNull();
    expect(onMount).not.toHaveBeenCalled();
  });

  it("starts the left sidebar at the same vertical origin as the center chrome", () => {
    renderWithI18n(
      <AppShell left={<div>Left</div>} center={<div>Center</div>} right={<div>Right</div>} />,
    );

    const leftSidebar = screen.getByText("Left").closest("aside");
    const rightSidebar = screen.getByText("Right").closest("aside");

    expect(leftSidebar?.className).toContain("pt-0");
    expect(rightSidebar?.className).toContain("pt-0");
    expect(rightSidebar?.className).not.toContain("p-4");
  });

  it("can collapse the right metadata panel to a single reopen button without a sidebar rail", () => {
    renderWithI18n(
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
    renderWithI18n(
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

    renderWithI18n(
      <AppShell
        left={<div>Left</div>}
        center={<HeadingNavigationProbe onNavigate={onNavigate} />}
        right={<div>Right</div>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Navigate heading" }));

    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("can collapse and reopen the left sidebar", () => {
    renderWithI18n(
      <AppShell
        left={<LeftPanelProbe />}
        center={<div>Center</div>}
        right={<div>Right</div>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close sidebar" }));

    expect(screen.queryByRole("button", { name: "Close sidebar" })).toBeNull();
    const openButton = screen.getByRole("button", { name: "Open sidebar" });
    expect(openButton).toBeTruthy();
    expect(openButton.className).toContain("left-4");
    expect(openButton.className).toContain("top-1.5");
    expect(screen.getAllByRole("complementary")).toHaveLength(1);

    fireEvent.click(openButton);

    expect(screen.getByRole("button", { name: "Close sidebar" })).toBeTruthy();
    expect(screen.getAllByRole("complementary")).toHaveLength(2);
  });
});
