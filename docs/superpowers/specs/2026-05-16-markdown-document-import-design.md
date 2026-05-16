# Markdown Document Import Design

## Goal

Issue #40 adds the first settings-panel slice in the left document list and supports importing one Markdown file into the current workspace.

## Scope

- Align the `Company Handbook` settings icon with the right edge of the sidebar toolbar icons, including the Graph icon row below it.
- Open a settings dialog from the sidebar title row without replacing the document list.
- Show a two-column settings dialog layout with one selected menu item: `Import`.
- Implement only the `Import your contents` content area for now.
- Import a single Markdown file into the current workspace.
- Derive the imported document title from `title` frontmatter, then the first ATX `# Heading`, then the file name without extension.
- Store the Markdown body exactly as imported, including frontmatter.

## Out Of Scope

- ZIP, CSV, PDF, HTML, Word, EPUB, or multi-file import.
- Import progress jobs or background processing.
- Folder selection inside the import panel.
- Replacing an existing document.

## UX

The sidebar title row becomes a balanced row: the workspace title on the left and a settings icon button on the right. The button uses the same icon-button dimensions as the existing toolbar so its right edge aligns with the Graph button below.

Clicking settings opens a modal dialog over the workspace while the document list remains rendered behind it. The dialog has a left settings sidebar and a right content pane. Since `Import` is the only menu item in this first slice, it is selected by default every time the dialog opens.

The import pane shows a drag/drop-style content area visually inspired by Notion import, but scoped to Markdown. It includes a file input that accepts `.md`, `.markdown`, and Markdown MIME types, a submit button, and concise helper/error text. The form is disabled for users who cannot write to the workspace.

## Data Flow

The settings dialog submits a server action bound in `app/workspaces/[workspaceSlug]/page.tsx`. The action reads a `File` from `FormData`, validates that it is a Markdown-like file, reads the text, derives the title, then calls the existing `createDocument()` service. That keeps workspace write permission checks, slug uniqueness, initial version creation, wiki link reconciliation, metadata reconciliation, and audit logging on the existing document creation path.

After import, the action revalidates the workspace route and redirects to the imported document.

## Error Handling

- Missing file, including a zero-byte empty file selection, throws `SERVICE_ERROR_CODES.MARKDOWN_IMPORT_FILE_REQUIRED`.
- Non-Markdown file type/extension throws `SERVICE_ERROR_CODES.MARKDOWN_IMPORT_UNSUPPORTED_FILE`.
- New reusable service error codes must be added to `lib/service-errors.ts` and referenced from actions/services instead of throwing ad hoc string literals.
- Empty title candidates and YAML block scalar markers such as `|`, `|-`, `>`, and `>-` fall through to the next title source.
- Existing service errors for workspace and write permission continue to propagate.

## Testing

- Component tests cover settings button alignment affordances, opening/closing the settings dialog, backdrop close, default `Import` selection, document-list preservation behind the dialog, Markdown-only import controls, and disabled import submit when the workspace is not writable.
- Unit tests cover title derivation from frontmatter, heading, and filename, including block-scalar frontmatter title fallback and fenced-code heading skips.
- Existing document service tests remain responsible for version, metadata, link reconciliation, and audit behavior through `createDocument()`.
