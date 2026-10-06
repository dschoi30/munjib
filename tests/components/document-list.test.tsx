// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell, useTagSearch } from "@/components/app-shell";
import { WorkspaceModeProvider } from "@/components/workspace-mode";
import { DocumentList } from "@/components/document-list";
import { I18nProvider, useI18n } from "@/components/i18n-provider";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { workspaceUiStateStorageKey } from "@/lib/workspace-ui-state";
import type { ArchivedDocumentRetentionPolicyValue } from "@/lib/workspaces/retention-policy";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toastMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("sonner", () => ({
  toast: toastMock,
}));

vi.mock("next-auth/react", () => ({
  signOut: signOutMock,
}));

const folderFixtures = [
  {
    id: "folder-engineering",
    parentFolderId: null,
    name: "Engineering",
    path: "/engineering",
  },
  {
    id: "folder-runbooks",
    parentFolderId: "folder-engineering",
    name: "Runbooks",
    path: "/engineering/runbooks",
  },
];

const baseProps = {
  workspaceSlug: "company-handbook",
  workspaceName: "Company Handbook",
  currentUser: { name: "Noura", email: "noura@example.com" },
  readableWorkspaces: [
    { id: "workspace-current", name: "Company Handbook", slug: "company-handbook", role: "OWNER" as const },
    { id: "workspace-eng", name: "Engineering", slug: "engineering", role: "EDITOR" as const },
  ],
  defaultChatModel: "gemma4:e4b",
  defaultChatProvider: "openai-compatible" as const,
  availableChatProviders: {
    ollama: true,
    openai: true,
    "openai-compatible": true,
  },
  folders: folderFixtures,
  documents: [
    {
      id: "doc-1",
      folderId: null,
      title: "Welcome",
      path: "/welcome",
      contentText: "Welcome body",
      tagNames: ["welcome", "langchain"],
      canWrite: true,
    },
    {
      id: "doc-2",
      folderId: null,
      title: "Engineering Runbook",
      path: "/engineering-runbook",
      contentText: "Engineering body",
      tagNames: ["engineering"],
      canWrite: true,
    },
  ],
  canWrite: true,
  canManageWorkspace: true,
  createAction: async () => {},
  createFolderAction: async () => {},
  createWorkspaceAction: async () => ({ error: undefined }),
  renameWorkspaceAction: async () => ({ workspaceName: "Company Handbook" }),
  archiveWorkspaceAction: async () => ({ error: undefined }),
  importMarkdownAction: async () => ({
    documentIds: ["doc-imported"],
    imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
    failed: [],
  }),
  renameFolderAction: async (formData: FormData) => ({
    folderId: String(formData.get("folderId")),
  }),
  archiveFolderAction: async (formData: FormData) => ({
    folderId: String(formData.get("folderId")),
  }),
  archiveDocumentAction: async (formData: FormData) => ({
    documentId: String(formData.get("documentId")),
  }),
  archivedDocumentRetentionPolicy: "DAYS_30" as ArchivedDocumentRetentionPolicyValue,
  updateRetentionPolicyAction: async (formData: FormData) => ({
    archivedDocumentRetentionPolicy: String(
      formData.get("archivedDocumentRetentionPolicy"),
    ) as ArchivedDocumentRetentionPolicyValue,
  }),
  folderError: "",
  selectedFolderId: null,
  selectedDocumentId: "doc-1",
};

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  toastMock.mockReset();
  signOutMock.mockReset();
  signOutMock.mockResolvedValue({ url: "/login" });

  let store: Record<string, string> = {};

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => {
        store = {};
      },
      getItem: (key: string) => store[key] ?? null,
      removeItem: (key: string) => {
        delete store[key];
      },
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    },
  });

  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: vi.fn(), origin: "https://munjib.example" },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderList(props: Partial<Parameters<typeof DocumentList>[0]> = {}) {
  return renderWithI18n(
    <DocumentList {...baseProps} {...props} />,
  );
}

function renderWithI18n(ui: React.ReactElement) {
  const result = render(
    <I18nProvider>
      {ui}
    </I18nProvider>,
  );
  return {
    ...result,
    rerender: (nextUi: React.ReactElement) => result.rerender(
      <I18nProvider>
        {nextUi}
      </I18nProvider>,
    ),
  };
}

function CommitSnapshot({ onCommit }: { onCommit: () => void }) {
  React.useLayoutEffect(onCommit);
  return null;
}

function HydratedDocumentList({
  onFirstNavigationBodyCommit,
  props = {},
}: {
  onFirstNavigationBodyCommit: (html: string) => void;
  props?: Partial<Parameters<typeof DocumentList>[0]>;
}) {
  const { isHydrated } = useI18n();
  const capturedFirstCommitRef = React.useRef(false);

  if (!isHydrated) {
    return null;
  }

  return (
    <>
      <DocumentList {...baseProps} {...props} />
      <CommitSnapshot
        onCommit={() => {
          if (capturedFirstCommitRef.current) return;
          capturedFirstCommitRef.current = true;
          onFirstNavigationBodyCommit(
            document.querySelector('[data-testid="document-list-navigation-body"]')?.innerHTML ??
              "",
          );
        }}
      />
    </>
  );
}

function DocumentListWithFirstCommitSnapshot({
  onFirstCommit,
}: {
  onFirstCommit: (html: string) => void;
}) {
  const capturedFirstCommitRef = React.useRef(false);

  return (
    <>
      <DocumentList {...baseProps} />
      <CommitSnapshot
        onCommit={() => {
          if (capturedFirstCommitRef.current) return;
          capturedFirstCommitRef.current = true;
          onFirstCommit(document.body.innerHTML);
        }}
      />
    </>
  );
}

function TagSearchRequester({ tag }: { tag: string }) {
  const tagSearch = useTagSearch();

  return (
    <button type="button" onClick={() => tagSearch?.requestTagSearch(tag)}>
      Search tag
    </button>
  );
}

function languageOptionCard(name: RegExp) {
  const radio = screen.getByRole("radio", { name }) as HTMLInputElement;
  const card = document.querySelector(`label[for="${radio.id}"]`);
  if (!(card instanceof HTMLElement)) {
    throw new Error(`Could not find language option card for ${name}`);
  }
  return card;
}

function openWorkspaceSettingsFromAccountDrawer() {
  fireEvent.click(screen.getByRole("button", { name: /Account menu|계정 메뉴/ }));
  const drawer = screen.getByRole("menu", { name: /Account menu|계정 메뉴/ });
  fireEvent.click(
    within(drawer).getByRole("menuitem", { name: /Workspace settings|워크스페이스 설정/ }),
  );
}

function openImportSettingsFromAccountDrawer() {
  openWorkspaceSettingsFromAccountDrawer();
  fireEvent.click(screen.getByRole("button", { name: /Import|가져오기/ }));
}

function domRect({
  top = 0,
  left = 0,
  width = 0,
  height = 0,
  right = left + width,
  bottom = top + height,
}: Partial<DOMRect> = {}) {
  return {
    x: left,
    y: top,
    top,
    right,
    bottom,
    left,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

async function withActionMenuGeometry(
  innerHeight: number,
  callback: (
    setRect: (element: HTMLElement, rect: Partial<DOMRect>) => void,
  ) => void | Promise<void>,
) {
  const originalInnerHeightDescriptor = Object.getOwnPropertyDescriptor(window, "innerHeight");
  const originalGetBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
    window.HTMLElement.prototype,
    "getBoundingClientRect",
  );
  const rects = new WeakMap<HTMLElement, DOMRect>();

  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: innerHeight,
  });
  Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      return rects.get(this) ?? domRect();
    },
  });

  try {
    await callback((element, rect) => {
      rects.set(element, domRect(rect));
    });
  } finally {
    if (originalInnerHeightDescriptor) {
      Object.defineProperty(window, "innerHeight", originalInnerHeightDescriptor);
    } else {
      Reflect.deleteProperty(window, "innerHeight");
    }
    if (originalGetBoundingClientRectDescriptor) {
      Object.defineProperty(
        window.HTMLElement.prototype,
        "getBoundingClientRect",
        originalGetBoundingClientRectDescriptor,
      );
    } else {
      Reflect.deleteProperty(window.HTMLElement.prototype, "getBoundingClientRect");
    }
  }
}

describe("DocumentList", () => {
  it("shows a body skeleton until the stored Korean active sidebar panel hydrates", async () => {
    window.localStorage.setItem("munjib:language", "ko");
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ activeSidebarPanel: "favorites" }),
    );
    const firstNavigationBodyCommits: string[] = [];

    render(
      <I18nProvider>
        <HydratedDocumentList
          onFirstNavigationBodyCommit={(html) => firstNavigationBodyCommits.push(html)}
        />
      </I18nProvider>,
    );

    expect(firstNavigationBodyCommits).toHaveLength(1);
    expect(firstNavigationBodyCommits[0]).toContain("document-navigation-loading");
    expect(firstNavigationBodyCommits[0]).not.toContain("Recents");
    expect(firstNavigationBodyCommits[0]).not.toContain("All documents");
    expect(firstNavigationBodyCommits[0]).not.toContain("최근");
    expect(firstNavigationBodyCommits[0]).not.toContain("모든 문서");

    const navigationBody = screen.getByTestId("document-list-navigation-body");
    expect(await within(navigationBody).findByText("즐겨찾기")).toBeTruthy();
    expect(within(navigationBody).getByText("아직 즐겨찾기가 없습니다.")).toBeTruthy();
    expect(screen.queryByTestId("document-navigation-loading")).toBeNull();
  });

  it("renders only a text-free standalone shell before Korean language hydration", async () => {
    window.localStorage.setItem("munjib:language", "ko");
    const firstCommits: string[] = [];

    render(
      <I18nProvider>
        <DocumentListWithFirstCommitSnapshot onFirstCommit={(html) => firstCommits.push(html)} />
      </I18nProvider>,
    );

    expect(firstCommits).toHaveLength(1);
    expect(firstCommits[0]).toContain("left-sidebar-loading");
    expect(firstCommits[0]).not.toContain("Workspace menu");
    expect(firstCommits[0]).not.toContain("Close sidebar");
    expect(firstCommits[0]).not.toContain("New document");
    expect(firstCommits[0]).not.toContain("Recents");
    expect(firstCommits[0]).not.toContain("Documents");

    expect(await screen.findByRole("button", { name: "계정 메뉴" })).toBeTruthy();
    expect(screen.getByText("최근")).toBeTruthy();
  });

  it("shows the workspace title inline without a top settings menu", () => {
    renderList();

    expect(screen.queryByText("Workspace")).toBeNull();
    expect(screen.getByText("Company Handbook")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Workspace menu" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "Workspace menu" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close sidebar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New document" }).textContent).toBe("");
    expect(screen.getByRole("button", { name: "New folder" }).textContent).toBe("");
    expect(screen.queryByRole("combobox", { name: /template/i })).toBeNull();
  });

  it("uses the selected Korean display language for workspace sidebar chrome", async () => {
    window.localStorage.setItem("munjib:language", "ko");
    renderList();

    expect(await screen.findByText("Company Handbook")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "워크스페이스 메뉴" })).toBeNull();
    expect(screen.getByRole("button", { name: "사이드바 닫기" })).toBeTruthy();

    const toolbar = screen.getByTestId("document-create-toolbar");
    expect(within(toolbar).getByRole("button", { name: "문서" })).toHaveProperty(
      "ariaPressed",
      "true",
    );
    expect(within(toolbar).getByRole("button", { name: "그래프" })).toBeTruthy();
    expect(within(toolbar).getByRole("button", { name: "새 문서" })).toBeTruthy();
    expect(within(toolbar).getByRole("button", { name: "새 폴더" })).toBeTruthy();
    expect(within(toolbar).getByRole("button", { name: "검색" })).toBeTruthy();
    expect(within(toolbar).getByRole("button", { name: "즐겨찾기" })).toBeTruthy();

    expect(screen.getByText("최근")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "모든 문서" })).toBeTruthy();
    expect(screen.getByText("문서")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "계정 메뉴" }));
    const accountDrawer = screen.getByRole("menu", { name: "계정 메뉴" });
    expect(within(accountDrawer).getByText("noura@example.com로 로그인됨")).toBeTruthy();
    expect(
      within(accountDrawer).getByRole("menuitem", { name: "워크스페이스 설정" }),
    ).toBeTruthy();

    fireEvent.click(within(toolbar).getByRole("button", { name: "검색" }));
    expect(screen.getByLabelText("문서 검색")).toBeTruthy();
    expect(screen.getByPlaceholderText("문서 검색")).toBeTruthy();
    expect(screen.getByText("2개 결과")).toBeTruthy();

    fireEvent.click(within(toolbar).getByRole("button", { name: "즐겨찾기" }));
    expect(screen.getByText("즐겨찾기")).toBeTruthy();
    expect(screen.getByText("아직 즐겨찾기가 없습니다.")).toBeTruthy();

    fireEvent.click(within(toolbar).getByRole("button", { name: "문서" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Welcome 작업 열기" })[0]);
    expect(screen.getByRole("menuitem", { name: "즐겨찾기에 추가" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "새 탭에서 열기" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "휴지통으로 이동" })).toBeTruthy();
  });

  it("collapses and reopens the real document list inside AppShell", () => {
    renderWithI18n(
      <AppShell
        left={<DocumentList {...baseProps} />}
        center={<div>Center</div>}
        right={<div>Right</div>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close sidebar" }));

    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    const openSidebarButton = screen.getByRole("button", { name: "Open sidebar" });
    expect(openSidebarButton).toBeTruthy();

    fireEvent.click(openSidebarButton);

    expect(screen.getByRole("button", { name: "Account menu" })).toBeTruthy();
    expect(screen.getByText("Recents")).toBeTruthy();
  });

  it("spaces the toolbar groups apart and places graph second", () => {
    renderList();

    const toolbar = screen.getByTestId("document-create-toolbar");
    expect(toolbar.className).toContain("justify-between");

    const buttonNames = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim())
      .filter(Boolean);
    const documentsIndex = buttonNames.indexOf("Documents");

    expect(documentsIndex).toBeGreaterThan(-1);
    expect(buttonNames[documentsIndex + 1]).toBe("Graph");
  });

  it("keeps the workspace header and icon toolbar in sticky sidebar chrome", () => {
    renderList();

    const root = screen.getByTestId("document-list-root");
    expect(root.className).toContain("min-h-full");
    expect(root.className).toContain("flex");
    expect(root.className).toContain("flex-col");

    const stickyChrome = screen.getByTestId("document-list-sticky-chrome");
    expect(stickyChrome.className).toContain("sticky");
    expect(stickyChrome.className).toContain("top-0");
    expect(stickyChrome.className).toContain("z-20");
    expect(stickyChrome.className).toContain("bg-muted");
    expect(within(stickyChrome).getByText("Company Handbook")).toBeTruthy();
    expect(within(stickyChrome).queryByRole("button", { name: "Workspace menu" })).toBeNull();
    expect(within(stickyChrome).getByTestId("document-create-toolbar")).toBeTruthy();

    const navigationBody = screen.getByTestId("document-list-navigation-body");
    expect(navigationBody.className).toContain("pt-3");
    expect(within(navigationBody).getByText("Recents")).toBeTruthy();
    expect(within(navigationBody).getByRole("navigation", { name: "All documents" })).toBeTruthy();

    const accountDrawerFooter = screen.getByTestId("account-drawer-footer");
    expect(accountDrawerFooter.className).toContain("sticky");
    expect(accountDrawerFooter.className).toContain("bottom-0");
    expect(accountDrawerFooter.className).toContain("mt-auto");
  });

  it("opens the lower account drawer without repeating the current workspace", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    const drawer = screen.getByRole("menu", { name: "Account menu" });
    expect(within(drawer).getByText("Signed in as noura@example.com")).toBeTruthy();
    expect(within(drawer).getByText("Switch workspace")).toBeTruthy();
    expect(within(drawer).getByRole("menuitem", { name: "Engineering" })).toBeTruthy();
    expect(within(drawer).queryByText("Company Handbook")).toBeNull();
    expect(within(drawer).queryByText("Current workspace:")).toBeNull();
    expect(within(drawer).getByRole("menuitem", { name: "Add workspace" })).toBeTruthy();
    expect(within(drawer).getByRole("menuitem", { name: "Workspace settings" })).toBeTruthy();
    expect(within(drawer).getByRole("menuitem", { name: "Log out" })).toBeTruthy();
  });

  it("keeps workspace settings reachable for writers who cannot manage workspace identity", () => {
    renderList({
      canManageWorkspace: false,
      canWrite: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const drawer = screen.getByRole("menu", { name: "Account menu" });
    fireEvent.click(within(drawer).getByRole("menuitem", { name: "Workspace settings" }));

    expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save workspace name" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows a toast when adding a workspace fails", async () => {
    const createWorkspaceAction = vi.fn(async () => ({
      error: SERVICE_ERROR_CODES.WORKSPACE_CREATE_FORBIDDEN,
    }));
    renderList({ createWorkspaceAction });

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const drawer = screen.getByRole("menu", { name: "Account menu" });
    fireEvent.click(within(drawer).getByRole("menuitem", { name: "Add workspace" }));

    await waitFor(() => {
      expect(createWorkspaceAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    expect(toastMock).toHaveBeenCalledWith("Workspace settings could not be saved.");
  });

  it("keeps the lower account drawer bounded when many workspaces are readable", () => {
    renderList({
      readableWorkspaces: [
        baseProps.readableWorkspaces[0],
        ...Array.from({ length: 24 }, (_, index) => ({
          id: `workspace-${index}`,
          name: `Workspace ${index + 1}`,
          slug: `workspace-${index + 1}`,
          role: "EDITOR" as const,
        })),
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    const drawer = screen.getByRole("menu", { name: "Account menu" });
    expect(drawer.className).toContain("max-h-[min(28rem,calc(100vh-7rem))]");
    expect(drawer.className).toContain("overflow-hidden");
    const workspaceList = screen.getByTestId("account-workspace-switch-list");
    expect(workspaceList.className).toContain("overflow-y-auto");
    expect(within(drawer).getByRole("menuitem", { name: "Add workspace" })).toBeTruthy();
  });

  it("switches workspace and logs out from the lower account drawer", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    const drawer = screen.getByRole("menu", { name: "Account menu" });

    fireEvent.click(within(drawer).getByRole("menuitem", { name: "Engineering" }));
    expect(router.push).toHaveBeenCalledWith("/workspaces/engineering");

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));
    expect(signOutMock).toHaveBeenCalledWith({ redirect: false, callbackUrl: "/login" });
  });

  it("normalizes absolute sign-out redirects to the app-local login path", async () => {
    signOutMock.mockResolvedValue({ url: "http://localhost:3000/login" });

    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ redirect: false, callbackUrl: "/login" });
    });
    expect(window.location.assign).toHaveBeenCalledWith("/login");
  });

  it("opens the workspace settings panel with Workspace selected by default", () => {
    renderList();

    openWorkspaceSettingsFromAccountDrawer();

    const dialog = screen.getByRole("dialog", { name: "Workspace settings" });
    expect(dialog).toBeTruthy();
    expect(dialog.className).toContain("h-[80vh]");
    expect(dialog.className).toContain("max-h-[80vh]");
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Workspace" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByRole("heading", { name: "Import your contents" })).toBeTruthy();
    const fileInput = screen.getByLabelText("Markdown files");
    expect(fileInput.getAttribute("accept")).toBe(
      ".md,.markdown,text/markdown,text/x-markdown",
    );
    expect(fileInput).toHaveProperty("multiple", true);
    expect(fileInput.className).toContain("sr-only");
    expect(screen.getByRole("button", { name: /Import destination: \// }).textContent).toBe(
      "/",
    );
    expect(screen.getByRole("button", { name: "Import Markdown" })).toBeTruthy();
  });

  it("opens the AI settings tab and shows the server default model", () => {
    renderList({ defaultChatModel: "openrouter/fusion" });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    expect(screen.getByRole("button", { name: "AI" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("heading", { name: "AI model" })).toBeTruthy();
    expect(screen.getByText("Server default")).toBeTruthy();
    expect(screen.getAllByText("openrouter/fusion").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("AI provider")).toBeTruthy();
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
    expect(screen.queryByLabelText(/base url/i)).toBeNull();
  });

  it("opens the Retention settings tab with 30 days selected by default", () => {
    renderList();
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Retention" }));

    expect(screen.getByRole("button", { name: "Retention" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("heading", { name: "Document retention" })).toBeTruthy();
    expect(screen.getByLabelText("Deleted document retention")).toHaveProperty(
      "value",
      "DAYS_30",
    );
    expect(screen.getByRole("button", { name: "Save retention" })).toBeTruthy();
  });

  describe("Language settings", () => {
    it("opens the Language settings tab and highlights the current language", () => {
      window.localStorage.setItem("munjib:language", "en");
      renderList();
    openWorkspaceSettingsFromAccountDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Language" }));

      expect(screen.getByRole("heading", { name: "Language" })).toBeTruthy();
      expect(screen.getByText("Current language: English")).toBeTruthy();
      expect(screen.getByRole("radio", { name: /English/ })).toHaveProperty("checked", true);
      expect(within(languageOptionCard(/English/)).getByText("Current")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", true);
    });

    it("keeps the current language highlighted until Save", () => {
      window.localStorage.setItem("munjib:language", "en");
      renderList();
    openWorkspaceSettingsFromAccountDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Language" }));
      fireEvent.click(screen.getByRole("radio", { name: /Korean/ }));

      expect(screen.getByText("Korean will apply after you save.")).toBeTruthy();
      expect(screen.getByRole("radio", { name: /Korean/ })).toHaveProperty("checked", true);
      expect(within(languageOptionCard(/English/)).getByText("Current")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", false);

      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByRole("heading", { name: "언어" })).toBeTruthy();
      expect(screen.getByText("현재 언어: 한국어")).toBeTruthy();
      expect(window.localStorage.getItem("munjib:language")).toBe("ko");
    });

    it("discards a draft language on Cancel", () => {
      window.localStorage.setItem("munjib:language", "en");
      renderList();
    openWorkspaceSettingsFromAccountDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Language" }));
      fireEvent.click(screen.getByRole("radio", { name: /Korean/ }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.getByText("Current language: English")).toBeTruthy();
      expect(screen.queryByText("Korean will apply after you save.")).toBeNull();
      expect(window.localStorage.getItem("munjib:language")).toBe("en");
    });

    it("keeps the UI alive with a localized status when language storage fails", async () => {
      window.localStorage.setItem("munjib:language", "en");
      const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
      vi.spyOn(window.localStorage, "setItem").mockImplementation((key, value) => {
        if (key === "munjib:language") {
          throw new Error("storage unavailable");
        }
        originalSetItem(key, value);
      });
      renderList();
    openWorkspaceSettingsFromAccountDrawer();
      fireEvent.click(screen.getByRole("button", { name: "Language" }));
      fireEvent.click(screen.getByRole("radio", { name: /Korean/ }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByRole("heading", { name: "언어" })).toBeTruthy();
      expect(
        await screen.findByText(
          "이 탭의 언어는 변경되었지만 이 브라우저에 저장하지 못했습니다.",
        ),
      ).toBeTruthy();
      expect(window.localStorage.getItem("munjib:language")).toBe("en");
    });
  });

  it("saves the selected retention policy through the settings action", async () => {
    const updateRetentionPolicyAction = vi.fn(async (formData: FormData) => ({
      archivedDocumentRetentionPolicy: String(
        formData.get("archivedDocumentRetentionPolicy"),
      ) as ArchivedDocumentRetentionPolicyValue,
    }));
    renderList({ updateRetentionPolicyAction });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Retention" }));
    fireEvent.change(screen.getByLabelText("Deleted document retention"), {
      target: { value: "DAYS_90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save retention" }));

    await waitFor(() => {
      expect(updateRetentionPolicyAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submitted = (updateRetentionPolicyAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submitted.get("archivedDocumentRetentionPolicy")).toBe("DAYS_90");
    expect(screen.getByText("Saved retention: 90 days")).toBeTruthy();
  });

  it("localizes retention policy labels in Korean", async () => {
    window.localStorage.setItem("munjib:language", "ko");
    const updateRetentionPolicyAction = vi.fn(async (formData: FormData) => ({
      archivedDocumentRetentionPolicy: String(
        formData.get("archivedDocumentRetentionPolicy"),
      ) as ArchivedDocumentRetentionPolicyValue,
    }));
    renderList({ updateRetentionPolicyAction });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "보존" }));

    expect(screen.getByRole("option", { name: "없음" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "30일" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("삭제된 문서 보존 기간"), {
      target: { value: "DAYS_90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "보존 설정 저장" }));

    expect(await screen.findByText("저장된 보존 기간: 90일")).toBeTruthy();
  });

  it("rerenders saved retention status when the display language changes", async () => {
    window.localStorage.setItem("munjib:language", "en");
    const updateRetentionPolicyAction = vi.fn(async (formData: FormData) => ({
      archivedDocumentRetentionPolicy: String(
        formData.get("archivedDocumentRetentionPolicy"),
      ) as ArchivedDocumentRetentionPolicyValue,
    }));
    renderList({ updateRetentionPolicyAction });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Retention" }));
    fireEvent.change(screen.getByLabelText("Deleted document retention"), {
      target: { value: "DAYS_90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save retention" }));

    expect(await screen.findByText("Saved retention: 90 days")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    fireEvent.click(screen.getByRole("radio", { name: /Korean/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "보존" }));

    expect(screen.getByText("저장된 보존 기간: 90일")).toBeTruthy();
  });

  it("disables retention saving for read-only users", () => {
    renderList({ canWrite: false });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Retention" }));

    expect(screen.getByLabelText("Deleted document retention")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Save retention" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows a validation status when retention saving returns an error", async () => {
    renderList({
      updateRetentionPolicyAction: async () => ({
        error: "ARCHIVED_DOCUMENT_RETENTION_POLICY_INVALID",
      }),
    });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Retention" }));
    fireEvent.click(screen.getByRole("button", { name: "Save retention" }));

    expect(await screen.findByText("Choose a valid retention period.")).toBeTruthy();
  });

  it("shows presets for the selected AI provider while keeping custom input", () => {
    renderList({ defaultChatModel: "gemma4:e4b", defaultChatProvider: "ollama" });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    expect(screen.getByText("Presets")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use Gemma4 E4B" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use Kimi K2.7 Code" })).toBeNull();
    expect(screen.getByLabelText("Custom model id")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("AI provider"), {
      target: { value: "openai" },
    });

    expect(screen.getByRole("button", { name: "Use GPT-5.4 Mini" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use GPT-5.4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use GPT-4.1 Mini" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use Gemma4 E4B" })).toBeNull();
  });

  it("saves a preset chat model override in workspace-scoped storage", () => {
    renderList({ defaultChatModel: "openrouter/fusion" });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "Use Kimi K2.7 Code" }));

    expect(JSON.parse(window.localStorage.getItem("munjib:rag-chat-model:company-handbook") ?? "{}")).toEqual({
      chatProvider: "openai-compatible",
      chatModel: "moonshotai/kimi-k2.7-code",
    });
    expect(screen.getByText("Saved model: moonshotai/kimi-k2.7-code")).toBeTruthy();
  });

  it("saves a custom chat model override and can reset to the provider default", () => {
    renderList({ defaultChatModel: "openrouter/fusion" });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    fireEvent.change(screen.getByLabelText("Custom model id"), {
      target: { value: "qwen/qwen3.7-plus" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save custom model" }));

    expect(JSON.parse(window.localStorage.getItem("munjib:rag-chat-model:company-handbook") ?? "{}")).toEqual({
      chatProvider: "openai-compatible",
      chatModel: "qwen/qwen3.7-plus",
    });
    expect(JSON.parse(window.localStorage.getItem("munjib:rag-custom-chat-models:company-handbook") ?? "[]")).toEqual([
      {
        chatProvider: "openai-compatible",
        chatModel: "qwen/qwen3.7-plus",
      },
    ]);
    expect(screen.getByRole("button", { name: "Use custom qwen/qwen3.7-plus" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset model" }));

    expect(JSON.parse(window.localStorage.getItem("munjib:rag-chat-model:company-handbook") ?? "{}")).toEqual({
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });
    expect(screen.getByText("Reset model: google/gemma-4-31b-it:free")).toBeTruthy();
  });

  it("saves custom OpenRouter models after changing the AI provider", () => {
    renderList({ defaultChatModel: "gemma4:e4b", defaultChatProvider: "ollama" });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.change(screen.getByLabelText("AI provider"), {
      target: { value: "openai-compatible" },
    });
    fireEvent.change(screen.getByLabelText("Custom model id"), {
      target: { value: "google/gemma-4-31b-it:free" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save custom model" }));

    expect(JSON.parse(window.localStorage.getItem("munjib:rag-chat-model:company-handbook") ?? "{}")).toEqual({
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });
    expect(screen.getByRole("button", { name: "Use custom google/gemma-4-31b-it:free" })).toBeTruthy();
  });

  it("shows only custom models for the selected provider", () => {
    window.localStorage.setItem(
      "munjib:rag-custom-chat-models:company-handbook",
      JSON.stringify([
        { chatProvider: "openai-compatible", chatModel: "google/gemma-4-31b-it:free" },
        { chatProvider: "ollama", chatModel: "myuser/mymodel" },
      ]),
    );
    renderList({ defaultChatModel: "gemma4:e4b", defaultChatProvider: "ollama" });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    expect(screen.getByRole("button", { name: "Use custom myuser/mymodel" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Use custom google/gemma-4-31b-it:free" }),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("AI provider"), {
      target: { value: "openai-compatible" },
    });

    expect(screen.getByRole("button", { name: "Use custom google/gemma-4-31b-it:free" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use custom myuser/mymodel" })).toBeNull();
  });

  it("rejects invalid custom chat model ids in settings", () => {
    renderList({ defaultChatModel: "openrouter/fusion" });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.change(screen.getByLabelText("Custom model id"), {
      target: { value: "bad model" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save custom model" }));

    expect(window.localStorage.getItem("munjib:rag-chat-model:company-handbook")).toBeNull();
    expect(screen.getByText("Enter a valid model id.")).toBeTruthy();
  });

  it("explains provider-incompatible custom chat model ids in settings", () => {
    renderList({ defaultChatModel: "gemma4:e4b", defaultChatProvider: "ollama" });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.change(screen.getByLabelText("Custom model id"), {
      target: { value: "google/gemma-4-31b-it:free" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save custom model" }));

    expect(window.localStorage.getItem("munjib:rag-chat-model:company-handbook")).toBeNull();
    expect(
      screen.getByText("OpenRouter model ids require the server chat provider to be OpenAI-compatible."),
    ).toBeTruthy();
  });

  it("reports when a model override cannot be saved to browser storage", () => {
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    vi.spyOn(window.localStorage, "setItem").mockImplementation((key, value) => {
      if (key === "munjib:rag-chat-model:company-handbook") {
        throw new Error("storage unavailable");
      }
      originalSetItem(key, value);
    });

    renderList({ defaultChatModel: "openrouter/fusion" });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "Use Kimi K2.7 Code" }));

    expect(screen.getByText("Model setting could not be saved.")).toBeTruthy();
    expect(window.localStorage.getItem("munjib:rag-chat-model:company-handbook")).toBeNull();
  });

  it("reports when a model override cannot be reset in browser storage", () => {
    window.localStorage.setItem(
      "munjib:rag-chat-model:company-handbook",
      JSON.stringify({
        chatProvider: "openai-compatible",
        chatModel: "moonshotai/kimi-k2.7-code",
      }),
    );
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    vi.spyOn(window.localStorage, "setItem").mockImplementation((key, value) => {
      if (key === "munjib:rag-chat-model:company-handbook") {
        throw new Error("storage unavailable");
      }
      originalSetItem(key, value);
    });

    renderList({ defaultChatModel: "openrouter/fusion" });
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset model" }));

    expect(screen.getByText("Model setting could not be reset.")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("munjib:rag-chat-model:company-handbook") ?? "{}")).toEqual({
      chatProvider: "openai-compatible",
      chatModel: "moonshotai/kimi-k2.7-code",
    });
  });

  it("keeps the document list visible behind the workspace settings dialog", () => {
    renderList();
    openWorkspaceSettingsFromAccountDrawer();

    expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();
    expect(screen.getByText("Recents")).toBeTruthy();
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Welcome/ }).length).toBeGreaterThan(0);
  });

  it("closes the account drawer when switching sidebar views", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menu", { name: "Account menu" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.queryByRole("menu", { name: "Account menu" })).toBeNull();
    expect(screen.getByLabelText("Search documents")).toBeTruthy();
  });

  it("closes the account drawer on Escape", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menu", { name: "Account menu" })).toBeTruthy();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    const preventDefault = vi.spyOn(event, "preventDefault");
    const stopPropagation = vi.spyOn(event, "stopPropagation");

    fireEvent(window, event);

    expect(screen.queryByRole("menu", { name: "Account menu" })).toBeNull();
    expect(event.defaultPrevented).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it("closes only the account drawer on Escape while a replacement sidebar view is active", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByLabelText("Search documents")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menu", { name: "Account menu" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("menu", { name: "Account menu" })).toBeNull();
    expect(screen.getByLabelText("Search documents")).toBeTruthy();
    expect(screen.queryByText("Recents")).toBeNull();
  });

  it("closes the account drawer on outside click", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menu", { name: "Account menu" })).toBeTruthy();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("menu", { name: "Account menu" })).toBeNull();
  });

  it("closes the account drawer when an AppShell tag search request opens search", () => {
    renderWithI18n(
      <AppShell
        left={<DocumentList {...baseProps} />}
        center={<TagSearchRequester tag="LangChain" />}
        right={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menu", { name: "Account menu" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Search tag" }));

    expect(screen.queryByRole("menu", { name: "Account menu" })).toBeNull();
    expect((screen.getByLabelText("Search documents") as HTMLInputElement).value).toBe(
      "tag:#LangChain",
    );
  });

  it("reopens the left sidebar for AppShell tag search requests while collapsed", () => {
    renderWithI18n(
      <AppShell
        left={<DocumentList {...baseProps} />}
        center={<TagSearchRequester tag="LangChain" />}
        right={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close sidebar" }));

    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open sidebar" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Search tag" }));

    expect(screen.getByRole("button", { name: "Account menu" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open sidebar" })).toBeNull();
    expect((screen.getByLabelText("Search documents") as HTMLInputElement).value).toBe(
      "tag:#LangChain",
    );
    expect(screen.queryByText("Recents")).toBeNull();
  });

  it("orders folders before documents and sorts each group by title ascending", () => {
    renderList({
      folders: [
        { id: "folder-alpha", parentFolderId: null, name: "Alpha", path: "/alpha" },
        { id: "folder-zulu", parentFolderId: null, name: "Zulu", path: "/zulu" },
      ],
      documents: [
        {
          id: "doc-alpha",
          folderId: null,
          title: "Alpha Doc",
          path: "/alpha-doc",
          contentText: "",
          tagNames: [],
          canWrite: true,
        },
        {
          id: "doc-zulu",
          folderId: null,
          title: "Zulu Doc",
          path: "/zulu-doc",
          contentText: "",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    const rowNames = Array.from(
      allDocumentsNav.querySelectorAll("button[aria-expanded]:not([data-row-action-menu]), a[href]"),
    ).map((element) => element.querySelector("span")?.textContent?.trim());

    expect(rowNames).toEqual(["Alpha", "Zulu", "Alpha Doc", "Zulu Doc"]);
  });

  it("creates a root document from the toolbar without direct form redirect", async () => {
    const createAction = vi.fn(async () => ({ documentId: "doc-created" }));
    renderList({ createAction, selectedFolderId: "folder-engineering" });

    fireEvent.click(screen.getByRole("button", { name: "New document" }));

    await waitFor(() => {
      expect(createAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (createAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.get("folderId")).toBe("");
    expect(submittedFormData.get("redirect")).toBe("false");
    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-created");
  });

  it("creates a root folder from the toolbar without direct form redirect", async () => {
    const createFolderAction = vi.fn(async () => ({ folderId: "folder-created" }));
    renderList({ createFolderAction, selectedFolderId: "folder-engineering" });

    fireEvent.click(screen.getByRole("button", { name: "New folder" }));

    await waitFor(() => {
      expect(createFolderAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (createFolderAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.get("parentFolderId")).toBe("");
    expect(submittedFormData.get("redirect")).toBe("false");
    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?folder=folder-created");
  });

  it("guards repeated top-level toolbar creation while pending", async () => {
    let resolveCreateDocument: (result: { documentId: string }) => void = () => {};
    const createAction = vi.fn(
      () =>
        new Promise<{ documentId: string }>((resolve) => {
          resolveCreateDocument = resolve;
        }),
    );
    renderList({ createAction });

    const newDocumentButton = screen.getByRole("button", { name: "New document" });
    fireEvent.click(newDocumentButton);
    fireEvent.click(newDocumentButton);

    expect(createAction).toHaveBeenCalledTimes(1);
    expect(newDocumentButton).toHaveProperty("disabled", true);

    resolveCreateDocument({ documentId: "doc-created" });
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(
        "/workspaces/company-handbook?document=doc-created",
      );
    });
  });

  it("disables both top-level create buttons while document creation is pending", async () => {
    let resolveCreateDocument: (result: { documentId: string }) => void = () => {};
    const createAction = vi.fn(
      () =>
        new Promise<{ documentId: string }>((resolve) => {
          resolveCreateDocument = resolve;
        }),
    );
    const createFolderAction = vi.fn(async () => ({ folderId: "folder-created" }));
    renderList({ createAction, createFolderAction });

    const newDocumentButton = screen.getByRole("button", { name: "New document" });
    const newFolderButton = screen.getByRole("button", { name: "New folder" });

    fireEvent.click(newDocumentButton);

    expect(createAction).toHaveBeenCalledTimes(1);
    expect(newDocumentButton).toHaveProperty("disabled", true);
    expect(newFolderButton).toHaveProperty("disabled", true);

    fireEvent.click(newFolderButton);
    expect(createFolderAction).not.toHaveBeenCalled();

    resolveCreateDocument({ documentId: "doc-created" });
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(
        "/workspaces/company-handbook?document=doc-created",
      );
    });
  });

  it("shows feedback when top-level toolbar creation fails", async () => {
    const createFolderAction = vi.fn(async () => {
      throw new Error("create failed");
    });
    renderList({ createFolderAction });

    fireEvent.click(screen.getByRole("button", { name: "New folder" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        "Could not create the item. Try again.",
        expect.objectContaining({ id: "folder-create-error" }),
      );
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("scrolls a newly created toolbar document or folder row into view after refresh", async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const createAction = vi.fn(async () => ({ documentId: "doc-created" }));
      const createFolderAction = vi.fn(async () => ({ folderId: "folder-created" }));
      const view = renderWithI18n(
        <DocumentList
          {...baseProps}
          createAction={createAction}
          createFolderAction={createFolderAction}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "New document" }));
      await waitFor(() => {
        expect(router.push).toHaveBeenCalledWith(
          "/workspaces/company-handbook?document=doc-created",
        );
      });

      view.rerender(
        <DocumentList
          {...baseProps}
          createAction={createAction}
          createFolderAction={createFolderAction}
          selectedDocumentId="doc-created"
          documents={[
            ...baseProps.documents,
            {
              id: "doc-created",
              folderId: null,
              title: "Created Document",
              path: "/created-document",
              contentText: "",
              tagNames: [],
              canWrite: true,
            },
          ]}
        />,
      );

      await waitFor(() => {
        const createdDocumentRow = document.querySelector('[data-document-row-id="doc-created"]');
        expect(createdDocumentRow).toBeTruthy();
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
        expect(scrollIntoView.mock.contexts).toContain(createdDocumentRow);
      });
      scrollIntoView.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "New folder" }));
      await waitFor(() => {
        expect(router.push).toHaveBeenCalledWith(
          "/workspaces/company-handbook?folder=folder-created",
        );
      });

      view.rerender(
        <DocumentList
          {...baseProps}
          createAction={createAction}
          createFolderAction={createFolderAction}
          selectedDocumentId={null}
          selectedFolderId="folder-created"
          folders={[
            ...baseProps.folders,
            {
              id: "folder-created",
              parentFolderId: null,
              name: "Created Folder",
              path: "/created-folder",
            },
          ]}
        />,
      );

      await waitFor(() => {
        const createdFolderRow = document.querySelector('[data-folder-row-id="folder-created"]');
        expect(createdFolderRow).toBeTruthy();
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
        expect(scrollIntoView.mock.contexts).toContain(createdFolderRow);
      });
    } finally {
      if (originalScrollIntoViewDescriptor) {
        Object.defineProperty(
          window.HTMLElement.prototype,
          "scrollIntoView",
          originalScrollIntoViewDescriptor,
        );
      } else {
        Reflect.deleteProperty(window.HTMLElement.prototype, "scrollIntoView");
      }
    }
  });

  it("scrolls a newly created toolbar row after returning to the documents panel", async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const createAction = vi.fn(async () => ({ documentId: "doc-created" }));
      const view = renderWithI18n(
        <DocumentList
          {...baseProps}
          createAction={createAction}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
      expect(await screen.findByText("Favorites")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "New document" }));
      await waitFor(() => {
        expect(router.push).toHaveBeenCalledWith(
          "/workspaces/company-handbook?document=doc-created",
        );
      });

      view.rerender(
        <DocumentList
          {...baseProps}
          createAction={createAction}
          selectedDocumentId="doc-created"
          documents={[
            ...baseProps.documents,
            {
              id: "doc-created",
              folderId: null,
              title: "Created Document",
              path: "/created-document",
              contentText: "",
              tagNames: [],
              canWrite: true,
            },
          ]}
        />,
      );

      expect(document.querySelector('[data-document-row-id="doc-created"]')).toBeNull();
      expect(scrollIntoView).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Documents" }));

      await waitFor(() => {
        const createdDocumentRow = document.querySelector('[data-document-row-id="doc-created"]');
        expect(createdDocumentRow).toBeTruthy();
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
        expect(scrollIntoView.mock.contexts).toContain(createdDocumentRow);
      });
    } finally {
      if (originalScrollIntoViewDescriptor) {
        Object.defineProperty(
          window.HTMLElement.prototype,
          "scrollIntoView",
          originalScrollIntoViewDescriptor,
        );
      } else {
        Reflect.deleteProperty(window.HTMLElement.prototype, "scrollIntoView");
      }
    }
  });

  it("keeps recents populated when a recent document is favorited", async () => {
    window.localStorage.setItem(
      "munjib:favorites:company-handbook",
      JSON.stringify({ documents: ["doc-1"], folders: [] }),
    );

    renderList({ selectedDocumentId: "doc-2" });

    const recentsSection = screen.getByText("Recents").closest("section");
    expect(recentsSection).toBeTruthy();
    await waitFor(() => {
      expect(
        within(recentsSection as HTMLElement).getByRole("link", { name: /Welcome/ }),
      ).toBeTruthy();
    });
  });

  it("keeps the selected document out of visible recents while preserving it for later", async () => {
    const documents = Array.from({ length: 6 }, (_, index) => ({
      id: `doc-${index + 1}`,
      folderId: null,
      title: `Document ${index + 1}`,
      path: `/document-${index + 1}`,
      contentText: "",
      tagNames: [],
      canWrite: true,
    }));
    const { rerender } = renderList({ documents, selectedDocumentId: "doc-5" });

    let recentsSection = screen.getByText("Recents").closest("section");
    expect(recentsSection).toBeTruthy();
    await waitFor(() => {
      expect(
        within(recentsSection as HTMLElement)
          .getAllByRole("link")
          .map((link) => link.querySelector("span")?.textContent?.trim()),
      ).toEqual(["Document 1", "Document 2", "Document 3", "Document 4", "Document 6"]);
    });

    expect(window.localStorage.getItem("munjib:recents:company-handbook")).toBe(
      JSON.stringify(["doc-5"]),
    );

    rerender(
      <DocumentList {...baseProps} documents={documents} selectedDocumentId="doc-6" />,
    );

    recentsSection = screen.getByText("Recents").closest("section");
    expect(recentsSection).toBeTruthy();
    await waitFor(() => {
      expect(
        within(recentsSection as HTMLElement)
          .getAllByRole("link")
          .map((link) => link.querySelector("span")?.textContent?.trim()),
      ).toEqual(["Document 5", "Document 1", "Document 2", "Document 3", "Document 4"]);
    });

    expect(window.localStorage.getItem("munjib:recents:company-handbook")).toBe(
      JSON.stringify(["doc-6", "doc-5"]),
    );
  });

  it("filters stale stored recent ids before applying the recent limit", async () => {
    const documents = Array.from({ length: 6 }, (_, index) => ({
      id: `doc-${index + 1}`,
      folderId: null,
      title: `Document ${index + 1}`,
      path: `/document-${index + 1}`,
      contentText: "",
      tagNames: [],
      canWrite: true,
    }));
    window.localStorage.setItem(
      "munjib:recents:company-handbook",
      JSON.stringify(["stale-1", "stale-2", "stale-3", "stale-4", "doc-5"]),
    );

    renderList({ documents, selectedDocumentId: "doc-6" });

    const recentsSection = screen.getByText("Recents").closest("section");
    expect(recentsSection).toBeTruthy();
    await waitFor(() => {
      expect(
        within(recentsSection as HTMLElement)
          .getAllByRole("link")
          .map((link) => link.querySelector("span")?.textContent?.trim()),
      ).toEqual(["Document 5", "Document 1", "Document 2", "Document 3", "Document 4"]);
    });
  });

  it("shows duplicate document titles as title-only normal rows while action labels keep stored path context", () => {
    renderList({
      documents: [
        {
          id: "doc-root-runbook",
          folderId: null,
          title: "Runbook",
          path: "/runbook",
          contentText: "",
          tagNames: [],
          canWrite: true,
        },
        {
          id: "doc-folder-runbook",
          folderId: null,
          title: "Runbook",
          path: "/operations/runbook",
          contentText: "",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    expect(screen.getAllByText("Runbook")).toHaveLength(4);
    expect(screen.getAllByRole("link", { name: "Runbook" })).toHaveLength(2);
    expect(
      screen.getAllByRole("link", { name: "Runbook · /operations/runbook" }),
    ).toHaveLength(2);
    expect(screen.queryByText("/runbook")).toBeNull();
    expect(screen.queryByText("/operations/runbook")).toBeNull();
    expect(
      screen.getAllByRole("button", {
        name: "Open actions for Runbook · /operations/runbook",
      }).length,
    ).toBeGreaterThan(0);
  });

  it("uses title-only normal document tree and recent rows while action labels keep path context", () => {
    const folders = [
      { ...folderFixtures[0], displayPath: "Engineering" },
      { ...folderFixtures[1], displayPath: "Engineering / Runbooks" },
    ];
    const documents = [
      {
        id: "doc-selected",
        folderId: null,
        title: "Welcome",
        path: "/welcome",
        contentText: "Welcome body",
        tagNames: [],
        canWrite: true,
      },
      {
        id: "doc-runbook",
        folderId: "folder-runbooks",
        title: "Engineering Runbook",
        path: "/engineering/runbooks/engineering-runbook",
        displayPath: "Engineering / Runbooks / Engineering Runbook",
        contentText: "Release checklist",
        tagNames: ["engineering"],
        canWrite: true,
      },
      {
        id: "doc-operations",
        folderId: null,
        title: "Operations Runbook",
        path: "/operations/runbook",
        contentText: "Operations checklist",
        tagNames: [],
        canWrite: true,
      },
    ];
    renderList({ folders, documents, selectedDocumentId: "doc-selected" });

    const recentsSection = screen.getByText("Recents").closest("section");
    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    expect(recentsSection).toBeTruthy();

    for (const surface of [recentsSection as HTMLElement, allDocumentsNav]) {
      expect(
        within(surface).getByText("Engineering Runbook"),
      ).toBeTruthy();
      expect(
        within(surface).getByText("Operations Runbook"),
      ).toBeTruthy();
      expect(
        within(surface).getByRole("link", {
          name: "Engineering Runbook · Engineering / Runbooks / Engineering Runbook",
        }),
      ).toBeTruthy();
      expect(
        within(surface).getByRole("link", {
          name: "Operations Runbook · /operations/runbook",
        }),
      ).toBeTruthy();
      expect(
        within(surface).queryByText("Engineering / Runbooks / Engineering Runbook"),
      ).toBeNull();
      expect(within(surface).queryByText("/operations/runbook")).toBeNull();
      expect(
        within(surface).getByRole("button", {
          name: "Open actions for Engineering Runbook · Engineering / Runbooks / Engineering Runbook",
        }),
      ).toBeTruthy();
      expect(
        within(surface).getByRole("button", {
          name: "Open actions for Operations Runbook · /operations/runbook",
        }),
      ).toBeTruthy();
    }
  });

  it("keeps stored path context when title display paths collide", () => {
    const folders = [
      { ...folderFixtures[0], displayPath: "Engineering" },
      { ...folderFixtures[1], displayPath: "Engineering / Runbooks" },
    ];
    const documents = [
      {
        id: "doc-selected",
        folderId: null,
        title: "Welcome",
        path: "/welcome",
        contentText: "Welcome body",
        tagNames: [],
        canWrite: true,
      },
      {
        id: "doc-runbook",
        folderId: "folder-runbooks",
        title: "Runbook",
        path: "/engineering/runbooks/runbook",
        displayPath: "Engineering / Runbooks / Runbook",
        contentText: "Release checklist",
        tagNames: [],
        canWrite: true,
      },
      {
        id: "doc-runbook-duplicate",
        folderId: "folder-runbooks",
        title: "Runbook",
        path: "/engineering/runbooks/runbook-2",
        displayPath: "Engineering / Runbooks / Runbook",
        contentText: "Second checklist",
        tagNames: [],
        canWrite: true,
      },
    ];
    renderList({ folders, documents, selectedDocumentId: "doc-selected" });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    expect(within(allDocumentsNav).getAllByText("Runbook")).toHaveLength(2);
    expect(
      within(allDocumentsNav).getByRole("link", {
        name: "Runbook · Engineering / Runbooks / Runbook",
      }),
    ).toBeTruthy();
    expect(
      within(allDocumentsNav).getByRole("link", {
        name: "Runbook · Engineering / Runbooks / Runbook · /engineering/runbooks/runbook-2",
      }),
    ).toBeTruthy();
    expect(within(allDocumentsNav).queryByText("Engineering / Runbooks / Runbook")).toBeNull();
    expect(within(allDocumentsNav).queryByText("/engineering/runbooks/runbook")).toBeNull();
    expect(within(allDocumentsNav).queryByText("/engineering/runbooks/runbook-2")).toBeNull();
    expect(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Runbook · Engineering / Runbooks / Runbook · /engineering/runbooks/runbook-2",
      }),
    ).toBeTruthy();
  });

  it("keeps stored path context when slash-title display paths collide", () => {
    const folders = [
      { ...folderFixtures[0], name: "A", path: "/a", displayPath: "A" },
      { ...folderFixtures[1], name: "B", path: "/a/b", displayPath: "A / B" },
    ];
    const documents = [
      {
        id: "doc-selected",
        folderId: null,
        title: "Welcome",
        path: "/welcome",
        contentText: "Welcome body",
        tagNames: [],
        canWrite: true,
      },
      {
        id: "doc-slash-title",
        folderId: "folder-engineering",
        title: "B / C",
        path: "/a/b-c",
        displayPath: "A / B / C",
        displayPathNeedsStoredPath: true,
        contentText: "Slash title",
        tagNames: [],
        canWrite: true,
      },
      {
        id: "doc-nested",
        folderId: "folder-runbooks",
        title: "C",
        path: "/a/b/c",
        displayPath: "A / B / C",
        displayPathNeedsStoredPath: true,
        contentText: "Nested title",
        tagNames: [],
        canWrite: true,
      },
    ];
    renderList({ folders, documents, selectedDocumentId: "doc-selected" });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    expect(within(allDocumentsNav).getByText("B / C")).toBeTruthy();
    expect(within(allDocumentsNav).getByText("C")).toBeTruthy();
    expect(
      within(allDocumentsNav).getByRole("link", {
        name: "B / C · A / B / C · /a/b-c",
      }),
    ).toBeTruthy();
    expect(
      within(allDocumentsNav).getByRole("link", {
        name: "C · A / B / C · /a/b/c",
      }),
    ).toBeTruthy();
    expect(within(allDocumentsNav).queryByText("A / B / C")).toBeNull();
    expect(within(allDocumentsNav).queryByText("/a/b-c")).toBeNull();
    expect(within(allDocumentsNav).queryByText("/a/b/c")).toBeNull();
    expect(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for B / C · A / B / C · /a/b-c",
      }),
    ).toBeTruthy();
    expect(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for C · A / B / C · /a/b/c",
      }),
    ).toBeTruthy();
  });

  it("shows a visible fallback label for empty document titles", () => {
    renderList({
      documents: [
        {
          id: "doc-empty-title",
          folderId: null,
          title: "",
          path: "/untitled",
          contentText: "",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    expect(screen.getAllByRole("link", { name: /Untitled/ }).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", {
        name: "Open actions for Untitled",
      }).length,
    ).toBeGreaterThan(0);
  });

  it("uses the selected Korean display language for blank document title-only rows and search display paths", async () => {
    window.localStorage.setItem("munjib:language", "ko");
    renderList({
      folders: [
        { ...folderFixtures[0], displayPath: "Engineering" },
        { ...folderFixtures[1], displayPath: "Engineering / Runbooks" },
      ],
      documents: [
        {
          id: "doc-empty-title",
          folderId: "folder-runbooks",
          title: "",
          path: "/engineering/runbooks/untitled",
          displayPath: "Engineering / Runbooks",
          contentText: "",
          tagNames: [],
          canWrite: true,
        },
      ],
      selectedDocumentId: null,
    });

    expect((await screen.findAllByText("제목 없음")).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", {
        name: "제목 없음 · Engineering / Runbooks / 제목 없음",
      }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Engineering / Runbooks / 제목 없음")).toBeNull();
    expect(
      screen.getAllByRole("button", {
        name: "제목 없음 · Engineering / Runbooks / 제목 없음 작업 열기",
      }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Engineering / Runbooks / Untitled")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.change(screen.getByLabelText("문서 검색"), {
      target: { value: "제목 없음" },
    });

    expect(screen.getByText("1개 결과")).toBeTruthy();
    expect(screen.getByRole("link", { name: /제목 없음/ })).toBeTruthy();
    expect(screen.getByText("Engineering / Runbooks / 제목 없음")).toBeTruthy();
  });

  it("closes the workspace settings panel", () => {
    renderList();
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));

    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
    expect(screen.getByText("Recents")).toBeTruthy();
  });

  it("closes the workspace settings panel from the backdrop without closing on dialog clicks", () => {
    renderList();
    openWorkspaceSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("dialog", { name: "Workspace settings" }));

    expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("workspace-settings-backdrop"));

    expect(screen.queryByRole("dialog", { name: "Workspace settings" })).toBeNull();
    expect(screen.getByText("Recents")).toBeTruthy();
  });

  it("disables markdown import when the workspace is read-only", () => {
    renderList({ canWrite: false });
    openImportSettingsFromAccountDrawer();

    expect(screen.getByRole("button", { name: "Import Markdown" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByLabelText("Markdown files")).toHaveProperty("disabled", true);
  });

  it("opens a markdown import progress panel and imports files one at a time", async () => {
    const importMarkdownAction = vi
      .fn()
      .mockResolvedValueOnce({
        documentIds: ["doc-imported"],
        imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
        failed: [],
      })
      .mockResolvedValueOnce({
        documentIds: ["doc-second"],
        imported: [{ fileName: "second.markdown", documentId: "doc-second" }],
        failed: [],
    });
    renderList({ importMarkdownAction });
    openImportSettingsFromAccountDrawer();
    const importedFile = new File(["# Imported"], "imported.md", { type: "text/markdown" });
    const secondFile = new File(["# Second"], "second.markdown", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [importedFile, secondFile],
      },
    });

    expect(screen.queryByRole("table", { name: "Markdown import files" })).toBeNull();
    expect(screen.getByText("2 file(s) selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    expect(screen.getByRole("region", { name: "Markdown import progress" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Importing 1 / 2");
    expect(screen.getByRole("table", { name: "Markdown import files" })).toBeTruthy();
    expect(screen.getByText("imported.md").closest("tr")?.textContent).toContain("Importing");
    expect(screen.getByText("second.markdown").closest("tr")?.textContent).toContain("Queued");

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledTimes(2);
    });
    const firstFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[0][0];
    const secondFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[1][0];
    expect(firstFormData.getAll("markdownFiles")).toEqual([importedFile]);
    expect(secondFormData.getAll("markdownFiles")).toEqual([secondFile]);
    expect(firstFormData.get("folderId")).toBeNull();
    expect(secondFormData.get("folderId")).toBeNull();

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Imported 2 Markdown file(s).");
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Markdown import progress" })).toBeTruthy();
    expect(screen.getAllByText("Imported")).toHaveLength(2);
  });

  it("opens the destination picker and imports markdown files into the selected folder", async () => {
    const importMarkdownAction = vi.fn(async () => ({
      documentIds: ["doc-imported"],
      imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
      failed: [],
    }));
    renderList({ importMarkdownAction });
    openImportSettingsFromAccountDrawer();
    fireEvent.click(screen.getByRole("button", { name: /Import destination: \// }));

    expect(
      screen.getByRole("tree", { name: "Import destination folders" }),
    ).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: "/" })).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: "/engineering" })).toBeTruthy();

    fireEvent.click(screen.getByRole("treeitem", { name: "/engineering/runbooks" }));

    expect(screen.queryByRole("tree", { name: "Import destination folders" })).toBeNull();
    const selectedDestinationButton = screen.getByRole("button", {
      name: /Import destination: \/engineering\/runbooks/,
    });
    expect(selectedDestinationButton.textContent).toBe("/engineering/runbooks");

    const importedFile = new File(["# Imported"], "imported.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [importedFile],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.getAll("markdownFiles")).toEqual([importedFile]);
    expect(submittedFormData.get("folderId")).toBe("folder-runbooks");
    expect(
      await screen.findByRole("region", { name: "Markdown import progress" }),
    ).toBeTruthy();
    expect(await screen.findByText("Destination: /engineering/runbooks")).toBeTruthy();
  });

  it("omits folderId when importing markdown files to the default root destination", async () => {
    const importMarkdownAction = vi.fn(async () => ({
      documentIds: ["doc-imported"],
      imported: [{ fileName: "root.md", documentId: "doc-imported" }],
      failed: [],
    }));
    renderList({ importMarkdownAction });
    openImportSettingsFromAccountDrawer();
    expect(screen.getByRole("button", { name: /Import destination: \// }).textContent).toBe(
      "/",
    );

    const importedFile = new File(["# Root"], "root.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [importedFile],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.getAll("markdownFiles")).toEqual([importedFile]);
    expect(submittedFormData.get("folderId")).toBeNull();
    expect(
      await screen.findByRole("region", { name: "Markdown import progress" }),
    ).toBeTruthy();
    expect(await screen.findByText("Destination: /")).toBeTruthy();
  });

  it("continues importing queued markdown files after one file fails", async () => {
    const importMarkdownAction = vi
      .fn()
      .mockResolvedValueOnce({
        documentIds: ["doc-imported"],
        imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
        failed: [],
      })
      .mockResolvedValueOnce({
        documentIds: [],
        imported: [],
        failed: [{ fileName: "failed.md", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
      })
      .mockResolvedValueOnce({
        documentIds: ["doc-later"],
        imported: [{ fileName: "later.md", documentId: "doc-later" }],
        failed: [],
      });
    renderList({ importMarkdownAction });
    openImportSettingsFromAccountDrawer();
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [
          new File(["# Imported"], "imported.md", { type: "text/markdown" }),
          new File(["nope"], "failed.md", { type: "text/markdown" }),
          new File(["# Later"], "later.md", { type: "text/markdown" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledTimes(3);
    });
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "Imported 2 file(s). 1 file(s) failed.",
      );
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("imported.md").closest("tr")?.textContent).toContain("Imported");
    expect(screen.getByText("failed.md").closest("tr")?.textContent).toContain("Failed");
    expect(screen.getByText("later.md").closest("tr")?.textContent).toContain("Imported");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("continues importing queued markdown files after a request throws", async () => {
    const importMarkdownAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce({
        documentIds: ["doc-later"],
        imported: [{ fileName: "later.md", documentId: "doc-later" }],
        failed: [],
      });
    renderList({ importMarkdownAction });
    openImportSettingsFromAccountDrawer();
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [
          new File(["# Throws"], "throws.md", { type: "text/markdown" }),
          new File(["# Later"], "later.md", { type: "text/markdown" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "Imported 1 file(s). 1 file(s) failed.",
      );
    });
    expect(screen.getByText("throws.md").closest("tr")?.textContent).toContain("Failed");
    expect(screen.getByText("later.md").closest("tr")?.textContent).toContain("Imported");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps duplicate markdown filenames as independent progress rows", async () => {
    const importMarkdownAction = vi
      .fn()
      .mockResolvedValueOnce({
        documentIds: ["doc-one"],
        imported: [{ fileName: "duplicate.md", documentId: "doc-one" }],
        failed: [],
      })
      .mockResolvedValueOnce({
        documentIds: [],
        imported: [],
        failed: [{ fileName: "duplicate.md", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
      });
    renderList({ importMarkdownAction });
    openImportSettingsFromAccountDrawer();
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [
          new File(["# Imported"], "duplicate.md", { type: "text/markdown" }),
          new File(["nope"], "duplicate.md", { type: "text/markdown" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "Imported 1 file(s). 1 file(s) failed.",
      );
    });

    const duplicateRows = screen
      .getAllByText("duplicate.md")
      .map((fileNameCell) => fileNameCell.closest("tr")?.textContent ?? "");

    expect(duplicateRows).toHaveLength(2);
    expect(duplicateRows.filter((rowText) => rowText.includes("Imported"))).toHaveLength(1);
    expect(duplicateRows.filter((rowText) => rowText.includes("Failed"))).toHaveLength(1);
  });

  it("uses an icon-only x button to close the completed import progress panel", async () => {
    const importMarkdownAction = vi.fn(async () => ({
      documentIds: ["doc-imported"],
      imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
      failed: [],
    }));
    renderList({ importMarkdownAction });
    openImportSettingsFromAccountDrawer();
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [new File(["# Imported"], "imported.md", { type: "text/markdown" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Imported 1 Markdown file(s).");
    });

    const closeButton = screen.getByRole("button", { name: "Close import progress" });
    fireEvent.click(closeButton);

    expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Markdown import progress" })).toBeNull();
  });

  it("keeps settings open during active markdown import and allows close after completion", async () => {
    let resolveImport: (result: Awaited<ReturnType<typeof baseProps.importMarkdownAction>>) => void =
      () => {};
    const importPromise = new Promise<Awaited<ReturnType<typeof baseProps.importMarkdownAction>>>(
      (resolve) => {
        resolveImport = resolve;
      },
    );
    const importMarkdownAction = vi.fn(() => importPromise);
    renderList({ importMarkdownAction });
    openImportSettingsFromAccountDrawer();
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [new File(["# Slow"], "slow.md", { type: "text/markdown" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(importMarkdownAction).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("region", { name: "Markdown import progress" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close settings" })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.click(screen.getByTestId("workspace-settings-backdrop"));
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));

    expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Markdown import progress" })).toBeTruthy();

    await act(async () => {
      resolveImport({
        documentIds: ["doc-slow"],
        imported: [{ fileName: "slow.md", documentId: "doc-slow" }],
        failed: [],
      });
      await importPromise;
    });

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Imported 1 Markdown file(s).");
      expect(screen.getByRole("button", { name: "Close settings" })).toHaveProperty(
        "disabled",
        false,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));

    expect(screen.queryByRole("dialog", { name: "Workspace settings" })).toBeNull();
  });

  it("does not refresh the workspace when every markdown import row fails", async () => {
    const importMarkdownAction = vi.fn(async () => ({
      documentIds: [],
      imported: [],
      failed: [{ fileName: "failed.md", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
    }));
    renderList({ importMarkdownAction });
    openImportSettingsFromAccountDrawer();
    fireEvent.change(screen.getByLabelText("Markdown files"), {
      target: {
        files: [new File(["nope"], "failed.md", { type: "text/markdown" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Import failed for 1 file(s).");
    });
    expect(screen.getByText("failed.md").closest("tr")?.textContent).toContain("Failed");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("opens search from the toolbar and replaces the document list with matching results", () => {
    renderList();

    expect(screen.queryByLabelText("Search documents")).toBeNull();
    expect(screen.queryByPlaceholderText("Search title or body")).toBeNull();
    expect(screen.queryByText("Search results")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "Engineering body" },
    });

    expect(screen.getByText("1 result")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Engineering Runbook/ })).toBeTruthy();
    expect(screen.queryByText("Recents")).toBeNull();
    expect(screen.queryByText("Documents")).toBeNull();
    expect(screen.queryByRole("link", { name: "Welcome" })).toBeNull();
  });

  it("searches and displays title-based document paths", () => {
    const folders = [
      { ...folderFixtures[0], displayPath: "Engineering" },
      { ...folderFixtures[1], displayPath: "Engineering / Runbooks" },
    ];
    const documents = [
      {
        id: "doc-runbook",
        folderId: "folder-runbooks",
        title: "Engineering Runbook",
        path: "/engineering/runbooks/engineering-runbook",
        displayPath: "Engineering / Runbooks / Engineering Runbook",
        contentText: "Release checklist",
        tagNames: ["engineering"],
        canWrite: true,
      },
    ];
    renderList({ folders, documents, selectedDocumentId: null });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "Runbooks / Engineering" },
    });

    const searchResults = screen.getByRole("region", { name: "Search results" });
    expect(screen.getByText("1 result")).toBeTruthy();
    expect(within(searchResults).getByRole("link", { name: /Engineering Runbook/ })).toBeTruthy();
    expect(searchResults.textContent).toContain(
      "Engineering / Runbooks / Engineering Runbook",
    );
    expect(searchResults.textContent).not.toContain(
      "/engineering/runbooks/engineering-runbook",
    );
  });

  it("keeps stored paths remain searchable when display paths are present", () => {
    const folders = [
      { ...folderFixtures[0], displayPath: "Engineering" },
      { ...folderFixtures[1], displayPath: "Engineering / Runbooks" },
    ];
    const documents = [
      {
        id: "doc-runbook",
        folderId: "folder-runbooks",
        title: "Engineering Runbook",
        path: "/engineering/runbooks/engineering-runbook",
        displayPath: "Engineering / Runbooks / Engineering Runbook",
        contentText: "Release checklist",
        tagNames: ["engineering"],
        canWrite: true,
      },
    ];
    renderList({ folders, documents, selectedDocumentId: null });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "/engineering/runbooks/engineering-runbook" },
    });

    const searchResults = screen.getByRole("region", { name: "Search results" });
    expect(screen.getByText("1 result")).toBeTruthy();
    expect(within(searchResults).getByRole("link", { name: /Engineering Runbook/ })).toBeTruthy();
    expect(searchResults.textContent).toContain(
      "Engineering / Runbooks / Engineering Runbook",
    );
  });

  it("restores and persists the active sidebar panel", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ activeSidebarPanel: "favorites" }),
    );

    renderList();

    expect(await screen.findByText("Favorites")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByLabelText("Search documents")).toBeTruthy();

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).toMatchObject({ activeSidebarPanel: "search" });
    });
  });

  it("does not write the default active sidebar panel on passive graph mount", async () => {
    renderList({ isGraphView: true });

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).not.toHaveProperty("activeSidebarPanel");
    });
  });

  it("preserves a stored active sidebar panel on passive graph mount", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ activeSidebarPanel: "favorites" }),
    );

    renderList({ isGraphView: true });

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).toMatchObject({ activeSidebarPanel: "favorites" });
    });
  });

  it("persists an explicit document panel choice from graph view", async () => {
    renderList({ isGraphView: true });

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).not.toHaveProperty("activeSidebarPanel");
    });

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).toMatchObject({ activeSidebarPanel: "documents" });
    });
  });

  it("opens favorites from graph view when favorites was the stored panel", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ activeSidebarPanel: "favorites" }),
    );

    renderList({ isGraphView: true });

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));

    expect(await screen.findByText("Favorites")).toBeTruthy();
    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).toMatchObject({ activeSidebarPanel: "favorites" });
    });
  });

  it("opens sidebar search with a literal tag query from AppShell tag search requests", () => {
    renderWithI18n(
      <AppShell
        left={<DocumentList {...baseProps} />}
        center={<TagSearchRequester tag="LangChain" />}
        right={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search tag" }));

    expect((screen.getByLabelText("Search documents") as HTMLInputElement).value).toBe(
      "tag:#LangChain",
    );
  });

  it("lets tag search override a stored non-search panel and persists search", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ activeSidebarPanel: "favorites" }),
    );

    renderWithI18n(
      <AppShell
        workspaceSlug="company-handbook"
        left={<DocumentList {...baseProps} />}
        center={<TagSearchRequester tag="LangChain" />}
        right={<div>Right</div>}
      />,
    );

    expect(await screen.findByText("Favorites")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Search tag" }));

    expect((screen.getByLabelText("Search documents") as HTMLInputElement).value).toBe(
      "tag:#LangChain",
    );
    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).toMatchObject({ activeSidebarPanel: "search" });
    });
  });

  it("does not replay an old tag search request after later document navigation", () => {
    const { rerender } = renderWithI18n(
      <AppShell
        left={<DocumentList {...baseProps} selectedDocumentId="doc-1" />}
        center={<TagSearchRequester tag="LangChain" />}
        right={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search tag" }));
    expect((screen.getByLabelText("Search documents") as HTMLInputElement).value).toBe(
      "tag:#LangChain",
    );

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(screen.queryByLabelText("Search documents")).toBeNull();

    rerender(
      <AppShell
        left={<DocumentList {...baseProps} selectedDocumentId="doc-2" />}
        center={<TagSearchRequester tag="LangChain" />}
        right={<div />}
      />,
    );

    expect(screen.queryByLabelText("Search documents")).toBeNull();
    expect(screen.getByText("Recents")).toBeTruthy();
  });

  it("opens tag search from graph view without leaving graph mode", () => {
    renderWithI18n(
      <AppShell
        left={<DocumentList {...baseProps} isGraphView selectedDocumentId="doc-1" />}
        center={<TagSearchRequester tag="Design" />}
        right={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search tag" }));

    expect((screen.getByLabelText("Search documents") as HTMLInputElement).value).toBe(
      "tag:#Design",
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("filters search results with exact case-insensitive tag queries", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "tag:#LANGCHAIN" },
    });

    expect(screen.getByText("1 result")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Welcome/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Engineering Runbook/ })).toBeNull();
  });

  it("filters tag queries without a leading hash", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "tag:langchain" },
    });

    expect(screen.getByText("1 result")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Welcome/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Engineering Runbook/ })).toBeNull();
  });

  it("filters search results with Korean tag queries", () => {
    renderList({
      documents: [
        { ...baseProps.documents[0], tagNames: ["로드맵"] },
        { ...baseProps.documents[1], tagNames: ["engineering"] },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "tag:#로드맵" },
    });

    expect(screen.getByText("1 result")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Welcome/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Engineering Runbook/ })).toBeNull();
  });

  it("does not partially match tag queries", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "tag:#lang" },
    });

    expect(screen.getByText("0 results")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Welcome/ })).toBeNull();
  });

  it("opens search with Ctrl K", () => {
    renderList();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(screen.getByLabelText("Search documents")).toBeTruthy();
  });

  it("opens favorites as a replacement view instead of an always-visible section", () => {
    window.localStorage.setItem(
      "munjib:favorites:company-handbook",
      JSON.stringify({ documents: ["doc-2"], folders: [] }),
    );

    renderList();

    expect(screen.queryByText("Favorites")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));

    expect(screen.getByText("Favorites")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Engineering Runbook/ })).toBeTruthy();
    expect(screen.queryByText("Recents")).toBeNull();
    expect(screen.queryByText("Documents")).toBeNull();
  });

  it("uses display paths in favorite folder rows and document action labels", () => {
    const folders = [
      { ...folderFixtures[0], displayPath: "Engineering" },
      { ...folderFixtures[1], displayPath: "Engineering / Runbooks" },
    ];
    const documents = [
      {
        id: "doc-runbook",
        folderId: "folder-runbooks",
        title: "Engineering Runbook",
        path: "/engineering/runbooks/engineering-runbook",
        displayPath: "Engineering / Runbooks / Engineering Runbook",
        contentText: "Release checklist",
        tagNames: ["engineering"],
        canWrite: true,
      },
    ];
    window.localStorage.setItem(
      "munjib:favorites:company-handbook",
      JSON.stringify({ documents: ["doc-runbook"], folders: ["folder-runbooks"] }),
    );
    renderList({ folders, documents, selectedDocumentId: null });

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));

    const favoritesSection = screen.getByText("Favorites").closest("section");
    expect(favoritesSection).toBeTruthy();
    expect(favoritesSection?.textContent).toContain("Engineering / Runbooks");
    expect(favoritesSection?.textContent).toContain(
      "Engineering / Runbooks / Engineering Runbook",
    );
    expect(favoritesSection?.textContent).not.toContain("/engineering/runbooks");
    expect(
      screen.getByRole("button", {
        name: "Open actions for Engineering Runbook · Engineering / Runbooks / Engineering Runbook",
      }),
    ).toBeTruthy();
  });

  it("opens graph view from the toolbar with focus on the selected document", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    expect(router.push).toHaveBeenCalledWith(
      "/workspaces/company-handbook?document=doc-1&graph=1",
    );
  });

  it("marks the graph toolbar button active in graph view", () => {
    renderList({ isGraphView: true });

    expect(screen.getByRole("button", { name: "Graph" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("clears graph route when opening documents from graph view", () => {
    renderList({ isGraphView: true });

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-1");
    expect(screen.getByText("Recents")).toBeTruthy();
  });

  it("clears graph route and opens search from graph view", () => {
    renderList({ isGraphView: true });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-1");
    expect(screen.getByLabelText("Search documents")).toBeTruthy();
  });

  it("clears graph route and opens favorites from graph view", () => {
    window.localStorage.setItem(
      "munjib:favorites:company-handbook",
      JSON.stringify({ documents: ["doc-2"], folders: [] }),
    );

    renderList({ isGraphView: true });

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-1");
    expect(screen.getByText("Favorites")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Engineering Runbook/ })).toBeTruthy();
  });

  it("clears graph route to workspace root when no document is selected", () => {
    renderList({ isGraphView: true, selectedDocumentId: null });

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook");
  });

  it("returns to the document list from search and favorites with the Documents toolbar button", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByLabelText("Search documents")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(screen.getByText("Recents")).toBeTruthy();
    expect(screen.queryByLabelText("Search documents")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    expect(screen.getByText("Favorites")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.queryByText("Favorites")).toBeNull();
  });

  it("returns to the document list from search and favorites with Escape", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByLabelText("Search documents")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("Recents")).toBeTruthy();
    expect(screen.queryByLabelText("Search documents")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    expect(screen.getByText("Favorites")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.queryByText("Favorites")).toBeNull();
  });

  it("shows tooltips for sidebar toolbar icons on hover", async () => {
    renderList();

    fireEvent.pointerMove(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByRole("tooltip", { name: "Search" })).toBeTruthy();
  });

  it("uses original section label sizing and stronger selected row highlight", () => {
    renderList();

    const recentsLabel = screen.getByText("Recents");
    const documentsLabel = screen.getByText("Documents");
    expect(recentsLabel.className).toContain("text-[0.68rem]");
    expect(recentsLabel.className).toContain("uppercase");
    expect(recentsLabel.className).toContain("tracking-wide");
    expect(documentsLabel.className).toContain("text-[0.68rem]");
    expect(documentsLabel.className).toContain("uppercase");
    expect(documentsLabel.className).toContain("tracking-wide");

    const selectedRow = screen.getAllByRole("link", { name: /Welcome/ })[0].parentElement;
    expect(selectedRow?.className).toContain("bg-slate-200");
  });

  it("moves folder-scoped creation into the folder actions menu", () => {
    renderList();

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });

    expect(
      within(allDocumentsNav).queryByRole("button", { name: /New document in Engineering/ }),
    ).toBeNull();

    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );

    expect(screen.getByRole("menuitem", { name: "Add folder" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Add document" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Move to trash" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Add to favorites" })).toBeTruthy();
  });

  it("bottom-edge document action menu opens upward", async () => {
    await withActionMenuGeometry(600, (setRect) => {
      renderList();

      const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
      const actionButton = within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Welcome",
      });
      setRect(actionButton, { top: 568, bottom: 592, height: 24, width: 24 });

      fireEvent.click(actionButton);

      const menu = screen.getByRole("menu");
      expect(menu.className).toContain("bottom-8");
      expect(menu.className).not.toContain("top-8");
    });
  });

  it("document action menu with room below opens downward", async () => {
    await withActionMenuGeometry(600, (setRect) => {
      renderList();

      const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
      const actionButton = within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Welcome",
      });
      setRect(actionButton, { top: 64, bottom: 88, height: 24, width: 24 });

      fireEvent.click(actionButton);

      const menu = screen.getByRole("menu");
      expect(menu.className).toContain("top-8");
      expect(menu.className).not.toContain("bottom-8");
    });
  });

  it("uses the sidebar scroll boundary when choosing document action menu placement", async () => {
    await withActionMenuGeometry(800, (setRect) => {
      renderWithI18n(
        <div data-testid="scroll-boundary" style={{ overflowY: "auto" }}>
          <DocumentList {...baseProps} />
        </div>,
      );

      const scrollBoundary = screen.getByTestId("scroll-boundary");
      setRect(scrollBoundary, { top: 0, bottom: 320, height: 320, width: 280 });

      const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
      const actionButton = within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Welcome",
      });
      setRect(actionButton, { top: 276, bottom: 300, height: 24, width: 24 });

      fireEvent.click(actionButton);

      const menu = screen.getByRole("menu");
      expect(menu.className).toContain("bottom-8");
      expect(menu.className).not.toContain("top-8");
    });
  });

  it("bottom-edge folder action menu opens upward", async () => {
    await withActionMenuGeometry(600, (setRect) => {
      renderList();

      const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
      const actionButton = within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      });
      setRect(actionButton, { top: 568, bottom: 592, height: 24, width: 24 });

      fireEvent.click(actionButton);

      const menu = screen.getByRole("menu");
      expect(menu.className).toContain("bottom-8");
      expect(menu.className).not.toContain("top-8");
    });
  });

  it("adds a child folder from the folder actions menu without direct form redirect", async () => {
    const createFolderAction = vi.fn(async () => ({ folderId: "folder-created" }));
    renderList({ createFolderAction });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Add folder" }));

    await waitFor(() => {
      expect(createFolderAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (createFolderAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.get("parentFolderId")).toBe("folder-engineering");
    expect(submittedFormData.get("redirect")).toBe("false");
    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?folder=folder-created");
  });

  it("guards folder menu creation against repeated clicks while pending", async () => {
    let resolveCreateFolder: (result: { folderId: string }) => void = () => {};
    const createFolderAction = vi.fn(
      () =>
        new Promise<{ folderId: string }>((resolve) => {
          resolveCreateFolder = resolve;
        }),
    );
    renderList({ createFolderAction });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    const addFolderMenuItem = screen.getByRole("menuitem", { name: "Add folder" });

    fireEvent.click(addFolderMenuItem);
    fireEvent.click(addFolderMenuItem);

    expect(createFolderAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem", { name: "Add folder" })).toBeNull();

    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    expect(screen.getByRole("menuitem", { name: "Add folder" })).toHaveProperty(
      "disabled",
      true,
    );

    resolveCreateFolder({ folderId: "folder-created" });
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(
        "/workspaces/company-handbook?folder=folder-created",
      );
    });
  });

  it("adds a document from the folder actions menu without direct form redirect", async () => {
    const createAction = vi.fn(async () => ({ documentId: "doc-created" }));
    renderList({ createAction });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Add document" }));

    await waitFor(() => {
      expect(createAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (createAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.get("folderId")).toBe("folder-engineering");
    expect(submittedFormData.get("redirect")).toBe("false");
    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-created");
  });

  it("submits cascade when moving a non-empty folder subtree to trash", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const archiveFolderAction = vi.fn(async (formData: FormData) => ({
      folderId: String(formData.get("folderId")),
    }));
    renderList({
      archiveFolderAction,
      documents: [
        ...baseProps.documents,
        {
          id: "doc-runbook",
          folderId: "folder-runbooks",
          title: "Deploy Checklist",
          path: "/engineering/runbooks/deploy-checklist",
          contentText: "Deploy body",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to trash" }));

    await waitFor(() => {
      expect(archiveFolderAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (archiveFolderAction.mock.calls as unknown as FormData[][])[0][0];
    expect(confirmSpy).toHaveBeenCalledWith(
      "Move this folder to trash with 1 folder and 1 document?",
    );
    expect(submittedFormData.get("folderId")).toBe("folder-engineering");
    expect(submittedFormData.get("cascade")).toBe("true");
    expect(router.refresh).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("uses all-active folder document counts for cascade trash confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const archiveFolderAction = vi.fn(async (formData: FormData) => ({
      folderId: String(formData.get("folderId")),
    }));
    renderList({
      archiveFolderAction,
      folderDocumentCounts: { "folder-runbooks": 2 },
      documents: [
        ...baseProps.documents,
        {
          id: "doc-runbook",
          folderId: "folder-runbooks",
          title: "Deploy Checklist",
          path: "/engineering/runbooks/deploy-checklist",
          contentText: "Deploy body",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to trash" }));

    await waitFor(() => {
      expect(archiveFolderAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (archiveFolderAction.mock.calls as unknown as FormData[][])[0][0];
    expect(confirmSpy).toHaveBeenCalledWith(
      "Move this folder to trash with 1 folder and 2 documents?",
    );
    expect(submittedFormData.get("folderId")).toBe("folder-engineering");
    expect(submittedFormData.get("cascade")).toBe("true");

    confirmSpy.mockRestore();
  });

  it("navigates to the workspace root when cascade trash archives the selected document", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const archiveFolderAction = vi.fn(async (formData: FormData) => ({
      folderId: String(formData.get("folderId")),
    }));
    renderList({
      archiveFolderAction,
      selectedDocumentId: "doc-runbook",
      documents: [
        ...baseProps.documents,
        {
          id: "doc-runbook",
          folderId: "folder-runbooks",
          title: "Deploy Checklist",
          path: "/engineering/runbooks/deploy-checklist",
          contentText: "Deploy body",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to trash" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook");
    });
    expect(router.refresh).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("navigates to the workspace root when cascade trash archives the selected folder", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const archiveFolderAction = vi.fn(async (formData: FormData) => ({
      folderId: String(formData.get("folderId")),
    }));
    renderList({
      archiveFolderAction,
      selectedFolderId: "folder-runbooks",
      selectedDocumentId: null,
    });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to trash" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook");
    });
    expect(router.refresh).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("keeps empty folder trash as a non-cascade submit", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const archiveFolderAction = vi.fn(async (formData: FormData) => ({
      folderId: String(formData.get("folderId")),
    }));
    renderList({ archiveFolderAction });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Runbooks /engineering/runbooks",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to trash" }));

    await waitFor(() => {
      expect(archiveFolderAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (archiveFolderAction.mock.calls as unknown as FormData[][])[0][0];
    expect(confirmSpy).toHaveBeenCalledWith("Move this folder to trash?");
    expect(submittedFormData.get("folderId")).toBe("folder-runbooks");
    expect(submittedFormData.get("cascade")).toBeNull();

    confirmSpy.mockRestore();
  });

  it("cancels cascade folder trash when the confirmation is dismissed", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const archiveFolderAction = vi.fn(async (formData: FormData) => ({
      folderId: String(formData.get("folderId")),
    }));
    renderList({
      archiveFolderAction,
      documents: [
        ...baseProps.documents,
        {
          id: "doc-runbook",
          folderId: "folder-runbooks",
          title: "Deploy Checklist",
          path: "/engineering/runbooks/deploy-checklist",
          contentText: "Deploy body",
          tagNames: [],
          canWrite: true,
        },
      ],
    });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to trash" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Move this folder to trash with 1 folder and 1 document?",
    );
    expect(archiveFolderAction).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("shows feedback when folder menu creation fails", async () => {
    const createFolderAction = vi.fn(async () => {
      throw new Error("create failed");
    });
    renderList({ createFolderAction });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Add folder" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        "Could not create the item. Try again.",
        expect.objectContaining({ id: "folder-create-error" }),
      );
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows feedback when folder menu document creation fails", async () => {
    const createAction = vi.fn(async () => {
      throw new Error("create failed");
    });
    renderList({ createAction });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Add document" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        "Could not create the item. Try again.",
        expect.objectContaining({ id: "folder-create-error" }),
      );
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});


describe("read-only Trial navigation", () => {
  it("keeps graph and search result links in the Trial workspace", () => {
    renderWithI18n(<WorkspaceModeProvider mode="anonymous-trial-readonly"><DocumentList {...baseProps} canWrite={false} canManageWorkspace={false} documents={baseProps.documents.map(d => ({...d, canWrite:false}))} /></WorkspaceModeProvider>);
    fireEvent.click(screen.getByRole("button", {name:"Graph"}));
    expect(router.push).toHaveBeenCalledWith("/trial/workspaces/company-handbook?document=doc-1&graph=1");
    fireEvent.click(screen.getByRole("button", {name:"Search"}));
    fireEvent.change(screen.getByLabelText("Search documents"), {target:{value:"Welcome"}});
    expect(screen.getByRole("link", {name:/Welcome/}).getAttribute("href")).toContain("/trial/workspaces/company-handbook?");
  });
});

  it("stores Trial context-menu tabs separately from signed-in workspace tabs", () => {
    localStorage.clear();
    renderWithI18n(<WorkspaceModeProvider mode="anonymous-trial-readonly"><DocumentList {...baseProps} canWrite={false} canManageWorkspace={false} /></WorkspaceModeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Open actions for Welcome" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open in new tab" }));
    expect(localStorage.getItem("munjib:open-tabs:trial:company-handbook")).toContain("doc-1");
    expect(localStorage.getItem("munjib:open-tabs:company-handbook")).toBeNull();
  });

it("hides workspace model settings in read-only Trial", () => {
 renderWithI18n(<WorkspaceModeProvider mode="anonymous-trial-readonly"><DocumentList {...baseProps} canWrite={false} canManageWorkspace={false} /></WorkspaceModeProvider>);
 fireEvent.click(screen.getByRole("button", {name:"Account menu"}));
 expect(screen.queryByRole("menuitem", {name:"Workspace settings"})).toBeNull();
});

it("omits archive form entirely for a read-only document", () => {
  renderList({canWrite:false, documents:baseProps.documents.map(d=>({...d,canWrite:false}))});
  fireEvent.click(screen.getAllByRole("button", {name:"Open actions for Welcome"})[0]);
  expect(screen.queryByText("Move to trash")).toBeNull();
  expect(document.querySelector('input[name="documentId"]')).toBeNull();
});
