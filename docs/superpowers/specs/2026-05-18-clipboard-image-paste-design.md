# Clipboard Image Paste Attachments Design

## Goal

Issue #52 adds image-aware clipboard paste to the Markdown editor. When a user pastes an actual clipboard image file into `DocumentEditor`, Munjib stores it as a document attachment and inserts image Markdown at the editor cursor.

## Scope

- Support clipboard image files for `image/png`, `image/jpeg`, `image/gif`, and `image/webp`.
- Upload pasted images immediately as attachment records and bytes.
- Insert `![file](/api/attachments/<id>)` at the current CodeMirror selection after upload succeeds.
- Keep document body persistence on the existing Save button flow.
- Preserve the current rich text paste behavior for clipboard HTML without image files.
- Preserve the current attachment upload form behavior.

## Out Of Scope

- Downloading remote `<img src="https://...">` images from pasted HTML.
- Importing images referenced by Markdown import files.
- ZIP or multi-file Markdown import.
- Temporary blob URL previews before upload.
- Automatically merging mixed image-and-text clipboard payloads into one paste result.

## Architecture

`DocumentEditor` keeps ownership of the paste interaction because it already owns CodeMirror state, current selection, rich clipboard conversion, and write-readonly gating. The paste handler first checks `clipboardData.items` and `clipboardData.files` for supported `image/*` files. Image file paste takes priority over existing `text/html` conversion. If no image file is present, the existing `htmlToMarkdown()` path remains unchanged.

A new workspace-bound server action, tentatively `pasteDocumentImageAttachmentAction(workspaceSlug, formData)`, accepts `documentId` and one image file. The action validates the `File`, reads its bytes, and calls a paste-specific attachment service function.

`lib/attachments/service.ts` should expose a focused helper that reuses the same permission checks, storage path rules, MIME allowlist, size limit, attachment row creation, and audit logging as regular uploads, but does not mutate `Document.contentMarkdown` and does not create a `DocumentVersion`. It returns enough data for the action to build the Markdown image link.

The existing `uploadDocumentAttachment()` path remains responsible for manual upload form behavior: append the Markdown link to the end of the document, create a new document version, reconcile links/metadata, and redirect back to the document.

## Data Flow

1. User pastes into the editable CodeMirror surface.
2. `DocumentEditor` detects the first supported image file in clipboard data.
3. The editor prevents the default paste and submits `documentId` plus the image file to the paste image action.
4. The action stores the file as an attachment and returns `{ markdown: "![file](/api/attachments/<id>)" }`.
5. The editor inserts the returned Markdown at the original selection and updates `contentMarkdown` state.
6. The user presses Save when they want the Markdown body change persisted through `updateDocument()`.

## UX

Successful image paste should feel like a normal editor paste: the Markdown image syntax appears at the cursor after the upload finishes. Clipboard images without a usable filename get a stable fallback such as `pasted-image.png`.

During upload, the editor may show a compact pending state or toast, but it should not remount the editor or navigate away from the current document. The selected document and unsaved Markdown buffer stay in place.

Manual attachment upload remains available below Properties. Its behavior is intentionally different: regular upload appends to the document and creates a document version immediately, while clipboard paste only prepares the editor buffer and waits for Save.

## Error Handling

- Read-only users fall through to existing paste behavior only when the payload is text/HTML; image paste does not upload.
- Missing or empty image files return a shared attachment-file-required style error.
- Files over 5 MB are rejected.
- Unsupported MIME types are rejected.
- Storage or database failures leave the editor buffer unchanged.
- When image paste fails, do not insert broken Markdown or a blob URL. Surface a short failure message.
- If a clipboard payload contains both image and text/HTML, image upload takes priority. If image upload fails, the first implementation does not automatically paste the text fallback because that can produce surprising cursor and selection behavior.

## Testing

- Add attachment service coverage for paste-only attachment creation: it creates an attachment and audit log but does not change `Document.contentMarkdown` or create a new `DocumentVersion`.
- Add action coverage for image file validation and returned Markdown payload.
- Add `DocumentEditor` component coverage for clipboard image paste calling the action and inserting Markdown at the current selection.
- Keep coverage that clipboard HTML without images still uses `htmlToMarkdown()`.
- Keep existing attachment upload service tests passing to prove manual upload semantics did not regress.

## Wiki Maintenance

Update `wiki/Document Editing Workflow.md` to describe the difference between manual attachment upload and clipboard image paste. Add a `wiki/log.md` entry with Issue #52, affected files, and verification commands after implementation.
