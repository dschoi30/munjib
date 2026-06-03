# GitHub Actions CI/CD Design

## Context

Issue #88 configures GitHub Actions for Munjib. The repository currently has no
`.github` workflow directory. Local validation is pnpm-based and the runtime
deployment shape is Docker Compose:

- `pnpm run build` builds the Next.js App Router monolith.
- `pnpm test` runs Vitest unit and integration tests.
- `pnpm run test:e2e` runs Playwright after `pnpm run db:seed`.
- `Dockerfile` has a production `runner` target.
- `docker-compose.yml` runs `postgres`, `web`, and a `tools` profile.
- Production-style operation preserves PostgreSQL data and web attachment
  storage in named Docker volumes.

The selected target is CI plus Docker image publishing plus server deployment.

## Goals

- Run CI automatically for pull requests and pushes to `main`.
- Build confidence in the same Docker image shape used by production.
- Publish the production `runner` image to GitHub Container Registry on `main`.
- Deploy the published image to the server over SSH after a successful `main`
  publish.
- Keep deployment compatible with the existing Docker Compose operational model.
- Document required GitHub secrets and server assumptions in the wiki.

## Non-Goals

- Do not redesign the application runtime.
- Do not move the database into GitHub Actions beyond optional test services.
- Do not make e2e tests a mandatory first-slice gate unless the implementation
  confirms the database and browser setup is stable in Actions.
- Do not provision the server, domain, TLS, firewall, Ollama service, or GitHub
  secrets automatically.
- Do not store production secrets in the repository.

## Approach

Add one GitHub Actions workflow, `.github/workflows/ci-cd.yml`, with three jobs:

1. `ci`
   - Runs on pull requests and pushes to `main`.
   - Checks out the repository.
   - Enables Corepack and installs pnpm from `package.json`.
   - Installs dependencies with the frozen lockfile.
   - Runs `pnpm run db:generate`.
   - Runs `pnpm test`.
   - Runs `pnpm run build`.
   - Builds the Docker `runner` target without pushing it.

2. `publish`
   - Runs only on pushes to `main`.
   - Requires `ci`.
   - Logs in to `ghcr.io` with `GITHUB_TOKEN`.
   - Builds the `runner` target with Docker Buildx.
   - Pushes `ghcr.io/dschoi30/munjib:<sha>` and
     `ghcr.io/dschoi30/munjib:latest`.

3. `deploy`
   - Runs only on pushes to `main`.
   - Requires `publish`.
   - Uses SSH credentials stored as GitHub secrets.
   - Connects to the production server.
   - Changes to the configured compose project directory.
   - Pulls the published web image and restarts the web service.

This keeps pull requests validation-only and reserves publishing/deployment for
code that reaches `main`.

## Deployment Contract

The workflow expects these GitHub repository secrets:

- `DEPLOY_HOST`: production server hostname or IP.
- `DEPLOY_USER`: SSH user.
- `DEPLOY_SSH_KEY`: private key with permission to deploy the compose project.
- `DEPLOY_PORT`: optional SSH port, defaulting to `22`.
- `DEPLOY_PATH`: server directory containing the production compose project.

The server is expected to have:

- Docker and Docker Compose available to `DEPLOY_USER`.
- A compose project that can run Munjib with the existing `postgres` and `web`
  service model.
- A deployment path containing the compose files and environment configuration.
- Access to pull `ghcr.io/dschoi30/munjib` images.

If GHCR package visibility or server authentication blocks pulling the image,
the implementation should document the required `docker login ghcr.io` setup
rather than embedding registry credentials in the workflow.

## Error Handling

CI failures stop publish and deploy. Docker build failures stop publish and
deploy. Publish failures stop deploy.

Deployment should fail loudly if SSH cannot connect, `DEPLOY_PATH` is missing,
the image cannot be pulled, or Compose restart fails. The workflow logs should
show which remote command failed without printing secret values.

The remote deploy command should prefer an explicit image tag based on the
GitHub SHA when the server compose setup supports it. If the server currently
tracks `latest`, the implementation may use `latest` as the first slice and
record that limitation in the wiki.

## Testing

Local verification for the implementation should include:

- Workflow syntax and static review.
- `pnpm test`.
- `pnpm run build`.
- `docker build --target runner .`.
- Wiki maintenance commands required by `AGENTS.md`.

CI verification after opening the PR should confirm the GitHub Actions run starts
and report whether it passes, fails, or is blocked by missing secrets. Deploy
secrets are not required for pull request validation.

## Wiki Updates

Add durable CI/CD knowledge to the wiki:

- Update `wiki/Local Development Workflow.md` or add a focused CI/CD workflow
  page if the deployment details become large.
- Update `wiki/index.md` navigation.
- Regenerate `wiki/manifest.json`.
- Append a `wiki/log.md` entry with issue #88, source evidence, claims added,
  and validation status.

## Source Evidence

- GitHub issue #88
- `package.json`
- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `playwright.config.ts`
- `vitest.config.ts`
- `wiki/index.md`
- `wiki/Local Development Workflow.md`
