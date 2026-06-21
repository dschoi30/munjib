# Product Language Internationalization Settings Design

## Context

Issue #126 introduces product language switching for Munjib. The product
currently has user-facing strings hardcoded across client components, server
rendered screens, AI panels, settings sections, import progress, retention
controls, navigation chrome, and empty/error states. Most product chrome is
English, while some AI warnings and errors are Korean.

The feature adds English and Korean as supported display languages. Users
change the language from the existing workspace Settings panel, and the visible
product language changes immediately after they click Save.

## Decisions From Brainstorming

- Store the language preference as a browser-global app setting, not a
  workspace or database setting.
- When no language has been saved, infer the initial language from the
  browser/OS language hints exposed by `navigator.languages` and
  `navigator.language`.
- Treat `ko` and `ko-*` as Korean; use English for every other detected
  language.
- Add a `Language` section to the existing `WorkspaceSettingsPanel`.
- Let users choose only English or Korean in this slice.
- Keep draft selection separate from the currently applied language until Save.
- Include Save and Cancel controls at the bottom of the Language section.
- Highlight the currently applied language so users can immediately tell which
  language is active.
- Translate all product text that is visible to ordinary users in one slice,
  including login, workspace chrome, document UI, settings, Ask AI, Workspace
  AI, thinking messages, placeholders, empty states, toasts, and user-facing
  errors.
- Leave internal developer/admin strings unchanged when they are not shown to
  users: route error constants, log/observability event names, test ids, model
  ids, provider ids, and other stable identifiers.
- For AI responses, use a mixed policy: UI/default messages follow the selected
  display language, while the actual model answer should continue to prefer the
  user's question language.

## Goals

- Add a small, typed i18n layer for English and Korean.
- Make language switching feel instant after Settings Save.
- Avoid URL locale routing and database migrations in the first slice.
- Preserve current workspace and AI behavior except for user-visible language.
- Keep translation lookup simple enough to apply across the current app without
  introducing a large framework.
- Make missing or invalid stored language values safe and predictable.

## Non-Goals

- Do not add more languages than English and Korean.
- Do not translate user-authored document content, titles, folder names,
  comments, AI answers, model ids, provider ids, citation labels, or raw
  imported Markdown.
- Do not add per-workspace language settings.
- Do not sync language across devices through the database.
- Do not introduce locale-prefixed routes such as `/ko/workspaces/...`.
- Do not localize developer-only logs, observability fingerprints, test ids,
  API error constants, or unreachable internal diagnostics.

## Architecture

Add a thin application i18n layer under `lib/i18n`.

Core pieces:

- `Language = "en" | "ko"`
- supported language metadata for labels and native names
- typed message catalogs for English and Korean
- browser storage helpers for reading, validating, writing, and subscribing to
  the stored language
- OS/browser language inference from `navigator.languages` and
  `navigator.language`
- `I18nProvider` and `useI18n()` for client components
- optional server/shared prompt helpers for AI prompt wording that needs to know
  the selected UI language

The provider owns the applied language for the current tab. On hydration, it
checks saved browser storage first. If no valid stored language exists, it
infers a language from the browser/OS. Invalid stored values are ignored.

Settings writes update both storage and provider state. The storage helper emits
a custom event for same-tab consumers and listens for `storage` events so other
tabs can update as well.

Server-rendered screens should avoid creating a separate i18n source of truth.
Where a page is mostly user-facing and server-rendered, use a small client
boundary or pass translated text through a client component so it follows the
same provider. A brief pre-hydration English fallback is acceptable for the
first slice if the hydrated UI settles to the inferred or saved language.

## Settings UI

`WorkspaceSettingsPanel` gains a fourth navigation item named `Language`.

The Language section contains:

- section title and short product-setting description
- two selectable language options: English and Korean
- a visible highlight for the currently applied language
- a draft indication when the selected option differs from the applied language
- bottom action row with `Save` and `Cancel`
- short status text after save or storage failure

The applied language highlight should be visible before and after draft changes.
For example, the currently active option can have an active border/background
and a `Current` / `현재 적용 중` badge. If the draft differs from the applied
language, the action row should make it clear that the current language will not
change until Save.

Save applies the draft language immediately to the provider and attempts to
persist it in browser storage. Cancel discards the draft and restores the current
applied language as the selected option while keeping the settings panel open.

## Translation Scope

Translate ordinary user-facing text across the product:

- login form text and authentication feedback shown to users
- sidebar workspace menu, Settings item, tooltips, and navigation labels
- document creation controls
- document tree, search, favorites, recents, folder/document action menus, and
  trash confirmation text
- folder detail and empty workspace/document states
- document editor labels, buttons, save state, preview/edit controls, and
  unsaved-change warnings
- metadata panel tabs, attachment/version/comment/audit labels, and empty states
- knowledge graph controls and visible option labels
- Settings Import, AI, Retention, and Language sections
- Markdown import progress/status table
- Ask AI panel labels, placeholders, thinking messages, warnings, and
  user-facing failures
- Workspace AI launcher, panel labels, placeholders, empty state, reset/close
  labels, thinking messages, and user-facing failures
- toasts and validation messages shown to ordinary users

Do not translate:

- user documents, folder names, document titles, comments, tags, or imported
  Markdown
- provider names, model ids, env var names, storage keys, test ids, route
  constants, telemetry event names, Sentry fingerprints, or database enum values
- internal-only error codes that are not directly shown to users

## AI Behavior

The UI language controls AI surface chrome and default/status text:

- Ask AI and Workspace AI labels
- placeholders
- empty states
- thinking indicator messages
- warning and error text
- default fallback phrases supplied to prompt builders when no context exists

The model answer policy remains question-language-first. Prompt helpers should
make the distinction explicit: the selected UI language is available for
fallback/status phrasing, but the answer should be in the user's question
language where possible.

API routes can accept an optional language value from the client request or a
header. The route should validate it against `"en"` and `"ko"` and fall back to
the existing question-language behavior when the value is missing or invalid.
Document content and user questions are never translated before sending them to
the model.

## Data Flow

Initial language selection:

1. `I18nProvider` hydrates on the client.
2. It reads the stored browser-global app language.
3. If the stored value is valid, it applies that language.
4. If no valid value exists, it infers from `navigator.languages` /
   `navigator.language`.
5. It does not write the inferred value back to storage until the user clicks
   Save in Settings.

Settings save flow:

1. User opens Settings -> Language.
2. The section copies the current applied language into local draft state.
3. User selects English or Korean.
4. The applied language highlight remains on the current language until Save.
5. Save validates the draft language, writes storage, updates provider state,
   emits the language-change event, and updates visible UI immediately.
6. Cancel resets draft state to the applied language and leaves the panel open.

Cross-surface update flow:

- Components call `useI18n()` and render translated labels from the catalog.
- Ask AI, Workspace AI, and ThinkingIndicator subscribe through the same
  provider, so open panels update without a page refresh.
- Other browser tabs receive the storage event and update to the saved language.

## Error Handling

- Invalid stored values are ignored and treated as missing.
- Browser storage read/write failures must not break the app.
- If storage write fails on Save, apply the language for the current session and
  show a localized status message that persistence failed.
- If a component requests a missing translation key, TypeScript should catch the
  key at build time where possible. Runtime fallback should use the English
  string rather than rendering an empty label.
- If an API request includes an invalid language value, ignore it and keep the
  existing prompt behavior.

## Accessibility And UX

- The Language section uses standard form controls or button/radio semantics
  with correct labels and selected/current state.
- The current-language highlight must not rely only on color; include a text
  badge such as `Current` / `현재 적용 중`.
- Save and Cancel stay at the bottom of the section and remain reachable at
  narrow widths.
- Labels should fit in existing compact settings/sidebar/tool surfaces in both
  English and Korean.
- Icon-only controls keep localized accessible labels and tooltips.

## Testing

Add focused tests for:

- language validation and OS/browser fallback helper
- read/write/reset/subscribe storage behavior, including invalid stored values
- Settings Language section rendering, draft selection, Save, Cancel, current
  highlight, and storage-failure status
- provider-driven immediate UI update in representative shell text
- ThinkingIndicator messages in English and Korean
- Ask AI and Workspace AI placeholders, errors, empty states, and selected
  language request payload/header
- prompt helper behavior for optional UI language while preserving
  question-language-first answer instruction
- no translation of stable identifiers such as model ids and provider ids

Run focused component/unit tests plus typecheck. During implementation, use
`pnpm wiki:sync-plan --staged` to decide whether the i18n architecture needs a
wiki page or updates to existing workflow pages.

## Follow-Up Options

- Persist language on the user account for cross-device sync.
- Add server-side cookie support to reduce pre-hydration English fallback.
- Add more locales after the catalog shape proves stable.
- Add static checks for untranslated user-facing strings.
