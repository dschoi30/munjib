import * as Sentry from "@sentry/nextjs";
import type { RagErrorCode } from "@/lib/rag/errors";

export type AiUnavailableSurface =
  | "ask_document"
  | "workspace_chat_prepare"
  | "workspace_chat_stream";

export type CaptureHandledAiUnavailableInput = {
  error: unknown;
  surface: AiUnavailableSurface;
  workspaceSlug: string;
  status?: 503;
  streamStarted?: boolean;
  ragErrorCode: RagErrorCode;
  chatProvider?: string;
  chatModel?: string;
};

type AiUnavailableContext = {
  surface: AiUnavailableSurface;
  workspace_slug: string;
  status?: 503;
  stream_started?: boolean;
  rag_error_code: RagErrorCode;
  chat_provider?: string;
  chat_model?: string;
};

export function captureHandledAiUnavailable(input: CaptureHandledAiUnavailableInput) {
  try {
    Sentry.withScope((scope) => {
      const context: AiUnavailableContext = {
        surface: input.surface,
        workspace_slug: input.workspaceSlug,
        rag_error_code: input.ragErrorCode,
      };

      scope.setLevel("error");
      scope.setTag("ai.surface", input.surface);
      scope.setTag("ai.rag_error_code", input.ragErrorCode);

      if (input.status !== undefined) {
        context.status = input.status;
        scope.setTag("ai.status", String(input.status));
      }

      if (input.streamStarted !== undefined) {
        context.stream_started = input.streamStarted;
        scope.setTag("ai.stream_started", String(input.streamStarted));
      }

      if (input.chatProvider) {
        context.chat_provider = input.chatProvider;
        scope.setTag("ai.chat_provider", input.chatProvider);
      }

      if (input.chatModel) {
        context.chat_model = input.chatModel;
        scope.setTag("ai.chat_model", input.chatModel);
      }

      scope.setContext("ai_unavailable", context);

      const error = new Error("Handled AI provider failure returned AI_UNAVAILABLE");
      error.name = "HandledAiUnavailableError";

      Sentry.captureException(error);
    });
  } catch {
    // Do not let observability failures affect the handled AI fallback path.
  }
}
