# Sentry SaaS Observability Design

## Context

Issue #89 adds lightweight production observability to the existing Munjib
Next.js Docker deployment. The current production-style Compose path runs a
`web` service from the `runner` image target and a `postgres` service from a
pgvector-enabled PostgreSQL image. Operators still use Docker stdout for
startup, environment, database connectivity, and PostgreSQL logs:

```bash
docker compose logs -f --tail=300 --timestamps web postgres
```

Sentry SaaS should complement that workflow by capturing application exceptions
and low-volume performance traces. It should not replace container log
monitoring or become the primary store for all stdout/stderr logs.

The project currently has no Sentry dependency or observability wiki page.
Next.js configuration lives in `next.config.mjs`, and production Docker builds
run `pnpm run build` in the `builder` stage before copying the built `.next`
output into the `runner` image.

## Goals

- Add Sentry SaaS error monitoring for the Next.js App Router application.
- Capture server-side request errors, client-side render/runtime errors, and
  global App Router errors.
- Enable performance tracing with a low, environment-controlled sample rate.
- Keep Sentry disabled when no DSN is configured.
- Tag events with the configured environment and optional release value.
- Propagate Sentry configuration through Docker Compose for the production
  `web` service.
- Support client-side Sentry configuration in production Docker builds by
  passing public Sentry values at image build time.
- Document that Docker logs remain the source for startup, environment, database
  connectivity, and PostgreSQL process logs.
- Add focused automated tests for configuration parsing and Docker contract
  changes.

## Non-Goals

- Do not self-host Sentry.
- Do not add Loki, Datadog, CloudWatch, or another stdout log pipeline.
- Do not send all `console.log` output or Docker stdout to Sentry.
- Do not enable Session Replay, User Feedback, profiling, cron monitoring, or
  Sentry structured logs in this first slice.
- Do not upload source maps in this first slice.
- Do not commit `SENTRY_AUTH_TOKEN` or require it at runtime.
- Do not add a permanent public route whose only purpose is throwing test
  errors.

## Approach

Use the official `@sentry/nextjs` SDK and manual App Router setup. Add the
standard root-level Sentry initialization files:

- `instrumentation-client.ts` for browser SDK initialization.
- `sentry.server.config.ts` for Node.js server runtime initialization.
- `sentry.edge.config.ts` for Edge runtime initialization.
- `instrumentation.ts` to load the server or edge config and export
  `onRequestError`.
- `app/global-error.tsx` to capture uncaught App Router render errors.

Wrap the existing `next.config.mjs` with `withSentryConfig`. Keep source map
upload disabled for this slice with the SDK's explicit source-map disable
option. Do not configure an auth token, organization, or project upload
settings. Source map upload can be added later when the deployment pipeline has
a proper build-time secret path.

Add a small configuration helper so parsing and defaults are testable without
initializing the SDK in tests. The helper should:

- Treat an empty DSN as disabled.
- Parse trace sample rates from strings.
- Clamp invalid or out-of-range sample rates to `0`.
- Default tracing to `0` when no sample rate is provided.
- Default environment to `production` in the production Docker path.

## Configuration

Use separate server/runtime and public/build-time environment variables because
Next.js public variables are bundled into browser code during `next build`.

Server-side runtime variables:

```text
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=
SENTRY_TRACES_SAMPLE_RATE=0.05
```

Client-side public build variables:

```text
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05
```

`SENTRY_RELEASE` is optional. When present during build and runtime, Sentry can
use it to group events by deployment version. A commit SHA or image tag is a
reasonable value.

The Sentry DSN is not a secret, so it can be present in the browser bundle. It
should still stay configurable because staging, local development, and
production may use different Sentry projects or environments.

Docker changes should pass public Sentry variables as build args so the client
bundle can initialize Sentry after an image build:

```yaml
services:
  web:
    build:
      context: .
      target: runner
      args:
        NEXT_PUBLIC_SENTRY_DSN: ${NEXT_PUBLIC_SENTRY_DSN:-}
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: ${NEXT_PUBLIC_SENTRY_ENVIRONMENT:-production}
        NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: ${NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:-0.05}
        SENTRY_RELEASE: ${SENTRY_RELEASE:-}
```

The same values should also appear in `web.environment` for runtime
consistency, and server-only values should be passed there as well. The `tools`
service does not need Sentry unless a future task instruments background
maintenance commands.

## Data Flow

At build time, Docker passes `NEXT_PUBLIC_SENTRY_*` args into the builder stage.
Next.js embeds those values in browser code during `pnpm run build`.

At runtime, the `web` container starts `next start`. The instrumentation file
loads the Node or Edge Sentry config depending on `NEXT_RUNTIME`. Server errors
flow directly from the running container to Sentry SaaS using `SENTRY_DSN` or a
fallback public DSN. Browser errors flow from the user's browser to Sentry using
`NEXT_PUBLIC_SENTRY_DSN`.

Docker stdout remains separate. Startup failures, missing environment variables,
database connection errors before Sentry initializes, and PostgreSQL logs are
still monitored with `docker compose logs`.

## Privacy And Safety

Do not enable `sendDefaultPii`. Do not add user session, request headers,
cookies, database URLs, auth secrets, or full document content to Sentry event
contexts.

If custom context is added later, it must pass through an explicit scrubber for
known sensitive keys such as `DATABASE_URL`, `NEXTAUTH_SECRET`, `cookie`,
`authorization`, and document body fields.

Do not add `SENTRY_AUTH_TOKEN` to `docker-compose.yml`, `.env.example`, or
runtime container environment. Source map upload should happen only from a
future CI/deployment step with build-time secret handling.

## Error Handling

If no DSN is configured, initialization should be a no-op and the application
should continue normally.

If an invalid trace sample rate is configured, tracing should be disabled rather
than causing startup failure.

If Sentry package installation or Next.js build integration fails, keep the
Docker logging path unchanged and fix the integration before touching unrelated
application code.

## Testing

Automated verification:

1. Add unit tests for the Sentry configuration helper.
2. Extend Docker contract tests to assert Sentry build args and `web`
   environment propagation.
3. Run the focused Sentry and Docker test files.
4. Run `pnpm exec tsc --noEmit`.
5. Run `pnpm run build`.

Manual verification with a real Sentry DSN:

1. Build and start the production Compose service with Sentry env values.
2. Confirm `docker compose logs -f web postgres` still shows normal startup and
   database connectivity logs.
3. Trigger a local browser-side or server-side error with a temporary
   verification-only edit or interactive path, then revert it before commit.
4. Confirm the event appears in the configured Sentry project with the expected
   environment, release if configured, and sample-rate behavior.

## Source Evidence

- GitHub issue #89
- `docker-compose.yml`
- `Dockerfile`
- `next.config.mjs`
- `tests/docker/compose.test.ts`
- `wiki/Local Development Workflow.md`
- Sentry Next.js manual setup documentation
- Sentry Next.js source map documentation
