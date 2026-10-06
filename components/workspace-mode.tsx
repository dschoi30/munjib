"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { WorkspaceMode } from "@/lib/workspace-routes";

const WorkspaceModeContext = createContext<WorkspaceMode>("authenticated");
export function WorkspaceModeProvider({ mode, children }: { mode: WorkspaceMode; children: ReactNode }) {
  return <WorkspaceModeContext.Provider value={mode}>{children}</WorkspaceModeContext.Provider>;
}
export function useWorkspaceMode() { return useContext(WorkspaceModeContext); }
