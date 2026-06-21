"use client";

import { markdown } from "@codemirror/lang-markdown";
import { foldEffect } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import dynamic from "next/dynamic";
import {
  Paperclip,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { useHeadingNavigation, type HeadingNavigationTarget } from "@/components/app-shell";
import { AiAssistantPanel } from "@/components/document-editor/ai-assistant-panel";
import type { DocumentEditorProps } from "@/components/document-editor/types";
import { DocumentProperties } from "@/components/document-editor/document-properties";
import {
  persistEditorFoldState,
  readStoredFoldedHeadingKeys,
} from "@/components/document-editor/folding-storage";
import { MarkdownPreview } from "@/components/document-editor/markdown-preview";
import { WikiLinkSuggestions } from "@/components/document-editor/wiki-link-suggestions";
import { useDocumentViewMode } from "@/components/document-view-mode";
import { useI18n } from "@/components/i18n-provider";
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

type HtmlImagePaste = {
  placeholder: string;
  altText: string;
  fileName: string;
  src: string;
};

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

function replacePlaceholdersInMarkdown(markdown: string, placeholder: string, insert: string | string[]) {
  let nextMarkdown = "";
  let start = 0;
  let from = markdown.indexOf(placeholder);
  let index = 0;

  while (from !== -1) {
    const replacement = Array.isArray(insert)
      ? (insert[Math.min(index, insert.length - 1)] ?? "")
      : insert;
    nextMarkdown += `${markdown.slice(start, from)}${replacement}`;
    start = from + placeholder.length;
    from = markdown.indexOf(placeholder, start);
    index += 1;
  }

  return index > 0 ? `${nextMarkdown}${markdown.slice(start)}` : markdown;
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

function htmlToMarkdownWithImagePlaceholders(html: string) {
  if (typeof DOMParser === "undefined" || html.trim().length === 0) {
    return { markdown: "", images: [] as HtmlImagePaste[] };
  }

  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  const images: HtmlImagePaste[] = [];

  for (const image of Array.from(parsedDocument.body.querySelectorAll("img"))) {
    const src = image.getAttribute("src")?.trim();
    if (!src) continue;

    const altText = image.getAttribute("alt")?.trim() || "pasted-image";
    const placeholder = createPastedImagePlaceholder();
    images.push({
      placeholder,
      altText,
      fileName: pastedImageFileName(src, altText),
      src,
    });

    const replacement = parsedDocument.createTextNode(placeholder);
    const imageLink = image.closest("a");
    if (imageLink && isImageOnlyLink(imageLink, image)) {
      imageLink.replaceWith(replacement);
    } else {
      image.replaceWith(replacement);
    }
  }

  return {
    markdown: htmlToMarkdown(parsedDocument.body.innerHTML),
    images,
  };
}

function isImageOnlyLink(link: HTMLAnchorElement, image: HTMLImageElement) {
  return Array.from(link.childNodes).every((child) => {
    if (child === image) return true;
    if (child.nodeType === Node.TEXT_NODE) return (child.textContent ?? "").trim().length === 0;
    return false;
  });
}

function formDataFromHtmlImagePaste(image: HtmlImagePaste, documentId: string) {
  const formData = new FormData();
  formData.set("documentId", documentId);

  if (image.src.startsWith("data:")) {
    formData.set("attachment", fileFromDataUrl(image.src, image.fileName));
  } else {
    formData.set("imageUrl", image.src);
    formData.set("fileName", image.fileName);
  }

  return formData;
}

function fileFromDataUrl(dataUrl: string, fileName: string) {
  const match = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match || !pastedImageMimeTypes.has(match[1])) {
    throw new Error("UNSUPPORTED_IMAGE_TYPE");
  }

  const mimeType = match[1];
  const payload = match[3];
  const binary = match[2] ? atob(payload) : decodeURIComponent(payload);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new File([bytes], withImageExtension(fileName, mimeType), { type: mimeType });
}

function pastedImageFileName(src: string, altText: string) {
  const urlName = src.startsWith("data:") ? "" : src.split(/[?#]/)[0]?.split("/").pop() ?? "";
  const candidate = sanitizeFileName(urlName || altText || "pasted-image");

  return candidate || "pasted-image";
}

function sanitizeFileName(value: string) {
  return value
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function withImageExtension(fileName: string, mimeType: string) {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] ?? "png";

  return fileName.toLowerCase().endsWith(`.${extension}`) ? fileName : `${fileName}.${extension}`;
}

export function DocumentEditor({
  workspaceSlug,
  defaultChatModel,
  defaultChatProvider,
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
  const { t } = useI18n();
  const { mode } = useDocumentViewMode();
  const [title, setTitle] = useState(document?.title ?? "");
  const [contentMarkdown, setContentMarkdown] = useState(document?.contentMarkdown ?? "");
  const [contentDocumentId, setContentDocumentId] = useState(document?.id ?? null);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [activeCompletion, setActiveCompletion] = useState<ActiveWikiLinkCompletion | null>(null);
  const editorFoldStorageKey = document?.id ? `munjib:heading-folds:${document.id}` : null;
  const editorFoldContextRef = useRef<{
    storageKey: string;
  } | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const editorViewDocumentIdsRef = useRef(new WeakMap<EditorView, string>());
  const activeDocumentIdRef = useRef<string | null>(document?.id ?? null);
  const pendingImagePasteCountsRef = useRef<Record<string, number>>({});
  const pendingImagePasteDraftsRef = useRef<Record<string, string>>({});
  const previewHeadingExpanderRef = useRef<((id: string) => void) | null>(null);
  const headingNavigation = useHeadingNavigation();
  const registerHeadingNavigator = headingNavigation?.setHeadingNavigator;
  const setOutlineDocument = headingNavigation?.setOutlineDocument;
  editorFoldContextRef.current = editorFoldStorageKey ? { storageKey: editorFoldStorageKey } : null;
  const [pendingImagePasteCounts, setPendingImagePasteCounts] = useState<Record<string, number>>({});
  const hasPendingImagePaste = document?.id ? (pendingImagePasteCounts[document.id] ?? 0) > 0 : false;
  activeDocumentIdRef.current = document?.id ?? null;
  pendingImagePasteCountsRef.current = pendingImagePasteCounts;
  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.updateListener.of((update) => {
        const context = editorFoldContextRef.current;

        if (!context) {
          return;
        }

        persistEditorFoldState(update.view, context.storageKey);

        const viewDocumentId = editorViewDocumentIdsRef.current.get(update.view);
        const draftDocumentId = viewDocumentId ?? activeDocumentIdRef.current;
        if (draftDocumentId && (pendingImagePasteCountsRef.current[draftDocumentId] ?? 0) > 0) {
          pendingImagePasteDraftsRef.current[draftDocumentId] = update.view.state.doc.toString();
        }
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

            if (pasteDocumentId) {
              editorViewDocumentIdsRef.current.set(view, pasteDocumentId);
            }
            view.dispatch(view.state.replaceSelection(placeholder));
            pendingImagePasteDraftsRef.current[pasteDocumentId] = view.state.doc.toString();
            setPendingImagePasteCounts((counts) => ({
              ...counts,
              [pasteDocumentId]: (counts[pasteDocumentId] ?? 0) + 1,
            }));

            void Promise.resolve(pasteImageAttachmentAction(formData))
              .then(({ markdown }) => {
                const currentDraft = pendingImagePasteDraftsRef.current[pasteDocumentId] ?? view.state.doc.toString();
                const nextDraft = replacePlaceholdersInMarkdown(currentDraft, placeholder, markdown);
                pendingImagePasteDraftsRef.current[pasteDocumentId] = nextDraft;
                replaceCurrentPlaceholder(view, placeholder, markdown);
                if (activeDocumentIdRef.current === pasteDocumentId) {
                  setContentMarkdown(nextDraft);
                }
              })
              .catch(() => {
                const currentDraft = pendingImagePasteDraftsRef.current[pasteDocumentId] ?? view.state.doc.toString();
                const nextDraft = replacePlaceholdersInMarkdown(currentDraft, placeholder, selectedTexts);
                pendingImagePasteDraftsRef.current[pasteDocumentId] = nextDraft;
                replaceCurrentPlaceholders(view, placeholder, selectedTexts);
                if (activeDocumentIdRef.current === pasteDocumentId) {
                  setContentMarkdown(nextDraft);
                }
                toast.error(t("editor.imagePasteFailed"));
              })
              .finally(() => {
                setPendingImagePasteCounts((counts) => {
                  const nextCount = Math.max(0, (counts[pasteDocumentId] ?? 0) - 1);
                  const nextCounts = { ...counts };

                  if (nextCount > 0) {
                    nextCounts[pasteDocumentId] = nextCount;
                  } else {
                    delete nextCounts[pasteDocumentId];
                    if (activeDocumentIdRef.current === pasteDocumentId) {
                      delete pendingImagePasteDraftsRef.current[pasteDocumentId];
                    }
                  }

                  return nextCounts;
                });
              });

            return true;
          }

          const html = event.clipboardData?.getData("text/html") ?? "";
          const { markdown, images } = htmlToMarkdownWithImagePlaceholders(html);

          if (!markdown) {
            return false;
          }

          event.preventDefault();
          view.dispatch(view.state.replaceSelection(markdown));

          if (images.length > 0) {
            const pasteDocumentId = document?.id ?? "";
            if (pasteDocumentId) {
              editorViewDocumentIdsRef.current.set(view, pasteDocumentId);
            }
            pendingImagePasteDraftsRef.current[pasteDocumentId] = view.state.doc.toString();
            setPendingImagePasteCounts((counts) => ({
              ...counts,
              [pasteDocumentId]: (counts[pasteDocumentId] ?? 0) + images.length,
            }));

            for (const image of images) {
              void Promise.resolve()
                .then(() => pasteImageAttachmentAction(formDataFromHtmlImagePaste(image, pasteDocumentId)))
                .then(({ markdown }) => {
                  const currentDraft = pendingImagePasteDraftsRef.current[pasteDocumentId] ?? view.state.doc.toString();
                  const nextDraft = replacePlaceholdersInMarkdown(currentDraft, image.placeholder, markdown);
                  pendingImagePasteDraftsRef.current[pasteDocumentId] = nextDraft;
                  replaceCurrentPlaceholder(view, image.placeholder, markdown);
                  if (activeDocumentIdRef.current === pasteDocumentId) {
                    setContentMarkdown(nextDraft);
                  }
                })
                .catch(() => {
                  const currentDraft = pendingImagePasteDraftsRef.current[pasteDocumentId] ?? view.state.doc.toString();
                  const nextDraft = replacePlaceholdersInMarkdown(currentDraft, image.placeholder, image.altText);
                  pendingImagePasteDraftsRef.current[pasteDocumentId] = nextDraft;
                  replaceCurrentPlaceholder(view, image.placeholder, image.altText);
                  if (activeDocumentIdRef.current === pasteDocumentId) {
                    setContentMarkdown(nextDraft);
                  }
                  toast.error(t("editor.imagePasteFailed"));
                })
                .finally(() => {
                  setPendingImagePasteCounts((counts) => {
                    const nextCount = Math.max(0, (counts[pasteDocumentId] ?? 0) - 1);
                    const nextCounts = { ...counts };

                    if (nextCount > 0) {
                      nextCounts[pasteDocumentId] = nextCount;
                    } else {
                      delete nextCounts[pasteDocumentId];
                      if (activeDocumentIdRef.current === pasteDocumentId) {
                        delete pendingImagePasteDraftsRef.current[pasteDocumentId];
                      }
                    }

                    return nextCounts;
                  });
                });
            }
          }

          return true;
        },
      }),
    ],
    [canWrite, document?.id, pasteImageAttachmentAction, t],
  );
  const suggestions = useMemo(() => {
    if (!activeCompletion) return [];
    return getWikiLinkCompletionOptions(
      activeCompletion.query,
      linkCandidates.filter((candidate) => candidate.id !== document?.id),
    );
  }, [activeCompletion, document?.id, linkCandidates]);

  useEffect(() => {
    const pendingDraft = document?.id ? pendingImagePasteDraftsRef.current[document.id] : undefined;
    setTitle(document?.title ?? "");
    setContentMarkdown(document?.id ? (pendingDraft ?? document.contentMarkdown) : "");
    if (
      document?.id &&
      pendingDraft !== undefined &&
      (pendingImagePasteCountsRef.current[document.id] ?? 0) === 0
    ) {
      delete pendingImagePasteDraftsRef.current[document.id];
    }
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
      if (document?.id) {
        editorViewDocumentIdsRef.current.set(view, document.id);
      }
      restoreEditorFolds(view);
    },
    [document?.id, restoreEditorFolds],
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
  const hasUnsavedChanges = document
    ? title !== document.title || contentMarkdown !== document.contentMarkdown || hasPendingImagePaste
    : false;

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-white">
        <p className="text-sm text-slate-500">{t("editor.empty")}</p>
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
          toast.error(t("editor.imageUploadPending"));
        }}
      >
        <input type="hidden" name="documentId" value={document.id} />
        <input type="hidden" name="contentMarkdown" value={contentMarkdown} />
      </form>
      <div className="flex items-center gap-3">
        <input
          aria-label={t("editor.documentTitle")}
          form={`document-save-${document.id}`}
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={!canWrite}
          className="min-w-0 flex-1 border-0 bg-transparent px-0 py-1 text-[1.75rem] font-bold leading-tight text-ink outline-none placeholder:text-slate-400 focus:ring-0 disabled:cursor-not-allowed disabled:opacity-70"
        />
        <Button
          type="button"
          onClick={() => setIsAiAssistantOpen((isOpen) => !isOpen)}
          aria-expanded={isAiAssistantOpen}
          aria-label={t(isAiAssistantOpen ? "ai.assistant.close" : "ai.assistant.open")}
          className="h-8 shrink-0 px-2 text-xs"
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {t("ai.askSubmit")}
        </Button>
      </div>
      {isAiAssistantOpen ? (
        <AiAssistantPanel
          key={document.id}
          workspaceSlug={workspaceSlug}
          documentId={document.id}
          hasUnsavedChanges={hasUnsavedChanges}
          defaultChatModel={defaultChatModel}
          defaultChatProvider={defaultChatProvider}
        />
      ) : null}
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
          {t("editor.uploadAttachment")}
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
          {t("editor.upload")}
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
              aria-label={t("editor.markdownEditor")}
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
          {canWrite ? t("editor.markdownSavedOnSave") : t("editor.viewerReadOnly")}
        </p>
        <Button form={`document-save-${document.id}`} type="submit" disabled={!canWrite || hasPendingImagePaste}>
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("editor.save")}
        </Button>
      </div>
    </div>
  );
}
