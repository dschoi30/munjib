"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { ChatModelSetting } from "@/lib/rag/client-model-settings";

type Status = "checking" | "connected" | "disconnected";

export function ModelConnectionStatus({ workspaceSlug, chatProvider, chatModel }: ChatModelSetting & {
  workspaceSlug: string;
}) {
  const { t } = useI18n();
  const identity = JSON.stringify([workspaceSlug, chatProvider, chatModel]);
  const [result, setResult] = useState<{ identity: string; status: Status } | null>(null);
  const status = result?.identity === identity ? result.status : "checking";

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setResult({ identity, status: "checking" });
    // Also bound the browser wait if a proxy or network never returns a response.
    const timer = setTimeout(() => {
      if (active) setResult({ identity, status: "disconnected" });
      active = false;
      controller.abort();
    }, 20_000);

    async function check() {
      try {
        const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/ai/connection`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatProvider, chatModel }),
          signal: controller.signal,
          cache: "no-store",
        });
        const body = response.ok ? await response.json() : null;
        if (active) setResult({ identity, status: body?.connected === true ? "connected" : "disconnected" });
      } catch {
        if (active) setResult({ identity, status: "disconnected" });
      } finally {
        clearTimeout(timer);
      }
    }
    void check();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [workspaceSlug, chatProvider, chatModel, identity]);

  return (
    <p role="status" aria-live="polite" className="mt-3 flex items-center gap-2 text-xs font-medium text-ink-muted">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${
        status === "connected" ? "bg-emerald-600" : status === "checking" ? "bg-amber-500" : "bg-red-500"
      }`} />
      {t(`settings.ai.connection.${status}`)}
    </p>
  );
}
