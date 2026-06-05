# OCI CI/CD Deployment Design

## Context

Issue #94 wires the existing GitHub Actions CI/CD workflow to the currently
running Oracle Cloud Ubuntu instance for Munjib.

The repository already has `.github/workflows/ci-cd.yml` with three jobs:

- `ci` runs for pull requests and `main` pushes.
- `publish` runs on `main` pushes and publishes the Docker `runner` image to
  GHCR.
- `deploy` runs on `main` pushes and deploys over SSH.

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

## Goals

- Deploy every successful `main` push to the OCI instance automatically.
- Keep pull request CI validation unchanged.
- Reuse the existing GHCR image publishing path.
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

Use the existing SSH deploy workflow, but make the remote script OCI-aware.

The deploy job will pass these values into the SSH action:

```text
WEB_IMAGE=${{ needs.publish.outputs.image }}
GHCR_USERNAME=${{ github.actor }}
GHCR_TOKEN=${{ secrets.GITHUB_TOKEN }}
SENTRY_RELEASE=${{ github.sha }}
NEXT_PUBLIC_SENTRY_RELEASE=${{ github.sha }}
```

The remote script will:

1. Change to `${{ secrets.DEPLOY_PATH }}`.
2. Fast-forward the server checkout with `git pull --ff-only`.
3. Log in to GHCR using the ephemeral `GITHUB_TOKEN`.
4. Pull the published `web` image with `sudo docker compose pull web`.
5. Run Prisma migrations with the rebuilt `tools` image.
6. Run RAG vector index setup with the rebuilt `tools` image.
7. Start `web` with the published image and release env.
8. Log out of GHCR.
9. Check `https://munjib.andrewchoi.link` returns HTTP 200.

The script should always avoid printing secret values. It should use
`--password-stdin` for registry login and should not enable shell tracing.

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
SENTRY_DSN=<server secret, optional but configured if Sentry is desired>
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.05
NEXT_PUBLIC_SENTRY_DSN=<public DSN, optional but configured if browser Sentry is desired>
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05
```

`SENTRY_RELEASE` and `NEXT_PUBLIC_SENTRY_RELEASE` should come from the deploy
job for each published SHA. The server can keep fallback values, but the deploy
job's values should win for the active release.

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

Optional repository variables/secrets for Sentry build-time browser config:

```text
NEXT_PUBLIC_SENTRY_DSN
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05
```

The deploy job uses `GITHUB_TOKEN` for GHCR login. The package is private, so the
remote server must authenticate before pull. No long-lived GHCR token is needed
for this slice.

## Error Handling

CI failures stop publish and deploy.

Publish failures stop deploy.

Deploy fails if:

- SSH cannot connect.
- `DEPLOY_PATH` does not exist.
- `git pull --ff-only` cannot fast-forward.
- GHCR login or image pull fails.
- Prisma migration fails.
- RAG vector index setup fails.
- `docker compose up -d web` fails.
- Public health check does not return HTTP 200.

Registry logout should run at the end of the deploy script even if later deploy
steps fail. If this becomes awkward in the inline workflow script, keep the
script simple and prefer not storing any long-lived registry token on the server.

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
  slice uses `curl` against the public homepage because the app already returns
  HTTP 200 there.
