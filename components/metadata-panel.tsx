import type { AuditLog, DocumentVersion } from "@prisma/client";

export function MetadataPanel({
  versions,
  auditLogs,
}: {
  versions: DocumentVersion[];
  auditLogs: AuditLog[];
}) {
  return (
    <div className="space-y-6">
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
