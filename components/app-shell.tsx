"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type RightPanelControls = {
  collapse: () => void;
};

const RightPanelContext = createContext<RightPanelControls | null>(null);

export function useRightPanel() {
  return useContext(RightPanelContext);
}

export function AppShell({
  left,
  center,
  right,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode | ((controls: RightPanelControls) => React.ReactNode);
}) {
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const rightPanelControls = useMemo(
    () => ({
      collapse: () => setRightPanelOpen(false),
    }),
    [],
  );
  const rightContent =
    typeof right === "function" ? right(rightPanelControls) : right;

  return (
    <main
      className={
        rightPanelOpen
          ? "grid h-dvh max-h-dvh min-h-0 grid-cols-[280px_minmax(0,1fr)_320px] overflow-hidden bg-white text-ink"
          : "relative grid h-dvh max-h-dvh min-h-0 grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-white text-ink"
      }
    >
      <aside className="overflow-auto border-r border-border bg-muted px-4 pb-4 pt-0">{left}</aside>
      <section className="min-h-0 min-w-0 overflow-hidden bg-white">{center}</section>
      {rightPanelOpen ? (
        <aside className="overflow-auto border-l border-border bg-muted px-4 pb-4 pt-0">
          <RightPanelContext.Provider value={rightPanelControls}>
            {rightContent}
          </RightPanelContext.Provider>
        </aside>
      ) : (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                aria-label="Open metadata panel"
                onClick={() => setRightPanelOpen(true)}
                className="absolute right-2 top-14 h-8 w-8 bg-muted p-0 text-slate-600 shadow-sm hover:bg-slate-200 hover:text-ink"
              >
                <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open metadata panel</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </main>
  );
}
