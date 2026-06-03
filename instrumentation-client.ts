import * as Sentry from "@sentry/nextjs";
import { getBrowserSentryConfig } from "@/lib/observability/sentry-config";

const config = getBrowserSentryConfig();

if (config.enabled) {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    sendDefaultPii: false,
    tracesSampleRate: config.tracesSampleRate,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
