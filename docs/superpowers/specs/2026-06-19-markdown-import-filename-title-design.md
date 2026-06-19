# Markdown Import Filename Title Priority Design

## Context

Issue #113 changes Markdown import title derivation so the imported file name is the primary source for the Munjib document title.

Today, `deriveMarkdownImportTitle()` prefers title metadata inside the Markdown content:

1. YAML frontmatter `title`
2. First ATX H1 heading
3. File name without `.md` or `.markdown`
4. `Untitled`

That behavior can surprise users who organize Markdown exports by file name and expect the imported document list to match the selected files. The new policy is to preserve the file name as the document title whenever it produces a non-empty value.

## Goals

- Make the extension-stripped import file name the first-priority document title.
- Keep existing frontmatter and H1 parsing only as defensive fallbacks for invalid or unusable file names.
- Keep the current server action, import UI, multi-file batch flow, and destination folder behavior unchanged.
- Update tests and wiki documentation so the durable project knowledge matches the new policy.

## Non-Goals

- Do not add an import UI setting for title source selection.
- Do not remove the existing frontmatter or H1 parser helpers.
- Do not transform or rewrite Markdown body content during import.
- Do not change duplicate title/path behavior in document creation.

## Design

`deriveMarkdownImportTitle({ fileName, contentMarkdown })` will use this precedence:

1. File name without a terminal `.md` or `.markdown` extension
2. YAML frontmatter `title`
3. First ATX H1 heading outside fenced code blocks
4. `Untitled`

For normal browser `File` inputs, the first item should almost always win. For example, importing `README.md` whose content contains `title: Project Overview` and `# Internal Handbook` will create a document titled `README`.

The existing `fileNameTitle()` helper already strips path separators defensively, trims whitespace, removes supported Markdown extensions case-insensitively, and returns `null` when the result is empty. The implementation only needs to move `fileNameTitle(fileName)` to the front of the nullish fallback chain.

Frontmatter and H1 fallback behavior remains unchanged:

- Quoted YAML scalar titles are unquoted and trimmed.
- YAML block scalar markers such as `title: |` and `title: >` are treated as missing.
- H1 detection skips fenced code blocks.

## Data Flow

The existing import action remains the integration point:

1. `importMarkdownDocumentAction()` validates each selected file.
2. The action reads the file with `file.text()`.
3. The action calls `deriveMarkdownImportTitle({ fileName: file.name, contentMarkdown })`.
4. The derived title is passed directly into `createDocument()`.

No client-side title derivation is introduced, so batch import status rendering and route refresh behavior do not change.

## Error Handling

Unsupported files and empty files keep the existing service-error behavior. Title derivation remains total: if file name, frontmatter title, and H1 title all fail to produce a non-empty title, the function returns `Untitled`.

## Testing

Update `tests/documents/import-markdown.test.ts` to specify the new precedence:

- File name wins over frontmatter title and H1.
- Frontmatter title is used when the file name cannot produce a title.
- H1 is used when both file name and frontmatter title are unavailable.
- Existing edge cases for YAML block scalar markers, fenced-code H1 skipping, and `.markdown` extension stripping stay covered.

Existing workspace action tests can remain mocked around `deriveMarkdownImportTitle()` because the server action contract does not change.

## Wiki Updates

Implementation should update the smallest relevant wiki surface:

- `wiki/Markdown Import And Clipboard Paste Workflow.md`: revise the title precedence sentence.
- `wiki/index.md`: update the Markdown import summary only if it repeats the old rule or needs a navigation note.
- `wiki/log.md`: append an entry for issue #113 with source evidence.

Run the repo wiki sync checks before committing implementation changes.

