"use client";

export type ExternalMediaRequest = {
  kind: "link" | "image";
  href: string;
  originLabel: string;
  label: string;
};

export const leaf11ExternalImageImportSlotVersion = 0 as const;

export function prepareLeaf11ExternalMediaRequest(
  request: ExternalMediaRequest,
): ExternalMediaRequest {
  return Object.freeze({ ...request });
}

export function Leaf11ExternalImageImportSlot(_props: {
  request: ExternalMediaRequest | null;
  onClose(): void;
}) {
  return null;
}
