export function AppShell({
  left,
  center,
  right,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <main className="grid h-dvh max-h-dvh min-h-0 grid-cols-[280px_minmax(0,1fr)_320px] overflow-hidden bg-white text-ink">
      <aside className="overflow-auto border-r border-border bg-muted px-4 pb-4 pt-0">{left}</aside>
      <section className="min-h-0 min-w-0 overflow-hidden bg-white">{center}</section>
      <aside className="overflow-auto border-l border-border bg-muted p-4">{right}</aside>
    </main>
  );
}
