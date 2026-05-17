"use client";

import { markdown } from "@codemirror/lang-markdown";
import { foldEffect } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import dynamic from "next/dynamic";
import {
  Paperclip,
  Save,
  Upload,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { useHeadingNavigation, type HeadingNavigationTarget } from "@/components/app-shell";
import type { DocumentEditorProps } from "@/components/document-editor/types";
import { DocumentProperties } from "@/components/document-editor/document-properties";
import {
  persistEditorFoldState,
  readStoredFoldedHeadingKeys,
} from "@/components/document-editor/folding-storage";
import { MarkdownPreview } from "@/components/document-editor/markdown-preview";
import { WikiLinkSuggestions } from "@/components/document-editor/wiki-link-suggestions";
import { useDocumentViewMode } from "@/components/document-view-mode";
import { Button } from "@/components/ui/button";
import { buildHeadingFoldTree } from "@/lib/markdown/folding";
import {
  getActiveWikiLinkCompletion,
  getWikiLinkCompletionOptions,
  type ActiveWikiLinkCompletion,
} from "@/lib/wiki-links/autocomplete";
import { htmlToMarkdown } from "@/lib/markdown/html-to-markdown";
import { getOutlineHeadingTarget } from "@/lib/outline-targets";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

const pastedImageMimeTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function createPastedImagePlaceholder() {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `![Uploading image...](about:blank#munjib-paste-${id})`;
}

function getClipboardImageFile(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return null;

  const itemFile = Array.from(dataTransfer.items ?? [])
    .find((item) => item.kind === "file" && pastedImageMimeTypes.has(item.type))
    ?.getAsFile();
  if (itemFile) return itemFile;

  return Array.from(dataTransfer.files ?? []).find((file) => pastedImageMimeTypes.has(file.type)) ?? null;
}

function replaceCurrentPlaceholder(view: EditorView, placeholder: string, insert: string) {
  replaceCurrentPlaceholders(view, placeholder, insert);
}

function replaceCurrentPlaceholders(view: EditorView, placeholder: string, insert: string | string[]) {
  const currentMarkdown = view.state.doc.toString();
  const changes = [];
  let from = currentMarkdown.indexOf(placeholder);
  let index = 0;

  while (from !== -1) {
    const replacement = Array.isArray(insert)
      ? (insert[Math.min(index, insert.length - 1)] ?? "")
      : insert;
    changes.push({ from, to: from + placeholder.length, insert: replacement });
    from = currentMarkdown.indexOf(placeholder, from + placeholder.length);
    index += 1;
  }

  if (changes.length > 0) {
    view.dispatch({ changes });
  }
}

function getSelectedTexts(view: EditorView) {
  return view.state.selection.ranges.map((range) => view.state.sliceDoc(range.from, range.to));
}

export function DocumentEditor({
  document,
  canWrite,
  action,
  uploadAttachmentAction,
  pasteImageAttachmentAction,
  linkCandidates,
  tags,
  properties,
  comments,
  linkPanels,
  createFromBrokenLinkAction,
  createCommentAction,
}: DocumentEditorProps) {
  const { mode } = useDocumentViewMode();
  const [title, setTitle] = useState(document?.title ?? "");
  const [contentMarkdown, setContentMarkdown] = useState(document?.contentMarkdown ?? "");
  const [contentDocumentId, setContentDocumentId] = useState(document?.id ?? null);
  const [activeCompletion, setActiveCompletion] = useState<ActiveWikiLinkCompletion | null>(null);
  const editorFoldStorageKey = document?.id ? `munjib:heading-folds:${document.id}` : null;
  const editorFoldContextRef = useRef<{
    storageKey: string;
  } | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const previewHeadingExpanderRef = useRef<((id: string) => void) | null>(null);
  const headingNavigation = useHeadingNavigation();
  const registerHeadingNavigator = headingNavigation?.setHeadingNavigator;
  const setOutlineDocument = headingNavigation?.setOutlineDocument;
  editorFoldContextRef.current = editorFoldStorageKey ? { storageKey: editorFoldStorageKey } : null;
  const [pendingImagePasteCounts, setPendingImagePasteCounts] = useState<Record<string, number>>({});
  const hasPendingImagePaste = document?.id ? (pendingImagePasteCounts[document.id] ?? 0) > 0 : false;
  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.updateListener.of((update) => {
        const context = editorFoldContextRef.current;

        if (!context) {
          return;
        }

        persistEditorFoldState(update.view, context.storageKey);
      }),
      EditorView.domEventHandlers({
        paste: (event, view) => {
          if (!canWrite) {
            return false;
          }

          const imageFile = getClipboardImageFile(event.clipboardData);

          if (imageFile) {
            event.preventDefault();
            const placeholder = createPastedImagePlaceholder();
            const selectedTexts = getSelectedTexts(view);
            const pasteDocumentId = document?.id ?? "";
            const formData = new FormData();
            formData.set("documentId", document?.id ?? "");
            formData.set("attachment", imageFile);

            view.dispatch(view.state.replaceSelection(placeholder));
            setPendingImagePasteCounts((counts) => ({
              ...counts,
              [pasteDocumentId]: (counts[pasteDocumentId] ?? 0) + 1,
            }));

            void Promise.resolve(pasteImageAttachmentAction(formData))
              .then(({ markdown }) => {
                replaceCurrentPlaceholder(view, placeholder, markdown);
              })
              .catch(() => {
                replaceCurrentPlaceholders(view, placeholder, selectedTexts);
                toast.error("Image paste failed");
              })
              .finally(() => {
                setPendingImagePasteCounts((counts) => {
                  const nextCount = Math.max(0, (counts[pasteDocumentId] ?? 0) - 1);
                  const nextCounts = { ...counts };

                  if (nextCount > 0) {
                    nextCounts[pasteDocumentId] = nextCount;
                  } else {
                    delete nextCounts[pasteDocumentId];
                  }

                  return nextCounts;
                });
              });

            return true;
          }

          const html = event.clipboardData?.getData("text/html") ?? "";
          const markdown = htmlToMarkdown(html);

          if (!markdown) {
            return false;
          }

          event.preventDefault();
          view.dispatch(view.state.replaceSelection(markdown));

          return true;
        },
      }),
    ],
    [canWrite, document?.id, pasteImageAttachmentAction],
  );
  const suggestions = useMemo(() => {
    if (!activeCompletion) return [];
    return getWikiLinkCompletionOptions(
      activeCompletion.query,
      linkCandidates.filter((candidate) => candidate.id !== document?.id),
    );
  }, [activeCompletion, document?.id, linkCandidates]);

  useEffect(() => {
    setTitle(document?.title ?? "");
    setContentMarkdown(document?.contentMarkdown ?? "");
    setContentDocumentId(document?.id ?? null);
    setActiveCompletion(null);
  }, [document?.id, document?.title, document?.contentMarkdown]);

  function updateMarkdown(value: string, cursorPosition?: number) {
    setContentMarkdown(value);
    setContentDocumentId(document?.id ?? null);
    setActiveCompletion(
      typeof cursorPosition === "number" ? getActiveWikiLinkCompletion(value, cursorPosition) : null,
    );
  }

  function insertWikiLink(option: (typeof suggestions)[number]) {
    if (!activeCompletion) return;
    const nextMarkdown = `${contentMarkdown.slice(0, activeCompletion.from)}${option.insertText}${contentMarkdown.slice(
      activeCompletion.to,
    )}`;
    updateMarkdown(nextMarkdown);
  }

  const restoreEditorFolds = useCallback(
    (view: EditorView) => {
      if (!document?.id || typeof window === "undefined") {
        return;
      }

      const foldTree = buildHeadingFoldTree(contentMarkdown);
      const storageKey = `munjib:heading-folds:${document.id}`;
      const foldedKeys = readStoredFoldedHeadingKeys(storageKey, foldTree.headingKeys);
      const effects = foldedKeys.flatMap((key) => {
        const editorRange = foldTree.sectionByKey.get(key)?.editorRange;

        if (!editorRange) {
          return [];
        }

        try {
          const from = view.state.doc.line(editorRange.fromLine).from;
          const to = view.state.doc.line(editorRange.toLine).to;

          return from < to ? [foldEffect.of({ from, to })] : [];
        } catch {
          return [];
        }
      });

      if (effects.length > 0) {
        view.dispatch({ effects });
      }
    },
    [contentMarkdown, document?.id],
  );
  const handleCreateEditor = useCallback(
    (view: EditorView) => {
      editorViewRef.current = view;
      restoreEditorFolds(view);
    },
    [restoreEditorFolds],
  );

  useEffect(() => {
    editorViewRef.current = null;
  }, [document?.id]);

  useEffect(() => {
    if (!document?.id || !registerHeadingNavigator) {
      return;
    }

    const navigateToHeading = (target: HeadingNavigationTarget) => {
      let previewTarget = getOutlineHeadingTarget(target.id);

      if (previewTarget) {
        previewTarget.scrollIntoView({ block: "start", behavior: "smooth" });
        return true;
      }

      if (mode === "preview" && previewHeadingExpanderRef.current) {
        flushSync(() => previewHeadingExpanderRef.current?.(target.id));
        previewTarget = getOutlineHeadingTarget(target.id);

        if (previewTarget) {
          previewTarget.scrollIntoView({ block: "start", behavior: "smooth" });
          return true;
        }
      }

      const view = editorViewRef.current;

      if (!view || target.lineNumber < 1) {
        return false;
      }

      try {
        const line = view.state.doc.line(target.lineNumber);

        view.dispatch({
          effects: EditorView.scrollIntoView(line.from, { y: "start" }),
        });

        return true;
      } catch {
        // Ignore outline targets whose source line is no longer present.
        return false;
      }
    };

    registerHeadingNavigator(navigateToHeading);
    return () => registerHeadingNavigator(null);
  }, [document?.id, mode, registerHeadingNavigator]);

  useEffect(() => {
    if (!setOutlineDocument) {
      return;
    }

    setOutlineDocument(
      document?.id ? { id: document.id, contentMarkdown } : null,
    );
  }, [contentMarkdown, document?.id, setOutlineDocument]);

  useEffect(() => {
    if (!setOutlineDocument) {
      return;
    }

    return () => setOutlineDocument(null);
  }, [document?.id, setOutlineDocument]);
  const editorMarkdownReady = contentDocumentId === document?.id;

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-white">
        <p className="text-sm text-slate-500">Create or select a document.</p>
      </div>
    );
  }

  return (
    <div key={document.id} className="mx-auto max-w-4xl space-y-4">
      <form
        id={`document-save-${document.id}`}
        action={action}
        onSubmit={(event) => {
          if (!hasPendingImagePaste) {
            return;
          }

          event.preventDefault();
          toast.error("Image upload is still in progress");
        }}
      >
        <input type="hidden" name="documentId" value={document.id} />
        <input type="hidden" name="contentMarkdown" value={contentMarkdown} />
      </form>
      <div>
        <input
          form={`document-save-${document.id}`}
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={!canWrite}
          className="w-full border-0 bg-transparent px-0 py-1 text-[1.75rem] font-bold leading-tight text-ink outline-none placeholder:text-slate-400 focus:ring-0 disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>
      <DocumentProperties
        document={document}
        tags={tags}
        properties={properties}
        comments={comments}
        linkPanels={linkPanels}
        canWrite={canWrite}
        createFromBrokenLinkAction={createFromBrokenLinkAction}
        createCommentAction={createCommentAction}
      />
      <form
        action={uploadAttachmentAction}
        className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-white px-3 py-2"
      >
        <input type="hidden" name="documentId" value={document.id} />
        <Paperclip className="h-4 w-4 text-slate-500" aria-hidden="true" />
        <label className="sr-only" htmlFor={`attachment-${document.id}`}>
          Upload attachment
        </label>
        <input
          id={`attachment-${document.id}`}
          name="attachment"
          type="file"
          disabled={!canWrite}
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown"
          className="min-w-0 flex-1 text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
        />
        <Button type="submit" disabled={!canWrite} className="h-8 px-2 text-xs">
          <Upload className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Upload
        </Button>
      </form>
      <div className="overflow-hidden rounded-md border border-border bg-white">
        {mode === "edit" && editorMarkdownReady ? (
          <div className="relative min-w-0">
            <CodeMirror
              value={contentMarkdown}
              basicSetup={{
                foldGutter: true,
                highlightActiveLine: false,
                highlightActiveLineGutter: false,
              }}
              editable={canWrite}
              extensions={extensions}
              onCreateEditor={handleCreateEditor}
              onChange={(value, viewUpdate) =>
                updateMarkdown(value, viewUpdate.state.selection.main.head)
              }
              aria-label="Markdown editor"
            />
            <WikiLinkSuggestions
              canWrite={canWrite}
              suggestions={suggestions}
              onSelect={insertWikiLink}
            />
          </div>
        ) : null}
        {mode === "preview" ? (
          <MarkdownPreview
            markdown={contentMarkdown}
            documentId={document.id}
            linkCandidates={linkCandidates}
            registerHeadingExpander={(expander) => {
              previewHeadingExpanderRef.current = expander;
            }}
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {canWrite ? "Markdown changes are saved when you press Save." : "Viewer access is read-only."}
        </p>
        <Button form={`document-save-${document.id}`} type="submit" disabled={!canWrite || hasPendingImagePaste}>
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          Save
        </Button>
      </div>
    </div>
  );
}
