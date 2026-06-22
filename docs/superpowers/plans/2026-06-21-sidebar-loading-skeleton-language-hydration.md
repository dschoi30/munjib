# Sidebar Loading Skeleton And Language Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add refresh-time sidebar skeleton loading while preventing saved Korean users from seeing a brief English workspace chrome flash.

**Architecture:** Extend the i18n provider with a hydration signal, then gate localized shell/sidebar content on that signal. Add a reusable decorative skeleton primitive and use it in `AppShell` and `DocumentList` so shell-level loading stays shape-only while mounted sidebar chrome can show localized controls with body shimmer rows.

**Tech Stack:** Next.js App Router client components, React state/effects, Tailwind CSS classes, small global CSS keyframes, Vitest, React Testing Library, repo wiki sync tooling.

---

## File Map

- Modify `components/i18n-provider.tsx`
  - Adds `isHydrated` to the i18n context.
  - Keeps deterministic SSR language while allowing consumers to hide language-sensitive chrome before hydration.
- Modify `tests/components/i18n-provider.test.tsx`
  - Covers the first render sequence and final hydrated Korean state.
- Create `components/ui/skeleton.tsx`
  - Shared decorative skeleton block with class merging.
- Modify `app/globals.css`
  - Adds left-to-right shimmer keyframes and reduced-motion behavior.
- Create `tests/components/skeleton.test.tsx`
  - Covers the primitive's accessibility and class contract.
- Create `components/sidebar-loading-skeleton.tsx`
  - Workspace-specific loading shapes for left sidebar, right metadata panel, collapsed controls, and navigation body rows.
- Create `tests/components/sidebar-loading-skeleton.test.tsx`
  - Covers decorative behavior and expected shell/body shapes.
- Modify `components/app-shell.tsx`
  - Uses i18n hydration plus workspace UI hydration to decide when sidebar content and reopen controls can mount.
- Modify `tests/components/app-shell.test.tsx`
  - Covers skeleton fallback presence through the extracted loading components and preserves the closed-sidebar no-mount guard.
- Modify `components/document-list.tsx`
  - Shows shape-only loading before language hydration and localized chrome plus navigation body skeleton before active panel hydration.
- Create `tests/components/document-list-loading.test.tsx`
  - Verifies `DocumentNavigation` does not render the default `documents` panel before stored active-panel hydration.
- Modify wiki files after implementation:
  - `wiki/Document Editing Workflow.md`
  - `wiki/Munjib.md`
  - `wiki/Project PRD.md`
  - `wiki/index.md`
  - `wiki/log.md`
  - `wiki/manifest.json`

---

### Task 1: I18n Hydration Signal

**Files:**
- Modify: `components/i18n-provider.tsx`
- Modify: `tests/components/i18n-provider.test.tsx`

- [ ] **Step 1: Write the failing i18n hydration test**

Add this test to `tests/components/i18n-provider.test.tsx`:

```tsx
it("lets consumers hide language-sensitive chrome until language hydration completes", () => {
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, "ko");
  const renderStates: Array<{
    language: string;
    isHydrated: boolean;
    visibleText: string;
  }> = [];

  function HydrationProbe() {
    const { language, isHydrated, t } = useI18n();
    const visibleText = isHydrated ? t("settings.title") : "loading";
    renderStates.push({ language, isHydrated, visibleText });
    return <p>{visibleText}</p>;
  }

  render(
    <I18nProvider>
      <HydrationProbe />
    </I18nProvider>,
  );

  expect(renderStates[0]).toEqual({
    language: "en",
    isHydrated: false,
    visibleText: "loading",
  });
  expect(renderStates.some((state) => state.visibleText === "Settings")).toBe(false);
  expect(screen.getByText("설정")).toBeTruthy();
  expect(document.documentElement.lang).toBe("ko");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/components/i18n-provider.test.tsx -t "hide language-sensitive chrome"
```

Expected: fail at TypeScript/runtime level because `useI18n()` does not expose `isHydrated`.

- [ ] **Step 3: Implement the i18n hydration signal**

Update the context type and provider in `components/i18n-provider.tsx`:

```tsx
type I18nContextValue = {
  language: Language;
  isHydrated: boolean;
  setLanguage: (language: Language) => StoredLanguageWriteResult;
  t: (key: MessageKey, params?: TranslationParams) => string;
};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setLanguageState(getInitialBrowserLanguage());
    setIsHydrated(true);
    return subscribeToStoredLanguageChanges((change) => {
      setLanguageState(change.language);
      setIsHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    document.documentElement.lang = language;
  }, [isHydrated, language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      isHydrated,
      setLanguage: (nextLanguage) => {
        const result = writeStoredLanguage(nextLanguage);
        setLanguageState(nextLanguage);
        setIsHydrated(true);
        return result;
      },
      t: (key, params) => getMessage(language, key, params),
    }),
    [isHydrated, language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
```

- [ ] **Step 4: Run the i18n provider tests**

Run:

```bash
pnpm exec vitest run tests/components/i18n-provider.test.tsx
```

Expected: all `I18nProvider` tests pass, including the new render sequence test.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add components/i18n-provider.tsx tests/components/i18n-provider.test.tsx
git commit -m "fix: expose language hydration state"
```

---

### Task 2: Shared Skeleton Primitive

**Files:**
- Create: `components/ui/skeleton.tsx`
- Modify: `app/globals.css`
- Create: `tests/components/skeleton.test.tsx`

- [ ] **Step 1: Write the failing skeleton primitive test**

Create `tests/components/skeleton.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/components/skeleton.test.tsx
```

Expected: fail because `@/components/ui/skeleton` does not exist.

- [ ] **Step 3: Implement the primitive**

Create `components/ui/skeleton.tsx`:

```tsx
import type { HTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={twMerge("munjib-skeleton rounded-md", className)}
    />
  );
}
```

Append the shimmer CSS to `app/globals.css`:

```css
.munjib-skeleton {
  position: relative;
  overflow: hidden;
  background: #e5e9ef;
}

.munjib-skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.72),
    transparent
  );
  animation: munjib-skeleton-shimmer 1.35s ease-in-out infinite;
}

@keyframes munjib-skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .munjib-skeleton::after {
    animation: none;
    transform: none;
    background: transparent;
  }
}
```

- [ ] **Step 4: Run the skeleton primitive test**

Run:

```bash
pnpm exec vitest run tests/components/skeleton.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add app/globals.css components/ui/skeleton.tsx tests/components/skeleton.test.tsx
git commit -m "feat: add shimmer skeleton primitive"
```

---

### Task 3: Sidebar Loading Shapes

**Files:**
- Create: `components/sidebar-loading-skeleton.tsx`
- Create: `tests/components/sidebar-loading-skeleton.test.tsx`

- [ ] **Step 1: Write the failing sidebar skeleton shape tests**

Create `tests/components/sidebar-loading-skeleton.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  CollapsedPanelLoadingSkeleton,
  DocumentNavigationBodySkeleton,
  WorkspaceSidebarLoadingSkeleton,
} from "@/components/sidebar-loading-skeleton";

afterEach(() => {
  cleanup();
});

describe("sidebar loading skeletons", () => {
  it("renders left sidebar loading rows as decorative shapes", () => {
    render(<WorkspaceSidebarLoadingSkeleton side="left" />);

    const loading = screen.getByTestId("left-sidebar-loading");
    expect(loading.getAttribute("aria-hidden")).toBe("true");
    expect(within(loading).getAllByTestId("skeleton-row")).toHaveLength(9);
    expect(loading.textContent).toBe("");
  });

  it("renders right metadata loading rows as decorative shapes", () => {
    render(<WorkspaceSidebarLoadingSkeleton side="right" />);

    const loading = screen.getByTestId("right-sidebar-loading");
    expect(loading.getAttribute("aria-hidden")).toBe("true");
    expect(within(loading).getAllByTestId("skeleton-row")).toHaveLength(5);
    expect(loading.textContent).toBe("");
  });

  it("renders a collapsed panel loading shape without text", () => {
    render(<CollapsedPanelLoadingSkeleton side="left" />);

    const loading = screen.getByTestId("left-collapsed-panel-loading");
    expect(loading.getAttribute("aria-hidden")).toBe("true");
    expect(loading.textContent).toBe("");
  });

  it("renders a navigation body skeleton for mounted localized chrome", () => {
    render(<DocumentNavigationBodySkeleton />);

    const loading = screen.getByTestId("document-navigation-loading");
    expect(loading.getAttribute("aria-hidden")).toBe("true");
    expect(within(loading).getAllByTestId("skeleton-row").length).toBeGreaterThan(6);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/components/sidebar-loading-skeleton.test.tsx
```

Expected: fail because `@/components/sidebar-loading-skeleton` does not exist.

- [ ] **Step 3: Implement the loading shape components**

Create `components/sidebar-loading-skeleton.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

type SidebarSide = "left" | "right";

const leftRowWidths = ["w-28", "w-20", "w-24", "w-32", "w-24", "w-36", "w-28", "w-32", "w-24"];
const rightRowWidths = ["w-20", "w-32", "w-28", "w-36", "w-24"];
const bodyRowWidths = ["w-20", "w-32", "w-28", "w-36", "w-24", "w-32", "w-28", "w-36"];

export function WorkspaceSidebarLoadingSkeleton({ side }: { side: SidebarSide }) {
  if (side === "right") {
    return (
      <div
        aria-hidden="true"
        data-testid="right-sidebar-loading"
        className="space-y-4 pt-2"
      >
        <div className="flex h-11 items-center gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-8" />
          ))}
          <Skeleton className="ml-auto h-8 w-8" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-16 rounded-full" />
          {rightRowWidths.map((width, index) => (
            <SkeletonRow key={index} width={width} dot />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      data-testid="left-sidebar-loading"
      className="space-y-4 pt-2"
    >
      <div className="flex h-11 items-center gap-2">
        <Skeleton className="h-3 w-36 rounded-full" />
        <Skeleton className="ml-auto h-8 w-8" />
      </div>
      <div className="flex h-11 items-center justify-between">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-8" />
        ))}
      </div>
      <div className="space-y-2">
        {leftRowWidths.map((width, index) => (
          <SkeletonRow key={index} width={width} square={index > 2} />
        ))}
      </div>
    </div>
  );
}

export function DocumentNavigationBodySkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="document-navigation-loading"
      className="space-y-4"
    >
      <section className="space-y-2">
        <Skeleton className="h-3 w-16 rounded-full" />
        {bodyRowWidths.slice(0, 3).map((width, index) => (
          <SkeletonRow key={index} width={width} square />
        ))}
      </section>
      <section className="space-y-2">
        <Skeleton className="h-3 w-20 rounded-full" />
        {bodyRowWidths.map((width, index) => (
          <SkeletonRow key={index} width={width} square />
        ))}
      </section>
    </div>
  );
}

export function CollapsedPanelLoadingSkeleton({ side }: { side: SidebarSide }) {
  return (
    <div
      aria-hidden="true"
      data-testid={`${side}-collapsed-panel-loading`}
      className={side === "left" ? "absolute left-4 top-1.5 z-30" : "absolute right-4 top-1.5"}
    >
      <Skeleton className="h-8 w-8 shadow-sm" />
    </div>
  );
}

function SkeletonRow({
  width,
  dot = false,
  square = false,
}: {
  width: string;
  dot?: boolean;
  square?: boolean;
}) {
  return (
    <div data-testid="skeleton-row" className="flex items-center gap-2">
      {dot ? <Skeleton className="h-2.5 w-2.5 rounded-full" /> : null}
      {square ? <Skeleton className="h-4 w-4" /> : null}
      <Skeleton className={`h-2.5 rounded-full ${width}`} />
    </div>
  );
}
```

- [ ] **Step 4: Run the sidebar skeleton tests**

Run:

```bash
pnpm exec vitest run tests/components/sidebar-loading-skeleton.test.tsx tests/components/skeleton.test.tsx
```

Expected: both files pass.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add components/sidebar-loading-skeleton.tsx tests/components/sidebar-loading-skeleton.test.tsx
git commit -m "feat: add sidebar loading skeletons"
```

---

### Task 4: AppShell Hydration Gate

**Files:**
- Modify: `components/app-shell.tsx`
- Modify: `tests/components/app-shell.test.tsx`

- [ ] **Step 1: Add the failing AppShell render-count test**

Add this import to `tests/components/app-shell.test.tsx`:

```tsx
import { APP_LANGUAGE_STORAGE_KEY } from "@/lib/i18n/storage";
```

Add this probe near the existing `MountProbe`:

```tsx
function RenderProbe({ onRender }: { onRender: () => void }) {
  onRender();
  return <div>Rendered panel content</div>;
}
```

Add this test near the existing closed-content test:

```tsx
it("does not render sidebar children through the pre-hydration language fallback", () => {
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, "ko");
  const onRender = vi.fn();

  renderWithI18n(
    <AppShell
      workspaceSlug="company-handbook"
      left={<RenderProbe onRender={onRender} />}
      center={<div>Center</div>}
      right={<div>Right</div>}
    />,
  );

  expect(screen.getByText("Rendered panel content")).toBeTruthy();
  expect(onRender).toHaveBeenCalledTimes(1);
});
```

The existing no-regression test in this file remains:

```tsx
expect(onMount).not.toHaveBeenCalled();
```

for the stored-closed sidebar path.

- [ ] **Step 2: Run the AppShell tests before editing**

Run:

```bash
pnpm exec vitest run tests/components/app-shell.test.tsx
```

Expected: the new test fails because the current `AppShell` renders sidebar children during the first English fallback render and then rerenders them after i18n/workspace hydration.

- [ ] **Step 3: Gate AppShell content on shell and language hydration**

Modify the imports in `components/app-shell.tsx`:

```tsx
import {
  CollapsedPanelLoadingSkeleton,
  WorkspaceSidebarLoadingSkeleton,
} from "@/components/sidebar-loading-skeleton";
```

Update the i18n usage and render booleans:

```tsx
const { t, isHydrated: languageHydrated } = useI18n();
const shellStorageHydrated = !workspaceSlug || shellStorageHydratedWorkspace === workspaceSlug;
const canRenderSidebarContent = shellStorageHydrated && languageHydrated;
const canRenderLocalizedPanelControls = shellStorageHydrated && languageHydrated;
```

Replace the left aside body with:

```tsx
<aside
  aria-busy={!canRenderSidebarContent}
  className="overflow-auto border-r border-border bg-muted px-4 pb-4 pt-0"
>
  {canRenderSidebarContent ? left : <WorkspaceSidebarLoadingSkeleton side="left" />}
</aside>
```

Replace the left collapsed branch with:

```tsx
canRenderLocalizedPanelControls ? (
  <TooltipProvider delayDuration={0}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          aria-label={t("app.openSidebar")}
          onClick={() => setLeftPanelOpen(true)}
          className="absolute left-4 top-1.5 z-30 h-8 w-8 bg-muted p-0 text-slate-600 shadow-sm hover:bg-slate-200 hover:text-ink"
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t("app.openSidebar")}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
) : (
  <CollapsedPanelLoadingSkeleton side="left" />
)
```

Apply the same pattern to the right aside and right collapsed branch, using
`WorkspaceSidebarLoadingSkeleton side="right"` and
`CollapsedPanelLoadingSkeleton side="right"`.

- [ ] **Step 4: Run AppShell and skeleton tests**

Run:

```bash
pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/sidebar-loading-skeleton.test.tsx
```

Expected: pass. Existing AppShell tests still find localized reopen controls after hydration, and closed-sidebar children remain unmounted.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add components/app-shell.tsx tests/components/app-shell.test.tsx
git commit -m "fix: gate sidebar chrome during hydration"
```

---

### Task 5: DocumentList Body Skeleton

**Files:**
- Modify: `components/document-list.tsx`
- Create: `tests/components/document-list-loading.test.tsx`

- [ ] **Step 1: Add the failing DocumentList active-panel hydration test**

Create `tests/components/document-list-loading.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import type { ArchivedDocumentRetentionPolicyValue } from "@/lib/workspaces/retention-policy";
import { workspaceUiStateStorageKey } from "@/lib/workspace-ui-state";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const navigationRenderSpy = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

vi.mock("@/components/document-navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/document-navigation")>();
  return {
    ...actual,
    DocumentNavigation: ({ activePanel }: { activePanel: string }) => {
      navigationRenderSpy(activePanel);
      return <div data-testid="document-navigation-rendered">{activePanel}</div>;
    },
  };
});

const { DocumentList } = await import("@/components/document-list");

const baseProps = {
  workspaceSlug: "company-handbook",
  defaultChatModel: "gemma4:e4b",
  defaultChatProvider: "openai-compatible" as const,
  folders: [],
  documents: [
    {
      id: "doc-1",
      folderId: null,
      title: "Welcome",
      path: "/welcome",
      contentText: "Welcome body",
      tagNames: [],
      canWrite: true,
    },
  ],
  canWrite: true,
  createAction: async () => {},
  createFolderAction: async () => {},
  importMarkdownAction: async () => ({
    documentIds: [],
    imported: [],
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
  navigationRenderSpy.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("DocumentList loading gates", () => {
  it("does not render the default documents panel before stored active panel hydration", () => {
    window.localStorage.setItem("munjib:language", "ko");
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ activeSidebarPanel: "favorites" }),
    );

    render(
      <I18nProvider>
        <DocumentList {...baseProps} />
      </I18nProvider>,
    );

    expect(screen.getByTestId("document-navigation-rendered").textContent).toBe("favorites");
    expect(navigationRenderSpy).toHaveBeenCalledWith("favorites");
    expect(navigationRenderSpy).not.toHaveBeenCalledWith("documents");
  });
});
```

- [ ] **Step 2: Run the focused DocumentList loading test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/components/document-list-loading.test.tsx
```

Expected: fail because the current `DocumentList` renders `DocumentNavigation` once with default `documents` before stored `favorites` panel hydration.

- [ ] **Step 3: Render language-safe and panel-safe loading states**

Modify imports in `components/document-list.tsx`:

```tsx
import {
  DocumentNavigationBodySkeleton,
  WorkspaceSidebarLoadingSkeleton,
} from "@/components/sidebar-loading-skeleton";
```

Use the hydration signal:

```tsx
const { t, isHydrated: languageHydrated } = useI18n();
```

Add this derived value after state declarations:

```tsx
const activePanelHydrated = activePanelHydratedWorkspace === workspaceSlug;
```

After hooks and callbacks are declared, before the main JSX return, add:

```tsx
if (!languageHydrated) {
  return <WorkspaceSidebarLoadingSkeleton side="left" />;
}
```

Replace the navigation body render with:

```tsx
<div data-testid="document-list-navigation-body" className="pt-3">
  {activePanelHydrated ? (
    <DocumentNavigation
      workspaceSlug={workspaceSlug}
      folders={folders}
      documents={documents}
      folderDocumentCounts={folderDocumentCounts}
      activePanel={activePanel}
      isWorkspaceMenuOpen={workspaceMenuOpen}
      searchQuery={searchQuery}
      onOpenSearch={openSearch}
      onOpenDocuments={openDocuments}
      onSearchQueryChange={setSearchQuery}
      selectedFolderId={selectedFolderId}
      canWrite={canWrite}
      createAction={createAction}
      createFolderAction={createFolderAction}
      renameFolderAction={renameFolderAction}
      archiveFolderAction={archiveFolderAction}
      archiveDocumentAction={archiveDocumentAction}
      folderError={folderError}
      selectedDocumentId={selectedDocumentId}
    />
  ) : (
    <DocumentNavigationBodySkeleton />
  )}
</div>
```

- [ ] **Step 4: Run DocumentList, AppShell, and skeleton tests**

Run:

```bash
pnpm exec vitest run tests/components/document-list-loading.test.tsx tests/components/document-list.test.tsx tests/components/app-shell.test.tsx tests/components/sidebar-loading-skeleton.test.tsx
```

Expected: pass. Korean sidebar chrome still appears after hydration, stored active panel behavior remains intact, `DocumentNavigation` no longer renders the default `documents` panel before storage hydration, and skeleton shape tests pass.

- [ ] **Step 5: Commit Task 5**

Run:

```bash
git add components/document-list.tsx tests/components/document-list-loading.test.tsx
git commit -m "fix: show sidebar body skeleton while hydrating"
```

---

### Task 6: Verification, Wiki Sync, And PR-Ready Commit

**Files:**
- Modify if implementation details changed durable knowledge:
  - `wiki/Document Editing Workflow.md`
  - `wiki/Munjib.md`
  - `wiki/Project PRD.md`
  - `wiki/index.md`
  - `wiki/log.md`
  - `wiki/manifest.json`

- [ ] **Step 1: Run focused component coverage**

Run:

```bash
pnpm exec vitest run tests/components/i18n-provider.test.tsx tests/components/skeleton.test.tsx tests/components/sidebar-loading-skeleton.test.tsx tests/components/app-shell.test.tsx tests/components/document-list-loading.test.tsx tests/components/document-list.test.tsx
```

Expected: all listed tests pass.

- [ ] **Step 2: Run type checking**

Run:

```bash
pnpm exec tsc --noEmit --pretty false
```

Expected: exit code `0` with no TypeScript errors.

- [ ] **Step 3: Run full test suite if focused coverage passes**

Run:

```bash
pnpm test
```

Expected: full suite passes. If the known wiki lint warning appears only during wiki commands, keep it separate from test failures.

- [ ] **Step 4: Review durable knowledge and update wiki if implementation differs from the design**

Run:

```bash
pnpm wiki:find "sidebar skeleton loading language hydration"
```

Expected: returns the Issue #129 design/wiki notes or misses narrowly. If implementation changed the design contract, update the smallest affected pages from this list:

```text
wiki/Document Editing Workflow.md
wiki/Munjib.md
wiki/Project PRD.md
wiki/index.md
wiki/log.md
```

- [ ] **Step 5: Run commit-time wiki sync**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected:

- `wiki:install-hooks` succeeds.
- `wiki:sync-plan --staged` lists source changes and existing wiki maintenance, or clearly shows no wiki maintenance is needed for a pure implementation-only change.
- `wiki:manifest` writes `wiki/manifest.json` if source counts changed.
- `wiki:lint` exits `0`. The existing warning for `wiki/designs/sidebar.md` unresolved pasted image can remain if it is unchanged.
- `wiki:sync-check --staged` exits `0`.

- [ ] **Step 6: Run whitespace check**

Run:

```bash
git diff --check
git diff --cached --check
```

Expected: both commands exit `0`.

- [ ] **Step 7: Commit final wiki or cleanup updates when status is not clean**

Run:

```bash
git status --short
git add app/globals.css components/i18n-provider.tsx components/ui/skeleton.tsx components/sidebar-loading-skeleton.tsx components/app-shell.tsx components/document-list.tsx tests/components/i18n-provider.test.tsx tests/components/skeleton.test.tsx tests/components/sidebar-loading-skeleton.test.tsx tests/components/app-shell.test.tsx tests/components/document-list-loading.test.tsx tests/components/document-list.test.tsx wiki/Document\ Editing\ Workflow.md wiki/Munjib.md wiki/Project\ PRD.md wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "fix: add sidebar skeleton loading"
```

Expected: if `git status --short` listed files, commit succeeds. If `git status --short` was empty because earlier task commits already captured all implementation and wiki updates, no final commit is needed.

---

## Manual Browser Smoke

After Task 6, run the app and verify the visual behavior:

```bash
pnpm run dev
```

Open a workspace page, set display language to Korean in Settings, refresh the page, and confirm:

- left and right sidebars do not appear as empty columns
- no English workspace/sidebar/metadata labels flash before Korean labels
- shimmer bars move left to right while loading
- reduced-motion users see static loading shapes
- stored closed sidebar state still produces only the reopen control after hydration

Stop the dev server after the smoke check if it is no longer needed.
