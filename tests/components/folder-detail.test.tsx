// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FolderDetail } from "@/components/folder-detail";
import { I18nProvider } from "@/components/i18n-provider";

afterEach(() => {
  window.localStorage.clear();
  cleanup();
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe("FolderDetail", () => {
  it("shows the folder display path instead of the stored slug path", () => {
    renderWithI18n(
      <FolderDetail
        folder={{
          id: "folder-runbooks",
          name: "Runbooks",
          path: "/engineering/runbooks",
          displayPath: "Engineering / Runbooks",
          childCount: 0,
        }}
        canWrite
      />,
    );

    expect(screen.getByText("Engineering / Runbooks")).toBeTruthy();
    expect(screen.queryByText("/engineering/runbooks")).toBeNull();
  });

  it("uses the selected Korean display language for folder states", async () => {
    window.localStorage.setItem("munjib:language", "ko");

    const { rerender } = renderWithI18n(<FolderDetail folder={null} canWrite={false} />);

    expect(await screen.findByText("문서나 폴더를 선택하세요.")).toBeTruthy();

    rerender(
      <I18nProvider>
        <FolderDetail
          folder={{ id: "folder-1", name: "Operations", path: "/Operations", childCount: 2 }}
          canWrite={false}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("폴더")).toBeTruthy();
    expect(screen.getByText("이 폴더에 2개 항목이 있습니다.")).toBeTruthy();
    expect(screen.getByText("읽기 전용 권한입니다.")).toBeTruthy();

    rerender(
      <I18nProvider>
        <FolderDetail
          folder={{ id: "folder-1", name: "Operations", path: "/Operations", childCount: 0 }}
          canWrite
        />
      </I18nProvider>,
    );

    expect(screen.getByText("이 폴더는 비어 있습니다.")).toBeTruthy();
  });
});
