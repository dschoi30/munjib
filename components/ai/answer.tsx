"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { workspaceDocumentHref } from "@/lib/workspace-routes";

export type AiCitation = {
  index?: number;
  documentId?: string;
  documentTitle?: string;
  title?: string;
  documentPath?: string;
  headingPath?: string | string[] | null;
};

type AiAnswerProps = {
  content: string;
  className?: string;
};

type AiCitationsProps = {
  citations?: AiCitation[] | null;
  workspaceSlug: string;
  className?: string;
};

const markdownComponents: Components = {
  p: ({ node: _node, className, ...props }) => (
    <p className={cn("leading-relaxed", className)} {...props} />
  ),
  ul: ({ node: _node, className, ...props }) => (
    <ul className={cn("list-disc space-y-1 pl-4", className)} {...props} />
  ),
  ol: ({ node: _node, className, ...props }) => (
    <ol className={cn("list-decimal space-y-1 pl-4", className)} {...props} />
  ),
  li: ({ node: _node, className, ...props }) => (
    <li className={cn("pl-1 leading-relaxed", className)} {...props} />
  ),
  strong: ({ node: _node, className, ...props }) => (
    <strong className={cn("font-semibold text-inherit", className)} {...props} />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code className={cn("rounded bg-slate-200 px-1 py-0.5 text-[0.92em]", className)} {...props} />
  ),
  a: ({ node: _node, className, href, ...props }) => (
    <a
      className={cn("font-medium text-violet-700 underline underline-offset-2", className)}
      href={href}
      rel="noreferrer"
      target={href?.startsWith("/") || href?.startsWith("#") ? undefined : "_blank"}
      {...props}
    />
  ),
};

export function AiAnswer({ content, className }: AiAnswerProps) {
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function AiCitations({ citations, workspaceSlug, className }: AiCitationsProps) {
  if (!citations?.length) return null;

  return (
    <ol className={cn("space-y-1", className)}>
      {citations.map((citation, index) => {
        const label = citationLabel(citation, index);
        const href = citation.documentId
          ? workspaceDocumentHref({ workspaceSlug, documentId: citation.documentId })
          : null;

        return (
          <li key={`${citation.documentId ?? citation.documentTitle ?? citation.title ?? "citation"}-${index}`}>
            {href ? (
              <Link className="underline underline-offset-2 hover:text-slate-700" href={href}>
                {label}
              </Link>
            ) : (
              label
            )}
          </li>
        );
      })}
    </ol>
  );
}

function citationLabel(citation: AiCitation, index: number) {
  return `[${citation.index ?? index + 1}] ${
    citation.documentTitle ?? citation.title ?? "Saved document"
  }${formatHeadingPath(citation.headingPath)}`;
}

function formatHeadingPath(headingPath: AiCitation["headingPath"]) {
  if (Array.isArray(headingPath)) {
    return headingPath.length > 0 ? ` > ${headingPath.join(" > ")}` : "";
  }

  return headingPath ? ` > ${headingPath}` : "";
}
