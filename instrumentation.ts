import * as Sentry from "@sentry/nextjs";
import { assertValidAuthRuntimeEnv } from "@/lib/auth/runtime";
import {
  assertCandidateSideEffectsDisabled,
  isPrivateCandidateRuntime,
} from "@/lib/runtime/private-candidate";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertValidAuthRuntimeEnv(process.env);
    assertCandidateSideEffectsDisabled(process.env);
    if (!isPrivateCandidateRuntime(process.env)) {
      const { initializeLangfuseOtel } = await import("./lib/rag/langfuse-otel");
      await initializeLangfuseOtel();
    }
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
