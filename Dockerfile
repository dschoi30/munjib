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

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.mjs ./next.config.mjs

RUN pnpm run db:generate \
  && pnpm prune --prod

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
