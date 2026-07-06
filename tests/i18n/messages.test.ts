import { describe, expect, it } from "vitest";
import { getMessage, messages } from "@/lib/i18n/messages";

describe("i18n message catalog", () => {
  it("has matching English and Korean keys", () => {
    expect(Object.keys(messages.ko).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it("returns localized strings by key", () => {
    expect(getMessage("en", "settings.title")).toBe("Settings");
    expect(getMessage("ko", "settings.title")).toBe("설정");
  });

  it("supports parameter interpolation", () => {
    expect(getMessage("en", "settings.language.pending", { language: "Korean" })).toBe(
      "Korean will apply after you save.",
    );
    expect(getMessage("ko", "settings.language.pending", { language: "영어" })).toBe(
      "저장하면 영어로 적용됩니다.",
    );
  });

  it("localizes account drawer and workspace management messages", () => {
    expect(getMessage("en", "account.menu")).toBe("Account menu");
    expect(getMessage("ko", "account.menu")).toBe("계정 메뉴");
    expect(getMessage("en", "account.signedInAs", { email: "noura@example.com" })).toBe(
      "Signed in as noura@example.com",
    );
    expect(getMessage("ko", "account.signedInAs", { email: "noura@example.com" })).toBe(
      "noura@example.com로 로그인됨",
    );
    expect(getMessage("en", "account.switchWorkspace")).toBe("Switch workspace");
    expect(getMessage("ko", "account.switchWorkspace")).toBe("워크스페이스 전환");
    expect(getMessage("en", "account.noOtherWorkspaces")).toBe(
      "No other workspaces available.",
    );
    expect(getMessage("ko", "account.noOtherWorkspaces")).toBe(
      "전환할 다른 워크스페이스가 없습니다.",
    );
    expect(getMessage("en", "account.addWorkspace")).toBe("Add workspace");
    expect(getMessage("ko", "account.addWorkspace")).toBe("워크스페이스 추가");
    expect(getMessage("en", "account.workspaceSettings")).toBe("Workspace settings");
    expect(getMessage("ko", "account.workspaceSettings")).toBe("워크스페이스 설정");
    expect(getMessage("en", "account.logOut")).toBe("Log out");
    expect(getMessage("ko", "account.logOut")).toBe("로그아웃");
    expect(getMessage("en", "settings.workspace.nav")).toBe("Workspace");
    expect(getMessage("ko", "settings.workspace.nav")).toBe("워크스페이스");
    expect(getMessage("en", "settings.workspace.title")).toBe("Workspace");
    expect(getMessage("ko", "settings.workspace.title")).toBe("워크스페이스");
    expect(getMessage("en", "settings.workspace.renameLabel")).toBe("Workspace name");
    expect(getMessage("ko", "settings.workspace.renameLabel")).toBe("워크스페이스 이름");
    expect(getMessage("en", "settings.workspace.renameSave")).toBe("Save workspace name");
    expect(getMessage("ko", "settings.workspace.renameSave")).toBe("워크스페이스 이름 저장");
    expect(getMessage("en", "settings.workspace.archiveTitle")).toBe("Archive workspace");
    expect(getMessage("ko", "settings.workspace.archiveTitle")).toBe("워크스페이스 보관");
    expect(getMessage("en", "settings.workspace.archiveAction")).toBe("Archive workspace");
    expect(getMessage("ko", "settings.workspace.archiveAction")).toBe("워크스페이스 보관");
    expect(getMessage("en", "settings.workspace.archiveLastWorkspace")).toBe(
      "You need another active workspace before archiving this one.",
    );
    expect(getMessage("ko", "settings.workspace.archiveLastWorkspace")).toBe(
      "이 워크스페이스를 보관하려면 먼저 다른 활성 워크스페이스가 필요합니다.",
    );
  });
});
