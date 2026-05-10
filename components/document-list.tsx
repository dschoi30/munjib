import { DocumentNavigation } from "@/components/document-navigation";
import { DocumentCreateControls } from "@/components/document-create-controls";

export type DocumentListItem = {
  id: string;
  folderId: string | null;
  title: string;
  path: string;
  contentText: string;
  canWrite: boolean;
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
  renameFolderAction,
  archiveFolderAction,
  archiveDocumentAction,
  folderError,
  selectedFolderId,
  selectedDocumentId,
  searchQuery,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  createFolderAction: (formData: FormData) => Promise<void>;
  renameFolderAction: (formData: FormData) => Promise<{ folderId: string; error?: string }>;
  archiveFolderAction: (formData: FormData) => Promise<{ folderId: string; error?: string }>;
  archiveDocumentAction: (formData: FormData) => Promise<{ documentId: string }>;
  folderError: string;
  selectedFolderId: string | null;
  selectedDocumentId: string | null;
  searchQuery: string;
}) {
  return (
    <div>
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Workspace</p>
        <h1 className="text-lg font-semibold">Company Handbook</h1>
      </div>
      <DocumentCreateControls
        selectedFolderId={selectedFolderId}
        canWrite={canWrite}
        createAction={createAction}
        createFolderAction={createFolderAction}
      />
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
        <p className="mb-2 text-[0.68rem] font-medium uppercase tracking-wide text-slate-500">
          Search results
        </p>
      ) : null}
      <DocumentNavigation
        workspaceSlug={workspaceSlug}
        folders={folders}
        documents={documents}
        selectedFolderId={selectedFolderId}
        searchQuery={searchQuery}
        canWrite={canWrite}
        createAction={createAction}
        renameFolderAction={renameFolderAction}
        archiveFolderAction={archiveFolderAction}
        archiveDocumentAction={archiveDocumentAction}
        folderError={folderError}
        selectedDocumentId={selectedDocumentId}
      />
    </div>
  );
}
