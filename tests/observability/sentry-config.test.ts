import { describe, expect, test } from "vitest";
import {
  getBrowserSentryConfig,
  getServerSentryConfig,
  parseTraceSampleRate,
} from "@/lib/observability/sentry-config";

describe("Sentry observability config", () => {
  test("disables server Sentry when no DSN is configured", () => {
    expect(getServerSentryConfig({ NODE_ENV: "production" })).toEqual({
      dsn: undefined,
      enabled: false,
      environment: "production",
      release: undefined,
      tracesSampleRate: 0,
    });
  });

  test("uses server DSN, environment, release, and trace sample rate", () => {
    expect(
      getServerSentryConfig({
        NODE_ENV: "production",
        SENTRY_DSN: " https://public@example.ingest.sentry.io/1 ",
        SENTRY_ENVIRONMENT: " staging ",
        SENTRY_RELEASE: " image-2026-06-03 ",
        SENTRY_TRACES_SAMPLE_RATE: "0.05",
      }),
    ).toEqual({
      dsn: "https://public@example.ingest.sentry.io/1",
      enabled: true,
      environment: "staging",
      release: "image-2026-06-03",
      tracesSampleRate: 0.05,
    });
  });

  test("falls back to the public DSN for server config", () => {
    const config = getServerSentryConfig({
      NODE_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/2",
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production",
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.01",
    });

    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe("https://public@example.ingest.sentry.io/2");
    expect(config.environment).toBe("production");
    expect(config.tracesSampleRate).toBe(0.01);
  });

  test("keeps browser config limited to public values", () => {
    expect(
      getBrowserSentryConfig({
        NODE_ENV: "production",
        SENTRY_DSN: "https://server@example.ingest.sentry.io/1",
        SENTRY_ENVIRONMENT: "server",
        SENTRY_RELEASE: "server-release",
        SENTRY_TRACES_SAMPLE_RATE: "0.5",
        NEXT_PUBLIC_SENTRY_DSN: "https://browser@example.ingest.sentry.io/1",
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "browser",
        NEXT_PUBLIC_SENTRY_RELEASE: " browser-release ",
        NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.02",
      }),
    ).toEqual({
      dsn: "https://browser@example.ingest.sentry.io/1",
      enabled: true,
      environment: "browser",
      release: "browser-release",
      tracesSampleRate: 0.02,
    });
  });

  test.each([
    [undefined, 0],
    ["", 0],
    ["0", 0],
    ["1", 1],
    ["0.25", 0.25],
    [" -0.1 ", 0],
    ["1.1", 0],
    ["not-a-number", 0],
  ])("parses trace sample rate %j as %d", (raw, expected) => {
    expect(parseTraceSampleRate(raw)).toBe(expected);
  });
});
