"use client";

import Link from "next/link";
import type { DocumentProperty, Tag } from "@prisma/client";
import { MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { useTagSearch } from "@/components/app-shell";
import type { EditableDocument, CommentItem } from "@/components/document-editor/types";
import { Button } from "@/components/ui/button";
import type { DocumentLinkPanels } from "@/lib/wiki-links/types";

export function DocumentProperties({
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
  comments: CommentItem[];
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
  const hasFrontmatterLinks = properties.some((property) => property.key === "links");

  return (
    <section aria-label="Document properties" className="space-y-3 py-2">
      <h2 className="text-lg font-semibold">Properties</h2>
      <div className="space-y-2 text-sm">
        {!hasFrontmatterLinks && linkedItems.length > 0 ? (
          <LinksPropertyRow
            linkedItems={linkedItems}
            canWrite={canWrite}
            createFromBrokenLinkAction={createFromBrokenLinkAction}
          />
        ) : null}
        {properties.map((property) => {
          if (property.key === "tags") {
            return <TagsPropertyRow key={property.id} tags={propertyTags(property.valueJson)} />;
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
              <span className="break-words text-slate-700">
                {formatPropertyValue(property.valueJson)}
              </span>
            </PropertyRow>
          );
        })}
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

function TagsPropertyRow({ tags }: { tags: string[] }) {
  const tagSearch = useTagSearch();

  return (
    <PropertyRow label="tags">
      {tags.length === 0 ? <span className="text-slate-400">none</span> : null}
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => tagSearch?.requestTagSearch(tag)}
          className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-600 hover:bg-violet-100 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
          aria-label={`Search tag #${tag}`}
        >
          #{tag}
        </button>
      ))}
    </PropertyRow>
  );
}

function propertyTags(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((tag) => tag.replace(/^#/, "").trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap(propertyTags);
  }

  return [];
}

function formatPropertyValue(value: unknown) {
  if (value === null || typeof value === "undefined") {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
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

function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
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
