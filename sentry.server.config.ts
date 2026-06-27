import * as Sentry from "@sentry/nextjs";
import { getServerSentryConfig } from "@/lib/observability/sentry-config";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryMetric,
  scrubSentrySpan,
} from "@/lib/observability/sentry-scrub-event";

const config = getServerSentryConfig();

if (config.enabled) {
  const integrations = config.runtimeMetrics?.enabled
    ? [
        Sentry.nodeRuntimeMetricsIntegration({
          collectionIntervalMs: config.runtimeMetrics.collectionIntervalMs,
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
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: false,
        response: false,
      },
      httpBodies: [],
      queryParams: false,
      genAI: {
        inputs: false,
        outputs: false,
      },
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    tracesSampleRate: config.tracesSampleRate,
  });
}
