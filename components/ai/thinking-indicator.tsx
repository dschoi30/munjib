"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n/messages";

const THINKING_MESSAGES = [
  { delayMs: 0, messageKey: "ai.thinking.0" },
  { delayMs: 10_000, messageKey: "ai.thinking.10000" },
  { delayMs: 30_000, messageKey: "ai.thinking.30000" },
  { delayMs: 60_000, messageKey: "ai.thinking.60000" },
] as const;

type ThinkingIndicatorProps = {
  active: boolean;
  className?: string;
};

export function useThinkingIndicator(active: boolean) {
  const { t } = useI18n();
  const [messageKey, setMessageKey] = useState<MessageKey | null>(
    active ? THINKING_MESSAGES[0].messageKey : null,
  );

  useEffect(() => {
    if (!active) {
      setMessageKey(null);
      return;
    }

    setMessageKey(THINKING_MESSAGES[0].messageKey);
    const timers = THINKING_MESSAGES.slice(1).map(({ delayMs, messageKey }) =>
      window.setTimeout(() => {
        setMessageKey(messageKey);
      }, delayMs),
    );

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [active]);

  return active && messageKey ? t(messageKey) : null;
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
