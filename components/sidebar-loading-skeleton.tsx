import { Skeleton } from "@/components/ui/skeleton";

type SidebarSide = "left" | "right";

const leftRowWidths = ["w-28", "w-20", "w-24", "w-32", "w-24", "w-36", "w-28", "w-32", "w-24"];
const rightRowWidths = ["w-20", "w-32", "w-28", "w-36", "w-24"];
const bodyRowWidths = ["w-20", "w-32", "w-28", "w-36", "w-24", "w-32", "w-28", "w-36"];

export function WorkspaceSidebarLoadingSkeleton({ side }: { side: SidebarSide }) {
  if (side === "right") {
    return (
      <div
        aria-hidden="true"
        data-testid="right-sidebar-loading"
        className="space-y-4 pt-2"
      >
        <div className="flex h-11 items-center gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-8" />
          ))}
          <Skeleton className="ml-auto h-8 w-8" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-16 rounded-full" />
          {rightRowWidths.map((width, index) => (
            <SkeletonRow key={index} width={width} dot />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      data-testid="left-sidebar-loading"
      className="space-y-4 pt-2"
    >
      <div className="flex h-11 items-center gap-2">
        <Skeleton className="h-3 w-36 rounded-full" />
        <Skeleton className="ml-auto h-8 w-8" />
      </div>
      <div className="flex h-11 items-center justify-between">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-8" />
        ))}
      </div>
      <div className="space-y-2">
        {leftRowWidths.map((width, index) => (
          <SkeletonRow key={index} width={width} square={index > 2} />
        ))}
      </div>
    </div>
  );
}

export function DocumentNavigationBodySkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="document-navigation-loading"
      className="space-y-4"
    >
      <section className="space-y-2">
        <Skeleton className="h-3 w-16 rounded-full" />
        {bodyRowWidths.slice(0, 3).map((width, index) => (
          <SkeletonRow key={index} width={width} square />
        ))}
      </section>
      <section className="space-y-2">
        <Skeleton className="h-3 w-20 rounded-full" />
        {bodyRowWidths.map((width, index) => (
          <SkeletonRow key={index} width={width} square />
        ))}
      </section>
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

function SkeletonRow({
  width,
  dot = false,
  square = false,
}: {
  width: string;
  dot?: boolean;
  square?: boolean;
}) {
  return (
    <div data-testid="skeleton-row" className="flex items-center gap-2">
      {dot ? <Skeleton className="h-2.5 w-2.5 rounded-full" /> : null}
      {square ? <Skeleton className="h-4 w-4" /> : null}
      <Skeleton className={`h-2.5 rounded-full ${width}`} />
    </div>
  );
}
