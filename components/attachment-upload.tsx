"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";
import { useRightPanel } from "@/components/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import type { DocumentEditorProps } from "@/components/document-editor/types";

export function AttachmentUpload({ documentId, canWrite, action }: {
  documentId: string;
  canWrite: boolean;
  action: DocumentEditorProps["uploadAttachmentAction"];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const panel = useRightPanel();
  const [hasFile, setHasFile] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const file = data.get("attachment");
      if (!canWrite || inFlight.current || !(file instanceof File) || !file.name || !file.size) return;
      inFlight.current = true;
      setPending(true);
      panel?.showAttachments(documentId, null);
      try {
        const result = await action(data);
        if (result && "error" in result) throw new Error(result.error);
        if (mounted.current) {
          form.reset();
          setHasFile(false);
          if (result && "attachmentId" in result) panel?.showAttachments(documentId, result.attachmentId);
          router.refresh();
        }
      } catch {
        if (mounted.current) toast.error(t("editor.uploadFailed"));
      } finally {
        inFlight.current = false;
        if (mounted.current) setPending(false);
      }
    }} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-control px-3 py-2">
      <input type="hidden" name="documentId" value={documentId} />
      <Paperclip className="h-4 w-4 text-slate-500" aria-hidden="true" />
      <label className="sr-only" htmlFor={`attachment-${documentId}`}>{t("editor.uploadAttachment")}</label>
      <input id={`attachment-${documentId}`} name="attachment" type="file" required disabled={!canWrite || pending}
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown"
        onChange={(event) => setHasFile(Boolean(event.currentTarget.files?.[0]?.size))}
        className="min-w-0 flex-1 text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink" />
      <Button type="submit" disabled={!canWrite || !hasFile || pending} aria-busy={pending} className="h-8 px-2 text-xs">
        <Upload className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{t("editor.upload")}
      </Button>
    </form>
  );
}
