import type { Document } from "@prisma/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DocumentList({
  workspaceSlug,
  documents,
  canWrite,
  createAction,
  searchQuery,
}: {
  workspaceSlug: string;
  documents: Document[];
  canWrite: boolean;
  createAction: () => Promise<void>;
  searchQuery: string;
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
      <form action={`/workspaces/${workspaceSlug}`} className="mb-4">
        <label className="sr-only" htmlFor="document-search">
          Search documents
        </label>
        <input
          id="document-search"
          name="q"
          type="search"
          defaultValue={searchQuery}
          placeholder="Search title or body"
          className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-ink"
        />
      </form>
      {searchQuery ? (
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Search results
        </p>
      ) : null}
      <nav className="space-y-1">
        {documents.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-slate-500">
            No documents found.
          </p>
        ) : null}
        {documents.map((document) => (
          <Link
            key={document.id}
            href={`/workspaces/${workspaceSlug}?document=${document.id}${
              searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""
            }`}
            className="block rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            {document.title}
            {searchQuery ? (
              <span className="mt-1 block truncate text-xs text-slate-500">
                {document.contentText || "Title match"}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
