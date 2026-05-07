"use client";

import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

const DEFAULT_TOAST_DURATION_MS = 3000;

export function Toast({
  message,
  durationMs = DEFAULT_TOAST_DURATION_MS,
  className,
}: {
  message: string;
  durationMs?: number;
  className?: string;
}) {
  const [visibleMessage, setVisibleMessage] = useState(message);

  useEffect(() => {
    setVisibleMessage(message);
    if (!message) return;

    const timeoutId = window.setTimeout(() => setVisibleMessage(""), durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [durationMs, message]);

  if (!visibleMessage) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={twMerge(
        "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-lg",
        className,
      )}
    >
      {visibleMessage}
    </div>
  );
}
