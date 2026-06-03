import * as Sentry from "@sentry/nextjs";
import { getServerSentryConfig } from "@/lib/observability/sentry-config";
import { scrubSentryEvent } from "@/lib/observability/sentry-scrub-event";

const config = getServerSentryConfig();

if (config.enabled) {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
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
