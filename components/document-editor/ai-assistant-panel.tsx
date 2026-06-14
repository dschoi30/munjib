"use client";

import { FormEvent, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  readStoredChatModel,
  subscribeToStoredChatModelChanges,
} from "@/lib/rag/client-model-settings";

type AssistantCitation = {
  index?: number;
  documentTitle?: string;
  title?: string;
  documentPath?: string;
  headingPath?: string | string[] | null;
};

type AskResponse = {
  answer?: string;
  citations?: AssistantCitation[];
  error?: string;
};

type AiAssistantPanelProps = {
  workspaceSlug: string;
  documentId: string;
  hasUnsavedChanges: boolean;
  defaultChatModel: string;
};

export function AiAssistantPanel({
  workspaceSlug,
  documentId,
  hasUnsavedChanges,
  defaultChatModel,
}: AiAssistantPanelProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<AssistantCitation[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatModelOverride, setChatModelOverride] = useState<string | null>(() =>
    readStoredChatModel(workspaceSlug),
  );
  const trimmedQuestion = question.trim();
  const effectiveChatModel = chatModelOverride ?? defaultChatModel;

  useEffect(() => {
    setChatModelOverride(readStoredChatModel(workspaceSlug));
    return subscribeToStoredChatModelChanges((change) => {
      if (change.workspaceSlug !== workspaceSlug) return;
      flushSync(() => setChatModelOverride(change.chatModel));
    });
  }, [workspaceSlug]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedQuestion || isLoading) return;

    setIsLoading(true);
    setError("");
    setAnswer("");
    setCitations([]);

    try {
      const requestBody = chatModelOverride
        ? { question: trimmedQuestion, chatModel: chatModelOverride }
        : { question: trimmedQuestion };
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/documents/${documentId}/ask`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
      );
      const body = (await response.json()) as AskResponse;

      if (!response.ok) {
        throw new Error(body.error || "AI_REQUEST_FAILED");
      }

      setAnswer(body.answer ?? "");
      setCitations(body.citations ?? []);
    } catch {
      setError("AI 답변을 가져오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section
      aria-label="AI assistant"
      className="rounded-md border border-border bg-white px-3 py-3 text-sm"
    >
      {hasUnsavedChanges ? (
        <p className="mb-2 text-xs text-amber-700">
          저장되지 않은 변경사항은 AI 답변에 반영되지 않습니다.
        </p>
      ) : null}
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>Model</span>
        <span className="min-w-0 truncate font-medium text-slate-700" title={effectiveChatModel}>
          {effectiveChatModel}
        </span>
      </div>
      <form className="space-y-2" onSubmit={handleSubmit}>
        <textarea
          aria-label="AI question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          className="w-full resize-y rounded-md border border-border px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-ink"
          placeholder="Ask about this document"
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={!trimmedQuestion || isLoading} className="h-8 px-2 text-xs">
            {isLoading ? "Asking..." : "Ask AI"}
          </Button>
        </div>
      </form>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {answer ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <p className="whitespace-pre-wrap text-slate-700">{answer}</p>
          {citations.length > 0 ? (
            <ol className="space-y-1 text-xs text-slate-500">
              {citations.map((citation, index) => (
                <li key={`${citation.documentTitle ?? citation.title ?? "citation"}-${index}`}>
                  [{citation.index ?? index + 1}] {citation.documentTitle ?? citation.title ?? "Saved document"}
                  {formatHeadingPath(citation.headingPath)}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function formatHeadingPath(headingPath: AssistantCitation["headingPath"]) {
  if (Array.isArray(headingPath)) {
    return headingPath.length > 0 ? ` > ${headingPath.join(" > ")}` : "";
  }

  return headingPath ? ` > ${headingPath}` : "";
}
