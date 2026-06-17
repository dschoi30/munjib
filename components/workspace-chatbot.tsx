"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, RotateCcw, Send, X } from "lucide-react";
import { AiAnswer, AiCitations, type AiCitation } from "@/components/ai/answer";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";
import { Button } from "@/components/ui/button";
import {
  readWorkspaceChatStream,
  type WorkspaceChatStreamMessage,
} from "@/components/workspace-chatbot-stream";
import {
  type ChatModelSetting,
  type ClientRagChatProvider,
  readStoredChatModelSetting,
  subscribeToStoredChatModelChanges,
} from "@/lib/rag/client-model-settings";

type ChatCitation = AiCitation;

type ChatMessage = WorkspaceChatStreamMessage;

type WorkspaceChatbotProps = {
  workspaceSlug: string;
  selectedDocumentId: string | null;
  defaultChatProvider: ClientRagChatProvider;
  defaultChatModel: string;
};

type ThreadResponse = {
  messages?: ChatMessage[];
};

export function WorkspaceChatbot({
  workspaceSlug,
  selectedDocumentId,
  defaultChatProvider,
  defaultChatModel,
}: WorkspaceChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState("");
  const [chatModelOverride, setChatModelOverride] = useState<ChatModelSetting | null>(() =>
    readStoredChatModelSetting(workspaceSlug, defaultChatProvider),
  );
  const hasLoadedThreadRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const messageVersionRef = useRef(0);
  const activeSendAbortRef = useRef<AbortController | null>(null);
  const optimisticMessageCounterRef = useRef(0);
  const trimmedMessage = messageInput.trim();
  const effectiveChatModel = chatModelOverride?.chatModel ?? defaultChatModel;

  useEffect(() => {
    requestGenerationRef.current += 1;
    messageVersionRef.current += 1;
    abortActiveSend();
    hasLoadedThreadRef.current = false;
    setChatModelOverride(readStoredChatModelSetting(workspaceSlug, defaultChatProvider));
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
  }, [defaultChatProvider, workspaceSlug]);

  useEffect(() => {
    return subscribeToStoredChatModelChanges((change) => {
      if (change.workspaceSlug !== workspaceSlug) return;
      setChatModelOverride(
        change.chatModel && change.chatProvider
          ? { chatProvider: change.chatProvider, chatModel: change.chatModel }
          : null,
      );
    }, { chatProvider: defaultChatProvider });
  }, [defaultChatProvider, workspaceSlug]);

  function abortActiveSend() {
    activeSendAbortRef.current?.abort();
    activeSendAbortRef.current = null;
  }

  useEffect(() => {
    if (!isOpen || hasLoadedThreadRef.current) return;

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
          setError("Workspace AI is unavailable.");
          hasLoadedThreadRef.current = false;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, workspaceSlug]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedMessage || isLoading || isResetting || activeSendAbortRef.current) return;

    abortActiveSend();
    requestGenerationRef.current += 1;
    const sendGeneration = requestGenerationRef.current;
    const abortController = new AbortController();
    activeSendAbortRef.current = abortController;
    const optimisticId = `workspace-chat-pending-${++optimisticMessageCounterRef.current}`;
    const userMessage: ChatMessage = {
      id: `${optimisticId}-user`,
      role: "USER",
      content: trimmedMessage,
    };
    const assistantPlaceholderId = `${optimisticId}-assistant`;
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
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          message: trimmedMessage,
          ...(selectedDocumentId ? { selectedDocumentId } : {}),
          ...(chatModelOverride
            ? {
                chatProvider: chatModelOverride.chatProvider,
                chatModel: chatModelOverride.chatModel,
              }
            : {}),
        }),
      });
      if (!response.ok) {
        throw new Error("WORKSPACE_CHAT_FAILED");
      }

      await readWorkspaceChatStream(response, (streamEvent) => {
        if (!isCurrentSend()) return;

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
        setMessages((current) =>
          current.filter(
            (message) =>
              message.id !== userMessage.id && message.id !== assistantPlaceholderId,
          ),
        );
        setError("Workspace AI is unavailable.");
      }
    } finally {
      if (isCurrentSend()) {
        activeSendAbortRef.current = null;
        setIsLoading(false);
        setIsThinking(false);
      }
    }
  }

  async function handleReset() {
    requestGenerationRef.current += 1;
    messageVersionRef.current += 1;
    abortActiveSend();
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
        setError("Workspace AI is unavailable.");
      }
    } finally {
      if (resetGeneration === requestGenerationRef.current) {
        setIsResetting(false);
      }
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        aria-label="Open workspace AI chat"
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white shadow-lg transition hover:bg-slate-800"
        onClick={() => setIsOpen(true)}
      >
        <Bot className="h-5 w-5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <section
      aria-label="Workspace AI chat"
      className="fixed bottom-4 right-4 z-50 flex h-[520px] max-h-[calc(100dvh-2rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-md border border-border bg-white shadow-xl"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
          <Bot className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Workspace AI</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Reset conversation"
            disabled={isResetting}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={handleReset}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Close workspace AI chat"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border px-3 text-xs text-slate-500">
        <span>Model</span>
        <span
          className="min-w-0 truncate font-medium text-slate-700"
          title={effectiveChatModel}
        >
          {effectiveChatModel}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        {messages.length === 0 && !isLoading ? (
          <p className="text-sm text-slate-500">Ask across this workspace.</p>
        ) : null}
        {messages.map((message, index) => (
          <ChatBubble
            key={message.id ?? `${message.role}-${index}`}
            message={message}
            workspaceSlug={workspaceSlug}
          />
        ))}
        <ThinkingIndicator active={isThinking} className="text-sm text-slate-500" />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>

      <form className="flex shrink-0 gap-2 border-t border-border p-3" onSubmit={handleSubmit}>
        <input
          aria-label="Workspace chat message"
          value={messageInput}
          disabled={isResetting}
          onChange={(event) => setMessageInput(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-ink"
          placeholder="Ask across this workspace"
        />
        <Button
          type="submit"
          aria-label="Send message"
          disabled={!trimmedMessage || isLoading || isResetting}
          className="h-9 w-9 px-0"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
    </section>
  );
}

function ChatBubble({ message, workspaceSlug }: { message: ChatMessage; workspaceSlug: string }) {
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
