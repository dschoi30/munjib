import { DocumentNavigation } from "@/components/document-navigation";
import { Button } from "@/components/ui/button";

export type DocumentListItem = {
  id: string;
  title: string;
  contentText: string;
};

export function DocumentList({
  workspaceSlug,
  documents,
  canWrite,
  createAction,
  searchQuery,
}: {
  workspaceSlug: string;
  documents: DocumentListItem[];
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  searchQuery: string;
}) {
  return (
    <div>
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Workspace</p>
        <h1 className="text-lg font-semibold">Company Handbook</h1>
      </div>
      <form action={createAction}>
        <select
          name="template"
          disabled={!canWrite}
          className="mb-2 h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-ink"
          defaultValue="blank"
        >
          <option value="blank">Blank document</option>
          <option value="runbook">Runbook template</option>
          <option value="policy">Policy template</option>
        </select>
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
      <DocumentNavigation
        workspaceSlug={workspaceSlug}
        documents={documents}
        searchQuery={searchQuery}
      />
    </div>
  );
}
