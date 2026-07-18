"use client";

import { useEffect, useRef } from "react";
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

  return <ExternalMediaDialog request={request} onClose={onClose} />;
}

function ExternalMediaDialog({
  request,
  onClose,
}: {
  request: ExternalMediaRequest;
  onClose: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const confirm = () => {
    window.open(request.href, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="external-media-dialog-title"
      aria-describedby="external-media-dialog-description"
    >
      <h2 id="external-media-dialog-title">External destination confirmation</h2>
      <p>{request.label}</p>
      <p>{request.originLabel}</p>
      <p id="external-media-dialog-description">
        This destination is outside Munjib. Opening it may reveal your IP address.
      </p>
      <button type="button" onClick={confirm}>Open external destination</button>
      <Leaf11ExternalImageImportSlot request={request} onClose={onClose} />
      <button ref={cancelButtonRef} type="button" onClick={onClose}>Cancel</button>
    </div>
  );
}
