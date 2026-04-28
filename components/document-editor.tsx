import type { Document } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function DocumentEditor({
  document,
  canWrite,
  action,
}: {
  document: Document | null;
  canWrite: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  if (!document) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-white">
        <p className="text-sm text-slate-500">Create or select a document.</p>
      </div>
    );
  }

  return (
    <form key={document.id} action={action} className="mx-auto max-w-4xl space-y-4">
      <input type="hidden" name="documentId" value={document.id} />
      <Input name="title" defaultValue={document.title} disabled={!canWrite} />
      <Textarea name="contentMarkdown" defaultValue={document.contentMarkdown} disabled={!canWrite} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Preview, backlinks, and graph panels are reserved for the next milestone.
        </p>
        <Button type="submit" disabled={!canWrite}>
          Save
        </Button>
      </div>
    </form>
  );
}
