# Dockerized Next.js Web Service Design

## Context

Munjib is a Next.js App Router monolith backed by Prisma and PostgreSQL. The repository already has `docker-compose.yml` for the local PostgreSQL service only. Local app startup currently happens outside Docker with `pnpm run dev` or `pnpm run start`.

Issue #50 extends the existing Docker setup so the database and web service can be started together.

## Decision

Build both Docker modes:

- Production-style mode: `docker compose up --build` starts PostgreSQL plus a built Next.js web container running `pnpm start`.
- Development mode: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` starts PostgreSQL plus a source-mounted web container running `pnpm run dev`.

The default `docker-compose.yml` remains the main entry point and uses the internal Compose hostname `postgres` in the web container `DATABASE_URL`. Host-machine development keeps using `localhost:55432` through `.env`.

## Architecture

Add a multi-stage `Dockerfile`:

- `deps` installs workspace dependencies from `pnpm-lock.yaml`.
- `builder` generates Prisma Client and runs `pnpm run build`.
- `runner` installs production dependencies, copies the built app and Prisma schema, generates Prisma Client, and runs `pnpm start`.
- `dev` installs dependencies and runs `pnpm run dev` for source-mounted development.

Add `.dockerignore` so Docker build context excludes local dependencies, build output, git metadata, environment files, test artifacts, and worktrees.

Extend Compose:

- `postgres` stays the existing database service, volume, port, and healthcheck.
- `web` depends on healthy `postgres`, exposes `3000:3000`, sets `DATABASE_URL` to `postgresql://obsidian:obsidian@postgres:5432/obsidian_clone?schema=public`, and sets `NEXTAUTH_URL` to `http://localhost:3000`.
- `docker-compose.dev.yml` overrides `web` to use the `dev` target, source mount, anonymous dependency/build volumes, and the dev command.

Add `.env.docker.example` to document Docker-specific environment defaults without changing host `.env.example`.

## Data Flow

The host browser calls `http://localhost:3000`. Docker maps that to the `web` container. The web container reaches PostgreSQL over the Compose network at `postgres:5432`. The host can still connect to PostgreSQL through `localhost:55432`.

Database schema and seed are explicit commands, not hidden in container startup:

```bash
docker compose run --rm web pnpm exec prisma migrate deploy
docker compose run --rm web pnpm run db:seed
```

For local development schemas without production migrations, developers may run:

```bash
docker compose run --rm web pnpm exec prisma db push
```

## Error Handling

The `web` service waits for PostgreSQL health before startup. Compose does not automatically run migrations or seed data; missing tables should fail loudly through Prisma so the developer can run the documented schema command.

## Testing

Add a Vitest static test that parses Docker-related files as text and validates the expected contract:

- default Compose contains `postgres` and `web`
- `web` depends on healthy `postgres`
- container `DATABASE_URL` uses `postgres:5432`
- development override uses the `dev` Docker target and `pnpm run dev`
- `.dockerignore` excludes important local-only paths
- Dockerfile exposes production and development targets

Manual verification should build the production image and start Compose, then check that `http://localhost:3000` responds after schema setup.

## Wiki Updates

Update `wiki/Local Development Workflow.md` with Docker startup commands, schema/seed commands, and the distinction between host `localhost:55432` and container `postgres:5432`. Update `wiki/index.md`, `wiki/manifest.json`, and `wiki/log.md` through the normal wiki maintenance flow.
