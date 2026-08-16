# Private OCI Self-Hosted Deploy Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve automatic production deployment after successful `main` CI without reopening public SSH by running only the deploy job on a repository-scoped self-hosted runner inside the existing OCI VM.

**Architecture:** Keep all PR and `main` validation on GitHub-hosted `ubuntu-latest`. A dedicated unprivileged `munjib-runner` service on the private production OCI receives only the `main` deploy job over outbound HTTPS and invokes one root-owned wrapper with an exact commit SHA; the GitHub job token is passed on standard input and is never persisted. The wrapper validates the SHA against `origin/main`, serializes deployments, reuses fixed host-local configuration and secrets, runs the existing native ARM64 build/migration/index/Compose flow, and writes the deployed SHA only after local and public health checks pass.

**Tech Stack:** GitHub Actions, repository-scoped GitHub self-hosted runner for Linux ARM64, Bash, sudoers, Git, Docker Compose, Prisma, Vitest/YAML static contract tests, OCI Bastion, systemd.

**Spec:** `docs/superpowers/specs/2026-08-16-private-oci-self-hosted-deploy-runner-design.md`

## Global Constraints

- Start implementation in an isolated worktree created from current `origin/main`; do not implement on the stale `issue-208-vault-transit-release-signer-adapter-and-local-community-lab` checkout.
- Before source implementation, run `pnpm wiki:feature-start "[MVP Ops] Keep CD through a private OCI self-hosted runner"` and use the created issue/branch according to repository rules.
- The repository is private and the runner is scoped only to `dschoi30/munjib`.
- PR and general CI jobs remain on `ubuntu-latest`; no `pull_request` job may target the production runner.
- Production deploy runner labels are exactly `self-hosted`, `linux`, `ARM64`, and `munjib-production`.
- The runner receives jobs through outbound HTTPS 443; no inbound port or public SSH rule is added.
- The runner service account is `munjib-runner`; it is not `root`, not `ubuntu`, has no SSH authorized key, and is not in the `docker` group.
- The only passwordless sudo target is `/usr/local/sbin/munjib-deploy`; generic shell, Git, Docker, Compose, systemctl, package-manager, editor, and copy commands are not authorized.
- The wrapper accepts exactly one lowercase 40-character hexadecimal SHA argument and reads the ephemeral GitHub job token from standard input.
- The wrapper uses fixed paths: `/home/ubuntu/munjib`, `/etc/munjib/env`, `/etc/munjib/secrets`, `/var/lib/munjib/deploy/current-sha`, and `/run/lock/munjib-deploy.lock`.
- The wrapper never uses `set -x`, never prints token or secret contents, and never writes the GitHub job token to disk or persistent Git configuration.
- Production deploy concurrency is `group: munjib-production` with `cancel-in-progress: false`.
- Issue #185, PR #188, Vault, bundle signer, delivery broker, separate runner VM, and reverse DB migrations remain out of scope.
- Host bootstrap and cutover occur only after source review and through the existing OCI Bastion path.
- Every commit stages only the explicitly listed files, followed by the required wiki sync workflow before commit.

## File Structure

- Create `scripts/deploy/munjib-deploy.sh`: reviewed source for the fixed privileged production deployment wrapper installed as `/usr/local/sbin/munjib-deploy`.
- Create `deploy/sudoers/munjib-actions-runner`: narrow sudoers rule allowing `munjib-runner` to invoke only the installed wrapper.
- Create `tests/deploy/self-hosted-deploy-contract.test.ts`: wrapper/sudoers source-contract tests for exact SHA input, stdin token handling, fixed paths, locking, ordering, secret redaction, and forbidden privileges.
- Modify `.github/workflows/ci-cd.yml`: keep CI GitHub-hosted; route `main` deploy to the four-label self-hosted runner and invoke the wrapper through sudo.
- Modify `tests/github-actions/ci-cd.test.ts`: replace SSH deploy assertions with main-only self-hosted runner, concurrency, stdin token, exact SHA, and removed deploy-secret assertions.
- Create `.github/workflows/runner-smoke.yml`: permanent manual-only read-only diagnostic, available after cutover and never triggered by pull requests or pushes.
- Create `docs/runbooks/private-oci-self-hosted-runner.md`: beginner-oriented Bastion bootstrap, checksum verification, repository registration, wrapper installation, verification, disablement, and credential rotation procedure.
- Modify `wiki/CI CD And Monitoring Workflow.md`: implemented runner topology, fixed deploy contract, failure behavior, and manual recovery.
- Modify `wiki/Release Signer And Vault Workflow.md`: mark Vault/signer/broker as explicit post-MVP work and prevent the runner path from being described as attested delivery.
- Modify `wiki/index.md`: route operators to the current self-hosted runner workflow and runbook.
- Modify `wiki/log.md`: record the implementation and production verification evidence without secrets.
- Regenerate `wiki/manifest.json`.

---

### Task 0: Create the issue and isolated implementation worktree

**Files:**
- No source changes

**Interfaces:**
- Consumes: current `origin/main`, repository feature-start workflow
- Produces: GitHub issue number and isolated `issue-<number>-...` branch/worktree used by all later tasks

- [ ] **Step 1: Inspect the current checkout without changing it**

Run:

```bash
git status --short --branch
git rev-parse --show-toplevel
git worktree list
```

Expected: current checkout is the older Issue #208 branch with unrelated untracked files; do not stage, delete, or move them.

- [ ] **Step 2: Refresh the remote base**

Run:

```bash
git fetch origin main
git rev-parse origin/main
```

Expected: prints the current remote `main` SHA.

- [ ] **Step 3: Create an isolated worktree from `origin/main`**

Invoke `superpowers:using-git-worktrees` and follow its environment detection. Use a branch name with the required `codex/` prefix until `wiki:feature-start` supplies or confirms the issue branch mapping.

Expected: a clean linked worktree whose HEAD equals the refreshed `origin/main`.

- [ ] **Step 4: Create the required GitHub issue**

In the isolated worktree, run:

```bash
pnpm wiki:feature-start "[MVP Ops] Keep CD through a private OCI self-hosted runner"
```

Expected: a GitHub issue is created and the branch is named or associated with `issue-<number>-keep-cd-through-a-private-oci-self-hosted-runner`. Record the issue number in the PR body later.

- [ ] **Step 5: Verify the implementation worktree is clean**

Run:

```bash
git status --short --branch
git rev-parse HEAD
git merge-base --is-ancestor origin/main HEAD
```

Expected: no untracked or modified files, and the ancestry check exits `0`.

- [ ] **Step 6: Carry the approved design and plan into the isolated worktree**

The approved files currently exist only as untracked files in the original checkout. Recreate their exact contents in the isolated worktree with `apply_patch`:

```text
docs/superpowers/specs/2026-08-16-private-oci-self-hosted-deploy-runner-design.md
docs/superpowers/plans/2026-08-16-private-oci-self-hosted-deploy-runner.md
```

Run:

```bash
cmp \
  /Users/andrewchoi/Documents/munjib/docs/superpowers/specs/2026-08-16-private-oci-self-hosted-deploy-runner-design.md \
  docs/superpowers/specs/2026-08-16-private-oci-self-hosted-deploy-runner-design.md
cmp \
  /Users/andrewchoi/Documents/munjib/docs/superpowers/plans/2026-08-16-private-oci-self-hosted-deploy-runner.md \
  docs/superpowers/plans/2026-08-16-private-oci-self-hosted-deploy-runner.md
```

Expected: both comparisons exit `0`. Do not stage any other untracked file from the original checkout.

### Task 1: Specify the privileged wrapper and sudo boundary with failing tests

**Files:**
- Create: `tests/deploy/self-hosted-deploy-contract.test.ts`
- Create initially as test targets in later task: `scripts/deploy/munjib-deploy.sh`, `deploy/sudoers/munjib-actions-runner`

**Interfaces:**
- Consumes: fixed paths and privilege contract from the spec
- Produces: Vitest contract suite that Task 2 must satisfy

- [ ] **Step 1: Create the wrapper contract test**

Create `tests/deploy/self-hosted-deploy-contract.test.ts` with tests that read the wrapper and sudoers files as text:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("private OCI self-hosted deployment boundary", () => {
  const wrapper = read("scripts/deploy/munjib-deploy.sh");
  const sudoers = read("deploy/sudoers/munjib-actions-runner");

  test("accepts one exact commit SHA and token only through stdin", () => {
    expect(wrapper).toContain('[[ "$#" -eq 1 ]]');
    expect(wrapper).toContain('[[ "$deploy_sha" =~ ^[a-f0-9]{40}$ ]]');
    expect(wrapper).toContain('IFS= read -r deploy_token');
    expect(wrapper).toContain('[[ -n "$deploy_token" ]]');
    expect(wrapper).not.toContain("set -x");
    expect(wrapper).not.toContain("GITHUB_TOKEN=");
  });

  test("uses fixed resources and serializes deployments", () => {
    expect(wrapper).toContain('repo_dir=/home/ubuntu/munjib');
    expect(wrapper).toContain('env_file=/etc/munjib/env');
    expect(wrapper).toContain('secret_dir=/etc/munjib/secrets');
    expect(wrapper).toContain('state_file=/var/lib/munjib/deploy/current-sha');
    expect(wrapper).toContain('lock_file=/run/lock/munjib-deploy.lock');
    expect(wrapper).toContain('flock -n 9');
    expect(wrapper).not.toContain("eval ");
  });

  test("proves the SHA belongs to main before mutation", () => {
    expect(wrapper).toContain('fetch --force "https://github.com/dschoi30/munjib.git" main');
    expect(wrapper).toContain('sudo -u ubuntu git -C "$repo_dir" merge-base --is-ancestor "$deploy_sha" origin/main');
    expect(wrapper).toContain('sudo -u ubuntu git -C "$repo_dir" checkout --detach "$deploy_sha"');
    expect(wrapper).toContain('[[ "$(sudo -u ubuntu git -C "$repo_dir" rev-parse HEAD)" == "$deploy_sha" ]]');
  });

  test("runs preflight migration index deployment and health in order", () => {
    const preflight = wrapper.indexOf("pnpm security:auth-preflight");
    const migrate = wrapper.indexOf("pnpm exec prisma migrate deploy");
    const index = wrapper.indexOf("pnpm run db:rag:index");
    const up = wrapper.indexOf("up -d web");
    const localHealth = wrapper.indexOf("http://127.0.0.1:3000");
    const publicHealth = wrapper.indexOf("https://munjib.andrewchoi.link");
    const stateWrite = wrapper.indexOf('mv -f "$state_tmp" "$state_file"');

    expect(preflight).toBeGreaterThan(-1);
    expect(migrate).toBeGreaterThan(preflight);
    expect(index).toBeGreaterThan(migrate);
    expect(up).toBeGreaterThan(index);
    expect(localHealth).toBeGreaterThan(up);
    expect(publicHealth).toBeGreaterThan(localHealth);
    expect(stateWrite).toBeGreaterThan(publicHealth);
  });

  test("authorizes only the fixed wrapper through sudo", () => {
    expect(sudoers).toContain(
      "munjib-runner ALL=(root) NOPASSWD: /usr/local/sbin/munjib-deploy *",
    );
    expect(sudoers).not.toMatch(/\b(docker|git|systemctl|bash|sh|cp|mv|tee|vi|nano)\b/);
  });
});
```

- [ ] **Step 2: Run the contract test and confirm the expected red state**

Run:

```bash
pnpm exec vitest run tests/deploy/self-hosted-deploy-contract.test.ts
```

Expected: FAIL because `scripts/deploy/munjib-deploy.sh` and `deploy/sudoers/munjib-actions-runner` do not exist.

- [ ] **Step 3: Commit the red test**

Run the wiki commit guardrail first:

```bash
git add -- tests/deploy/self-hosted-deploy-contract.test.ts
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
```

Add a deliberate wiki log entry identifying this as the red contract for the new issue, regenerate and verify:

```bash
pnpm wiki:manifest
git add -- wiki/log.md wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "test: define self-hosted deploy boundary"
```

Expected: commit succeeds with only the test and required wiki maintenance.

### Task 2: Implement the fixed production deployment wrapper

**Files:**
- Create: `scripts/deploy/munjib-deploy.sh`
- Create: `deploy/sudoers/munjib-actions-runner`
- Modify: `tests/deploy/self-hosted-deploy-contract.test.ts` only if an assertion needs a technically necessary correction discovered during red-green

**Interfaces:**
- Consumes: one SHA argument and one newline-terminated ephemeral GitHub token on stdin
- Produces: exit `0` only after exact-SHA deployment plus local/public health; atomically updates `/var/lib/munjib/deploy/current-sha`

- [ ] **Step 1: Create the wrapper with fixed constants and input validation**

Create `scripts/deploy/munjib-deploy.sh` beginning with:

```bash
#!/usr/bin/env bash

set -euo pipefail

[[ "$#" -eq 1 ]] || { printf '%s\n' "usage: munjib-deploy <40-char-sha>" >&2; exit 64; }
deploy_sha=$1
[[ "$deploy_sha" =~ ^[a-f0-9]{40}$ ]] || { printf '%s\n' "invalid deploy sha" >&2; exit 64; }

IFS= read -r deploy_token
[[ -n "$deploy_token" ]] || { printf '%s\n' "deploy token required on stdin" >&2; exit 64; }

repo_dir=/home/ubuntu/munjib
env_file=/etc/munjib/env
secret_dir=/etc/munjib/secrets
state_dir=/var/lib/munjib/deploy
state_file=/var/lib/munjib/deploy/current-sha
lock_file=/run/lock/munjib-deploy.lock
health_url=http://127.0.0.1:3000
health_host=munjib.andrewchoi.link
public_health_url=https://munjib.andrewchoi.link

exec 9>"$lock_file"
flock -n 9 || { printf '%s\n' "deployment already in progress" >&2; exit 75; }
```

- [ ] **Step 2: Add fixed host preconditions without printing secrets**

Append checks equivalent to:

```bash
[[ -d "$repo_dir/.git" ]] || { printf '%s\n' "production checkout missing" >&2; exit 69; }
[[ -r "$env_file" ]] || { printf '%s\n' "production env missing" >&2; exit 69; }
[[ -r "$secret_dir/nextauth-current" ]] || { printf '%s\n' "NextAuth secret missing" >&2; exit 69; }

install -d -o root -g root -m 0755 "$state_dir"
[[ -s "$state_file" ]] || { printf '%s\n' "current deployment state not bootstrapped" >&2; exit 69; }
```

Do not `cat`, `source`, or echo the env or secret files.

- [ ] **Step 3: Add token-safe fetch and exact-main admission**

Append:

```bash
git_auth_header="$(printf 'x-access-token:%s' "$deploy_token" | base64 | tr -d '\n')"
deploy_token=

sudo -u ubuntu git -C "$repo_dir" \
  -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $git_auth_header" \
  fetch --force "https://github.com/dschoi30/munjib.git" main
git_auth_header=

sudo -u ubuntu git -C "$repo_dir" merge-base --is-ancestor "$deploy_sha" origin/main
sudo -u ubuntu git -C "$repo_dir" checkout --detach "$deploy_sha"
[[ "$(sudo -u ubuntu git -C "$repo_dir" rev-parse HEAD)" == "$deploy_sha" ]]
```

The script must not write credentials into `.git/config`, credential helpers, or a temporary file.

- [ ] **Step 4: Add deterministic Compose overlay selection**

Use an array, not an eval-built string:

```bash
compose_files=(-f docker-compose.yml)
google_client_id="$({
  awk -v key=GOOGLE_CLIENT_ID '
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
      value=$0
      sub("^[[:space:]]*" key "[[:space:]]*=[[:space:]]*", "", value)
      sub("[[:space:]]*(#.*)?$", "", value)
      single=sprintf("%c", 39)
      if ((substr(value, 1, 1) == "\"" && substr(value, length(value), 1) == "\"") ||
          (substr(value, 1, 1) == single && substr(value, length(value), 1) == single)) {
        value=substr(value, 2, length(value)-2)
      }
      sub("^[[:space:]]*", "", value)
      sub("[[:space:]]*$", "", value)
      print value
      exit
    }
  ' "$env_file"
} 2>/dev/null)"

if [[ -n "$google_client_id" ]]; then
  [[ -r "$secret_dir/google-client-current" ]] || {
    printf '%s\n' "Google OAuth configured but secret missing" >&2
    exit 69
  }
  compose_files+=(-f docker-compose.google.yml)
fi
google_client_id=
```

This reads only whether `GOOGLE_CLIENT_ID` is non-empty and never prints it.

- [ ] **Step 5: Add native build, preflight, migration, index, and deployment**

Append fixed commands in this order:

```bash
cd "$repo_dir"
web_image="munjib-web:$deploy_sha"

env WEB_IMAGE="$web_image" SENTRY_RELEASE="$deploy_sha" NEXT_PUBLIC_SENTRY_RELEASE="$deploy_sha" \
  docker compose "${compose_files[@]}" --env-file "$env_file" build web tools

env WEB_IMAGE="$web_image" \
  docker compose "${compose_files[@]}" --env-file "$env_file" \
  --profile auth-preflight run --rm --no-deps auth-preflight pnpm security:auth-preflight

env WEB_IMAGE="$web_image" \
  docker compose "${compose_files[@]}" --env-file "$env_file" \
  --profile auth-preflight rm --force --stop auth-preflight

env WEB_IMAGE="$web_image" \
  docker compose "${compose_files[@]}" --env-file "$env_file" \
  run --rm tools pnpm exec prisma migrate deploy

env WEB_IMAGE="$web_image" \
  docker compose "${compose_files[@]}" --env-file "$env_file" \
  run --rm tools pnpm run db:rag:index

env WEB_IMAGE="$web_image" SENTRY_RELEASE="$deploy_sha" NEXT_PUBLIC_SENTRY_RELEASE="$deploy_sha" \
  docker compose "${compose_files[@]}" --env-file "$env_file" up -d web
```

- [ ] **Step 6: Add local and public health checks, state update, and safe prune**

Append:

```bash
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --show-error --location --max-time 20 \
    --header "Host: $health_host" "$health_url" >/dev/null; then
    break
  fi
  [[ "$attempt" -lt 10 ]] || exit 1
  sleep 3
done

curl --fail --silent --show-error --location --max-time 20 \
  "$public_health_url" >/dev/null

state_tmp="$(mktemp "$state_dir/.current-sha.XXXXXX")"
trap 'rm -f "${state_tmp:-}"' EXIT
printf '%s\n' "$deploy_sha" >"$state_tmp"
chown root:root "$state_tmp"
chmod 0444 "$state_tmp"
mv -f "$state_tmp" "$state_file"
state_tmp=

docker image prune -f
printf 'deployed_sha=%s\n' "$deploy_sha"
```

Do not claim automatic DB rollback; a health failure exits non-zero and preserves the previously recorded SHA.

- [ ] **Step 7: Create the narrow sudoers source**

Create `deploy/sudoers/munjib-actions-runner`:

```sudoers
munjib-runner ALL=(root) NOPASSWD: /usr/local/sbin/munjib-deploy *
```

No other command appears in this file.

- [ ] **Step 8: Validate shell syntax and run the focused contract tests**

Run:

```bash
bash -n scripts/deploy/munjib-deploy.sh
pnpm exec vitest run tests/deploy/self-hosted-deploy-contract.test.ts tests/deploy/delivery-substrate-contract.test.ts
```

Expected: shell syntax exits `0`; focused tests PASS.

- [ ] **Step 9: Run source safety searches**

Run:

```bash
rg -n 'set -x|eval |GITHUB_TOKEN=|docker group|NOPASSWD:.*(docker|git|bash|sh|systemctl)' \
  scripts/deploy/munjib-deploy.sh deploy/sudoers/munjib-actions-runner
```

Expected: no matches.

- [ ] **Step 10: Commit the wrapper slice**

```bash
git add -- scripts/deploy/munjib-deploy.sh deploy/sudoers/munjib-actions-runner tests/deploy/self-hosted-deploy-contract.test.ts
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add -- wiki/log.md wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(deploy): add fixed self-hosted deploy wrapper"
```

Expected: commit succeeds with only the wrapper, sudoers contract, tests, and required wiki maintenance.

### Task 3: Route only production deploy to the self-hosted runner

**Files:**
- Modify: `tests/github-actions/ci-cd.test.ts`
- Modify: `.github/workflows/ci-cd.yml`
- Create: `.github/workflows/runner-smoke.yml`

**Interfaces:**
- Consumes: `/usr/local/sbin/munjib-deploy <sha>` and token-on-stdin contract from Task 2
- Produces: GitHub-hosted CI plus serialized `main`-only deployment on the four-label OCI runner

- [ ] **Step 1: Replace the old SSH workflow assertions with failing self-hosted assertions**

In `tests/github-actions/ci-cd.test.ts`, preserve all existing CI assertions. Replace the test that looks for `appleboy/ssh-action` with assertions equivalent to:

```ts
test("deploys successful main pushes through the private OCI runner", () => {
  const deploy = workflow.jobs.deploy;
  const deployStep = deploy.steps.find(
    (step: { name?: string }) => step.name === "Deploy exact main SHA",
  );

  expect(workflowText).not.toContain("appleboy/ssh-action");
  expect(deploy.needs).toBe("ci");
  expect(deploy.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'");
  expect(deploy["runs-on"]).toEqual([
    "self-hosted",
    "linux",
    "ARM64",
    "munjib-production",
  ]);
  expect(deploy.permissions).toEqual({ contents: "read" });
  expect(deploy.concurrency).toEqual({
    group: "munjib-production",
    "cancel-in-progress": false,
  });
  expect(deployStep?.run).toBe(
    'printf \'%s\\n\' "${{ github.token }}" | sudo /usr/local/sbin/munjib-deploy "${{ github.sha }}"',
  );
  expect(workflowText).not.toMatch(/DEPLOY_(HOST|USER|PORT|PATH|SSH_KEY)/);
  expect(workflowText).not.toMatch(/DEPLOY_(NEXTAUTH_SECRET|GOOGLE_CLIENT_SECRET)/);
});
```

- [ ] **Step 2: Add smoke-workflow assertions**

In the same test file, parse `.github/workflows/runner-smoke.yml` and assert:

```ts
const smokeText = read(".github/workflows/runner-smoke.yml");
const smoke = parse(smokeText);

expect(smoke.on).toEqual({ workflow_dispatch: null });
expect(smoke.permissions).toEqual({ contents: "read" });
expect(smoke.jobs.smoke["runs-on"]).toEqual([
  "self-hosted",
  "linux",
  "ARM64",
  "munjib-production",
]);
expect(smokeText).not.toContain("sudo");
expect(smokeText).not.toContain("secrets.");
expect(smokeText).not.toContain("actions/checkout");
```

- [ ] **Step 3: Run the workflow test and confirm it fails**

```bash
pnpm exec vitest run tests/github-actions/ci-cd.test.ts
```

Expected: FAIL because deploy still uses SSH and runner smoke workflow does not exist.

- [ ] **Step 4: Create the manual read-only runner smoke workflow**

Create `.github/workflows/runner-smoke.yml`:

```yaml
name: Production runner smoke

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  smoke:
    runs-on:
      - self-hosted
      - linux
      - ARM64
      - munjib-production
    timeout-minutes: 5
    steps:
      - name: Verify runner identity and outbound health
        run: |
          set -euo pipefail
          test "$(id -un)" = munjib-runner
          test "$(uname -m)" = aarch64
          ! id -nG | tr ' ' '\n' | grep -Fx docker
          curl --fail --silent --show-error --location --max-time 20 https://github.com/ >/dev/null
          curl --fail --silent --show-error --location --max-time 20 https://munjib.andrewchoi.link >/dev/null
```

- [ ] **Step 5: Replace the SSH deploy job**

Keep the existing job name and `needs: ci`/`if` conditions. Change the deploy job to:

```yaml
  deploy:
    name: Deploy
    runs-on:
      - self-hosted
      - linux
      - ARM64
      - munjib-production
    needs: ci
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    permissions:
      contents: read
    concurrency:
      group: munjib-production
      cancel-in-progress: false
    timeout-minutes: 45
    steps:
      - name: Deploy exact main SHA
        run: printf '%s\n' "${{ github.token }}" | sudo /usr/local/sbin/munjib-deploy "${{ github.sha }}"
```

Remove `appleboy/ssh-action`, all `DEPLOY_*` workflow env, and the redundant GitHub-hosted `Verify public deployment` step because the wrapper performs both health checks on the runner.

- [ ] **Step 6: Run focused workflow and wrapper tests**

```bash
pnpm exec vitest run tests/github-actions/ci-cd.test.ts tests/deploy/self-hosted-deploy-contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the full local verification for this slice**

```bash
pnpm exec tsc --noEmit --pretty false
pnpm test
git diff --check
```

Expected: TypeScript and test suite pass; diff check reports no whitespace errors.

- [ ] **Step 8: Commit the workflow cutover source**

```bash
git add -- .github/workflows/ci-cd.yml .github/workflows/runner-smoke.yml tests/github-actions/ci-cd.test.ts
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add -- wiki/log.md wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "ci: route production deploy to OCI runner"
```

Expected: commit succeeds with workflow/tests and required wiki maintenance only.

### Task 4: Write the operator runbook and current-state wiki

**Files:**
- Create: `docs/runbooks/private-oci-self-hosted-runner.md`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/Release Signer And Vault Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: wrapper, sudoers, smoke workflow, and failure modes from Tasks 2-3
- Produces: exact human bootstrap/cutover/disable/recovery procedure used in Task 5

- [ ] **Step 1: Write the runbook preconditions and secret rules**

The runbook must begin with:

- repository is private;
- Bastion is the only operator SSH path;
- boot volume, DB, and attachment backups are complete;
- `/etc/munjib/env`, `nextauth-current`, and conditional `google-client-current` exist;
- no token, runner registration command, env value, or secret output is pasted into GitHub or the wiki;
- stopping or removing the runner does not stop the running Munjib containers.

- [ ] **Step 2: Document runner account and official package installation**

Include exact host bootstrap commands through Bastion:

```bash
sudo useradd --system --create-home --home-dir /opt/actions-runner --shell /usr/sbin/nologin munjib-runner
sudo install -d -o munjib-runner -g munjib-runner -m 0700 /opt/actions-runner
```

Then instruct the operator to open GitHub `Settings → Actions → Runners → New self-hosted runner`, select `Linux` and `ARM64`, and execute the versioned download plus SHA-256 verification commands GitHub generates at that time as `munjib-runner`. Do not hardcode a runner release that can become stale.

- [ ] **Step 3: Document repository-only runner registration and service verification**

Require runner name `munjib-production-oci` and custom label `munjib-production`. Use the one-time registration token from the GitHub UI only in the active Bastion session. Include service and identity checks:

```bash
sudo -u munjib-runner /opt/actions-runner/config.sh \
  --url https://github.com/dschoi30/munjib \
  --token "$RUNNER_REGISTRATION_TOKEN" \
  --name munjib-production-oci \
  --labels munjib-production \
  --unattended \
  --replace

cd /opt/actions-runner
sudo ./svc.sh install munjib-runner
sudo ./svc.sh start
sudo ./svc.sh status
```

The runbook must tell the operator to unset `RUNNER_REGISTRATION_TOKEN` immediately and confirm the runner labels in GitHub.

- [ ] **Step 4: Document wrapper, state, and sudoers installation**

From the reviewed implementation checkout, install and validate:

```bash
sudo install -o root -g root -m 0755 \
  scripts/deploy/munjib-deploy.sh \
  /usr/local/sbin/munjib-deploy

sudo install -o root -g root -m 0440 \
  deploy/sudoers/munjib-actions-runner \
  /etc/sudoers.d/munjib-actions-runner

sudo visudo -cf /etc/sudoers.d/munjib-actions-runner
sudo install -d -o root -g root -m 0755 /var/lib/munjib/deploy
git -C /home/ubuntu/munjib rev-parse HEAD | \
  sudo tee /var/lib/munjib/deploy/current-sha >/dev/null
sudo chown root:root /var/lib/munjib/deploy/current-sha
sudo chmod 0444 /var/lib/munjib/deploy/current-sha
```

Require comparison of the recorded SHA with the known healthy production SHA before proceeding.

- [ ] **Step 5: Document read-only smoke, cutover, and rollback**

Include:

1. Push source branch and open a draft PR; do not merge yet.
2. Install the reviewed runner, wrapper, and sudoers entry through Bastion.
3. Before merge, require the runner service to be active and GitHub repository Settings to show it Online with all required labels.
4. Merge the workflow cutover only after that readiness check.
5. Use the first `main` deploy as the end-to-end proof; confirm exact SHA and public health.
6. After cutover, trigger the permanent `Production runner smoke` workflow and keep it as a manual diagnostic.
7. If queued/offline/failing, disable the deploy job and use Bastion manual deployment; never reopen public SSH.
8. To disable the runner: `sudo ./svc.sh stop`, then remove it from repository Settings.

- [ ] **Step 6: Update current-state wiki pages**

Update [[CI CD And Monitoring Workflow]] with:

- GitHub-hosted CI versus OCI self-hosted deploy split;
- exact labels and outbound-only network;
- wrapper and fixed paths;
- current secret ownership;
- failure behavior and Bastion recovery;
- removal of direct SSH deploy secrets after cutover.

Update [[Release Signer And Vault Workflow]] to say this MVP runner path is operational automation only and does not satisfy Issue #185 attestation or PR #188 immutable-delivery gates.

Update `wiki/index.md` routing and append a timestamped evidence entry to `wiki/log.md`.

- [ ] **Step 7: Regenerate and verify wiki artifacts**

```bash
pnpm wiki:manifest
pnpm wiki:lint
git diff --check
```

Expected: manifest regenerated; wiki lint passes except only explicitly documented pre-existing warnings; diff check clean.

- [ ] **Step 8: Commit documentation and wiki state**

```bash
git add -- \
  docs/runbooks/private-oci-self-hosted-runner.md \
  wiki/CI\ CD\ And\ Monitoring\ Workflow.md \
  wiki/Release\ Signer\ And\ Vault\ Workflow.md \
  wiki/index.md \
  wiki/log.md \
  wiki/manifest.json
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "docs: add private OCI runner operations"
```

Expected: commit succeeds with only runbook and wiki maintenance.

### Task 5: Review, publish, bootstrap, and cut over production CD

**Files:**
- Modify after successful cutover: wiki/log/manifest as evidence requires
- Remote install targets: `/opt/actions-runner`, `/usr/local/sbin/munjib-deploy`, `/etc/sudoers.d/munjib-actions-runner`, `/var/lib/munjib/deploy/current-sha`

**Interfaces:**
- Consumes: reviewed source branch, GitHub issue, runbook, OCI Bastion, existing backups and host-local secrets
- Produces: green `main` CD through the private OCI runner, no public SSH, obsolete SSH deploy secrets removed

- [ ] **Step 1: Run final local verification before publishing**

```bash
bash -n scripts/deploy/munjib-deploy.sh
pnpm exec tsc --noEmit --pretty false
pnpm test
pnpm wiki:manifest
pnpm wiki:lint
git diff --check
git status --short
```

Expected: all commands pass; status contains no unintended files.

- [ ] **Step 2: Stage explicit files and run commit-time wiki sync**

```bash
git add -- \
  .github/workflows/ci-cd.yml \
  .github/workflows/runner-smoke.yml \
  scripts/deploy/munjib-deploy.sh \
  deploy/sudoers/munjib-actions-runner \
  tests/deploy/self-hosted-deploy-contract.test.ts \
  tests/github-actions/ci-cd.test.ts \
  docs/runbooks/private-oci-self-hosted-runner.md \
  docs/superpowers/specs/2026-08-16-private-oci-self-hosted-deploy-runner-design.md \
  docs/superpowers/plans/2026-08-16-private-oci-self-hosted-deploy-runner.md \
  wiki/CI\ CD\ And\ Monitoring\ Workflow.md \
  wiki/Release\ Signer\ And\ Vault\ Workflow.md \
  wiki/index.md \
  wiki/log.md \
  wiki/manifest.json
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add -- wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: staged scope matches the implementation and documentation only.

- [ ] **Step 3: Commit remaining approved changes**

If earlier tasks already committed every path, verify clean status and skip duplicate commit. Otherwise:

```bash
git commit -m "feat: keep production CD behind OCI Bastion"
```

Expected: commit succeeds.

- [ ] **Step 4: Push and create one draft PR**

```bash
git push -u origin "$(git branch --show-current)"
gh pr create \
  --draft \
  --base main \
  --head "$(git branch --show-current)" \
  --title "Keep production CD behind OCI Bastion" \
  --body "Tracks the feature issue created by wiki:feature-start. Keeps PR/main CI on GitHub-hosted runners, routes only successful main deploys to the repository-scoped OCI runner, adds a fixed root-owned wrapper, and preserves Bastion-only operator access. Vault, bundle signer, Issue #185 attestation, and PR #188 remain deferred."
```

Expected: exactly one draft PR URL.

- [ ] **Step 5: Request code review before touching production**

Invoke `superpowers:requesting-code-review`. Address every actionable finding on the same branch using `superpowers:receiving-code-review`; rerun focused/full verification and wiki sync after each fix.

Expected: source review passes before any runner, wrapper, or sudoers installation.

- [ ] **Step 6: Bootstrap the runner and wrapper through Bastion**

Follow `docs/runbooks/private-oci-self-hosted-runner.md` exactly. Resolve the exact reviewed commit, compare wrapper SHA-256 before/after transfer, install the runner and wrapper, validate sudoers, bootstrap `current-sha`, and confirm no new inbound listener:

```bash
sudo ss -lntp
id munjib-runner
id -nG munjib-runner
sudo -u munjib-runner test ! -r /etc/munjib/env
sudo visudo -cf /etc/sudoers.d/munjib-actions-runner
```

Expected: no public runner listener; runner is not in Docker group; env is not directly readable; sudoers syntax valid.

- [ ] **Step 7: Confirm runner readiness before merge**

On the OCI host, confirm the installed runner service is active:

```bash
cd /opt/actions-runner
sudo ./svc.sh status
```

In GitHub repository Settings, confirm the repository runner is Online with labels `self-hosted`, `linux`, `ARM64`, and `munjib-production`.

Expected: service is active and GitHub shows the exact required labels before merge. No workflow is triggered from the feature branch.

- [ ] **Step 8: Mark the PR ready and merge only after bootstrap readiness**

```bash
gh pr ready
gh pr checks --watch
```

After explicit user merge authorization, merge the PR. The first resulting `main` push becomes the end-to-end deploy proof.

Expected: CI succeeds, deploy job is claimed by the OCI runner, wrapper returns `deployed_sha=<main-sha>`, and public health succeeds.

- [ ] **Step 9: Independently verify the first self-hosted deployment**

Through Bastion:

```bash
expected_sha="$(cat /var/lib/munjib/deploy/current-sha)"
git -C /home/ubuntu/munjib rev-parse HEAD
sudo docker compose --env-file /etc/munjib/env ps
curl --fail --silent --show-error --location --max-time 20 \
  --header 'Host: munjib.andrewchoi.link' http://127.0.0.1:3000/ >/dev/null
curl --fail --silent --show-error --location --max-time 20 \
  https://munjib.andrewchoi.link/ >/dev/null
printf 'verified_sha=%s\n' "$expected_sha"
```

Expected: checkout SHA equals `current-sha`; containers healthy; both health checks exit `0`.

- [ ] **Step 10: Run the permanent smoke workflow and remove obsolete SSH secrets**

After the cutover commit reaches `main`, trigger `Production runner smoke` in GitHub Actions.

Expected: the job runs on `munjib-production-oci`, reports `munjib-runner`, `aarch64`, no Docker group, and successful outbound/public health. Keep this manual-only workflow for future diagnostics.

Only after both the first deploy and smoke job are green, delete repository secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_PATH`, and `DEPLOY_SSH_KEY`. Do not delete application secrets still needed elsewhere until their consumers are verified.

- [ ] **Step 11: Wait and re-check review, CI, and deploy status**

Wait at least five minutes, then inspect:

```bash
gh pr view --json state,mergeStateStatus,reviews,statusCheckRollup,url
gh run list --workflow CI/CD --limit 5
```

Expected: no unresolved actionable review; latest `main` Test and build plus Deploy checks successful.

- [ ] **Step 12: Record final public-safe evidence and close the issue**

Record only:

- issue and PR number;
- merged commit SHA;
- runner name/labels, not registration credentials;
- no-public-SSH and outbound-only status;
- first deployed exact SHA;
- local/public health success;
- rollback path tested or reviewed;
- obsolete SSH deploy secrets removed.

Update wiki/log/manifest if the final evidence was not already captured, commit/push through the same review path, then close the feature issue. Do not close Issue #185 or merge PR #188 as part of this work.
