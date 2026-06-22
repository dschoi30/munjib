# Sidebar Loading Skeleton And Language Hydration Design

## Context

Issue #129 addresses a refresh-time workspace chrome gap. After Issue #122,
`AppShell` keeps the left workspace sidebar and right metadata sidebar columns in
the layout while workspace UI state hydrates from `localStorage`, but it avoids
mounting sidebar children until hydration finishes. This protects child
components from overwriting their own stored browser state during the initial
client commit, but it can leave the sidebars visually empty during refresh.

Issue #126 added English/Korean product display language switching with a
browser-global `localStorage` preference at `munjib:language`. The current
`I18nProvider` starts from deterministic English and then reads the saved or
browser-inferred language after mount. That first slice accepted a brief English
fallback, but this sidebar loading work should not expose English workspace
chrome to a user who has already selected Korean.

The user-selected visual direction is the calmer "partial UI" variant: once the
language is known, stable sidebar chrome can appear immediately while
data-dependent rows render as shimmer skeleton bars.

## Decisions From Brainstorming

- Use the partial-UI skeleton direction rather than replacing the whole sidebar
  with anonymous bars after language hydration.
- Do not show user-facing English text before the display language has
  hydrated. Before language hydration, show only decorative shape skeletons.
- Keep Issue #122's storage-hydration safety: closed sidebar contents must not
  mount before workspace UI state is hydrated.
- Add a small reusable skeleton primitive instead of repeating shimmer CSS in
  each component.
- Use left-to-right shimmer animation for normal motion settings and a static
  placeholder for `prefers-reduced-motion: reduce`.

## Goals

- Replace refresh-time empty left and right sidebars with skeleton placeholders.
- Prevent English sidebar or metadata chrome from flashing before a saved Korean
  display-language preference is applied.
- Preserve existing workspace-scoped sidebar open/closed state behavior.
- Preserve existing active sidebar panel, recents, favorites, and metadata panel
  ownership boundaries.
- Keep skeletons decorative and non-interactive.
- Add focused tests for language hydration, shell hydration, and sidebar body
  loading behavior.

## Non-Goals

- Do not move product language settings to the database.
- Do not add cookies or server-side language negotiation in this slice.
- Do not change the URL or server APIs for sidebar state.
- Do not change document, folder, metadata, attachment, version, or audit data
  loading semantics.
- Do not add skeletons to every center editor surface unless a later design asks
  for it.
- Do not persist pending loading state in browser storage.

## UX Contract

There are two independent client-side readiness gates:

1. display language hydration from `munjib:language` or browser language hints
2. workspace UI hydration from `munjib:workspace-ui:<workspaceSlug>:v1`

Before display language hydration, any user-facing product text that could be
wrong must be hidden behind decorative skeleton shapes. This includes workspace
sidebar chrome labels and right metadata tab labels or accessible names. The
page may still preserve layout columns so the workspace does not jump.

After display language hydration, localized chrome may render. If the workspace
UI state or child browser-owned state is still hydrating, the content area under
that chrome should show row skeletons rather than empty space.

After workspace and child state hydration finish, the current UI renders exactly
as it does today.

## Architecture

### I18nProvider

Extend `I18nContextValue` with an `isHydrated` boolean.

`I18nProvider` should keep deterministic defaults for SSR and the first client
render, then set the final language in `useEffect()` with
`getInitialBrowserLanguage()` and mark `isHydrated=true`. Consumers can use the
hydration signal to avoid rendering language-sensitive chrome until the provider
has applied the saved or inferred language.

`setLanguage()` should continue to write storage, emit the same-tab change
event, update state immediately, and keep `isHydrated=true`. Cross-tab storage
events should update the language without clearing hydration.

### Skeleton Primitive

Add a small shared UI primitive under `components/ui/skeleton.tsx`. It should
support at least:

- rounded line/bar placeholders
- square or icon-sized placeholders
- optional class merging through the same style as existing UI primitives

The shimmer animation can live in `app/globals.css` so Tailwind class strings do
not need custom keyframe plugins. The animation should move left to right and be
disabled under `prefers-reduced-motion: reduce`.

### AppShell Loading Fallbacks

`AppShell` should keep the existing layout columns based on default open state
until workspace UI storage hydrates. If a sidebar is open but
`shellStorageHydrated` is false, render a loading fallback inside the aside
instead of `null`.

The fallback should not mount `left` or `rightContent` children. This preserves
the Issue #122 safety rule that child effects cannot write their own browser
state before the shell knows whether the sidebar should be open or closed.

The shell-level fallback should stay shape-only because it must not mount the
actual left or right children yet. That keeps the closed-sidebar safety rule
simple. The partial localized chrome appears after shell storage hydration, when
`DocumentList` or `MetadataPanel` can mount with a confirmed display language.

### DocumentList Loading Body

`DocumentList` already hydrates its active sidebar panel after mount. Add a
local `isActivePanelHydrated` derivation from
`activePanelHydratedWorkspace === workspaceSlug`.

When language is hydrated but active panel state is not, render the stable
localized top chrome and a body skeleton in place of `DocumentNavigation`.
This avoids a brief default `Documents` panel flash for users whose stored
active panel is `Search` or `Favorites`.

After the active panel is hydrated, mount `DocumentNavigation` normally so
recents, favorites, search, and tree behavior stay in their current owner.

### MetadataPanel Loading Shape

The right sidebar shell fallback should visually resemble the metadata panel:
an icon-tab row and a short list of outline-like row skeletons. Once the real
`MetadataPanel` mounts, it keeps its current tab state and document outline
calculation behavior.

## Accessibility

Skeleton shapes are decorative and should use `aria-hidden="true"`.

Avoid giving skeleton bars roles, labels, or focusable children. The real
localized controls should appear only once their labels are ready. If a panel
region receives `aria-busy`, it should be on the container only and should not
turn placeholder bars into readable content.

Icon-only controls continue to use localized accessible names after language
hydration.

## Error Handling

Browser storage failures remain non-fatal. If `localStorage` access throws,
language hydration should still complete using browser hints or default English,
and workspace UI state hydration should still complete using default open panel
state.

Invalid stored language values continue to be ignored. Invalid workspace UI
state values continue to be ignored by the existing parser.

The important user-visible rule is that fallback text is not rendered before
hydration has selected a language. If storage is unavailable, the app should
still quickly move from shape skeletons to the resolved fallback language.

## Testing Plan

- `tests/components/i18n-provider.test.tsx`: cover the new hydration signal and
  assert consumers can withhold text before hydration while rendering Korean
  after a stored Korean preference is read.
- `tests/components/app-shell.test.tsx`: assert open sidebar columns render
  skeleton fallbacks while shell storage hydration is pending, and that child
  content still does not mount when stored sidebar state is closed.
- `tests/components/document-list.test.tsx`: assert localized top chrome can
  render after language hydration while the navigation body skeleton renders
  until active panel state hydrates.
- Focused component tests should cover reduced regressions around Korean
  labels, storage hydration, and no premature child mounting.
- Manual browser smoke: set display language to Korean, refresh a workspace, and
  confirm sidebars show shimmer skeletons without an English label flash.

## Wiki Maintenance

Update durable workflow and status pages to record that Issue #129 tightens the
Issue #126 first-slice language fallback contract for workspace chrome: saved
Korean users should see skeletons, not a brief English sidebar, while client
language hydration finishes.
