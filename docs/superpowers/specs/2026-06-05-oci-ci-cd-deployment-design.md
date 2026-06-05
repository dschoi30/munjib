# OCI CI/CD Deployment Design

## Context

Issue #94 wires the existing GitHub Actions CI/CD workflow to the currently
running Oracle Cloud Ubuntu instance for Munjib.

The repository originally had `.github/workflows/ci-cd.yml` with three jobs:

- `ci` runs for pull requests and `main` pushes.
- `publish` runs on `main` pushes and publishes the Docker `runner` image to
  GHCR.
- `deploy` runs on `main` pushes and deploys over SSH.

Issue #98 supersedes the GHCR publish/pull deploy path for the current OCI
instance. The workflow now keeps the `ci` job and makes `deploy` depend directly
on `ci`; production image build happens natively on the OCI ARM64 host after the
server checkout fetches `origin/main` and checks out the exact GitHub SHA that
passed CI.

The OCI instance is already serving the app at:

```text
https://munjib.andrewchoi.link
```

Observed current server state:

- Public IP: `146.56.170.25`.
- SSH user: `ubuntu`.
- SSH key used from this machine:
  `/Users/andrewchoi/Downloads/ssh-key-2026-05-26.key`.
- Compose project path: `/home/ubuntu/munjib`.
- Compose project name: `munjib`.
- Caddy is active and reverse proxies `munjib.andrewchoi.link` to
  `127.0.0.1:3000`.
- Docker access requires `sudo docker ...`; the `ubuntu` user cannot access the
  Docker socket directly.
- Current `web` container runs from local image `munjib-web`, not GHCR.
- Server is not logged in to GHCR, and
  `ghcr.io/dschoi30/munjib:latest` manifest access is currently unauthorized.
- The server `.env` contains `NEXTAUTH_URL="https://munjib.andrewchoi.link"`,
  but the active container was created with compose environment file
  `/home/ubuntu/munjib/.env.docker`, so runtime `NEXTAUTH_URL` fell back to
  `http://localhost:3000`.
- PR #97 briefly changed GHCR publish to a `linux/amd64,linux/arm64`
  Buildx/QEMU manifest after an amd64-only image failed on OCI, but the next
  main run (`27017475831`) spent too long in `Publish image > Build and push
  runtime image` and was cancelled. Current deployment therefore avoids QEMU
  publish latency by building on the OCI host.

## Goals

- Deploy every successful `main` push to the OCI instance automatically.
- Keep pull request CI validation unchanged.
- Build the production `web` and `tools` images on the OCI host's native
  platform.
- Make the remote deploy work with the server's current `sudo docker` reality.
- Ensure production runtime uses the public domain origin:
  `https://munjib.andrewchoi.link`.
- Preserve Sentry release tagging by using the GitHub SHA for build and runtime
  release values.
- Add a post-deploy HTTP health check against the public domain.
- Avoid hardcoding secrets or OCI-specific sensitive values in source.

## Non-Goals

- Do not provision OCI, DNS, TLS, Caddy, Docker, PostgreSQL, or firewall rules
  from GitHub Actions.
- Do not move the database off the current compose-managed PostgreSQL volume.
- Do not add source map upload or `SENTRY_AUTH_TOKEN` handling in this slice.
- Do not make Playwright e2e mandatory in GitHub Actions in this slice.
- Do not expose production secrets in logs, wiki pages, or committed files.

## Approach

Use the existing SSH deploy workflow, but make the remote script OCI-aware and
avoid registry publish/pull for this instance.

The deploy job will pass these values into the SSH action:

```text
WEB_IMAGE=munjib-web:latest
DEPLOY_SHA=${{ github.sha }}
SENTRY_RELEASE=${{ github.sha }}
NEXT_PUBLIC_SENTRY_RELEASE=${{ github.sha }}
DEPLOY_HEALTHCHECK_URL=http://127.0.0.1:3000
DEPLOY_HEALTHCHECK_HOST=munjib.andrewchoi.link
```

The remote script will:

1. Change to `${{ secrets.DEPLOY_PATH }}`.
2. Fetch `origin/main`, check out `DEPLOY_SHA` in detached mode, and verify
   `git rev-parse HEAD` equals `DEPLOY_SHA`.
3. Build `web` and `tools` on the OCI host with
   `sudo env WEB_IMAGE="$WEB_IMAGE" ... docker compose build web tools`.
4. Run Prisma migrations with the native `tools` image.
5. Run RAG vector index setup with the native `tools` image.
6. Start `web` with the native image and release env.
7. Retry `http://127.0.0.1:3000` with `Host: munjib.andrewchoi.link` until it
   returns HTTP 200 or 10 attempts fail.
8. Prune dangling Docker images with `sudo docker image prune -f`.

After the SSH action completes, the deploy job runs a separate public health
check from the GitHub-hosted runner against `https://munjib.andrewchoi.link`.
The remote local check avoids OCI hairpin NAT assumptions; the runner check
keeps DNS/TLS/Caddy public routing covered.

The script should always avoid printing secret values and should not enable
shell tracing.

Post-merge deploy observation for Issue #96 showed that the OCI instance pulls
images as `linux/arm64/v8`. Issue #96 temporarily made the GHCR publish job push
a multi-platform manifest including `linux/arm64`; an amd64-only image failed at
`docker compose pull web` with `no matching manifest for linux/arm64/v8`. Issue
#98 replaces that path with native OCI build to avoid cross-platform publish
latency and to keep the deploy path closer to the current manual server build.

## Server Environment Contract

The OCI server should keep a production compose env file at:

```text
/home/ubuntu/munjib/.env
```

Required values:

```text
NEXTAUTH_URL=https://munjib.andrewchoi.link
NEXTAUTH_COOKIE_SECURE=true
POSTGRES_PORT=55432
WEB_PORT=3000
DOCKER_DATABASE_URL=postgresql://obsidian:obsidian@postgres:5432/obsidian_clone?schema=public
NEXTAUTH_SECRET=<server secret>
WEB_IMAGE=munjib-web:latest
SENTRY_DSN=<server secret, optional but configured if Sentry is desired>
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=1.0
NEXT_PUBLIC_SENTRY_DSN=<public DSN, optional but configured if browser Sentry is desired>
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=1.0
```

`SENTRY_RELEASE` and `NEXT_PUBLIC_SENTRY_RELEASE` should come from the deploy
job for each deployed GitHub SHA. The server can keep fallback values, but the
deploy job's values should win for the active release.

The existing `.env.docker` file should stop being the active production env file
unless it is expanded to include the same NextAuth, DB, port, and Sentry values.
Using `.env.docker` with only Sentry values causes `NEXTAUTH_URL` to fall back to
`http://localhost:3000`.

## GitHub Configuration

Required repository secrets:

```text
DEPLOY_HOST=146.56.170.25
DEPLOY_USER=ubuntu
DEPLOY_SSH_KEY=<contents of /Users/andrewchoi/Downloads/ssh-key-2026-05-26.key>
DEPLOY_PATH=/home/ubuntu/munjib
DEPLOY_PORT=22
```

Server env values used for Sentry build-time browser config:

```text
NEXT_PUBLIC_SENTRY_DSN
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=1.0
```

The deploy job no longer needs GHCR package permission or registry login for the
current OCI instance because the production image is built on the server. During
the initial production observation period, keep
`NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=1.0` in the server env so the browser
bundle is built with full tracing; lower it later when the signal is well
understood.

## Error Handling

CI failures stop deploy.

Deploy fails if:

- SSH cannot connect.
- `DEPLOY_PATH` does not exist.
- `git fetch --force origin main`, detached checkout, or SHA verification fails.
- OCI native `docker compose build web tools` fails.
- Prisma migration fails.
- RAG vector index setup fails.
- `docker compose up -d web` fails.
- Remote local health check does not return HTTP 200 after 10 attempts.
- Public health check from the GitHub-hosted runner fails.

Cross-platform GHCR image manifest failures and registry auth failures are no
longer on the current deploy path. They may still matter if the project returns
to registry-based deployment later.

## Testing

Local verification:

```bash
pnpm exec vitest run tests/github-actions/ci-cd.test.ts tests/docker/compose.test.ts
pnpm wiki:manifest
pnpm wiki:lint
```

Remote verification:

```bash
ssh -i /Users/andrewchoi/Downloads/ssh-key-2026-05-26.key ubuntu@146.56.170.25 'cd /home/ubuntu/munjib && sudo docker compose ps'
curl -I https://munjib.andrewchoi.link
```

PR verification should confirm the GitHub Actions PR CI job starts and report
its status. Deploy only runs after merge to `main`.

## Wiki Updates

Update durable knowledge in:

- `wiki/CI CD And Monitoring Workflow.md`
- `wiki/Production Observability Workflow.md` only if the observability contract
  changes
- `wiki/index.md` if the status board needs a new OCI deployment note
- `wiki/log.md`
- `wiki/manifest.json`

## Open Questions

- Whether to remove `.env.docker` from the server or keep it as a local manual
  helper after merging its production values into `.env`.
- Whether to add a dedicated `/api/health` endpoint in a later slice. The first
  slice uses `curl` against the app root because it already returns HTTP 200
  after redirects.
