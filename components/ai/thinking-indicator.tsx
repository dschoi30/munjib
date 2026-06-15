"use client";

import { useEffect, useState } from "react";

const THINKING_MESSAGES = [
  { delayMs: 0, message: "Thinking..." },
  { delayMs: 10_000, message: "Reviewing the relevant document context..." },
  { delayMs: 30_000, message: "Organizing the evidence and drafting an answer..." },
  { delayMs: 60_000, message: "This is taking longer than usual. Thanks for your patience..." },
] as const;

type ThinkingIndicatorProps = {
  active: boolean;
  className?: string;
};

export function useThinkingIndicator(active: boolean) {
  const [message, setMessage] = useState<string | null>(active ? THINKING_MESSAGES[0].message : null);

  useEffect(() => {
    if (!active) {
      setMessage(null);
      return;
    }

    setMessage(THINKING_MESSAGES[0].message);
    const timers = THINKING_MESSAGES.slice(1).map(({ delayMs, message }) =>
      window.setTimeout(() => {
        setMessage(message);
      }, delayMs),
    );

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [active]);

  return active ? message : null;
}

export function ThinkingIndicator({ active, className }: ThinkingIndicatorProps) {
  const message = useThinkingIndicator(active);

  if (!message) {
    return null;
  }

  return (
    <p aria-atomic="true" aria-live="polite" className={className} role="status">
      {message}
    </p>
  );
}
