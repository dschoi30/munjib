"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { WorkspaceMode } from "@/lib/workspace-routes";

const WorkspaceModeContext = createContext<{mode: WorkspaceMode; applicationOrigin?: string}>({mode:"authenticated"});
export function WorkspaceModeProvider({ mode, applicationOrigin, children }: { mode: WorkspaceMode; applicationOrigin?: string; children: ReactNode }) {
  return <WorkspaceModeContext.Provider value={{mode, applicationOrigin}}>{children}</WorkspaceModeContext.Provider>;
}
export function useWorkspaceMode() { return useContext(WorkspaceModeContext).mode; }
export function useWorkspaceApplicationOrigin() { return useContext(WorkspaceModeContext).applicationOrigin; }
