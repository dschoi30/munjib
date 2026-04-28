"use client";

import { markdown } from "@codemirror/lang-markdown";
import dynamic from "next/dynamic";
import { Columns2, Eye, Paperclip, Pencil, Save, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getActiveWikiLinkCompletion,
  type ActiveWikiLinkCompletion,
} from "@/lib/wiki-links/autocomplete";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

type EditorMode = "edit" | "split" | "preview";
type EditableDocument = {
  id: string;
  title: string;
  contentMarkdown: string;
};
type LinkCandidate = {
  id: string;
  title: string;
};

export function DocumentEditor({
  document,
  canWrite,
  action,
  uploadAttachmentAction,
  linkCandidates,
}: {
  document: EditableDocument | null;
  canWrite: boolean;
  action: (formData: FormData) => Promise<void>;
  uploadAttachmentAction: (formData: FormData) => Promise<void>;
  linkCandidates: LinkCandidate[];
}) {
  const [mode, setMode] = useState<EditorMode>("split");
  const [title, setTitle] = useState(document?.title ?? "");
  const [contentMarkdown, setContentMarkdown] = useState(document?.contentMarkdown ?? "");
  const [activeCompletion, setActiveCompletion] = useState<ActiveWikiLinkCompletion | null>(null);
  const extensions = useMemo(() => [markdown()], []);
  const suggestions = useMemo(() => {
    if (!activeCompletion) return [];
    const query = activeCompletion.query.toLowerCase();
    return linkCandidates
      .filter((candidate) => candidate.id !== document?.id)
      .filter((candidate) => candidate.title.toLowerCase().includes(query))
      .slice(0, 6);
  }, [activeCompletion, document?.id, linkCandidates]);

  useEffect(() => {
    setTitle(document?.title ?? "");
    setContentMarkdown(document?.contentMarkdown ?? "");
    setActiveCompletion(null);
  }, [document?.id, document?.title, document?.contentMarkdown]);

  function updateMarkdown(value: string, cursorPosition?: number) {
    setContentMarkdown(value);
    setActiveCompletion(
      typeof cursorPosition === "number" ? getActiveWikiLinkCompletion(value, cursorPosition) : null,
    );
  }

  function insertWikiLink(candidate: LinkCandidate) {
    if (!activeCompletion) return;
    const nextMarkdown = `${contentMarkdown.slice(0, activeCompletion.from)}[[${candidate.title}]]${contentMarkdown.slice(
      activeCompletion.to,
    )}`;
    updateMarkdown(nextMarkdown);
  }

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
      <div className="flex flex-wrap items-center gap-3">
        <Input
          form={`document-save-${document.id}`}
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={!canWrite}
          className="min-w-[240px] flex-1"
        />
        <div className="inline-flex rounded-md border border-border bg-white p-1">
          <ModeButton active={mode === "edit"} onClick={() => setMode("edit")}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            <span>Edit</span>
          </ModeButton>
          <ModeButton active={mode === "split"} onClick={() => setMode("split")}>
            <Columns2 className="h-4 w-4" aria-hidden="true" />
            <span>Split</span>
          </ModeButton>
          <ModeButton active={mode === "preview"} onClick={() => setMode("preview")}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            <span>Preview</span>
          </ModeButton>
        </div>
      </div>
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
      <div
        className={
          mode === "split"
            ? "grid min-h-[520px] grid-cols-2 overflow-hidden rounded-md border border-border bg-white"
            : "min-h-[520px] overflow-hidden rounded-md border border-border bg-white"
        }
      >
        {mode !== "preview" ? (
          <div className="relative min-w-0 border-r border-border">
            <CodeMirror
              value={contentMarkdown}
              height="520px"
              basicSetup={{
                foldGutter: false,
                highlightActiveLine: false,
                highlightActiveLineGutter: false,
              }}
              editable={canWrite}
              extensions={extensions}
              onChange={(value, viewUpdate) =>
                updateMarkdown(value, viewUpdate.state.selection.main.head)
              }
              aria-label="Markdown editor"
            />
            {canWrite && suggestions.length > 0 ? (
              <div className="absolute left-4 top-12 z-10 w-72 overflow-hidden rounded-md border border-border bg-white shadow-lg">
                <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Wiki links
                </div>
                {suggestions.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => insertWikiLink(candidate)}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-muted"
                  >
                    {candidate.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {mode !== "edit" ? (
          <MarkdownPreview markdown={contentMarkdown} />
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

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? "inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-medium text-ink shadow-sm"
          : "inline-flex h-8 items-center gap-2 rounded px-3 text-sm text-slate-600 hover:bg-muted"
      }
    >
      {children}
    </button>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="markdown-preview min-w-0 overflow-auto p-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown || "_Nothing to preview._"}</ReactMarkdown>
    </div>
  );
}
