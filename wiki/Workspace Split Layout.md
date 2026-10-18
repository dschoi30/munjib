---
id: workflow-workspace-split-layout
title: Workspace Split Layout
type: workflow
status: active
summary: 인증 workspace의 중첩 탭 분할, 편집 세션 유지, 문서별 우측 사이드바와 브라우저 복원 계약.
created: 2026-10-18
updated: 2026-10-18
source_count: 8
tags:
  - munjib
  - workflow
  - navigation
links:
  - "[[Document Editing Workflow]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Project Structure Onboarding]]"
  - "[[index|Wiki Index]]"
---

# Workspace Split Layout

Issue #240 replaces the authenticated workspace's single center selection with a recursive pane/split layout. Anonymous Trial retains its existing single-document shell.

## Layout and navigation

Each pane owns an ordered tab group and active tab. A split owns a horizontal/vertical axis and ratio. Dropping a document tab on the left, right or bottom edge replaces only the target pane with a split; dropping in another pane's center moves the tab into that group. Left-edge drop places the moved tab left and preserves the target document right. Empty branches collapse into their sibling, and merging gathers all tabs into the active pane. Duplicate documents focus their existing tab.

Each pane has a 320×240 minimum; the workspace scrolls when the recursive minimum exceeds available space. Splitter keyboard arrows and pointer dragging resize individual splits. Each pane menu can switch its nearest parent split between horizontal and vertical without changing tab identity. Editors are rendered in a flat keyed host with geometry calculated from the tree, preserving mounted sessions while tabs move between panes. Graph/Folder temporarily cover the document workspace without discarding its state.

## Persistence and authorization

`munjib:workspace-layout:<encodedUserId>:<encodedWorkspaceId>:v1` stores only pane/tab IDs, document IDs, split direction/ratio, active selections, and document/category expansion flags. Hydration precedes restoration. Legacy workspace-only tab keys are not imported across accounts. Same-browser logout/login preserves layout; other devices and cleared browser storage do not restore it. Draft body recovery across reload is not part of this contract.

Restoration filters document IDs against the current readable index. The shared `loadWorkspaceDocument` loader additionally checks the active workspace, membership, active document, exact workspace slug and document permission before querying its metadata. The detail endpoint requires the current session and returns private/no-store responses. Local layout state never grants access.

## Sidebar and editing

Outline, Attachments, Versions and Audit retain one category toolbar and list currently displayed documents in leaf order. Each title independently expands/collapses its category content, default open. Focus changes do not remove other visible documents. Matching document titles show their paths to disambiguate groups. Live outline/title state is document-scoped. Heading navigation targets that document's editor container even when headings have identical IDs in other documents.

Version restoration confirms its document target and resets only that editor after successful server reload. Closing a dirty tab and signing out with dirty documents ask before discarding; canceling sign-out occurs before the authentication mutation. An editor preserves dirty text when a newer server snapshot arrives and displays a conflict warning for external changes. Native form CRLF and editor LF line endings compare equally, so a successful save clears dirty state. Reload protection uses beforeunload; layout persistence is distinct from draft persistence.

## Evidence

- `docs/superpowers/plans/2026-10-18-workspace-split-tabs.md`
- `lib/workspace-layout.ts`
- `components/split-workspace-session.tsx`
- `components/split-workspace.tsx`
- `lib/documents/workspace-detail.ts`
- `components/metadata-panel.tsx`
- `components/document-editor.tsx`
- `tests/e2e/workspace-splits.spec.ts`
