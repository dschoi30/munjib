# OCI CI/CD Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing GitHub Actions workflow deploy successful `main` pushes to the current Oracle Cloud Munjib instance at `https://munjib.andrewchoi.link`.

**Architecture:** Keep the current `ci -> publish -> deploy` workflow shape. Change only the deploy job so the remote OCI script authenticates to GHCR with the ephemeral GitHub token, uses `sudo docker`, supplies the published image/release env to Compose, and checks the public domain after restart. Keep server secrets in GitHub secrets or the server `.env`, not source.

**Tech Stack:** GitHub Actions, GHCR, `appleboy/ssh-action`, Docker Compose, Caddy, Next.js, Vitest, YAML static tests, repo wiki tooling.

---

## File Structure

- Modify `.github/workflows/ci-cd.yml`: OCI-aware SSH deploy script.
- Modify `tests/github-actions/ci-cd.test.ts`: static workflow assertions for GHCR login, `sudo docker`, release env, and health check.
- Modify `wiki/CI CD And Monitoring Workflow.md`: current OCI deploy contract after implementation.
- Modify `wiki/Project PRD.md`: implementation status summary.
- Modify `wiki/index.md`: status board summary.
- Modify `wiki/log.md`: implementation log entry.
- Regenerate `wiki/manifest.json`.
- No source files should contain private key material, Sentry DSNs, NextAuth secret values, or Docker registry tokens.

## Task 1: Workflow Static Test

**Files:**
- Modify: `tests/github-actions/ci-cd.test.ts`

- [ ] **Step 1: Extend deploy test assertions before changing workflow**

Add assertions inside the existing `test("deploy job uses SSH secrets and passes the published image tag", () => { ... })` block after the current `WEB_IMAGE` expectation:

```ts
    expect(deployStep?.env).toMatchObject({
      WEB_IMAGE: "${{ needs.publish.outputs.image }}",
      GHCR_USERNAME: "${{ github.actor }}",
      GHCR_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
      SENTRY_RELEASE: "${{ github.sha }}",
      NEXT_PUBLIC_SENTRY_RELEASE: "${{ github.sha }}",
      DEPLOY_HEALTHCHECK_URL: "https://munjib.andrewchoi.link",
    });
    expect(deployStep?.with.envs).toBe(
      "WEB_IMAGE,GHCR_USERNAME,GHCR_TOKEN,SENTRY_RELEASE,NEXT_PUBLIC_SENTRY_RELEASE,DEPLOY_HEALTHCHECK_URL",
    );
    expect(deployStep?.with.script).toContain(
      'printf "%s" "$GHCR_TOKEN" | sudo docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin',
    );
    expect(deployStep?.with.script).toContain("trap 'sudo docker logout ghcr.io >/dev/null 2>&1 || true' EXIT");
    expect(deployStep?.with.script).toContain("sudo env WEB_IMAGE=\"$WEB_IMAGE\" SENTRY_RELEASE=\"$SENTRY_RELEASE\" NEXT_PUBLIC_SENTRY_RELEASE=\"$NEXT_PUBLIC_SENTRY_RELEASE\" docker compose pull web");
    expect(deployStep?.with.script).toContain("sudo env WEB_IMAGE=\"$WEB_IMAGE\" SENTRY_RELEASE=\"$SENTRY_RELEASE\" NEXT_PUBLIC_SENTRY_RELEASE=\"$NEXT_PUBLIC_SENTRY_RELEASE\" docker compose run --rm --build tools pnpm exec prisma migrate deploy");
    expect(deployStep?.with.script).toContain("sudo env WEB_IMAGE=\"$WEB_IMAGE\" SENTRY_RELEASE=\"$SENTRY_RELEASE\" NEXT_PUBLIC_SENTRY_RELEASE=\"$NEXT_PUBLIC_SENTRY_RELEASE\" docker compose run --rm --build tools pnpm run db:rag:index");
    expect(deployStep?.with.script).toContain("sudo env WEB_IMAGE=\"$WEB_IMAGE\" SENTRY_RELEASE=\"$SENTRY_RELEASE\" NEXT_PUBLIC_SENTRY_RELEASE=\"$NEXT_PUBLIC_SENTRY_RELEASE\" docker compose up -d web");
    expect(deployStep?.with.script).toContain('curl --fail --silent --show-error --location --max-time 20 "$DEPLOY_HEALTHCHECK_URL" >/dev/null');
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm exec vitest run tests/github-actions/ci-cd.test.ts
```

Expected: FAIL because `.github/workflows/ci-cd.yml` does not yet include GHCR remote login, `sudo env ... docker compose`, release env, or public health check.

## Task 2: OCI-Aware Deploy Workflow

**Files:**
- Modify: `.github/workflows/ci-cd.yml`

- [ ] **Step 1: Update deploy job env**

Change the `Deploy over SSH` step env to:

```yaml
        env:
          WEB_IMAGE: ${{ needs.publish.outputs.image }}
          GHCR_USERNAME: ${{ github.actor }}
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SENTRY_RELEASE: ${{ github.sha }}
          NEXT_PUBLIC_SENTRY_RELEASE: ${{ github.sha }}
          DEPLOY_HEALTHCHECK_URL: https://munjib.andrewchoi.link
```

- [ ] **Step 2: Update ssh-action env list**

Change:

```yaml
          envs: WEB_IMAGE
```

to:

```yaml
          envs: WEB_IMAGE,GHCR_USERNAME,GHCR_TOKEN,SENTRY_RELEASE,NEXT_PUBLIC_SENTRY_RELEASE,DEPLOY_HEALTHCHECK_URL
```

- [ ] **Step 3: Replace remote script with OCI-safe script**

Use this script:

```yaml
          script: |
            set -euo pipefail
            cd "${{ secrets.DEPLOY_PATH }}"
            git pull --ff-only
            printf "%s" "$GHCR_TOKEN" | sudo docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
            trap 'sudo docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
            sudo env WEB_IMAGE="$WEB_IMAGE" SENTRY_RELEASE="$SENTRY_RELEASE" NEXT_PUBLIC_SENTRY_RELEASE="$NEXT_PUBLIC_SENTRY_RELEASE" docker compose pull web
            sudo env WEB_IMAGE="$WEB_IMAGE" SENTRY_RELEASE="$SENTRY_RELEASE" NEXT_PUBLIC_SENTRY_RELEASE="$NEXT_PUBLIC_SENTRY_RELEASE" docker compose run --rm --build tools pnpm exec prisma migrate deploy
            sudo env WEB_IMAGE="$WEB_IMAGE" SENTRY_RELEASE="$SENTRY_RELEASE" NEXT_PUBLIC_SENTRY_RELEASE="$NEXT_PUBLIC_SENTRY_RELEASE" docker compose run --rm --build tools pnpm run db:rag:index
            sudo env WEB_IMAGE="$WEB_IMAGE" SENTRY_RELEASE="$SENTRY_RELEASE" NEXT_PUBLIC_SENTRY_RELEASE="$NEXT_PUBLIC_SENTRY_RELEASE" docker compose up -d web
            curl --fail --silent --show-error --location --max-time 20 "$DEPLOY_HEALTHCHECK_URL" >/dev/null
```

- [ ] **Step 4: Run focused workflow test and confirm it passes**

Run:

```bash
pnpm exec vitest run tests/github-actions/ci-cd.test.ts
```

Expected: PASS.

## Task 3: Server Production Env Correction

**Files:**
- Remote only: `/home/ubuntu/munjib/.env`
- Remote only: `/home/ubuntu/munjib/.env.docker`

- [ ] **Step 1: Back up remote env files**

Run:

```bash
ssh -i /Users/andrewchoi/Downloads/ssh-key-2026-05-26.key ubuntu@146.56.170.25 'set -euo pipefail; cd /home/ubuntu/munjib; cp .env .env.backup-issue-94; cp .env.docker .env.docker.backup-issue-94'
```

Expected: command exits 0.

- [ ] **Step 2: Merge production runtime values into `.env` without printing secrets**

Run a remote script that preserves existing secret values and adds required public/non-secret values:

```bash
ssh -i /Users/andrewchoi/Downloads/ssh-key-2026-05-26.key ubuntu@146.56.170.25 'set -euo pipefail; cd /home/ubuntu/munjib; python3 - <<'"'"'PY'"'"'
from pathlib import Path

env_path = Path(".env")
docker_env_path = Path(".env.docker")

def parse(path):
    values = {}
    if not path.exists():
        return values
    for line in path.read_text().splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values

values = parse(env_path)
docker_values = parse(docker_env_path)
for key, value in docker_values.items():
    values.setdefault(key, value)

values["NEXTAUTH_URL"] = '"https://munjib.andrewchoi.link"'
values["NEXTAUTH_COOKIE_SECURE"] = "true"
values.setdefault("POSTGRES_PORT", '"55432"')
values.setdefault("WEB_PORT", '"3000"')
values.setdefault("SENTRY_ENVIRONMENT", "production")
values.setdefault("SENTRY_TRACES_SAMPLE_RATE", "1.0")
values.setdefault("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "production")
values.setdefault("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "1.0")
values.setdefault("WEB_IMAGE", "ghcr.io/dschoi30/munjib:latest")

ordered = [
    "DOCKER_DATABASE_URL",
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_COOKIE_SECURE",
    "POSTGRES_PORT",
    "WEB_PORT",
    "WEB_IMAGE",
    "SENTRY_DSN",
    "SENTRY_ENVIRONMENT",
    "SENTRY_RELEASE",
    "SENTRY_TRACES_SAMPLE_RATE",
    "NEXT_PUBLIC_SENTRY_DSN",
    "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
    "NEXT_PUBLIC_SENTRY_RELEASE",
    "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
]
keys = ordered + sorted(k for k in values if k not in ordered)
env_path.write_text("\n".join(f"{key}={values[key]}" for key in keys if key in values) + "\n")
PY'
```

Expected: command exits 0 and does not print secret values.

- [ ] **Step 3: Verify remote env shape with secrets redacted**

Run:

```bash
ssh -i /Users/andrewchoi/Downloads/ssh-key-2026-05-26.key ubuntu@146.56.170.25 'cd /home/ubuntu/munjib && awk -F= '"'"'/^[A-Za-z_][A-Za-z0-9_]*=/{key=$1; if (key ~ /(SECRET|PASSWORD|TOKEN|DSN|DATABASE_URL|KEY)/) {print key "=<set>"} else {print $0}}'"'"' .env'
```

Expected output includes:

```text
NEXTAUTH_URL="https://munjib.andrewchoi.link"
NEXTAUTH_COOKIE_SECURE=true
WEB_IMAGE=ghcr.io/dschoi30/munjib:latest
SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
```

## Task 4: Wiki Maintenance

**Files:**
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/Project PRD.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Generate: `wiki/manifest.json`

- [ ] **Step 1: Update CI/CD wiki page**

Record that OCI deployment now uses:

```text
DEPLOY_HOST=146.56.170.25
DEPLOY_USER=ubuntu
DEPLOY_PATH=/home/ubuntu/munjib
DEPLOY_HEALTHCHECK_URL=https://munjib.andrewchoi.link
sudo docker compose
remote GHCR login with GITHUB_TOKEN
NEXTAUTH_URL=https://munjib.andrewchoi.link
NEXTAUTH_COOKIE_SECURE=true
```

- [ ] **Step 2: Update log**

Add an implementation entry with source evidence:

```text
.github/workflows/ci-cd.yml
tests/github-actions/ci-cd.test.ts
OCI server read-only inspection
docs/superpowers/specs/2026-06-05-oci-ci-cd-deployment-design.md
```

- [ ] **Step 3: Regenerate manifest and lint**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: `wiki:manifest` writes manifest; `wiki:lint` exits 0, with the existing `wiki/designs/sidebar.md` pasted image unresolved-link warning if still present.

## Task 5: Full Verification

**Files:**
- No edits unless failures require fixes.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/github-actions/ci-cd.test.ts tests/docker/compose.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run wiki sync commands**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: all commands exit 0; `wiki:lint` may repeat the existing sidebar pasted image warning.

- [ ] **Step 3: Verify remote current health**

Run:

```bash
curl -I https://munjib.andrewchoi.link
ssh -i /Users/andrewchoi/Downloads/ssh-key-2026-05-26.key ubuntu@146.56.170.25 'cd /home/ubuntu/munjib && sudo docker compose ps'
```

Expected: HTTPS returns 200; compose project shows `web` and `postgres` running.

## Task 6: Commit, Push, PR, Review Loop

**Files:**
- All changed files.

- [ ] **Step 1: Commit implementation**

Run:

```bash
git add .github/workflows/ci-cd.yml tests/github-actions/ci-cd.test.ts wiki/CI\ CD\ And\ Monitoring\ Workflow.md wiki/Project\ PRD.md wiki/index.md wiki/log.md wiki/manifest.json docs/superpowers/plans/2026-06-05-oci-ci-cd-deployment.md
git commit -m "ci: deploy to OCI instance"
```

- [ ] **Step 2: Configure GitHub secrets**

Run:

```bash
gh secret set DEPLOY_HOST --body "146.56.170.25"
gh secret set DEPLOY_USER --body "ubuntu"
gh secret set DEPLOY_PATH --body "/home/ubuntu/munjib"
gh secret set DEPLOY_PORT --body "22"
gh secret set DEPLOY_SSH_KEY < /Users/andrewchoi/Downloads/ssh-key-2026-05-26.key
```

Expected: each command succeeds.

- [ ] **Step 3: Push and create PR**

Run:

```bash
git push -u origin issue-94-wire-ci-cd-to-oci-deployment
gh pr create --draft --title "Wire CI/CD to OCI deployment" --body "Closes #94"
gh pr ready
```

- [ ] **Step 4: Wait and inspect review/CI**

Wait at least 5 minutes, then run:

```bash
gh pr checks --watch=false
gh pr view --json reviewDecision,mergeStateStatus,statusCheckRollup
```

Expected: report whether PR CI passes, fails, is pending, or is absent. Fix actionable failures before final handoff.
