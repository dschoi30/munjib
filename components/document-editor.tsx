"use client";

import { markdown } from "@codemirror/lang-markdown";
import { foldEffect, foldedRanges } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import type { DocumentProperty, Tag } from "@prisma/client";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Paperclip,
  Save,
  Upload,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useHeadingNavigation, type HeadingNavigationTarget } from "@/components/app-shell";
import { useDocumentViewMode } from "@/components/document-view-mode";
import { Button } from "@/components/ui/button";
import {
  buildHeadingFoldTree,
  createHeadingFoldStorageValue,
  getValidFoldedHeadingKeys,
  parseHeadingFoldStorageValue,
  type HeadingFoldTree,
  type HeadingFoldSection,
} from "@/lib/markdown/folding";
import {
  buildWikiLinkPreviewCandidateMap,
  renderPreviewMarkdownWithWikiLinks,
} from "@/lib/wiki-links/preview";
import type { DocumentLinkPanels } from "@/lib/wiki-links/types";
import {
  getActiveWikiLinkCompletion,
  getWikiLinkCompletionOptions,
  type ActiveWikiLinkCompletion,
  type WikiLinkCompletionOption,
} from "@/lib/wiki-links/autocomplete";
import { visibleDocumentProperties } from "@/lib/document-metadata/display";
import { stripDocumentFrontmatter } from "@/lib/document-metadata/parser";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

type EditableDocument = {
  id: string;
  title: string;
  contentMarkdown: string;
};
type LinkCandidate = {
  id: string;
  slug: string;
  title: string;
  path: string;
};

export function DocumentEditor({
  document,
  canWrite,
  action,
  uploadAttachmentAction,
  linkCandidates,
  tags,
  properties,
  comments,
  linkPanels,
  createFromBrokenLinkAction,
  createCommentAction,
}: {
  document: EditableDocument | null;
  canWrite: boolean;
  action: (formData: FormData) => Promise<void>;
  uploadAttachmentAction: (formData: FormData) => Promise<void>;
  linkCandidates: LinkCandidate[];
  tags: Pick<Tag, "id" | "name">[];
  properties: Pick<DocumentProperty, "id" | "key" | "valueJson">[];
  comments: Array<{
    id: string;
    body: string;
    user: { name: string; email: string };
  }>;
  linkPanels: DocumentLinkPanels;
  createFromBrokenLinkAction: (formData: FormData) => Promise<void>;
  createCommentAction: (formData: FormData) => Promise<void>;
}) {
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
  const headingNavigation = useHeadingNavigation();
  const registerHeadingNavigator = headingNavigation?.setHeadingNavigator;
  editorFoldContextRef.current = editorFoldStorageKey ? { storageKey: editorFoldStorageKey } : null;
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
    ],
    [],
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

  function insertWikiLink(option: WikiLinkCompletionOption) {
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
      const previewTarget = getOutlineHeadingTarget(target.id);

      if (previewTarget) {
        previewTarget.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }

      const view = editorViewRef.current;

      if (!view || target.lineNumber < 1) {
        return;
      }

      try {
        const line = view.state.doc.line(target.lineNumber);

        view.dispatch({
          effects: EditorView.scrollIntoView(line.from, { y: "start" }),
        });
      } catch {
        // Ignore outline targets whose source line is no longer present.
      }
    };

    registerHeadingNavigator(() => navigateToHeading);
    return () => registerHeadingNavigator(null);
  }, [document?.id, registerHeadingNavigator]);
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
      <form id={`document-save-${document.id}`} action={action}>
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
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {canWrite ? "Markdown changes are saved when you press Save." : "Viewer access is read-only."}
        </p>
        <Button form={`document-save-${document.id}`} type="submit" disabled={!canWrite}>
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          Save
        </Button>
      </div>
    </div>
  );
}

function WikiLinkSuggestions({
  canWrite,
  suggestions,
  onSelect,
}: {
  canWrite: boolean;
  suggestions: WikiLinkCompletionOption[];
  onSelect: (option: WikiLinkCompletionOption) => void;
}) {
  if (!canWrite || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="absolute left-4 top-12 z-10 w-72 overflow-hidden rounded-md border border-border bg-white shadow-lg">
      <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Wiki links
      </div>
      {suggestions.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option)}
          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-muted"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MarkdownPreview({
  markdown,
  documentId,
  linkCandidates,
}: {
  markdown: string;
  documentId: string;
  linkCandidates: LinkCandidate[];
}) {
  const candidateBySlug = useMemo(
    () => buildWikiLinkPreviewCandidateMap(linkCandidates),
    [linkCandidates],
  );
  const markdownComponents = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const className = "text-violet-600 underline underline-offset-2 hover:text-violet-700";
        return href?.startsWith("?document=") ? (
          <Link href={href} className={className}>
            {children}
          </Link>
        ) : (
          <a href={href} className={className}>
            {children}
          </a>
        );
      },
    }),
    [],
  );
  const strippedMarkdown = useMemo(() => stripDocumentFrontmatter(markdown), [markdown]);
  const foldTree = useMemo(() => buildHeadingFoldTree(strippedMarkdown), [strippedMarkdown]);
  const leadingMarkdown = useMemo(() => getMarkdownBeforeFirstHeading(strippedMarkdown), [strippedMarkdown]);
  const sharedDefinitions = useMemo(() => getSharedMarkdownDefinitions(strippedMarkdown), [strippedMarkdown]);
  const storageKey = `munjib:heading-folds:${documentId}`;
  const [foldedKeys, setFoldedKeys] = useState<Set<string>>(() =>
    new Set(readStoredFoldedHeadingKeys(storageKey, foldTree.headingKeys)),
  );

  useEffect(() => {
    setFoldedKeys(new Set(readStoredFoldedHeadingKeys(storageKey, foldTree.headingKeys)));
  }, [storageKey, foldTree]);

  const toggleSection = useCallback(
    (key: string) => {
      setFoldedKeys((current) => {
        const next = new Set(current);

        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }

        const validKeySet = new Set(getValidFoldedHeadingKeys(next, foldTree.headingKeys));
        writeStoredFoldedHeadingKeys(storageKey, validKeySet);

        return validKeySet;
      });
    },
    [foldTree.headingKeys, storageKey],
  );

  return (
    <div className="markdown-preview min-w-0 p-5">
      {foldTree.sections.length > 0 ? (
        <>
          {leadingMarkdown.trim().length > 0 ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {renderPreviewChunk(leadingMarkdown, candidateBySlug, sharedDefinitions)}
            </ReactMarkdown>
          ) : null}
          {foldTree.sections.map((section) => (
            <MarkdownPreviewSection
              key={section.key}
              section={section}
              foldedKeys={foldedKeys}
              markdownComponents={markdownComponents}
              candidateBySlug={candidateBySlug}
              sharedDefinitions={sharedDefinitions}
              onToggle={toggleSection}
            />
          ))}
        </>
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {renderPreviewMarkdownWithWikiLinks(
            strippedMarkdown.trim().length > 0 ? strippedMarkdown : "_Nothing to preview._",
            candidateBySlug,
          )}
        </ReactMarkdown>
      )}
    </div>
  );
}

function MarkdownPreviewSection({
  section,
  foldedKeys,
  markdownComponents,
  candidateBySlug,
  sharedDefinitions,
  onToggle,
}: {
  section: HeadingFoldSection;
  foldedKeys: Set<string>;
  markdownComponents: Components;
  candidateBySlug: ReturnType<typeof buildWikiLinkPreviewCandidateMap>;
  sharedDefinitions: string;
  onToggle: (key: string) => void;
}) {
  const folded = foldedKeys.has(section.key);
  const headingLabel = markdownInlineToPlainText(section.title);
  const headingMarkdown = `${"#".repeat(section.level)} ${section.title}`;
  const previewHeadingMarkdown = renderPreviewChunk(headingMarkdown, candidateBySlug, sharedDefinitions);
  const previewBodyMarkdown = renderPreviewChunk(section.bodyMarkdown, candidateBySlug, sharedDefinitions);

  return (
    <section
      data-outline-heading-id={section.key}
      className={getPreviewHeadingSectionClassName(section.level)}
    >
      <div className="group relative">
        <button
          type="button"
          aria-expanded={!folded}
          aria-label={`${folded ? "Expand" : "Collapse"} section ${headingLabel}`}
          onClick={() => onToggle(section.key)}
          className={
            folded
              ? "absolute right-full top-1 mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:text-ink focus:outline-none"
              : "absolute right-full top-1 mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 opacity-0 hover:text-ink focus:opacity-100 focus:outline-none group-hover:opacity-100 group-focus-within:opacity-100"
          }
        >
          {folded ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {previewHeadingMarkdown}
        </ReactMarkdown>
      </div>
      {folded ? null : (
        <>
          {section.bodyMarkdown.trim().length > 0 ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {previewBodyMarkdown}
            </ReactMarkdown>
          ) : null}
          {section.children.map((child) => (
            <MarkdownPreviewSection
              key={child.key}
              section={child}
              foldedKeys={foldedKeys}
              markdownComponents={markdownComponents}
              candidateBySlug={candidateBySlug}
              sharedDefinitions={sharedDefinitions}
              onToggle={onToggle}
            />
          ))}
        </>
      )}
    </section>
  );
}

function getPreviewHeadingSectionClassName(level: number) {
  if (level <= 1) {
    return "mt-8 first:mt-0";
  }

  if (level === 2) {
    return "mt-6";
  }

  if (level === 3) {
    return "mt-4";
  }

  return "mt-3";
}

function getOutlineHeadingTarget(id: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.document.querySelector<HTMLElement>(
    `[data-outline-heading-id="${escapeAttributeSelectorValue(id)}"]`,
  );
}

function escapeAttributeSelectorValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function readStoredFoldedHeadingKeys(storageKey: string, validKeys: Set<string>) {
  try {
    return getValidFoldedHeadingKeys(
      parseHeadingFoldStorageValue(window.localStorage.getItem(storageKey)),
      validKeys,
    );
  } catch {
    return [];
  }
}

function writeStoredFoldedHeadingKeys(storageKey: string, foldedKeys: Set<string>) {
  try {
    window.localStorage.setItem(storageKey, createHeadingFoldStorageValue(foldedKeys));
  } catch {
    // Folding remains usable in memory when browser storage is unavailable.
  }
}

function persistEditorFoldState(view: EditorView, storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  const foldTree = buildHeadingFoldTree(view.state.doc.toString());
  const foldedKeys = getEditorFoldedHeadingKeys(view, foldTree);

  if (!foldedKeys) {
    return;
  }

  writeStoredFoldedHeadingKeys(storageKey, foldedKeys);
}

function getEditorFoldedHeadingKeys(view: EditorView, foldTree: HeadingFoldTree) {
  const sectionKeyByEditorRange = new Map<string, string>();

  for (const section of foldTree.sectionByKey.values()) {
    const editorRange = section.editorRange;

    if (editorRange && editorRange.fromLine <= editorRange.toLine) {
      const headingLine = editorRange.fromLine - 1;

      sectionKeyByEditorRange.set(
        createEditorRangeKey(editorRange.fromLine, editorRange.toLine),
        section.key,
      );

      if (headingLine >= 1 && headingLine <= editorRange.toLine) {
        sectionKeyByEditorRange.set(createEditorRangeKey(headingLine, editorRange.toLine), section.key);
      }
    }
  }

  try {
    const foldedKeys = new Set<string>();

    foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
      try {
        const fromLine = view.state.doc.lineAt(from).number;
        const toLine = view.state.doc.lineAt(to).number;
        const sectionKey = sectionKeyByEditorRange.get(createEditorRangeKey(fromLine, toLine));

        if (sectionKey) {
          foldedKeys.add(sectionKey);
        }
      } catch {
        // Ignore a range that cannot be mapped back to a document line.
      }
    });

    return new Set(getValidFoldedHeadingKeys(foldedKeys, foldTree.headingKeys));
  } catch {
    return null;
  }
}

function createEditorRangeKey(fromLine: number, toLine: number) {
  return `${fromLine}:${toLine}`;
}

function markdownInlineToPlainText(markdown: string) {
  return markdown
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias: string | undefined) =>
      alias ?? target,
    )
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
    .trim();
}

function getMarkdownBeforeFirstHeading(markdown: string) {
  let inFence: { marker: "`" | "~"; length: number } | null = null;

  for (const line of tokenizeMarkdownLines(markdown)) {
    inFence = getNextFenceState(line.content, inFence);

    if (!inFence && /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line.content)) {
      return markdown.slice(0, line.startOffset);
    }
  }

  return markdown;
}

function getSharedMarkdownDefinitions(markdown: string) {
  const definitions: string[] = [];
  let inFence: { marker: "`" | "~"; length: number } | null = null;

  const lines = tokenizeMarkdownLines(markdown);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].content;

    if (inFence) {
      inFence = getNextFenceState(line, inFence);
      continue;
    }

    const nextFenceState = getNextFenceState(line, inFence);
    if (nextFenceState) {
      inFence = nextFenceState;
      continue;
    }

    if (isMarkdownDefinitionLine(line)) {
      definitions.push(line);

      for (index += 1; index < lines.length; index += 1) {
        const continuationLine = lines[index].content;

        if (!isMarkdownDefinitionContinuationLine(continuationLine)) {
          index -= 1;
          break;
        }

        definitions.push(continuationLine);
      }
    }
  }

  return definitions.join("\n");
}

function tokenizeMarkdownLines(markdown: string) {
  const lines: Array<{ content: string; startOffset: number }> = [];
  let startOffset = 0;

  for (let index = 0; index <= markdown.length; index += 1) {
    if (index !== markdown.length && markdown[index] !== "\n") {
      continue;
    }

    const hasNewline = index < markdown.length;
    const rawContent = markdown.slice(startOffset, index);

    if (rawContent.length > 0 || hasNewline || markdown.length === 0) {
      lines.push({
        content: rawContent.endsWith("\r") ? rawContent.slice(0, -1) : rawContent,
        startOffset,
      });
    }

    startOffset = index + 1;
  }

  return lines;
}

function getNextFenceState(
  content: string,
  inFence: { marker: "`" | "~"; length: number } | null,
) {
  if (inFence) {
    const closingFence = content.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);

    if (!closingFence) {
      return inFence;
    }

    const marker = closingFence[1][0] as "`" | "~";
    const length = closingFence[1].length;

    return inFence.marker === marker && length >= inFence.length ? null : inFence;
  }

  const openingFence = content.match(/^ {0,3}(`{3,}|~{3,})/);

  return openingFence
    ? {
        marker: openingFence[1][0] as "`" | "~",
        length: openingFence[1].length,
      }
    : null;
}

function renderPreviewChunk(
  markdown: string,
  candidateBySlug: ReturnType<typeof buildWikiLinkPreviewCandidateMap>,
  sharedDefinitions: string,
) {
  const markdownWithDefinitions = sharedDefinitions ? `${markdown}\n\n${sharedDefinitions}` : markdown;

  return renderPreviewMarkdownWithWikiLinks(markdownWithDefinitions, candidateBySlug);
}

function isMarkdownDefinitionLine(line: string) {
  return /^ {0,3}\[(?:\^[^\]\n]+|[^\]\n]+)\]:[ \t]*(?:\S.*)?$/.test(line);
}

function isMarkdownDefinitionContinuationLine(line: string) {
  return line.trim().length === 0 || /^[ \t]/.test(line);
}

function DocumentProperties({
  document,
  tags,
  properties,
  comments,
  linkPanels,
  canWrite,
  createFromBrokenLinkAction,
  createCommentAction,
}: {
  document: EditableDocument;
  tags: Pick<Tag, "id" | "name">[];
  properties: Pick<DocumentProperty, "id" | "key" | "valueJson">[];
  comments: Array<{
    id: string;
    body: string;
    user: { name: string; email: string };
  }>;
  linkPanels: DocumentLinkPanels;
  canWrite: boolean;
  createFromBrokenLinkAction: (formData: FormData) => Promise<void>;
  createCommentAction: (formData: FormData) => Promise<void>;
}) {
  const linkedItems = linkPanels.outgoing.map((link) => ({
    id: `outgoing-${link.id}`,
    label: link.targetTitleRaw,
    href: link.targetDocument ? `?document=${link.targetDocument.id}` : null,
    linkId: link.id,
    broken: link.isBroken,
  }));
  const visibleProperties = visibleDocumentProperties(properties);
  const hasFrontmatterTags = properties.some((property) => property.key === "tags");
  const hasFrontmatterLinks = properties.some((property) => property.key === "links");

  return (
    <section aria-label="Document properties" className="space-y-3 py-2">
      <h2 className="text-lg font-semibold">Properties</h2>
      <div className="space-y-2 text-sm">
        {!hasFrontmatterTags ? <TagsPropertyRow tags={tags} /> : null}
        {!hasFrontmatterLinks && linkedItems.length > 0 ? (
          <LinksPropertyRow
            linkedItems={linkedItems}
            canWrite={canWrite}
            createFromBrokenLinkAction={createFromBrokenLinkAction}
          />
        ) : null}
        {properties.map((property) => {
          if (property.key === "tags") {
            return <TagsPropertyRow key={property.id} tags={tags} />;
          }
          if (property.key === "links") {
            return (
              <LinksPropertyRow
                key={property.id}
                linkedItems={linkedItems}
                canWrite={canWrite}
                createFromBrokenLinkAction={createFromBrokenLinkAction}
              />
            );
          }
          return (
            <PropertyRow key={property.id} label={property.key}>
              <span className="break-words text-slate-700">{String(property.valueJson)}</span>
            </PropertyRow>
          );
        })}
        {visibleProperties.length === 0 && !hasFrontmatterTags && linkedItems.length === 0 ? (
          <PropertyRow label="frontmatter">
            <span className="text-slate-400">none</span>
          </PropertyRow>
        ) : null}
        <PropertyRow label="comments">
          <div className="flex min-w-0 flex-1 flex-col items-stretch gap-2">
            {comments.length === 0 ? <span className="text-slate-400">none</span> : null}
            {comments.map((comment) => (
              <span
                key={comment.id}
                className="inline-flex max-w-full items-start gap-1 rounded-md bg-slate-100 px-2.5 py-1.5 text-slate-600"
              >
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  {comment.user.name}: {comment.body}
                </span>
              </span>
            ))}
            <form action={createCommentAction} className="flex min-w-[220px] items-center gap-2">
              <input type="hidden" name="documentId" value={document.id} />
              <label className="sr-only" htmlFor={`comment-body-${document.id}`}>
                Add comment
              </label>
              <input
                id={`comment-body-${document.id}`}
                name="body"
                disabled={!canWrite}
                placeholder="Add comment"
                className="h-8 min-w-0 flex-1 rounded-md border border-border px-2 text-sm outline-none focus:border-ink"
              />
              <Button type="submit" disabled={!canWrite} className="h-8 px-2 text-xs">
                Comment
              </Button>
            </form>
          </div>
        </PropertyRow>
      </div>
    </section>
  );
}

function TagsPropertyRow({ tags }: { tags: Pick<Tag, "id" | "name">[] }) {
  return (
    <PropertyRow label="tags">
      {tags.length === 0 ? <span className="text-slate-400">none</span> : null}
      {tags.map((tag) => (
        <span key={tag.id} className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-600">
          #{tag.name}
        </span>
      ))}
    </PropertyRow>
  );
}

function LinksPropertyRow({
  linkedItems,
  canWrite,
  createFromBrokenLinkAction,
}: {
  linkedItems: Array<{
    id: string;
    label: string;
    href: string | null;
    linkId: string;
    broken: boolean;
  }>;
  canWrite: boolean;
  createFromBrokenLinkAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <PropertyRow label="links">
      {linkedItems.length === 0 ? <span className="text-slate-400">none</span> : null}
      {linkedItems.map((item) =>
        item.broken ? (
          <form key={item.id} action={createFromBrokenLinkAction} className="inline-flex">
            <input type="hidden" name="linkId" value={item.linkId} />
            <button
              type="submit"
              disabled={!canWrite}
              className="rounded-full px-1 text-slate-400 underline decoration-slate-300 underline-offset-2 hover:text-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              title="Create document from broken link"
            >
              {item.label}
            </button>
          </form>
        ) : item.href ? (
          <Link
            key={item.id}
            href={item.href}
            className="rounded-full px-1 text-violet-600 underline underline-offset-2 hover:text-violet-700"
          >
            {item.label}
          </Link>
        ) : (
          <span key={item.id} className="text-slate-400">
            {item.label}
          </span>
        ),
      )}
    </PropertyRow>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-4">
      <div className="flex items-center gap-2 text-slate-500">
        <span className="font-mono text-xs leading-none text-slate-400">::</span>
        <span>{label}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">{children}</div>
    </div>
  );
}
