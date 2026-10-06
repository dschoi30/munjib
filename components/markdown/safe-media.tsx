import { isValidElement, type ReactNode } from "react";
import type { Components } from "react-markdown";
import {
  prepareLeaf11ExternalMediaRequest,
  type ExternalMediaRequest,
} from "@/components/markdown/downstream/leaf11-external-image-import";
import {
  classifyMarkdownImageSource,
  safeMarkdownLinkHref,
} from "@/lib/markdown/media-policy";

type BuildSafeMarkdownComponentsInput = {
  allowedAttachmentIds: ReadonlySet<string>;
  trialAttachments?: boolean;
  components?: Components;
  onExternalMediaRequest: (request: ExternalMediaRequest) => void;
};

export function buildSafeMarkdownComponents({
  allowedAttachmentIds,
  trialAttachments = false,
  components = {},
  onExternalMediaRequest,
}: BuildSafeMarkdownComponentsInput): Components {
  return {
    ...components,
    a: ({ node, href, children, ...props }) => {
      const safeHref = safeMarkdownLinkHref(href);
      if (!safeHref) return <span>{children}</span>;

      const external = safeHref.startsWith("http://") || safeHref.startsWith("https://");
      if (external) {
        const originLabel = new URL(safeHref).origin;
        const label =
          extractTextContent(children).trim() || extractImageAlt(node) || "External destination";
        const renderedChildren =
          containsInteractiveChild(children) || containsImageNode(node) ? label : children;
        return (
          <button
            type="button"
            className="external-destination-button font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
            onClick={() => onExternalMediaRequest(prepareLeaf11ExternalMediaRequest({
              kind: "link",
              href: safeHref,
              originLabel,
              label,
            }))}
          >
            {renderedChildren} · {originLabel}
          </button>
        );
      }

      let internalHref = href?.startsWith("?") ? href : safeHref;
      const attachmentId = /^\/api\/attachments\/([A-Za-z0-9_-]+)$/.exec(internalHref ?? "")?.[1];
      if (trialAttachments && attachmentId) {
        if (!allowedAttachmentIds.has(attachmentId)) return <span>{children}</span>;
        internalHref = `/api/trial/attachments/${attachmentId}`;
      }
      return (
        <a
          {...props}
          className="text-primary underline underline-offset-2 hover:text-primary-hover focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-visible)]"
          href={internalHref}
        >
          {children}
        </a>
      );
    },
    img: ({ node: _node, src, alt, ...props }) => {
      const decision = classifyMarkdownImageSource(
        typeof src === "string" ? src : undefined,
        allowedAttachmentIds,
      );

      if (decision.kind === "attachment") {
        return <img {...props} src={trialAttachments ? `/api/trial/attachments/${decision.attachmentId}` : decision.src} alt={alt ?? ""} />;
      }

      if (decision.kind === "external") {
        const label = alt || "External media";
        return (
          <button
            type="button"
            className="external-media-card"
            onClick={() => onExternalMediaRequest(prepareLeaf11ExternalMediaRequest({
              kind: "image",
              href: decision.href,
              originLabel: decision.originLabel,
              label,
            }))}
          >
            {label} · {decision.originLabel}
          </button>
        );
      }

      return alt ? <span>{alt}</span> : null;
    },
  };
}

function extractTextContent(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractTextContent).join("");
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return extractTextContent(children.props.children);
  }
  return "";
}

function containsInteractiveChild(children: ReactNode): boolean {
  if (Array.isArray(children)) return children.some(containsInteractiveChild);
  if (!isValidElement<{ children?: ReactNode }>(children)) return false;
  if (children.type === "button" || children.type === "a") return true;
  return containsInteractiveChild(children.props.children);
}

function containsImageNode(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const candidate = node as { tagName?: unknown; children?: unknown };
  if (candidate.tagName === "img") return true;
  return Array.isArray(candidate.children) && candidate.children.some(containsImageNode);
}

function extractImageAlt(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const candidate = node as {
    tagName?: unknown;
    properties?: { alt?: unknown };
    children?: unknown;
  };
  if (candidate.tagName === "img" && typeof candidate.properties?.alt === "string") {
    return candidate.properties.alt.trim();
  }
  if (!Array.isArray(candidate.children)) return "";
  return candidate.children.map(extractImageAlt).find(Boolean) ?? "";
}
