export function FolderDetail({
  folder,
  canWrite,
}: {
  folder: { id: string; name: string; path: string; childCount: number } | null;
  canWrite: boolean;
}) {
  if (!folder) {
    return (
      <section className="flex h-full items-center justify-center text-sm text-slate-500">
        Select a document or folder.
      </section>
    );
  }

  return (
    <section className="p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Folder</p>
      <h2 className="mt-2 text-2xl font-semibold">{folder.name}</h2>
      <p className="mt-1 font-mono text-sm text-slate-500">{folder.path}</p>
      <p className="mt-4 text-sm text-slate-600">
        {folder.childCount === 0
          ? "This folder is empty."
          : `${folder.childCount} item${folder.childCount === 1 ? "" : "s"} in this folder.`}
      </p>
      {!canWrite ? <p className="mt-4 text-sm text-slate-500">You have read-only access.</p> : null}
    </section>
  );
}
