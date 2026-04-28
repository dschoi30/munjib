"use client";

import { markdown } from "@codemirror/lang-markdown";
import dynamic from "next/dynamic";
import { Columns2, Eye, Pencil, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

type EditorMode = "edit" | "split" | "preview";
type EditableDocument = {
  id: string;
  title: string;
  contentMarkdown: string;
};

export function DocumentEditor({
  document,
  canWrite,
  action,
}: {
  document: EditableDocument | null;
  canWrite: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const [mode, setMode] = useState<EditorMode>("split");
  const [title, setTitle] = useState(document?.title ?? "");
  const [contentMarkdown, setContentMarkdown] = useState(document?.contentMarkdown ?? "");
  const extensions = useMemo(() => [markdown()], []);

  useEffect(() => {
    setTitle(document?.title ?? "");
    setContentMarkdown(document?.contentMarkdown ?? "");
  }, [document?.id, document?.title, document?.contentMarkdown]);

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-white">
        <p className="text-sm text-slate-500">Create or select a document.</p>
      </div>
    );
  }

  return (
    <form key={document.id} action={action} className="mx-auto max-w-4xl space-y-4">
      <input type="hidden" name="documentId" value={document.id} />
      <input type="hidden" name="contentMarkdown" value={contentMarkdown} />
      <div className="flex flex-wrap items-center gap-3">
        <Input
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
      <div
        className={
          mode === "split"
            ? "grid min-h-[520px] grid-cols-2 overflow-hidden rounded-md border border-border bg-white"
            : "min-h-[520px] overflow-hidden rounded-md border border-border bg-white"
        }
      >
        {mode !== "preview" ? (
          <div className="min-w-0 border-r border-border">
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
              onChange={(value) => setContentMarkdown(value)}
              aria-label="Markdown editor"
            />
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
        <Button type="submit" disabled={!canWrite}>
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          Save
        </Button>
      </div>
    </form>
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
