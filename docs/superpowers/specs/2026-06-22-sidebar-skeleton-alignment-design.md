# Sidebar Skeleton Alignment Design

## Context

The workspace sidebars now show decorative loading skeletons while language and sidebar state hydrate. The first version prevents blank sidebars, but the placeholder rows do not line up with the loaded sidebar chrome, icons, and text slots.

The next refinement is visual alignment only. It must keep the language hydration behavior and scrollbar gutter behavior unchanged.

## Goals

- Match left and right sidebar skeleton positions to the actual loaded component slots.
- Keep document-row skeletons visually consistent by using a full-width text bar for every document row.
- Preserve folder-row icon placement by showing a skeleton icon only where the real folder chevron appears.
- Keep all skeleton content decorative and empty of user-visible text.
- Preserve stable sidebar icon positions when scrollbars appear or disappear.

## Non-Goals

- Do not change sidebar persistence, language selection, or i18n message behavior.
- Do not introduce new loading data flows.
- Do not replace the loaded document or metadata components with a generic loading framework.

## Design

Left sidebar skeletons will mirror the loaded `DocumentList` layout:

- Workspace chrome uses the same `h-11` row and close-button slot.
- Create/navigation toolbar uses the same `mb-4 flex h-11 items-center justify-between` shape as `DocumentCreateControls`.
- Navigation body starts at the same `pt-3` offset as the loaded body.
- Sections use the same `mb-4` spacing and heading rhythm as `DocumentSection`.
- Document rows use the same row padding slot as `DocumentLinkRow`, but render a single full-width text skeleton bar with no icon slot.
- Folder rows use the same `px-2 py-1.5`, `gap-1`, and `h-4 w-4` chevron slot as `FolderToggleRow`, followed by a full-width text skeleton bar.

Right sidebar skeletons will mirror the loaded `MetadataPanel` layout:

- Metadata toolbar uses `h-11`, `h-8 w-8` icon slots, and the actual `gap-1` spacing.
- Metadata content uses the same section heading and row padding rhythm as the outline list.
- Rows render full-width bars inside their actual text slots.

Collapsed sidebars remain unchanged: the single square placeholder stays aligned with the loaded open-panel button.

## Testing

Component tests should assert the structural contract instead of pixel snapshots:

- Left sidebar skeleton exposes chrome, toolbar, document rows, and folder rows with decorative content only.
- Document rows have no icon skeletons and use full-width bars.
- Folder rows include an icon-slot skeleton and full-width text bars.
- Right sidebar toolbar uses the same compact spacing as `MetadataPanel`.
- Existing empty-text and collapsed-panel tests remain in place.

Manual browser verification should confirm that refreshed sidebars no longer show shifted icon or text positions before loaded content appears.
