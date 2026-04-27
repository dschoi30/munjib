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
    <main className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)_320px] bg-muted text-ink">
      <aside className="border-r border-border bg-white p-4">{left}</aside>
      <section className="min-w-0 p-5">{center}</section>
      <aside className="border-l border-border bg-white p-4">{right}</aside>
    </main>
  );
}
