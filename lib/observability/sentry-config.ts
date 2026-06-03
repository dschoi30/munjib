export type SentryEnv = Record<string, string | undefined>;

export type SentryConfig = {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  release: string | undefined;
  tracesSampleRate: number;
};

const DEFAULT_ENVIRONMENT = "development";

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function defaultEnvironment(env: SentryEnv) {
  return env.NODE_ENV === "production" ? "production" : DEFAULT_ENVIRONMENT;
}

export function parseTraceSampleRate(raw: string | undefined) {
  const value = nonEmpty(raw);

  if (!value) {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return 0;
  }

  return parsed;
}

export function getServerSentryConfig(env: SentryEnv = process.env): SentryConfig {
  const dsn = nonEmpty(env.SENTRY_DSN) ?? nonEmpty(env.NEXT_PUBLIC_SENTRY_DSN);
  const environment =
    nonEmpty(env.SENTRY_ENVIRONMENT) ??
    nonEmpty(env.NEXT_PUBLIC_SENTRY_ENVIRONMENT) ??
    defaultEnvironment(env);

  return {
    dsn,
    enabled: Boolean(dsn),
    environment,
    release: nonEmpty(env.SENTRY_RELEASE),
    tracesSampleRate: parseTraceSampleRate(
      env.SENTRY_TRACES_SAMPLE_RATE ?? env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    ),
  };
}

function getBrowserSentryEnv(): SentryEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  };
}

export function getBrowserSentryConfig(env: SentryEnv = getBrowserSentryEnv()): SentryConfig {
  const dsn = nonEmpty(env.NEXT_PUBLIC_SENTRY_DSN);

  return {
    dsn,
    enabled: Boolean(dsn),
    environment: nonEmpty(env.NEXT_PUBLIC_SENTRY_ENVIRONMENT) ?? defaultEnvironment(env),
    release: nonEmpty(env.NEXT_PUBLIC_SENTRY_RELEASE),
    tracesSampleRate: parseTraceSampleRate(env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
  };
}
