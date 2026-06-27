import * as Sentry from "@sentry/nextjs";
import { getBrowserSentryConfig } from "@/lib/observability/sentry-config";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryMetric,
  scrubSentrySpan,
} from "@/lib/observability/sentry-scrub-event";

const config = getBrowserSentryConfig();

if (config.enabled) {
  const replayEnabled =
    (config.replay?.sessionSampleRate ?? 0) > 0 ||
    (config.replay?.onErrorSampleRate ?? 0) > 0;
  const integrations = replayEnabled
    ? [
        Sentry.replayIntegration({
          maskAllText: true,
          maskAllInputs: true,
          blockAllMedia: true,
        }),
      ]
    : [];

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    integrations,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
    beforeSendSpan: scrubSentrySpan,
    beforeBreadcrumb: scrubSentryBreadcrumb,
    beforeSendMetric: scrubSentryMetric,
    replaysSessionSampleRate: config.replay?.sessionSampleRate ?? 0,
    replaysOnErrorSampleRate: config.replay?.onErrorSampleRate ?? 0,
    tracesSampleRate: config.tracesSampleRate,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
