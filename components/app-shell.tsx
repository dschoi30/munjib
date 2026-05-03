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
    <main className="grid h-screen grid-cols-[280px_minmax(0,1fr)_320px] overflow-hidden bg-white text-ink">
      <aside className="overflow-auto border-r border-border bg-muted p-4">{left}</aside>
      <section className="min-w-0 overflow-auto bg-white p-5">{center}</section>
      <aside className="overflow-auto border-l border-border bg-muted p-4">{right}</aside>
    </main>
  );
}
