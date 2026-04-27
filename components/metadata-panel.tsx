import type { AuditLog, DocumentVersion } from "@prisma/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { DocumentLinkPanels } from "@/lib/wiki-links/types";

export function MetadataPanel({
  versions,
  auditLogs,
  linkPanels,
  canWrite,
  createFromBrokenLinkAction,
}: {
  versions: DocumentVersion[];
  auditLogs: AuditLog[];
  linkPanels: DocumentLinkPanels;
  canWrite: boolean;
  createFromBrokenLinkAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
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
        <p className="mt-2 text-sm text-slate-500">
          Owner, status, and review fields will appear here.
        </p>
      </section>
      <section>
        <h2 className="text-sm font-semibold">Versions</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-600">
          {versions.map((version) => (
            <li key={version.id}>
              v{version.versionNumber}: {version.changeSummary}
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
