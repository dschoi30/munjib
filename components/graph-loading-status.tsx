"use client";

import { LoaderCircle } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export function GraphLoadingStatus() {
  const { t } = useI18n();
  return (
    <div role="status" className="flex items-center justify-center gap-2 p-4 text-sm text-ink-muted">
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
      {t("graph.loading")}
    </div>
  );
}
