"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

export type DocumentViewMode = "edit" | "preview";

type DocumentViewModeContextValue = {
  mode: DocumentViewMode;
  setMode: (mode: DocumentViewMode) => void;
};

const DocumentViewModeContext = createContext<DocumentViewModeContextValue | null>(null);

export function DocumentViewModeProvider({
  children,
  mode: controlledMode,
  onModeChange,
}: {
  children: React.ReactNode;
  mode?: DocumentViewMode;
  onModeChange?: (mode: DocumentViewMode) => void;
}) {
  const [uncontrolledMode, setUncontrolledMode] = useState<DocumentViewMode>("preview");
  const mode = controlledMode ?? uncontrolledMode;
  const setMode = useCallback(
    (nextMode: DocumentViewMode) => {
      if (onModeChange) {
        onModeChange(nextMode);
        return;
      }

      setUncontrolledMode(nextMode);
    },
    [onModeChange],
  );

  return (
    <DocumentViewModeContext.Provider value={{ mode, setMode }}>
      {children}
    </DocumentViewModeContext.Provider>
  );
}

export function useDocumentViewMode() {
  const fallback = useState<DocumentViewMode>("preview");
  const context = useContext(DocumentViewModeContext);

  if (context) {
    return context;
  }

  return { mode: fallback[0], setMode: fallback[1] };
}
