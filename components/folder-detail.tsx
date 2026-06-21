"use client";

import { useI18n } from "@/components/i18n-provider";

export function FolderDetail({
  folder,
  canWrite,
}: {
  folder: { id: string; name: string; path: string; childCount: number } | null;
  canWrite: boolean;
}) {
  const { t } = useI18n();

  if (!folder) {
    return (
      <section className="flex h-full items-center justify-center text-sm text-slate-500">
        {t("folder.selectDocumentOrFolder")}
      </section>
    );
  }

  const itemCountMessage = t(
    folder.childCount === 1 ? "folder.itemCount.one" : "folder.itemCount.other",
    { count: folder.childCount },
  );

  return (
    <section className="p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("folder.label")}</p>
      <h2 className="mt-2 text-2xl font-semibold">{folder.name}</h2>
      <p className="mt-1 font-mono text-sm text-slate-500">{folder.path}</p>
      <p className="mt-4 text-sm text-slate-600">
        {folder.childCount === 0 ? t("folder.empty") : itemCountMessage}
      </p>
      {!canWrite ? <p className="mt-4 text-sm text-slate-500">{t("folder.readOnly")}</p> : null}
    </section>
  );
}
