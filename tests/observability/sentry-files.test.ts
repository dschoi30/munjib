import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Sentry Next.js integration files", () => {
  test("registers server and edge Sentry config through Next instrumentation", () => {
    const source = read("instrumentation.ts");

    expect(source).toContain('await import("./sentry.server.config")');
    expect(source).toContain('await import("./sentry.edge.config")');
    expect(source).toContain("Sentry.captureRequestError");
  });

  test("initializes browser Sentry without PII, replay, feedback, or logs", () => {
    const source = read("instrumentation-client.ts");

    expect(source).toContain("getBrowserSentryConfig");
    expect(source).toContain(
      "} from \"@/lib/observability/sentry-scrub-event\";",
    );
    expect(source).toContain("Sentry.init");
    expect(source).toContain("release: config.release");
    expect(source).toContain("sendDefaultPii: false");
    expect(source).toContain("beforeSend: scrubSentryEvent");
    expect(source).toContain("beforeSendTransaction: scrubSentryEvent");
    expect(source).toContain("beforeSendSpan: scrubSentrySpan");
    expect(source).toContain("beforeBreadcrumb: scrubSentryBreadcrumb");
    expect(source).not.toContain("enableLogs: true");
    expect(source).toContain("captureRouterTransitionStart");
    expect(source).not.toContain("replayIntegration");
    expect(source).not.toContain("feedbackIntegration");
  });

  test("initializes server runtimes without PII or document context", () => {
    const serverSource = read("sentry.server.config.ts");
    const edgeSource = read("sentry.edge.config.ts");

    for (const source of [serverSource, edgeSource]) {
      expect(source).toContain("getServerSentryConfig");
      expect(source).toContain(
        "} from \"@/lib/observability/sentry-scrub-event\";",
      );
      expect(source).toContain("Sentry.init");
      expect(source).toContain("sendDefaultPii: false");
      expect(source).toContain("beforeSend: scrubSentryEvent");
      expect(source).toContain("beforeSendTransaction: scrubSentryEvent");
      expect(source).toContain("beforeSendSpan: scrubSentrySpan");
      expect(source).toContain("beforeBreadcrumb: scrubSentryBreadcrumb");
      expect(source).not.toContain("enableLogs: true");
      expect(source).toContain("dataCollection");
      expect(source).toContain("userInfo: false");
      expect(source).toContain("cookies: false");
      expect(source).toContain("httpHeaders");
      expect(source).toContain("request: false");
      expect(source).toContain("response: false");
      expect(source).toContain("httpBodies: []");
      expect(source).toContain("queryParams: false");
      expect(source).toContain("genAI");
      expect(source).toContain("inputs: false");
      expect(source).toContain("outputs: false");
      expect(source).toContain("stackFrameVariables: false");
      expect(source).toContain("frameContextLines: 0");
      expect(source).not.toContain("DATABASE_URL");
      expect(source).not.toContain("NEXTAUTH_SECRET");
      expect(source).not.toContain("contentMarkdown");
    }
  });

  test("scrubs navigation and console breadcrumbs before send", () => {
    const source = read("lib/observability/sentry-scrub-event.ts");

    expect(source).toContain('breadcrumb.category === "console"');
    expect(source).toContain('"from"');
    expect(source).toContain('"to"');
  });

  test("scrubs request body, header, and IP span data before send", () => {
    const source = read("lib/observability/sentry-scrub-event.ts");

    expect(source).toContain("http.request.body");
    expect(source).toContain("http.response.body");
    expect(source).toContain("http.request.header");
    expect(source).toContain("http.response.header");
    expect(source).toContain("user.ip_address");
    expect(source).toContain('"url"');
    expect(source).toContain("http.target");
    expect(source).toContain("request.path");
    expect(source).toContain("net.peer.ip");
    expect(source).toContain("http.client_ip");
    expect(source).toContain("url.domain");
  });

  test("captures App Router global errors", () => {
    const source = read("app/global-error.tsx");

    expect(source).toContain('"use client"');
    expect(source).toContain("Sentry.captureException(error)");
    expect(source).toContain("<NextError statusCode={500} />");
  });

  test("wraps Next config while disabling source map upload", () => {
    const source = read("next.config.mjs");

    expect(source).toContain('import { withSentryConfig } from "@sentry/nextjs";');
    expect(source).toContain("withSentryConfig(nextConfig");
    expect(source).toContain("sourcemaps");
    expect(source).toContain("disable: true");
    expect(source).toContain("telemetry: false");
  });
});
