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
  components?: Components;
  onExternalMediaRequest: (request: ExternalMediaRequest) => void;
};

export function buildSafeMarkdownComponents({
  allowedAttachmentIds,
  components = {},
  onExternalMediaRequest,
}: BuildSafeMarkdownComponentsInput): Components {
  return {
    ...components,
    a: ({ node: _node, href, children, ...props }) => {
      const safeHref = safeMarkdownLinkHref(href);
      if (!safeHref) return <span>{children}</span>;

      const external = safeHref.startsWith("http://") || safeHref.startsWith("https://");
      if (external) {
        const originLabel = new URL(safeHref).origin;
        const label = extractTextContent(children).trim() || "External destination";
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
            {children} · {originLabel}
          </button>
        );
      }

      const internalHref = href?.startsWith("?") ? href : safeHref;
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
        return <img {...props} src={decision.src} alt={alt ?? ""} />;
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
