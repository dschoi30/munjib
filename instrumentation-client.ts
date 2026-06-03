import * as Sentry from "@sentry/nextjs";
import { getBrowserSentryConfig } from "@/lib/observability/sentry-config";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentrySpan,
} from "@/lib/observability/sentry-scrub-event";

const config = getBrowserSentryConfig();

if (config.enabled) {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
    beforeSendSpan: scrubSentrySpan,
    beforeBreadcrumb: scrubSentryBreadcrumb,
    tracesSampleRate: config.tracesSampleRate,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
