import * as Sentry from "@sentry/nextjs";
import { getBrowserSentryConfig } from "@/lib/observability/sentry-config";
import { scrubSentryEvent } from "@/lib/observability/sentry-scrub-event";

const config = getBrowserSentryConfig();

if (config.enabled) {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    tracesSampleRate: config.tracesSampleRate,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
