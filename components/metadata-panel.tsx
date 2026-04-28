import type { Attachment, AuditLog, DocumentProperty, DocumentVersion, Tag } from "@prisma/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { DocumentLinkPanels } from "@/lib/wiki-links/types";

export function MetadataPanel({
  currentDocument,
  versions,
  auditLogs,
  tags,
  properties,
  attachments,
  linkPanels,
  canWrite,
  createFromBrokenLinkAction,
  restoreVersionAction,
}: {
  currentDocument: { id: string; title: string } | null;
  versions: DocumentVersion[];
  auditLogs: AuditLog[];
  tags: Tag[];
  properties: DocumentProperty[];
  attachments: Attachment[];
  linkPanels: DocumentLinkPanels;
  canWrite: boolean;
  createFromBrokenLinkAction: (formData: FormData) => Promise<void>;
  restoreVersionAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold">Local graph</h2>
        <LocalGraph currentDocument={currentDocument} linkPanels={linkPanels} />
      </section>
      <section>
        <h2 className="text-sm font-semibold">Links</h2>
        <div className="mt-2 space-y-3 text-sm">
          <div>
            <p className="font-medium text-slate-700">Outgoing</p>
            <ul className="mt-1 space-y-1 text-slate-600">
              {linkPanels.outgoing.length === 0 ? <li>No outgoing links</li> : null}
              {linkPanels.outgoing.map((link) => (
                <li key={link.id}>
                  {link.targetDocument ? (
                    <Link className="underline" href={`?document=${link.targetDocument.id}`}>
                      {link.targetTitleRaw}
                    </Link>
                  ) : (
                    <span>{link.targetTitleRaw}</span>
                  )}
                  {link.isBroken ? <span className="ml-1 text-red-600">broken</span> : null}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-700">Backlinks</p>
            <ul className="mt-1 space-y-1 text-slate-600">
              {linkPanels.backlinks.length === 0 ? <li>No backlinks</li> : null}
              {linkPanels.backlinks.map((backlink) => (
                <li key={backlink.id}>
                  <Link className="underline" href={`?document=${backlink.sourceDocument.id}`}>
                    {backlink.sourceDocument.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-700">Broken links</p>
            <ul className="mt-1 space-y-2 text-slate-600">
              {linkPanels.brokenLinks.length === 0 ? <li>No broken links</li> : null}
              {linkPanels.brokenLinks.map((link) => (
                <li key={link.id} className="flex items-center justify-between gap-2">
                  <span>{link.targetTitleRaw}</span>
                  <form action={createFromBrokenLinkAction}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <Button type="submit" disabled={!canWrite} className="px-2 py-1 text-xs">
                      Create
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold">Properties</h2>
        <div className="mt-2 space-y-3 text-sm">
          <div>
            <p className="font-medium text-slate-700">Tags</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.length === 0 ? <span className="text-slate-500">No tags</span> : null}
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded bg-muted px-2 py-1 text-xs font-medium text-slate-700"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="font-medium text-slate-700">Frontmatter</p>
            <dl className="mt-2 space-y-2">
              {properties.length === 0 ? (
                <div className="text-slate-500">No properties</div>
              ) : null}
              {properties.map((property) => (
                <div key={property.id} className="rounded border border-border px-2 py-1.5">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {property.key}
                  </dt>
                  <dd className="mt-0.5 break-words text-slate-700">
                    {String(property.valueJson)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold">Attachments</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-600">
          {attachments.length === 0 ? <li>No attachments</li> : null}
          {attachments.map((attachment) => (
            <li key={attachment.id} className="rounded border border-border px-2 py-2">
              <Link className="font-medium underline" href={`/api/attachments/${attachment.id}`}>
                {attachment.fileName}
              </Link>
              <p className="mt-1 text-xs text-slate-500">
                {attachment.mimeType} · {formatBytes(attachment.size)}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-semibold">Versions</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-600">
          {versions.map((version) => (
            <li key={version.id} className="rounded border border-border px-2 py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-700">v{version.versionNumber}</p>
                  <p>{version.changeSummary}</p>
                  <p className="mt-1 text-xs text-slate-500">{version.title}</p>
                </div>
                <form action={restoreVersionAction}>
                  <input type="hidden" name="versionId" value={version.id} />
                  <Button type="submit" disabled={!canWrite} className="h-8 px-2 text-xs">
                    Restore
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-semibold">Audit log</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-600">
          {auditLogs.map((log) => (
            <li key={log.id}>{log.action}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function LocalGraph({
  currentDocument,
  linkPanels,
}: {
  currentDocument: { id: string; title: string } | null;
  linkPanels: DocumentLinkPanels;
}) {
  if (!currentDocument) {
    return <p className="mt-2 text-sm text-slate-500">No document selected.</p>;
  }

  const outgoingNodes = linkPanels.outgoing.slice(0, 4);
  const backlinkNodes = linkPanels.backlinks.slice(0, 4);
  const brokenNodes = linkPanels.brokenLinks.slice(0, 3);

  return (
    <div className="mt-2 rounded-md border border-border bg-white p-2">
      <svg viewBox="0 0 260 180" role="img" aria-label={`Local graph for ${currentDocument.title}`} className="h-44 w-full">
        <line x1="130" y1="90" x2="54" y2="44" stroke="#94a3b8" />
        <line x1="130" y1="90" x2="54" y2="90" stroke="#94a3b8" />
        <line x1="130" y1="90" x2="54" y2="136" stroke="#94a3b8" />
        <line x1="130" y1="90" x2="206" y2="44" stroke="#94a3b8" />
        <line x1="130" y1="90" x2="206" y2="90" stroke="#94a3b8" />
        <line x1="130" y1="90" x2="206" y2="136" stroke="#94a3b8" />
        {backlinkNodes.slice(0, 3).map((link, index) => (
          <GraphNode
            key={link.id}
            x={54}
            y={[44, 90, 136][index] ?? 44}
            label={link.sourceDocument.title}
            tone="incoming"
          />
        ))}
        {outgoingNodes.slice(0, 3).map((link, index) => (
          <GraphNode
            key={link.id}
            x={206}
            y={[44, 90, 136][index] ?? 44}
            label={link.targetTitleRaw}
            tone={link.isBroken ? "broken" : "outgoing"}
          />
        ))}
        {brokenNodes.length > outgoingNodes.filter((link) => link.isBroken).length ? (
          <GraphNode x={206} y={136} label="Broken" tone="broken" />
        ) : null}
        <GraphNode x={130} y={90} label={currentDocument.title} tone="current" />
      </svg>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
        <span>{backlinkNodes.length} backlinks</span>
        <span>{outgoingNodes.length} outgoing</span>
        <span>{brokenNodes.length} broken</span>
      </div>
    </div>
  );
}

function GraphNode({
  x,
  y,
  label,
  tone,
}: {
  x: number;
  y: number;
  label: string;
  tone: "current" | "incoming" | "outgoing" | "broken";
}) {
  const fill = {
    current: "#1c2230",
    incoming: "#dbeafe",
    outgoing: "#dcfce7",
    broken: "#fee2e2",
  }[tone];
  const stroke = tone === "current" ? "#1c2230" : "#94a3b8";
  const textColor = tone === "current" ? "#ffffff" : "#334155";

  return (
    <g>
      <circle cx={x} cy={y} r="20" fill={fill} stroke={stroke} />
      <text x={x} y={y + 34} textAnchor="middle" fill={textColor === "#ffffff" ? "#334155" : textColor} fontSize="9">
        {label.length > 16 ? `${label.slice(0, 15)}...` : label}
      </text>
    </g>
  );
}
