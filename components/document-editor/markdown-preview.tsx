"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTagSearch } from "@/components/app-shell";
import {
  getMarkdownBeforeFirstHeading,
  getSharedMarkdownDefinitions,
  markdownInlineToPlainText,
  remarkPreviewSoftLineBreaks,
  renderPreviewChunk,
} from "@/components/document-editor/preview-markdown";
import type { LinkCandidate } from "@/components/document-editor/types";
import {
  readStoredFoldedHeadingKeys,
  writeStoredFoldedHeadingKeys,
} from "@/components/document-editor/folding-storage";
import { stripDocumentFrontmatter } from "@/lib/document-metadata/parser";
import {
  buildHeadingFoldTree,
  getValidFoldedHeadingKeys,
  type HeadingFoldSection,
} from "@/lib/markdown/folding";
import {
  buildWikiLinkPreviewCandidateMap,
  renderPreviewMarkdownWithWikiLinks,
} from "@/lib/wiki-links/preview";

const previewRemarkPlugins = [remarkGfm, remarkPreviewSoftLineBreaks];

export function MarkdownPreview({
  markdown,
  documentId,
  linkCandidates,
  registerHeadingExpander,
}: {
  markdown: string;
  documentId: string;
  linkCandidates: LinkCandidate[];
  registerHeadingExpander?: (expander: ((id: string) => void) | null) => void;
}) {
  const tagSearch = useTagSearch();
  const candidateBySlug = useMemo(
    () => buildWikiLinkPreviewCandidateMap(linkCandidates),
    [linkCandidates],
  );
  const markdownComponents = useMemo<Components>(
    () => ({
      p: ({ children }) => (
        <p>{renderTagSearchChildren(children, tagSearch?.requestTagSearch)}</p>
      ),
      li: ({ children }) => (
        <li>{renderTagSearchChildren(children, tagSearch?.requestTagSearch)}</li>
      ),
      h1: ({ children }) => (
        <h1>{renderTagSearchChildren(children, tagSearch?.requestTagSearch)}</h1>
      ),
      h2: ({ children }) => (
        <h2>{renderTagSearchChildren(children, tagSearch?.requestTagSearch)}</h2>
      ),
      h3: ({ children }) => (
        <h3>{renderTagSearchChildren(children, tagSearch?.requestTagSearch)}</h3>
      ),
      h4: ({ children }) => (
        <h4>{renderTagSearchChildren(children, tagSearch?.requestTagSearch)}</h4>
      ),
      h5: ({ children }) => (
        <h5>{renderTagSearchChildren(children, tagSearch?.requestTagSearch)}</h5>
      ),
      h6: ({ children }) => (
        <h6>{renderTagSearchChildren(children, tagSearch?.requestTagSearch)}</h6>
      ),
      blockquote: ({ children }) => (
        <blockquote>{renderTagSearchChildren(children, tagSearch?.requestTagSearch)}</blockquote>
      ),
      td: ({ children }) => (
        <td>{renderTagSearchChildren(children, tagSearch?.requestTagSearch)}</td>
      ),
      th: ({ children }) => (
        <th>{renderTagSearchChildren(children, tagSearch?.requestTagSearch)}</th>
      ),
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
    [tagSearch?.requestTagSearch],
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

  const unfoldHeadingAncestors = useCallback(
    (id: string) => {
      const ancestorIds = getAncestorOutlineHeadingIds(id);

      if (ancestorIds.length === 0) {
        return;
      }

      setFoldedKeys((current) => {
        const next = new Set(current);
        let changed = false;

        for (const ancestorId of ancestorIds) {
          if (next.delete(ancestorId)) {
            changed = true;
          }
        }

        if (!changed) {
          return current;
        }

        const validKeySet = new Set(getValidFoldedHeadingKeys(next, foldTree.headingKeys));
        writeStoredFoldedHeadingKeys(storageKey, validKeySet);

        return validKeySet;
      });
    },
    [foldTree.headingKeys, storageKey],
  );

  useEffect(() => {
    registerHeadingExpander?.(unfoldHeadingAncestors);
    return () => registerHeadingExpander?.(null);
  }, [registerHeadingExpander, unfoldHeadingAncestors]);

  return (
    <div className="markdown-preview min-w-0 p-5">
      {foldTree.sections.length > 0 ? (
        <>
          {leadingMarkdown.trim().length > 0 ? (
            <ReactMarkdown remarkPlugins={previewRemarkPlugins} components={markdownComponents}>
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
        <ReactMarkdown remarkPlugins={previewRemarkPlugins} components={markdownComponents}>
          {renderPreviewMarkdownWithWikiLinks(
            strippedMarkdown.trim().length > 0 ? strippedMarkdown : "_Nothing to preview._",
            candidateBySlug,
          )}
        </ReactMarkdown>
      )}
    </div>
  );
}

function getAncestorOutlineHeadingIds(id: string) {
  const parts = id.split("/");
  const ancestors: string[] = [];

  for (let index = 1; index < parts.length; index += 1) {
    ancestors.push(parts.slice(0, index).join("/"));
  }

  return ancestors;
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
        <ReactMarkdown remarkPlugins={previewRemarkPlugins} components={markdownComponents}>
          {previewHeadingMarkdown}
        </ReactMarkdown>
      </div>
      {folded ? null : (
        <>
          {section.bodyMarkdown.trim().length > 0 ? (
            <ReactMarkdown remarkPlugins={previewRemarkPlugins} components={markdownComponents}>
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

function renderTagSearchChildren(
  children: ReactNode,
  requestTagSearch?: (tagName: string) => void,
): ReactNode[] {
  return Children.toArray(children).flatMap((child, childIndex) => {
    if (typeof child === "string") {
      return renderTagSearchText(child, requestTagSearch, `tag-${childIndex}`);
    }

    if (typeof child === "number") {
      return child;
    }

    if (isValidElement(child)) {
      const childProps = child.props as { children?: ReactNode };
      if (!("children" in childProps)) {
        return child;
      }

      return cloneElement(
        child,
        undefined,
        renderTagSearchChildren(childProps.children, requestTagSearch),
      );
    }

    return child;
  });
}

function renderTagSearchText(
  text: string,
  requestTagSearch: ((tagName: string) => void) | undefined,
  keyPrefix: string,
): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(^|[\s([>])#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = match[1] ?? "";
    const tagName = match[2] ?? "";
    const tagStart = index + prefix.length;

    if (tagStart > lastIndex) {
      parts.push(text.slice(lastIndex, tagStart));
    }

    parts.push(
      <button
        key={`${keyPrefix}-${tagName}-${tagStart}`}
        type="button"
        onClick={() => requestTagSearch?.(tagName)}
        className="rounded px-0.5 text-violet-600 underline underline-offset-2 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
        aria-label={`Search tag #${tagName}`}
      >
        #{tagName}
      </button>,
    );
    lastIndex = tagStart + tagName.length + 1;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
