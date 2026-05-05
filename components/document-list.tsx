import { DocumentNavigation } from "@/components/document-navigation";
import { Button } from "@/components/ui/button";
import { FilePlus2, FolderPlus } from "lucide-react";

export type DocumentListItem = {
  id: string;
  folderId: string | null;
  title: string;
  path: string;
  contentText: string;
};

export type FolderListItem = {
  id: string;
  parentFolderId: string | null;
  name: string;
  path: string;
};

export function DocumentList({
  workspaceSlug,
  folders,
  documents,
  canWrite,
  createAction,
  createFolderAction,
  selectedFolderId,
  searchQuery,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  createFolderAction: (formData: FormData) => Promise<void>;
  selectedFolderId: string | null;
  searchQuery: string;
}) {
  return (
    <div>
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Workspace</p>
        <h1 className="text-lg font-semibold">Company Handbook</h1>
      </div>
      <div className="mb-4 space-y-2">
        <form action={createAction} className="space-y-2">
          <input type="hidden" name="folderId" value={selectedFolderId ?? ""} />
          <select
            name="template"
            disabled={!canWrite}
            className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-ink"
            defaultValue="blank"
          >
            <option value="blank">Blank document</option>
            <option value="runbook">Runbook template</option>
            <option value="policy">Policy template</option>
          </select>
          <Button type="submit" disabled={!canWrite} className="w-full">
            <FilePlus2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            New document
          </Button>
        </form>
        <form action={createFolderAction}>
          <input type="hidden" name="parentFolderId" value={selectedFolderId ?? ""} />
          <Button
            type="submit"
            disabled={!canWrite}
            className="w-full bg-white text-ink ring-1 ring-border hover:bg-muted"
          >
            <FolderPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            New folder
          </Button>
        </form>
      </div>
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
        folders={folders}
        documents={documents}
        selectedFolderId={selectedFolderId}
        searchQuery={searchQuery}
      />
    </div>
  );
}
