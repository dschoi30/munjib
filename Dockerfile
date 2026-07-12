FROM node:22-alpine AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

RUN apk add --no-cache libc6-compat openssl \
  && corepack enable

FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder

ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT="production"
ARG NEXT_PUBLIC_SENTRY_RELEASE=""
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="0.05"
ARG NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE="0"
ARG NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE="0"
ARG SENTRY_RELEASE=""

ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_PUBLIC_SENTRY_RELEASE=$NEXT_PUBLIC_SENTRY_RELEASE
ENV NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
ENV NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE
ENV NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE
ENV SENTRY_RELEASE=$SENTRY_RELEASE

COPY . .
RUN pnpm run db:generate
RUN pnpm run build

FROM deps AS tools

COPY . .
RUN pnpm run db:generate

FROM deps AS runner

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# The non-root web/auth-preflight UID cannot write the default Corepack cache
# under /.cache. Keep package-manager metadata in the writable /tmp path instead;
# this contains no application secrets and makes both `pnpm start` and the
# isolated preflight command deterministic after production pruning.
ENV HOME=/tmp
ENV COREPACK_HOME=/tmp/.cache/node/corepack

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.mjs ./next.config.mjs
# The production auth-preflight service runs from this same image. Keep only
# the small source surface needed by its strict runtime validator; tsx is a
# production dependency so pruning devDependencies cannot remove the command.
COPY --from=builder /app/scripts/security ./scripts/security
COPY --from=builder /app/lib/auth ./lib/auth
COPY --from=builder /app/lib/runtime ./lib/runtime
COPY --from=builder /app/lib/security ./lib/security
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN pnpm run db:generate \
  && generated_prisma_client="$(find node_modules -type d -path '*/.prisma/client' -print -quit)" \
  && test -n "$generated_prisma_client" \
  && rm -rf /tmp/prisma-client \
  && mkdir -p /tmp/prisma-client \
  && cp -a "$generated_prisma_client/." /tmp/prisma-client/ \
  && CI=true pnpm prune --prod \
  && rm -rf node_modules/.prisma \
  && mkdir -p node_modules/.prisma/client \
  && cp -a /tmp/prisma-client/. node_modules/.prisma/client/ \
  && node -e 'require("@prisma/client")' \
  && rm -rf /tmp/prisma-client \
  && chown -R 10001:10001 /tmp/.cache

EXPOSE 3000

CMD ["pnpm", "start"]

FROM deps AS dev

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY . .
RUN pnpm run db:generate

EXPOSE 3000

CMD ["pnpm", "run", "dev"]
