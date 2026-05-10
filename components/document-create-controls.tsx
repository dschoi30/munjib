"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FilePlus2, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

type CreateDocumentResult = { documentId: string };
type CreateFolderResult = { folderId: string };

export function DocumentCreateControls({
  workspaceSlug,
  selectedFolderId,
  canWrite,
  createAction,
  createFolderAction,
}: {
  workspaceSlug: string;
  selectedFolderId: string | null;
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<CreateDocumentResult>;
  createFolderAction: (formData: FormData) => Promise<CreateFolderResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = !canWrite || isSubmitting || isPending;

  async function createDocument(formData: FormData) {
    setIsSubmitting(true);
    try {
      const result = await createAction(formData);
      startTransition(() => {
        router.push(`/workspaces/${workspaceSlug}?document=${result.documentId}`);
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createFolder(formData: FormData) {
    setIsSubmitting(true);
    try {
      const result = await createFolderAction(formData);
      startTransition(() => {
        router.push(`/workspaces/${workspaceSlug}?folder=${result.folderId}`);
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mb-4 space-y-2">
      <form action={createDocument} className="space-y-2">
        <input type="hidden" name="folderId" value={selectedFolderId ?? ""} />
        <select
          name="template"
          disabled={disabled}
          className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-ink disabled:cursor-not-allowed disabled:opacity-60"
          defaultValue="blank"
        >
          <option value="blank">Blank document</option>
          <option value="runbook">Runbook template</option>
          <option value="policy">Policy template</option>
        </select>
        <Button type="submit" disabled={disabled} className="w-full">
          <FilePlus2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
          New document
        </Button>
      </form>
      <form action={createFolder}>
        <input type="hidden" name="parentFolderId" value={selectedFolderId ?? ""} />
        <Button
          type="submit"
          disabled={disabled}
          className="w-full bg-white text-ink ring-1 ring-border hover:bg-muted"
        >
          <FolderPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          New folder
        </Button>
      </form>
    </div>
  );
}
