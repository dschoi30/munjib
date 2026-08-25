---
title: Private OCI Self-Hosted Deploy Runner Design
date: 2026-08-16
tags:
  - munjib
  - ci-cd
  - github-actions
  - oci
  - security
status: proposed
related:
  - "[[CI CD And Monitoring Workflow]]"
  - "[[Release Signer And Vault Workflow]]"
---

# Private OCI Self-Hosted Deploy Runner Design

## Summary

Munjib의 production OCI는 public SSH를 닫고 OCI Bastion을 통한 운영자 접속만 허용한다. 기존 GitHub-hosted `deploy` job은 `appleboy/ssh-action`으로 production SSH에 직접 접속하므로 이 네트워크 정책과 맞지 않는다.

이 설계는 별도 VM, Vault, bundle signer, delivery broker를 추가하지 않고 현재 production OCI에 repository-scoped GitHub Actions self-hosted runner 하나를 설치한다. CI는 계속 GitHub-hosted runner에서 수행하고, 성공한 `main` push의 deploy job만 OCI runner가 outbound HTTPS로 받아 고정된 root-owned 배포 wrapper를 실행한다.

> [!warning] 보안 경계
> Self-hosted runner는 sandbox가 아니다. 이 설계는 신뢰된 private repository의 `main` 코드가 production에서 실행된다는 전제를 가진다. PR 코드는 production runner에서 실행하지 않는다. 이 방식은 Vault 기반 서명이나 독립 attestation을 대체하지 않으며 MVP 운영 복잡성을 줄이기 위한 선택이다.

## Goals

- public SSH를 다시 열지 않고 `main` push의 CD를 유지한다.
- 기존 GitHub-hosted CI와 exact `github.sha` 배포 계약을 유지한다.
- 별도 OCI VM, VPN, Vault, signer, broker를 요구하지 않는다.
- runner가 일반 root shell 또는 unrestricted Docker 권한을 갖지 않게 한다.
- 배포 실패가 기존 Munjib과 runner 자체를 불필요하게 파괴하지 않게 한다.
- 배포 결과를 GitHub Actions와 public health check에서 확인한다.

## Non-goals

- Issue #185의 delivery broker 설치 또는 독립 attestation 완료
- PR #188의 immutable runtime gate 병합
- untrusted PR code의 OCI 실행
- multi-host, blue-green, canary, HA, HSM 또는 2인 승인
- DB migration의 자동 역방향 rollback
- Vault production 설치

## Current state

- Repository: private `dschoi30/munjib`
- Default branch: `main`
- Production: 현재 Munjib OCI VM 한 대
- Operator access: OCI Bastion, public SSH 차단
- CI: `ubuntu-latest`에서 PostgreSQL service, tests, Next build, runtime image build
- Deploy: CI 성공 후 GitHub-hosted runner가 `appleboy/ssh-action@v1.2.0`으로 OCI에 직접 접속
- Production build: OCI checkout에서 native ARM64 Docker image build
- Runtime configuration: `/etc/munjib/env`와 `/etc/munjib/secrets/`
- Health checks: host-local HTTP check 후 public HTTPS check

## Chosen architecture

```text
Private GitHub repository
  │
  ├─ pull_request / main push
  │    └─ GitHub-hosted CI: ubuntu-latest
  │         ├─ install and generate
  │         ├─ migrate disposable CI database
  │         ├─ tests
  │         ├─ Next build
  │         └─ runtime image build validation
  │
  └─ successful main CI
       └─ repository-scoped self-hosted runner
            labels: self-hosted, linux, ARM64, munjib-production
            network: outbound HTTPS 443 only
            OS user: munjib-runner
                 │
                 └─ sudo /usr/local/sbin/munjib-deploy <github-sha>
                      ├─ exact SHA validation
                      ├─ deployment lock
                      ├─ fixed checkout and env paths
                      ├─ native image build
                      ├─ migration and RAG index
                      ├─ Compose update
                      └─ local and public health checks

Operator recovery
  └─ OCI Bastion → manual inspection or deployment disable
```

### Why this approach

- The runner initiates outbound HTTPS and needs no inbound SSH rule.
- The repository is private, avoiding the public-fork runner risk.
- Existing native ARM64 build and Compose commands remain usable.
- GitHub continues to own CI ordering, job status, concurrency, and logs.
- It adds one runner service and one fixed wrapper instead of OCI API credentials, ephemeral Bastion automation, or a custom polling agent.

## Runner host contract

### Identity and location

- OS user: `munjib-runner`
- Home or working root: `/opt/actions-runner`
- Scope: repository-only registration for `dschoi30/munjib`
- Custom label: `munjib-production`
- Service: systemd-managed GitHub Actions runner service
- Shell login: disabled when compatible with runner service operation
- SSH authorized keys: none

### Network

- No inbound port is added for the runner.
- The runner may initiate required HTTPS connections to GitHub over TCP 443.
- Existing Bastion-only operator SSH remains unchanged.
- PostgreSQL, Next.js, Ollama, and future Vault ports remain non-public.

### Filesystem permissions

The runner may read only what the deploy wrapper needs indirectly. It does not receive write permission to:

- `/etc/munjib/env`
- `/etc/munjib/secrets/`
- Caddy configuration
- SSH configuration
- the root-owned deploy wrapper
- the sudoers rule that authorizes the wrapper

Runner registration credentials under `/opt/actions-runner` are readable only by `munjib-runner` and root.

### Privilege boundary

`munjib-runner` is not added to the `docker` group. Docker group membership is treated as root-equivalent.

The only passwordless sudo entry is the root-owned wrapper:

```text
/usr/local/sbin/munjib-deploy
```

The sudoers rule can authorize the wrapper path, while the wrapper must independently validate every argument. No generic `docker`, `docker compose`, `systemctl`, `git`, shell, editor, file-copy, or package-manager command is allowed through sudoers.

> [!important] Accepted MVP limitation
> The deploy wrapper eventually builds and runs code from trusted `main`. A malicious or compromised `main` commit can still affect production. The wrapper primarily prevents accidental arbitrary sudo use; it is not an independent code-signing boundary.

## Deploy wrapper contract

### Inputs

The wrapper accepts exactly one argument:

```text
40-character lowercase hexadecimal commit SHA
```

It rejects:

- branch names
- tags
- shortened SHAs
- additional arguments
- shell metacharacters
- a SHA not reachable from fetched `origin/main`

### Fixed resources

- Repository: `dschoi30/munjib`
- Checkout: `/home/deployer/munjib`
- Environment: `/etc/munjib/env`
- Secrets: existing `/etc/munjib/secrets/`
- Deployment state: `/var/lib/munjib/deploy/current-sha`
- Compose project: existing Munjib production project
- Health endpoint: `http://127.0.0.1:3000` with production Host header
- Public endpoint: `https://munjib.example.invalid`

Caller-controlled paths, environment-file paths, Compose files, service names, commands, and health URLs are not accepted.

### Locking

The wrapper obtains an exclusive `flock` before any fetch, build, migration, or Compose operation. If another deployment holds the lock, the new deployment fails without cancelling or interrupting the running deployment.

The workflow also uses:

```yaml
concurrency:
  group: munjib-production
  cancel-in-progress: false
```

### Execution sequence

1. Validate the exact SHA argument.
2. Acquire the deployment lock.
3. Require and read the current deployed SHA from `/var/lib/munjib/deploy/current-sha`; bootstrap this file through Bastion from the currently verified production checkout before enabling CD.
4. Fetch `origin/main` through an ephemeral GitHub job token without logging it.
5. Confirm the requested SHA is reachable from `origin/main`.
6. Check out the requested SHA detached in the fixed checkout.
7. Verify `/etc/munjib/env` and required secret files are readable by the privileged deployment context without printing their contents.
8. Build the production `web` and `tools` images natively on OCI ARM64.
9. Run the existing `auth-preflight` Compose profile and `pnpm security:auth-preflight` command before migration.
10. Run Prisma `migrate deploy`.
11. Run the RAG vector-index maintenance command.
12. Update the `web` service with release metadata set to the exact SHA.
13. Retry the host-local health check with the production Host header.
14. Verify the public HTTPS endpoint.
15. Atomically replace `/var/lib/munjib/deploy/current-sha` only after both health checks succeed, and persist a public-safe record containing SHA, timestamp, and status only.
16. Prune dangling images only after successful health verification.

### Secret handling

- The workflow and wrapper use `set -euo pipefail` but never `set -x`.
- Tokens, env contents, secret paths beyond the fixed documented paths, request headers, and private logs are not echoed.
- The ephemeral GitHub token is not written to persistent Git config or disk.
- Existing SSH deploy private-key secrets become removable after cutover.

## Workflow contract

### CI job

The `ci` job remains on `ubuntu-latest` for both PRs and `main` pushes. No untrusted PR job targets the self-hosted runner.

### Deploy job

The production deploy job requires all of:

- event is `push`
- ref is `refs/heads/main`
- CI job succeeded
- runner labels include `self-hosted`, `linux`, `ARM64`, and `munjib-production`
- permissions are minimized, with repository contents read access only unless a narrower runtime requirement is proven

The job does not use `appleboy/ssh-action`, `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, or `DEPLOY_SSH_KEY`. It also stops sending `DEPLOY_NEXTAUTH_SECRET` and Google OAuth secret values on every deployment. The wrapper verifies the already provisioned root-owned files under `/etc/munjib/secrets/` and selects the fixed Compose overlay from host-local configuration without printing secret values.

The job invokes only the fixed wrapper with `${{ github.sha }}` and then records the public verification result.

### Environment protection

A GitHub `production` environment may be added if the current GitHub plan supports the desired protection rules for a private repository. The base design does not depend on paid environment approvals. Repository privacy, the `main`-only condition, minimal permissions, and repository-scoped runner are mandatory regardless.

## Failure handling

### CI failure

The deploy job never starts.

### Runner offline

The deploy job remains queued and eventually fails. Production continues running unchanged. The operator connects through Bastion and checks the runner service, disk, memory, and outbound HTTPS.

### Wrapper validation or preflight failure

The wrapper exits before migration or runtime replacement. Production remains on the previous deployment.

### Build failure

No new runtime is started. Existing containers remain running.

### Migration failure

The deployment stops before web replacement. The operator investigates through Bastion. Automatic reverse migration is not attempted.

### Health-check failure after web replacement

The job fails and preserves logs plus the previous deployed SHA record. Automatic DB rollback is not attempted. The operator uses Bastion to inspect the application and may deploy a revert commit. Runtime rollback is allowed only when schema compatibility is known.

### Compromised or suspicious runner

1. Disable or remove the runner in GitHub repository settings.
2. Stop the runner service through Bastion.
3. Revoke runner registration and stored credentials.
4. Review Actions runs and host logs.
5. Rotate any secret the runner could have accessed.
6. Reinstall the runner rather than trusting the existing directory.

## Rollout

### Phase 1 — runner bootstrap

- Create the unprivileged `munjib-runner` account and protected runner directory.
- Download the official ARM64 runner package and verify its published checksum.
- Register it only to `dschoi30/munjib` with the `munjib-production` label.
- Install and start the runner service.
- Confirm outbound GitHub connectivity without opening inbound ports.

### Phase 2 — runner readiness

- Before merge, confirm the runner service is active and GitHub repository Settings shows it Online with all production labels.
- Add a permanent, manually triggered read-only smoke job for post-cutover diagnostics.
- Allow only non-secret diagnostics such as runner identity, architecture, working directory, and public HTTPS access.
- Confirm PR events cannot route to the smoke job.

### Phase 3 — wrapper and tests

- Add the root-owned wrapper source to the repository for review.
- Add contract tests for SHA validation, fixed paths, locking, secret redaction, command ordering, health checks, and forbidden generic sudo/Docker access.
- Install the reviewed wrapper and narrow sudoers entry manually through Bastion.
- Run wrapper validation in a no-mutation preflight mode before enabling CD.

### Phase 4 — workflow cutover

- Replace the SSH deploy step with the labeled self-hosted deploy job.
- Keep CI on GitHub-hosted runners.
- Use a low-risk `main` commit to exercise the complete deployment.
- Confirm exact SHA, migration result, local health, public health, and GitHub job status.

### Phase 5 — cleanup

- Keep the manual-only smoke workflow as a safe runner diagnostic.
- Remove obsolete `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, and `DEPLOY_SSH_KEY` secrets after successful cutover.
- Keep Bastion as the only operator access path.
- Update [[CI CD And Monitoring Workflow]], wiki index, manifest, and log with implemented facts.

## Rollback of the CD change

If the new runner path is unreliable:

1. Disable the self-hosted deploy job without changing the running application.
2. Keep GitHub-hosted CI active.
3. Use Bastion for manual deployment of an approved `main` SHA.
4. Remove or stop the runner service if it is the suspected cause.
5. Do not restore public SSH merely to recover automatic CD.

The old SSH deploy workflow is not a usable rollback while public SSH remains closed.

## Verification

### Static and unit verification

- Workflow parser/static tests prove CI remains GitHub-hosted and deploy is `main`-only.
- Tests assert all four self-hosted labels.
- Tests assert `needs: ci`, exact SHA passing, and production concurrency.
- Wrapper tests cover valid and invalid SHA inputs, extra arguments, fixed paths, lock contention, failure ordering, and secret-redaction rules.
- Tests reject `set -x`, generic caller-provided commands, caller-provided env paths, and direct Docker-group assumptions.

### Host verification

- Runner service runs as `munjib-runner`, not root or `ubuntu`.
- Runner has no SSH authorized key and is not in the Docker group.
- No new inbound listener exists.
- GitHub shows the repository-scoped runner online with the expected labels.
- Read-only smoke job runs only when manually invoked.

### End-to-end verification

- A successful `main` CI schedules exactly one production deploy.
- The deployed checkout SHA equals `${{ github.sha }}`.
- Migration and RAG index commands succeed.
- Local and public health checks succeed.
- A deliberately invalid SHA is rejected before mutation.
- Concurrent deployment attempts do not overlap.
- Stopping the runner leaves the current application serving normally.

## Deferred security work

The following remain explicit post-MVP work:

- Issue #185 delivery broker and host attestation
- PR #188 immutable runtime gate
- Vault Transit production signer
- signed delivery envelopes and independent trust root
- dedicated runner or signer VM
- artifact-based build-once deployment

## Source evidence

- `.github/workflows/ci-cd.yml`
- `wiki/CI CD And Monitoring Workflow.md`
- `docker-compose.yml`
- GitHub private repository visibility verified on 2026-08-16
- [GitHub self-hosted runner reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [GitHub adding self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
- [GitHub using self-hosted runners in workflows](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [OCI Bastion port-forwarding sessions](https://docs.oracle.com/en-us/iaas/Content/Bastion/Tasks/create-session-port-forwarding.htm)
