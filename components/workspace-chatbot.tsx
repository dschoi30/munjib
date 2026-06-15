"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, RotateCcw, Send, X } from "lucide-react";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";
import { Button } from "@/components/ui/button";

type ChatCitation = {
  index?: number;
  documentTitle?: string;
  title?: string;
  documentPath?: string;
  headingPath?: string | string[] | null;
};

type ChatMessage = {
  id?: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: ChatCitation[] | null;
};

type WorkspaceChatbotProps = {
  workspaceSlug: string;
  selectedDocumentId: string | null;
};

type ThreadResponse = {
  messages?: ChatMessage[];
};

type SendMessageResponse = {
  assistantMessage?: ChatMessage;
  citations?: ChatCitation[];
  error?: string;
};

export function WorkspaceChatbot({ workspaceSlug, selectedDocumentId }: WorkspaceChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState("");
  const hasLoadedThreadRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const messageVersionRef = useRef(0);
  const trimmedMessage = messageInput.trim();

  useEffect(() => {
    requestGenerationRef.current += 1;
    messageVersionRef.current += 1;
    hasLoadedThreadRef.current = false;
    setMessages([]);
    setMessageInput("");
    setIsLoading(false);
    setIsResetting(false);
    setError("");
  }, [workspaceSlug]);

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
    if (!trimmedMessage || isLoading || isResetting) return;

    const userMessage: ChatMessage = { role: "USER", content: trimmedMessage };
    const sendGeneration = requestGenerationRef.current;
    messageVersionRef.current += 1;
    setMessages((current) => [...current, userMessage]);
    setMessageInput("");
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/assistant/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedMessage,
          ...(selectedDocumentId ? { selectedDocumentId } : {}),
        }),
      });
      const body = (await response.json()) as SendMessageResponse;
      if (!response.ok) {
        throw new Error(body.error || "WORKSPACE_CHAT_FAILED");
      }
      if (sendGeneration !== requestGenerationRef.current) {
        return;
      }

      const assistantMessage = body.assistantMessage;
      messageVersionRef.current += 1;
      setMessages((current) => [
        ...current,
        {
          id: assistantMessage?.id,
          role: "ASSISTANT",
          content: assistantMessage?.content ?? "",
          citations: body.citations ?? assistantMessage?.citations ?? [],
        },
      ]);
    } catch {
      if (sendGeneration === requestGenerationRef.current) {
        setError("Workspace AI is unavailable.");
      }
    } finally {
      if (sendGeneration === requestGenerationRef.current) {
        setIsLoading(false);
      }
    }
  }

  async function handleReset() {
    requestGenerationRef.current += 1;
    messageVersionRef.current += 1;
    const resetGeneration = requestGenerationRef.current;
    setError("");
    setIsLoading(false);
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
        {messages.length === 0 && !isLoading ? (
          <p className="text-sm text-slate-500">Ask across this workspace.</p>
        ) : null}
        {messages.map((message, index) => (
          <ChatBubble key={message.id ?? `${message.role}-${index}`} message={message} />
        ))}
        <ThinkingIndicator active={isLoading} className="text-sm text-slate-500" />
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

function ChatBubble({ message }: { message: ChatMessage }) {
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
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
      {!isUser && message.citations?.length ? (
        <ol className="mt-1 space-y-1 text-xs text-slate-500">
          {message.citations.map((citation, index) => (
            <li key={`${citation.documentTitle ?? citation.title ?? "citation"}-${index}`}>
              [{citation.index ?? index + 1}] {citation.documentTitle ?? citation.title ?? "Saved document"}
              {formatHeadingPath(citation.headingPath)}
            </li>
          ))}
        </ol>
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

function formatHeadingPath(headingPath: ChatCitation["headingPath"]) {
  if (Array.isArray(headingPath)) {
    return headingPath.length > 0 ? ` > ${headingPath.join(" > ")}` : "";
  }

  return headingPath ? ` > ${headingPath}` : "";
}
