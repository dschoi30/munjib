"use client";

import {
  Leaf11ExternalImageImportSlot,
  type ExternalMediaRequest,
} from "@/components/markdown/downstream/leaf11-external-image-import";

export type { ExternalMediaRequest } from "@/components/markdown/downstream/leaf11-external-image-import";

export function ExternalMediaInterstitial({
  request,
  onClose,
}: {
  request: ExternalMediaRequest | null;
  onClose: () => void;
}) {
  if (!request) return null;

  const confirm = () => {
    window.open(request.href, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="External destination confirmation">
      <p>{request.label}</p>
      <p>{request.originLabel}</p>
      <p>This destination is outside Munjib. Opening it may reveal your IP address.</p>
      <button type="button" onClick={confirm}>Open external destination</button>
      <Leaf11ExternalImageImportSlot request={request} onClose={onClose} />
      <button type="button" onClick={onClose}>Cancel</button>
    </div>
  );
}
