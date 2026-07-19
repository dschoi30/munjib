---
id: workflow-ci-cd-monitoring
title: CI CD And Monitoring Workflow
type: workflow
status: active
summary: Munjib의 현재 GitHub Actions CI/CD, OCI native Compose build deploy, Docker/Sentry low-cost monitoring 구성.
created: 2026-06-05
updated: 2026-07-19
source_count: 62
tags:
  - munjib
  - workflow
  - ci-cd
  - deployment
  - monitoring
  - sentry
links:
  - "[[index|Wiki Index]]"
  - "[[Local Development Workflow]]"
  - "[[Production Observability Workflow]]"
  - "[[Project PRD]]"
  - "[[Release Signer And Vault Workflow]]"
  - "[[Wiki Maintenance Automation]]"
---

# CI CD And Monitoring Workflow

이 page는 현재 repository의 자동 검증, production compose deploy, monitoring 구성을 한 곳에서 본다. 세부 production observability 원칙은 [[Production Observability Workflow]]에 있고, 이 page는 CI/CD와 monitoring이 어떻게 이어지는지 요약한다.

## Entry points

CI/CD entry point는 `.github/workflows/ci-cd.yml` 하나다. Workflow 이름은 `CI/CD`이고, `pull_request`와 `main` branch push에서 실행된다.

Workflow는 `munjib-${{ github.ref }}` concurrency group을 사용해 같은 ref의 이전 run을 취소한다. 기본 permission은 repository read인 `contents: read`만 사용한다.

공통 workflow env:

```text
IMAGE_TAG=${{ github.sha }}
PNPM_VERSION=10.28.1
```

Production runtime entry point는 `docker-compose.yml`이다. `web` service는 `WEB_IMAGE`가 있으면 그 image tag를 쓰고, 없으면 `ghcr.io/dschoi30/munjib:latest`를 기본값으로 쓴다. 현재 production deploy job은 OCI host에서 `WEB_IMAGE=munjib-web:latest`로 `web`과 `tools`를 native build한다. `docker-compose.dev.yml`은 local development override이며 production CI/CD deploy path에는 직접 쓰이지 않는다.

### Leaf 13B database authority gate

Leaf 13B는 production migration history를 append-only exact
name/checksum prefix로 admission하고, 실패·롤백·미완료·수정 checksum·비단조
pending migration을 거부한다. `scripts/deploy/check-migration-history.ts`는
현재 Prisma migration bytes와 `deploy/security/migration-ledger.json`을
대조하고, `scripts/deploy/check-expand-contract.ts`는 additive `EXPAND`와
명시적 `CONTRACT` 경계를 검사한다.

`deploy/postgres/roles-only.sql`은 `NOLOGIN` schema owner와 제한된 migration,
Web, RAG 역할을 준비한다. `finalize-ownership.sql`은 Web/RAG에 필요한
application DML/read만 주고 DDL·truncate·owner/journal authority를 차단한다.
모든 entrypoint는 caller libpq 변수를 지운 뒤 고정 credential file과
`pg_catalog` 우선 `search_path`를 사용하며, owner role을 설정하는 것은
고정 migrator operation 하나뿐이다.

`database-role-v1` manifest는 PRE_JOURNAL 단계의 manifest-listed regular SQL
파일과 SHA-256/mode/destination을 고정한다. 이 단계에서는 `pgcrypto`, journal
objects, genesis rows를 만들지 않는다. 세부 운영 절차는
`docs/runbooks/immutable-deploy.md`에 기록한다.

Production Compose auth 경계는 root-managed fixed descriptor를 사용한다. `web`과 일회성 `auth-preflight`는 `/run/secrets/munjib_nextauth_secret`를 읽고 host source는 `/etc/munjib/secrets/nextauth-current`로 고정된다. Google auth를 켤 때도 임의 overlay 대신 repository의 `docker-compose.google.yml`만 추가하며 `/etc/munjib/secrets/google-client-current`를 `/run/secrets/munjib_google_client_secret`으로 마운트한다. 두 production service는 pinned non-root UID `10001:10001`로 실행되고 descriptor는 owner `10001`, mode `0400`이어야 한다. Web host port는 `127.0.0.1:${WEB_PORT:-3000}:3000`으로만 publish한다.

Monitoring entry point는 두 갈래다.

- Docker stdout/stderr: startup, env, DB connection, PostgreSQL process log, Sentry init 이전 failure.
- Sentry SaaS: Next.js App Router request error, global error, browser runtime error, low sample rate tracing, opt-in Node runtime metrics, error-only Replay, low-cardinality application metrics.

### Edge binding probe boundary (Issue #166)

`deploy/security/edge-bindings-v1.json`은 여전히 `PREPARATORY`/`DISABLED`이며
production traffic, Caddy, DNS/TLS, firewall, host monitoring을 변경하지 않는다.
`lib/deploy/edge-bindings.ts`의 순수 evaluator는 고정 security header와 path-boundary
no-store를 확인하고, `/api/`, `/login`, `/workspaces/` 각 route class에 public
probe가 존재하는지 parser에서 고정한다. Probe variant별 incompatible key,
credential omission, request method, configured timeout 초과를 fail closed한다. HTTPS 관측은 인증서 검증과
canonical TLS server name을 증명해야 하고 redirect count가 0이어야 한다.
`Cache-Control` directive는 comma-separated 문법만 인정하고 HTTP token 문법에
맞지 않거나 whitespace-padded인 header name을 거부하며, quoted comma 안의
문자열을 directive separator로 오인하지 않는다. CR/LF 같은 금지 control
character가 있는 header value도 거부한다.
실패 telemetry는 allowlist만 내보내며 unknown probe ID, malformed timestamp, invalid
status/latency는 bounded sentinel (`unknown`, `1970-01-01T00:00:00.000Z`, `0`)로
정규화한다. 실제 edge
activation 전에는 `docs/runbooks/edge-bindings-readiness.md`의 외부 evidence와
operator gate를 충족해야 한다.

## Least-authority delivery substrate

Leaf 13A의 delivery substrate는 parent Issue #167 (`issue-167-security-immutable-deploy`) 아래
child Issue #169 (`issue-169-delivery-substrate`)가 추적하는 비대화형 forced-SSH submitter가 고정 Unix socket
broker에 bounded envelope만 전달하는 구조를 사용한다. Broker는 kernel peer
credential, root-owned trust policy, 서명, nonce, expiry, generation, operation
schema를 매 요청 다시 검증한다. 이 단계에는 application capability나 실행 중인
runtime 변경 권한이 없고, caller가 경로·환경·Compose/systemd 명령을 선택할 수
없다. Submitter에는 sudo, Docker socket, root SSH, forwarding, interactive TTY가
없으며, 모든 후속 mutation은 별도 attested root operation으로 승격되어야 한다.

Issue #185의 공개 코드 조각은 이 substrate를 위한 고정 delivery bundle
layout(`deploy/delivery/bundle-layout-v1.json`)과 빌더/검증기
(`scripts/deploy/{build,verify}-delivery-bundle.ts`)를 제공한다. 빌더는
linux/arm64용 세 개의 사전 빌드된 Go artifact 이름과 repository 고정 파일만
받고, 각 binary가 ELF64 little-endian AArch64인지 확인하며
symlink/path escape/중복 destination을 거부한다. Generated manifest는 기존
static installation manifest v1과 schema 및 trust-key 의미가 충돌하지 않도록
`munjib-delivery-bundle-manifest-v2`를 사용한다. 출력 manifest에는 각
파일의 SHA-256, `root:root` ownership, mode, layout digest와 별도의
`bundle.sha256`가 포함되며, `payload` 이외의 top-level 항목과 변조된 파일도
검증기가 fail closed로 거부한다. `release-verify.pub`는 bundle에 포함하지
않고 `root-bootstrap` external input으로만 선언한다. 따라서 이 코드는
재현 가능한 artifact package/verification 경계를 제공할 뿐, production host
설치나 trust-key enrollment를 주장하지 않는다.

## Security-critical runtime gate

Leaf 3 keeps Next.js on the reviewed 15.x line with exact matching `next` and
`eslint-config-next` 15.5.18 specifications. The repository contract checks the
resolved pnpm graph, a deterministic projection of the Next.js/React runtime
roots, and a paginated advisory gate without persisting advisory response bodies.
Production runtime smoke fixtures read passwords only from a file and emit no
credential material.

The fixture-gated Playwright spec skips during ordinary E2E discovery when the
dedicated smoke variables are absent, so `pnpm run test:e2e` remains usable;
`run-security-runtime.sh` supplies the fixture variables and still executes the
security smoke tests.

The smoke launcher also keeps the generated auth secret out of process argv and
installs cleanup before fixture/password setup; RSC body bounds are captured in
a route interception before response fulfillment. Static contract tests cover
these review-critical lifecycle guarantees.

Issue #171 adds a production dependency audit gate for the same runtime graph.
`package.json` uses exact pnpm overrides for `postcss` 8.5.10, `uuid` 11.1.1,
`minimatch@10.2.5>brace-expansion` 5.0.6, and `@opentelemetry/core` 2.8.0.
The scoped brace override preserves the callable `minimatch@3` development
path while patching the production/Sentry `minimatch@10` path. The lockfile
must resolve those patched versions on production paths while keeping the
Next.js 15.5.18 pin unchanged. Compatibility contracts cover NextAuth JWT UUID
generation, minimatch major compatibility, and Sentry/OpenTelemetry module
loading; CI runs the unfiltered `pnpm audit --prod` command followed by the
paginated Next.js advisory checker, both immediately after the frozen install.
The checker receives only the workflow's read-only `GH_TOKEN` for GitHub's
advisory API.

Issue #174 closes the production `tsx` audit path without changing the
development Vite/esbuild graph: the lockfile scopes an exact
`tsx>esbuild` override to patched `esbuild` 0.28.1, while the dev-only Vite
path remains on its compatible 0.21.5 resolution. `pnpm audit --prod` must
remain clean after this override, and the same pruned runner image continues
to execute the network-isolated `auth-preflight` command.

Sentry Uptime checks and OCI native CPU/memory alarms are low-ops external controls and are configured outside the repository. Grafana/Prometheus and PostHog are intentionally deferred until Sentry cannot answer the needed infrastructure or product questions cheaply.

## Steps

### PR과 main 공통 CI

`ci` job은 `ubuntu-latest`에서 실행되고 `DATABASE_URL`은 GitHub Actions service PostgreSQL을 가리킨다.

```text
postgresql://obsidian:obsidian@localhost:5432/obsidian_clone?schema=public
```

CI service database는 `pgvector/pgvector:0.8.2-pg16` image를 사용하고 `pg_isready -U obsidian -d obsidian_clone` health check를 통과해야 한다.

현재 CI 순서:

1. `actions/checkout@v4`
2. Corepack enable과 `pnpm@10.28.1` activate
3. `actions/setup-node@v4` with Node.js `22` and pnpm cache
4. `pnpm install --frozen-lockfile`
5. `pnpm run db:generate`
6. `pnpm exec prisma migrate deploy`
7. `pnpm run db:rag:index`
8. `pnpm test`
9. `pnpm run build`
10. `docker build --target runner --tag munjib-ci:${IMAGE_TAG} .`

The runtime dependency gate pins Next.js and `eslint-config-next` to the same
reviewed secure patch and rejects an older lockfile resolution. Runtime upgrades run
the full Vitest suite, TypeScript, production build, runner/tools Docker builds,
auth/RSC browser smoke, and `pnpm audit --prod` before deployment.

현재 PR CI는 Vitest, Next build, runtime image build까지 검증한다. Playwright e2e는 mandatory GitHub Actions gate에 포함되어 있지 않다.

Auth runtime browser oracle는 `pnpm exec tsx scripts/security/run-auth-runtime-e2e.ts`로
별도 실행할 수 있다. Runner는 secret 값을 환경변수나 argv에 넣지 않고 0700 임시
디렉터리의 0400 파일을 fixed `/run/secrets/munjib_nextauth_secret`로 mount하며, host
uid/gid와 같은 non-root identity로 production container를 실행한다. `auth-runtime.spec.ts`는
production-like provider discovery, password signup closed, exact linked Google
policy, unlinked OAuth zero rows, token/profile media zero egress, Secure cookie,
canonical origin, current/legacy password migration 및 CAS loss를 synthetic
`example.test` identity로 검증한다. Google endpoint 호출은 없다. 이 oracle은
배포 전 수동/운영 smoke 단계에 두며, 기존 mutable seeded workspace E2E와 분리한다. 실행
때마다 별도 pgvector PostgreSQL container/network를 만들고 migration 후 같은 disposable
DB를 production runner와 Playwright에 연결한다. DB 준비 실패는 fail-closed이며 기존
`DATABASE_URL`은 사용하지 않는다.

### Leaf 1 rollout, downstream handoff, and rollback

Leaf 1 rollout is accepted only when startup/auth preflight, fixed secret-file
owner/mode/no-follow/content checks, Compose binding checks, and the synthetic browser
oracle all pass. Record only pass/fail and stable codes in GitHub-visible evidence:
secret values, row counts, Account/user IDs, provider payloads, and tokens never enter
logs. The exact handoff fixture is
`deploy/security/capabilities/auth-runtime-fail-closed.json`; its protected slot
owner map is `deploy/security/protected-artifact-owners.json`.

Leaf 2 starts only after this deployment evidence is accepted and may change only its
reserved version-0 downstream slot. Leaf 7 remains closed until its guarded
invitation/link contract is reviewed. Leaf 8 preserves the canonical scrypt v1
parser, dummy work, compare-and-swap-before-session rule, and local resource guard.
Leaf 13 preserves loopback-only Web binding, strict file-backed generated secrets,
exact-image selection, and closed-signup preflight. The current four downstream
baselines are immutable at version 0 until their named owners replace them.

Google start/callback containment remains edge-controlled after Leaf 1. Removal
requires the recovery gate, `JOURNAL_READY`, and a fresh boolean proof that no
token-bearing Google row remains. Cleanup appends the existing
`AUTH_OAUTH_ACCOUNT_REVOKED` event in a bounded transaction before revocation; journal
failure rolls back the transaction and replay is deny-only/idempotent. The canonical
twenty-six-kind journal union is unchanged.

### Issue #168 encrypted recovery readiness

Issue #168 currently contributes only the public readiness contract at
`deploy/backup/recovery-readiness-v1.json` and its side-effect-free parser/tests.
The contract fixes RPO 24 hours, RTO 4 hours, 7/4/3 retention, the isolated Phase
A/Phase B boundary, and the invariants that restore never targets production and
the snapshot image is evidence only. Phase A cannot proceed until the Leaf 13
delivery broker is installed and attested (#185). Phase B additionally waits for
the exact-digest Leaf 13B runtime (#184), Leaf 2 journal readiness, Leaf 9 purge
hooks, and Leaf 11 attachment lifecycle. A green contract test is not a snapshot,
restore, key, purge, or production acceptance result; Issue #168 remains open
until those dependencies and independent restore evidence are complete.

The dependency-safe v2 manifest slice adds recursive exact-key validation and
constant-time receipt/integrity helpers in `lib/backup/manifest.ts`. It binds
database/archive hashes, every attachment state and READY byte hash, ordered
migrations (recomputing `migrationIdsSha256(appliedIds)` and rejecting a mismatched
digest), capability/evidence hashes, and the Leaf 2 checkpoint while keeping
the private manifest data-only. The public envelope cannot be parsed for signing
until root seal, immutable exact-read, and authenticated decrypt receipts match;
`snapshotImageDigest` remains audit evidence and is never a restore selector. No
builder, capture, restore, purge, key rotation, or host/provider operation is
included in this slice.
Validation also rejects non-adjacent duplicate attachment paths, invalid UTC
timestamps through the domain error, and locale-dependent archive ordering. The
envelope now binds `backupId`, `epochUtc`, image/capability digests, and journal
sequence to the decrypted manifest; `aggregateCounts.attachments` must equal the
attachment inventory length; and a containing batch start may not exceed its
checkpoint sequence. Journal chain/checkpoint sequences are also bounded by the
Leaf 2 signed-int64 ceiling, equal-sequence hashes must agree, and sequence zero
must use the manifest genesis hash. The envelope `manifestSha256` is computed
over the parser's canonical field-ordered manifest JSON and must match both the
supplied parsed manifest and the decrypt receipt; a present containing batch
must start at sequence one or later. PostgreSQL dump size must be non-zero;
chain/checkpoint hashes must differ at different sequences; and
`latestExportBatchDigest` is null only at genesis and required thereafter.
READY attachment inventories also require a non-zero archive size, and positive
journal hashes may not reuse the genesis hash.
Recursive untrusted-key traversal is capped at a bounded depth and fails with the
domain error before the JavaScript call stack can be exhausted.
For non-genesis checkpoints, the containing batch digest must equal the latest
export batch digest, and the declared document count must cover distinct READY
attachment document references.
All decimal strings are also bounded before any `BigInt` conversion, preventing
oversized numeric inputs from consuming unbounded parser resources.
Aggregate counts also preserve the required organization → workspace → document
parent chain and each count is capped at PostgreSQL's signed `bigint`/int64 limit.
`assertRecoveryCompatibility()` also requires independent evidence to accept the
recovery-pointer record together with the derived migration/schema contract
digest, with the full pointer projection (image, release evidence, artifact
set, and accepted contract fields) available to that verifier; the manifest
cannot self-attest that tuple. The public readiness
contract marks Phase B as requiring Phase-A acceptance and the exact Phase-A
envelope through `requiresPhaseAAcceptance` and the
`phase-b-reuses-phase-a-envelope` invariant.
Snapshot runtime source commits are full, non-zero 40-character Git object IDs
so runtime evidence cannot use an abbreviated or null-looking revision.
The exhaustive attachment inventory is not capped at the old 100,000-entry
parser limit; its cardinality must equal the authenticated aggregate count, and
all non-null attachment document references (including pending lifecycle rows)
must be covered by the document count. The same capacity policy applies to
extracted READY archive receipts, and every inventory row must carry its required
document ID. Attachment byte sizes are capped at the PostgreSQL/Prisma signed
32-bit `Int` ceiling for both manifest rows and archive receipts.
Provider generations also reject null-like and moving aliases (`latest`,
`current`, `unversioned`, and equivalent sentinels) before receipt matching.

Rollback is eligible only for an image that keeps root-managed signing/provider secret
files and their owner/mode/mount contract, closed password signup and unlinked OAuth,
Secure cookies, canonical origin, disabled development login, production seed
prohibition, token/profile-media zero persistence, and canonical v1 password-hash
readability. A rollback image that cannot parse an existing v1 row is ineligible, and
`email_verified` alone is never sufficient to admit OAuth. Leaf 13A publishes generated
exact-candidate envelopes; they are not committed to this repository.

### Main deploy: current SSH checkout/native-build path

The current `.github/workflows/ci-cd.yml` deploy job runs after successful CI on
every `main` push. It uses `appleboy/ssh-action`, fetches and checks out the exact
`github.sha` on the OCI host, then runs the native Docker Compose build,
migration, RAG index, service replacement, and health checks documented below.
There is currently no `MUNJIB_PRIVATE_RUNTIME_BROKER_READY` workflow gate, and
the broker-only exact-digest submission path is not active production behavior.

Target broker-only inputs (not active yet):

```text
APP_IMAGE_DIGEST=<protected exact app digest>
POSTGRES_IMAGE_DIGEST=<protected exact PostgreSQL digest>
HOST_BUNDLE_DIGEST=<protected exact host-bundle digest>
STORAGE_INIT_IMAGE_DIGEST=<protected exact storage-init digest>
RELEASE_ENVELOPE=<protected signed broker envelope>
SENTRY_RELEASE=${{ github.sha }}
NEXT_PUBLIC_SENTRY_RELEASE=${{ github.sha }}
DEPLOY_HEALTHCHECK_URL=http://127.0.0.1:3000
DEPLOY_HEALTHCHECK_HOST=munjib.andrewchoi.link
```

The future broker-only path requires the exact digests above,
`MUNJIB_PRIVATE_RUNTIME_BROKER_READY=true`, the restricted deploy channel, and
the signed envelope. Only after the workflow implements and verifies that gate
may operators claim that the host no longer performs checkout or source builds.

### Leaf 2 dependency gate (preparatory)

Issue #156 adds `lib/security/leaf-dependencies.ts` as the narrow handoff seam
for the future Trial-isolation rollout. `verifyLeaf2Dependencies()` accepts only
the expected production source digest, Leaf 1's closed-password/unlinked-OAuth
proofs, and Leaf 13's immutable-delivery, rollback, and database-role capability
proof, then returns a branded value for later migration/apply commands. Signature
and trust-anchor verification remain the responsibility of the delivery broker;
the verifier does not manufacture deployment evidence.

The production workflow does not invoke a Leaf 2 migration, Trial disable,
membership cleanup, or support operation yet. Those commands remain blocked until
the exact private-runtime gate and broker installation are independently accepted
(Issues #184 and #185). This prevents a preparatory TypeScript seam from being
mistaken for a production authorization proof.

Before a restricted operator signs or installs a bundle, CI can build and verify
the public-safe package from the fixed layout. These commands do not sign,
install, enroll the trust key, or mutate a host:

```bash
pnpm delivery:build-bundle -- dist/delivery/linux-arm64 .artifacts/delivery-substrate-v1
pnpm delivery:verify-bundle -- .artifacts/delivery-substrate-v1
```

The `ci` job runs the same contract on GitHub-hosted Linux: a SHA-pinned
`actions/setup-go` (`v5.5.0`) provisions Go `1.22.12`, the three fixed Go
programs are cross-compiled with `CGO_ENABLED=0`, `GOOS=linux`, and
`GOARCH=arm64`, and the builder/verifier run before the CI summary receives
only target, v2 bundle format, artifact names, and SHA-256 lines. The binaries and bundle are
kept in the runner's temporary directory; no binary upload, signing key,
trust-key enrollment, SSH mutation, or host install occurs. This step is part
of `ci` so a failed artifact contract blocks a main deploy, while the current
SSH checkout/native-build deploy job remains unchanged.

Required GitHub secrets:

```text
DEPLOY_HOST=146.56.170.25
DEPLOY_USER=ubuntu
DEPLOY_SSH_KEY=<OCI private key>
DEPLOY_PATH=/home/ubuntu/munjib
DEPLOY_PORT=22
```

Current OCI production domain:

```text
https://munjib.andrewchoi.link
```

Target broker-only submit (not active; host install is still an external gate):

```bash
test -n "$APP_IMAGE_DIGEST"
test -n "$POSTGRES_IMAGE_DIGEST"
test -n "$HOST_BUNDLE_DIGEST"
test -n "$STORAGE_INIT_IMAGE_DIGEST"
test -n "$RELEASE_ENVELOPE"
printf '%s' "$APP_IMAGE_DIGEST" | grep -Eq '^ghcr.io/dschoi30/munjib@sha256:[a-f0-9]{64}$'
printf '%s' "$POSTGRES_IMAGE_DIGEST" | grep -Eq '^pgvector/pgvector@sha256:[a-f0-9]{64}$'
printf '%s' "$HOST_BUNDLE_DIGEST" | grep -Eq '^sha256:[a-f0-9]{64}$'
printf '%s' "$STORAGE_INIT_IMAGE_DIGEST" | grep -Eq '^.+@sha256:[a-f0-9]{64}$'
printf '%s' "$RELEASE_ENVELOPE" | grep -F -- "$APP_IMAGE_DIGEST" >/dev/null
printf '%s' "$RELEASE_ENVELOPE" | grep -F -- "$POSTGRES_IMAGE_DIGEST" >/dev/null
printf '%s' "$RELEASE_ENVELOPE" | grep -F -- "$HOST_BUNDLE_DIGEST" >/dev/null
test -S /run/munjib/release-broker.sock
test -r /etc/munjib/security/broker-operations-v1.json
printf '%s' "$RELEASE_ENVELOPE" | /usr/local/libexec/munjib-release-submit
```

The submit account only forwards a bounded frame to the fixed Unix socket; the
root broker independently revalidates the envelope and evidence before any
system mutation. A broker socket, signed envelope, or root trust key is not
present in this repository/host context, so this flow is documented but cannot
be claimed as production-ready.

<details>
<summary>Current checkout/native-build flow implemented by ci-cd.yml</summary>

Current deploy sequence:

```bash
cd "${{ secrets.DEPLOY_PATH }}"
git_auth_header="$(printf 'x-access-token:%s' "$DEPLOY_GIT_TOKEN" | base64 | tr -d '\n')"
git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $git_auth_header" fetch --force "https://github.com/$DEPLOY_REPOSITORY.git" main
git checkout --detach "$DEPLOY_SHA"
test "$(git rev-parse HEAD)" = "$DEPLOY_SHA"
sudo test -r "$DEPLOY_ENV_FILE"
install_secret nextauth-current "$DEPLOY_NEXTAUTH_SECRET"
compose_files="-f docker-compose.yml"
google_client_id="$(
  sudo awk -v key=GOOGLE_CLIENT_ID '
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
  ' "$DEPLOY_ENV_FILE"
)"
if test -n "$google_client_id" && test -n "$DEPLOY_GOOGLE_CLIENT_SECRET"; then
  install_secret google-client-current "$DEPLOY_GOOGLE_CLIENT_SECRET"
  compose_files="$compose_files -f docker-compose.google.yml"
fi
sudo env WEB_IMAGE="$WEB_IMAGE" SENTRY_RELEASE="$SENTRY_RELEASE" NEXT_PUBLIC_SENTRY_RELEASE="$NEXT_PUBLIC_SENTRY_RELEASE" docker compose $compose_files --env-file "$DEPLOY_ENV_FILE" build web tools
sudo env WEB_IMAGE="$WEB_IMAGE" docker compose $compose_files --env-file "$DEPLOY_ENV_FILE" --profile auth-preflight run --rm --no-deps auth-preflight pnpm security:auth-preflight
sudo env WEB_IMAGE="$WEB_IMAGE" docker compose $compose_files --env-file "$DEPLOY_ENV_FILE" --profile auth-preflight rm --force --stop auth-preflight
sudo env WEB_IMAGE="$WEB_IMAGE" docker compose $compose_files --env-file "$DEPLOY_ENV_FILE" run --rm tools pnpm exec prisma migrate deploy
sudo env WEB_IMAGE="$WEB_IMAGE" docker compose $compose_files --env-file "$DEPLOY_ENV_FILE" run --rm tools pnpm run db:rag:index
sudo env WEB_IMAGE="$WEB_IMAGE" SENTRY_RELEASE="$SENTRY_RELEASE" NEXT_PUBLIC_SENTRY_RELEASE="$NEXT_PUBLIC_SENTRY_RELEASE" docker compose $compose_files --env-file "$DEPLOY_ENV_FILE" up -d web
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --show-error --location --max-time 20 --header "Host: $DEPLOY_HEALTHCHECK_HOST" "$DEPLOY_HEALTHCHECK_URL" >/dev/null; then
    break
  fi
  if [ "$attempt" = "10" ]; then
    exit 1
  fi
  sleep 3
done
sudo docker image prune -f
```

이 deploy는 server checkout에서 Actions-provided ephemeral `github.token`을 Git HTTP extraheader로 사용해 repository `main`을 fetch한 뒤 workflow가 검증한 `github.sha`로 detached checkout을 고정하고, OCI ARM64 host에서 `web`과 `tools` image를 직접 build한다. 이 fetch 방식은 OCI server checkout의 stored HTTPS credential/token에 의존하지 않으며 token을 remote `.git/config`에 저장하지 않는다. OCI instance의 `ubuntu` user는 Docker socket에 직접 접근하지 못하므로 remote deploy는 `sudo docker` / `sudo env ... docker compose`를 사용한다. Build와 `up -d web`에는 release env를 전달하고, `tools` command는 이미 build된 image 선택에 필요한 `WEB_IMAGE`만 전달한다. Server checkout 기준으로 native build된 `tools` container에서 Prisma migration과 RAG vector index setup을 실행한 뒤 `web` service를 detached mode로 올린다. Remote script 안에서는 hairpin NAT 영향을 피하기 위해 `http://127.0.0.1:3000`에 `Host: munjib.andrewchoi.link` header를 붙인 local health check를 최대 10회 재시도하고, 성공 후 dangling image 정리를 위해 `sudo docker image prune -f`를 실행한다. SSH deploy step 뒤에는 GitHub-hosted runner에서 `https://munjib.andrewchoi.link` public health check를 별도 실행해 DNS/TLS/Caddy public path를 확인한다.

Secret install은 `umask 077` 아래에서 protected SSH channel의 process environment를 root-only temporary descriptor에 pipe하고 `chown 10001:10001`, `chmod 0400`, atomic `mv` 순서로 완료한다. 값은 argv, shell trace, GitHub output, Compose interpolation, checked-in env 파일에 쓰지 않는다. `auth-preflight`가 같은 runtime image에서 strict auth environment를 검사하고 성공한 뒤에만 service를 제거하고 Prisma migration, RAG index, Web replacement를 시작한다. Preflight 실패는 `set -euo pipefail`로 migration이나 current-container replacement를 중단한다. `docker-compose.dev.yml`만 direct `NEXTAUTH_SECRET`/`GOOGLE_CLIENT_SECRET`와 development flags를 허용하며 production workflow에서는 사용하지 않는다.

현재 deploy job에는 synthetic browser check와 Sentry event smoke test가 없다. 배포 후 상태 확인은 GitHub Actions log, public health check, server Docker logs, 필요 시 Sentry issue/trace 확인으로 수행한다.

OCI server production env는 repository checkout 안의 `.env`나 `.env.docker`가 아니라 host-local secret file `/etc/munjib/env`가 기준이다. Deploy workflow는 모든 remote Compose 명령에 `docker compose --env-file "$DEPLOY_ENV_FILE"`를 명시하고, 실제 compose interpolation은 이 파일과 workflow가 넘기는 release env를 함께 사용한다. `docker-compose.yml`의 `environment:` 항목은 `${VAR:-}` 형태라서 service-level `env_file`만 추가하면 빈 문자열이 우선되어 provider credentials가 계속 비는 문제가 생길 수 있다. 초기 production 관측 기간에는 Sentry trace sample rate를 `1.0`으로 둔다.

Issue #143의 email-only development login은 production에서 항상 disabled다. Production `docker-compose.yml`은 `MUNJIB_ENABLE_DEV_LOGIN=false`를 literal로 고정하고, strict auth runtime validator도 production의 `true` 값을 거부한다. 따라서 `/etc/munjib/env`에서 이 값을 바꿔도 production의 temporary login path는 열리지 않는다. 개발용 direct env와 기본 `true` 값은 `docker-compose.dev.yml`에만 남긴다.

```text
NEXTAUTH_URL="https://munjib.andrewchoi.link"
NEXTAUTH_COOKIE_SECURE=true
WEB_IMAGE=munjib-web:latest
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=1.0
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=1.0
MUNJIB_OPENAI_COMPATIBLE_BASE_URL=https://openrouter.ai/api/v1
MUNJIB_OPENAI_COMPATIBLE_API_KEY=<secret>
```

Issue #135 low-cost observability additions for the same host-local env file:

```text
SENTRY_RUNTIME_METRICS_ENABLED=true
SENTRY_RUNTIME_METRICS_INTERVAL_MS=60000
NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0
NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=1
```

</details>

### Docker runtime

Production compose는 `postgres`, `storage-init`, `web`, `tools` service를 가진다. runner image는 non-root web/auth-preflight가 Corepack의 기본 `/.cache`에 쓰지 않도록 `HOME=/tmp`와 `COREPACK_HOME=/tmp/.cache/node/corepack`을 사용한다. 이 cache에는 애플리케이션 secret이 들어가지 않으며, production prune 뒤에도 `pnpm start`와 isolated preflight가 같은 UID로 실행된다.

Issue #182는 production dependency prune 뒤에도 generated Prisma client를 보존하는
runner build contract를 추가한다. Runner는 BusyBox 호환 `find ... -print | head -n 1`로
production prune 전에 생성된
`.prisma/client` directory를 찾아 임시 build-only 경로에 복사하고, prune 뒤 root
`node_modules/.prisma/client`로 복원한다. Prisma CLI는 계속 development-only
dependency로 유지하며, 최종 image build는 `require("@prisma/client")` guard가
성공해야 끝난다. 따라서 package-manager virtual-store version을 고정하지 않고,
생성 client가 빠진 image는 publish 전에 fail-closed 된다.

- `postgres`: `pgvector/pgvector:0.8.2-pg16`, named volume `postgres_data`, configurable host port `POSTGRES_PORT`.
- `storage-init`: 고정 `alpine:3.22` root one-shot service. `web_storage:/app/storage`를 마운트하고 `/app/storage/attachments`를 만든 뒤 전체 storage tree를 UID/GID `10001:10001`로 소유권 정리한다. `web`은 `service_completed_successfully` 조건으로 이 단계가 끝난 뒤에만 시작한다.
- `web`: `runner` target 기반 production app, named volume `web_storage:/app/storage`, configurable host port `WEB_PORT`.
- `tools`: `tools` target 기반 maintenance command runner, `profiles: ["tools"]`.

`web` runtime env는 DB, NextAuth, Sentry error/tracing/runtime metrics, Browser Sentry build-time values, local Ollama/RAG 설정, 그리고 선택적 Langfuse `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` credential을 받는다. Langfuse secret은 명시적으로 full capture를 켠 운영 환경에서도 callback/exporter가 동작하도록 Compose env passthrough를 유지한다. `tools` service는 DB, NextAuth, local Ollama/RAG 설정은 받지만 현재 Sentry env는 받지 않는다.
`MUNJIB_ENABLE_DEV_LOGIN`은 request-time auth helper가 읽는 launch gate다. Production-style `web`은 `false`를 literal로 고정하고, local development override만 이 값을 직접 설정한다.

Dockerfile stages:

- `base`: Node.js 22 Alpine, Corepack, shared env.
- `deps`: frozen pnpm dependency install.
- `builder`: Browser Sentry DSN/environment/release/tracing/Replay build args를 env로 설정한 뒤 Prisma generate와 Next build.
- `tools`: maintenance command image.
- `runner`: production runtime image.
- `dev`: local development image.

### Release signer and production delivery gate

Production deploy의 artifact provenance와 host attestation은 [[Release Signer And Vault Workflow]]에서 관리한다. 초기에는 현재 Munjib OCI VM의 Docker Compose에 Vault Community를 함께 둘 수 있지만, 같은 호스트 경계이므로 독립 signer attestation을 충족하지 않는 임시 gate다. `vault server -dev`와 local Mac Docker는 production trust root가 아니다. Issue #208은 digest-pinned Vault 2.0.3, loopback-only Compose, `munjib-release-sign`, raw Ed25519 public-key normalization과 positive/tamper/expiry/generation/wrong-key local integration을 `pnpm vault:lab:test`로 구현했다. 이 command는 general CI/test에 암묵적으로 포함되지 않는 explicit Docker integration gate다. Phase A local evidence만 완료되었으며 production signed bundle, root-bootstrap key enrollment, host `VERIFY_ONLY_OK`, current/rollback/recovery evidence와 Issue #185 독립 attestation은 계속 미완료다.

## Monitoring

Docker log가 1차 운영 근거다.

```bash
docker compose logs -f --tail=300 --timestamps web postgres
```

Docker logs에서 먼저 볼 것:

- container startup failure
- 잘못된 `NEXTAUTH_URL`, `DATABASE_URL`, secret/env 설정
- DB connection failure
- PostgreSQL process log
- Sentry SDK init 전에 죽는 failure
- RAG/Ollama host 접근 문제

Sentry SaaS는 app-level error monitoring과 low sample rate tracing용이다. App Router integration 파일은 `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `app/global-error.tsx`다.

Sentry enable 조건:

- Browser: `NEXT_PUBLIC_SENTRY_DSN`이 있어야 init된다.
- Server/Edge: `SENTRY_DSN`을 우선 쓰고, 없으면 `NEXT_PUBLIC_SENTRY_DSN` fallback을 쓴다.
- DSN이 비어 있으면 Sentry init은 no-op이다.

Sentry environment/release/sample rate:

- Browser: `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`
- Server/Edge: `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`
- Server only: `SENTRY_RUNTIME_METRICS_ENABLED`, `SENTRY_RUNTIME_METRICS_INTERVAL_MS`
- Invalid trace sample rate는 startup failure가 아니라 tracing disabled 상태인 `0`으로 정규화된다.
- Invalid Replay sample rate and runtime metrics interval are normalized to low-cost defaults and do not fail startup.

Privacy contract:

- `sendDefaultPii: false`를 사용한다.
- Server/Edge `dataCollection`에서 user info, cookies, headers, bodies, query params, genAI input/output, stack frame variables, frame context lines를 끈다.
- Shared scrubber가 request URL query/host, `query_string`, request body, cookies, headers, user IP, span URL/query/network/user-agent fields, URL-like span names/descriptions, breadcrumb URL/query/host data를 제거한다.
- Metric scrubber가 Sentry metric attributes/tags에서 `server.address`, `user.email`, `user.id`, `user.name`을 제거한다.
- Console breadcrumb는 Docker stdout/console log 전체 수집을 피하기 위해 drop한다.
- Browser Replay는 켜져도 `maskAllText`, `maskAllInputs`, `blockAllMedia`를 사용한다.

현재 source map upload는 꺼져 있다. `next.config.mjs`는 `withSentryConfig`를 사용하지만 `sourcemaps.disable: true`이고, `SENTRY_AUTH_TOKEN`은 `.env.example`, `.env.docker.example`, compose runtime env에 포함하지 않는다.

## Failure modes

CI failure는 deploy를 막는다. Test, Next build, Docker `runner` build 중 하나라도 실패하면 production deploy가 일어나지 않는다.

Deploy secret이 빠지거나 SSH 접속이 실패하면 deploy job이 실패한다. PR validation에는 deploy secrets가 필요하지 않다.

Server checkout에서 Actions token 기반 repository fetch나 `DEPLOY_SHA` detached checkout이 실패하면 deploy가 source sync 단계에서 멈춘다. OCI host native Docker build가 실패하면 deploy가 `docker compose build web tools` 단계에서 멈춘다.

GHCR image가 `linux/arm64` manifest를 포함하지 않으면 OCI deploy는 과거 `docker compose pull web` 단계에서 `no matching manifest for linux/arm64/v8` 오류로 실패했다. Issue #96은 publish job을 QEMU 기반 multi-platform build/push로 바꾸는 중간 fix였고, Issue #98은 long-running QEMU publish를 제거해 OCI host에서 ARM64 image를 직접 build하도록 바꾼 현재 fix다.

Prisma migration이나 RAG vector index setup이 실패하면 `web` restart 전에 deploy가 멈춘다. Remote local health check가 실패하면 public runner health check까지 가지 않고 deploy가 실패한다. Remote local health check는 app container response를 확인하고, public runner health check는 외부 DNS/TLS/Caddy path를 확인한다. pgvector extension/table/index 상태 문제는 GitHub Actions service DB와 production DB 양쪽에서 확인해야 한다.

Browser Sentry 설정은 build-time bundle이다. `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`가 잘못된 image를 이미 build했다면 production runtime env 수정만으로 browser bundle이 고쳐지지 않는다. Native OCI deploy에서는 host-local `/etc/munjib/env`와 deploy job release env를 고친 뒤 새 build가 필요하다.

Sentry는 Docker log를 대체하지 않는다. Startup/env/DB/PostgreSQL 문제와 Sentry init 이전 crash는 Docker stdout/stderr를 먼저 본다.

## Tests

현재 CI/CD와 monitoring 계약은 다음 테스트가 고정한다.

```bash
pnpm exec vitest run tests/github-actions/ci-cd.test.ts tests/docker/compose.test.ts
pnpm exec vitest run tests/observability/sentry-config.test.ts tests/observability/sentry-scrub-event.test.ts tests/observability/sentry-files.test.ts tests/observability/application-metrics.test.ts tests/observability/ai-unavailable.test.ts
```

Full CI path에서는 `pnpm test`, `pnpm run build`, Docker `runner` target build가 실행된다. `main` deploy path에서는 OCI host의 `docker compose build web tools`, Prisma migration deploy, RAG vector index setup, public HTTPS health check가 실행된다. Local wiki maintenance 후에는 `pnpm wiki:manifest`와 `pnpm wiki:lint`로 frontmatter, manifest, link 구조를 확인한다.

## 근거

- GitHub issue #88
- GitHub issue #89
- GitHub issue #94
- GitHub issue #96
- GitHub issue #98
- GitHub issue #135
- GitHub issue #143
- GitHub Actions run `27016407598` deploy failure log
- GitHub Actions run `27017475831` cancelled publish log
- PR #99 review threads
- PR #144 review threads
- GitHub issue #133
- `.github/workflows/ci-cd.yml`
- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `.env.example`
- `.env.docker.example`
- `docs/superpowers/specs/2026-06-27-low-cost-production-observability-design.md`
- `docs/superpowers/plans/2026-06-27-low-cost-production-observability.md`
- `next.config.mjs`
- `instrumentation-client.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `lib/observability/application-metrics.ts`
- `instrumentation.ts`
- `app/global-error.tsx`
- `lib/observability/sentry-config.ts`
- `lib/observability/sentry-scrub-event.ts`
- `tests/github-actions/ci-cd.test.ts`
- `tests/auth/login-gate-callers.test.ts`
- `tests/docker/compose.test.ts`
- `tests/observability/sentry-config.test.ts`
- `tests/observability/sentry-scrub-event.test.ts`
- `tests/observability/sentry-files.test.ts`
- `tests/observability/application-metrics.test.ts`
- `tests/observability/ai-unavailable.test.ts`
- OCI server read-only inspection for `munjib.andrewchoi.link`
- [[Local Development Workflow]]
- [[Production Observability Workflow]]
