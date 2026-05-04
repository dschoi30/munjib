"use client";

import { markdown } from "@codemirror/lang-markdown";
import type { DocumentProperty, Tag } from "@prisma/client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Columns2, Eye, MessageSquare, Paperclip, Pencil, Save, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildWikiLinkPreviewCandidateMap,
  renderPreviewMarkdownWithWikiLinks,
} from "@/lib/wiki-links/preview";
import type { DocumentLinkPanels } from "@/lib/wiki-links/types";
import {
  getActiveWikiLinkCompletion,
  type ActiveWikiLinkCompletion,
} from "@/lib/wiki-links/autocomplete";
import { visibleDocumentProperties } from "@/lib/document-metadata/display";
import { stripDocumentFrontmatter } from "@/lib/document-metadata/parser";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

type EditorMode = "edit" | "split" | "preview";
type EditableDocument = {
  id: string;
  title: string;
  contentMarkdown: string;
};
type LinkCandidate = {
  id: string;
  slug: string;
  title: string;
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
      <div
        className={
          mode === "split"
            ? "grid grid-cols-2 overflow-hidden rounded-md border border-border bg-white"
            : "overflow-hidden rounded-md border border-border bg-white"
        }
      >
        {mode !== "preview" ? (
          <div className="relative min-w-0 border-r border-border">
            <CodeMirror
              value={contentMarkdown}
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
          <MarkdownPreview markdown={contentMarkdown} linkCandidates={linkCandidates} />
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

function MarkdownPreview({
  markdown,
  linkCandidates,
}: {
  markdown: string;
  linkCandidates: LinkCandidate[];
}) {
  const candidateBySlug = useMemo(
    () => buildWikiLinkPreviewCandidateMap(linkCandidates),
    [linkCandidates],
  );
  const markdownComponents = useMemo(
    () => ({
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
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
  const previewMarkdown = useMemo(
    () => renderPreviewMarkdownWithWikiLinks(stripDocumentFrontmatter(markdown), candidateBySlug),
    [markdown, candidateBySlug],
  );

  return (
    <div className="markdown-preview min-w-0 p-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {previewMarkdown || "_Nothing to preview._"}
      </ReactMarkdown>
    </div>
  );
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
