import type { Document } from "@prisma/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DocumentList({
  workspaceSlug,
  documents,
  canWrite,
  createAction,
}: {
  workspaceSlug: string;
  documents: Document[];
  canWrite: boolean;
  createAction: () => Promise<void>;
}) {
  return (
    <div>
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Workspace</p>
        <h1 className="text-lg font-semibold">Company Handbook</h1>
      </div>
      <form action={createAction}>
        <Button type="submit" disabled={!canWrite} className="mb-4 w-full">
          New document
        </Button>
      </form>
      <nav className="space-y-1">
        {documents.map((document) => (
          <Link
            key={document.id}
            href={`/workspaces/${workspaceSlug}?document=${document.id}`}
            className="block rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            {document.title}
          </Link>
        ))}
      </nav>
    </div>
  );
}
