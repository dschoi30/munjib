"use client";

import { useEffect } from "react";

const SPECULATIVE_REL_VALUES = new Set([
  "dns-prefetch",
  "preconnect",
  "prefetch",
  "preload",
]);

/**
 * Keep browser speculative media discovery disabled. This also removes the
 * development webpack preload tag so SSR/browser egress checks observe the
 * same contract in dev and production.
 */
export function SpeculativeLinkGuard() {
  useEffect(() => {
    const removeSpeculativeLinks = () => {
      document.head.querySelectorAll("link").forEach((link) => {
        if (SPECULATIVE_REL_VALUES.has(link.rel.toLowerCase())) link.remove();
      });
    };

    removeSpeculativeLinks();
    const observer = new MutationObserver(removeSpeculativeLinks);
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
