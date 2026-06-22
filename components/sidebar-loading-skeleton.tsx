import { Skeleton } from "@/components/ui/skeleton";

type SidebarSide = "left" | "right";

export function WorkspaceSidebarLoadingSkeleton({ side }: { side: SidebarSide }) {
  if (side === "right") {
    return (
      <div
        aria-hidden="true"
        data-testid="right-sidebar-loading"
        className="space-y-4 pt-2"
      >
        <div data-testid="right-sidebar-loading-toolbar" className="flex h-11 items-center gap-1">
          <ToolbarIconSkeleton />
          <ToolbarIconSkeleton />
          <ToolbarIconSkeleton />
          <ToolbarIconSkeleton />
          <ToolbarIconSkeleton className="ml-auto" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-3 w-16 rounded-full" />
          {Array.from({ length: 5 }).map((_, index) => (
            <MetadataRowSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      data-testid="left-sidebar-loading"
    >
      <div className="sticky top-0 z-20 bg-muted pb-1">
        <div data-testid="left-sidebar-loading-chrome" className="flex h-11 items-center gap-2">
          <Skeleton className="h-3 w-36 rounded-full" />
          <Skeleton className="ml-auto h-8 w-8" />
        </div>
        <div
          data-testid="left-sidebar-loading-toolbar"
          className="mb-4 flex h-11 items-center justify-between"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <ToolbarIconSkeleton key={index} />
          ))}
        </div>
      </div>

      <div className="pt-3">
        <DocumentNavigationBodySkeleton />
      </div>
    </div>
  );
}

export function DocumentNavigationBodySkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="document-navigation-loading"
    >
      <section className="mb-4 space-y-2">
        <Skeleton className="h-3 w-16 rounded-full" />
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
      </section>

      <nav className="space-y-1">
        <Skeleton className="h-3 w-20 rounded-full" />
        <FolderRowSkeleton />
        <DocumentRowSkeleton />
        <FolderRowSkeleton />
        <DocumentRowSkeleton />
        <DocumentRowSkeleton />
        <FolderRowSkeleton />
      </nav>
    </div>
  );
}

export function CollapsedPanelLoadingSkeleton({ side }: { side: SidebarSide }) {
  return (
    <div
      aria-hidden="true"
      data-testid={`${side}-collapsed-panel-loading`}
      className={side === "left" ? "absolute left-4 top-1.5 z-30" : "absolute right-4 top-1.5"}
    >
      <Skeleton className="h-8 w-8 shadow-sm" />
    </div>
  );
}

function ToolbarIconSkeleton({ className }: { className?: string }) {
  return <Skeleton data-testid="sidebar-toolbar-icon-skeleton" className={`h-8 w-8 ${className ?? ""}`.trim()} />;
}

function DocumentRowSkeleton() {
  return (
    <div data-testid="document-row-skeleton" className="flex min-w-0 rounded-md px-2 py-1.5">
      <Skeleton data-testid="document-row-text-skeleton" className="h-[13px] w-full rounded-full" />
    </div>
  );
}

function FolderRowSkeleton() {
  return (
    <div
      data-testid="folder-row-skeleton"
      className="flex w-full items-center gap-1 rounded-md px-2 py-1.5"
    >
      <Skeleton
        data-testid="folder-row-icon-skeleton"
        className="h-4 w-4 shrink-0 rounded"
      />
      <Skeleton data-testid="folder-row-text-skeleton" className="h-[13px] w-full rounded-full" />
    </div>
  );
}

function MetadataRowSkeleton() {
  return (
    <div data-testid="metadata-row-skeleton" className="flex w-full min-w-0 rounded px-2 py-1">
      <Skeleton className="h-2.5 w-full rounded-full" />
    </div>
  );
}
