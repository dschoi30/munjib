"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, RotateCcw, Send, X } from "lucide-react";
import { AiAnswer, AiCitations, type AiCitation } from "@/components/ai/answer";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  readWorkspaceChatStream,
  parseTrialAiAllowance,
  publishTrialAiAllowance,
  subscribeToTrialAiAllowance,
  trialAiAllowanceFromQuotaError,
  type TrialAiAllowance,
  type WorkspaceChatStreamMessage,
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
import {
  readStoredWorkspaceUiState,
  updateStoredWorkspaceUiState,
} from "@/lib/workspace-ui-state";

type ChatCitation = AiCitation;

type ChatMessage = WorkspaceChatStreamMessage;

type WorkspaceChatbotProps = {
  mode?: "authenticated" | "anonymous-trial-readonly";
  initialTrialAiAllowance?: TrialAiAllowance | null;
  workspaceSlug: string;
  selectedDocumentId: string | null;
  defaultChatProvider: ClientRagChatProvider;
  defaultChatModel: string;
  availableChatProviders: ClientRagChatProviderAvailability;
};

type ThreadResponse = {
  messages?: ChatMessage[];
};

export function WorkspaceChatbot({
  mode = "authenticated",
  initialTrialAiAllowance = null,
  workspaceSlug,
  selectedDocumentId,
  defaultChatProvider,
  defaultChatModel,
  availableChatProviders,
}: WorkspaceChatbotProps) {
  const { language, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<"" | "unavailable">("");
  const [trialAiAllowance, setTrialAiAllowance] = useState<TrialAiAllowance | null>(null);
  const [hydratedWorkspaceSlug, setHydratedWorkspaceSlug] = useState<string | null>(null);
  const fallbackChatProvider = firstAvailableChatProvider(
    availableChatProviders,
    defaultChatProvider,
  );
  const availableChatProvidersRef = useRef(availableChatProviders);
  availableChatProvidersRef.current = availableChatProviders;
  const fallbackChatProviderRef = useRef(fallbackChatProvider);
  fallbackChatProviderRef.current = fallbackChatProvider;
  const defaultChatProviderRef = useRef(defaultChatProvider);
  defaultChatProviderRef.current = defaultChatProvider;
  const [chatModelOverride, setChatModelOverride] = useState<ChatModelSetting | null>(() =>
    mode === "anonymous-trial-readonly" ? null : effectiveChatModelSetting(
      readStoredChatModelSetting(workspaceSlug, fallbackChatProvider),
      defaultChatProvider,
      availableChatProviders,
    ),
  );
  const hydratedWorkspaceSlugRef = useRef<string | null>(null);
  const hasLoadedThreadRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const messageVersionRef = useRef(0);
  const activeSendAbortRef = useRef<AbortController | null>(null);
  const pendingSendMessageIdsRef = useRef<{
    userId: string;
    assistantPlaceholderId: string;
  } | null>(null);
  const optimisticMessageCounterRef = useRef(0);
  const trimmedMessage = messageInput.trim();
  const effectiveChatModel = chatModelOverride?.chatModel ?? defaultChatModel;
  const isCurrentWorkspaceHydrated = hydratedWorkspaceSlug === workspaceSlug;

  useEffect(() => {
    requestGenerationRef.current += 1;
    messageVersionRef.current += 1;
    abortActiveSend();
    hasLoadedThreadRef.current = false;
    setChatModelOverride(mode === "anonymous-trial-readonly" ? null : effectiveChatModelSetting(
      readStoredChatModelSetting(workspaceSlug, fallbackChatProviderRef.current),
      defaultChatProviderRef.current,
      availableChatProvidersRef.current,
    ));
    setMessages([]);
    setMessageInput("");
    setIsLoading(false);
    setIsThinking(false);
    setIsResetting(false);
    setError("");

    return () => {
      requestGenerationRef.current += 1;
      messageVersionRef.current += 1;
      abortActiveSend();
    };
  }, [mode, workspaceSlug]);

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

  useEffect(() => {
    hydratedWorkspaceSlugRef.current = null;
    setHydratedWorkspaceSlug(null);

    const storedWorkspaceUiState = readStoredWorkspaceUiState(workspaceSlug);
    const storedWorkspaceChatOpen = storedWorkspaceUiState.workspaceChatOpen === true;

    hydratedWorkspaceSlugRef.current = workspaceSlug;
    setIsOpen(storedWorkspaceChatOpen);
    setHydratedWorkspaceSlug(workspaceSlug);
  }, [workspaceSlug]);

  useEffect(() => {
    if (mode === "anonymous-trial-readonly") return;
    return subscribeToStoredChatModelChanges((change) => {
      if (change.workspaceSlug !== workspaceSlug) return;
      setChatModelOverride(
        effectiveChatModelSetting(
          change.chatModel && change.chatProvider
            ? { chatProvider: change.chatProvider, chatModel: change.chatModel }
            : null,
          defaultChatProviderRef.current,
          availableChatProvidersRef.current,
        ),
      );
    }, { chatProvider: fallbackChatProviderRef.current });
  }, [mode, workspaceSlug]);

  function abortActiveSend() {
    activeSendAbortRef.current?.abort();
    activeSendAbortRef.current = null;
  }

  function clearPendingSendMessages() {
    const pendingIds = pendingSendMessageIdsRef.current;
    if (!pendingIds) return;
    pendingSendMessageIdsRef.current = null;
    setMessages((current) =>
      current.filter(
        (message) =>
          message.id !== pendingIds.userId &&
          message.id !== pendingIds.assistantPlaceholderId,
      ),
    );
  }

  function setWorkspaceChatOpen(nextIsOpen: boolean) {
    setIsOpen(nextIsOpen);
    if (hydratedWorkspaceSlugRef.current !== workspaceSlug) return;
    updateStoredWorkspaceUiState(workspaceSlug, () => ({
      workspaceChatOpen: nextIsOpen,
    }));
  }

  useEffect(() => {
    if (!isCurrentWorkspaceHydrated || !isOpen || hasLoadedThreadRef.current) return;
    if (mode === "anonymous-trial-readonly") {
      hasLoadedThreadRef.current = true;
      return;
    }

    let cancelled = false;
    const loadGeneration = requestGenerationRef.current;
    const loadMessageVersion = messageVersionRef.current;
    hasLoadedThreadRef.current = true;
    setError("");

    fetch(`/api/workspaces/${workspaceSlug}/assistant/thread`)
      .then(async (response) => {
        const body = (await response.json()) as ThreadResponse;
        if (!response.ok) throw new Error("THREAD_LOAD_FAILED");
        return body;
      })
      .then((body) => {
        if (
          !cancelled &&
          loadGeneration === requestGenerationRef.current &&
          loadMessageVersion === messageVersionRef.current
        ) {
          setMessages(normalizeMessages(body.messages ?? []));
        }
      })
      .catch(() => {
        if (!cancelled && loadGeneration === requestGenerationRef.current) {
          setError("unavailable");
          hasLoadedThreadRef.current = false;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isCurrentWorkspaceHydrated, isOpen, mode, workspaceSlug]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedMessage || isLoading || isResetting || activeSendAbortRef.current) return;

    abortActiveSend();
    requestGenerationRef.current += 1;
    const sendGeneration = requestGenerationRef.current;
    const abortController = new AbortController();
    activeSendAbortRef.current = abortController;
    const optimisticId = `workspace-chat-pending-${++optimisticMessageCounterRef.current}`;
    const userMessageId = `${optimisticId}-user`;
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "USER",
      content: trimmedMessage,
    };
    const assistantPlaceholderId = `${optimisticId}-assistant`;
    pendingSendMessageIdsRef.current = {
      userId: userMessageId,
      assistantPlaceholderId,
    };
    let hasAssistantPlaceholder = false;
    messageVersionRef.current += 1;
    setMessages((current) => [...current, userMessage]);
    setMessageInput("");
    setIsLoading(true);
    setIsThinking(true);
    setError("");

    const isCurrentSend = () =>
      sendGeneration === requestGenerationRef.current &&
      activeSendAbortRef.current === abortController;

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/assistant/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(mode === "anonymous-trial-readonly" ? { "X-Munjib-AI-Mode": "anonymous-trial-readonly" } : {}),
        },
        signal: abortController.signal,
        body: JSON.stringify({
          message: trimmedMessage,
          ...(selectedDocumentId ? { selectedDocumentId } : {}),
          uiLanguage: language,
          ...(mode !== "anonymous-trial-readonly" && chatModelOverride
            ? {
                chatProvider: chatModelOverride.chatProvider,
                chatModel: chatModelOverride.chatModel,
              }
            : {}),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        updateTrialAiAllowance(body?.trialAi);
        if (response.status === 429) {
          updateTrialAiAllowance(trialAiAllowanceFromQuotaError(body));
        }
        throw new Error("WORKSPACE_CHAT_FAILED");
      }

      await readWorkspaceChatStream(response, (streamEvent) => {
        if (!isCurrentSend()) return;

        if (streamEvent.type === "start") {
          updateTrialAiAllowance(streamEvent.trialAi);
          return;
        }

        if (streamEvent.type === "token") {
          setIsThinking(false);
          if (!hasAssistantPlaceholder) {
            hasAssistantPlaceholder = true;
            messageVersionRef.current += 1;
            setMessages((current) => [
              ...current,
              {
                id: assistantPlaceholderId,
                role: "ASSISTANT",
                content: streamEvent.content,
                citations: [],
              },
            ]);
            return;
          }

          setMessages((current) =>
            current.map((message) =>
              message.id === assistantPlaceholderId
                ? { ...message, content: `${message.content}${streamEvent.content}` }
                : message,
            ),
          );
          return;
        }

        if (streamEvent.type === "done") {
          const finalAssistantMessage = toAssistantChatMessage(
            streamEvent.assistantMessage,
            streamEvent.citations,
          );
          messageVersionRef.current += 1;
          setIsThinking(false);
          setMessages((current) => {
            if (!hasAssistantPlaceholder) {
              return [...current, finalAssistantMessage];
            }
            return current.map((message) =>
              message.id === assistantPlaceholderId ? finalAssistantMessage : message,
            );
          });
          return;
        }

        if (streamEvent.type === "error") {
          throw new Error(streamEvent.error);
        }
      });
    } catch (sendError) {
      if (!isAbortError(sendError, abortController) && isCurrentSend()) {
        clearPendingSendMessages();
        setError("unavailable");
      }
    } finally {
      if (isCurrentSend()) {
        pendingSendMessageIdsRef.current = null;
        activeSendAbortRef.current = null;
        setIsLoading(false);
        setIsThinking(false);
      }
    }
  }

  async function handleReset() {
    requestGenerationRef.current += 1;
    messageVersionRef.current += 1;
    const hadActiveSend = Boolean(activeSendAbortRef.current);
    abortActiveSend();
    if (hadActiveSend) {
      clearPendingSendMessages();
    }
    const resetGeneration = requestGenerationRef.current;
    setError("");
    setIsLoading(false);
    setIsThinking(false);
    setIsResetting(true);

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/assistant/thread/reset`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error("WORKSPACE_CHAT_RESET_FAILED");
      }
      if (resetGeneration === requestGenerationRef.current) {
        setMessages([]);
        hasLoadedThreadRef.current = false;
      }
    } catch {
      if (resetGeneration === requestGenerationRef.current) {
        setError("unavailable");
      }
    } finally {
      if (resetGeneration === requestGenerationRef.current) {
        setIsResetting(false);
      }
    }
  }

  if (!isCurrentWorkspaceHydrated || !isOpen) {
    return (
      <button
        type="button"
        aria-label={t("ai.workspace.open")}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-transparent bg-primary text-primary-foreground shadow-lg transition hover:bg-primary-hover"
        onClick={() => setWorkspaceChatOpen(true)}
      >
        <Bot className="h-5 w-5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <section
      aria-label={t("ai.workspace.label")}
      className="fixed bottom-4 right-4 z-50 flex h-[520px] max-h-[calc(100dvh-2rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-md border border-border bg-white shadow-xl"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
          <Bot className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("ai.workspace.title")}</span>
        </div>
        <div className="flex items-center gap-1">
          {mode !== "anonymous-trial-readonly" ? (
            <button
              type="button"
              aria-label={t("ai.workspace.reset")}
              disabled={isResetting}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              onClick={handleReset}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={t("ai.workspace.close")}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={() => setWorkspaceChatOpen(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border px-3 text-xs text-slate-500">
        <span>{t("ai.model")}</span>
        <span
          className="min-w-0 truncate font-medium text-slate-700"
          title={effectiveChatModel}
        >
          {effectiveChatModel}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        {messages.length === 0 && !isLoading ? (
          <p className="text-sm text-slate-500">{t("ai.workspace.empty")}</p>
        ) : null}
        {messages.map((message, index) => (
          <ChatBubble
            key={message.id ?? `${message.role}-${index}`}
            message={message}
            workspaceSlug={workspaceSlug}
            mode={mode}
          />
        ))}
        <ThinkingIndicator active={isThinking} className="text-sm text-slate-500" />
        {error ? <p className="text-sm text-red-600">{t("ai.workspace.unavailable")}</p> : null}
      </div>

      {trialAiAllowance ? (
        <div
          id={`trial-ai-allowance-workspace-${workspaceSlug}`}
          role="status"
          aria-live="polite"
          className="shrink-0 space-y-0.5 border-t border-border px-3 py-2 text-xs text-slate-600"
        >
          <p>{t("ai.trial.remaining", { remaining: trialAiAllowance.remaining, limit: 3 })}</p>
          <p>{t("ai.trial.resetsAtKst")}</p>
        </div>
      ) : null}
      <form className="flex shrink-0 gap-2 border-t border-border p-3" onSubmit={handleSubmit}>
        <input
          aria-label={t("ai.workspace.messageLabel")}
          value={messageInput}
          disabled={isResetting || trialAiAllowance?.remaining === 0}
          aria-describedby={trialAiAllowance ? `trial-ai-allowance-workspace-${workspaceSlug}` : undefined}
          onChange={(event) => setMessageInput(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-ink"
          placeholder={t("ai.workspace.placeholder")}
        />
        <Button
          type="submit"
          aria-label={t("ai.workspace.send")}
          disabled={!trimmedMessage || isLoading || isResetting || trialAiAllowance?.remaining === 0}
          className="h-9 w-9 px-0"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
    </section>
  );
}

function ChatBubble({
  message,
  workspaceSlug,
  mode,
}: {
  message: ChatMessage;
  workspaceSlug: string;
  mode: "authenticated" | "anonymous-trial-readonly";
}) {
  const isUser = message.role === "USER";

  return (
    <div className={isUser ? "text-right" : "text-left"}>
      <div
        className={
          isUser
            ? "inline-block max-w-[88%] rounded-md bg-ink px-3 py-2 text-left text-white"
            : "inline-block max-w-[88%] rounded-md bg-slate-100 px-3 py-2 text-left text-slate-800"
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <AiAnswer content={message.content} />
        )}
      </div>
      {!isUser ? (
        <AiCitations
          citations={message.citations}
          workspaceSlug={workspaceSlug}
          mode={mode}
          className="mt-1 text-xs text-slate-500"
        />
      ) : null}
    </div>
  );
}

function normalizeMessages(messages: ChatMessage[]) {
  return messages.filter(
    (message): message is ChatMessage =>
      (message.role === "USER" || message.role === "ASSISTANT") &&
      typeof message.content === "string",
  );
}

function toAssistantChatMessage(
  assistantMessage: ChatMessage,
  citations: ChatCitation[] | undefined,
): ChatMessage {
  return {
    id: assistantMessage.id,
    role: "ASSISTANT",
    content: assistantMessage.content,
    citations: citations ?? assistantMessage.citations ?? [],
  };
}

function isAbortError(error: unknown, abortController: AbortController) {
  return abortController.signal.aborted || (error instanceof Error && error.name === "AbortError");
}
