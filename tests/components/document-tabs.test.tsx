// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DocumentTabs } from "@/components/document-tabs";
import { I18nProvider } from "@/components/i18n-provider";

afterEach(() => {
  cleanup();
});

function renderTabs() {
  return render(
    <I18nProvider>
      <DocumentTabs
        tabs={[
          { id: "tab-1", documentId: "doc-1", title: "Welcome", path: "/welcome" },
          { id: "tab-2", documentId: "doc-2", title: "Runbook", path: "/runbook" },
        ]}
        activeTabId="tab-1"
        onSelect={() => {}}
        onClose={() => {}}
        onAdd={() => {}}
      />
    </I18nProvider>,
  );
}

describe("DocumentTabs", () => {
  it("renders the active tab on the page surface without primary-muted chrome", () => {
    renderTabs();

    const activeTab = screen.getByRole("button", { name: "Welcome" });
    const activeTabItem = activeTab.closest("li");

    expect(activeTab.getAttribute("aria-current")).toBe("page");
    expect(activeTabItem?.className).toContain("bg-surface-page");
    expect(activeTabItem?.className).toContain("text-ink");
    expect(activeTabItem?.className).not.toContain("bg-primary-muted");
    expect(activeTabItem?.className).not.toContain("text-primary");
  });
});
