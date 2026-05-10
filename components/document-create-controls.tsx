import { FilePlus2, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DocumentCreateControls({
  selectedFolderId,
  canWrite,
  createAction,
  createFolderAction,
}: {
  selectedFolderId: string | null;
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  createFolderAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="mb-4 space-y-2">
      <form action={createAction} className="space-y-2">
        <input type="hidden" name="folderId" value={selectedFolderId ?? ""} />
        <select
          name="template"
          disabled={!canWrite}
          className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-ink disabled:cursor-not-allowed disabled:opacity-60"
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
  );
}
