# Tag Click Search Design

## Context

Issue #71 adds Obsidian-style tag navigation to Munjib. The current sidebar search panel can search document title, path, and body text, and the document editor already reconciles tags from both YAML frontmatter `tags:` and body `#tag` syntax into the workspace tag index. Properties rendering intentionally shows only frontmatter tags, while body tags remain graph/tag-index metadata.

The requested behavior is: clicking a frontmatter tag or a content tag should fill the sidebar search input with a tag query like `tag:#LangChain` and show documents with the same tag. Users should also be able to type `tag:#something` directly into the existing search input.

## Goals

- Make frontmatter tags in the Properties row clickable.
- Make body `#tag` text clickable in preview mode.
- Open the existing sidebar Search panel when a tag is clicked.
- Fill the search input with `tag:#<tag>` after a tag click.
- Support user-typed `tag:#something` searches in the same input.
- Match tag searches by exact normalized tag name, case-insensitive.
- Include documents tagged from either YAML frontmatter `tags:` or body `#tag`.

## Non-Goals

- Do not make raw `#tag` text clickable inside CodeMirror edit mode.
- Do not add a dedicated tag browser or separate tag filter panel.
- Do not store tag search state in the URL.
- Do not change the existing Properties policy: Properties tags remain frontmatter-only.
- Do not change tag extraction or reconciliation semantics beyond what search needs to read.

## Behavior

The search input supports two modes:

- Plain text query: existing behavior remains title, path, and body text matching.
- Tag query: `tag:#LangChain` or `tag:LangChain` triggers exact tag matching.

Tag query normalization should:

- trim whitespace around the full query and tag name
- accept an optional leading `#`
- compare with `normalizeTag`
- ignore case
- reject partial matching, so `tag:#Lang` does not match `LangChain`

When a user clicks a tag:

1. The document list opens the Search panel.
2. The search query becomes `tag:#<display tag>`.
3. The result count and document rows update to documents that have the normalized tag.
4. The input remains editable, so the user can modify or replace the tag query.

## Data Flow

`app/workspaces/[workspaceSlug]/page.tsx` should provide enough tag data to the client-side document list for filtering. The preferred shape is to extend each `DocumentListItem` with a lightweight list of normalized tag names derived from existing `DocumentTag` rows. This keeps the search panel client-side and avoids a new server round trip for each tag click.

The document editor should receive an `onTagSearch(tagName)` callback from the workspace shell/list boundary. That callback should remain UI state only: it switches the sidebar to Search and sets the literal query. It should not mutate the document, URL, or persisted user settings.

## UI

Properties tag chips keep the current compact pill visual language but use button semantics. The visible label remains `#tag`. Hover/focus treatment should communicate clickability without making the properties row look like a separate toolbar.

Preview mode renders body `#tag` tokens as clickable inline elements. The treatment should align with existing preview link styling, but the href does not need to navigate. The action is local UI state: open sidebar Search with `tag:#tag`.

Edit mode stays unchanged so cursor placement, text selection, and normal markdown editing are not affected.

## Component Boundaries

- `DocumentList` owns `activePanel` and `searchQuery`, so it should expose or pass an `openTagSearch(tagName)` handler to the editor path.
- `DocumentNavigation` owns search filtering, so it should parse tag queries and filter against each document's tag names.
- `SearchPanel` remains a literal search input. It does not need a separate chip UI.
- `DocumentProperties` renders clickable frontmatter tag chips and calls `onTagSearch`.
- `MarkdownPreview` renders clickable preview body tags and calls `onTagSearch`.

If passing the callback from `DocumentList` to `DocumentEditor` requires touching the workspace page boundary, keep the prop narrowly named and optional so tests and existing editor use remain straightforward.

## Error Handling And Edge Cases

- Empty `tag:` queries should produce no special match and can fall back to zero tag results.
- Malformed tag queries with only whitespace after `tag:` should not match all documents.
- `tag:#LangChain` and `tag:langchain` should match the same normalized tag.
- Body text containing `tag:#something` should still behave as a tag query only when the full search input starts with the `tag:` operator.
- Existing plain text search for `#LangChain` remains plain full-text search unless the user types the `tag:` operator.

## Testing

Add focused tests for:

- exact normalized tag search with `tag:#name`
- `tag:name` without `#`
- case-insensitive matching
- partial query non-match
- plain text search fallback
- Properties frontmatter tag click opens Search and fills `tag:#...`
- Preview body tag click opens Search and fills `tag:#...`
- Properties still excludes body-only tags from the frontmatter tags row
- edit mode does not add tag click behavior inside CodeMirror

## Wiki Updates

Durable behavior should be recorded in:

- `wiki/Document Editing Workflow.md`: Issue #71 planned tag click/search behavior and the tag query operator.
- `wiki/Munjib.md`: product-level design entry for Obsidian-style tag navigation.
- `wiki/index.md`: current status entry for Issue #71.
- `wiki/log.md`: design chronology entry.

## Open Questions

None. The approved design uses the existing Search panel, literal `tag:#name` queries, exact normalized matching, and clickable tags in Properties plus preview mode only.
