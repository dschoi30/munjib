import * as Sentry from "@sentry/nextjs";
import { getServerSentryConfig } from "@/lib/observability/sentry-config";

const config = getServerSentryConfig();

if (config.enabled) {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    sendDefaultPii: false,
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
