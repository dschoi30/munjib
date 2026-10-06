"use client";

import { FormEvent, useEffect, useState } from "react";
import { AiAnswer, AiCitations, type AiCitation } from "@/components/ai/answer";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  parseTrialAiAllowance,
  publishTrialAiAllowance,
  subscribeToTrialAiAllowance,
  trialAiAllowanceFromQuotaError,
  type TrialAiAllowance,
} from "@/components/workspace-chatbot-stream";
import {
  type ChatModelSetting,
  type ClientRagChatProvider,
  type ClientRagChatProviderAvailability,
  effectiveChatModelSetting,
  firstAvailableChatProvider,
  readStoredChatModelSetting,
  subscribeToStoredChatModelChanges,
} from "@/lib/rag/client-model-settings";

type AssistantCitation = AiCitation;

type AskResponse = {
  answer?: string;
  citations?: AssistantCitation[];
  error?: string;
  code?: string;
  resetsAt?: string;
  trialAi?: TrialAiAllowance;
};

type AiAssistantPanelProps = {
  mode?: "authenticated" | "anonymous-trial-readonly";
  initialTrialAiAllowance?: TrialAiAllowance | null;
  workspaceSlug: string;
  documentId: string;
  hasUnsavedChanges: boolean;
  defaultChatModel: string;
  defaultChatProvider: ClientRagChatProvider;
  availableChatProviders: ClientRagChatProviderAvailability;
};

export function AiAssistantPanel({
  mode = "authenticated",
  initialTrialAiAllowance = null,
  workspaceSlug,
  documentId,
  hasUnsavedChanges,
  defaultChatModel,
  defaultChatProvider,
  availableChatProviders,
}: AiAssistantPanelProps) {
  const { language, t } = useI18n();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<AssistantCitation[]>([]);
  const [error, setError] = useState<"" | "answerFailed">("");
  const [isLoading, setIsLoading] = useState(false);
  const [trialAiAllowance, setTrialAiAllowance] = useState<TrialAiAllowance | null>(null);
  const fallbackChatProvider = firstAvailableChatProvider(
    availableChatProviders,
    defaultChatProvider,
  );
  const [chatModelOverride, setChatModelOverride] = useState<ChatModelSetting | null>(() =>
    mode === "anonymous-trial-readonly" ? null : effectiveChatModelSetting(
      readStoredChatModelSetting(workspaceSlug, fallbackChatProvider),
      defaultChatProvider,
      availableChatProviders,
    ),
  );
  const trimmedQuestion = question.trim();
  const effectiveChatModel = chatModelOverride?.chatModel ?? defaultChatModel;

  useEffect(() => {
    if (mode === "anonymous-trial-readonly") {
      setChatModelOverride(null);
      return;
    }
    setChatModelOverride(
      effectiveChatModelSetting(
        readStoredChatModelSetting(workspaceSlug, fallbackChatProvider),
        defaultChatProvider,
        availableChatProviders,
      ),
    );
    return subscribeToStoredChatModelChanges((change) => {
      if (change.workspaceSlug !== workspaceSlug) return;
      setChatModelOverride(
        effectiveChatModelSetting(
          change.chatModel && change.chatProvider
            ? { chatProvider: change.chatProvider, chatModel: change.chatModel }
            : null,
          defaultChatProvider,
          availableChatProviders,
        ),
      );
    }, { chatProvider: fallbackChatProvider });
  }, [availableChatProviders, defaultChatProvider, fallbackChatProvider, mode, workspaceSlug]);

  useEffect(() => subscribeToTrialAiAllowance(setTrialAiAllowance), []);

  useEffect(() => {
    if (mode !== "anonymous-trial-readonly") return;
    const allowance = parseTrialAiAllowance(initialTrialAiAllowance);
    if (allowance) publishTrialAiAllowance(allowance);
  }, [initialTrialAiAllowance, mode]);

  function updateTrialAiAllowance(value: unknown) {
    const allowance = parseTrialAiAllowance(value);
    if (!allowance) return;
    publishTrialAiAllowance(allowance);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedQuestion || isLoading) return;

    setIsLoading(true);
    setError("");
    setAnswer("");
    setCitations([]);

    try {
      const requestBody = mode !== "anonymous-trial-readonly" && chatModelOverride
        ? {
            question: trimmedQuestion,
            uiLanguage: language,
            chatProvider: chatModelOverride.chatProvider,
            chatModel: chatModelOverride.chatModel,
          }
        : { question: trimmedQuestion, uiLanguage: language };
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/documents/${documentId}/ask`,
        {
          method: "POST",
          headers: {
          "Content-Type": "application/json",
          ...(mode === "anonymous-trial-readonly" ? { "X-Munjib-AI-Mode": "anonymous-trial-readonly" } : {}),
        },
          body: JSON.stringify(requestBody),
        },
      );
      const body = (await response.json()) as AskResponse;

      if (!response.ok) {
        updateTrialAiAllowance(body.trialAi);
        if (response.status === 429) updateTrialAiAllowance(trialAiAllowanceFromQuotaError(body));
        throw new Error(body.error || "AI_REQUEST_FAILED");
      }

      updateTrialAiAllowance(body.trialAi);
      setAnswer(body.answer ?? "");
      setCitations(body.citations ?? []);
    } catch {
      setError("answerFailed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section
      aria-label={t("ai.assistant.label")}
      className="rounded-md border border-border bg-white px-3 py-3 text-sm"
    >
      {hasUnsavedChanges ? (
        <p className="mb-2 text-xs text-amber-700">
          {t("ai.unsavedWarning")}
        </p>
      ) : null}
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{t("ai.model")}</span>
        <span className="min-w-0 truncate font-medium text-slate-700" title={effectiveChatModel}>
          {effectiveChatModel}
        </span>
      </div>
      <form className="space-y-2" onSubmit={handleSubmit}>
        {trialAiAllowance ? (
          <div
            id={`trial-ai-allowance-ask-${documentId}`}
            role="status"
            aria-live="polite"
            className="space-y-0.5 text-xs text-slate-600"
          >
            <p>{t("ai.trial.remaining", { remaining: trialAiAllowance.remaining, limit: 3 })}</p>
            <p>{t("ai.trial.resetsAtKst")}</p>
          </div>
        ) : null}
        <textarea
          aria-label={t("ai.questionLabel")}
          value={question}
          disabled={trialAiAllowance?.remaining === 0}
          aria-describedby={trialAiAllowance ? `trial-ai-allowance-ask-${documentId}` : undefined}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          className="w-full resize-y rounded-md border border-border px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-ink"
          placeholder={t("ai.askPlaceholder")}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!trimmedQuestion || isLoading || trialAiAllowance?.remaining === 0}
            className="h-8 px-2 text-xs"
          >
            {t("ai.askSubmit")}
          </Button>
        </div>
      </form>
      <ThinkingIndicator active={isLoading} className="mt-3 text-sm text-slate-500" />
      {error ? <p className="mt-3 text-sm text-red-600">{t("ai.answerFailed")}</p> : null}
      {answer ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <AiAnswer content={answer} className="text-slate-700" />
          <AiCitations
            citations={citations}
            workspaceSlug={workspaceSlug}
            mode={mode}
            className="text-xs text-slate-500"
          />
        </div>
      ) : null}
    </section>
  );
}
