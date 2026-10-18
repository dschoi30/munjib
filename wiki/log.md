---
id: log-main
title: Wiki Log
type: log
status: active
summary: Munjib wiki 유지보수 timeline.
created: 2026-04-29
updated: 2026-10-10
source_count: 374
tags:
  - log
  - munjib
links:
  - "[[index|Wiki Index]]"
  - "[[Munjib]]"
  - "[[Project PRD]]"
  - "[[Wiki Maintenance Automation]]"
---

# Wiki Log

## 2026-10-09 - Verified private delivery and branch cleanup (Issue #234)

- Private delivery run `37945673261` succeeded. Independent host verification matched state, checkout and image to `f94359945f118f86f68607f69f085fc5c5687c56`, with local/public HTTP 200. Disabled the old source runner service and removed its GitHub registration; source has zero runners and private operations has one online runner. Ops issue #1 is completed.
- Review follow-up: hardening status and resume guidance now recover deleted remote branches from private backups; after history cleanup, port reviewed changes onto clean main instead of reintroducing archived history.
- Owner-authorized branch cleanup removed sixteen obsolete source remote branches, one operations branch and thirteen unused local branches after private recovery backups; checked-out worktree branches and dirty files remain. PR #237 merged after review/CI, and its remote branch was removed.
- Review follow-up: reconciled the public-release checklist and prior runner-guard section with the completed cutover for the verified SHA; recorded log-audit limitations and sanitized historical issue bodies.
- Updated [[Public Repository Release Workflow]], [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[Project PRD]], [[index|Wiki Index]] and `docs/runbooks/private-operations-delivery.md`; review follow-up reconciles the same verified-SHA cutover status across wiki entry points. These observations do not attest later commits or history replacement.

## 2026-10-09 - External LLM Wiki publication reference (Issue #234)

- Owner authorized private archival of both full-text copies and publication of source attribution plus a project-written summary. Verified original bytes against private backup before replacement; ordinary raw-source immutability still applies.
- Updated `llm-wiki.md`, `raw/sources/llm-wiki.md`, historical design/implementation notices, [[Wiki Maintenance Automation]], [[Public Repository Release Workflow]] and the public-release runbook.
- Review follow-up: recorded the narrowly scoped owner-approved migration in `AGENTS.md`; audits requiring original bytes must consult the private archive or disclose unavailable evidence, not assume a live URL is unchanged.
- Existing Git history still contains the full text. A reviewed history rewrite and object scan remain required; this change does not claim redistribution permission or completed publication.

## 2026-10-09 - Private launch identity configuration (Issue #234)

- Replaced operational identity literals in runtime, fixtures and project documentation with reserved examples. Runtime membership and signup checks resolve server-only identity configuration lazily; production/staging fail closed without a valid distinct pair.
- Review follow-up: explicit deployment environment takes precedence over NODE_ENV, and Node instrumentation validates the same pair during startup.
- Auth preflight validates the same pair before replacement. Compose passes runtime variables to web/preflight only; production seed remains forbidden and local seed uses local-only passwords.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]]. Source: `lib/auth/launch-accounts.ts`, membership/signup policy, auth preflight, Compose and seed. Preserve existing private values before rollout; no deployment is claimed by this source change.

## 2026-10-09 - Current MVP issue triage

- Owner chose to defer long-term work not adopted for current MVP. Fourteen issues (#139/#154/#159/#160/#162/#163/#164/#165/#166/#167/#168/#180/#184/#185) closed as `not_planned` with `deferred-mvp`; original scope and code remain recoverable (obsolete remote branches subsequently removed after private backup). PR #188 closed without merging; #234 stays active.
- Refreshed [[Security Hardening Public Status]] and `docs/runbooks/security-hardening-status.md` from live GitHub state; removed obsolete open-readiness-PR/billing-blocked claims. Added scope notes to affected workflow pages and [[index|Wiki Index]].
- Review follow-up: reconciled recovery, invite-signup and attachment runbook status fields; updated the existing recovery documentation assertion to require the actual deferred state.
- Evidence: owner's 2026-10-09 scope choice, issue states/reasons/labels and current PR API results. Closure is not implementation, deployment or security acceptance evidence.

## 2026-10-09 - Private operations delivery preparation (Issue #234)

- Removed source deploy and runner-smoke jobs. Private operations polls exact main after successful source CI and secret scan, repeats admission and skips already deployed SHAs; app commits remain in one repository.
- Pages: [[Public Repository Release Workflow]], [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[Project PRD]], [[index|Wiki Index]].
- Evidence: `.github/workflows/ci-cd.yml`, `tests/github-actions/ci-cd.test.ts`, `docs/runbooks/private-operations-delivery.md`, Issue #234 and the owner decision.
- Credential review follow-up: private operations keeps its source-only read credential after publication; renew it before expiry or independently verify a source-read App token replacement before revocation.
- Review follow-up: reconciled both state-board deployment entries and refreshed affected-page evidence/freshness metadata; the source-scoped deployment path is explicitly historical.
- Live runner cutover, source runner detachment and actual exact-SHA private deployment remain independent gates. This source change alone does not attest them.

## 2026-10-09 - Existing repository public-release preparation (Issue #234)

- Result: owner selected MIT and cleanup of existing history; publication remains gated. Added license, security policy, redacted Gitleaks scan and precise fixture exclusions, local-material ignores, pinned CI actions, and private-repository guards for production jobs.
- Affected pages: [[Public Repository Release Workflow]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]].
- Source evidence: `LICENSE`, `SECURITY.md`, `.gitleaksignore`, `scripts/security/scan-secrets.sh`, `.github/workflows/{secret-scan,ci-cd,runner-smoke}.yml`, `docs/runbooks/public-release-readiness.md`, Issue #234, and the official GitHub documentation linked in the runbook.
- Open gates: live credential revocation, private runner/delivery cutover, identity configuration, deployed-SHA rebinding after a reviewed rewrite, GitHub metadata/log cleanup, and final visibility review. Private findings and replacement specifications remain outside Git.

## 2026-10-09 - PR #230 review and CI follow-up

- Require canonical Origin for model probes and pair fallback providers with their matching model. Added regression tests. Updated [[RAG Process Workflow]].
- CI run 37903421792 failed production audit on GHSA-4jqv-mc3x-m676 and GHSA-mcj8-r9mp-w47p. Bumped Next.js and eslint-config-next to 15.5.27, the reported patched floor, with the runtime contract. See [[CI CD And Monitoring Workflow]].

## 2026-10-09 - AI settings model connection status (Issue #229)

- Updated [[RAG Process Workflow]] and [[index|Wiki Index]] for authenticated, model-specific probes, bounded requests and stale-result protection. Evidence: `lib/rag/check-model-connection.ts`, `app/api/workspaces/[workspaceSlug]/ai/connection/route.ts`, `components/ai/model-connection-status.tsx` and their tests.

## 2026-10-06 - Follow-up production dependency audit

- CI run 37483087997 reported a newly published source-map-js advisory. Pinned source-map-js 1.2.2 (reported patched floor) before demo deployment. Source: production dependency audit in that CI run.


## 2026-10-06 - Unicode signup password minimum

- PR #215 follow-up review: public signup now counts Unicode code points for its eight-character password minimum rather than UTF-16 code units. A regression test rejects four astral emoji before hashing. Source: `lib/auth/provisioning.ts`, `tests/auth/signup-work-limit.test.ts`.


## 2026-10-05 - Bound public signup password hashing

- PR #215 review identified unbounded signup KDF admission. `createPasswordSignup` now shares `withPasswordWorkPermit` with login, rejecting saturated work before hashing. Added the saturation regression test and updated [[Auth And Permissions Workflow]].


## 2026-10-05 - Demo PR dependency audit remediation

- PR #215 CI found 17 advisories in the existing lockfile. Updated Next.js/eslint-config-next to 15.5.24 and pinned patched transitive versions for browserslist, baseline-browser-mapping, fast-uri, sharp, brace-expansion and @grpc/grpc-js.
- Updated [[CI CD And Monitoring Workflow]] and the Next.js minimum-version contract. Evidence: GitHub Actions run 37311988012 dependency audit; Next.js release https://github.com/vercel/next.js/releases/tag/v15.5.24.


## 2026-10-05 - Manual demo access controls (Issue #214)

- Updated [[Auth And Permissions Workflow]] and [[index|Wiki Index]] with explicit password/Google signup and anonymous Trial opt-in controls, manual closure, retained account login, and the production evidence boundary.
- Sources: `lib/auth/signup-policy.ts`, `app/api/auth/signup/route.ts`, `lib/auth/config.ts`, `docker-compose.trial.yml`, `scripts/deploy/munjib-deploy.sh`, `docs/runbooks/demo-public-access.md`.
- Trial UI verification fixtures now use future reset times instead of expired August dates.


## 2026-08-25T18:40:00+09:00 - Trial Turnstile escalation UI

- Result: the login Trial CTA now handles `challengeRequired` with explicit Cloudflare Turnstile rendering and one bounded token resubmission before following the server-owned local entry path.
- Failure boundary: missing/invalid public site key, script/widget error, expiry, timeout, malformed token, repeated challenge, or invalid entry stays fail closed; the challenge token is not logged, stored, or placed in a URL.
- Source evidence: `app/login/login-form.tsx`, `app/login/page.tsx`, `lib/auth/turnstile-client.ts`, localized messages, and focused login tests. Cloudflare documents explicit rendering for conditional SPA challenges and requires `https://challenges.cloudflare.com` in `script-src` when CSP is enforced.

## 2026-08-25T19:00:00+09:00 - 익명 Trial AI ledger 보존기간 정리

- 결과: PR #213 review follow-up으로 PostgreSQL DB 시간 기반의 Trial AI purge service와 dry-run 기본 CLI를 추가했다. 방문자 35 KST 일, 네트워크·전체 8 KST 일, 만료 lease 24시간 경계를 한 transaction에서 멱등하게 정리한다.
- 안전 경계: `--execute` 없이는 삭제하지 않으며 lease → visitor → network → global 순서 중 실패하면 전체 rollback한다. 활성 lease와 현재 quota counter는 변경하지 않는다.
- 운영: `docs/runbooks/anonymous-trial-ai-retention.md`에 dry-run, 명시적 execute, 정상 결과, 완료·중단 기준, 최소 권한, 하루 1회 scheduler 계약을 기록했다.
- Source evidence: `lib/rag/trial-ai-retention.ts`, `lib/rag/trial-ai-retention-cli.ts`, `scripts/rag/purge-trial-ai-retention.ts`, `tests/rag/trial-ai-retention*.test.ts`, [[RAG Process Workflow]].

## 2026-08-25T18:20:00+09:00 - Trial admission PostgreSQL runtime validation

- Result: live migrated PostgreSQL verification exposed Prisma's inability to deserialize the `void` result of `pg_advisory_xact_lock`. The query now casts only the lock result to text while retaining the same transaction-scoped visitor lock.
- Verification: all three opt-in PostgreSQL tests passed: exactly-three concurrent global admission, cross-KST-midnight visitor serialization, and rollback of every counter after forced lease insertion failure.
- Source evidence: `lib/rag/trial-ai-admission.ts` and `tests/rag/trial-ai-admission.integration.test.ts`.

## 2026-08-25T00:00:00+09:00 - 익명 Trial AI 일일 제한 설계

- 결과: 가입 없는 익명 Trial에 기기별 KST 하루 Ask AI/Workspace AI 합산 3회를 제공하고, 일일 HMAC network ceiling, CAPTCHA 승격, 동시 요청 1회, 운영 설정 전체 한도를 결합하는 설계를 승인했다.
- 안전 경계: 본인 확인 없는 traffic은 유일한 사람을 증명할 수 없음을 명시하고, admission state에 raw network 주소나 AI 내용을 저장하지 않으며, 모델 호출 전 fail closed하고 기존 `trial@example.invalid`을 재활성화하지 않는다.
- 페이지: [[index|Wiki Index]]. 설계: `docs/superpowers/specs/2026-08-25-anonymous-trial-ai-daily-limit-design.md`.
- 근거: 현재 Ask AI와 Workspace AI route, auth session 경계, Issue #156 Trial 격리 기록, 사용자 승인 제품 제약.
- 검증: 설계 검토만 완료했다. schema, route, auth provider, runtime 설정, production data, 배포 동작은 변경하지 않았다.

## 2026-07-20T07:42:00+09:00 - public security status signer prerequisite

- Result: Added merged PR #209 / Issue #208 Phase A signer-lab preparation to the authoritative status map, explicitly retaining the #185 production bootstrap and independent attestation gates; refreshed #192/#193 heads.
- Source evidence: `docs/runbooks/security-hardening-status.md`, `wiki/CI CD And Monitoring Workflow.md`, GitHub PR metadata.
- Verification: wiki manifest/lint/sync checks.

## 2026-07-20T07:38:00+09:00 - public security status latest readiness heads

- Result: Refreshed the hardening status map with latest reviewed heads for PR #161 (`787b998`), #192 (`19b16d8`), and #193 (`0706332`); all remain CI billing-blocked with zero unresolved review threads.
- Source evidence: `docs/runbooks/security-hardening-status.md`, GitHub PR metadata/review audit.
- Verification: wiki manifest/lint/sync checks.

## 2026-07-20T07:24:00+09:00 - public security status production-evidence scope

- Result: Narrowed the public status snapshot so only #155 and #157 are described as production-verified; #158 remains merged/closed without an unsupported deployment claim.
- Source evidence: `wiki/Security Hardening Public Status.md`, `docs/runbooks/security-hardening-status.md`, PR #197 review thread.
- Verification: wiki manifest/lint/sync checks.

## 2026-07-20T07:18:00+09:00 - public security status latest heads

- Result: Refreshed the hardening status map with the latest reviewed heads for PRs #161 (`43311d9`), #191 (`1cb34bf`), #192 (`3721c66`), and #193 (`2432c43`); all remain CI billing-blocked with zero unresolved review threads.
- Source evidence: `docs/runbooks/security-hardening-status.md`, GitHub PR metadata/review audit.
- Verification: wiki manifest/lint/sync checks.

## 2026-07-20T07:08:00+09:00 - public security status head refresh

- Result: Updated the public hardening status map with the latest reviewed heads for PRs #161, #187, #191, #192, #193, and #195; all remain CI billing-blocked with zero unresolved review threads.
- Follow-up: The status-map row for PR #197 tracks this branch without self-embedding a commit hash.
- Source evidence: `docs/runbooks/security-hardening-status.md`, GitHub PR checks/review-thread audit.
- Verification: local status-map tests, TypeScript, and wiki gates.

## 2026-07-20T06:45:00+09:00 - public security status refresh

- Result: Refreshed Issues #154/#167 status from `origin/main` `c742a62`, recorded merged implementation PRs #199–#207, retained open readiness PR handles #187/#189/#191–#196/#198 and signup-gate #161, and closed duplicate PR #190 in the map.
- External blocker: GitHub Actions for the open readiness PRs are failing before runner start because GitHub reports an account-payment or spending-limit problem; merge/deploy decisions remain paused until `Billing & plans` is repaired.
- Pages: [[Security Hardening Public Status]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]]. Companion runbook: `docs/runbooks/security-hardening-status.md`.
- Source evidence: current GitHub PR metadata, merge history, and check-run annotations; no host, secret, account, or restricted operator evidence is recorded.
- Verification: local status-map/wiki gates only; no issue closure or production mutation is claimed.

## 2026-07-13T14:50:00+09:00 - public security status refresh

- Result: Refreshed the Issues #154/#167 status map from readiness-only handoffs to current draft implementation PRs #198, #199, #200, #201, #202, #203, #204, #195, #205, #206, and #207.
- Coverage: Updated branch/head handles for embedding registry, journal/auth, active resolver, ACL, auth abuse, AI history, provider boundary, attachment lifecycle, edge evaluator, backup manifest, and invite-token slices while preserving dependency gates and production non-claims.
- Pages: [[Security Hardening Public Status]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]]. Companion runbook: docs/runbooks/security-hardening-status.md.
- Source evidence: current GitHub PR metadata and CI status for the listed implementation branches; parent issues #154 and #167 remain open.
- Verification: wiki manifest/lint/sync checks and focused wiki tests are required before commit; no issue closure or production mutation is claimed.

## 2026-07-13T11:29:29+09:00 - public security hardening status map

- Result: Added a public-safe status/runbook map for parent Issues #154 and #167.
- Coverage: Maps merged P0 releases, draft readiness PRs, branch handles, dependency gates, and explicit non-claims without host details, secrets, account state, or restricted plan material.
- Pages: [[Security Hardening Public Status]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]]. Companion runbook: `docs/runbooks/security-hardening-status.md`.
- Source evidence: `origin/main` `545e8cb`, GitHub-visible issues/PRs #154, #155, #156, #157, #158, #159, #160, #161, #162, #163, #164, #165, #166, #167, #168, #169, #180, #184, #185 and readiness PRs #170, #172, #178, #181, #186, #187, #189, #190, #191, #192, #193, #194, #195, #196. Signup branch/commit `issue-161-security-signup-gate` (`4b22bb2`) is prepared but no PR is currently visible; a separate anticipated #198 was not visible during this recheck.
- Verification: Wiki manifest/lint/sync gates and focused wiki tests are required before commit; this page does not close any issue or claim deployment/host attestation.
## 2026-07-20T07:32:00+09:00 - Issue #161 proxy rejection boundary

- Result: Invite readiness rejects Node proxy contract objects and arrays before any own-key, descriptor, or value inspection, preventing caller-controlled proxy traps from executing.
- Source evidence: `lib/auth/invite-readiness.ts`, `tests/auth/invite-readiness.test.ts`, `docs/runbooks/invite-signup-gate-readiness.md`, PR #161 review thread.
- Verification: invite readiness tests and wiki gates.

## 2026-07-20T07:26:00+09:00 - Issue #161 top-level data-property guard

- Result: Invite readiness now rejects accessor properties on top-level contract fields as well as nested arrays, keeping the parser side-effect-free before consuming untrusted values.
- Source evidence: `lib/auth/invite-readiness.ts`, `tests/auth/invite-readiness.test.ts`, `docs/runbooks/invite-signup-gate-readiness.md`, PR #161 review thread.
- Verification: invite readiness tests and wiki gates.

## 2026-07-20T07:22:00+09:00 - Issue #161 bounded and accessor-free arrays

- Result: Invite readiness bounds canonical array lengths before key scanning and copies only own data-property values, rejecting huge sparse arrays and accessor properties without executing caller code.
- Source evidence: `lib/auth/invite-readiness.ts`, `tests/auth/invite-readiness.test.ts`, `docs/runbooks/invite-signup-gate-readiness.md`, PR #161 review threads.
- Verification: invite readiness tests and wiki gates.

## 2026-07-20T07:16:00+09:00 - Issue #161 nested contract-array own-key guard

- Result: Invite readiness now rejects non-enumerable and symbol own keys on nested canonical arrays before copying immutable values, matching the top-level exact-key policy.
- Source evidence: `lib/auth/invite-readiness.ts`, `tests/auth/invite-readiness.test.ts`, `docs/runbooks/invite-signup-gate-readiness.md`, PR #161 review thread.
- Verification: invite readiness tests and wiki gates.

## 2026-07-20T07:12:00+09:00 - Issue #161 workflow bearer transport alignment

- Result: Auth And Permissions Workflow now matches the guarded Leaf 7 contract: a raw bearer may appear in the client fragment and one bounded exchange body, then only the opaque attempt/hash crosses durable boundaries.
- Source evidence: `wiki/Auth And Permissions Workflow.md`, `docs/runbooks/invite-signup-gate-readiness.md`, PR #161 review thread.
- Verification: invite signup readiness test and wiki manifest/lint checks.

## 2026-07-20T07:10:00+09:00 - Issue #161 guarded exchange body boundary

- Result: The Leaf 7 contract now permits the raw bearer only in the client fragment and one guarded bounded exchange request body; all unintended request/server-visible and durable sinks remain forbidden.
- Source evidence: `lib/auth/invite-readiness.ts`, `deploy/security/signup/invite-first-readiness-v1.json`, invite readiness runbooks, PR #161 review thread.
- Verification: invite readiness and signup readiness tests.

## 2026-07-20T07:04:00+09:00 - Issue #161 fragment-only bearer transport

- Result: Narrowed the Leaf 7 raw-bearer invariant to permit only a client-side URL fragment for immediate exchange, with mandatory scrubbing before request/navigation boundaries; request/server-visible URLs and durable or observable sinks remain forbidden.
- Source evidence: `lib/auth/invite-readiness.ts`, `deploy/security/signup/invite-first-readiness-v1.json`, `docs/runbooks/invite-signup-gate-readiness.md`, PR #161 review thread.
- Verification: invite readiness and signup readiness tests.

## 2026-07-20T06:58:00+09:00 - Issue #161 iterator-safe readiness arrays

- Result: Invite readiness arrays are copied from validated numeric indices, so caller-controlled `Symbol.iterator` implementations cannot replace canonical values during the immutable return step.
- Source evidence: `lib/auth/invite-readiness.ts`, `tests/auth/invite-readiness.test.ts`, PR #161 review thread.
- Verification: focused invite readiness tests.

## 2026-07-13T14:45:00+09:00 - Issue #161 readiness parser review follow-up

- Invite readiness parsing now requires own object keys, dense canonical arrays, and bracket-safe validated field access; inherited or sparse JSON-like contracts fail closed.
- Source evidence: `lib/auth/invite-readiness.ts`, `tests/auth/invite-readiness.test.ts`, PR #161 review threads.
- Verification: invite readiness focused tests (5 passed), TypeScript, and staged wiki gates.
## 2026-07-13T14:45:00+09:00 - Issue #139 registry parser review follow-up

- Hardened the dependency-safe embedding profile parser against nullish identities and non-string provider values; malformed runtime inputs now fail with the stable registry error instead of coercing or throwing a native property error.
- Source evidence: `lib/rag/embedding-registry.ts`, `tests/rag/embedding-registry.test.ts`, PR #198 review threads.
- Verification: embedding registry/model-config tests (33 passed), TypeScript, and staged wiki gates.

## 2026-07-13T20:00:00+09:00 - Issue #139 embedding profile readiness

- Result: Added a side-effect-free embedding profile registry contract for the existing Ollama `bge-m3` 1024 index. The versioned profile id is forward-looking while the legacy `indexId` remains `bge-m3`; no runtime index, schema, provider, workspace, or production behavior changed.
- Coverage: deterministic profile id encoding, exact 1024-dimension validation, registry lookup, caller-supplied provider availability filtering, and absence of secrets/base URLs in registry metadata.
- Pages: [[RAG Process Workflow]], [[Embedding Profile Registry Readiness]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: Issue #139 assessment, `lib/rag/model-config.ts`, `lib/rag/embedding-registry.ts`, `tests/rag/embedding-registry.test.ts`.
- Verification: focused registry/model-config tests, TypeScript, and wiki manifest/lint/sync checks.
## 2026-07-20T06:58:00+09:00 - Issue #165 duplicate metadata inventory hardening

- Result: A physical file is no longer suppressed when valid attachment metadata rows duplicate its storage key; only one validated metadata reference can classify a file as referenced.
- Source evidence: `lib/attachments/lifecycle-inventory.ts`, `tests/attachments/lifecycle-inventory.test.ts`, PR #195 review thread.
- Verification: focused attachment lifecycle inventory tests.

## 2026-08-16T23:57:00+09:00 - private-oci-cd-runner

- Result: Issue #210 defines the RED source contract for a repository-scoped self-hosted deployment runner on the existing private OCI host.
- Boundary: The test requires an exact main SHA, stdin-only ephemeral GitHub token, fixed host paths, serialized deployment, ordered preflight/migration/index/health checks, and one narrow sudo wrapper. No production runner, host file, firewall rule, or deployment workflow has changed yet.
- Source evidence: `tests/deploy/self-hosted-deploy-contract.test.ts`, `docs/superpowers/specs/2026-08-16-private-oci-self-hosted-deploy-runner-design.md`, and `docs/superpowers/plans/2026-08-16-private-oci-self-hosted-deploy-runner.md`.
- Verification: The focused Vitest suite fails with `ENOENT` because the reviewed wrapper and sudoers source do not exist yet, establishing the intended RED state.

## 2026-08-16T23:59:00+09:00 - private-oci-cd-runner

- Result: Issue #210 adds the reviewed source for a fixed production deployment wrapper and the single-command `munjib-runner` sudo boundary. These files are repository artifacts only and have not been installed on OCI.
- Security boundary: The wrapper validates one exact lowercase commit SHA, reads the ephemeral GitHub token only from stdin, admits only `origin/main`, uses fixed host paths and a deployment lock, preserves host-local secrets, and records the deployed SHA only after local and public health checks.
- Source evidence: `scripts/deploy/munjib-deploy.sh`, `deploy/sudoers/munjib-actions-runner`, and `tests/deploy/self-hosted-deploy-contract.test.ts`.
- Verification: `bash -n`, 10 focused deploy contract tests, and forbidden privilege/secret-pattern searches pass.

## 2026-08-17T00:02:00+09:00 - private-oci-cd-runner

- Result: Issue #210 changes the reviewed CI/CD source so PR and main validation stay on GitHub-hosted runners while only successful `main` deployment targets the repository-scoped OCI runner labels `self-hosted`, `linux`, `ARM64`, and `munjib-production`.
- Boundary: The deploy job is serialized, passes the exact SHA and ephemeral job token to the fixed sudo wrapper, removes direct SSH deployment and deploy-secret references, and adds a permanent manual-only read-only runner smoke workflow. This source has not been merged or installed in production.
- Source evidence: `.github/workflows/ci-cd.yml`, `.github/workflows/runner-smoke.yml`, and `tests/github-actions/ci-cd.test.ts`.
- Verification: TypeScript compilation, 12 focused workflow/wrapper tests, 165 full test files with 1,497 tests, and whitespace checks pass.

## 2026-08-17T00:08:00+09:00 - private-oci-cd-runner

- Result: Issue #210 adds a beginner-oriented Bastion bootstrap, readiness, cutover, disablement, and recovery runbook and updates the durable CI/CD and signer boundaries.
- Boundary: The documented MVP uses the existing single OCI, outbound-only repository runner, no public SSH, no Docker group, and one fixed sudo wrapper. Vault, bundle signer, Issue #185 independent attestation, and PR #188 immutable delivery remain post-MVP and are not implied by this automation.
- Pages: [[CI CD And Monitoring Workflow]], [[Release Signer And Vault Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `docs/runbooks/private-oci-self-hosted-runner.md`, Issue #210, and the reviewed workflow/wrapper source.

## 2026-08-17T00:10:00+09:00 - private-oci-cd-runner

- Result: Added the approved Issue #210 architecture specification and task-by-task implementation plan to the branch as review evidence.
- Source evidence: `docs/superpowers/specs/2026-08-16-private-oci-self-hosted-deploy-runner-design.md` and `docs/superpowers/plans/2026-08-16-private-oci-self-hosted-deploy-runner.md`.
- Verification: Final TypeScript compilation, 165 test files with 1,497 tests, wiki manifest/lint, shell syntax, and whitespace checks pass before publication.

## 2026-08-17T00:42:00+09:00 - dependency-security

- Result: PR #211 CI feedback updates the reviewed 15.x runtime to Next.js and matching ESLint config 15.5.21, NextAuth 4.24.15, and Prisma adapter 2.11.3 with Auth core 0.41.3.
- Coverage: Exact patched overrides now cover PostCSS 8.5.23, scoped brace-expansion 5.0.9, OpenTelemetry Jaeger 2.9.0, fast-uri 3.1.5, nanoid 3.3.18, protobufjs 7.6.5, and sharp 0.35.0 while preserving the existing UUID, OpenTelemetry core, and scoped esbuild floors.
- Source evidence: `package.json`, `pnpm-lock.yaml`, `tests/security/dependency-audit.test.ts`, and `tests/security/next-runtime-version.test.ts`.
- Verification: Worktree-only `pnpm audit --prod --ignore-workspace` reports no known vulnerabilities and 67 focused runtime/auth/audit/workflow tests pass.

## 2026-08-17T16:57:00+09:00 - private-oci-cd-runner review follow-up

- Result: PR #211 review found that URL-based `git fetch ... main` updated only `FETCH_HEAD`, leaving the `origin/main` ancestry gate stale. The wrapper now fetches `main:refs/remotes/origin/main` explicitly before validating the requested SHA.
- Source evidence: PR #211 review thread, `scripts/deploy/munjib-deploy.sh`, `tests/deploy/self-hosted-deploy-contract.test.ts`, and [[CI CD And Monitoring Workflow]].
- Verification: The focused contract test failed against the old bare fetch refspec and passes with the explicit remote-tracking destination; shell syntax passes.

## 2026-08-17T17:09:00+09:00 - private-oci-cd-runner cancellation and image retention review

- Result: PR #211 review found that workflow-level cancellation could still interrupt an active main deployment and that per-SHA web images had no bounded retention. Main workflows now disable cancellation, while superseded PR workflows remain cancelable; successful deploy cleanup keeps the current and immediately previous `munjib-web:<sha>` tags and removes older Munjib web tags only.
- Source evidence: PR #211 review threads, `.github/workflows/ci-cd.yml`, `scripts/deploy/munjib-deploy.sh`, `tests/github-actions/ci-cd.test.ts`, `tests/deploy/self-hosted-deploy-contract.test.ts`, and `docs/runbooks/private-oci-self-hosted-runner.md`.
- Verification: Both new contract assertions failed against the reviewed implementation and pass after the scoped fixes; shell syntax passes.

## 2026-08-17T17:29:00+09:00 - private-oci-cd-runner bootstrap rollback retention

- Result: PR #211 follow-up review identified that the first cutover has a bootstrapped SHA but may still use the legacy `munjib-web:latest` image tag. Cleanup now preserves `latest` only while the previous SHA tag is absent, then automatically transitions to current-plus-previous SHA retention on later deploys.
- Source evidence: PR #211 review thread, `scripts/deploy/munjib-deploy.sh`, `tests/deploy/self-hosted-deploy-contract.test.ts`, `docs/runbooks/private-oci-self-hosted-runner.md`, and [[CI CD And Monitoring Workflow]].
- Verification: The new bootstrap-retention assertion failed against the prior cleanup loop and passes after the legacy fallback; shell syntax passes.

## 2026-08-17T17:41:00+09:00 - production runner smoke ref guard

- Result: PR #211 review identified that manual workflow dispatch can select a non-default ref. The production runner smoke job now requires `github.ref == 'refs/heads/main'`, so an accidental feature-branch dispatch is skipped.
- Source evidence: PR #211 review thread, `.github/workflows/runner-smoke.yml`, `tests/github-actions/ci-cd.test.ts`, `docs/runbooks/private-oci-self-hosted-runner.md`, and [[CI CD And Monitoring Workflow]].
- Verification: The new smoke-ref contract failed before the job guard and passes after it.

## 2026-08-25T10:24:00+09:00 - production runner trusted smoke dispatch

- Result: Re-review confirmed that an in-file `github.ref` guard cannot secure a branch-selectable `workflow_dispatch`, because the selected branch supplies the workflow file itself. Production smoke now uses only `repository_dispatch` type `production-runner-smoke`, which runs the default-branch workflow and SHA; the branch-selectable dispatch path is removed.
- Source evidence: PR #211 review threads, GitHub repository-dispatch documentation, `.github/workflows/runner-smoke.yml`, `tests/github-actions/ci-cd.test.ts`, `docs/runbooks/private-oci-self-hosted-runner.md`, and [[CI CD And Monitoring Workflow]].
- Verification: The replacement event contract failed against `workflow_dispatch` and passes with the default-branch repository dispatch.

## 2026-08-25T10:29:00+09:00 - DeepmergeTS production audit remediation

- Result: PR #211 CI detected GHSA-ggr8-5vv4-36mx through `@prisma/client > prisma > @prisma/config > deepmerge-ts`. The production lock graph now pins patched `deepmerge-ts` 8.0.0 and rejects vulnerable 7.1.5.
- Source evidence: GitHub Actions run 32797539798, `package.json`, `pnpm-lock.yaml`, `tests/security/dependency-audit.test.ts`, and [[Local Development Workflow]].
- Verification: `pnpm audit --prod --ignore-workspace` reports no known vulnerabilities; Prisma Client generation, dependency compatibility tests, and workflow contracts pass.

## 2026-08-25T10:40:00+09:00 - CI CD entry-point reconciliation

- Result: PR #211 wiki review reconciles the primary CI/CD entry-point summary with the implemented private OCI path: non-main superseded runs remain cancelable, main and production deploys are non-cancelable, and production builds exact `munjib-web:<deploy_sha>` tags instead of the legacy `latest` tag.
- Source evidence: PR #211 review thread, `.github/workflows/ci-cd.yml`, `scripts/deploy/munjib-deploy.sh`, and [[CI CD And Monitoring Workflow]].
- Verification: Wiki manifest, lint, and staged sync checks pass after removing the contradictory legacy summary.

## 2026-07-13T15:35:00+09:00 - Issue #165 review follow-up

- Result: the attachment lifecycle contract retains own-property checks for required fields and documents the prototype-pollution boundary; the review suggestion is covered by the existing regression test.
- Pages: [[Attachment Lifecycle Readiness]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/attachments/lifecycle-contract.ts`, `tests/attachments/lifecycle-contract.test.ts`, PR #195 review thread.
- Verification: focused lifecycle-contract tests, wiki manifest/lint/sync checks.

## 2026-07-13T13:40:00+09:00 - Issue #165 review hardening for malformed inventory input

- Result: Tightened the preparation primitive after review. The lifecycle
  contract parser now requires canonical fields to be own properties, blocking
  inherited/prototype-polluted values. Inventory inputs accept unknown runtime
  shapes, normalize non-string keys to a non-sensitive sentinel, classify them
  as `invalid-key` without throwing, and sort using UTF-16 code units for
  locale-independent deterministic output.
- Verification: focused attachment contract/inventory/storage-key/route tests
  (23 passed) and `pnpm exec tsc --noEmit --pretty false`.

## 2026-07-13T13:20:00+09:00 - Issue #165 preparation inventory and storage-key guard

- Result: Added a dependency-safe, non-destructive attachment lifecycle slice.
  `storage-key.ts` validates workspace-scoped UUID keys and path containment on
  every attachment service read/write; malformed persisted keys fail closed as
  `ATTACHMENT_STORAGE_KEY_INVALID` and the API route returns the same 404 as a
  missing attachment. `lifecycle-inventory.ts` deterministically reconciles
  broker-provided metadata/file manifests into referenced, missing-bytes,
  orphan-bytes, and invalid-key counts with `mutationAllowed: false`.
- Boundary: No Prisma query, filesystem enumeration, delete, scheduler,
  migration, production volume access, or ACL bypass was added. Candidate
  callers must still satisfy the Phase A dependency attestation.
- Pages: [[Attachment Lifecycle Readiness]], [[Document Knowledge Model]],
  [[Markdown Import And Clipboard Paste Workflow]], [[index|Wiki Index]],
  [[log|Wiki Log]].
- Source evidence: `lib/attachments/storage-key.ts`,
  `lib/attachments/lifecycle-inventory.ts`, `lib/attachments/service.ts`,
  `app/api/attachments/[attachmentId]/route.ts`, and attachment tests.
- Verification: focused attachment lifecycle/route tests and
  `pnpm exec tsc --noEmit --pretty false`.

## 2026-07-13T11:25:00+09:00 - Issue #165 attachment lifecycle readiness handoff

- Result: Added a public-safe, preparation-only attachment lifecycle contract and runbook. The contract records the current transaction/ACL/preview boundaries, the orphan-byte and abandoned-paste gaps, dependency gates for Issues #2/#4/#5/#6 and Leaf 13B, and the later Issue #164 provider-policy v2 boundary without enabling deletion, schema changes, or production scheduling.
- Pages: [[Attachment Lifecycle Readiness]], [[Document Editing Workflow]], [[Markdown Import And Clipboard Paste Workflow]], [[Document Knowledge Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/attachments/service.ts`, `app/api/attachments/[attachmentId]/route.ts`, `lib/documents/purge-archived.ts`, `components/document-editor/markdown-preview.tsx`, `deploy/attachments/attachment-lifecycle-readiness-v1.json`, `lib/attachments/lifecycle-contract.ts`, and attachment/purge tests.
- Verification: focused lifecycle contract tests, TypeScript, and wiki manifest/lint/sync gates.
## 2026-07-20T06:10:00+09:00 - Issue #164 policy readiness reconciliation

- Result: Preserved the public-safe AI provider policy handoff and the review-hardened request-boundary contract. Readiness coverage rejects bare credential, endpoint, and embedding field names in both AI routes, including nested `body.value` payload shapes, while live provider activation remains gated.
- Pages: [[RAG Process Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: Issue #164, `docs/runbooks/ai-provider-policy-readiness.md`, `tests/security/ai-provider-policy-readiness.test.ts`, PR #194 review thread.
- Verification: focused readiness test and wiki manifest/lint/sync checks.
## 2026-07-20T07:40:00+09:00 - Issue #163 bounded lineage and atomic memory summary

- Result: Derived history readiness now fails closed when bounded lineage is exceeded (no prior-context rollover) and requires memorySummary plus lineage to persist and serialize as one matching atomic pair.
- Source evidence: `docs/runbooks/derived-ai-history-authorization-readiness.md`, `wiki/RAG Process Workflow.md`, readiness tests, PR #193 review threads.
- Verification: focused readiness test and wiki gates.

## 2026-07-20T07:36:00+09:00 - Issue #163 memory summary and bounded lineage

- Result: Derived history readiness now protects `memorySummary` in GET/reset/streamed `done` DTOs and bounds deduplicated transitive lineage at 256 sources or 32,768 bytes without dropping authorization dependencies.
- Source evidence: `docs/runbooks/derived-ai-history-authorization-readiness.md`, `wiki/RAG Process Workflow.md`, readiness tests, PR #193 review threads.
- Verification: focused readiness test and wiki gates.

## 2026-07-20T07:30:00+09:00 - Issue #163 completion and pagination visibility boundaries

- Result: Derived history readiness now treats streamed send-completion/`done` serialization as a distinct visibility boundary and requires authorization before page limits/cursors, with visible-only overfetch/refill metadata.
- Source evidence: `docs/runbooks/derived-ai-history-authorization-readiness.md`, `wiki/RAG Process Workflow.md`, readiness tests, PR #193 review threads.
- Verification: focused readiness test and wiki gates.

## 2026-07-20T07:20:00+09:00 - Issue #163 prompt-lineage and whole-turn contract alignment

- Result: Derived history readiness now persists the union of every current prompt source and inherited lineage, independent of displayed citations, and removes the contradictory USER-row visibility wording from the wiki handoff.
- Source evidence: `docs/runbooks/derived-ai-history-authorization-readiness.md`, `wiki/RAG Process Workflow.md`, readiness tests, PR #193 review threads.
- Verification: focused readiness test and wiki gates.

## 2026-07-20T07:14:00+09:00 - Issue #163 reset and turn-correlation boundaries

- Result: Derived AI history readiness now includes reset-response serialization and requires a durable turn key with turn-granular pagination before whole-turn suppression can be trusted across concurrent sends, orphan rows, or page boundaries.
- Source evidence: `docs/runbooks/derived-ai-history-authorization-readiness.md`, `wiki/RAG Process Workflow.md`, readiness tests, PR #193 review threads.
- Verification: focused readiness test and wiki gates.

## 2026-07-20T07:10:00+09:00 - Issue #163 future whole-turn requirement

- Result: Labeled paired USER+ASSISTANT suppression as a future integration requirement so the current per-message helper is not mistaken for list-level behavior.
- Source evidence: `docs/runbooks/derived-ai-history-authorization-readiness.md`, PR #193 review thread.
- Verification: focused readiness test.

## 2026-07-20T07:06:00+09:00 - Issue #163 whole-turn suppression

- Result: Derived AI history readiness now treats persisted `USER`+`ASSISTANT` rows as one turn and suppresses the pair or uses one aggregate redaction when assistant access is denied, preventing unmatched-question position leakage.
- Pages: [[RAG Process Workflow]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `docs/runbooks/derived-ai-history-authorization-readiness.md`, `wiki/RAG Process Workflow.md`, readiness tests, PR #193 review thread.
- Verification: focused readiness test.

## 2026-07-20T07:00:00+09:00 - Issue #163 transitive lineage and list suppression

- Result: Derived AI history readiness now requires follow-up answers and refreshed memory summaries to inherit the union of consumed source lineages, and requires list-level suppression or aggregate redaction instead of one tombstone per hidden row.
- Pages: [[RAG Process Workflow]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `docs/runbooks/derived-ai-history-authorization-readiness.md`, `wiki/RAG Process Workflow.md`, `tests/security/derived-ai-history-authorization-readiness.test.ts`, PR #193 review threads.
- Verification: focused readiness test.

## 2026-07-20T06:56:00+09:00 - Issue #163 stream contract assertion hardening

- Result: The readiness test now requires both halves of the streamed authorization contract: immediate per-token reauthorization and whole-response buffering until a final authority recheck.
- Source evidence: `tests/security/derived-ai-history-authorization-readiness.test.ts`, PR #193 review thread.
- Verification: focused readiness test.

## 2026-07-20T06:55:00+09:00 - Issue #163 stream reauthorization boundary

- Result: Strengthened the derived AI history handoff so streamed responses
  require reauthorization immediately before each token or buffer the entire
  response until a final authority check; a single pre-stream check or
  finalization-only check is insufficient.
- Maintenance: Removed test-line-ending commentary from the RAG workflow and
  refreshed `Document Editing Workflow` frontmatter to `updated: 2026-07-20`.
- Pages: [[RAG Process Workflow]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `docs/runbooks/derived-ai-history-authorization-readiness.md`,
  PR #193 review threads.
- Verification: 5 focused readiness tests and TypeScript compilation.

## 2026-07-20T06:50:00+09:00 - Issue #163 readiness contract test reconciliation

- Result: Preserved the current main runbook and added the missing contract test that asserts the derived AI history readiness handoff remains documentation-only, lineage-gated, whole-turn redacting, and outside destructive purge or broker installation.
- Scope: No runtime history authorization behavior or schema mutation changed; the existing implementation and runbook remain the authoritative main content.
- Pages: [[RAG Process Workflow]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `tests/security/derived-ai-history-authorization-readiness.test.ts`, `docs/runbooks/derived-ai-history-authorization-readiness.md`, PR #193.

## 2026-07-20T06:52:00+09:00 - Issue #163 streaming authorization review hardening

- Result: The readiness contract now requires authorization before any streamed token is emitted, or buffering until the final recheck succeeds; a finalization-only check after `onToken` is explicitly insufficient for mid-stream revocation.
- Source evidence: `docs/runbooks/derived-ai-history-authorization-readiness.md`, `tests/security/derived-ai-history-authorization-readiness.test.ts`, PR #193 review thread.
- Verification: 5 focused readiness tests and TypeScript compilation.
## 2026-07-20T07:40:00+09:00 - Issue #160 active mutation and verification matrix

- Result: Issue #160 readiness now covers active-state checks for normal document mutations, adversarial same-tenant permission subjects, and bounded document-scoped history pagination in addition to link reconciliation.
- Source evidence: `docs/runbooks/document-authorization-readiness.md`, `wiki/Document Editing Workflow.md`, PR #192 review threads.
- Verification: wiki manifest/lint/sync checks.

## 2026-07-20T07:34:00+09:00 - Issue #160 reconciliation verification matrix

- Result: Document authorization verification now requires independent source-authority fixtures for every link-reconciliation caller, including normal document and folder rename/move paths, not only broken-link target creation.
- Source evidence: `docs/runbooks/document-authorization-readiness.md`, `wiki/Document Editing Workflow.md`, PR #192 review thread.
- Verification: wiki manifest/lint/sync checks.

## 2026-07-20T07:28:00+09:00 - Issue #160 reconciliation caller coverage

- Result: Expanded the document authorization contract to cover every broken-link reconciliation caller, not only target creation, and corrected Wiki Log source_count to include all seven Issue #160 evidence entries.
- Source evidence: `docs/runbooks/document-authorization-readiness.md`, `wiki/Document Editing Workflow.md`, `wiki/manifest.json`, PR #192 review threads.
- Verification: wiki manifest/lint/sync checks.

## 2026-07-20T07:20:00+09:00 - Issue #160 source-link and archived-cascade authority

- Result: Document authorization readiness now requires authority for every source link row repaired by target creation and explicitly fails closed on cascades touching archived descendants until a separate archive-maintenance authority exists.
- Source evidence: `docs/runbooks/document-authorization-readiness.md`, `wiki/Document Editing Workflow.md`, PR #192 review threads.
- Verification: wiki manifest/lint/sync checks.

## 2026-07-20T07:14:00+09:00 - Issue #160 index evidence metadata

- Result: Incremented Wiki Index source_count for the Issue #160 authorization-readiness evidence and regenerated the manifest metadata.
- Source evidence: `wiki/index.md`, `wiki/manifest.json`, PR #192 review thread.
- Verification: wiki manifest/lint/sync checks.

## 2026-07-20T07:10:00+09:00 - Issue #160 auth workflow metadata refresh

- Result: Incremented Auth And Permissions Workflow source_count to 102 for the new Issue #160 readiness evidence and regenerated the manifest.
- Source evidence: `wiki/Auth And Permissions Workflow.md`, `wiki/manifest.json`, PR #192 review thread.
- Verification: wiki gates.

## 2026-07-20T07:02:00+09:00 - Issue #160 metadata and descendant coverage

- Result: Refreshed Wiki Log source metadata and clarified that folder path mutations must authorize every descendant row actually updated, including archived descendants loaded by the cascade.
- Source evidence: `docs/runbooks/document-authorization-readiness.md`, `wiki/Document Editing Workflow.md`, PR #192 review threads.
- Verification: wiki manifest/lint/sync checks.

## 2026-07-20T06:52:00+09:00 - Issue #160 readiness wording correction

- Result: Changed the status-map wording from “closes” to “records” so the
  documentation-only ACL handoff does not imply that Leaf 5 authority or route
  behavior is already active.
- Pages: [[index|Wiki Index]], [[Auth And Permissions Workflow]], [[log|Wiki Log]].
- Source evidence: `wiki/index.md`, PR #192 review thread.
- Verification: wiki gates.

## 2026-07-20T06:40:00+09:00 - Issue #160 document authorization readiness

- Result: Recorded the dependency-gated document authorization closure: descendant-folder authorization, broken-link source checks, active attachment/comment/history routes, role-capped document permissions, minimal current-view DTOs, and authenticated history pagination remain tied to the active-resource authority.
- Scope: No competing membership lookup, ACL helper, schema mutation, or production activation was added.
- Pages: [[Auth And Permissions Workflow]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `docs/runbooks/document-authorization-readiness.md`, `lib/documents/service.ts`, `lib/folders/service.ts`, `lib/attachments/service.ts`, `lib/comments/service.ts`, `lib/wiki-links/service.ts`, and current permission tests.

## 2026-07-20T06:41:00+09:00 - Issue #160 documentation review follow-up

- Result: Readiness bullets use sentence capitalization, terminal punctuation, and the standard `ID` abbreviation.
- Source evidence: `docs/runbooks/document-authorization-readiness.md`, PR #192 review threads.
- Verification: documentation diff review and wiki manifest/lint/sync checks.
## 2026-07-20T07:14:00+09:00 - Issue #162 status-board implementation order

- Result: Wiki Index now names the pending support-grant/runtime activation and points the next implementation slice to schema/migration plus route integration after the dependency gates, rather than describing the already-merged guard runtime as new work.
- Source evidence: `wiki/index.md`, `docs/runbooks/auth-abuse-sessions-readiness.md`, PR #191 review threads.
- Verification: wiki gates.

## 2026-07-20T07:10:00+09:00 - Issue #162 status-board host-edge gate

- Result: Wiki Index status-board now includes Issue #166 host-edge binding/probe acceptance alongside the Leaf 2 and Leaf 13 prerequisites.
- Source evidence: `wiki/index.md`, PR #191 review thread.
- Verification: wiki gates.

## 2026-07-20T07:06:00+09:00 - Issue #162 pending implementation wording

- Result: Auth-abuse readiness now limits the “present” claim to merged journal/durable-state and bounded guard preparation; support-grant and runtime activation remain implementation work.
- Source evidence: `docs/runbooks/auth-abuse-sessions-readiness.md`, PR #191 review thread.
- Verification: documentation review.

## 2026-07-20T07:00:00+09:00 - Issue #162 host-edge dependency tracking

- Result: Auth-abuse activation handoff now keeps the Issue #166 host-edge contract explicit alongside the pending support-grant, private runtime, database, and broker gates.
- Source evidence: `docs/runbooks/auth-abuse-sessions-readiness.md`, `wiki/Auth And Permissions Workflow.md`, PR #191 review thread.
- Verification: documentation review and wiki gates.

## 2026-07-20T06:50:00+09:00 - Issue #162 readiness state refresh

- Result: Updated the auth-abuse/session-revocation handoff to distinguish the
  merged Leaf 2 journal/durable-auth and Issue #162 guard contracts (PRs #199
  and #202) from the still-pending support-grant contract, database migration,
  route activation, and deployment evidence.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `docs/runbooks/auth-abuse-sessions-readiness.md`,
  `wiki/Auth And Permissions Workflow.md`, PR #191 review thread.
- Verification: documentation consistency review and wiki gates.

## 2026-07-20T06:45:00+09:00 - Issue #156 capability and source digest hardening

- Result: Leaf 2 dependency verification now rejects non-string capability
  digests before regular-expression evaluation, preventing arrays or other
  runtime values from being coerced into a branded string proof. The trusted
  deployment source digest is now supplied outside the parsed proof envelope,
  so matching stale proof fields cannot self-authorize a release.
- Pages: [[Auth And Permissions Workflow]], [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/security/leaf-dependencies.ts`,
  `tests/security/leaf-dependencies.test.ts`, PR #187 review thread.
- Verification: 10 focused Leaf 2 tests and TypeScript compilation.

## 2026-07-20T06:30:00+09:00 - Issue #162 auth-abuse/session-revocation readiness

- Result: Recorded the documentation-only auth-abuse handoff with the exact `authDisabledAt`, BigInt `sessionVersion`, `support-grant`, and deny-only journal authorities required before implementation.
- Scope: Current encrypted-JWT runtime remains unchanged; no schema migration, secret rotation, route activation, host installation, or production mutation was performed.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `docs/runbooks/auth-abuse-sessions-readiness.md`, `prisma/schema.prisma`, `lib/auth/config.ts`, `lib/auth/downstream/leaf2.ts`, Issues #162, #184, and #185.

## 2026-07-20T06:20:00+09:00 - Issue #159 active-resource boundary readiness

- Result: Recorded the dependency-gated active-resource readiness handoff. Resolver and archive-lock callers remain disabled until canonical database-time membership authority, support-access semantics, deny-only journal API, and immutable runtime/broker attestation are independently available.
- Scope: Public-safe documentation only; no resolver, archive lock caller, schema, journal, purge, or production activation changed.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub Issue #159 and `docs/runbooks/active-resource-boundaries-readiness.md`.

## 2026-07-20T05:54:00+09:00 - Issue #161 invite token primitive boundary

- Result: Recorded the Leaf 7 dependency-safe invitation bearer and attempt-secret boundary: canonical 256-bit base64url secrets, domain-separated hash-only persistence, constant-time hash comparison, exact exchange-body parsing, immutable output, and no route/database/URL/logging capabilities.
- Scope: Preparation only; invitation lifecycle, atomic consumption, revision invalidation, provider linking, and production signup activation remain gated follow-ups.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: Issue #161, `lib/auth/invite-token.ts`, `tests/auth/invite-token.test.ts`, `tests/security/invite-token-source-contract.test.ts`, `docs/runbooks/invite-token-primitives.md`.
- Verification: focused invite-token/source-boundary tests, TypeScript compilation, and wiki manifest/lint/sync checks.

## 2026-07-20T06:10:00+09:00 - Issue #156 trial-isolation dependency seam

- Result: Added the dependency-safe branded `verifyLeaf2Dependencies()` handoff for the future Trial-isolation rollout. It accepts only the expected production source digest, Leaf 1 closed-signup proofs, and Leaf 13 immutable-delivery/rollback/database-role capability proofs.
- Boundary: The verifier consumes broker-verified proof fields but does not verify signatures or activate production migration, Trial quarantine, membership cleanup, support access, or journal mutation. Those operations remain deferred behind Issues #184 and #185.
- Pages: [[Auth And Permissions Workflow]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/security/leaf-dependencies.ts`, `tests/security/leaf-dependencies.test.ts`, GitHub Issue #156.
- Verification: `pnpm exec vitest run tests/security/leaf-dependencies.test.ts` (8 tests passed); full TypeScript and wiki gates run during synchronization.

## 2026-07-20T06:12:00+09:00 - Issue #156 verifier review hardening

- Result: `verifyLeaf2Dependencies()` now fails closed for nullish/partial parsed input, pins the expected environment to literal `production`, and requires all Leaf 1/Leaf 13 capability flags to be literal booleans.
- Pages: [[Auth And Permissions Workflow]], [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/security/leaf-dependencies.ts`, `tests/security/leaf-dependencies.test.ts`, PR #187 review threads.
- Verification: 8 focused Leaf 2 dependency tests, TypeScript compilation, and wiki gates.

## 2026-07-20T01:08:00+09:00 - Issue #168 manifest binding review fixes

- Result: `parseSnapshotManifest()` recomputes `migrationIdsSha256(appliedIds)`, bounds decimal strings before `BigInt` conversion, caps every PostgreSQL-backed aggregate count at signed int64, requires full non-zero 40-character runtime source commits, accepts exhaustive attachment inventories beyond the old 100,000-entry parser ceiling, applies the same capacity policy to exhaustive READY archive receipts, requires a document ID on every inventory row, caps manifest and receipt attachment sizes at PostgreSQL/Prisma signed int32, rejects null-like/moving provider-generation aliases, covers all non-null attachment document references across lifecycle states, rejects zero-byte database dumps and zero-byte archives with READY entries, bounds recursive sensitive-key traversal depth, binds organization→workspace→document aggregate parents plus `aggregateCounts.attachments` and document counts to the attachment inventory, requires positive containing-batch starts within the checkpoint, ties latest/containing batch digests together after genesis, ties latest batch digest presence to genesis, rejects positive journal hashes equal to genesis, and enforces Leaf 2 int64/genesis/equal-sequence/different-sequence journal hash rules. `assertRecoveryCompatibility()` now requires independent evidence for the full recovery-pointer projection (including image, release-evidence, artifact-set, and contract fields) and derived migration/schema contract digest; the public readiness contract encodes Phase-B dependence on Phase-A acceptance and exact-envelope reuse. `parseSnapshotEnvelope()` binds envelope identity, epoch, image/capability digests, journal sequence, and the canonical manifest SHA-256 to the decrypted manifest and decrypt receipt.
- Pages: [[index|Wiki Index]], [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/backup/manifest.ts`, `tests/backup/manifest.test.ts`, PR #206 review thread.
- Verification: focused manifest/recovery-contract tests and TypeScript.

## 2026-07-13T16:25:00+09:00 - Issue #168 manifest review follow-up

- Result: backup manifest tests lock non-adjacent duplicate-path rejection, invalid UTC handling, deterministic archive ordering, and strict unknown-record typing; sparse arrays and exact-key receipt/payload validation remain fail closed.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/backup/manifest.ts`, `tests/backup/manifest.test.ts`, PR #206 review threads.
- Verification: focused manifest/recovery-contract suites, TypeScript, and wiki gates.

## 2026-07-20T01:00:00+09:00 - Issue #166 edge probe review reconciliation

- Result: edge activation evidence is now an exact required set, public probes cover the `/api/`, `/login`, and existing workspace dynamic `/workspaces/probe` no-store classes, probe timestamps require strict UTC millisecond ISO round-tripping, no-store root paths are covered at their boundary, Cache-Control accepts only top-level comma-separated directives while preserving quoted commas, redacted telemetry canonicalizes unknown IDs, malformed timestamps, or invalid numerics, probe variants reject incompatible keys, request method and credential omission are bound, HTTPS probes require verified canonical TLS metadata and zero redirects, invalid HTTP-token or whitespace-padded header names and control-character values fail closed, and timeout overruns fail closed.
- Pages: [[index|Wiki Index]], [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/deploy/edge-bindings.ts`, `tests/deploy/edge-bindings-evaluator.test.ts`, PR #205 review feedback.
- Verification: focused edge-binding tests and TypeScript.

## 2026-07-20T00:50:00+09:00 - Issue #164 index and NAT64 review fixes

- Result: Wiki Index frontmatter now reflects the Issue #164 addition, and standard/local-use NAT64 translated IPv6 destinations fail closed outside the fixed Ollama gate.
- Pages: [[index|Wiki Index]], [[RAG Process Workflow]], [[log|Wiki Log]].
- Verification: focused provider-boundary tests and TypeScript.

## 2026-07-20T00:28:00+09:00 - Issue #164 IPv6 hostname classification review fix

- Result: multicast prefix checks now apply only to IPv6 literals, preserving valid server-owned DNS names such as `ffapi.example`.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Verification: focused provider-boundary tests and TypeScript.

## 2026-07-20T00:18:00+09:00 - Issue #164 IPv6 special-range review fix

- Result: compressed IPv4-compatible and multicast IPv6 destinations now fail closed outside the explicit fixed Ollama gate.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Verification: focused provider-boundary tests and TypeScript.

## 2026-07-20T00:10:00+09:00 - Issue #164 provider-boundary review reconciliation

- Result: provider selection inputs require runtime string types, IPv4-mapped IPv6 private destinations are denied, and staging is treated as production-like for HTTPS/private-destination policy.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/rag/provider-boundary.ts`, `tests/rag/provider-boundary.test.ts`, PR #204 review feedback.
- Verification: focused provider-boundary tests and TypeScript.

## 2026-07-19T23:55:00+09:00 - Issue #163 citation canonicalization review fix

- Result: source-backed history citations now admit only authorized document/chunk identifiers; unverifiable title, path, heading, and arbitrary fields fail closed.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Verification: focused AI history tests and TypeScript.

## 2026-07-19T22:58:00+09:00 - Issue #163 nested lineage schema review fix

- Result: source-backed lineage and source entries now require the exact v1 nested key schema, preventing unreviewed nested source metadata from reaching visible history DTOs.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Verification: focused AI history tests and TypeScript.

## 2026-07-19T20:37:00+09:00 - Issue #163 source-backed contamination review fix

- Result: source-backed history rows now fail closed when extra context metadata or citations reference sources outside the authorized lineage.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Verification: focused AI history tests and TypeScript.

## 2026-07-19T20:24:00+09:00 - Issue #163 source-free contamination review fix

- Result: `source-free-v1` assistant rows now fail closed when persisted citations remain or `contextMeta` contains anything beyond the exact lineage proof, preventing mixed-writer and partial-migration rows from bypassing source authority.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/rag/ai-history-authorization.ts`, `tests/rag/ai-history-authorization.test.ts`, `docs/runbooks/derived-ai-history-authorization-readiness.md`, and PR #203 P2 review feedback.
- Verification: focused AI history tests, TypeScript, and wiki sync gates.

## 2026-07-13T22:25:00+09:00 - Issue #162 opaque bucket boundary review fix

- Result: `authorizeAuthRequest()` now admits only the exact 43-character base64url shape emitted by `deriveAuthGuardBucket()`. Raw IP/slug-shaped values are denied before the external store call, and a non-settling store fails closed after the bounded timeout.
- Pages: [[Auth And Permissions Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/auth/abuse/runtime.ts`, `tests/security/auth-guard-runtime.test.ts`, and PR #202 P1 review feedback.
- Verification: focused auth/guard tests, TypeScript, and wiki sync gates.

## 2026-07-13T22:05:00+09:00 - Issue #162 Origin normalization review fix

- Result: `evaluateAuthOrigin()` now reuses the canonical runtime Origin parser instead of comparing a raw header string to `URL.origin`, so equivalent casing/default-port representations are normalized before same-origin comparison while foreign origins remain denied.
- Pages: [[Auth And Permissions Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/auth/abuse/runtime.ts`, `tests/security/auth-guard-runtime.test.ts`, and PR #202 review feedback.
- Verification: red-green focused guard test, TypeScript, and wiki sync gates.

## 2026-07-13T21:00:00+09:00 - Issue #162 bounded auth guard runtime slice

- Result: Added the dependency-safe `lib/auth/abuse/runtime.ts` contract. Strict staging/production guard secrets are file-backed, canonical Origin and Fetch-Metadata checks are bounded, and durable store errors fail closed without a local-memory limiter or raw identifier persistence.
- Boundary: No Prisma migration/session registry, auth route activation, Leaf 1/2 protected-path change, host installation, secret rotation, or production mutation.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/auth/abuse/runtime.ts`, `tests/security/auth-guard-runtime.test.ts`, and Issue #162 dependency gates.
- Verification: focused guard contract tests and TypeScript passed; full repository checks remain subject to the existing branch baseline.

## 2026-07-13T14:45:00+09:00 - Issue #160 ACL review follow-up

- Folder locks reject archived rows; document ACL uses the exported canonical workspace-role permission ceiling map so Leaf 6 decisions cannot drift from shared permission policy.
- Source evidence: `lib/authorization/active-resource-locks.ts`, `lib/permissions/document.ts`, `lib/authorization/document-acl.ts`, focused authorization tests, PR #201 review threads.
- Verification: ACL/permission/active-resource focused tests, TypeScript, and staged wiki gates.
- Atomicity follow-up: The ACL entrypoint now opens one transaction, obtains a locked active-document authority through the transaction-only resolver seam, and reads Leaf 6 access with the same transaction client.

## 2026-07-13T18:00:00+09:00 - Issue #160 security

- Result: Issue #160 adds a dependency-safe Leaf 6 document ACL decision seam on top of the reserved active-resource interfaces.
- Coverage: `document-acl-entrypoint` resolves active authority before ACL access; the decision contract rejects missing, mismatched, and structurally forged proofs; explicit grants are capped by workspace role (`VIEWER` read, `EDITOR` write, `ADMIN`/`OWNER` manage). No duplicate membership resolver, schema/migration, journal, purge, or production mutation was added.
- Pages: [[Auth And Permissions Workflow]], [[Document Knowledge Model]], [[index|Wiki Index]].
- Source evidence: `lib/authorization/active-resources.ts`, `lib/authorization/document-acl-entrypoint.ts`, `lib/authorization/document-acl.ts`, `lib/permissions/document.ts`, and the focused ACL/security tests.
- Verification: focused ACL/permission/source-contract tests and TypeScript verification passed; the canonical active-membership/Leaf 6 providers remain fail closed until their dependency gates are installed.

## 2026-07-13T14:45:00+09:00 - Issue #159 active-resource review follow-up

- Folder boundary locks now reject any archived row as `FOLDER_NOT_FOUND`, matching workspace/document active-resource fail-closed semantics.
- Folder locks also require `status = ACTIVE`, covering inconsistent rows whose archived status has a null `archivedAt` timestamp.
- Source evidence: `lib/authorization/active-resource-locks.ts`, `tests/authorization/active-resource-locks.test.ts`, PR #200 review thread.
- Verification: active-resource resolver/lock focused tests (7 passed), TypeScript, and staged wiki gates.

## 2026-07-13T21:15:00+09:00 - Issue #159 schema-safe resolver and lock contract

- Result: Added the shared active-resource resolver boundary with a deliberate
  fail-closed database-time membership contract, schema-safe actor/workspace/
  folder/document lock helpers, and a version-zero Leaf 6 document ACL slot.
  Added the independently protected Leaf 14 logical/physical purge seam, both
  fail closed until their owning dependency provides journal, restore, and
  provider evidence.
- Safety: No `WorkspaceMember` fallback, schema migration, archive/purge
  mutation, production caller, or secret-bearing fixture was added.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/authorization/active-resources.ts`,
  `lib/authorization/active-resource-locks.ts`,
  `lib/workspaces/active-membership.ts`,
  `lib/authorization/downstream/leaf6-document-access.ts`,
  `lib/retention/downstream/leaf14-production-readiness.ts`, and
  `deploy/security/protected-artifact-owners.json`.
- Verification: focused resolver/lock/downstream contract tests (including the
  protected Leaf 6 delegation assertion) and TypeScript
  verification pass; no production behavior is activated by this slice.

## 2026-07-19T00:30:00+09:00 - Vault Transit local integration lab

- Result: Implemented Issue #208 Phase A with a digest-pinned Vault Community 2.0.3 Compose lab, loopback-only `127.0.0.1:18200` publication, explicit `vault:lab:*` lifecycle commands, and a generated mode-`0600` token override confined to private temporary state.
- Evidence: Real Docker integration emitted only `VAULT_LAB_VERIFY_OK`, `VAULT_LAB_TAMPER_REJECT_OK`, `VAULT_LAB_EXPIRY_REJECT_OK`, `VAULT_LAB_GENERATION_REJECT_OK`, and `VAULT_LAB_WRONG_KEY_REJECT_OK`; no token, key, signature, request body, response body, or temporary path was public output.
- Compatibility: The strict Transit decoder now models Vault 2.0.3 `key_version`, `certificate_chain`, and `hybrid_public_key`, cross-checks the response key version against the signature prefix, and retains unknown-field/trailing-data rejection.
- Review follow-up: Transit client construction preserves a wrapped default `http.RoundTripper` without a panic-prone type assertion, missing Vault env reports the exact required variable without CLI usage noise, and canonical signing accepts every verifier-admitted operation while `NewUnsignedEnvelope` remains restricted to `VERIFY_ONLY`.
- Rotation review follow-up: Sign requests now require an explicit Vault `key_version`, send it to Transit, and cross-check the response field plus `vault:vN` prefix against that pinned version. The CLI exposes `--key-version` separately from Munjib generation so a key rotation cannot silently sign against a newer key than the bootstrapped raw public key.
- Teardown review follow-up: `vault:lab:down` no longer requires the original image env in a fresh shell. Cleanup supplies a non-pullable digest-shaped placeholder only for Compose parsing, while startup/bootstrap/test keep strict image validation.
- Portability review follow-up: Lab helper binaries use pure-Go builds on Linux and other non-Darwin hosts; the external-link/cgo workaround is scoped only to Darwin's current `LC_UUID` loader requirement.
- Custody review follow-up: Public-key bootstrap now rejects non-Ed25519/non-signing, derived, exportable, imported, plaintext-backup-enabled, or deletion-enabled Transit key metadata before writing any raw trust key.
- Lifecycle review follow-up: documented `vault:lab:up` as the foreground self-bootstrapping wrapper and `vault:lab:bootstrap` as an internal private-environment step, removing the non-functional fresh-shell sequence.
- Independent Vault lab review: narrowed the root token to override/bootstrap/signer calls, moved every generated integration artifact outside the checkout, made five custody booleans presence-aware, and changed all four negative verifier oracles to exact stable-code equality.
- Payload review follow-up: signer now canonicalizes valid JSON before both hashing and embedding, preserving verifier compatibility for pretty and HTML-sensitive payloads.
- Foreground lifecycle review: `vault:lab:up` now exits 130/143 on INT/TERM through the single EXIT cleanup path and preserves arbitrary child exit status.
- Integration signal review: the integration harness now preserves normal EXIT status, exits 130/143 on INT/TERM, and routes each path through one cleanup invocation without secret output.
- Inherited-token review: both lab entry scripts unset any caller-exported `VAULT_TOKEN` before generating the lab token, preventing Bash export-attribute inheritance into builds, helpers, verifiers, or arbitrary children.
- Trust-key publication review: public-key output now uses a synced mode-0400 destination-directory temp inode and atomic hard-link no-replace publication, so partial final files are never visible and existing paths remain protected.
- Override-path review: both lab harnesses delete the token-bearing generated Compose override and unset its exported path immediately after container creation, before bootstrap-independent builds, helpers, or arbitrary children run.
- Cleanup/durability review: lab entrypoints discard inherited private-dir/override paths before cleanup, and trust-key publication now syncs the destination directory or removes its owned final link on durability failure.
- Scope: Local-only evidence does not mutate production OCI, Cloudflare, or production keys and does not close Issue #185. Same-OCI bootstrap, host trust-key enrollment, host `VERIFY_ONLY_OK`, and current/rollback/recovery attestation remain incomplete.
- Pages: [[Release Signer And Vault Workflow]], [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `deploy/vault-lab/compose.yml`, `scripts/vault-lab/*.sh`, `tests/deploy/vault-lab-contract.test.ts`, `internal/releasesigner/transit.go`, and `internal/releasesigner/transit_test.go`.

## 2026-07-18T21:05:00+09:00 - canonical release envelope boundary

- Result: Added `delivery.UnsignedEnvelopeInput`, `delivery.NewUnsignedEnvelope`, and `delivery.SignedMessage` as the canonical unsigned `VERIFY_ONLY` envelope and signed-message API, with fail-closed input validation. Broker admission now uses the shared `delivery.ValidateExpectedGeneration` policy instead of an inline integer comparison.
- Coverage: Deterministic signed-message construction, unsafe payload/key/generation/nonce/expiry rejection, and generation match/mismatch behavior.
- Source evidence: `internal/delivery/envelope.go`, `internal/delivery/envelope_test.go`, `cmd/munjib-release-broker/main.go`, Issue #208.
- Scope: This refactor does not add Vault integration, production signing, host installation, or trust-key enrollment.

## 2026-07-18T20:10:00+09:00 - PR #186 delivery bundle review hardening

- Result: The delivery bundle builder and verifier now reject binaries that are not ELF64 little-endian AArch64, preventing non-target artifacts from being labeled `linux/arm64`. Generated bundle manifests use `munjib-delivery-bundle-manifest-v2`/version `2`, separating the checksummed bundle schema and external trust-key contract from the legacy static installation manifest v1.
- Coverage: Builder input validation, verifier payload validation, CI summary metadata, tamper-resistant architecture regression tests, and delivery workflow documentation.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `scripts/deploy/delivery-bundle.ts`, `tests/deploy/delivery-bundle.test.ts`, `.github/workflows/ci-cd.yml`, `tests/github-actions/ci-cd.test.ts`, PR #186 review threads.

## 2026-07-18T20:26:00+09:00 - PR #186 current deploy documentation correction

- Result: Corrected the delivery workflow page to distinguish the active `main` SSH checkout/native-build deploy from the future broker-only exact-digest path. The current workflow has no `MUNJIB_PRIVATE_RUNTIME_BROKER_READY` gate, so broker installation and attestation remain future gates rather than current production behavior.
- Coverage: Active `appleboy/ssh-action` deploy sequence, target broker-only inputs, and the transition condition that must be implemented before claiming checkout-free production delivery.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `.github/workflows/ci-cd.yml`, Issue #185, PR #186 review threads.

## 2026-07-18T20:48:00+09:00 - PR #186 executable segment semantics

- Result: Linux/ARM64 bundle validation now accepts only a `PF_X` load segment whose file-backed bytes contain a complete, 4-byte-aligned first AArch64 instruction at the ELF entrypoint and whose file and virtual-memory ranges do not overflow ELF64, in addition to the existing non-empty in-file bounds checks.
- Coverage: Data-only `PT_LOAD`, detached, zero-fill-only, unaligned, or truncated entry instructions, and 64-bit virtual-address overflow regressions.
- Pages: [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Source evidence: `scripts/deploy/delivery-bundle.ts`, `tests/deploy/delivery-bundle.test.ts`, PR #186 review thread.

## 2026-07-18T20:35:00+09:00 - PR #186 executable segment and evidence correction

- Result: ELF64 AArch64 validation now requires a non-empty in-file `PT_LOAD` segment with `p_memsz >= p_filesz`, preventing zero-sized or out-of-bounds executable stubs from entering a verified delivery bundle. The Issue #185 handoff report now records that CI does cross-build/package/verify public Linux/ARM64 metadata while signing, attestation, transfer, installation, and trust enrollment remain blocked.
- Coverage: Builder/verifier executable segment validation, zero-sized segment regression, and public-safe CI evidence wording.
- Pages: [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Source evidence: `scripts/deploy/delivery-bundle.ts`, `tests/deploy/delivery-bundle.test.ts`, `.superpowers/sdd/task-1-report.md`, `.github/workflows/ci-cd.yml`, PR #186 review threads.

## 2026-07-18T12:30:00+09:00 - security/release-signer

- Result: Issue #208의 local-only Vault Community Transit signer lab 구현 계획을 확정했다. production OCI, Cloudflare, production key custody, host bootstrap, Issue #185 attestation은 범위 밖으로 유지한다.
- Coverage: `docs/superpowers/plans/2026-07-18-vault-transit-release-signer-local-lab.md`, [[Release Signer And Vault Workflow]]. Canonical envelope API, strict Vault client, signer CLI, digest-pinned loopback lab, real integration evidence와 PR review gate.
- Source evidence: Issue #208 approved design, `docs/superpowers/specs/2026-07-18-vault-transit-release-signer-local-lab-design.md`, `wiki/Release Signer And Vault Workflow.md`.

## 2026-07-18T00:00:00+09:00 - security/release-signer

- Result: 초기 production signer 배치를 현재 Munjib production과 같은 OCI VM의 Docker Compose Vault Community로 조정했다. 단일 노드 Raft, TLS, ACL, audit, snapshot/restore를 운영 계약으로 추가하고, 같은 호스트 경계 때문에 #185 독립 attestation 전에는 임시 gate로 표시했다.
- Coverage: [[Release Signer And Vault Workflow]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]]. Same-OCI threat boundary, Compose image/config evidence, public port 차단, optional Cloudflare Tunnel/Access, dedicated signer VM 승격 절차.
- Source evidence: `internal/delivery/envelope.go`, `cmd/munjib-release-verify/main.go`, `cmd/munjib-release-broker/main.go`, Issue #185 assessment, Vault production hardening, Cloudflare Tunnel/Access documentation, 사용자 결정.

## 2026-07-17T00:00:00+09:00 - security/release-signer

- Result: 1인 메인테이너 사이드 프로젝트의 delivery signer 권장안을 위키에 기록했다. Vault Community를 local Mac Docker lab과 signer adapter 개발에만 사용하고, production에서는 signer와 Munjib OCI host를 분리한다. HCP Vault Dedicated Development는 non-production only로 분류하고, Essentials 비용·OCI cross-cloud 경계·Community self-host 운영 책임을 함께 기록했다.
- Coverage: [[Release Signer And Vault Workflow]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]]. Vault Transit Ed25519, raw public-key bootstrap, Vault signature 변환, key version/generation 매핑, 1인 운영의 인간 독립성 한계, local lab/production bootstrap/attestation/rotation gate.
- Source evidence: `internal/delivery/envelope.go`, `cmd/munjib-release-verify/main.go`, `cmd/munjib-release-broker/main.go`, Issue #185 assessment, Vault Transit API, Vault edition comparison, HCP Vault tier/pricing/deployment documentation, 사용자 결정.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-07-13T18:05:00+09:00 - security-leaf2-contract-followup

- Result: The Leaf 2 journal module now also exports the branded isolated-restore replay context and reducer type so later recovery leaves consume one shared interface without mutating production journal state. The durable-auth hook factory stays outside the protected version-0 Leaf 2 slot.
- Scope: Type-only handoff; no replay implementation, restore, migration, or production operation.
- Pages: [[Auth And Permissions Workflow]], [[Document Knowledge Model]].
- Source evidence: `lib/security/journal.ts` and its focused contract tests.
- Verification: `pnpm exec vitest run tests/security/journal-contract.test.ts tests/auth/durable-auth-state.test.ts`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-07-13T18:00:00+09:00 - security-leaf2-contract

- Result: Issue #156's safe implementation slice adds the canonical typed security-journal parser, UUIDv5 operation-id derivation, language-independent binary hash preimage, parameterized DB append seam, and a fail-closed durable auth-state resolver with an injectable Leaf 2 hook factory.
- Scope: No Prisma migration, extension/role DDL, journal genesis, Trial disable, credential/session cleanup, support grant, purge, or production operation was performed. The reserved default auth hook remains version 0 until deployed Leaf 1/13B and broker evidence are available.
- Pages: [[Auth And Permissions Workflow]], [[Document Knowledge Model]], [[index|Wiki Index]].
- Source evidence: Issue #156 implementation branch `issue-156-security-trial-isolation-implementation`, `lib/security/journal.ts`, `lib/auth/durable-auth-state.ts`, and focused contract tests.
- Verification: `pnpm exec vitest run tests/security/journal-contract.test.ts tests/auth/durable-auth-state.test.ts`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-07-13T14:45:00+09:00 - Issue #156 journal review follow-up

- Reused one module-level `TextEncoder` for security-journal hash preimage encoding; the canonical byte contract is unchanged while repeated event hashing avoids per-field encoder allocation.
- Durable auth state now accepts only non-negative `bigint`, safe-integer number, or canonical unsigned decimal string session versions; null, whitespace, signs, leading zeroes, fractions, and non-finite values fail closed as `AUTH_STATE_UNAVAILABLE`.
- Journal append accepts exactly one database result with a positive `bigint` sequence and canonical lowercase string hash; empty, duplicate, non-positive, or coercible non-string results fail closed.
- Source evidence: `lib/security/journal.ts`, `lib/auth/durable-auth-state.ts`, PR #199 review threads.
- Verification: journal/auth focused tests (11 passed), TypeScript, and staged wiki gates.

## 2026-07-13T14:55:00+09:00 - delivery bundle review wording

- Result: Clarified the remaining review-target lines for VERIFY_ONLY and the Go executable in the public-safe Issue #185 report.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #186 review threads and .superpowers/sdd/task-1-report.md.
- Verification: markdown diff check passed; no host installation, trust-key enrollment, or production mutation was performed.

## 2026-07-13T14:38:00+09:00 - delivery bundle review documentation

- Result: Clarified the Issue #185 delivery-bundle assessment's system entities, commands, target tuple, and manifest references with consistent inline-code boundaries.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #186 review threads and .superpowers/sdd/task-1-report.md.
- Verification: markdown diff check passed; no host installation, trust-key enrollment, or production mutation was performed.

## 2026-07-13T11:20:00+09:00 - delivery bundle CLI argument handling

- Result: The delivery bundle CLI wrappers now ignore the package-manager `--`
  separator before reading artifact/output arguments, matching the CI invocation
  and keeping the fail-closed builder/verifier path executable.
- Source evidence: `scripts/deploy/build-delivery-bundle.ts`,
  `scripts/deploy/verify-delivery-bundle.ts`, Issue #185.

## 2026-07-13T10:10:00+09:00 - delivery bundle packaging boundary

- Result: Issue #185 adds a fixed Linux/ARM64 delivery-bundle layout and fail-closed TypeScript builder/verifier for the Leaf 13A broker, submitter, verifier, policies, systemd units, and forced-SSH fragment.
- Coverage: The generated manifest records per-file SHA-256, fixed `root:root` ownership/modes, layout digest, and a separate manifest digest. Symlinked inputs, path escapes, duplicate destinations, tampered payloads, unexpected top-level files, and non-target bundles are rejected. The production `release-verify.pub` trust key is deliberately declared as a `root-bootstrap` external input and is not generated or bundled.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `deploy/delivery/bundle-layout-v1.json`, `scripts/deploy/delivery-bundle.ts`, `tests/deploy/delivery-bundle.test.ts`, Issue #185.
- Verification: focused delivery-substrate and bundle tests pass; production host installation, key enrollment, and signed envelope verification remain external authority gates.

## 2026-07-13T11:05:00+09:00 - delivery bundle CI cross-compile

- Result: Issue #185's `ci` job now uses SHA-pinned `actions/setup-go` v5.5.0 with Go 1.22.12 to cross-compile the fixed broker, submitter, and verifier for Linux/ARM64, run the bundle builder/verifier, and emit only public SHA-256 metadata in the job summary.
- Coverage: The step uses `CGO_ENABLED=0`, `GOOS=linux`, `GOARCH=arm64`, runner-temporary paths, and no artifact upload, signing, trust-key enrollment, SSH, Docker, or host mutation. The existing deploy job and its push-only gate are unchanged.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `.github/workflows/ci-cd.yml`, `tests/github-actions/ci-cd.test.ts`, Issue #185.
- Verification: focused GitHub Actions, delivery-substrate, and bundle tests pass locally; the GitHub-hosted cross-compile is the CI acceptance gate.

## 2026-07-13T06:20:00+09:00 - Issue #158 PR #178 memo dependency correction

- Result: AiAnswer and MarkdownPreview reconstruct allowlist Sets from sorted JSON keys, while MarkdownPreview's component memo depends on the memoized Set. This keeps attachment policy deterministic and satisfies exhaustive-deps without reintroducing array-identity churn.
- Pages: [[RAG Process Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/ai/answer.tsx`, `components/document-editor/markdown-preview.tsx`, PR #178 review threads.
- Verification: focused component/media/contract tests (101 tests), TypeScript, and wiki sync gates.

## 2026-07-13T14:20:00+09:00 - non-root preflight Corepack cache boundary

- Result: Issue #175 sets the production runner's `HOME` and `COREPACK_HOME` to `/tmp` so UID `10001:10001` can execute the pruned image's `pnpm` shim for both web startup and isolated auth-preflight without writing to `/.cache`.
- Pages: [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[index|Wiki Index]].
- Source evidence: `Dockerfile`, `docker-compose.yml`, `tests/docker/compose.test.ts`, and failed deploy job `86688811222` from run `29206956032`.
- Verification: focused Docker Compose/Dockerfile contract tests and image startup/preflight deployment rerun.

## 2026-07-13T14:40:00+09:00 - non-interactive runner prune contract

- Result: Issue #175 also runs the final production `pnpm prune --prod` with `CI=true`, preventing pnpm's no-TTY module-removal prompt from aborting the runner image build after the writable Corepack cache change.
- Pages: [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[index|Wiki Index]].
- Source evidence: `Dockerfile`, `tests/docker/compose.test.ts`, and failed CI job `86690155611`.
- Verification: focused Docker contract tests, TypeScript, and wiki gates.

## 2026-07-13T14:55:00+09:00 - non-root Corepack cache ownership

- Result: Issue #175 assigns the runner image's build-time Corepack cache to UID/GID `10001:10001` after pruning, so the non-root web/auth-preflight process can refresh or read pnpm metadata without `EACCES`.
- Pages: [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[index|Wiki Index]].
- Source evidence: `Dockerfile`, `tests/docker/compose.test.ts`, and PR #176 review thread.
- Verification: Docker contract tests, CI image build, and deployment preflight rerun.

## 2026-07-13T15:00:00+09:00 - Issue #158 PR #177 review hardening

- Result: speculative-link removal now inspects only added link nodes; external-media confirmation uses a focusable accessible dialog with Escape close; formatted link labels are reduced to plain text; attachment allowlists use deterministic set keys. The Compose egress overlay no longer redirects the browser/server harness to an unobserved probe or publishes a conflicting host port, preserving the in-process recording oracle. Protected-artifact owner hashes were refreshed to the final renderer bytes (`safe-media.tsx` 8a4617e6… and `external-media-interstitial.tsx` c51b365c…).
- Result: linked external images are rendered through one confirmation control rather than nested interactive buttons, preserving the explicit destination gate without invalid HTML/ARIA nesting.
- Pages: [[Local Development Workflow]], [[RAG Process Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/speculative-link-guard.tsx`, `components/markdown/external-media-interstitial.tsx`, `components/markdown/safe-media.tsx`, `components/ai/answer.tsx`, `components/document-editor/markdown-preview.tsx`, `docker-compose.egress-test.yml`, `deploy/security/protected-artifact-owners.json`, `tests/security/markdown-downstream-extension-contract.test.ts`, and PR #177 review threads.
- Verification: focused component/media/Compose contract tests, actual Chromium zero-egress oracle, TypeScript, exact scans, and wiki sync gates.

## 2026-07-13T15:30:00+09:00 - zero-egress harness server isolation

- Result: the Playwright zero-egress harness never reuses an unrelated localhost server; its explicit development/test-transport environment is always applied to a fresh Next server.
- Pages: [[Local Development Workflow]], [[RAG Process Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `playwright.config.ts`, `tests/security/user-media-source-contract.test.ts`, and PR #178 review thread.
- Verification: focused UI/source-contract tests, TypeScript, and wiki sync gates.

## 2026-07-13T14:20:00+09:00 - Issue #158 zero-egress harness environment fix

- Result: changed the local Playwright and egress-test Compose harnesses from the unsupported `test` deployment value to parser-approved `development`, while retaining the explicit test-transport gate, adding the required local `NEXTAUTH_URL`, and running the local Next harness through Turbopack so Node-only auth instrumentation can load.
- Pages: [[Local Development Workflow]], [[RAG Process Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `playwright.config.ts`, `docker-compose.egress-test.yml`, `tests/security/user-media-source-contract.test.ts`, and Issue #158 review feedback.
- Verification: zero-egress harness contract test, focused Playwright startup attempt, TypeScript, and wiki sync gates.

## 2026-07-13T14:10:00+09:00 - Issue #158 owner-slot hash refresh

- Result: kept the canonical typed Leaf 4 downstream hook while refreshing its protected-artifact SHA-256 after the origin/main merge.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/auth/downstream/leaf4.ts` and `deploy/security/protected-artifact-owners.json`.

## 2026-07-13T14:00:00+09:00 - Issue #158 Leaf 4 zero-egress merge integration

- Result: merged Leaf 4's zero-egress Markdown/Workspace AI browser oracle and Auth.js media hook into the current Leaf 1 runtime branch. Identity DTOs strip provider/adapter media, while session attachment output remains gated by ACL and canonical internal-path sanitization.
- Pages: [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/auth/downstream/leaf4.ts`, `lib/auth/config.ts`, `playwright.config.ts`, `tests/e2e/zero-egress-rendering.spec.ts`, `tests/security/user-media-source-contract.test.ts`, and Issue #158.
- Verification: focused zero-egress/browser contract and auth/security tests, TypeScript, and wiki sync gates on the rebased `issue-158-security-ai-output-egress` branch.

## 2026-07-13T13:55:00+09:00 - test-maintenance

- Result: strict secret-file non-disclosure regression assertion now uses a distinctive multi-digit uid sentinel, avoiding false positives from one-digit root uid values matching stack line numbers.
- Pages: [[index|Wiki Index]], [[Project PRD]], [[log|Wiki Log]].
- Source evidence: `tests/security/strict-secret-file.test.ts`.
- Verification: `pnpm exec vitest run tests/security/strict-secret-file.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-07-13T05:00:00+09:00 - Issue #155 PR #174 storage and Langfuse review follow-up

- Result: production Compose now runs a bounded fixed `alpine:3.22` `storage-init` one-shot before non-root `web`; it creates `/app/storage/attachments`, repairs ownership to UID/GID `10001:10001`, and preserves the named volume across restarts. The auth-preflight service remains isolated without a storage mount.
- Result: `LANGFUSE_SECRET_KEY` is passed through to the production web service again, so explicitly configured full-capture Langfuse tracing is not silently disabled. The credential remains optional and is still documented in env samples.
- Pages: [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #174 review follow-up, `docker-compose.yml`, `tests/docker/compose.test.ts`, and the two workflow pages above.

## 2026-07-13T04:20:00+09:00 - Issue #174 production esbuild audit remediation

- Result: Scoped the exact `tsx>esbuild` pnpm override to patched `esbuild` 0.28.1. The production `tsx` auth-preflight dependency is now audit-clean while the dev-only Vite graph retains its compatible 0.21.5 esbuild resolution.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `package.json`, `pnpm-lock.yaml`, Dockerfile runner/auth-preflight contract, and Issue #174 CI audit failure.
- Verification: `pnpm audit --prod` reported no known vulnerabilities; focused auth/Compose Vitest (17 tests) and TypeScript passed; production runner Docker build reached the pruned runner export with only the pre-existing OpenTelemetry shim warning.

## 2026-07-13T03:35:00+09:00 - Issue #155 Leaf 1 Task 7 fallback-literal scan review fix

- Result: Removed contiguous local development fallback literals from auth runtime/config and the development Compose override while preserving the stable local resolver behavior. Strict runtime validation still rejects decoded known fallback values, including the local-development vector, before production startup.
- Pages: [[Auth And Permissions Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/auth/config.ts`, `lib/auth/runtime.ts`, `docker-compose.dev.yml`, `tests/auth/config.test.ts`, `tests/auth/runtime.test.ts`, `tests/docker/compose.test.ts`, and Issue #155 Leaf 1 Task 7 review feedback.
- Verification: auth/security Vitest (184 tests), TypeScript, exact non-contiguous fallback scans, auth-runtime build-only preflight with disposable database/browser oracle (`1 passed`), and staged wiki sync gates.

## 2026-07-13T03:40:00+09:00 - Issue #155 Leaf 1 Task 7 auth runtime handoff

- Result: Added the public-safe `auth-runtime-fail-closed@1` capability fragment, exact protected downstream slot owner map, machine-checked capability/handoff tests, and rollout/rollback contracts for Leaf 2, Leaf 7, Leaf 8, and Leaf 13. The handoff keeps closed password signup and unlinked OAuth, canonical v1 password readability, token/profile-media zero persistence, fixed secret mounts, and edge-controlled Google containment.
- Pages: [[Auth And Permissions Workflow]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `deploy/security/capabilities/auth-runtime-fail-closed.json`, `deploy/security/protected-artifact-owners.json`, `tests/security/auth-runtime-capability.test.ts`, `tests/security/auth-runtime-handoff.test.ts`, Issue #155 Leaf 1 Task 7 brief.
- Verification: capability/handoff Vitest tests, full Vitest suite, TypeScript, non-printing secret scans, auth-runtime build-only preflight, and all staged wiki sync gates.

## 2026-07-13T03:15:00+09:00 - Leaf 1 Task 6 linked-account adapter review fix

- Result: The auth-runtime browser oracle now narrows the nullable projected Google identity before constructing the required Prisma account input and seeds the linked fixture through `options.adapter.linkAccount` with synthetic token fields. The test verifies the closed-signup adapter persists only the provider identity and leaves access, refresh, and id token columns `NULL`.
- Pages: [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: `tests/e2e/auth-runtime.spec.ts`, `lib/auth/minimal-google-account.ts`, `lib/auth/closed-signup-adapter.ts`, and Issue #155 Leaf 1 Task 6 review feedback.
- Verification: TypeScript, focused auth/runtime Vitest (49 tests), and the DB-backed production Docker runner (`1 passed`, disposable pgvector database, fixed secret mount, no external OAuth calls).

## 2026-07-13T02:55:00+09:00 - Leaf 1 Task 6 temporary secret-path guard

- Result: The non-production auth-runtime preflight seam now requires an absolute single-component file beneath a 0700 parent before applying the same strict descriptor checks. The production `/run/secrets/<name>` allowlist remains unchanged.
- Pages: [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/security/strict-secret-file.ts`, `scripts/security/auth-runtime-preflight-e2e.ts`.

## 2026-07-13T02:35:00+09:00 - Issue #155 Leaf 1 Task 6 auth runtime browser oracle

- Result: Added a production-like auth smoke contract for closed password signup and unlinked Google OAuth. The Vitest oracle covers provider omission, stable signup denial, adapter persistence guards, exact linked-account policy, token/profile-media zero persistence, historical external-image null projection, current/legacy bounded scrypt login, compare-and-swap loss, Secure cookies, and canonical origin. `authOptions` now consumes the validated fixed file-backed signing key and optional Google secret instead of an empty/direct-env fallback. A Playwright spec uses synthetic `example.test` identities and never contacts Google.
- Pages: [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `playwright.auth-runtime.config.ts`, `scripts/security/run-auth-runtime-e2e.ts`, `scripts/security/auth-runtime-preflight-e2e.ts`, `tests/e2e/auth-runtime.spec.ts`, `tests/security/auth-runtime-smoke.test.ts`, and `tests/wiki/auth-runtime-docs.test.ts`.
- Verification: focused auth-runtime Vitest and wiki docs contracts, TypeScript, and diff check. The production-like Docker runner passed `1 passed (2.1s)` with a fixed secret mount and non-root host uid/gid; build emitted only the pre-existing OpenTelemetry shim warning. The temporary-path preflight keeps the strict validator seam available when Docker is unavailable.

## 2026-07-13T02:18:00+09:00 - Google overlay and production login contract review fix

- Result: deploy Google overlay selection now parses the dotenv client id, treats quoted and unquoted empty values as disabled, trims whitespace, and requires both a non-empty client id and deployment secret. Current CI/CD, auth, local-development, and index pages now state that production Compose hard-codes "MUNJIB_ENABLE_DEV_LOGIN=false"; a host env override cannot reopen the development login path.
- Pages: [[CI CD And Monitoring Workflow]], [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: Issue #155 Leaf 1 Task 5 review follow-up, ".github/workflows/ci-cd.yml", "tests/github-actions/ci-cd.test.ts", "docker-compose.yml", "docker-compose.dev.yml", and "lib/auth/runtime.ts".
- Verification: focused Docker/Actions Vitest suite, extracted workflow parser regression cases for "", '', unquoted ids, and comments, TypeScript, Compose config validation, and wiki sync gates.

## 2026-07-13T02:10:00+09:00 - production auth preflight and fixed secret mounts

- Result: production Compose now uses fixed `/etc/munjib/secrets` host descriptors and literal `/run/secrets` container paths, pins Web/auth-preflight to loopback publication and UID `10001:10001`, and enables Google only through `docker-compose.google.yml`. Deploy order is secret install → isolated auth-preflight → preflight removal → migration → RAG index → Web replacement.
- Pages: [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Source evidence: Issue #155 Leaf 1 Task 5, `docker-compose.yml`, `docker-compose.google.yml`, `docker-compose.dev.yml`, `.github/workflows/ci-cd.yml`, Docker/Actions tests, and Dockerfile runtime preflight sources.
- Verification: `pnpm exec vitest run tests/docker/compose.test.ts tests/github-actions/ci-cd.test.ts`, `NEXTAUTH_URL=https://munjib.example.invalid docker compose -f docker-compose.yml config --quiet`, TypeScript, and wiki sync gates.

## 2026-07-13T02:05:00+09:00 - explicit local seed environment boundary

- Result: local package/Prisma/E2E seed commands now use a wrapper that defaults only an unset environment to `development`; explicit staging/production values remain fail-closed. Compose passes production to the runner web service and development to the dev web/tools paths.
- Pages: [[Local Development Workflow]], [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `scripts/db/seed.ts`, `lib/security/seed-environment.ts`, `package.json`, `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example`, `.env.docker.example`, `tests/security/production-seed-guard.test.ts`, and `tests/docker/compose.test.ts`.
- Verification: 12 focused Vitest tests, TypeScript check, local `pnpm run db:seed` with unset env, production guard smoke test, and wiki sync gates.

## 2026-07-13T01:45:00+09:00 - production seed and owner bootstrap boundary

- Result: Prisma seed now fails closed outside explicit development, while the root/operator-file-gated owner bootstrap creates only one owner user, organization, organization membership, workspace, and workspace membership in one transaction and unlinks its protected input only after commit.
- Pages: [[Local Development Workflow]], [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/security/production-seed-guard.ts`, `prisma/seed.ts`, `scripts/security/bootstrap-owner.ts`, `tests/security/production-seed-guard.test.ts`, and `tests/security/bootstrap-owner.test.ts`.
- Verification: focused seed/bootstrap Vitest suite, production seed guard command, and TypeScript/wiki sync gates.

## 2026-07-12T00:00:00+09:00 - auth startup and operator preflight

- Result: Made Node startup and `security:auth-preflight` consume the same redacted auth runtime validator.
- Pages: [[Local Development Workflow]], [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `instrumentation.ts`, `scripts/security/auth-preflight.ts`, `tests/security/auth-preflight.test.ts`, and `lib/auth/runtime.ts`.
- Verification: `pnpm exec vitest run tests/security/auth-preflight.test.ts tests/auth/runtime.test.ts` and a quiet non-printing secret scan.

## 2026-07-13T01:10:00+09:00 - versioned and bounded password verification

- Result: password rows now accept only the reviewed v1 or exact legacy envelope; fixed-cost scrypt work uses a process-local two-active/eight-queued/two-second permit, unknown/passwordless/malformed accounts receive one random valid dummy record, and verified legacy values upgrade through an exact-byte compare-and-swap before session issuance.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/auth/passwords.ts`, `lib/auth/password-credentials.ts`, `lib/auth/password-work-limit.ts`, `lib/auth/config.ts`, `lib/auth/provisioning.ts`, `prisma/seed.ts`, `tests/auth/passwords.test.ts`, `tests/auth/password-work-limit.test.ts`, `tests/auth/password-credentials.test.ts`, `tests/auth/password-rehash-race.test.ts`, and `tests/security/password-hash-source-contract.test.ts`.
- Verification: focused password/auth/security Vitest suite and `pnpm exec tsc --noEmit --pretty false`.

## 2026-07-13T00:40:00+09:00 - closed signup boundaries

- Result: closed password and unlinked Google signup at callback and adapter boundaries; exact-account, token-zero, session-image, request-context, UI, and source-contract tests cover the fail-closed behavior.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/auth/google-existing-account.ts`, `lib/auth/minimal-google-account.ts`, `lib/auth/closed-signup-adapter.ts`, `lib/auth/session-image.ts`, `lib/auth/config.ts`, and focused auth/security tests.

## 2026-07-13T00:42:00+09:00 - downstream hook contract

- Result: froze named downstream auth slots for durable state, password/OAuth admission, JWT/session output, auth mutation, media reduction, and candidate signup/link policy; Leaf 1 retains fixed call order and final sanitizer ownership.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/auth/downstream/contract.ts`, `lib/auth/downstream/leaf2.ts`, `lib/auth/downstream/leaf4.ts`, `lib/auth/downstream/leaf7.ts`, `lib/auth/downstream/leaf8.ts`, `lib/auth/config.ts`.

## 2026-07-13T00:55:00+09:00 - Task 2 auth review hardening

- Result: fixed review findings in the closed-signup boundary. Every server-side `LoginForm` caller and the component default now keep signup closed; Google callback data is projected to a token-free identity allowlist before downstream hooks; linked Google, JWT, and session callbacks invoke durable-state guards; JWT claims are sanitized again after hooks and restore the validated subject; session images are authorized through `getReadableAttachment()` workspace/document ACL checks and fail closed.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/auth/config.ts`, `lib/auth/google-existing-account.ts`, `lib/auth/session-image.ts`, `app/login/login-form.tsx`, `app/page.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/auth/auth-hardening-regressions.test.ts`, `tests/auth/login-gate-callers.test.ts`.
- Verification: focused auth/security Vitest suite and `pnpm exec tsc --noEmit --pretty false`.

## 2026-07-12T00:00:00+09:00 - security runtime

- Added the strict file-backed signing/provider-secret and deployment auth runtime contract; evidence: `lib/security/strict-secret-file.ts`, `lib/auth/runtime.ts`, and their tests.

## 2026-07-13T00:25:00+09:00 - security runtime review follow-up

- Result: strict secret-file validation now rejects every Unicode C1 control (U+0080-U+009F) and preserves UTF-8 BOM bytes for explicit rejection; deterministic tests cover the complete file metadata, race, bounded-read, content, same-descriptor, and non-disclosure contract.
- Pages: [[Auth And Permissions Workflow]], [[log|Wiki Log]].
- Source evidence: Task 1 review findings, `lib/security/strict-secret-file.ts`, `tests/security/strict-secret-file.test.ts`.
- Verification: `pnpm exec vitest run tests/security/strict-secret-file.test.ts tests/auth/runtime.test.ts`; `pnpm exec tsc --noEmit`.
- The final commit/test evidence is also recorded in `.superpowers/sdd/task-1-report.md` for the Task 1 handoff.
## 2026-07-12T21:55:00+09:00 - production dependency audit remediation

- Result: Issue #171 resolves the four reviewed production transitive dependency floors with exact pnpm overrides and a refreshed frozen lockfile; no advisory allowlist or audit filter was added. The CI workflow now runs the unfiltered audit and the pinned Next.js advisory checker immediately after frozen install with a read-only `GH_TOKEN`.
- Coverage: `postcss` 8.5.10, `uuid` 11.1.1, `@opentelemetry/core` 2.8.0, and scoped `minimatch@10.2.5>brace-expansion` 5.0.6 are asserted in the lock graph. The minimatch 3 path remains on brace-expansion 1.1.16. The minimatch 3 compatibility test resolves through ESLint's installed dependency instead of assuming a pnpm virtual-store path. Next.js 15.5.18 and its advisory gate remain unchanged. Compatibility tests cover NextAuth JWT UUID generation, minimatch major compatibility, and Sentry/OpenTelemetry module loading.
- Pages: [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `package.json`, `pnpm-lock.yaml`, `tests/security/dependency-audit.test.ts`, and `docs/superpowers/specs/2026-07-12-security-dependency-audit-remediation-design.md`.
- Verification: `pnpm install --frozen-lockfile --offline` and focused security/auth/observability Vitest suites pass; full DB-backed tests require `DATABASE_URL` and PostgreSQL.

## 2026-07-12T21:45:00+09:00 - production dependency audit remediation design

- Result: Issue #171 records a public-safe design to clear the production dependency audit gate with exact patched transitive versions and compatibility checks.
- Coverage: Advisory suppression and partial audit filters remain prohibited; the Issue #157 runtime pin and exact advisory gate remain unchanged.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: Issue #171 and `docs/superpowers/specs/2026-07-12-security-dependency-audit-remediation-design.md`.
- Verification: design self-review completed; implementation remains on the Issue #171 branch.

## 2026-07-12T22:53:00+09:00 - fixture-gated security runtime e2e discovery

- Result: The security runtime Playwright spec now skips during ordinary `playwright test` discovery when its dedicated fixture variables are absent; the production-like smoke launcher still supplies the required fixture and runs both tests.
- Coverage: `tests/e2e/security-runtime.spec.ts` uses Playwright describe-level skips for missing/empty fixture inputs, keeping the default E2E command discoverable without weakening the dedicated smoke gate.
- Pages: [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Verification: `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:9 pnpm exec playwright test tests/e2e/security-runtime.spec.ts --list`, runtime contract tests, and TypeScript pass.

## 2026-07-12T21:35:00+09:00 - secure runtime smoke health timeout clarity

- Result: The production-like smoke runner now reports an explicit health timeout instead of relying on `set -e` test semantics after the final poll.
- Pages: [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `scripts/test/run-security-runtime-smoke.sh` and `tests/security/security-runtime-smoke-script.test.ts`.
- Verification: red/green shell-contract Vitest and `bash -n` pass.

## 2026-07-12T21:30:00+09:00 - secure runtime dependency verification

- Updated [[CI CD And Monitoring Workflow]] after the security-critical Next.js
   patch upgrade. Evidence: `package.json`, `pnpm-lock.yaml`,
   `tests/security/next-runtime-version.test.ts`, and
   `tests/e2e/security-runtime.spec.ts`.

## 2026-07-12T21:25:00+09:00 - secure runtime RSC response capture fix

- Result: Leaf 3 Task 2 production smoke now captures the streamed `_rsc=` body through Playwright route interception before fulfilling the response, avoiding browser protocol body lookup failures while retaining status/content-type and bounded-size checks.
- Coverage: The auth/RSC smoke is green 2/2 against `next start`; the synthetic fixture and temporary work directory are cleaned up after the run.
- Pages: [[Local Development Workflow]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `tests/e2e/security-runtime.spec.ts`, `tests/security/security-runtime-rsc-contract.test.ts`, and the Task 2 review follow-up.
- Verification: red/green RSC contract Vitest, production-like smoke, PostgreSQL fixture count, and temporary-directory cleanup checks.

## 2026-07-12T21:10:00+09:00 - secure runtime smoke lifecycle review fixes

- Result: Leaf 3 Task 2 smoke launcher now exports the transient auth secret through the child environment without an argv assignment and installs guarded cleanup immediately after temporary work creation.
- Coverage: Partial initialization paths safely skip absent server/fixture state; a static Vitest contract protects both no-secret-argv and cleanup ordering guarantees.
- Pages: [[Local Development Workflow]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `scripts/test/run-security-runtime-smoke.sh`, `tests/security/security-runtime-smoke-script.test.ts`, and the Task 2 review follow-up.
- Verification: red/green focused smoke-launcher Vitest and `bash -n` shell syntax check.

## 2026-07-12T21:00:00+09:00 - secure runtime production smoke coverage

- Result: Leaf 3 Task 2 adds two browser-level auth/RSC smoke tests, an explicit `PLAYWRIGHT_TEST_BASE_URL` external-server seam, and a production-like `next start` runner with `MUNJIB_ENABLE_DEV_LOGIN=false`.
- Coverage: The runner creates a mode `0600` password file and random `@invalid.example` fixture, checks the password provider/login shell plus bounded App Router RSC navigation, then unconditionally removes the server, synthetic organization/workspace/user, and temporary files.
- Pages: [[Local Development Workflow]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `tests/e2e/security-runtime.spec.ts`, `playwright.config.ts`, `scripts/test/run-security-runtime-smoke.sh`, `scripts/test/security-runtime-fixture.ts`, and `package.json`.
- Verification: focused static/Playwright checks and wiki gates are recorded in the Task 2 report; database-backed smoke requires the local PostgreSQL and build/server prerequisites.

## 2026-07-12T20:35:00+09:00 - secure runtime ownership review follow-up

- Result: The protected runtime projection rejects whole-file ownership only for `package.json` and `pnpm-lock.yaml`; future `docker-compose.yml` ownership remains available. Task 2's production smoke spec and launcher placeholders were removed from the Leaf 3 implementation for separate follow-up work while their capability/owner reservations remain recorded.
- Pages: [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `scripts/deploy/project-protected-artifacts.ts`, `tests/security/next-runtime-projection.test.ts`, capability fragment, and protected owner map.
- Verification: focused projection/security/delivery tests pass; Task 2 will supply the real production smoke implementation.

## 2026-07-12T20:25:00+09:00 - secure Next.js runtime gate

- Result: Leaf 3 pins `next` and `eslint-config-next` to exact 15.5.18 specifications and records a deterministic Next.js/React runtime projection with protected-artifact ownership.
- Coverage: The advisory gate follows paginated GitHub API results and prints only candidate/count; the synthetic runtime fixture reads credentials from a password file and emits no secret values.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `package.json`, `pnpm-lock.yaml`, runtime contract tests, advisory gate, projection projector, capability fragment, and protected owner map.
- Verification: focused Vitest security and delivery contract tests pass; live advisory API verification remains an external network/authentication gate.

## 2026-07-12T19:00:00+09:00 - delivery substrate tracking handles

- Result: The public-safe delivery documentation records parent Issue #167, child Issue #169, and remote branch `issue-169-delivery-substrate` alongside the Leaf 13A label.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: Leaf 13A child issue/branch mapping and delivery substrate contract files.
- Verification: focused delivery contract tests and TypeScript compilation pass.

## 2026-07-12T19:10:00+09:00 - sshd policy parser hardening

- Result: The forced-submit fragment keeps `PermitUserEnvironment no` in the global scope, where OpenSSH accepts it, while the `Match User munjib-deploy` block contains only match-valid restrictions.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `deploy/sshd/munjib-release-submit.conf` and `tests/deploy/delivery-substrate-contract.test.ts`.
- Verification: focused delivery contract tests pass; production `sshd -t` remains an installation gate.

## 2026-07-12T18:45:00+09:00 - delivery broker review hardening

- Result: Leaf 13A review follow-up adds bounded broker deadlines and concurrency, framed response parsing, socket-activation descriptor cleanup, and allocation-free envelope decoding with trailing-data rejection.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: Leaf 13A delivery broker/submitter/envelope sources and contract tests.
- Verification: focused delivery contract tests and TypeScript compilation pass; the review fixes are on the same child PR.

## 2026-07-12T18:35:00+09:00 - least-authority delivery substrate

- Result: Leaf 13A adds a public-safe delivery contract for a non-interactive submitter, peer-verified Unix-socket broker, fixed operation allowlist, and empty protected-owner registry.
- Coverage: The application capability floor remains empty during substrate installation; caller-selected paths, environments, Docker, sudo, root SSH, and interactive forwarding are excluded.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `cmd/munjib-release-submit/main.go`, `cmd/munjib-release-broker/main.go`, `internal/delivery/envelope.go`, fixed delivery manifests, and `tests/deploy/delivery-substrate-contract.test.ts`.
- Verification: focused delivery contract tests and TypeScript compilation pass; full DB-backed test execution remains dependent on an available test PostgreSQL service.

## 2026-07-09T22:55:00+09:00 - stale attachment preview suppression

- Result: Local `trial@example.invalid` login no longer triggers repeated browser image requests for stale internal attachment URLs embedded in imported Markdown.
- Coverage: DB inspection showed the `company-handbook` `/raw/ai-iclr` document referenced `/api/attachments/cmr5...` ids that no longer exist in `Attachment`. `WorkspacePage` now passes the selected document's attachment ids into `DocumentEditor`, and `DocumentEditor` also tracks attachment ids returned by successful image paste uploads until the next route refresh. `MarkdownPreview` renders `/api/attachments/<id>` images only when the id is in that combined allow-list. Stale internal image links preserve alt text without creating an `<img>` request, while valid attached images, freshly pasted images, and external image URLs keep rendering.
- Pages: [[Document Editing Workflow]], [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: user bug report, local read-only Prisma inspection, `app/workspaces/[workspaceSlug]/page.tsx`, `components/document-editor.tsx`, `components/document-editor/markdown-preview.tsx`, `components/document-editor/types.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `./node_modules/.bin/vitest run tests/components/document-editor-preview.test.tsx -t "stale internal attachment"` failed before the fix and passed after the fix; PR #153 review follow-up test `./node_modules/.bin/vitest run tests/components/document-editor-preview.test.tsx -t "newly pasted attachment"` failed before the follow-up and passed after it; `./node_modules/.bin/vitest run tests/components/document-editor-preview.test.tsx`; `./node_modules/.bin/tsc --noEmit`.

## 2026-07-09T22:04:00+09:00 - editor paste and account drawer layout fix

- Result: Editor paste now preserves Markdown copied from VS Code/Monaco-style code editors, and the lower account drawer button stays pinned to the bottom of the left sidebar when the document list is short.
- Coverage: `DocumentEditor` detects code-editor syntax-highlight HTML that accompanies `text/plain` and inserts the plain Markdown source instead of treating each highlighted line wrapper as a rich HTML block. The PR #152 review follow-up keeps `<b>`/`<i>` rich HTML on the Markdown conversion path and detects quoted `font-family` values plus generic `monospace` fallbacks. Rich semantic HTML and HTML image paste keep their existing conversion/upload paths. `DocumentList` now renders as a full-height flex column, and the account drawer footer uses `mt-auto` with `sticky bottom-0`.
- Pages: [[Document Editing Workflow]], [[Markdown Import And Clipboard Paste Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: user bug report, PR #152 review threads, `components/document-editor.tsx`, `components/document-list.tsx`, `tests/components/document-editor-preview.test.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `./node_modules/.bin/vitest run tests/components/document-editor-preview.test.tsx tests/components/document-list.test.tsx --pool forks`; `./node_modules/.bin/vitest run tests/components/document-editor-preview.test.tsx --pool forks`; `./node_modules/.bin/tsc --noEmit`.

## 2026-07-08T00:25:00+09:00 - logout redirect normalization

- Result: Lower account drawer logout now preserves the current browser origin instead of following a NextAuth absolute URL derived from `NEXTAUTH_URL`.
- Coverage: `signOut()` runs with `redirect: false`, then shared client redirect parsing accepts only app-local paths for the current browser origin and navigates to `/login`. This mirrors the existing sign-in redirect normalization that avoids `http://localhost:3000/...` escapes, and the browser-origin helper is guarded so it does not throw when `window` is absent.
- Pages: [[Auth And Permissions Workflow]], [[log|Wiki Log]].
- Source evidence: user bug report, PR #151 review thread, `docs/superpowers/specs/2026-07-08-logout-redirect-normalization-design.md`, `lib/auth/client-redirects.ts`, `app/login/login-form.tsx`, `components/document-list.tsx`, `tests/auth/client-redirects.test.ts`, `tests/components/login-form.test.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `./node_modules/.bin/vitest run tests/auth/client-redirects.test.ts tests/components/login-form.test.tsx tests/components/document-list.test.tsx`; `./node_modules/.bin/tsc --noEmit`.

## 2026-07-07T01:40:00+09:00 - issue-147 RAG archived workspace review follow-up

- Result: PR #150 review feedback now blocks archived workspaces in RAG POST loaders.
- Coverage: `askDocumentQuestion()` and `loadWorkspaceForChat()` resolve workspace slugs with `archivedAt: null` plus actor membership. Ask AI returns `WORKSPACE_NOT_FOUND` before current-document context generation, and Workspace AI returns `WORKSPACE_NOT_FOUND` before creating chat threads or persisting messages from stale tabs.
- Pages: [[RAG Process Workflow]], [[Auth And Permissions Workflow]], [[log|Wiki Log]].
- Source evidence: PR #150 review thread, `lib/rag/ask.ts`, `lib/rag/workspace-chat.ts`, `tests/rag/ask.test.ts`, `tests/rag/workspace-chat.test.ts`.
- Verification: `./node_modules/.bin/vitest run tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts`.

## 2026-07-07T01:10:00+09:00 - issue-147 review follow-up

- Result: PR #150 review feedback tightened the workspace management implementation before merge.
- Coverage: Workspace page lookup now uses an actor-membership-scoped active workspace predicate so organization-scoped duplicate slugs cannot resolve the wrong workspace. Auth provisioning treats archived-only memberships as no active workspace and reactivates the deterministic personal default workspace row by clearing `archivedAt` when needed instead of redirecting back to login. Document and folder write services reject archived workspaces, including document version restore and broken-link document creation, preventing stale browser tabs from mutating hidden archived workspace data. The lower account drawer keeps Workspace settings reachable while creation failures show localized feedback, and workspace archive requires confirmation.
- Pages: [[Auth And Permissions Workflow]], [[Document Knowledge Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #150 review threads, `lib/workspaces/page-query.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `lib/auth/provisioning.ts`, `lib/documents/service.ts`, `lib/folders/service.ts`, `components/document-list.tsx`, `components/workspace-settings-panel.tsx`, `lib/i18n/messages.ts`.
- Verification: `./node_modules/.bin/vitest run tests/i18n/messages.test.ts tests/auth/provisioning.test.ts tests/auth/provisioning-current-user.test.ts tests/workspace-actions.test.ts tests/permissions/workspace.test.ts tests/components/workspace-settings-panel.test.tsx tests/components/document-list.test.tsx tests/workspaces/page-query.test.ts`; `./node_modules/.bin/vitest run tests/workspaces/management-service.test.ts tests/workspaces/membership-bootstrap.test.ts tests/permissions/workspace.test.ts tests/documents/service.test.ts tests/folders/service.test.ts`; `./node_modules/.bin/tsc --noEmit`.

## 2026-07-07T00:40:00+09:00 - issue-147 launch workspace management implementation

- Result: Issue #147 implements launch workspace management on the authenticated workspace shell.
- Coverage: The top sidebar workspace title is static chrome with no upper Settings menu; the lower account drawer owns switch workspace, add workspace, workspace settings, and log out, while omitting both `Current workspace:` and the current workspace name. `WorkspaceSettingsPanel` now opens to a Workspace section for slug-stable rename and soft archive. `Workspace.archivedAt` hides archived workspaces from normal navigation, direct workspace-page lookup, and auth landing fallback redirects. `lib/workspaces/management-service.ts` lists readable non-archived workspaces, creates new owner workspaces with launch admin/trial memberships, renames `Workspace.name` without changing `slug`, and blocks archive when no readable active fallback exists.
- Pages: [[Auth And Permissions Workflow]], [[Document Knowledge Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #147, `docs/superpowers/specs/2026-07-07-launch-workspace-management-design.md`, `docs/superpowers/plans/2026-07-07-launch-workspace-management.md`, `prisma/schema.prisma`, `prisma/migrations/20260707013000_add_workspace_archive/migration.sql`, `lib/workspaces/management-service.ts`, `components/document-list.tsx`, `components/workspace-settings-panel.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `lib/auth/provisioning.ts`.
- Verification: focused Vitest coverage for i18n, auth provisioning, workspace actions, workspace permissions, settings panel, and document list passed; DB-backed workspace management tests passed against local Postgres; `tsc --noEmit`, `prisma validate`, and `git diff --check` passed.

## 2026-07-07T00:00:00+09:00 - issue-147 launch workspace management design

- Result: Issue #147 workspace management design records the Lazyweb Hypothesis #3 Account Drawer direction before implementation.
- Coverage: The design removes the upper Settings-only menu, keeps the top sidebar workspace title as the only large current-workspace name display, moves workspace switch/create/settings/logout into the lower account/workspace drawer, and requires the lower drawer not to render `Current workspace:` or repeat the current workspace name. It also plans slug-stable rename, `Workspace.archivedAt` soft archive, archived-workspace navigation guards, launch membership bootstrap on created workspaces, and English/Korean i18n coverage.
- Pages: [[Munjib]], [[Project PRD]], [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #147, Lazyweb report `https://www.lazyweb.com/report/lazyweb/36982f10-0f6b-4dfa-8c84-3a039c876e9a/?source=create`, `docs/superpowers/specs/2026-07-07-launch-workspace-management-design.md`.
- Verification: Design-only wiki sync checks pending implementation planning.

## 2026-07-06T02:10:00+09:00 - issue-146 PR review follow-up

- Result: PR #149 review feedback hardened the launch signup/login flow while preserving the language-first auth text rendering behavior.
- Coverage: Email/password submission now locks Google, email, password, password reveal, forgot-password, mode toggle, demo, and dev-login controls until the active auth action settles. The Google CTA is hidden when the provider is not configured. Post-login workspace provisioning now runs the default-workspace path inside a Prisma transaction and uses deterministic `upsert` calls for organization, organization membership, and workspace rows before resolving the user-visible landing redirect.
- Pages: [[Auth And Permissions Workflow]], [[log|Wiki Log]].
- Source evidence: PR #149 review threads, `app/login/login-form.tsx`, `lib/auth/provisioning.ts`, `tests/auth/provisioning-current-user.test.ts`, `tests/components/login-form.test.tsx`.
- Verification: `./node_modules/.bin/vitest run tests/auth/config.test.ts tests/auth/provisioning-current-user.test.ts tests/auth/provisioning.test.ts tests/components/login-form.test.tsx` passed with 43 tests, `./node_modules/.bin/tsc --noEmit` passed.

## 2026-07-06T01:52:00+09:00 - issue-146 launch signup/login implementation

- Result: Issue #146 implements the Lazyweb Hypothesis #3 Real Auth Stack variant for launch signup/login.
- Coverage: `LoginForm` waits for hydrated browser language before rendering auth text, matches the Lazyweb mockup hierarchy for Google, email/password, create-account, and read-only demo entry, and sends all auth providers through `/login/redirect` so `/api/auth/landing` can provision/resolve an accessible workspace. `authOptions` now has distinct `password`, `trial`, gated `development-login`, and optional `google` providers; Google sign-in rejects unverified email profiles. `/api/auth/signup` creates password users, hashes credentials, provisions localized default workspaces, and applies launch admin/trial membership bootstrap rows.
- Pages: [[Auth And Permissions Workflow]], [[Document Knowledge Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #146, Lazyweb report `https://www.lazyweb.com/report/lazyweb/3d6366ab-9fe9-4a97-84c1-e3a4a70a9695/?source=create`, `app/login/login-form.tsx`, `app/login/redirect/page.tsx`, `app/api/auth/signup/route.ts`, `app/api/auth/landing/route.ts`, `lib/auth/config.ts`, `lib/auth/provisioning.ts`, `lib/i18n/messages.ts`, `tests/auth/config.test.ts`, `tests/auth/provisioning.test.ts`, `tests/components/login-form.test.tsx`.
- Verification: focused auth/login/provisioning Vitest coverage passed, related auth/i18n/workspace permission regressions passed, `tsc --noEmit` passed via local binary, Prisma schema validation passed, full Vitest passed against a fresh migrated local Postgres on port 55435 (87 files / 941 tests), `git diff --check` passed, and Playwright screenshot comparison against the Hypothesis #3 mockup passed after spacing/icon/layout iteration. `pnpm` wrappers remain blocked by the ignored-builds guard.

## 2026-07-05T14:55:00+00:00 - maintenance

- Result: Issue #145 launch-auth-accounts-foundation adds account-ready schema, password hashing helpers, seeded launch accounts, and idempotent global workspace membership bootstrap.
- Coverage: `User.passwordHash`, NextAuth-compatible `User.emailVerified`, Prisma `User.image` mapped to the existing `avatarUrl` column, `Account`/`Session`/`VerificationToken` adapter tables, `scrypt` password verification, `admin@example.invalid` ADMIN and `trial@example.invalid` VIEWER seed/backfill behavior, owner-role preservation when the owner is also a launch account or already owns a workspace during backfill, launch-user prefetching during backfill, and focused tests for password and membership bootstrap logic.
- Pages: [[Document Knowledge Model]], [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: Issue #145 plan in `docs/superpowers/plans/2026-07-05-post-143-production-launch-auth-workspace.md`, `docs/superpowers/specs/2026-07-06-launch-auth-accounts-foundation-design.md`, `docs/superpowers/plans/2026-07-06-launch-auth-accounts-foundation-completion.md`, `prisma/schema.prisma`, `prisma/migrations/20260705090000_add_auth_accounts_foundation/migration.sql`, `lib/auth/passwords.ts`, `lib/workspaces/membership-bootstrap.ts`, `prisma/seed.ts`, `tests/auth/passwords.test.ts`, `tests/workspaces/membership-bootstrap.test.ts`.
- Verification: local-binary `prisma validate`, `prisma generate`, `tsc --noEmit`, `vitest run tests/auth/passwords.test.ts tests/workspaces/membership-bootstrap.test.ts tests/auth/config.test.ts tests/permissions/workspace.test.ts`, `git diff --check`, and fresh migration/seed verification in a temporary local database. `pnpm` wrappers remain blocked by the ignored-builds guard, and `next lint` remains blocked by the noninteractive ESLint setup prompt.

## 2026-07-05T00:00:00+0000 - post-issue-143 production launch planning

- Coverage: Captured the follow-up plan after Issue #143 for production account entry and workspace management. The plan splits work into account foundation, signup/login, and workspace-management branches.
- Result: Confirmed `admin@example.invalid` / `local-only-fixture-1` as global workspace `ADMIN`, `trial@example.invalid` / `local-only-fixture-2` as global workspace `VIEWER`, normal signup users as `OWNER` of their own default workspace, Google login without separate Munjib email verification, localized default workspace names, trial login, and soft archive workspace deletion.
- Updated pages: `wiki/index.md`, `wiki/log.md`.
- Source evidence: Prior user decisions in the Issue #143 follow-up planning conversation and `docs/superpowers/plans/2026-07-05-post-143-production-launch-auth-workspace.md`.

## 2026-07-04T23:35:00+0900 - issue-143 auth launch foundation review follow-up

- Result: PR #144 review feedback closed the remaining launch-gate gaps for direct workspace entry and production Docker runtime env.
- Coverage: unauthenticated `/workspaces/[workspaceSlug]` now passes `resolveDevLoginEnabled()` into `LoginForm`, all server LoginForm callers have focused contract coverage, and `docker-compose.yml` forwards `MUNJIB_ENABLE_DEV_LOGIN` to the production-style `web` service so `/etc/munjib/env` overrides reach runtime auth.
- Pages: [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #144 review threads, `app/workspaces/[workspaceSlug]/page.tsx`, `docker-compose.yml`, `tests/auth/login-gate-callers.test.ts`, `tests/docker/compose.test.ts`.
- Verification: red focused Vitest coverage reproduced the missing workspace caller gate and missing Docker env passthrough, then passed after the fixes.

## 2026-07-04T23:20:00+0900 - issue-143 auth launch foundation implementation

- Result: Issue #143 made the existing email-only development login launch-safe by gating it behind `MUNJIB_ENABLE_DEV_LOGIN`.
- Coverage: `resolveDevLoginEnabled()` defaults local development to enabled and production to disabled; the Credentials provider returns `null` before querying `User` when disabled; `/` and `/login` pass the server gate into `LoginForm`; `/login` is forced dynamic so disabled/enabled controls reflect the runtime env gate; the login form disables seeded-user shortcuts, email input, and submit while showing localized disabled-state copy.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #143, `lib/auth/config.ts`, `app/login/login-form.tsx`, `app/login/page.tsx`, `app/page.tsx`, `lib/i18n/messages.ts`, `tests/auth/config.test.ts`, `tests/components/login-form.test.tsx`.
- Verification: focused auth config and login form Vitest coverage, TypeScript check, wiki manifest generation, wiki lint, staged wiki sync-plan, and staged wiki sync-check.

## 2026-07-04T22:54:19+0900 - issue-143 auth launch foundation design

- Result: Issue #143 design scopes auth foundation work to launch-safe hardening of the existing email-only development login path.
- Coverage: The design keeps local seeded-user login available by default outside production, gates production development login behind explicit env such as `MUNJIB_ENABLE_DEV_LOGIN=true`, and leaves password auth, OAuth, SSO/SAML, invitation flow, and user lifecycle management as follow-up decisions.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #143, `lib/auth/config.ts`, `app/login/login-form.tsx`, `docs/superpowers/specs/2026-07-04-launch-auth-foundation-design.md`.
- Verification: design-only update; implementation tests will be added with the auth gate implementation plan.

## 2026-07-04T18:46:12+0900 - Honen neutral hover and mobile comment composer follow-up

- Result: User-requested UI follow-up kept custom default button hover feedback neutral, made the closed Workspace AI launcher circle use Honen primary green, and prevented the comment composer from overflowing narrow mobile widths.
- Coverage: `Button` now supplies `hover:bg-slate-200` for non-primary custom default background buttons that do not declare their own hover background; the Workspace AI launcher uses `bg-primary` for the circular button and `hover:bg-primary-hover` for button-like darker hover feedback; the document comments form uses `w-full min-w-0 flex-wrap` with a shrinkable input.
- Pages: [[Honen Design System]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: user follow-up messages in the 2026-07-04 task conversation, `components/ui/button.tsx`, `components/workspace-chatbot.tsx`, `components/document-editor/document-properties.tsx`, `tests/design-system/primitives.test.tsx`, `tests/components/workspace-chatbot.test.tsx`, `tests/components/document-properties.test.tsx`.
- Verification: red primitive, workspace chatbot, and document properties component tests reproduced the lingering primary hover, black launcher icon, and fixed-width comment form before the responsive/color fixes.

## 2026-07-04T18:39:38+0900 - Honen settings dropzone emitted utility review follow-up

- Result: PR #142 review feedback replaced the settings import dropzone `bg-primary-muted/70` class with emitted `bg-primary-muted`.
- Coverage: Honen semantic color aliases backed by plain CSS variables should avoid Tailwind opacity modifiers unless the token is alpha-aware; focused settings tests now assert the dropzone does not use the missing opacity utility.
- Pages: [[Honen Design System]], [[log|Wiki Log]].
- Source evidence: PR #142 Codex review thread, `components/workspace-settings-panel.tsx`, `tests/components/workspace-settings-panel.test.tsx`.
- Verification: red settings panel component test reproduced the lingering `bg-primary-muted/70` class, then passed after switching to `bg-primary-muted`.

## 2026-07-04T18:29:36+0900 - Honen graph canvas and selected node color follow-up

- Result: User-requested graph follow-up moved the force graph canvas background to `var(--color-surface-editor)` and replaced the selected document/wiki node violet colors with Honen primary green.
- Coverage: `KnowledgeGraphView` now applies `bg-surface-editor` to the graph shell, passes `var(--color-surface-editor)` to the canvas background, and uses `#2f7d46` for selected document and wiki node colors.
- Pages: [[Honen Design System]], [[log|Wiki Log]].
- Source evidence: user follow-up messages in the 2026-07-04 task conversation, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: red graph component tests reproduced the old white canvas, selected node purple, and wiki node purple before the graph color migration.

## 2026-07-04T18:22:30+0900 - Honen remaining violet color alignment follow-up

- Result: User-requested Honen color follow-up replaced remaining violet/sky accents on wiki links, tag links, AI answer links, settings controls, and graph filters with semantic green primary and surface tokens.
- Coverage: Active document tabs now use `bg-surface-page text-ink` instead of `bg-primary-muted text-primary`; selected icon-style controls keep neutral surface hover states; settings panel dropzone, provider/model controls, language cards, retention select, and import progress bar consume Honen border/surface/primary classes.
- Pages: [[Honen Design System]], [[log|Wiki Log]].
- Source evidence: user follow-up list in the 2026-07-04 task conversation, `components/document-editor/markdown-preview.tsx`, `components/document-editor/document-properties.tsx`, `components/ai/answer.tsx`, `components/document-tabs.tsx`, `components/workspace-settings-panel.tsx`, `components/knowledge-graph-view.tsx`, and focused component tests.
- Verification: red component tests reproduced the old violet/sky/primary-muted classes before the theme cleanup, then passed after the class migration.

## 2026-07-04T17:54:00+0900 - Honen primary active-state review follow-up

- Result: PR #142 review feedback removed primary active background leakage from custom default buttons.
- Coverage: `Button` keeps green active chrome only for explicit `variant="primary"` calls, while custom default call sites can override background/text/hover without inheriting `active:bg-primary-active`.
- Pages: [[Honen Design System]], [[log|Wiki Log]].
- Source evidence: PR #142 Codex review thread, `components/ui/button.tsx`, `tests/design-system/primitives.test.tsx`.
- Verification: red primitive test reproduced the leaked active primary class on a custom default button, then passed after the component change.

## 2026-07-04T17:42:00+0900 - Honen review contrast and log-order follow-up

- Result: PR #142 review feedback tightened Honen invalid field border contrast and restored reverse-chronological wiki log ordering for the Honen entries.
- Coverage: `--color-border-danger` now uses a visible rose border on white control and warm editor surfaces, and `wiki:log` recent lookups see the July 4 Honen entries before older July 3 and June entries.
- Pages: [[Honen Design System]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #142 Codex review threads, `app/globals.css`, `lib/design-system/tokens.ts`, `tests/design-system/tokens.test.ts`, `wiki/log.md`.
- Verification: red design-system token test reproduced the low invalid-border contrast before the token change.

## 2026-07-04T17:15:07+0900 - Honen screenshot color alignment follow-up

- Matched the Honen token palette to the user-uploaded course reader screenshot: green primary actions, pale green selected states, warm page/editor surfaces, white controls, and soft warm borders.
- Updated shared primitives and workspace editor shells so primary buttons, textarea/editor backgrounds, tabs, toolbar, and preview chrome consume the new semantic tokens.
- Added focused design-system tests for the screenshot palette and primitive class contracts.
- Pages: [[Honen Design System]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: uploaded Honen course reader screenshot, `lib/design-system/tokens.ts`, `app/globals.css`, `tailwind.config.ts`, `components/ui/button.tsx`, `components/ui/textarea.tsx`, `components/document-editor.tsx`, `components/document-tabs.tsx`, `components/document-toolbar.tsx`, `tests/design-system/tokens.test.ts`, `tests/design-system/primitives.test.tsx`.

## 2026-07-04T16:55:00+09:00 - Honen design system review follow-up

- Aligned typed Honen primitive color token names with the CSS semantic variable categories.
- Added missing Tailwind semantic aliases for border, surface, and interactive radius tokens so shared primitives can use normal utilities for common variants.
- Preserved compact button override behavior by moving default button heights into size variants instead of the base class.
- Kept the primary button default flat so legacy transparent toolbar buttons do not inherit an unintended elevation shadow.
- Removed primary default hover/active chrome from the base compatibility path so custom button call sites keep their local hover states.
- Switched busy and invalid primitive state selectors to generated Tailwind arbitrary ARIA variants.
- Removed transform press animations from shared button variants and added reduced-motion transition suppression.
- Darkened the focus-visible token so keyboard focus rings remain visible on page and card surfaces.
- Added reduced-motion transition suppression to shared field primitives.

## 2026-07-04T15:20:00+09:00 - Honen component state guidance follow-up

- Tightened `docs/design-system/honen.md` so links, cards, navigation, and lists each document required default, hover, focus-visible, active, disabled, loading, and error states.
- Updated [[Honen Design System]] to record the complete state-coverage contract for the first implementation slice.

## 2026-07-04T15:00:00+09:00 - Honen design system foundation

- Added [[Honen Design System]] as the durable project knowledge entry for the Honen token-driven content-site design system.
- Recorded source evidence from the user-provided `design.md` brief and the implementation files `docs/design-system/honen.md`, `lib/design-system/tokens.ts`, `app/globals.css`, `tailwind.config.ts`, and shared UI primitives in `components/ui/`.
- Updated [[Wiki Index]] navigation so future UI work can start from the design system page before source search.

## 2026-07-03T01:06:24+0900 - deployment fix

- Result: Main deploy failure after PR #140 merge was traced to OCI server checkout GitHub HTTPS authentication failing during `git fetch --force origin main`.
- Coverage: The deploy workflow now passes the Actions repository and ephemeral GitHub token to the SSH step, uses a one-shot Git HTTP basic auth extraheader for the remote fetch, and avoids depending on or writing a stored token in the OCI checkout's `origin` URL.
- Pages: [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub Actions run `28603528095`, `.github/workflows/ci-cd.yml`, `tests/github-actions/ci-cd.test.ts`.
- Verification: red focused Vitest reproduced the missing tokenized remote fetch contract; green focused Vitest for `tests/github-actions/ci-cd.test.ts` passed.

## 2026-07-03T00:27:00+0900 - review follow-up

- Result: PR #140 review feedback hardened login callback sanitization against malformed external paths such as `/\evil.example`.
- Coverage: `LoginForm` now parses callback/result URLs against the current browser origin, passes only safe app-local callback paths to `signIn()`, and falls back to `/workspaces/company-handbook` when callback/result URLs are external or malformed.
- Pages: [[Auth And Permissions Workflow]], [[log|Wiki Log]].
- Source evidence: PR #140 Gemini review thread, `app/login/login-form.tsx`, `tests/components/login-form.test.tsx`.
- Verification: red focused Vitest reproduced the unsafe callback reaching `signIn()`; green focused Vitest for `tests/components/login-form.test.tsx` passed.

## 2026-07-03T00:16:19+0900 - implementation

- Result: Login submit no longer navigates users to `http://localhost:3000/workspaces/company-handbook` when NextAuth returns a localhost absolute URL after credentials sign-in.
- Coverage: `LoginForm` now keeps app-local callback paths such as `/workspaces/company-handbook` as relative browser navigations, preserving the current origin even when `NEXTAUTH_URL` or NextAuth's returned result URL points at localhost.
- Pages: [[Auth And Permissions Workflow]], [[log|Wiki Log]].
- Source evidence: user bug report, `app/login/login-form.tsx`, `tests/components/login-form.test.tsx`.
- Verification: red focused Vitest reproduced the localhost absolute URL assignment; green focused Vitest for `tests/components/login-form.test.tsx` passed; focused auth/login Vitest for `tests/auth/config.test.ts` and `tests/components/login-form.test.tsx` passed.

## 2026-06-27T16:55:01+0900 - review follow-up

- Result: PR #138 review feedback ensures created-row scrolling still runs after returning to the Documents panel.
- Coverage: `DocumentList` now reruns the pending-created-row scroll effect when the active sidebar panel changes, so creating from Search/Favorites and later opening Documents scrolls the newly rendered row into view.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #138 Gemini review thread, `components/document-list.tsx`, `tests/components/document-list.test.tsx`.
- Verification: red focused Vitest reproduced the missing scroll after returning to Documents; green focused Vitest passed the new regression test; full focused `document-list` Vitest and `tsc --noEmit --pretty false` passed.

## 2026-06-27T16:44:19+0900 - implementation

- Result: Issue #137 smooths the document-list sidebar creation and row menu UX.
- Coverage: Top-level `New document` and `New folder` now submit `redirect=false` and route on the client, created documents/folders scroll into view once the refreshed list contains them, normal Documents/Recents document rows are title-only, Search/Favorites keep title-based display-path context, title-only links preserve accessible disambiguation, and bottom-edge row action menus open upward against the viewport or sidebar scroll boundary.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #137, `docs/superpowers/specs/2026-06-27-document-list-sidebar-ux-design.md`, `docs/superpowers/plans/2026-06-27-document-list-sidebar-ux.md`, `components/document-list.tsx`, `components/document-create-controls.tsx`, `components/document-navigation.tsx`, `components/document-navigation/document-row.tsx`, `components/document-navigation/folder-row.tsx`, `components/document-navigation/menu-placement.ts`, `tests/components/document-list.test.tsx`.
- Verification: focused `document-list` Vitest run passed; `tsc --noEmit --pretty false` passed; wiki manifest/lint/sync-check passed with the known `wiki/designs/sidebar.md` pasted-image warning.

## 2026-06-27T15:34:35+0900 - design

- Result: Issue #137 design records the document-list sidebar UX follow-up for smoother top-level creation, created-row scrolling, title-only normal document rows, and bottom-edge action menu placement.
- Coverage: Top-level `New document` and `New folder` should use the existing `redirect=false` server-action return contract and client route transitions; generated rows should scroll into view after refreshed props include them. Normal Documents/Recents document rows should hide path descriptions, while Search/Favorites keep title-based display-path context from Issue #131. Row action menus should keep the current implementation and open upward when lower viewport space is insufficient.
- Pages: [[Munjib]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #137, `docs/superpowers/specs/2026-06-27-document-list-sidebar-ux-design.md`.
- Verification: spec self-review and `git diff --check` passed; wiki sync required this durable design entry before commit.

## 2026-06-27T15:08:00+0900 - review follow-up

- Result: PR #136 review feedback hardens Sentry metric helpers against unavailable metric APIs and unexpected metric payload shapes.
- Coverage: `captureMetricCount()` now returns before compacting attributes when `Sentry.metrics.count` is unavailable, and `scrubSentryMetric()` returns null, undefined, and primitive payloads unchanged instead of throwing.
- Pages: [[Production Observability Workflow]], [[log|Wiki Log]].
- Source evidence: PR #136 Gemini review threads, `lib/observability/application-metrics.ts`, `lib/observability/sentry-scrub-event.ts`, `tests/observability/application-metrics.test.ts`, `tests/observability/sentry-scrub-event.test.ts`.
- Verification: red focused Vitest run failed on the two review cases, green focused Vitest run passed 2 files / 18 tests, focused observability/Docker Vitest run passed 6 files / 52 tests, and `pnpm exec tsc --noEmit --pretty false` passed.

## 2026-06-27T12:10:00+0900 - implementation

- Result: Issue #135 records the low-cost production observability slice that keeps Docker logs as the startup/env/DB source of truth while extending Sentry with opt-in Node runtime metrics, privacy-masked error-only Replay, and low-cardinality application metrics.
- Coverage: `web` compose now passes runtime metric env and Browser Replay build args, Dockerfile bundles public Replay sample rates at build time, environment examples document low-cost defaults, Sentry metric scrubbing removes server/user identity attributes, and handled AI unavailable paths increment `munjib.ai.unavailable` without workspace/document/user labels.
- Pages: [[Production Observability Workflow]], [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #135, `docs/superpowers/specs/2026-06-27-low-cost-production-observability-design.md`, `docs/superpowers/plans/2026-06-27-low-cost-production-observability.md`, `lib/observability/sentry-config.ts`, `lib/observability/sentry-scrub-event.ts`, `lib/observability/application-metrics.ts`, `lib/observability/ai-unavailable.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `.env.docker.example`.
- Verification: focused Sentry config/files/scrubber, application metrics, handled AI unavailable, and Docker compose Vitest runs passed; `pnpm exec tsc --noEmit --pretty false` passed after `pnpm run db:generate`; `pnpm wiki:manifest` and `pnpm wiki:lint` passed with the known pasted-image warning.

## 2026-06-24T00:05:00+0900 - review follow-up

- Result: PR #134 review feedback now keeps Workspace AI thread state stable across selected-document changes and sends an explicit fallback model override when the default AI provider is unavailable.
- Coverage: Ask AI and Workspace AI derive an effective browser model setting that preserves valid stored overrides, returns no override when the default provider is available, and otherwise falls back to the first available provider reset default. Workspace AI stores provider availability/default provider in refs so changing only the selected document or receiving a fresh availability object does not clear the open thread.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: PR #134 review comments, `lib/rag/client-model-settings.ts`, `components/document-editor/ai-assistant-panel.tsx`, `components/workspace-chatbot.tsx`, `tests/rag/client-model-settings.test.ts`, `tests/components/document-editor-preview.test.tsx`, `tests/components/workspace-chatbot.test.tsx`.
- Verification: `pnpm exec tsc --noEmit --pretty false` passed; escalated focused Vitest run for client model settings, Workspace AI, and document editor preview passed 3 files / 100 tests.

## 2026-06-23T23:35:00+0900 - implementation

- Result: Issue #133 hides unavailable AI chat providers from settings and standardizes production Compose env loading on a host-local env file.
- Coverage: Server-side provider availability now reports Ollama always available, official OpenAI only with an OpenAI key, and OpenAI-compatible/OpenRouter only with a base URL. Workspace settings hides unavailable provider options, ignores stale browser overrides for unavailable providers, and Ask AI/Workspace AI clients drop those stale overrides before sending requests. The deploy workflow now uses `DEPLOY_ENV_FILE=/etc/munjib/env` and passes it to every remote `docker compose --env-file` command so `.env.docker` is not mistakenly treated as an automatically loaded production source.
- Pages: [[RAG Process Workflow]], [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #133, `lib/rag/model-config.ts`, `lib/rag/client-model-settings.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `components/workspace-settings-panel.tsx`, `components/document-editor/ai-assistant-panel.tsx`, `components/workspace-chatbot.tsx`, `.github/workflows/ci-cd.yml`, `docker-compose.yml`.
- Verification: `pnpm exec tsc --noEmit --pretty false` passed; escalated focused Vitest run for RAG config/client settings/settings panel/workspace chatbot/document editor/document list passed 6 files / 222 tests.

## 2026-06-22T23:11:44+0900 - design

- Result: Issue #131 design records the UX policy for showing document paths with folder names and `Document.title` instead of slugified stored paths.
- Coverage: Stored `Document.path` and `Folder.path` remain the internal identity for uniqueness, moves, wiki-link resolution, graph/RAG/audit metadata, and search compatibility. User-facing path labels in toolbar/search/sidebar descriptions should receive a separate display-only path derived from folder `name` and `Document.title`; original import file extensions are out of scope.
- Pages: [[Munjib]], [[Project PRD]], [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #131, `docs/superpowers/specs/2026-06-22-document-title-display-path-design.md`, user confirmation that `Document.title` is the file-name display source.
- Verification: spec self-review; baseline `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm test` passed 74 files / 817 tests before the spec/wiki edit.

## 2026-06-22T23:35:00+0900 - planning

- Result: Issue #131 implementation plan was written for the title-based display path UX.
- Coverage: The plan decomposes the change into display-path helpers, server prop wiring, center toolbar rendering, sidebar/search/favorites/action labels, settings import destination labels, folder detail, wiki sync, verification, push, and PR review workflow.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-06-22-document-title-display-paths.md`.
- Verification: plan self-review for spec coverage, red-flag scan, and type consistency.

## 2026-06-23T00:22:00+0900 - implementation

- Result: Issue #131 shows document and folder path labels with folder names and `Document.title` instead of slugified stored paths.
- Coverage: `lib/workspace-tree.ts` builds validity-aware display paths so missing/cyclic folder ancestry falls back to each entity's own stored path. `app/workspaces/[workspaceSlug]/page.tsx` computes folder/document display paths once and passes them to the center toolbar, sidebar tree/recents/search/favorites/action labels, workspace settings import destination picker/progress, and folder detail. Stored `Document.path` and `Folder.path` remain available for uniqueness, sorting, wiki-link matching, graph/RAG/audit metadata, and stored-path search compatibility.
- Pages: [[Munjib]], [[Project PRD]], [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #131, `docs/superpowers/specs/2026-06-22-document-title-display-path-design.md`, `docs/superpowers/plans/2026-06-22-document-title-display-paths.md`, `lib/workspace-tree.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `components/workspace-center-shell.tsx`, `components/document-navigation.tsx`, `components/document-navigation/document-section.tsx`, `components/document-navigation/search-panel.tsx`, `components/document-navigation/favorites-panel.tsx`, `components/workspace-settings-panel.tsx`, `components/folder-detail.tsx`, `tests/workspace-tree.test.ts`, `tests/components/workspace-center-shell.test.tsx`, `tests/components/document-list.test.tsx`, `tests/components/workspace-settings-panel.test.tsx`, `tests/components/folder-detail.test.tsx`.
- Verification: `pnpm exec tsc --noEmit --pretty false`, focused component/helper Vitest runs, and escalated `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm test` passed 75 files / 829 tests. A sandboxed full test failed with Prisma `Can't reach database server` despite ready Docker Postgres; [[Local Development Workflow]] now documents using sandbox escalation or another unsandboxed path for DB-backed localhost tests.

## 2026-06-23T00:40:29+0900 - review follow-up

- Result: Issue #131 review follow-up preserves exact `Document.title` characters in toolbar/sidebar display paths and localizes blank-title display paths at render time.
- Coverage: `DocumentToolbar` renders prepared display labels directly instead of reformatting display paths, so literal `/` characters inside titles remain part of the title. `documentDisplayPath()` no longer appends a server-side English fallback for blank saved titles; client helpers append the current UI language fallback after the parent display path and suppress duplicate root descriptions. Search, recents, tree, favorites, and toolbar now share the same document display-description/action-label helpers.
- Pages: [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR review follow-up, `lib/workspace-tree.ts`, `components/document-toolbar.tsx`, `components/workspace-center-shell.tsx`, `components/document-navigation/document-row.tsx`, `components/document-navigation/document-section.tsx`, `components/document-navigation/search-panel.tsx`, `components/document-navigation/favorites-panel.tsx`, `components/document-navigation.tsx`, `tests/workspace-tree.test.ts`, `tests/components/workspace-center-shell.test.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/workspace-tree.test.ts tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx` passed 3 files / 127 tests; `pnpm exec tsc --noEmit --pretty false` passed; escalated `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm test` passed 75 files / 833 tests.

## 2026-06-23T00:59:23+0900 - review follow-up

- Result: PR #132 review feedback fixed display-path edge cases for root blank titles and duplicate document/folder collisions.
- Coverage: `documentDisplayPathLabel()` treats `displayPath: ""` as an intentional computed display path so root blank-title documents render the current UI language fallback instead of slugified stored paths. When a duplicate document title receives a suffixed stored slug such as `runbook-2`, visible descriptions and action labels append the stored `Document.path` as secondary context while keeping the title-based display path primary. When duplicate folder names collapse to the same folder display path, those folder subtrees fall back to stored folder paths so downstream picker/detail/favorites labels stay distinguishable.
- Pages: [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #132 review comments, `lib/workspace-tree.ts`, `tests/workspace-tree.test.ts`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/workspace-tree.test.ts tests/components/document-list.test.tsx` passed 2 files / 110 tests; `pnpm exec tsc --noEmit --pretty false` passed; escalated `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm test` passed 77 files / 852 tests.

## 2026-06-23T01:24:42+0900 - review follow-up

- Result: PR #132 review feedback now disambiguates display-path collisions caused by slash-containing document titles and nested folder paths.
- Coverage: `buildDocumentDisplayPathMap()` counts computed display paths across readable documents and marks collisions for stored-path context. `documentDisplayPathLabel()`, visible descriptions, and action labels append the unique `Document.path` when two different documents would otherwise display the same title-based path, such as folder `A` with title `B / C` and folder `A / B` with title `C`.
- Pages: [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #132 unresolved review thread, `lib/workspace-tree.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `components/document-list.tsx`, `lib/document-tabs.ts`, `tests/workspace-tree.test.ts`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/workspace-tree.test.ts tests/components/document-list.test.tsx` passed 2 files / 113 tests.

## 2026-06-22T23:23:24+0900 - implementation

- Result: Sidebar skeleton tests now guard the right metadata close slot separation explicitly.
- Coverage: The right toolbar test checks the `right-sidebar-loading` root spacing contract and asserts the fifth `sidebar-toolbar-icon-skeleton` carries `ml-auto`, so the close icon can’t silently drift back into the tab-icon group without a test failure.
- Pages: [[Munjib]], [[index|Wiki Index]], [[log|Wiki Log]], [[Project PRD]].
- Source evidence: `tests/components/sidebar-loading-skeleton.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/sidebar-loading-skeleton.test.tsx` and `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/sidebar-loading-skeleton.test.tsx` passed after the assertion update.

## 2026-06-22T23:19:11+0900 - implementation

- Result: Issue #129 sidebar skeleton spacing was corrected to match the loaded sidebar rhythm.
- Coverage: Left sidebar loading root no longer adds extra top padding or inter-slot spacing, and `DocumentNavigationBodySkeleton` no longer carries its own outer `space-y-4` gap. The real sidebar still owns the vertical rhythm through the loaded body wrapper and section spacing, while the right sidebar loading contract remains unchanged.
- Pages: [[Munjib]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/sidebar-loading-skeleton.tsx`, `tests/components/sidebar-loading-skeleton.test.tsx`.
- Verification: red run `pnpm exec vitest run tests/components/sidebar-loading-skeleton.test.tsx` failed against the extra left-root and body-level spacing classes; green runs `pnpm exec vitest run tests/components/sidebar-loading-skeleton.test.tsx` and `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/sidebar-loading-skeleton.test.tsx` passed.

## 2026-06-22T23:13:11+0900 - implementation

- Result: Issue #129 sidebar skeleton alignment now matches loaded sidebar slots.
- Coverage: Left sidebar loading chrome and toolbar now map to the real title-bar, create-toolbar, and body slots; right metadata loading uses a compact toolbar with the close icon pushed to the end; document rows are uniform full-width text slots with no icon placeholder; folder rows keep the chevron icon slot and full-width text; document navigation body uses recents plus all-documents sections with the expected row pattern.
- Pages: [[Munjib]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/sidebar-loading-skeleton.tsx`, `tests/components/sidebar-loading-skeleton.test.tsx`.
- Verification: red run `pnpm exec vitest run tests/components/sidebar-loading-skeleton.test.tsx` failed against the previous generic row helper; green runs `pnpm exec vitest run tests/components/sidebar-loading-skeleton.test.tsx` and `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/sidebar-loading-skeleton.test.tsx` passed.

## 2026-06-22T23:09:51+0900 - plan

- Result: Issue #129 sidebar skeleton alignment implementation plan was written.
- Coverage: The plan keeps the change scoped to `components/sidebar-loading-skeleton.tsx` and `tests/components/sidebar-loading-skeleton.test.tsx`, starts with failing structural tests, implements slot-matched skeleton rows, then runs focused component verification, wiki sync, push, and PR review/CI recheck.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-06-22-sidebar-skeleton-alignment.md`, `docs/superpowers/specs/2026-06-22-sidebar-skeleton-alignment-design.md`.
- Verification: plan self-review.

## 2026-06-22T23:00:05+0900 - design

- Result: Issue #129 sidebar skeleton alignment follow-up design was recorded after visual brainstorming.
- Coverage: The follow-up fixes skeleton placement to loaded sidebar slots: left workspace chrome, create toolbar, navigation body offset, section rhythm, document row text slots, folder chevron slots, right metadata toolbar spacing, and metadata text rows. Document row skeletons are intentionally uniform full-width bars with no icon placeholder; folder rows keep only the real chevron icon slot.
- Pages: [[Munjib]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/specs/2026-06-22-sidebar-skeleton-alignment-design.md`, user-approved visual companion v2.
- Verification: spec self-review.

## 2026-06-21T23:57:58+0900 - implementation

- Result: PR #130 review feedback stabilized the `I18nProvider` explicit language setter.
- Coverage: `setLanguage` is now a `useCallback` with no changing dependencies, so consumers that only need the setter do not receive a new callback reference during language hydration or explicit language changes. Existing language storage, root `lang` update, and hydration behavior stay unchanged.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #130 Gemini inline review, `components/i18n-provider.tsx`, `tests/components/i18n-provider.test.tsx`.
- Verification: red run `pnpm exec vitest run tests/components/i18n-provider.test.tsx -t "keeps the setLanguage callback stable"` failed with 3 callback references; green run `pnpm exec vitest run tests/components/i18n-provider.test.tsx tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/sidebar-loading-skeleton.test.tsx` passed 111 tests.

## 2026-06-21T23:47:41+0900 - implementation

- Result: Issue #129 follow-up stabilized sidebar icon positions when sidebar vertical overflow appears or disappears.
- Coverage: Open left/right `AppShell` sidebar scroll containers now reserve a stable scrollbar gutter through a shared CSS utility, so sidebar header, toolbar, metadata tab, close, and row action icons do not shift horizontally when content starts or stops needing vertical scrolling.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #129, `components/app-shell.tsx`, `app/globals.css`, `tests/components/app-shell.test.tsx`.
- Verification: red run `pnpm exec vitest run tests/components/app-shell.test.tsx -t "reserves sidebar scrollbar gutters"` failed because sidebar `aside` elements lacked the stable gutter class; green run `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/sidebar-loading-skeleton.test.tsx` passed 106 tests.

## 2026-06-21T22:53:55+0900 - implementation

- Result: Issue #129 Task 5 wired navigation-body skeletons into `DocumentList` active panel hydration.
- Coverage: `DocumentList` now renders a text-free left sidebar skeleton when used before display-language hydration, and renders localized sticky sidebar chrome with `DocumentNavigationBodySkeleton` until the workspace active sidebar panel state hydrates. Once the active panel is hydrated, existing Documents/Search/Favorites navigation behavior, tag-search handling, graph route clearing, settings menu, create controls, and active panel persistence continue unchanged.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #129, `components/document-list.tsx`, `tests/components/document-list.test.tsx`.
- Verification: red focused tests failed while `document-navigation-loading` and standalone `left-sidebar-loading` were absent; green run `pnpm exec vitest run tests/components/document-list.test.tsx tests/components/sidebar-loading-skeleton.test.tsx tests/components/i18n-provider.test.tsx` passed 100 tests.

## 2026-06-21T22:44:04+0900 - implementation

- Result: Issue #129 Task 4 wired sidebar skeletons into `AppShell` hydration gates.
- Coverage: `AppShell` now combines i18n hydration and workspace UI state hydration before rendering localized sidebar content or localized reopen controls. While either hydration step is pending, open sidebars render decorative left/right sidebar skeletons instead of empty `aside` content, and closed panels render collapsed skeleton buttons instead of English/Korean tooltips or labels. Existing workspace sidebar state restore/persist, closed sidebar child mount prevention, heading navigation context, tag-search reopening, and right metadata collapse controls remain intact.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #129, `components/app-shell.tsx`, `tests/components/app-shell.test.tsx`.
- Verification: red run `pnpm exec vitest run tests/components/app-shell.test.tsx` failed while initial sidebars were empty; green run `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/sidebar-loading-skeleton.test.tsx tests/components/i18n-provider.test.tsx` passed 17 tests.

## 2026-06-21T22:34:48+0900 - implementation

- Result: Issue #129 Task 3 added reusable sidebar loading skeleton components for refresh-time empty sidebar states.
- Coverage: `components/sidebar-loading-skeleton.tsx` exports left/right workspace sidebar shell skeletons, collapsed panel skeletons, and a document navigation body skeleton built on the shared shimmer `Skeleton` primitive. The skeletons are decorative shape-only UI with no user-facing text, so they can render before display-language hydration without flashing English labels, and tests assert row counts, `aria-hidden` behavior, and collapsed-panel text absence.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #129, `components/sidebar-loading-skeleton.tsx`, `tests/components/sidebar-loading-skeleton.test.tsx`.
- Verification: red run `pnpm exec vitest run tests/components/sidebar-loading-skeleton.test.tsx` failed while the module was missing; green run `pnpm exec vitest run tests/components/sidebar-loading-skeleton.test.tsx tests/components/skeleton.test.tsx` passed 5 tests.

## 2026-06-21T22:08:00+0900 - design

- Result: Issue #129 설계에서 workspace refresh 중 좌우 sidebar가 빈 column처럼 보이는 상태를 skeleton loading UI로 대체하고, 저장된 한국어 display language가 hydrate되기 전 영어 workspace chrome이 먼저 보이는 flash를 막는 방향을 정리했다.
- Coverage: `I18nProvider`는 language hydration 완료 신호를 제공하고, language가 확정되기 전에는 sidebar/metadata의 user-facing text 대신 decorative shape skeleton만 보여준다. Language hydration 이후에는 localized stable chrome을 보여주되, workspace UI state 또는 sidebar child state가 아직 hydrate 중이면 recents/search/favorites rows, navigation body, metadata outline/list content를 좌에서 우로 흐르는 shimmer bar skeleton으로 표시한다. Issue #122의 closed sidebar child mount 지연과 workspace-scoped UI state 보존은 유지한다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #129, `docs/superpowers/specs/2026-06-21-sidebar-loading-skeleton-language-hydration-design.md`, user-approved visual direction B from brainstorming.
- Verification: spec self-review.

## 2026-06-21T22:24:00+0900 - plan

- Result: Issue #129 implementation plan을 TDD task 단위로 작성했다.
- Coverage: plan은 i18n hydration signal, shared shimmer skeleton primitive, sidebar loading shape components, `AppShell` hydration gate, `DocumentList` body skeleton, focused verification/wiki sync/manual browser smoke 순서로 구현을 나눈다. Subagent-driven execution을 전제로 task별 failing test, expected red/green commands, commit boundary를 포함한다.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-06-21-sidebar-loading-skeleton-language-hydration.md`, `docs/superpowers/specs/2026-06-21-sidebar-loading-skeleton-language-hydration-design.md`, GitHub issue #129.
- Verification: plan self-review for spec coverage, placeholder scan, and type consistency.

## 2026-06-21T22:19:38+0900 - implementation

- Result: Issue #129 Task 1 exposed an i18n hydration signal for language-sensitive workspace chrome.
- Coverage: `useI18n()` now returns `isHydrated`, which is false on the first client render with the default English language and true after `I18nProvider` reads browser storage/browser hints. The provider only updates `document.documentElement.lang` after hydration, and explicit language writes mark the context hydrated. Component coverage asserts that consumers can render loading text during the first render and never show English Settings chrome before saved Korean hydration completes.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #129, `components/i18n-provider.tsx`, `tests/components/i18n-provider.test.tsx`.
- Verification: red run `pnpm exec vitest run tests/components/i18n-provider.test.tsx -t "hide language-sensitive chrome"` failed with `isHydrated: undefined`; green run `pnpm exec vitest run tests/components/i18n-provider.test.tsx` passed 4 tests.

## 2026-06-21T21:16:00+0900 - implementation

- Result: Issue #126 Task 5 localized the remaining major workspace product chrome for English/Korean display language switching.
- Coverage: `lib/i18n/messages.ts` now includes login, nav/sidebar, tab/toolbar, metadata, folder, editor/properties/preview/wiki-link suggestion, and graph control keys. The affected React surfaces consume `useI18n()` so a saved Settings language change rerenders current labels, placeholders, empty states, accessible names, and control text without a reload. Empty document/tab fallback labels are translated at render time, while user-authored document titles, paths, provider/model ids, arbitrary frontmatter property keys, URLs, and developer/admin-only identifiers remain data/internal strings.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #126, `lib/i18n/messages.ts`, `app/login/login-form.tsx`, `components/app-shell.tsx`, `components/document-list.tsx`, `components/document-navigation.tsx`, `components/document-tabs.tsx`, `components/document-toolbar.tsx`, `components/folder-detail.tsx`, `components/metadata-panel.tsx`, `components/document-editor.tsx`, `components/document-editor/document-properties.tsx`, `components/document-editor/markdown-preview.tsx`, `components/document-editor/wiki-link-suggestions.tsx`, `components/knowledge-graph-view.tsx`, `lib/workspace-tree.ts`, `tests/components/login-form.test.tsx`, `tests/components/folder-detail.test.tsx`, `wiki/Document Editing Workflow.md`.
- Verification: focused component/i18n runs passed, `pnpm exec tsc --noEmit --pretty false` passed, `git diff --check` passed, and full `pnpm test` passed 74 files / 814 tests.

## 2026-06-21T20:30:32+0900 - implementation

- Result: Issue #126 Task 4 follow-up disambiguated the Ask AI opener and submit controls after code quality review.
- Coverage: `DocumentEditor` now keeps the opener's visible Ask AI affordance while giving it localized open/close accessible names, so the panel opener and the form submit button no longer share the same button name when the assistant is open. The message catalog now has separate English/Korean `ai.assistant.open` and `ai.assistant.close` keys, and component coverage asserts the open/close labels plus a single panel-local submit button.
- Pages: [[log|Wiki Log]].
- Source evidence: GitHub issue #126, `lib/i18n/messages.ts`, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec vitest run tests/components/thinking-indicator.test.tsx tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx tests/rag/prompt.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts`, `pnpm exec vitest run tests/i18n/messages.test.ts`, and `pnpm exec tsc --noEmit --pretty false` passed.

## 2026-06-21T19:05:00+09:00 - implementation

- Result: Provider-specific AI model presets, reset defaults, and settings dialog height were implemented.
- Coverage: `lib/rag/client-model-settings.ts` now exposes provider-filtered presets and reset defaults for OpenRouter/OpenAI/Ollama. `WorkspaceSettingsPanel` renders presets for the selected provider, keeps custom model id input, writes provider defaults on reset, and uses an 80vh dialog. Tests cover provider preset lists, reset defaults, UI preset switching, reset storage behavior, and dialog sizing.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/rag/client-model-settings.ts`, `components/workspace-settings-panel.tsx`, `tests/rag/client-model-settings.test.ts`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/rag/client-model-settings.test.ts tests/components/document-list.test.tsx --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-06-21T18:57:00+0900 - implementation

- Result: Issue #126 Task 4 localized Ask AI/Workspace AI default surfaces and threaded selected UI language into AI prompt plumbing.
- Coverage: `lib/i18n/messages.ts` now includes English/Korean Ask AI, Workspace AI, and thinking indicator keys. `DocumentEditor`, `ThinkingIndicator`, `AiAssistantPanel`, and `WorkspaceChatbot` render opener labels, placeholders, warnings, generic errors, empty state, and thinking text through `useI18n()`. Ask AI and Workspace AI POST bodies include current `uiLanguage`; routes parse it with `parseLanguage()` and ignore invalid values. `askDocumentQuestion()` and `prepareWorkspaceChatMessageStream()` pass valid UI language to `buildDirectDocumentPrompt()` / `buildRagPrompt()`, which localize fallback context phrases and add a model-facing selected UI language instruction while preserving the separate question-language-first answer instruction. Workspace chat retrieval still uses the original conversation question, not `uiLanguage`. Durable AI workflow pages now describe the catalog-backed thinking/status behavior and `uiLanguage` request/prompt flow instead of the old English-only thinking text.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[RAG Process Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #126, `lib/i18n/messages.ts`, `components/document-editor.tsx`, `components/ai/thinking-indicator.tsx`, `components/document-editor/ai-assistant-panel.tsx`, `components/workspace-chatbot.tsx`, `lib/rag/prompt.ts`, `lib/rag/ask.ts`, `lib/rag/workspace-chat.ts`, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `tests/components/thinking-indicator.test.tsx`, `tests/components/document-editor-preview.test.tsx`, `tests/components/workspace-chatbot.test.tsx`, `tests/rag/prompt.test.ts`, `tests/rag/ask-route.test.ts`, `tests/rag/workspace-chat-route.test.ts`, `wiki/Document Editing Workflow.md`, `wiki/Munjib.md`, `wiki/Project PRD.md`, `wiki/RAG Process Workflow.md`.
- Verification: red run `pnpm exec vitest run tests/components/thinking-indicator.test.tsx tests/rag/prompt.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts` failed on missing Korean thinking/fallback text and missing `uiLanguage` service pass-through; green runs `pnpm exec vitest run tests/components/thinking-indicator.test.tsx tests/rag/prompt.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts`, `pnpm exec vitest run tests/components/thinking-indicator.test.tsx tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx tests/rag/prompt.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts`, `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec vitest run tests/i18n/messages.test.ts`, and `pnpm exec tsc --noEmit --pretty false` passed.

## 2026-06-21T18:35:00+09:00 - design

- Result: Provider-specific AI model preset and reset behavior design was recorded.
- Coverage: Settings panel AI tab will render presets for the selected provider, keep custom model id input, reset OpenRouter to `google/gemma-4-31b-it:free`, reset OpenAI to `gpt-5.4-mini`, reset Ollama to `gemma4:e4b`, and fix the settings dialog height at 80vh with internal content scrolling.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/specs/2026-06-21-provider-model-presets-design.md`.
- Verification: spec self-review; pnpm wiki:manifest; pnpm wiki:lint.

## 2026-06-21T18:30:26+0900 - implementation

- Result: Issue #126 Task 3 implemented the Settings `Language` section.
- Coverage: `WorkspaceSettingsPanel` now consumes `useI18n()` for Settings copy, adds a left-nav Language tab, keeps a draft language separate from the applied browser language, highlights the current applied language until Save, supports disabled Save/Cancel when unchanged, applies the saved language immediately, and reports storage failure while keeping the tab alive. The Language options use native radio controls styled as cards, and Settings status messages store translation keys/state so visible status text can rerender in the current display language. The Settings import, AI, retention, retention policy option labels, and Markdown import progress labels now read from the English/Korean message catalog.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #126, `components/workspace-settings-panel.tsx`, `lib/i18n/messages.ts`, `tests/components/document-list.test.tsx`.
- Verification: initial red run `pnpm exec vitest run tests/components/document-list.test.tsx -t "Language settings"` failed because the Language tab was absent; green runs `pnpm exec vitest run tests/components/document-list.test.tsx -t "Language settings"`, `pnpm exec vitest run tests/components/document-list.test.tsx`, `pnpm exec vitest run tests/i18n/messages.test.ts`, `pnpm exec vitest run tests/i18n/messages.test.ts tests/components/document-list.test.tsx`, and `pnpm exec tsc --noEmit --pretty false` passed. Follow-up focused runs passed after adding native radio controls and display-language rerender coverage for saved retention status.

## 2026-06-21T18:20:00+09:00 - implementation

- Result: AI provider configuration failure diagnostics and provider override regression coverage were updated.
- Coverage: Handled AI unavailable capture now names `RAG_INVALID_CONFIG` events as `HandledAiConfigurationError`, while other provider/runtime failures keep `HandledAiUnavailableError`. Tests cover runtime chat provider overrides for official OpenAI and OpenRouter/OpenAI-compatible independently from the default Ollama provider, and official OpenAI model validation rejects OpenRouter-style model ids.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/observability/ai-unavailable.ts`, `tests/observability/ai-unavailable.test.ts`, `tests/rag/model-config.test.ts`, `tests/rag/client-model-settings.test.ts`.
- Verification: `pnpm exec vitest run tests/observability/ai-unavailable.test.ts tests/rag/model-config.test.ts tests/rag/client-model-settings.test.ts --reporter=dot`; `git diff --check`.

## 2026-06-21T17:20:00+09:00 - design

- Result: Runtime AI provider switching design was recorded for settings-driven Ask AI and Workspace AI provider changes.
- Coverage: Settings panel provider/model overrides remain client-side values, while Docker web runtime must carry server-side env for Ollama, official OpenAI, and OpenRouter/OpenAI-compatible if those providers are selectable. Default chat provider/model env is only fallback state and must not limit valid request overrides. Missing selected-provider config should be observable as `RAG_INVALID_CONFIG`; embedding stays independent with current Ollama `bge-m3` 1024 identity.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/specs/2026-06-21-runtime-ai-provider-switching-design.md`.
- Verification: spec self-review; pnpm wiki:manifest; pnpm wiki:lint.


## 2026-06-21T12:52:00+09:00 - implementation

- Result: Issue #122 workspace UI panel state persistence를 구현했다.
- Coverage: `lib/workspace-ui-state.ts`가 workspace-scoped aggregate `localStorage` key `munjib:workspace-ui:<workspaceSlug>:v1`와 strict validation/merge helper를 제공한다. `AppShell`은 좌우 sidebar open state를 restore/persist하고, stored closed sidebar contents are not mounted before workspace UI storage hydration so child storage effects cannot overwrite their own browser keys during the initial client commit. `DocumentList`는 마지막 명시적 Documents/Search/Favorites active panel을 보존한다. Graph route passive mount는 stored sidebar panel을 덮지 않는다. `KnowledgeGraphView`는 기존 graph filters/display/forces persistence를 `sessionStorage`에서 aggregate `localStorage` graph state로 옮기고 controls panel과 Filters/Display/Forces section open state도 저장한다. `WorkspaceChatbot`은 open/closed state만 per-workspace로 저장하며 stored open state에서는 hydration 이후 thread를 자동 load한다. DB schema, URL state, server APIs, chat drafts, pending requests, graph layout positions are unchanged.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #122, `docs/superpowers/specs/2026-06-21-workspace-ui-state-persistence-design.md`, `docs/superpowers/plans/2026-06-21-workspace-ui-state-persistence.md`, `lib/workspace-ui-state.ts`, `components/app-shell.tsx`, `components/document-list.tsx`, `components/knowledge-graph-view.tsx`, `components/workspace-chatbot.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/workspace-ui-state.test.ts`, `tests/components/app-shell.test.tsx`, `tests/components/document-list.test.tsx`, `tests/components/knowledge-graph-view.test.tsx`, `tests/components/workspace-chatbot.test.tsx`.
- Verification: `pnpm exec vitest run tests/workspace-ui-state.test.ts tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/components/workspace-chatbot.test.tsx --reporter=dot`; `pnpm run db:generate`; `pnpm exec tsc --noEmit --pretty false`; `pnpm wiki:manifest`; `pnpm wiki:lint`; `pnpm wiki:sync-check --staged`; `git diff --cached --check`.

## 2026-06-21T12:47:34+0900 - implementation

- Result: Issue #123 구현으로 신규 개발자용 [[Project Structure Onboarding]] wiki page를 추가했다.
- Coverage: 첫 1시간 루트, repository responsibility map, core runtime flow, data/source-of-truth table, feature-to-files guide, verification/wiki maintenance sequence를 한 page에 묶고 상세 설명은 기존 [[Munjib]], [[Document Knowledge Model]], [[Document Editing Workflow]], [[RAG Process Workflow]], [[Local Development Workflow]]로 연결했다.
- Pages: [[Project Structure Onboarding]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #123, `docs/superpowers/specs/2026-06-21-project-structure-onboarding-design.md`, `docs/superpowers/plans/2026-06-21-project-structure-onboarding-guide.md`, `wiki/Project Structure Onboarding.md`.
- Verification: `pnpm wiki:install-hooks`, `pnpm wiki:sync-plan --staged`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`, `git diff --check --cached`.

## 2026-06-21T11:55:11+0900 - design

- Result: Issue #123 설계에서 신규 개발자가 프로젝트 구조를 직관적으로 이해하도록 `wiki/Project Structure Onboarding.md`를 첫 1시간 진입 지도형 wiki page로 추가하는 방향을 정했다.
- Coverage: 문서는 first-hour path, repository responsibility map, runtime request-flow map, feature-to-files guide, data/knowledge source-of-truth summary, verification/wiki maintenance checklist를 포함하고 상세 설명은 기존 wiki page로 연결한다. 실제 onboarding page 생성은 spec review 후 implementation 단계에서 진행한다.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #123, `docs/superpowers/specs/2026-06-21-project-structure-onboarding-design.md`.
- Verification: spec self-review; `pnpm wiki:sync-plan --staged`, `git diff --check --cached`.

## 2026-06-21T11:45:30+0900 - design

- Result: Issue #122 workspace UI state persistence design was recorded before implementation.
- Coverage: The accepted design uses workspace-scoped `localStorage` for left/right sidebar open state, active Documents/Search/Favorites sidebar panel, knowledge graph controls and section open state, existing graph option groups, and Workspace AI chat open state. DB schema, URL state, server APIs, chat drafts, pending requests, and graph layout positions stay out of scope.
- Pages: [[Munjib]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #122, `docs/superpowers/specs/2026-06-21-workspace-ui-state-persistence-design.md`.
- Verification: spec self-review; implementation plan pending.

## 2026-06-20T16:58:00+09:00 - implementation

- Result: Implemented Issue #119 archived document retention settings and purge command.
- Coverage: Added DB-backed workspace retention policy with 30-day default, settings-panel Retention section, server action validation/error return, actor-membership-scoped retention updates, archived document purge service, incoming-link broken marking plus current affected-source markdown re-read/re-reconciliation around hard delete, CLI dry-run/delete modes, scoped workspace purge, duplicate workspace slug safety guards, and explicit follow-up boundaries for archived folders, attachment storage file cleanup, and production scheduling.
- Pages: [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Document Editing Workflow]], [[Local Development Workflow]], [[Next.js Prisma Monolith]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #119, `prisma/schema.prisma`, `lib/workspaces/retention-policy.ts`, `lib/workspaces/retention-service.ts`, `components/workspace-settings-panel.tsx`, `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `lib/documents/purge-archived.ts`, `lib/documents/purge-archived-cli.ts`, `scripts/documents/purge-archived.ts`, `package.json`, `tests/workspaces/retention-policy.test.ts`, `tests/workspaces/retention-service.test.ts`, `tests/documents/purge-archived.test.ts`, `tests/documents/purge-archived-cli.test.ts`, `tests/workspace-actions.test.ts`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/workspaces/retention-policy.test.ts tests/workspaces/retention-service.test.ts tests/documents/purge-archived.test.ts tests/documents/purge-archived-cli.test.ts tests/workspace-actions.test.ts tests/components/document-list.test.tsx`, `pnpm exec tsc --noEmit --pretty false`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-06-20T14:18:17+0900 - issue-116 workspace AI no-capture regression coverage

- Result: Issue #116 최종 review follow-up으로 Workspace AI route tests에 provider-unavailable Sentry event를 기록하지 않아야 하는 exclusion branches를 더 명시했다.
- Coverage: invalid chat model override, provider-only override, workspace-not-found, reset/shared error-response RAG failure, pre-stream archived race, aborted post-start stream failure가 `captureHandledAiUnavailable()`을 호출하지 않는지 검증한다.
- Pages: [[RAG Process Workflow]], [[Production Observability Workflow]], [[log|Wiki Log]].
- Source evidence: `tests/rag/workspace-chat-route.test.ts`.
- Verification: `pnpm exec vitest run tests/rag/workspace-chat-route.test.ts --reporter=dot`.

## 2026-06-20T13:35:00+09:00 - design

- Result: Issue #119 archived document retention purge settings design was recorded before implementation.
- Coverage: Workspace-level DB-backed retention policy presets (`Never`, `7 days`, `30 days`, `90 days`) with `30 days` default, settings-panel `Retention` section, CLI/tools purge execution, archived-document-only hard delete, and follow-up boundaries for archived folders and attachment storage files.
- Pages: [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Document Editing Workflow]], [[Next.js Prisma Monolith]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #119, `docs/superpowers/specs/2026-06-20-archived-document-retention-purge-settings-design.md`.
- Verification: pending implementation plan.

## 2026-06-20T12:55:02+0900 - issue-116 handled AI 503 Sentry capture implementation

- Result: Issue #116 구현으로 handled AI provider/runtime failure가 public `AI_UNAVAILABLE` contract를 유지하면서 Sentry에 sanitized event로 남는다.
- Coverage: `captureHandledAiUnavailable()`은 Ask AI pre-response 503, Workspace AI preparation 503, Workspace AI post-start NDJSON `AI_UNAVAILABLE` stream error를 surface별로 capture하고, validation/auth/archived-thread/client-abort는 provider unavailable event로 기록하지 않는다. Workspace AI route tests cover those no-capture paths, including aborted post-start streams. Captured metadata는 workspace slug, stable RAG error code, provider/model, status, stream-started flag로 제한하고, Sentry fingerprint는 handled AI unavailable marker, surface, stable RAG error code로 설정한다. Question, prompt, saved markdown, retrieved chunk text, answer, API key, base URL, headers, cookies, raw provider response body, original provider error object/cause는 제외한다.
- Pages: [[RAG Process Workflow]], [[Production Observability Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #116, `lib/observability/ai-unavailable.ts`, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/error-response.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `lib/rag/workspace-chat.ts`, `tests/observability/ai-unavailable.test.ts`, `tests/rag/ask-route.test.ts`, `tests/rag/workspace-chat-route.test.ts`.
- Verification: `pnpm exec vitest run tests/observability/ai-unavailable.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts tests/observability/sentry-config.test.ts tests/observability/sentry-scrub-event.test.ts tests/observability/sentry-files.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`; `pnpm wiki:manifest`; `pnpm wiki:lint`; `pnpm wiki:sync-check --staged`; `git diff --cached --check`.

## 2026-06-20T12:45:10+0900 - graph unresolved target visibility implementation

- Result: Default graph view now hides broken/ambiguous unresolved wiki target placeholders so non-document values are not rendered as graph nodes.
- Coverage: `filterKnowledgeGraph()` keeps wiki links only when both endpoints are actual document nodes, keeps tag edges only when `Tags` is enabled, and keeps isolated document nodes only when `Orphans` is enabled. `buildKnowledgeGraph()` remains the raw graph DTO builder and can still represent unresolved placeholder state for tests/model completeness.
- Pages: [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: user-reported default graph issue, `lib/knowledge-graph/model.ts`, `tests/knowledge-graph/model.test.ts`, `tests/components/knowledge-graph-view.test.tsx`, `docs/superpowers/specs/2026-06-20-knowledge-graph-hide-unresolved-targets-design.md`.
- Verification: `pnpm exec vitest tests/knowledge-graph/model.test.ts tests/components/knowledge-graph-view.test.tsx --run`, `pnpm exec tsc --noEmit --pretty false`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-06-20T12:35:38+0900 - issue-116 handled AI 503 Sentry capture design

- Result: Issue #116 설계에서 OpenRouter/OpenAI provider 전환 중 발생하는 handled `AI_UNAVAILABLE` 503을 public response는 유지하고 Sentry에는 privacy-safe event로 명시 capture하는 방향을 정했다.
- Coverage: Ask AI route, workspace chat preparation 503, workspace chat post-start NDJSON `AI_UNAVAILABLE` error event를 모두 관측 대상으로 잡고, question/prompt/context/answer/document body/API key/base URL/provider response body는 Sentry event에 넣지 않는 privacy boundary를 명시했다.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #116, `docs/superpowers/specs/2026-06-20-ai-provider-503-sentry-capture-design.md`, `docs/superpowers/plans/2026-06-20-ai-provider-503-sentry-capture.md`, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/error-response.ts`, `lib/rag/answer-chain.ts`.
- Verification: spec and implementation plan self-review; `pnpm wiki:manifest`, `pnpm wiki:lint`, and `pnpm wiki:sync-check --staged`.

## 2026-06-20T12:28:27+0900 - graph unresolved target visibility design

- Result: 기본 graph view에서 실제 문서가 아닌 broken/ambiguous wiki target placeholder를 숨기는 후속 설계를 정리했다.
- Coverage: `buildKnowledgeGraph()` raw DTO가 unresolved wiki target placeholder를 만들 수 있는 것은 모델상 모순이 아니지만, visible graph filtering은 resolved document-to-document wiki edge만 기본 표시하고 `Orphans`는 기존처럼 isolated document node만 제어한다는 contract를 기록했다. Tags는 opt-in filter로 유지한다.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: user-reported graph default visibility issue, `lib/knowledge-graph/model.ts`, `tests/knowledge-graph/model.test.ts`, `docs/superpowers/specs/2026-06-20-knowledge-graph-hide-unresolved-targets-design.md`.
- Verification: spec self-review, `git diff --check`, `pnpm wiki:install-hooks`, `pnpm wiki:sync-plan --staged`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-06-20T12:03:34+0900 - markdown import filename title implementation

- Result: Issue #113의 file-name-first Markdown import title contract를 실제 구현과 테스트에 반영했다.
- Coverage: `deriveMarkdownImportTitle()`는 이제 extension-stripped file name을 먼저 사용하고, file name에서 title 후보를 만들 수 없을 때만 frontmatter `title`, 첫 ATX H1, `Untitled` 순서로 fallback한다. Wiki 문서의 current behavior 설명도 구현 완료 상태에 맞췄다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: PR #115 review feedback, `lib/documents/import-markdown.ts`, `tests/documents/import-markdown.test.ts`, `wiki/Markdown Import And Clipboard Paste Workflow.md`.
- Verification: `pnpm exec vitest tests/documents/import-markdown.test.ts tests/wiki-links/parser.test.ts tests/wiki-links/reconcile.test.ts --run`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-06-20T11:27:45+0900 - stale broken frontmatter link repair

- Result: Target 문서가 source 문서보다 나중에 생성되어 기존 frontmatter `links:` row가 broken 상태로 남는 문제를 고쳤다.
- Coverage: `createDocument()`, `updateDocument()`, `restoreDocumentVersion()`, `moveDocument()`, and folder rename/move descendant path updates use saved documents as targets to re-evaluate workspace broken `DocumentLink` rows with the current `resolveWikiLinkTarget()` rules, and repair only rows whose source document still has the same target in current frontmatter `links:` and resolves to one active target. Folder descendant path updates repair changed document ids in one batch instead of rescanning the workspace once per document. Frontmatter `links:` plain-title fallback also excludes Markdown external link values such as `[Runbook](https://example.com)`. Local DB dry-run에서는 broken rows 85개 중 57개가 repair 가능했고, `Munjib` target row 9개를 포함해 모두 backfill했다.
- Pages: [[Wiki Links And Backlinks]], [[Document Editing Workflow]], [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: user-reported `Munjib` frontmatter link issue, local DB probe, `lib/wiki-links/reconcile.ts`, `lib/documents/service.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest tests/wiki-links/reconcile.test.ts --run`; broader GREEN with `pnpm exec vitest tests/wiki-links/parser.test.ts tests/wiki-links/reconcile.test.ts --run`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-06-20T01:01:48+0900 - frontmatter plain-title link reconciliation

- Result: YAML frontmatter `links:` 배열의 plain title string이 existing document title과 matching되어도 link row가 생성되지 않던 문제를 고쳤다.
- Coverage: `parseFrontmatterWikiLinks()`는 `[[Target]]`/`[[Target|Alias]]` syntax를 계속 지원하면서, wiki syntax가 없는 string value를 alias 없는 internal target title로 정규화한다. Embed-style `![[...]]`, heading-only/empty target, and external URL-like frontmatter values remain excluded. Reconciliation, outgoing links, and backlinks now resolve `links: ["Runbook"]` through the same title/path/underscore matching rules as `links: ["[[Runbook]]"]`.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: user-reported frontmatter links issue, `lib/wiki-links/parser.ts`, `tests/wiki-links/parser.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest tests/wiki-links/parser.test.ts tests/wiki-links/reconcile.test.ts --run`.

## 2026-06-19T23:45:45+0900 - issue-113 markdown import filename title design

- Result: Issue #113 설계에서 Markdown import title priority를 file-name-first로 정했다.
- Coverage: `deriveMarkdownImportTitle()`는 구현 단계에서 확장자를 제거한 file name을 1순위로 사용하고, frontmatter `title`과 첫 ATX H1은 file name에서 비어 있지 않은 title을 만들 수 없을 때만 fallback으로 남긴다. Import action, batch flow, destination folder, body persistence, duplicate title/path behavior는 변경하지 않는다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #113, `docs/superpowers/specs/2026-06-19-markdown-import-filename-title-design.md`, `docs/superpowers/plans/2026-06-19-markdown-import-filename-title-priority.md`, `lib/documents/import-markdown.ts`, `tests/documents/import-markdown.test.ts`.
- Verification: spec self-review, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-06-18T00:27:00+0900 - issue-105 PR review streaming abort follow-up

- Result: PR #112 review follow-up reduced Workspace AI stream overhead and hardened abort/cancel behavior across server and client.
- Coverage: `streamAnswerChain()` now extracts string content directly from stream chunks instead of invoking the LangChain output parser per token. `/assistant/messages` passes `request.signal` into preparation and streaming, preparation checks abort state before expensive indexing/embedding/search steps, response writes after cancellation become no-op, and `sendPreparedWorkspaceChatMessageStream()` skips persistence when the signal is aborted before finalization. `WorkspaceChatbot` removes the pending optimistic turn when reset aborts an active stream even if the reset request fails.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: PR #112 review threads, `lib/rag/answer-chain.ts`, `lib/rag/workspace-chat.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `components/workspace-chatbot.tsx`, streaming regression tests.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/answer-chain.test.ts tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx --reporter=dot`.

## 2026-06-18T00:13:09+0900 - issue-105 workspace chat stream hardening

- Result: Workspace AI client stream handling now blocks submit-time duplicate sends while an answer is active and treats NDJSON EOF without `done` or `error` as an incomplete stream.
- Coverage: `WorkspaceChatbot` checks loading/current active send in the submit handler so pressing Enter in the enabled input cannot start a second `/assistant/messages` request while a stream is pending. `readWorkspaceChatStream()` throws `WORKSPACE_CHAT_STREAM_INCOMPLETE` when a stream closes without terminal `done` or `error`, and the UI removes optimistic plus partial assistant content before showing `Workspace AI is unavailable.`.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: Task 4 code review, `components/workspace-chatbot-stream.ts`, `components/workspace-chatbot.tsx`, `tests/components/workspace-chatbot.test.tsx`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/components/workspace-chatbot.test.tsx --reporter=dot`; broader GREEN with `pnpm exec vitest run tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-06-18T00:06:19+0900 - issue-105 workspace chat client stream rendering

- Result: Workspace AI client sends now consume `/assistant/messages` as `application/x-ndjson` instead of JSON.
- Coverage: `readWorkspaceChatStream()` validates `start`, `token`, `done`, and `error` events across chunk boundaries. `WorkspaceChatbot` posts with `AbortController.signal`, aborts active sends on reset/workspace cleanup, streams tokens into an assistant placeholder, hides `Thinking...` after the first token, replaces the placeholder with authoritative `done` content/citations, and removes optimistic/partial messages on stream or fetch errors.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #105, `components/workspace-chatbot-stream.ts`, `components/workspace-chatbot.tsx`, `tests/components/workspace-chatbot.test.tsx`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/components/workspace-chatbot.test.tsx --reporter=dot`; broader GREEN with `pnpm exec vitest run tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-06-17T23:58:40+0900 - issue-105 workspace chat route stream review fix

- Result: Workspace AI stream route review fixes preserved post-start archived-thread failures as `THREAD_ARCHIVED` NDJSON error events and added `no-transform` to streaming cache-control.
- Coverage: Other post-start send failures still stream `AI_UNAVAILABLE` with HTTP 200, while successful stream responses now use `cache-control: no-cache, no-transform`.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: Task 3 code review, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `tests/rag/workspace-chat-route.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/workspace-chat-route.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-06-17T23:52:40+0900 - issue-105 workspace chat route NDJSON stream

- Result: `/api/workspaces/[workspaceSlug]/assistant/messages` now returns `application/x-ndjson` for successful Workspace AI sends after validation and preparation.
- Coverage: The route calls `prepareWorkspaceChatMessageStream()` before constructing the stream, keeps validation and preparation failures as JSON responses with existing status codes, emits `start`, raw `token`, and authoritative persisted `done` events, and maps post-start send failures to an `AI_UNAVAILABLE` error event with HTTP 200.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #105, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `tests/rag/workspace-chat-route.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/workspace-chat-route.test.ts --reporter=dot`; broader GREEN with `pnpm exec vitest run tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-route.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-06-17T23:43:19+0900 - issue-105 workspace chat streaming service

- Result: Workspace AI service now has a prepared streaming path that shares retrieval, prompt, provider/model validation, normalization, and persistence with the existing non-streaming send path.
- Coverage: `prepareWorkspaceChatMessageStream()` prepares the active thread, memory-aware query, retrieval candidates, prompt, citation chunk ids, Langfuse trace metadata, chat model, and effective model name. `sendPreparedWorkspaceChatMessageStream()` calls `streamAnswerChain()` with `onToken` and persists only after final answer generation succeeds. `sendWorkspaceChatMessage()` remains compatible as the non-streaming wrapper over the same preparation and persistence helpers, and partial streaming failures leave no orphan messages.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #105, `lib/rag/workspace-chat.ts`, `tests/rag/workspace-chat.test.ts`, `lib/rag/answer-chain.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/workspace-chat.test.ts --reporter=dot`; broader GREEN with `pnpm exec vitest run tests/rag/answer-chain.test.ts tests/rag/workspace-chat.test.ts --reporter=dot`.

## 2026-06-17T23:38:00+0900 - issue-105 answer-chain streaming seam

- Result: Workspace AI streaming implementation started with an answer-chain seam for LangChain chat model token streams.
- Coverage: `streamAnswerChain()` shares prompt construction and invocation config with `invokeAnswerChain()`, forwards callbacks/metadata/tags to `chatModel.stream()`, emits non-empty parsed tokens through `onToken`, accumulates the final answer, and maps provider failures or empty output to the stable `CHAT_REQUEST_FAILED` code. Route NDJSON events and client rendering remain in the same Issue #105 follow-up.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #105, `lib/rag/answer-chain.ts`, `tests/rag/answer-chain.test.ts`.
- Verification: `pnpm exec vitest run tests/rag/answer-chain.test.ts --reporter=dot`.

## 2026-06-17T23:18:00+0900 - issue-105 chatbot response streaming design

- Result: Issue #105 streaming scope was narrowed to Workspace AI answer-body streaming over newline-delimited JSON on the existing `/assistant/messages` POST route.
- Coverage: The design keeps pre-stream validation errors as JSON responses, streams only answer tokens plus final persisted assistant message/citations, preserves reset/workspace-change guards, and leaves Ask AI streaming out of scope. The follow-up implementation plan breaks the work into answer-chain streaming, workspace chat service preparation/finalization, NDJSON route events, client stream rendering, wiki updates, and PR review closure.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #105, user-approved brainstorming, `docs/superpowers/specs/2026-06-17-chatbot-response-streaming-design.md`, `docs/superpowers/plans/2026-06-17-chatbot-response-streaming.md`.
- Verification: spec self-review before implementation planning.

## 2026-06-17T00:37:05+0900 - PR #110 provider override config review fix

- Result: Ask AI and Workspace AI service-level provider overrides no longer read the default chat provider config before applying a complete override.
- Coverage: `askDocumentQuestion()` and `sendWorkspaceChatMessage()` reject provider-only service inputs, still support model-only legacy overrides through the default provider, and build complete provider+model overrides directly from the selected provider's server-side config.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: PR #110 review thread, `lib/rag/ask.ts`, `lib/rag/workspace-chat.ts`, `tests/rag/ask.test.ts`, `tests/rag/workspace-chat.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts --reporter=dot`.

## 2026-06-17T00:24:30+0900 - workspace chat memory summary

- Result: Workspace AI now persists a rolling thread memory summary instead of dropping long conversation history when the retrieval query would exceed the embedding budget.
- Coverage: `AiChatThread.memorySummary` and `memoryUpdatedAt` store summarized conversation memory. `sendWorkspaceChatMessage()` refreshes memory only when the unsummarized recent history plus current message exceeds 6,000 characters, merges old memory with new excerpts through a `conversation memory summarizer` prompt, reuses existing memory in retrieval/prompt context, and avoids re-summarizing messages older than `memoryUpdatedAt`.
- Pages: [[Document Knowledge Model]], [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #111, user request, `prisma/schema.prisma`, `prisma/migrations/20260617002000_add_ai_chat_thread_memory/migration.sql`, `lib/rag/workspace-chat.ts`, `tests/rag/workspace-chat.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/workspace-chat.test.ts --reporter=dot`.

## 2026-06-16T23:56:46+0900 - workspace chat embedding query cap

- Result: Workspace AI no longer sends unbounded conversation history to the embedding model, preventing Ollama `the input length exceeds the context length` failures during retrieval.
- Coverage: `buildConversationQuestion()` now caps the conversation-aware retrieval query at 6,000 characters, keeps the newest history first, strips old citation markers, and always preserves the current user message before `embedText()`.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: user-reported local Workspace AI error, `lib/rag/workspace-chat.ts`, `tests/rag/workspace-chat.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/workspace-chat.test.ts --reporter=dot`.

## 2026-06-16T23:46:10+0900 - PR #110 route override validation review fix

- Result: PR #110 review feedback was addressed by hardening Ask AI request parsing for `null`/non-object JSON and rejecting provider-only chat overrides before service invocation.
- Coverage: Ask AI normalizes malformed or non-object JSON into the missing-question path; Ask AI and workspace chat routes now require `chatProvider` to be paired with `chatModel`, while model-only legacy overrides remain supported.
- Pages: [[RAG Process Workflow]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #110 review threads, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `tests/rag/ask-route.test.ts`, `tests/rag/workspace-chat-route.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts --reporter=dot`; broader GREEN with `pnpm exec vitest run tests/rag/client-model-settings.test.ts tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`; `git diff --check`.

## 2026-06-16T23:37:46+0900 - AI settings provider visibility follow-up

- Result: Workspace settings keeps direct model-id input for every provider, hides OpenRouter static presets unless `openai-compatible` is selected, and scopes saved custom model shortcuts to the selected provider.
- Coverage: Workspace AI now shows the effective model id in the chat panel, matching the Ask AI model visibility while continuing to send the same optional provider+model override fields.
- Pages: [[RAG Process Workflow]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: user clarification, `components/workspace-settings-panel.tsx`, `components/workspace-chatbot.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/components/document-list.test.tsx`, `tests/components/workspace-chatbot.test.tsx`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/components/document-list.test.tsx tests/components/workspace-chatbot.test.tsx --reporter=dot`; broader GREEN with `pnpm exec vitest run tests/rag/client-model-settings.test.ts tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts --reporter=dot`.

## 2026-06-16T23:23:36+0900 - AI settings provider and custom model presets

- Result: Workspace settings AI tab now stores provider+model overrides instead of only model ids, and `Save custom model` registers the current provider+model pair in a workspace-local custom list.
- Coverage: Provider selector supports Ollama, OpenAI, and OpenRouter/OpenAI-compatible; static presets now include the requested OpenRouter free model ids; Ask AI and workspace chatbot send optional `chatProvider` plus `chatModel`; services rebuild answer-generation chat config from server-side provider env while keeping embedding/index config fixed.
- Pages: [[RAG Process Workflow]], [[Local Development Workflow]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #109, user request, `lib/rag/client-model-settings.ts`, `components/workspace-settings-panel.tsx`, `components/document-editor/ai-assistant-panel.tsx`, `components/workspace-chatbot.tsx`, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `lib/rag/model-config.ts`, `lib/rag/ask.ts`, `lib/rag/workspace-chat.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/client-model-settings.test.ts tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`; `git diff --check`.

## 2026-06-16T23:03:19+0900 - OpenRouter free model id validation message

- Result: Workspace settings AI tab no longer presents provider-incompatible OpenRouter model ids such as `google/gemma-4-31b-it:free` as a generic malformed id.
- Coverage: Client chat model validation now separates malformed model ids from `INCOMPATIBLE_CHAT_MODEL_PROVIDER`; the settings panel maps provider mismatch to an explicit OpenAI-compatible provider requirement while keeping invalid id format errors unchanged.
- Pages: [[RAG Process Workflow]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: user-reported settings panel error, `lib/rag/client-model-settings.ts`, `components/workspace-settings-panel.tsx`, `tests/rag/client-model-settings.test.ts`, `tests/components/document-list.test.tsx`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/client-model-settings.test.ts tests/components/document-list.test.tsx --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`; `git diff --check`.

## 2026-06-16T01:22:00+0900 - AI provider override and Langfuse 503 diagnosis

- Result: Production AI 503 was traced to OpenRouter-style model ids being sent while the server chat provider was still `ollama`; Langfuse was not recording because production Langfuse credentials/base URL were empty and capture remained metadata-only.
- Coverage: Browser model storage now ignores known provider-incompatible OpenRouter model overrides for non-`openai-compatible` providers, while preserving namespaced Ollama model ids; Ask AI and workspace chatbot requests pass overrides only when compatible, and both services reject known incompatible overrides as `INVALID_CHAT_MODEL` before model invocation.
- Pages: [[RAG Process Workflow]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: production Docker web logs, production env shape, `lib/rag/client-model-settings.ts`, `lib/rag/ask.ts`, `lib/rag/workspace-chat.ts`, `components/document-editor/ai-assistant-panel.tsx`, `components/workspace-chatbot.tsx`, `components/workspace-settings-panel.tsx`.
- Verification: `pnpm exec tsc --noEmit --pretty false`; `DATABASE_URL='postgresql://obsidian:obsidian@localhost:55432/obsidian_clone?schema=public' pnpm exec vitest run tests/rag/client-model-settings.test.ts tests/rag/ask.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-route.test.ts tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx`.

## 2026-06-16T00:31:00+0900 - issue-104 workspace chat review ordering follow-up

- Result: PR #106의 추가 Codex review feedback으로 selected-document backfill cap, persisted turn ordering, history citation namespace 문제를 보강했다.
- Coverage: `selectIndexBackfillDocuments()`는 selected-document referential prompt에서 readable selected document를 lexical top-8 cap 밖에서도 backfill 후보로 보존한다. `orderedMessagesForDisplay()`는 동일 `createdAt` turn에서 `USER`를 `ASSISTANT`보다 먼저 정렬하고, conversation-aware retrieval/prompt history는 이전 assistant answer의 numeric citation marker를 제거해 새 prompt citation 번호와 충돌하지 않게 한다.
- Pages: [[RAG Process Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #106 review threads, `lib/rag/workspace-chat.ts`, `tests/rag/workspace-chat.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/workspace-chat.test.ts --reporter=dot`.

## 2026-06-16T00:00:48+0900 - attachment missing file response

- Result: Attachment image requests no longer return raw 500 errors when the DB row exists but the file is missing from `storage/attachments`.
- Coverage: `getReadableAttachment()` maps missing local storage files (`ENOENT`/`ENOTDIR`) to `ATTACHMENT_NOT_FOUND`, and `/api/attachments/<id>` maps missing/read-forbidden attachment reads to 404 JSON responses. This covers local/Docker storage volume mismatch and stale attachment markdown URLs without leaking filesystem paths in the response.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: user-reported `/api/attachments/*` ENOENT stack trace, `lib/attachments/service.ts`, `app/api/attachments/[attachmentId]/route.ts`, `lib/service-errors.ts`, `tests/attachments/service.test.ts`, `tests/attachments/route.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/attachments/service.test.ts tests/attachments/route.test.ts`.

## 2026-06-15T23:50:34+0900 - issue-104 citation display and source link follow-up

- Result: Ask AI와 workspace chatbot의 source display를 사용자 기준으로 정규화하고 source click navigation과 Markdown answer rendering을 보강했다.
- Coverage: `normalizeAnswerCitations()`는 answer text에 실제로 등장한 citation만 남기고 prompt/chunk 내부 번호를 answer 등장 순서의 `1..n` display number로 다시 쓴다. `askDocumentQuestion()`과 `sendWorkspaceChatMessage()`는 정규화된 answer/citations를 반환하거나 저장한다. `components/ai/answer.tsx`는 Ask AI panel과 workspace chatbot이 공유하는 Markdown answer renderer와 clickable citation list를 제공하며, citation의 `documentId`가 있으면 workspace document URL로 이동한다.
- Pages: [[RAG Process Workflow]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: user-reported source-number/source-link/Markdown rendering issue, `lib/rag/prompt.ts`, `lib/rag/ask.ts`, `lib/rag/workspace-chat.ts`, `components/ai/answer.tsx`, `components/document-editor/ai-assistant-panel.tsx`, `components/workspace-chatbot.tsx`, `tests/rag/prompt.test.ts`, `tests/rag/ask.test.ts`, `tests/rag/workspace-chat.test.ts`, `tests/components/document-editor-preview.test.tsx`, `tests/components/workspace-chatbot.test.tsx`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/prompt.test.ts`, `pnpm exec vitest run tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts`, and `pnpm exec vitest run tests/components/workspace-chatbot.test.tsx tests/components/document-editor-preview.test.tsx`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-06-15T23:16:06+0900 - issue-104 pr review prompt persistence follow-up

- Result: PR #106의 추가 review feedback으로 selected-document referential backfill, failed turn persistence, direct-context citation labeling을 보강했다.
- Coverage: `buildCurrentDocumentContext()` now returns labeled context blocks and `buildDirectDocumentPrompt()` uses them so each current-document section content is adjacent to its `[n]` citation label. `sendWorkspaceChatMessage()` includes a readable selected document in backfill candidates for document-referential prompts such as "Summarize this document", and user/assistant chat messages are persisted together only after answer generation succeeds to avoid orphan failed USER turns.
- Pages: [[RAG Process Workflow]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #106 review threads, `lib/rag/document-context.ts`, `lib/rag/prompt.ts`, `lib/rag/workspace-chat.ts`, `tests/rag/prompt.test.ts`, `tests/rag/workspace-chat.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/prompt.test.ts tests/rag/workspace-chat.test.ts`; follow-up GREEN with `pnpm exec vitest run tests/rag/document-context.test.ts tests/rag/ask.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-06-15T23:10:42+0900 - issue-104 pr review retrieval context follow-up

- Result: PR #106의 남은 actionable review feedback 중 workspace chatbot error handling, selected-document retrieval cap, oversized headed context packing 항목을 보강했다.
- Coverage: `WorkspaceChatbot`의 thread load/reset recoverable error handling은 regression tests로 고정했다. `sendWorkspaceChatMessage()`는 global readable chunk search와 selected-document-only search를 병합해 selected document chunks가 global top-60 밖이어도 prompt 후보에 남게 한다. `buildCurrentDocumentContext()`는 budget보다 큰 headed section을 paragraph chunks로 나누고 answer-relevant chunk만 선택하며, positive-score 후보가 있으면 score 0 filler sections를 context budget에 넣지 않는다.
- Pages: [[RAG Process Workflow]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #106 review threads, `components/workspace-chatbot.tsx`, `lib/rag/document-context.ts`, `lib/rag/workspace-chat.ts`, `tests/components/workspace-chatbot.test.tsx`, `tests/rag/document-context.test.ts`, `tests/rag/workspace-chat.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/components/workspace-chatbot.test.tsx tests/rag/document-context.test.ts tests/rag/workspace-chat.test.ts`.

## 2026-06-15T23:04:45+0900 - issue-104 workspace ai retrieval and citation follow-up

- Result: Workspace AI가 Welcome chunk만 검색하고 무관한 source를 표시하던 local regression을 보정했다.
- Coverage: Local `company-handbook` DB 상태는 active documents 219개 대비 `DocumentChunk` 1개, 그 1개가 Welcome 문서인 상태였으므로 workspace chatbot retrieval 후보가 Welcome으로 고정될 수 있었다. `sendWorkspaceChatMessage()`는 이제 conversation-aware query와 readable documents의 lexical overlap으로 missing/stale chunks를 최대 8개 targeted refresh한 뒤 vector search를 실행한다. Readable selected document chunks는 top vector result와 충분히 가까울 때만 prompt cap 전에 우선 배치하고, Ask AI와 workspace chatbot 모두 answer text에 실제로 등장한 `[n]` citation만 returned/persisted citations로 남긴다.
- Pages: [[RAG Process Workflow]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: user-reported Workspace AI test result, local DB probe, `lib/rag/prompt.ts`, `lib/rag/ask.ts`, `lib/rag/workspace-chat.ts`, `tests/rag/prompt.test.ts`, `tests/rag/ask.test.ts`, `tests/rag/workspace-chat.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/prompt.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts`.

## 2026-06-15T22:32:20+0900 - issue-104 pr review retrieval follow-up

- Result: PR #106 review follow-up으로 direct Ask와 workspace chatbot retrieval robustness를 보강했다.
- Coverage: `askDocumentQuestion()` now uses chat/Langfuse generation config without validating embedding env, direct Ask Langfuse metadata omits embedding fields, `buildCurrentDocumentContext()` splits long no-heading documents into paragraph chunks before selecting context, and `sendWorkspaceChatMessage()` embeds the recent conversation plus current message for retrieval.
- Pages: [[RAG Process Workflow]], [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #106 review threads, `lib/rag/model-config.ts`, `lib/rag/ask.ts`, `lib/rag/langfuse.ts`, `lib/rag/document-context.ts`, `lib/rag/workspace-chat.ts`, `tests/rag/model-config.test.ts`, `tests/rag/ask.test.ts`, `tests/rag/langfuse.test.ts`, `tests/rag/document-context.test.ts`, `tests/rag/workspace-chat.test.ts`.
- Verification: RED then GREEN with `pnpm exec vitest run tests/rag/model-config.test.ts tests/rag/langfuse.test.ts tests/rag/ask.test.ts tests/rag/document-context.test.ts tests/rag/workspace-chat.test.ts --reporter=dot`.

## 2026-06-15T22:15:40+0900 - issue-104 chatbot model override follow-up

- Result: Workspace chatbot now honors the same settings-panel chat model override as Ask AI.
- Coverage: `WorkspaceChatbot` reads and subscribes to the workspace-scoped `munjib:rag-chat-model:<workspaceSlug>` override, `/assistant/messages` validates optional `chatModel` before calling the service, and `sendWorkspaceChatMessage()` changes only `chat.model` while preserving server-side provider credentials, base URL, and the embedding index identity.
- Pages: [[RAG Process Workflow]], [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/workspace-chatbot.tsx`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `lib/rag/workspace-chat.ts`, `tests/components/workspace-chatbot.test.tsx`, `tests/rag/workspace-chat-route.test.ts`, `tests/rag/workspace-chat.test.ts`.
- Verification: RED first with `pnpm exec vitest run tests/components/workspace-chatbot.test.tsx tests/rag/workspace-chat-route.test.ts tests/rag/workspace-chat.test.ts --reporter=dot`, then GREEN with the same command.

## 2026-06-15T21:52:48+0900 - issue-104 selected document retrieval review

- Result: PR #106 review follow-up으로 workspace chatbot retrieval이 readable selected document chunks를 prompt cap 전에 우선 배치하도록 보강했다.
- Coverage: `sendWorkspaceChatMessage()`는 selected document id가 readable document set에 있을 때 해당 chunks를 stable하게 앞쪽으로 재정렬한 뒤 기존 prompt cap 12개, 문서당 3개 제한을 적용한다. Readable하지 않은 selected document id는 metadata와 priority에 반영하지 않는다.
- Pages: [[RAG Process Workflow]], [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #106 review thread, `lib/rag/workspace-chat.ts`, `tests/rag/workspace-chat.test.ts`.
- Verification: `pnpm exec vitest run tests/rag/workspace-chat.test.ts --reporter=dot`.

## 2026-06-15T19:32:52+0900 - issue-104 workspace chatbot api ui

- Result: Issue #104 UI/API slice로 workspace chatbot의 authenticated API routes와 우측 하단 floating chatbot panel을 추가했다.
- Coverage: `/assistant/thread`는 active thread와 history를 load하고, `/assistant/messages`는 trimmed message와 optional selected document id를 받아 workspace RAG answer를 생성하며, `/assistant/thread/reset`은 active thread를 archive한다. Shared error mapper는 workspace not found, blank message, archived-thread race, RAG runtime failure를 stable JSON status로 정규화한다. `WorkspaceChatbot`은 fixed launcher, compact panel, active thread load, send/reset controls, citations, Thinking indicator, workspace-change isolation, delayed thread/send response guard, reset-pending disabled state를 제공한다.
- Pages: [[RAG Process Workflow]], [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #104, `app/api/workspaces/[workspaceSlug]/assistant/thread/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/thread/reset/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/error-response.ts`, `components/workspace-chatbot.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/rag/workspace-chat-route.test.ts`, `tests/components/workspace-chatbot.test.tsx`.
- Verification: `pnpm exec vitest run tests/rag/workspace-chat-route.test.ts tests/rag/ask-route.test.ts tests/components/workspace-chatbot.test.tsx tests/components/thinking-indicator.test.tsx tests/components/document-editor-preview.test.tsx --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`; `git diff --check`.

## 2026-06-15T19:06:48+0900 - issue-104 ask direct and chatbot service

- Result: Issue #104 backend slice로 Ask AI service를 current-document direct context path로 전환하고 workspace chatbot RAG service를 추가했다.
- Coverage: `askDocumentQuestion()`은 selected active document와 permission만 읽고 `buildCurrentDocumentContext()` / `buildDirectDocumentPrompt()`로 답변해 selected document indexing, question embedding, vector search, graph-aware retrieval, rerank를 호출하지 않는다. `sendWorkspaceChatMessage()`는 active thread create/reuse, user/assistant message persistence, readable `DocumentChunk` retrieval, recent conversation prompt, Langfuse metadata, reset/archive를 처리하며 delayed answer가 archived thread에 저장되지 않도록 active-thread transaction guard를 둔다.
- Pages: [[RAG Process Workflow]], [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #104, `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`, `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`, `lib/rag/ask.ts`, `lib/rag/prompt.ts`, `lib/rag/workspace-chat.ts`, `tests/rag/ask.test.ts`, `tests/rag/prompt.test.ts`, `tests/rag/workspace-chat.test.ts`.
- Verification: `pnpm exec vitest run tests/rag/document-context.test.ts tests/rag/prompt.test.ts tests/rag/ask.test.ts tests/rag/ask-route.test.ts tests/rag/langfuse.test.ts tests/rag/workspace-chat.test.ts --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-06-15T18:25:00+0900 - issue-104 first implementation slice

- Result: Issue #104 첫 구현 slice로 Ask AI current-document context packer, 공통 AI thinking indicator, workspace chatbot thread/message persistence schema를 추가했다.
- Coverage: `buildCurrentDocumentContext()`는 frontmatter 제거, heading-aware section packing, fenced code heading 제외, nested heading path, oversized section order 보존을 담당한다. `ThinkingIndicator`는 Ask AI pending state에 영어 elapsed-time status를 표시한다. `AiChatThread`/`AiChatMessage`는 사용자+workspace 대화 이력을 저장하며 PostgreSQL partial unique index가 user+workspace별 active thread를 하나로 제한한다.
- Pages: [[RAG Process Workflow]], [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Document Editing Workflow]], [[Next.js Prisma Monolith]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #104, `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`, `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`, `lib/rag/document-context.ts`, `components/ai/thinking-indicator.tsx`, `components/document-editor/ai-assistant-panel.tsx`, `prisma/schema.prisma`, `prisma/migrations/20260615120000_add_ai_chat_threads/migration.sql`, `tests/rag/document-context.test.ts`, `tests/components/thinking-indicator.test.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec tsc --noEmit --pretty false`, `pnpm exec prisma validate`, `pnpm exec vitest run tests/rag/document-context.test.ts tests/components/thinking-indicator.test.tsx tests/components/document-editor-preview.test.tsx --reporter=dot`.

## 2026-06-15T11:55:00+0900 - issue-104 ai assistant chatbot plan

- Result: Issue #104 구현 계획을 추가했다.
- Coverage: 계획은 Ask AI current-document context packer, direct-context prompt/service 전환, 공통 Thinking indicator, `AiChatThread`/`AiChatMessage` schema, workspace chatbot service/API/UI, verification/wiki cleanup 순서로 TDD task를 나눈다. Chatbot response streaming은 Issue #105 follow-up으로 유지한다.
- Pages: [[Munjib]], [[Project PRD]], [[RAG Process Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`, GitHub issue #104.
- Verification: plan self-review for spec coverage, placeholders, and type consistency; `git diff --check`.

## 2026-06-15T11:40:00+0900 - issue-105 chatbot streaming split

- Result: Chatbot response streaming을 Issue #104 MVP에서 제외하고 별도 Issue #105 follow-up으로 분리했다.
- Coverage: Issue #104는 non-streaming chatbot response와 elapsed-time Thinking indicator를 구현하고, Issue #105는 streaming answer chain, streaming route, client stream reader, partial failure policy를 다루는 후속 작업으로 둔다.
- Pages: [[Munjib]], [[Project PRD]], [[RAG Process Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #105, `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`.
- Verification: `pnpm wiki:manifest`; `git diff --check`; spec/wiki placeholder scan.

## 2026-06-15T11:25:00+0900 - issue-104 ai assistant chatbot design

- Result: Issue #104 설계를 추가해 Ask AI 정확도/속도 개선과 우측 하단 workspace chatbot의 역할을 분리했다.
- Coverage: Ask AI는 current saved document direct-context 기본 path로 전환하는 계획이며, 기존 `DocumentChunk` pgvector store는 제거하지 않고 workspace chatbot RAG retrieval에 재사용한다. Chatbot은 사용자+workspace별 active thread/message history를 저장하고, Thinking indicator는 영어 elapsed-time 메시지 schedule을 공통 UI로 사용한다.
- Pages: [[Munjib]], [[Project PRD]], [[RAG Process Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #104, `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`.
- Verification: spec self-review; `git diff --check`.

## 2026-06-15T11:04:01+0900 - rag process visual map

- Result: [[RAG Process Workflow]]에 Ask AI RAG 전체 흐름을 한눈에 볼 수 있는 Mermaid process map, 단계 요약 표, provider/model boundary map을 추가했다.
- Coverage: 시각화는 UI request, route validation, permission gate, server env provider config, optional chat model override, current embedding index guard, saved document chunking, chunk embedding/store, retrieval scope, question embedding, pgvector retrieval, reranking, prompt/citation build, LangChain answer generation, Langfuse metadata/full capture boundary를 함께 보여준다.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 요청, `wiki/RAG Process Workflow.md`, `lib/rag/ask.ts`, `lib/rag/index-document.ts`, `lib/rag/chunk-markdown.ts`, `lib/rag/vector-store.ts`, `lib/rag/retriever.ts`.
- Verification: `pnpm wiki:manifest`; `pnpm wiki:lint`.

## 2026-06-15T01:22:05+0900 - issue-102 PR review follow-up

- Result: PR #103 review feedback removed `flushSync` from the assistant model setting subscription and made `chatModel: null` equivalent to an absent override in the Ask route.
- Coverage: Assistant tests now wrap the synthetic settings event in React `act()`, and route tests pin `null` override behavior so clients can explicitly send no override without receiving `INVALID_CHAT_MODEL`.
- Pages: [[RAG Process Workflow]], [[log|Wiki Log]].
- Source evidence: PR #103 review comments, `components/document-editor/ai-assistant-panel.tsx`, `tests/components/document-editor-preview.test.tsx`, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `tests/rag/ask-route.test.ts`.
- Verification: `pnpm exec tsc --noEmit --pretty false`; `pnpm exec vitest run tests/rag/ask-route.test.ts tests/components/document-editor-preview.test.tsx`; `pnpm wiki:manifest`; `pnpm wiki:lint`; `pnpm wiki:sync-check --staged`.

## 2026-06-15T01:07:12+0900 - issue-102 openrouter chat model selection implementation

- Result: Workspace settings panel의 AI tab에서 browser/workspace별 Ask AI chat model override를 저장하고, assistant request가 optional `chatModel` field로 answer generation model만 바꾸도록 구현했다.
- Coverage: `lib/rag/client-model-settings.ts` validates model ids, stores overrides in `localStorage`, reports storage failure to the UI, and emits same-tab plus cross-tab change events. `AiAssistantPanel` displays the effective model and sends `chatModel` only when an override exists. Ask route validates override input and `askDocumentQuestion()` replaces only `chat.model`, preserving the current Ollama `bge-m3` 1024 embedding index contract.
- Pages: [[RAG Process Workflow]], [[Local Development Workflow]], [[Document Editing Workflow]], [[Munjib]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #102, `docs/superpowers/specs/2026-06-15-openrouter-chat-model-selection-design.md`, `docs/superpowers/plans/2026-06-15-openrouter-chat-model-selection.md`, `lib/rag/client-model-settings.ts`, `components/workspace-settings-panel.tsx`, `components/document-editor/ai-assistant-panel.tsx`, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `lib/rag/ask.ts`.
- Verification: `pnpm exec tsc --noEmit --pretty false`; `pnpm exec vitest run tests/rag/client-model-settings.test.ts tests/rag/model-config.test.ts tests/rag/ask-route.test.ts tests/rag/langfuse.test.ts tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx`; DB-backed `tests/rag/ask.test.ts` still requires a reachable `DATABASE_URL`; `pnpm wiki:manifest`; `pnpm wiki:lint`; `pnpm wiki:sync-check --staged`.

## 2026-06-15T00:25:36+0900 - issue-102 openrouter chat model selection design

- Result: Issue #102 설계를 추가해 workspace settings panel에서 OpenRouter-compatible chat model id를 쉽게 바꿔 Ask AI answer generation을 테스트하는 방향을 정했다.
- Coverage: 설계는 OpenRouter API key/base URL을 server env에만 두고, browser에는 workspace-scoped `localStorage` chat model override만 저장하며, Ask AI request는 optional `chatModel`만 추가한다. Embedding provider/model/dimension, current Ollama `bge-m3` 1024 index identity, saved-content-only retrieval contract는 구현 범위 밖으로 고정한다. 아직 구현된 동작이 아니므로 workflow page의 실제 request steps는 변경하지 않았다.
- Pages: [[Munjib]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #102, `docs/superpowers/specs/2026-06-15-openrouter-chat-model-selection-design.md`.
- Verification: spec self-review for placeholders, contradictions, scope, and ambiguity.

## 2026-06-13T19:44:00+09:00 - rag process workflow page

- Result: Ask AI RAG request부터 provider/env, indexing, retrieval, LangChain answer generation, Langfuse observability까지 한 번에 따라갈 수 있는 별도 workflow page를 추가했다.
- Coverage: [[RAG Process Workflow]]는 UI/route/service entry point, saved-content-only permission contract, provider and current embedding index guard, retrieval/rerank formula, metadata/full Langfuse capture behavior, failure modes, verification commands를 정리한다. [[index|Wiki Index]], [[Munjib]], [[Project PRD]]는 새 RAG page로 연결한다.
- Pages: [[RAG Process Workflow]], [[index|Wiki Index]], [[Munjib]], [[Project PRD]], [[log|Wiki Log]].
- Source evidence: `components/document-editor/ai-assistant-panel.tsx`, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `lib/rag/ask.ts`, `lib/rag/retriever.ts`, `lib/rag/model-config.ts`, `lib/rag/langfuse.ts`, `lib/rag/langfuse-otel.ts`, `tests/rag/*`.
- Verification: `pnpm wiki:manifest`; `pnpm wiki:lint`; `pnpm exec vitest run tests/wiki/manifest.test.ts tests/wiki/lint.test.ts`.

## 2026-06-13T19:35:00+09:00 - issue-100 langfuse env precedence follow-up

- Result: PR #101 follow-up review에 따라 Langfuse disabled flag와 legacy capture alias precedence를 정리했다.
- Coverage: `lib/rag/model-config.ts`는 `MUNJIB_LANGFUSE_ENABLED=false`를 credential보다 우선해 disabled config를 반환하고, `lib/rag/langfuse-otel.ts`와 model config는 `MUNJIB_LANGFUSE_CAPTURE_MODE` 또는 legacy `MUNJIB_LANGFUSE_CAPTURE` 중 하나라도 `full`이면 full capture로 해석한다. `docker-compose.yml`은 legacy `MUNJIB_LANGFUSE_CAPTURE=full`을 덮지 않도록 `MUNJIB_LANGFUSE_CAPTURE_MODE` 기본값을 주입하지 않고, env samples는 disabled flag와 alias precedence를 문서화한다.
- Pages: [[Production Observability Workflow]], [[Local Development Workflow]], [[Project PRD]], [[log|Wiki Log]].
- Source evidence: PR #101 review threads, `lib/rag/model-config.ts`, `lib/rag/langfuse-otel.ts`, `docker-compose.yml`, `.env.example`, `.env.docker.example`, `tests/rag/model-config.test.ts`, `tests/rag/langfuse-otel.test.ts`, `tests/docker/compose.test.ts`.
- Verification: `pnpm exec tsc --noEmit --pretty false`; `pnpm exec vitest run tests/rag/langfuse-otel.test.ts tests/rag/langfuse.test.ts tests/rag/model-config.test.ts tests/observability/sentry-files.test.ts tests/docker/compose.test.ts`; `DATABASE_URL='postgresql://obsidian:obsidian@localhost:55432/obsidian_clone?schema=public' pnpm test`; `pnpm wiki:manifest`; `pnpm wiki:lint`.

## 2026-06-13T19:24:00+09:00 - issue-100 langfuse full capture exporter follow-up

- Result: PR #101 review feedback에 따라 Langfuse full capture가 LangChain callback뿐 아니라 Node runtime OpenTelemetry exporter도 초기화하도록 보강했다.
- Coverage: `instrumentation.ts`는 Node runtime에서 `initializeLangfuseOtel()`을 먼저 호출하고, `lib/rag/langfuse-otel.ts`는 explicit full capture와 credential이 있을 때만 `NodeSDK`와 `LangfuseSpanProcessor`를 시작한다. Metadata mode, disabled env, missing credential, non-node runtime, startup failure는 fail-open으로 callback/exporter를 붙이지 않는다. `.env.example`, `.env.docker.example`, `docker-compose.yml`은 `MUNJIB_LANGFUSE_ENABLED`와 full capture exporter contract를 문서화하고 web container로 전달한다.
- Pages: [[Production Observability Workflow]], [[Local Development Workflow]], [[Project PRD]], [[log|Wiki Log]].
- Source evidence: PR #101 review thread, Langfuse JS/TS SDK docs, Langfuse LangChain integration docs, `instrumentation.ts`, `lib/rag/langfuse-otel.ts`, `tests/rag/langfuse-otel.test.ts`, `tests/observability/sentry-files.test.ts`, `.env.example`, `.env.docker.example`, `docker-compose.yml`, `package.json`, `pnpm-lock.yaml`.
- Verification: `pnpm exec tsc --noEmit --pretty false`; `pnpm exec vitest run tests/rag/langfuse-otel.test.ts tests/rag/langfuse.test.ts tests/observability/sentry-files.test.ts tests/docker/compose.test.ts tests/rag/model-config.test.ts`; `DATABASE_URL='postgresql://obsidian:obsidian@localhost:55432/obsidian_clone?schema=public' pnpm test`; `pnpm wiki:manifest`; `pnpm wiki:lint`.

## 2026-06-13T19:03:00+09:00 - issue-100 environment sample alignment

- Result: RAG provider and Langfuse environment samples now document the latest review follow-up contract and Docker runtime passthrough.
- Coverage: `.env.example` and `.env.docker.example` include `LANGFUSE_TRACING_ENVIRONMENT`, `LANGFUSE_BASE_URL`, `MUNJIB_LANGFUSE_CAPTURE_MODE`, metadata-mode privacy notes, and OpenAI-compatible blank-key guidance. `docker-compose.yml` passes those Langfuse aliases through to the web service, and `lib/rag/model-config.ts` recognizes `LANGFUSE_BASE_URL` alongside existing Langfuse host/base URL names.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: `.env.example`, `.env.docker.example`, `docker-compose.yml`, `lib/rag/model-config.ts`, `tests/docker/compose.test.ts`, `tests/rag/model-config.test.ts`.
- Verification: `pnpm exec vitest run tests/docker/compose.test.ts`; `pnpm exec vitest run tests/rag/model-config.test.ts`.

## 2026-06-13T18:55:00+09:00 - issue-100 PR review privacy and provider follow-up

- Result: PR #101 follow-up review에 따라 Ask AI answer prompts의 literal brace handling, OpenAI base URL passthrough, OpenAI-compatible blank-key runtime support, and Langfuse metadata-mode privacy behavior를 보강했다.
- Coverage: `lib/rag/answer-chain.ts`는 dynamic prompt template 대신 literal chat messages를 사용해 JSON/code brace content를 template variable로 해석하지 않는다. `lib/rag/model-factory.ts`는 official OpenAI `baseUrl`을 LangChain configuration에 전달하고, unauthenticated OpenAI-compatible endpoint에는 non-secret placeholder API key를 넣어 OpenAI SDK credential preflight를 통과시킨다. `lib/rag/langfuse.ts`는 metadata mode에서 external callback을 붙이지 않고 explicit `full` capture에서만 callback을 연결한다.
- Pages: [[Munjib]], [[Document Editing Workflow]], [[Production Observability Workflow]], [[Project PRD]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #101 review threads, `lib/rag/answer-chain.ts`, `lib/rag/model-factory.ts`, `lib/rag/langfuse.ts`, `lib/rag/ask.ts`, `tests/rag/answer-chain.test.ts`, `tests/rag/model-factory.test.ts`, `tests/rag/langfuse.test.ts`.
- Verification: `pnpm exec vitest run tests/rag/answer-chain.test.ts tests/rag/model-factory.test.ts tests/rag/langfuse.test.ts`.

## 2026-06-13T18:46:00+09:00 - issue-100 PR review follow-up

- Result: PR #101 automated review feedback에 따라 LangChain model factory의 dynamic `require`를 static imports로 바꾸고, OpenAI-compatible provider의 API key를 optional로 유지하며, answer/embedding provider failure logging을 보강했다.
- Coverage: `lib/rag/model-factory.ts`는 bundler/static analysis friendly imports를 사용한다. `lib/rag/model-config.ts`는 OpenAI-compatible base URL은 계속 요구하지만 API key는 local unauthenticated endpoint 지원을 위해 선택값으로 둔다. `lib/rag/answer-chain.ts`와 `lib/rag/embedding-client.ts`는 provider 실패의 원본 error를 server log에 남긴 뒤 기존 stable RAG error code로 매핑한다.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: PR #101 review threads, `lib/rag/model-factory.ts`, `lib/rag/model-config.ts`, `lib/rag/answer-chain.ts`, `lib/rag/embedding-client.ts`, `.env.example`, `.env.docker.example`.
- Verification: `pnpm exec vitest run tests/rag/model-factory.test.ts tests/rag/model-config.test.ts tests/rag/embedding-client.test.ts tests/rag/answer-chain.test.ts`; `pnpm exec tsc --noEmit --pretty false`.

## 2026-06-13T18:35:00+09:00 - issue-100 langchain langfuse rag provider implementation

- Result: Issue #100 구현으로 saved-content-only Ask AI RAG의 model boundary를 LangChain provider seam으로 옮기고 optional Langfuse metadata tracing을 추가했다.
- Coverage: `lib/rag/model-config.ts`가 Ollama/OpenAI/OpenAI-compatible chat/embedding env를 검증하고, current indexed identity인 Ollama `bge-m3` 1024와 다른 embedding identity는 live Ask AI에서 fail-fast한다. `lib/rag/model-factory.ts`, `lib/rag/embedding-client.ts`, `lib/rag/answer-chain.ts`, `lib/rag/langfuse.ts`, `lib/rag/errors.ts`가 provider-neutral boundary를 맡고, `lib/rag/ask.ts`는 기존 permission/readable document filtering, saved document indexing, graph-aware retrieval, pgvector search, rerank, citation metadata를 유지한 채 LangChain answer chain과 Langfuse invocation metadata를 연결한다. `.env.example`, `.env.docker.example`, `docker-compose.yml`은 provider/Langfuse env passthrough를 문서화한다.
- Pages: [[Munjib]], [[Document Editing Workflow]], [[Production Observability Workflow]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #100, `docs/superpowers/specs/2026-06-06-langchain-langfuse-rag-provider-abstraction-design.md`, `lib/rag/model-config.ts`, `lib/rag/model-factory.ts`, `lib/rag/embedding-client.ts`, `lib/rag/answer-chain.ts`, `lib/rag/langfuse.ts`, `lib/rag/errors.ts`, `lib/rag/ask.ts`, `lib/rag/index-document.ts`, `docker-compose.yml`, `.env.example`, `.env.docker.example`.
- Verification: `pnpm exec tsc --noEmit --pretty false`; `pnpm exec vitest run tests/rag/model-config.test.ts tests/rag/model-factory.test.ts tests/rag/embedding-client.test.ts tests/rag/answer-chain.test.ts tests/rag/langfuse.test.ts tests/rag/index-document.test.ts tests/rag/ask-route.test.ts tests/docker/compose.test.ts`; `DATABASE_URL='postgresql://obsidian:obsidian@localhost:55432/obsidian_clone?schema=public' pnpm exec vitest run tests/rag`.

## 2026-06-06T00:28:56+0900 - issue-100 langchain langfuse rag provider design

- Result: Issue #100 설계를 추가해 현재 saved-content-only RAG의 provider abstraction과 Langfuse observability 방향을 정했다.
- Coverage: 기존 permission/readable document filtering, saved document indexing, graph-aware retrieval, pgvector search, rerank, citation contract는 유지하고, chat/embedding provider boundary를 LangChain으로 옮긴다. 첫 slice는 env 기반 Ollama/OpenAI/OpenAI-compatible provider 설정을 이해하되 workspace/request override, automatic reindex, vector dimension migration은 제외한다. 현재 indexed identity인 Ollama `bge-m3` 1024와 다른 embedding provider/model/dimension은 partial selected-document indexing을 만들지 않고 live Ask AI에서 fail-fast하며, production Langfuse traces는 prompt/context/question/answer body가 아니라 metadata 중심으로 제한한다.
- Pages: [[Munjib]], [[Document Editing Workflow]], [[Production Observability Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #100, `docs/superpowers/specs/2026-06-06-langchain-langfuse-rag-provider-abstraction-design.md`, `lib/rag/ask.ts`, `lib/rag/ollama.ts`, `lib/rag/vector-store.ts`, LangChain JavaScript provider docs, Langfuse LangChain integration docs.
- Verification: spec self-review for placeholders, contradictions, scope, and ambiguity.

## 2026-06-05T00:00:00+09:00 - issue-98 review follow-up

- Result: PR #99 review feedback에 따라 OCI native deploy를 exact GitHub SHA에 pinning하고 health check와 image cleanup을 보강했다.
- Coverage: Remote deploy는 `git pull --ff-only` 대신 `git fetch --force origin main`, `git checkout --detach "$DEPLOY_SHA"`, `test "$(git rev-parse HEAD)" = "$DEPLOY_SHA"`로 CI가 검증한 commit만 build한다. Remote health check는 OCI hairpin NAT 영향을 피하기 위해 `http://127.0.0.1:3000`에 `Host: munjib.example.invalid` header를 붙여 실행하고, SSH deploy step 뒤 GitHub-hosted runner가 `https://munjib.example.invalid` public health check를 별도 실행한다. 성공한 remote deploy는 dangling image 누적을 줄이기 위해 `sudo docker image prune -f`를 실행한다.
- Pages: [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #99 review threads, `.github/workflows/ci-cd.yml`, `tests/github-actions/ci-cd.test.ts`, `docs/superpowers/specs/2026-06-05-oci-ci-cd-deployment-design.md`.
- Verification: `pnpm exec vitest run tests/github-actions/ci-cd.test.ts`.

## 2026-06-05T00:00:00+09:00 - issue-98 oci native build deploy fix

- Result: main deploy path를 GHCR multi-platform publish/pull에서 OCI host native Compose build로 전환했다.
- Coverage: PR #97 merge 후 main run `27017475831`은 `Test and build`를 통과했지만 `Publish image`의 QEMU 기반 runtime image build/push가 장시간 진행되어 취소했다. Issue #98 workflow는 `publish` job, `packages: write`, GHCR login, Buildx/QEMU publish action을 제거하고, `deploy` job이 `ci` 성공 뒤 SSH로 OCI host에서 native `docker compose build web tools`, Prisma migration deploy, RAG vector index setup, `docker compose up -d web`, health checks를 실행하게 한다. Deploy image tag는 `WEB_IMAGE=munjib-web:latest`이고 release env는 build/up 단계에 전달한다.
- Pages: [[CI CD And Monitoring Workflow]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #98, GitHub Actions run `27017475831` cancelled publish log, `.github/workflows/ci-cd.yml`, `tests/github-actions/ci-cd.test.ts`, `docs/superpowers/specs/2026-06-05-oci-ci-cd-deployment-design.md`.
- Verification: `pnpm exec vitest run tests/github-actions/ci-cd.test.ts`.

## 2026-06-05T00:00:00+09:00 - issue-96 oci arm64 publish fix

- Result: main deploy failure after PR #95 merge traced to an amd64-only GHCR image, then publish workflow was updated to push a multi-platform manifest for OCI.
- Coverage: GitHub Actions run `27016407598` passed test/build and GHCR publish but failed `Deploy over SSH` at `sudo env WEB_IMAGE="$WEB_IMAGE" docker compose pull web` because the OCI instance requested `linux/arm64/v8` and the published manifest lacked that platform. The publish job now sets up QEMU before Buildx and pushes `linux/amd64,linux/arm64` for the Docker `runner` target; workflow tests assert the QEMU setup step exists, runs before the build-push step, and preserves the platform list.
- Pages: [[CI CD And Monitoring Workflow]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #96, GitHub Actions run `27016407598` deploy failure log, `.github/workflows/ci-cd.yml`, `tests/github-actions/ci-cd.test.ts`.
- Verification: `pnpm exec vitest run tests/github-actions/ci-cd.test.ts`.

## 2026-06-05T00:00:00+09:00 - issue-94 oci ci cd implementation

- Result: GitHub Actions deploy job을 현재 Oracle Cloud instance 운영 방식에 맞췄고 server production env를 domain origin 기준으로 정리했다.
- Coverage: Deploy job은 `main` publish image를 remote `WEB_IMAGE`로 전달하고, ephemeral `GITHUB_TOKEN`으로 GHCR에 로그인한 뒤 OCI instance에서 `sudo env ... docker compose pull/run/up`을 실행한다. `pull`과 `tools` command에는 `WEB_IMAGE`만 전달하고, Sentry release env는 `up -d web` 단계에만 전달한다. Deploy 후 `https://munjib.example.invalid` public health check를 최대 10회 재시도한다. Server `/home/deployer/munjib/.env`는 `NEXTAUTH_URL="https://munjib.example.invalid"`, `NEXTAUTH_COOKIE_SECURE=true`, `WEB_IMAGE=ghcr.io/dschoi30/munjib:latest`, 초기 Sentry trace sample rate `1.0` 값을 갖는다. GitHub repository variable `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=1.0`과 deploy secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_PORT`, `DEPLOY_SSH_KEY`를 설정했다. 현재 running web container도 local `munjib-web` image로 재시작해 domain origin과 sample rate `1.0` runtime env를 적용했다.
- Pages: [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #94, `.github/workflows/ci-cd.yml`, `tests/github-actions/ci-cd.test.ts`, OCI server env backups `.env.backup-issue-94` and `.env.docker.backup-issue-94`, `docs/superpowers/specs/2026-06-05-oci-ci-cd-deployment-design.md`, `docs/superpowers/plans/2026-06-05-oci-ci-cd-deployment.md`.
- Verification: `pnpm exec vitest run tests/github-actions/ci-cd.test.ts`; `pnpm exec vitest run tests/github-actions/ci-cd.test.ts tests/docker/compose.test.ts`; redacted OCI `.env` inspection; GitHub repository secret and variable name inspection; `curl -I https://munjib.example.invalid`; `sudo docker compose ps`; `sudo docker compose logs --tail=60 web`.

## 2026-06-05T00:00:00+09:00 - issue-94 oci ci cd design

- Result: OCI instance에 현재 CI/CD를 연결하기 위한 설계를 추가했다.
- Coverage: 설계는 `munjib.example.invalid`/`146.56.170.25`, `/home/deployer/munjib` compose project, Caddy reverse proxy, `sudo docker` 필요, GHCR unauthenticated pull failure, `.env.docker`로 인해 active container `NEXTAUTH_URL`이 localhost fallback이 된 문제, GitHub Actions deploy script와 server env contract를 정리한다.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #94, `docs/superpowers/specs/2026-06-05-oci-ci-cd-deployment-design.md`, OCI server read-only inspection, `.github/workflows/ci-cd.yml`, [[CI CD And Monitoring Workflow]].
- Verification: spec self-review for placeholders, contradictions, scope, and ambiguity.

## 2026-06-05T00:00:00+09:00 - ci cd monitoring wiki split

- Result: 현재 CI/CD와 monitoring 구성을 별도 wiki page로 정리했다.
- Coverage: [[CI CD And Monitoring Workflow]]는 `.github/workflows/ci-cd.yml`의 PR/main CI, GHCR publish, SSH compose deploy, Docker compose runtime, Docker stdout/Sentry monitoring split, Sentry build/runtime env와 privacy contract, 현재 한계(e2e/health check/source map upload 제외)를 한 곳에 모은다.
- Pages: [[CI CD And Monitoring Workflow]], [[Production Observability Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `.github/workflows/ci-cd.yml`, `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example`, `.env.docker.example`, `next.config.mjs`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `app/global-error.tsx`, `lib/observability/sentry-config.ts`, `lib/observability/sentry-scrub-event.ts`, `tests/github-actions/ci-cd.test.ts`, `tests/docker/compose.test.ts`, `tests/observability/sentry-config.test.ts`, `tests/observability/sentry-scrub-event.test.ts`, `tests/observability/sentry-files.test.ts`.
- Verification: `pnpm wiki:manifest`; `pnpm wiki:lint` exited 0 with the existing `wiki/designs/sidebar.md` pasted image unresolved-link warning; `git diff --check`.

## 2026-06-05T00:00:00+09:00 - issue-92 review follow-up

- Result: Final review follow-up aligned cascade trash confirmation counts with archive semantics and hardened folder subtree archive against concurrent child creation.
- Coverage: Workspace page computes all-active document counts by folder and sidebar confirmation uses those counts when supplied, while keeping readable documents for rendering and selection. Folder/document mutations that create, move, rename, or archive folder-tree children, including root-level document creation, take a transaction-scoped workspace folder-tree advisory lock before active parent and slug/path validation. Sidebar descendant summary traversal tracks visited folder ids so malformed cyclic folder input cannot loop.
- Pages: [[Folder Hierarchy Model]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #92 review after commit `23fbc14`, `app/workspaces/[workspaceSlug]/page.tsx`, `components/document-list.tsx`, `components/document-navigation.tsx`, `components/document-navigation/folder-trash.ts`, `lib/folders/locks.ts`, `lib/folders/service.ts`, `lib/documents/service.ts`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts tests/documents/service.test.ts tests/components/document-list.test.tsx`; `pnpm exec tsc --noEmit`; `pnpm wiki:manifest`; `pnpm wiki:lint`; `pnpm wiki:sync-check --staged`.

## 2026-06-05T00:00:00+09:00 - issue-92 implementation

- Result: 폴더 휴지통 이동이 사용자 확인 후 하위 폴더와 문서를 함께 archive할 수 있게 되었다.
- Coverage: `archiveFolder()`는 기본 비어 있지 않은 folder guard를 유지하면서 `cascade=true`일 때 active descendant subtree를 다시 계산해 descendant documents, descendant folders, target folder를 하나의 transaction으로 `ARCHIVED` 처리한다. Sidebar는 descendant counts를 확인 문구에 포함하고, 삭제 대상에 현재 selected folder/document가 들어 있으면 workspace root로 이동한다.
- Pages: [[Folder Hierarchy Model]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #92, `lib/folders/service.ts`, `app/workspaces/[workspaceSlug]/actions.ts`, `components/document-navigation/folder-trash.ts`, `components/document-navigation.tsx`, `components/document-navigation/folder-row.tsx`, `tests/folders/service.test.ts`, `tests/workspace-actions.test.ts`, `tests/components/document-list.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts tests/workspace-actions.test.ts tests/components/document-list.test.tsx`; `pnpm test:e2e tests/e2e/login.spec.ts`; `pnpm exec tsc --noEmit`; `pnpm test`; `pnpm wiki:manifest`; `pnpm wiki:lint`; `pnpm wiki:sync-check --staged`.

## 2026-06-05T00:00:00+09:00 - issue-92 plan

- Result: cascade folder trash confirmation 구현 계획을 추가했다.
- Coverage: Plan은 folder service recursive archive, workspace server action cascade contract, sidebar confirmation/navigation, e2e update, wiki maintenance/full verification, PR review/CI loop를 task 단위로 나눈다.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-06-05-cascade-folder-trash-confirmation.md`, `docs/superpowers/specs/2026-06-05-cascade-folder-trash-confirmation-design.md`.
- Verification: plan self-review for spec coverage, placeholder scan, and type consistency.

## 2026-06-05T00:00:00+09:00 - issue-92 design

- Result: 폴더 휴지통 이동 시 사용자 확인 후 하위 폴더와 문서를 함께 archive하는 cascade folder trash 설계를 추가했다.
- Coverage: 기본 `archiveFolder()`는 비어 있지 않은 folder를 계속 거부하고, sidebar `Move to trash`에서 active descendant counts를 포함한 확인을 받은 경우에만 `cascade=true`를 전달한다. Server service는 client counts를 신뢰하지 않고 active descendant subtree를 다시 계산해 하나의 transaction으로 descendant documents, descendant folders, target folder를 soft delete archive 처리한다. Recursive restore와 hard delete는 범위에서 제외한다.
- Pages: [[Folder Hierarchy Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #92, `docs/superpowers/specs/2026-06-05-cascade-folder-trash-confirmation-design.md`, `components/document-navigation.tsx`, `components/document-navigation/folder-row.tsx`, `lib/folders/service.ts`, `app/workspaces/[workspaceSlug]/actions.ts`, `tests/e2e/login.spec.ts`.
- Verification: spec self-review for placeholders, contradictions, scope, and ambiguity.

## 2026-06-04T00:00:00+00:00 - issue-88 review follow-up

- Result: PR #91 review feedback에 따라 GHCR runtime image publish build에도 Sentry public build args를 전달한다.
- Coverage: `.github/workflows/ci-cd.yml`의 Docker build-push step은 `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_RELEASE` build args를 전달해 browser Sentry bundle이 published image에서 비활성화되지 않게 한다. Workflow test는 publish step build args를 고정한다.
- Pages: [[Local Development Workflow]], [[Project PRD]], [[log|Wiki Log]].
- Source evidence: PR #91 Codex review thread, `.github/workflows/ci-cd.yml`, `tests/github-actions/ci-cd.test.ts`.
- Verification: `pnpm exec vitest run tests/github-actions/ci-cd.test.ts tests/docker/compose.test.ts` passed 2 files / 12 tests.

## 2026-06-03T13:20:00+00:00 - implementation

- Result: Issue #88 GitHub Actions CI/CD workflow를 구현했다.
- Coverage: `.github/workflows/ci-cd.yml`은 PR/`main` CI에서 pgvector PostgreSQL service, pnpm install, Prisma generate, Prisma migration deploy, RAG vector index setup, Vitest, Next build, Docker `runner` target build를 실행한다. `main` push는 GHCR에 SHA/latest image를 publish하고 SSH로 production compose project에서 `git pull --ff-only`, `docker compose pull web`, rebuilt tools container Prisma migration deploy, RAG vector index setup, `docker compose up -d web`을 실행한다. `docker-compose.yml`의 `web` service는 `WEB_IMAGE`로 published image tag를 받을 수 있고, `docker-compose.dev.yml`은 dev build tag를 `WEB_DEV_IMAGE`로 분리한다. PR review follow-up은 workflow test action step assertions, CI DB setup, deploy tools rebuild, published image Sentry build args를 보강했다.
- Pages: [[Local Development Workflow]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #88, `.github/workflows/ci-cd.yml`, `docker-compose.yml`, `docker-compose.dev.yml`, `tests/github-actions/ci-cd.test.ts`, `tests/docker/compose.test.ts`.
- Verification: `pnpm run db:generate`; `DATABASE_URL=postgresql://obsidian:obsidian@localhost:55432/obsidian_clone?schema=public pnpm test` passed 50 files / 514 tests; `DATABASE_URL=postgresql://obsidian:obsidian@localhost:55432/obsidian_clone?schema=public pnpm run build`; `sudo docker build --target runner --tag munjib-ci-cd-verify .`; `pnpm wiki:manifest`; `pnpm wiki:lint`; `pnpm wiki:sync-check --staged`; review follow-up `pnpm exec vitest run tests/github-actions/ci-cd.test.ts tests/docker/compose.test.ts`. PR CI re-inspection is pending.

## 2026-06-03T09:20:00+00:00 - design

- Result: Issue #88 GitHub Actions CI/CD 설계를 추가했다.
- Coverage: PR/`main` CI는 pnpm install, Prisma generate, Vitest, Next build, Docker `runner` target build를 검증하고, `main` push는 GHCR image publish 후 SSH로 production compose project를 갱신하는 계획을 기록했다. 구현은 아직 시작하지 않았고, deploy server와 GitHub secrets는 repository 밖 운영 전제다.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #88, `docs/superpowers/specs/2026-06-03-github-actions-ci-cd-design.md`, `package.json`, `Dockerfile`, `docker-compose.yml`.
- Verification: spec self-review for placeholders, contradictions, scope, and ambiguity.


## 2026-06-03T20:50:14+0900 - issue-89 sentry privacy scrubber

- Result: Sentry event privacy scrubber를 추가해 query parameter 기반 document/search state와 network identifiers가 event payload에 남지 않도록 했다.
- Coverage: Browser, Server, Edge `Sentry.init` 모두 `beforeSend`, `beforeSendTransaction`, `beforeSendSpan`, `beforeBreadcrumb` scrubber hooks를 사용한다. Scrubber는 request URL query/host, `query_string`, request data, cookies, request headers, user `ip_address`, span URL/query/target/path/description/name fields, browser fetch/XHR span `url`, span request/response body/header/IP/host/user-agent attributes, breadcrumb URL/query/host fields와 navigation breadcrumb `from`/`to` query를 제거한다. Console breadcrumb는 Docker stdout/console log 전체 수집을 피하기 위해 드롭한다.
- Pages: [[Production Observability Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #89 final review privacy issue, `lib/observability/sentry-scrub-event.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `tests/observability/sentry-scrub-event.test.ts`, `tests/observability/sentry-files.test.ts`.
- Verification: `pnpm exec vitest run tests/observability/sentry-config.test.ts tests/observability/sentry-scrub-event.test.ts tests/observability/sentry-files.test.ts tests/docker/compose.test.ts` (38 tests), `pnpm exec tsc --noEmit`, `pnpm run build`.

## 2026-06-03T20:28:45+0900 - issue-89 sentry observability

- Result: Sentry SaaS error monitoring and low sample rate tracing were wired into the Next.js App Router production Docker web service.
- Coverage: `@sentry/nextjs` initializes browser, Node, and Edge runtimes only when a DSN is configured; App Router global errors and request errors are captured; server/edge `dataCollection` disables user info, cookies, headers, bodies, query params, genAI input/output, stack frame variables, and frame context lines; Docker build args carry `NEXT_PUBLIC_SENTRY_*` values for the browser bundle; runtime `web.environment` carries server and public Sentry values. Source map upload, Sentry structured logs, replay, profiling, and `SENTRY_AUTH_TOKEN` remain out of scope.
- Pages: [[Production Observability Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #89, `docs/superpowers/specs/2026-06-03-sentry-saas-observability-design.md`, `lib/observability/sentry-config.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `app/global-error.tsx`, `next.config.mjs`, `Dockerfile`, `docker-compose.yml`.
- Verification: `pnpm exec vitest run tests/observability/sentry-config.test.ts tests/observability/sentry-files.test.ts tests/docker/compose.test.ts`, `pnpm exec tsc --noEmit`, `pnpm run build`.

## 2026-06-03T19:51:44+0900 - issue-89 plan

- Result: Issue #89 Sentry SaaS observability implementation plan을 추가했다.
- Coverage: Plan은 dependency install, Sentry config parser, Next.js App Router instrumentation files, Docker build/runtime env propagation, focused tests, production build, wiki maintenance, push/PR/review feedback loop를 task 단위로 나눈다. Repo wiki sync hook 때문에 중간 구현 task는 checkpoint로 두고 source와 wiki maintenance를 최종 commit에 함께 싣도록 했다.
- Pages: [[Production Observability Workflow]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-06-03-sentry-saas-observability.md`, `docs/superpowers/specs/2026-06-03-sentry-saas-observability-design.md`, `lib/wiki/sync.ts`.
- Verification: plan self-review for spec coverage, placeholder scan, type consistency, and repo wiki sync compatibility.

## 2026-06-03T18:46:41+09:00 - issue-89 design

- Result: Issue #89 Sentry SaaS observability design을 추가하고 production Docker 로그와 Sentry 역할을 분리했다.
- Coverage: Docker stdout은 startup/env/DB/PostgreSQL log 확인 경로로 유지하고, Sentry SaaS는 Next.js App Router error monitoring과 낮은 sample rate tracing을 맡는다. Browser SDK용 `NEXT_PUBLIC_SENTRY_*` 값은 Docker build args로도 전달해야 하며, source map upload와 `SENTRY_AUTH_TOKEN`은 첫 slice에서 제외한다.
- Pages: [[Production Observability Workflow]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #89, `docs/superpowers/specs/2026-06-03-sentry-saas-observability-design.md`, `docker-compose.yml`, `Dockerfile`, `next.config.mjs`.
- Verification: spec self-review and wiki placeholder scan.

## 2026-06-03T17:28:00+09:00 - issue-85 PR review tag search follow-up

- Result: Left sidebar가 접힌 상태에서도 tag chip/body tag/graph tag search request가 sidebar를 다시 열고 Search panel에 `tag:#<tag>` query를 적용한다.
- Coverage: `AppShell`의 `requestTagSearch`가 left sidebar open state를 복구한 뒤 request token을 갱신하고, real `DocumentList` integration test가 collapsed sidebar에서 `tag:#LangChain` search input까지 열리는 흐름을 고정했다.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: PR #86 Codex review thread on `components/app-shell.tsx`, `components/app-shell.tsx`, `components/document-list.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx -t "reopens the left sidebar|tag search request|opens sidebar search"`, `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/workspace-center-shell.test.tsx tests/document-tabs.test.ts`, and `pnpm exec tsc --noEmit` passed after the PR review fix.

## 2026-06-03T08:20:00+00:00 - implementation

- Result: Issue #81 Ask AI host Ollama server setup을 적용하고 실제 ask route 응답을 검증했다.
- Coverage: Host에 Ollama 0.30.2를 설치하고 `gemma4:e4b`, `bge-m3` 모델을 pull했다. Ollama service는 `OLLAMA_HOST=0.0.0.0:11434` systemd drop-in으로 Docker web container 접근을 허용한다. `docker-compose.yml`은 web/tools에 RAG model env와 `host.docker.internal:host-gateway` mapping을 제공한다. Host firewall은 compose bridge interface의 TCP 11434 inbound만 허용하고 `netfilter-persistent save`로 영구 저장했다.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #81, `docker-compose.yml`, `tests/docker/compose.test.ts`, host Ollama install state, `netfilter-persistent` saved iptables rule.
- Verification: `ollama list`, host `/api/tags`, `gemma4:e4b` chat returned `OK`, `bge-m3` embed returned 1024 dimensions, web container `/api/tags`, `pnpm exec vitest run tests/docker/compose.test.ts`, `sudo docker compose up -d --build web`, `sudo docker compose run --rm tools pnpm run db:rag:index`, authenticated ask route returned HTTP 200 with answer and citation for Welcome.

## 2026-06-03T17:17:00+09:00 - issue-85 PR review keyboard follow-up

- Result: Workspace menu Escape handling now closes the dropdown without capture-phase global cancellation and outside-click handling guards missing event targets.
- Coverage: `tests/components/document-list.test.tsx` verifies Escape closes the workspace menu without calling `preventDefault` or `stopPropagation`.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #86 Gemini review thread on `components/document-list.tsx`, `components/document-list.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx -t "workspace menu|collapses and reopens"`, `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/workspace-center-shell.test.tsx tests/document-tabs.test.ts`, and `pnpm exec tsc --noEmit` passed after the PR review fix.

## 2026-06-03T17:03:00+09:00 - issue-85 e2e selector follow-up

- Result: E2E login workflow assertions now use the workspace menu button instead of treating `Company Handbook` as a heading.
- Coverage: `tests/e2e/login.spec.ts` checks the `Workspace menu` button text and closes a favorites row menu via the `Documents` toolbar button after the Issue #85 header change.
- Pages: [[log|Wiki Log]].
- Source evidence: `tests/e2e/login.spec.ts`, `components/document-list.tsx`.
- Verification: `pnpm exec playwright test tests/e2e/login.spec.ts --grep "development credentials login opens the workspace"` reached the updated workspace menu selector path, then timed out later at an existing Product Notes row action lookup. Component and type checks cover the changed UI contract.

## 2026-06-03T17:00:00+09:00 - issue-85 sidebar reopen slot

- Result: Left sidebar가 접힌 상태에서 `PanelLeftOpen` button이 document tabs와 겹치지 않도록 tab row leading slot을 예약했다.
- Coverage: `AppShell` left panel context는 center content에도 `isOpen` state를 제공하고, `WorkspaceCenterShell`은 left panel closed state를 `DocumentTabs`에 전달한다. `DocumentTabs`는 `w-14` leading slot을 렌더링하고 tab width calculation에서 그 slot width를 제외한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 final PR-before requirement, `components/app-shell.tsx`, `components/workspace-center-shell.tsx`, `components/document-tabs.tsx`, `tests/components/workspace-center-shell.test.tsx`, `tests/document-tabs.test.ts`.
- Verification: `pnpm exec vitest run tests/document-tabs.test.ts tests/components/workspace-center-shell.test.tsx -t "reopen|leading space|sidebar reopen"`, `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/workspace-center-shell.test.tsx tests/document-tabs.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-06-03T16:18:00+09:00 - issue-85 final review follow-up

- Result: Final review follow-up으로 real `DocumentList` collapse/reopen integration test와 workspace menu `aria-haspopup="menu"`를 추가했다.
- Coverage: `DocumentList`의 `PanelLeftClose` button이 `AppShell`의 `useLeftPanel()` context와 실제로 연결되어 left sidebar를 접고 `PanelLeftOpen`으로 복구되는 흐름을 component integration test로 고정했다.
- Pages: [[log|Wiki Log]].
- Source evidence: final code review, `components/document-list.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx -t "real document list|workspace title"`, `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-06-03T15:30:00+09:00 - issue-85 sidebar workspace menu

- Result: 좌측 sidebar workspace name dropdown, Settings menu item, left sidebar collapse/reopen, sticky title+toolbar chrome을 구현했다.
- Coverage: `AppShell` owns left sidebar open state and exposes `useLeftPanel()`. `DocumentList` renders the workspace title as the no-chevron menu trigger, opens `WorkspaceSettingsPanel` through a full-width `Settings` menu item, uses `PanelLeftClose` for collapse, and keeps the title row plus icon toolbar sticky while navigation content scrolls.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #85, `docs/superpowers/specs/2026-06-03-sidebar-workspace-menu-and-collapse-design.md`, `components/app-shell.tsx`, `components/document-list.tsx`, `tests/components/app-shell.test.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-06-03T15:25:11+09:00 - plan

- Result: Issue #85 sidebar workspace menu and collapse implementation plan을 추가했다.
- Coverage: Plan은 `AppShell` left panel context, `DocumentList` workspace name Settings menu, sticky sidebar chrome, focused component tests, wiki maintenance, visual verification, push/PR/review workflow를 task 단위로 나눈다.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-06-03-sidebar-workspace-menu-and-collapse.md`, `docs/superpowers/specs/2026-06-03-sidebar-workspace-menu-and-collapse-design.md`, GitHub issue #85.
- Verification: plan self-review for spec coverage, placeholder scan, and type consistency.

## 2026-06-03T15:17:43+09:00 - design follow-up

- Result: Issue #85 sidebar design에 sticky toolbar requirement를 추가했다.
- Coverage: Left sidebar에서 workspace title row와 icon toolbar를 sticky chrome으로 묶어 긴 Recents, folder tree, search, favorites content를 스크롤해도 항상 보이게 하고, document navigation body만 chrome 아래에서 스크롤되도록 계획을 보강했다.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: 사용자 design review, `docs/superpowers/specs/2026-06-03-sidebar-workspace-menu-and-collapse-design.md`, `wiki/index.md`.
- Verification: spec self-review for placeholders, contradictions, scope, and ambiguity.

## 2026-06-03T14:28:42+09:00 - design

- Result: Issue #85 left sidebar workspace menu and collapse design을 추가했다.
- Coverage: Workspace name text를 chevron 없는 full-width dropdown trigger로 사용하고, dropdown의 첫 항목은 `Settings` 하나로 두며, 기존 gear 위치는 right metadata panel과 같은 결의 반대 방향 `PanelLeftClose` close button으로 바꾼다. Left sidebar collapse는 `AppShell` layout state가 소유하고, matching `PanelLeftOpen` reopen affordance를 제공한다.
- Pages: [[index|Wiki Index]], [[UI Design Excalidraw Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #85, `docs/superpowers/specs/2026-06-03-sidebar-workspace-menu-and-collapse-design.md`, `wiki/designs/sidebar.md`, `wiki/Pasted Image 20260603131407_119.png`, `components/document-list.tsx`, `components/app-shell.tsx`, `components/metadata-panel.tsx`.
- Verification: spec self-review for placeholders, contradictions, scope, and ambiguity.

## 2026-06-03T12:56:00+09:00 - issue-83 recents and stored active tab follow-up

- Result: Recents no longer shows the document currently displayed in the editor, and workspace root entry with a stored active tab now routes to that document.
- Coverage: `DocumentNavigation` persists the selected document in `munjib:recents:<workspaceSlug>` for reload/session continuity, filters the current selected document only from the visible Recents list, and keeps stale/unreadable stored ids out before the five-item limit. `WorkspacePage` enables stored active tab restore only when the URL has no `document` or `folder` query and is not graph view, so stale/deleted/inaccessible document URLs are not hidden by local tab state. `WorkspaceCenterShell` replaces that true workspace-root URL with the stored active document URL when there is no selected folder, graph view, or empty active tab.
- Pages: [[Document Editing Workflow]], [[Folder Hierarchy Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #83, `components/document-navigation.tsx`, `components/workspace-center-shell.tsx`, `tests/components/document-list.test.tsx`, `tests/components/workspace-center-shell.test.tsx`.
- Verification: red `pnpm exec vitest run tests/components/document-list.test.tsx tests/components/workspace-center-shell.test.tsx`, green `pnpm exec vitest run tests/components/document-list.test.tsx tests/components/workspace-center-shell.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-06-03T12:34:00+09:00 - pr-80 review follow-up

- Result: Recents now filters stale stored ids before applying the five-item limit.
- Coverage: `DocumentNavigation` normalizes stored recent ids against the current readable document map before truncation, so deleted or unreadable ids cannot crowd out valid recent history.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #80 Codex review thread, `components/document-navigation.tsx`, `tests/components/document-list.test.tsx`.
- Verification: red `pnpm exec vitest run tests/components/document-list.test.tsx -t "filters stale stored recent ids"`, green `pnpm exec vitest run tests/components/document-list.test.tsx -t "filters stale stored recent ids"`.

## 2026-06-03T03:20:00+00:00 - review follow-up

- Result: PR #82 review feedback on RAG runtime error matching was addressed.
- Coverage: Ask route now stores recoverable RAG/Ollama runtime error codes in a module-level `Set` and checks membership without allocating `Object.values()` on each failed request.
- Pages: [[log|Wiki Log]].
- Source evidence: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, PR #82 review thread.
- Verification: `pnpm exec vitest run tests/rag/ask-route.test.ts tests/rag/ollama.test.ts`; `pnpm exec tsc --noEmit`.

## 2026-06-03T12:09:00+09:00 - pr-80 review follow-up

- Result: Recents localStorage loading, selected-document promotion, and persistence now use one synchronous effect.
- Coverage: Removed intermediate loaded-key state after PR #80 review feedback while preserving workspace-scoped recent selection history behavior.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #80 review threads, `components/document-navigation.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx -t "moves newly selected documents into recents"`.

## 2026-06-03T03:05:00+00:00 - design

- Result: Issue #81 Ask AI Ollama model/server setup 설계를 추가했다.
- Coverage: 현재 Docker web server에서 host-level Ollama를 사용하고, `gemma4:e4b` chat model과 `bge-m3` embedding model을 설치한 뒤 `MUNJIB_OLLAMA_BASE_URL=http://host.docker.internal:11434`로 web container가 Ollama에 접근하도록 검증하는 운영 설정 계획을 기록했다. Linux Docker에서 host name resolution이 실패하면 `host-gateway` mapping을 추가한다.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #81, `docs/superpowers/specs/2026-06-03-ollama-rag-model-server-setup-design.md`, `lib/rag/config.ts`, `lib/rag/ollama.ts`, `docker-compose.yml`.
- Verification: spec self-review for placeholders, contradictions, scope, and ambiguity.

## 2026-06-03T11:58:00+09:00 - issue-79 recents selection history

- Result: Sidebar `Recents` now updates when a different document is selected.
- Coverage: `DocumentNavigation` stores recent document ids in workspace-scoped `munjib:recents:<workspaceSlug>` localStorage, moves the current selected document to the top, filters ids that are not in the readable document list, and uses workspace page readable document order as the fallback filler.
- Pages: [[Document Editing Workflow]], [[Folder Hierarchy Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #79, `components/document-navigation.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx`.

## 2026-06-03T02:57:00+00:00 - bug fix

- Result: AI assistant ask route가 recoverable RAG/Ollama runtime failure를 generic unavailable response로 반환하게 했다.
- Coverage: `app/api/workspaces/{workspaceSlug}/documents/{documentId}/ask`는 `OLLAMA_REQUEST_FAILED` 같은 RAG runtime error를 `RAG_REQUEST_FAILED` 500 대신 `AI_UNAVAILABLE` 503으로 정규화한다. Editor assistant panel은 deployment host, model name, install state 같은 내부 세부정보를 노출하지 않고 기존 generic failure message를 유지한다.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `tests/rag/ask-route.test.ts`, `components/document-editor/ai-assistant-panel.tsx`.
- Verification: `pnpm exec vitest run tests/rag/ask-route.test.ts tests/rag/ollama.test.ts`.

## 2026-05-30T22:25:00+09:00 - deployment cleanup

- Result: Issue #75 OCI HTTP/IP 배포에서 NextAuth redirect와 session cookie 설정을 환경변수로 맞출 수 있게 정리했다.
- Coverage: Production session cookie secure flag는 기본적으로 유지하되 `NEXTAUTH_COOKIE_SECURE=false` override를 허용하고, local HTTPS proxy 검증용 `NEXTAUTH_COOKIE_SECURE=true`도 명시 지원한다. Compose는 해당 env를 `web`과 `tools` container에 전달한다. Runtime image는 `next.config.mjs`를 복사해 `next start` 시 TypeScript config loading 경고를 피한다. Wiki sync path mapping도 `next.config.mjs`를 Local Development Workflow 후보로 인식한다.
- Pages: [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[Wiki Maintenance Automation]], [[log|Wiki Log]].
- Source evidence: `lib/auth/config.ts`, `Dockerfile`, `next.config.mjs`, `lib/wiki/sync.ts`, `tests/auth/config.test.ts`, `tests/docker/compose.test.ts`.
- Verification: red `pnpm exec vitest run tests/auth/config.test.ts`, red `pnpm exec vitest run tests/docker/compose.test.ts`, green `pnpm exec vitest run tests/auth/config.test.ts tests/docker/compose.test.ts`, `pnpm exec vitest run tests/auth/config.test.ts tests/docker/compose.test.ts tests/wiki/sync.test.ts`, `pnpm exec tsc --noEmit`, `pnpm wiki:lint`, `pnpm wiki:manifest`, `pnpm run build`, `docker compose build web`.


## 2026-05-30T17:20:00+09:00 - review follow-up

- Result: PR #74 review threads for Issue #73 RAG assistant를 반영했다.
- Coverage: AI assistant panel은 HTTP 200이어도 response JSON parse가 실패하면 오류 상태를 보여주고, empty citation heading path는 dangling separator를 표시하지 않는다. Saved document indexing은 chunk embedding을 순차 처리하고, mutation commit 뒤 refresh는 Next.js `after()` hook에 등록한다. Ask service의 persisted `DocumentLink` lookup은 retrieval scope에 필요하지 않은 ordering을 제거했다.
- Pages: [[Document Knowledge Model]], [[Document Editing Workflow]], [[Next.js Prisma Monolith]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/document-editor/ai-assistant-panel.tsx`, `lib/rag/index-document.ts`, `lib/rag/ask.ts`, `tests/components/document-editor-preview.test.tsx`, `tests/rag/index-document.test.ts`, `tests/rag/ask.test.ts`.
- Verification: red `pnpm exec vitest run tests/rag/ask.test.ts tests/components/document-editor-preview.test.tsx tests/rag/index-document.test.ts`, green `pnpm exec vitest run tests/rag/ask.test.ts tests/components/document-editor-preview.test.tsx tests/rag/index-document.test.ts`.

## 2026-05-30T17:00:00+09:00 - review follow-up

- Result: Issue #73 pgvector migration workflow를 `prisma migrate dev`와 호환되게 보정했다.
- Coverage: HNSW vector index를 Prisma migration history 밖의 `lib/rag/vector-index.ts` idempotent setup SQL과 `pnpm run db:rag:index` script로 분리했다. `20260530023000_add_document_chunks_pgvector` migration은 pgvector extension, `DocumentChunk` table, relational/current chunk indexes만 만들며, local pgvector image/port guidance를 [[Local Development Workflow]]에 추가했다.
- Pages: [[Document Knowledge Model]], [[Next.js Prisma Monolith]], [[Project PRD]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `prisma/migrations/20260530023000_add_document_chunks_pgvector/migration.sql`, `lib/rag/vector-index.ts`, `scripts/db/ensure-rag-vector-index.ts`, `package.json`, `tests/rag/vector-index.test.ts`.
- Verification: red `pnpm exec vitest run tests/rag/vector-index.test.ts`, `pnpm exec vitest run tests/rag/vector-index.test.ts tests/rag/vector-store.test.ts tests/docker/compose.test.ts`, `pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url 'postgresql://obsidian:obsidian@localhost:55433/obsidian_clone_shadow?schema=public' --script`, `pnpm run db:rag:index`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run tests/rag/prompt.test.ts tests/rag/ask.test.ts tests/rag/ask-route.test.ts tests/rag/retriever.test.ts tests/rag/index-document.test.ts tests/rag/vector-store.test.ts tests/rag/vector-index.test.ts tests/rag/ollama.test.ts tests/rag/chunk-markdown.test.ts tests/components/document-editor-preview.test.tsx tests/docker/compose.test.ts`.

## 2026-05-30T16:40:00+09:00 - documentation

- Result: Issue #73 saved-content-only document AI RAG assistant의 최종 wiki 설명을 구현 완료 기준으로 정리했다.
- Coverage: `DocumentChunk` pgvector `vector(1024)` 모델, `bge-m3` dimension coupling과 migration 경고, monolith 내 pgvector/raw SQL seam, editor assistant request contract, ask service/retriever/prompt 구현 근거를 보강했다.
- Pages: [[Munjib]], [[Document Knowledge Model]], [[Next.js Prisma Monolith]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `prisma/schema.prisma`, `prisma/migrations/20260530023000_add_document_chunks_pgvector/migration.sql`, `lib/rag/config.ts`, `lib/rag/vector-store.ts`, `lib/rag/retriever.ts`, `lib/rag/ask.ts`, `components/document-editor/ai-assistant-panel.tsx`.
- Verification: `pnpm wiki:install-hooks`, `pnpm wiki:sync-plan --staged`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run tests/rag/prompt.test.ts tests/rag/ask.test.ts tests/rag/ask-route.test.ts tests/rag/retriever.test.ts tests/rag/index-document.test.ts tests/rag/vector-store.test.ts tests/rag/ollama.test.ts tests/rag/chunk-markdown.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm test`.

## 2026-05-30T16:35:00+09:00 - review follow-up

- Result: Issue #73 editor assistant panel의 dirty-state warning과 document switch state isolation을 보강했다.
- Coverage: AI assistant warning은 title/markdown draft divergence뿐 아니라 pending clipboard image paste upload도 saved-content-only warning 대상으로 본다. Assistant panel은 document id로 keying되어 문서 전환 시 이전 질문, 답변, citation state를 다음 문서에 보여주지 않는다.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: red `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "saved-content warning|resets assistant panel"`, `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "saved-content warning|resets assistant panel|opens the AI assistant"`, `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-30T16:30:00+09:00 - implementation

- Result: Issue #73 Document Editor assistant UI를 추가했다.
- Coverage: `DocumentEditor` title row 우측에 `AI에게 묻기` button을 추가하고, `AiAssistantPanel`이 `/api/workspaces/{workspaceSlug}/documents/{documentId}/ask`에 trimmed `question`만 POST하도록 했다. Current title 또는 markdown draft가 selected saved document와 다르면 saved-content warning을 표시하며, answer, citations, loading, error state를 처리한다.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/document-editor.tsx`, `components/document-editor/ai-assistant-panel.tsx`, `components/document-editor/types.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: red `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "opens the AI assistant"`, `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "opens the AI assistant"`, `pnpm exec tsc --noEmit`.

## 2026-05-30T16:15:00+09:00 - review follow-up

- Result: Issue #73 ask route wrapper의 error boundary를 보정했다.
- Coverage: `requireCurrentUser()`와 params/body parsing을 service error catch 밖으로 옮겨 Next auth redirect control flow를 generic 500으로 삼키지 않게 했다. Malformed JSON body는 empty object로 처리해 missing `question`과 같은 `QUESTION_REQUIRED` 400 response를 반환한다. Route는 계속 JSON body에서 `question`만 service input으로 전달한다.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `tests/rag/ask-route.test.ts`.
- Verification: red `pnpm exec vitest run tests/rag/ask-route.test.ts`, `pnpm exec vitest run tests/rag/ask-route.test.ts tests/rag/prompt.test.ts tests/rag/ask.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-30T16:00:00+09:00 - implementation

- Result: Issue #73 RAG assistant의 prompt builder와 saved-document-only ask service/API route를 추가했다.
- Coverage: `buildRagPrompt()`는 saved document context만 쓰도록 지시하고 unsaved editor drafts/outside knowledge 금지, saved docs insufficient evidence response, question language matching, `[n] Document Title > Heading` citation label을 만든다. `askDocumentQuestion()`은 caller input을 `workspaceSlug`, `documentId`, `actorId`, `question`으로 제한하고, workspace page와 같은 explicit document permission/readability 계산으로 selected document access를 확인한 뒤 `safeIndexSavedDocument({ documentId })`, scoped pgvector search, rerank, prompt, Ollama chat을 연결한다. Ask route는 `body.question`만 읽고 posted draft title/content fields를 무시한다.
- Pages: [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/rag/prompt.ts`, `lib/rag/ask.ts`, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `tests/rag/prompt.test.ts`, `tests/rag/ask.test.ts`.
- Verification: red `pnpm exec vitest run tests/rag/prompt.test.ts tests/rag/ask.test.ts`, `pnpm exec vitest run tests/rag/prompt.test.ts tests/rag/ask.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-30T15:46:00+09:00 - review follow-up

- Result: Issue #73 saved document indexing lifecycle의 stale replacement result propagation을 보정했다.
- Coverage: `replaceDocumentChunksInTransaction()`이 pgvector replacement transaction callback의 boolean result를 반환하도록 해, `FOR UPDATE` + expected `updatedAt` guard가 stale job을 감지한 `false` 결과를 `indexSavedDocument()` caller까지 보존한다.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/rag/index-document.ts`, `tests/rag/index-document.test.ts`.
- Verification: red `pnpm exec vitest run tests/rag/index-document.test.ts -t "preserves stale replacement results"`, `pnpm exec vitest run tests/rag/index-document.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-30T15:42:00+09:00 - review follow-up

- Result: Issue #73 graph-aware retriever의 reranking boundary와 keyword overlap을 보강했다.
- Coverage: `rerankRetrievedChunks()`는 retrieval scopes 밖의 document chunk를 prompt/citation 후보에서 제외한다. Keyword overlap은 punctuation-normalized Unicode token set으로 계산하고, English stop words와 too-short Latin terms를 무시하되 Korean/CJK 2글자 terms는 질문 keyword로 유지한다.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/rag/retriever.ts`, `tests/rag/retriever.test.ts`.
- Verification: `pnpm exec vitest run tests/rag/retriever.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-30T15:31:00+09:00 - review follow-up

- Result: Issue #73 graph-aware retriever의 public export surface를 요청 범위로 좁혔다.
- Coverage: `ReadableDocument`, `PersistedLink`, `RankedRerankChunk`는 internal type으로 유지하고, 외부 import 가능한 retriever API는 `RETRIEVAL_SCORE_WEIGHTS`, `buildRetrievalScopes`, `rerankRetrievedChunks`, `RetrievalScopes`, `RerankChunk`만 남겼다. `tests/rag/retriever.test.ts`는 extra type exports가 다시 열리면 `tsc`에서 unused `@ts-expect-error`로 실패하는 compile-time regression guard를 포함한다.
- Pages: [[log|Wiki Log]].
- Source evidence: `lib/rag/retriever.ts`, `tests/rag/retriever.test.ts`.
- Verification: `pnpm exec tsc --noEmit` red unused `@ts-expect-error` check, `pnpm exec vitest run tests/rag/retriever.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-30T15:26:00+09:00 - implementation

- Result: Issue #73 RAG assistant의 graph-aware retriever를 추가했다.
- Coverage: `lib/rag/retriever.ts`는 selected saved/readable document를 current scope로 두고 saved markdown wiki links, non-broken/non-ambiguous persisted outgoing links, backlinks, same normalized tags, fallback readable documents 순서로 retrieval scopes를 만든다. Lower-priority scopes는 이미 assigned된 document id를 다시 포함하지 않는다. Reranking은 `(1 - cosine distance) + scope boost + bounded keyword overlap boost` 공식을 쓰며 current `0.5`, linked `0.3`, backlink `0.25`, same-tag `0.15`, keyword term `0.05`, keyword max `0.2`를 exported constants로 노출한다.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/rag/retriever.ts`, `tests/rag/retriever.test.ts`.
- Verification: `pnpm exec vitest run tests/rag/retriever.test.ts` red missing-module check, `pnpm exec vitest run tests/rag/retriever.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-30T15:09:00+09:00 - review follow-up

- Result: Issue #73 saved document indexing lifecycle의 review blocker를 수정했다.
- Coverage: save/update/move/restore/broken-link creation과 manual attachment upload는 이제 `scheduleSavedDocumentIndex()`로 RAG refresh를 fire-and-forget 예약해 저장 응답을 Ollama/pgvector latency에 묶지 않는다. Index replacement transaction은 `Document` row를 `FOR UPDATE`로 lock하고 expected `updatedAt`을 확인한 뒤 delete/insert를 수행해 stale indexing job이 최신 chunks를 덮지 못하게 한다. Move는 content를 바꾸지 않지만 `updatedAt`을 바꾸므로 refresh 대상에 포함한다. Pasted-image upload에는 no-reindex negative test를 추가했다. Vitest 기본 service save path에서는 automatic scheduler를 no-op 처리해 기존 DB-backed test suite가 local pgvector table state에 의존하지 않는다.
- Pages: [[Document Knowledge Model]], [[Document Editing Workflow]], [[Next.js Prisma Monolith]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/rag/index-document.ts`, `lib/documents/service.ts`, `lib/attachments/service.ts`, `tests/rag/index-document.test.ts`, `tests/documents/service.test.ts`, `tests/attachments/service.test.ts`.
- Verification: `pnpm exec vitest run tests/rag/index-document.test.ts tests/documents/service.test.ts tests/attachments/service.test.ts`, `pnpm exec tsc --noEmit`, `pnpm test`.

## 2026-05-30T14:05:00+09:00 - implementation

- Result: Issue #73 RAG assistant의 saved document indexing lifecycle을 추가했다.
- Coverage: `lib/rag/index-document.ts`는 saved DB document fields를 chunking/embedding source로 사용하고, `DocumentChunk.workspaceId`도 saved document에서만 파생한다. Empty saved markdown은 replacement with empty chunks로 stale index를 비우며, `safeIndexSavedDocument({ documentId })`는 DB load/indexing 실패를 logger에 남기고 false를 반환한다. Document create/update/version restore/broken-link creation과 manual attachment upload는 transaction commit 뒤 best-effort로 RAG chunk refresh를 실행하고, clipboard pasted image upload는 saved markdown을 변경하지 않아 indexing을 실행하지 않는다.
- Pages: [[Document Knowledge Model]], [[Document Editing Workflow]], [[Next.js Prisma Monolith]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/rag/index-document.ts`, `lib/documents/service.ts`, `lib/attachments/service.ts`, `tests/rag/index-document.test.ts`, `tests/documents/service.test.ts`, `tests/attachments/service.test.ts`.
- Verification: `pnpm exec vitest run tests/rag/index-document.test.ts`, `pnpm exec vitest run tests/documents/service.test.ts tests/attachments/service.test.ts`, `pnpm exec vitest run tests/rag/index-document.test.ts tests/documents/service.test.ts tests/attachments/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-30T13:55:00+09:00 - review follow-up

- Result: RAG Markdown chunking helper의 TypeScript inference blocker를 정리했다.
- Coverage: fenced-code tracking의 `openingFence`에 explicit `FenceMarker | null` annotation을 추가해 runtime behavior 변경 없이 `pnpm exec tsc --noEmit` 검증이 통과하도록 했다.
- Pages: [[log|Wiki Log]].
- Source evidence: `lib/rag/chunk-markdown.ts`.
- Verification: `pnpm exec tsc --noEmit`, `pnpm exec vitest run tests/rag/chunk-markdown.test.ts tests/rag/vector-store.test.ts tests/rag/ollama.test.ts`.

## 2026-05-30T13:50:00+09:00 - implementation

- Result: Issue #73 RAG assistant의 pgvector store helper를 추가했다.
- Coverage: `lib/rag/vector-store.ts`는 `DocumentChunk` replacement와 similarity search를 raw SQL seam으로 격리한다. Vector literal은 empty, non-number, NaN, Infinity를 raw SQL 실행 전에 거절하고, insert/search SQL은 static string과 positional parameter를 사용하며 pgvector cast는 `CAST($n AS vector(1024))` 형식만 쓴다. Search는 readable document id array를 bound parameter로 받고 saved `Document.updatedAt`과 chunk `sourceUpdatedAt`이 맞는 current chunks만 반환한다.
- Pages: [[Project PRD]], [[log|Wiki Log]].
- Source evidence: `lib/rag/vector-store.ts`, `tests/rag/vector-store.test.ts`.
- Verification: `pnpm exec vitest run tests/rag/vector-store.test.ts`, `pnpm exec vitest run tests/rag/vector-store.test.ts tests/rag/ollama.test.ts tests/rag/chunk-markdown.test.ts`.

## 2026-05-30T12:46:00+09:00 - review follow-up

- Result: Issue #73 Ollama RAG client의 configuration과 response validation을 보강했다.
- Coverage: blank env values는 기본값으로 fallback하고 invalid embedding dimension은 stable config error로 거절한다. Ollama network failure와 invalid JSON은 recoverable request error로 정규화하며, embedding은 configured dimension과 finite numeric value contract를 통과해야 pgvector 저장 단계로 넘어간다.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/rag/config.ts`, `lib/rag/ollama.ts`, `tests/rag/ollama.test.ts`.
- Verification: `pnpm exec vitest run tests/rag/ollama.test.ts tests/rag/chunk-markdown.test.ts`.

## 2026-05-30T12:15:00+09:00 - implementation

- Result: Issue #73 RAG assistant의 Ollama configuration과 client wrapper를 추가했다.
- Coverage: `getRagConfig()`는 local Ollama base URL, chat model `gemma4:e4b`, embedding model `bge-m3`, embedding dimension `1024`를 env override 가능한 기본값으로 제공한다. `embedText()`는 Ollama `/api/embed`에 embedding request를 보내고, `chatWithContext()`는 non-streaming `/api/chat`에 system/user message를 보낸다. Non-ok response와 empty embedding/chat content는 recoverable RAG error code로 구분한다.
- Pages: [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/rag/config.ts`, `lib/rag/ollama.ts`, `tests/rag/ollama.test.ts`.
- Verification: `pnpm exec vitest run tests/rag/ollama.test.ts`.

## 2026-05-30T11:50:00+09:00 - design review

- Result: Issue #73 RAG assistant 설계와 구현 계획에 review follow-up을 반영했다.
- Coverage: pgvector raw SQL cast를 `CAST($n AS vector(1024))`로 명시하고, vector 값은 static SQL positional parameter로만 전달하도록 계획을 보강했다. `bge-m3`와 `vector(1024)` dimension coupling, retriever weighted score constants, unsaved draft 안내 UX, AGENTS PR review loop 체크리스트도 구현 계획에 추가했다.
- Pages: [[Project PRD]], [[log|Wiki Log]].
- Source evidence: 사용자 review feedback, `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`, `docs/superpowers/plans/2026-05-30-document-ai-rag-assistant.md`.
- Verification: plan self-review, `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-30T11:30:00+09:00 - design

- Result: Issue #73 `Document AI RAG assistant` 설계를 추가했다.
- Coverage: `DocumentEditor` title row 우측 `AI에게 묻기` button, saved-content-only ask route, Ollama `gemma4:e4b` chat model, `bge-m3` embedding model, PostgreSQL pgvector `vector(1024)` chunk store, HNSW cosine index, current-document-centered graph-aware retriever, 테스트와 implementation decision 범위.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #73, `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`, `components/document-editor.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `lib/knowledge-graph/model.ts`, `prisma/schema.prisma`, `docker-compose.yml`.
- Verification: spec self-review, `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-27T01:35:00+09:00 - review follow-up

- Result: Preview tag recursion now skips inline code and code blocks.
- Coverage: Recursive preview tag conversion leaves `code` and `pre` elements untouched, so backticked `#tag` text does not become a misleading tag search button while normal body tags remain clickable.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #72 review thread, `components/document-editor/markdown-preview.tsx`, `tests/components/document-editor-preview.test.tsx`, `tests/document-metadata/parser.test.ts`.
- Verification: `pnpm exec vitest run tests/document-metadata/parser.test.ts tests/components/document-editor-preview.test.tsx -t "inline code tags|inline code into buttons"`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/document-metadata/parser.test.ts tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/documents/service.test.ts`.

## 2026-05-27T01:30:00+09:00 - review follow-up

- Result: Preview tag recursion now avoids invalid nested interactive markup and preserves table cell props.
- Coverage: Recursive preview tag conversion skips link/button elements so markdown links containing `#tag` remain plain links, and table header/cell renderers forward incoming props so GFM alignment is preserved while table-cell tags remain clickable.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #72 review threads, `components/document-editor/markdown-preview.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "markdown links|table alignment|formatted and structured preview tags"`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/document-metadata/parser.test.ts tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/documents/service.test.ts`.

## 2026-05-27T01:25:00+09:00 - review follow-up

- Result: Preview tag click coverage now includes formatted and structured markdown text.
- Coverage: `MarkdownPreview` recursively converts nested inline children and applies tag search rendering to headings, blockquotes, and table cells, so `**#tag**`, heading tags, quote tags, and table-cell tags can all trigger sidebar tag search.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #72 review threads, `components/document-editor/markdown-preview.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "formatted and structured preview tags"`, `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/document-metadata/parser.test.ts tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/documents/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-27T01:20:00+09:00 - review follow-up

- Result: Korean tag clicks now populate sidebar search results and graph tag nodes.
- Coverage: `parseDocumentMetadata()` now merges YAML frontmatter `tags:` and body inline tags with Unicode tag matching. Workspace sidebar search and graph data derive readable document tag inputs from current markdown at render time instead of depending on previously persisted `DocumentTag` rows, so existing Korean tags are reflected immediately.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 보고, `app/workspaces/[workspaceSlug]/page.tsx`, `lib/document-metadata/parser.ts`, `tests/document-metadata/parser.test.ts`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/document-metadata/parser.test.ts tests/components/document-list.test.tsx -t "frontmatter tags|Korean tag queries|Korean inline tags"`, `pnpm exec vitest run tests/document-metadata/parser.test.ts tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/documents/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-27T01:18:00+09:00 - review follow-up

- Result: Korean inline tags now become clickable preview tag search links.
- Coverage: Body tag extraction and preview body tag linking now use Unicode letter/number matching, so `#로드맵` and mixed tags such as `#AI_요약` are parsed as complete tag names instead of being skipped or truncated.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 보고, `lib/document-metadata/parser.ts`, `components/document-editor/markdown-preview.tsx`, `tests/document-metadata/parser.test.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/document-metadata/parser.test.ts -t "Korean inline tags"`, `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "Korean preview body tag"`, `pnpm exec vitest run tests/document-metadata/parser.test.ts tests/components/document-editor-preview.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-27T01:12:00+09:00 - review follow-up

- Result: Graph tag click search가 graph route를 빠져나가 selected document로 이동하던 regression을 수정했다.
- Coverage: Tag search request를 처리하는 `DocumentList` effect는 좌측 Search panel과 query만 갱신하고 더 이상 `clearGraphRoute()`를 호출하지 않는다. Toolbar Search/Favorites/Documents controls는 기존처럼 graph route를 clear하지만, tag click search는 graph view를 유지한 채 좌측 검색 결과만 노출한다.
- Pages: [[log|Wiki Log]].
- Source evidence: 사용자 보고, `components/document-list.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx -t "opens tag search from graph view|does not replay|opens sidebar search"`, `pnpm exec tsc --noEmit`.

## 2026-05-27T01:05:00+09:00 - review follow-up

- Result: Graph view tag node click도 Issue #71 tag search trigger에 연결했다.
- Coverage: `KnowledgeGraphView` node click handler는 document node 클릭은 기존처럼 selected workspace document route로 이동하고, tag node 클릭은 `AppShell` tag search context에 tag name을 전달해 좌측 Search panel이 `tag:#<tag>` 결과 목록을 보여주게 한다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: 사용자 요청, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`.

## 2026-05-27T00:50:00+09:00 - review follow-up

- Result: PR #72 review feedback을 반영해 tag click search 구현을 보강했다.
- Coverage: `requestTagSearch`를 stable callback으로 분리해 markdown preview component memoization이 불필요하게 흔들리지 않게 했고, DocumentList는 tag search request token을 한 번만 처리해 이후 document navigation이 이전 tag search를 재실행하지 않게 했다. Workspace page는 readable document tag query에서 `name`과 `normalizedName`을 함께 선택하고 graph view tag data에도 재사용해 중복 `DocumentTag` 조회를 제거했다.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #72 review threads, `components/app-shell.tsx`, `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx tests/components/knowledge-graph-view.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-27T00:35:00+09:00 - implementation

- Result: Issue #71 tag click search를 구현했다.
- Coverage: `AppShell` tag search context로 center editor에서 sidebar search를 요청하고, `DocumentList`는 요청을 받아 Search panel을 열며 input을 `tag:#<tag>`로 채운다. Search panel은 typed `tag:#name`과 `tag:name`을 exact normalized tag match로 처리하고 partial match를 하지 않는다. Readable document의 reconciled tag index를 sidebar document data에 포함해 YAML frontmatter `tags:`와 body `#tag` 기반 결과를 모두 검색한다. Properties frontmatter tag chip과 preview body `#tag`가 click trigger가 되었고, edit mode raw markdown은 클릭 대상이 아니다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #71, `components/app-shell.tsx`, `components/document-list.tsx`, `components/document-navigation.tsx`, `components/document-editor/document-properties.tsx`, `components/document-editor/markdown-preview.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/components/document-list.test.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-27T00:20:00+09:00 - planning

- Result: Issue #71 tag click search 구현 계획을 작성했다.
- Coverage: AppShell tag search context, DocumentList sidebar search request handling, typed `tag:#name` exact matching, Properties tag chip click, preview body tag click, server-side readable document tag wiring, focused component tests, wiki/PR verification loop로 task를 나누었다.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-27-tag-click-search.md`.
- Verification: Plan self-review.

## 2026-05-27T00:05:00+09:00 - design

- Result: Issue #71 tag click search 설계를 승인된 범위로 기록했다.
- Coverage: Existing sidebar Search panel에 `tag:#name` literal query를 추가하고, query는 exact normalized tag match로 처리한다. Frontmatter tag chip과 preview mode body `#tag` click은 Search panel을 열고 input을 `tag:#<tag>`로 채운다. 검색 결과는 YAML frontmatter `tags:`와 body `#tag` reconciliation 결과를 모두 포함하지만, Properties tags row는 frontmatter-only source policy를 유지한다.
- Pages: [[Munjib]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #71, `docs/superpowers/specs/2026-05-27-tag-click-search-design.md`.
- Verification: Spec self-review.

## 2026-05-26T23:36:00+09:00 - implementation

- Result: Issue #70에서 knowledge graph 초기 zoom을 selected document 중심의 `2.5`로 설정했다.
- Coverage: `react-force-graph-2d` 첫 render frame 이후 selected document 좌표가 준비되면 `zoom(2.5, 0)`과 `centerAt(selected.x, selected.y, 0)`을 최초 1회만 호출하며, 기존 `minZoom=0.35`와 `maxZoom=3.5` bounds는 유지한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #70, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-25T22:45:00+09:00 - maintenance

- Result: merge 이후 관련 GitHub issue를 항상 닫는 workflow rule을 명시했다.
- Coverage: PR merge 후 자동 close가 실패하거나 과거 open issue가 남아 있으면 `gh issue close <number> --reason completed`로 수동 close하고, open issue 조회로 남은 issue를 확인하는 절차를 task completion/PR review workflow에 포함했다.
- Pages: [[Wiki Maintenance Automation]], [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 요청, GitHub open issue cleanup.
- Verification: `gh issue list --state open --limit 100 --json number,title,url`.

## 2026-05-25T19:08:00+09:00 - review follow-up

- Result: PR #68 review feedback에 따라 hidden selected focus와 label offset 계산을 보정했다.
- Coverage: Selected document가 현재 filter 결과에서 숨겨진 경우 selected focus를 비워 visible graph가 불필요하게 dim 처리되지 않게 했다. Label Y offset은 node radius와 font height를 graph unit으로 유지하고, fixed screen gap인 `LABEL_PADDING`만 `globalScale`로 나눠 zoom-in 상태에서도 node와 label 간격을 보존한다. 후속 final review에서 implementation plan의 label offset helper snippet도 같은 공식으로 정정했다.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #68 review threads, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-25T18:00:00+09:00 - implementation

- Result: Issue #67 knowledge graph zoom and session display controls 구현과 Task 3 verification을 마무리했다.
- Coverage: Graph `Tags`/`Orphans` filters는 기본 unchecked로 시작하고, filters/display/forces option은 workspace-scoped `sessionStorage`에 hydrate/persist되어 browser session 동안 유지된다. Graph renderer는 `minZoom`/`maxZoom` bounds를 사용하고, node size slider는 document-count tier baseline과 곱한 effective node size로 전달된다. Label font size는 zoom 기반 계산값을 minimum/maximum으로 clamp하며, label은 effective node size와 font size를 기준으로 node 아래에 배치된다.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #67, `docs/superpowers/specs/2026-05-25-knowledge-graph-zoom-and-session-display-controls-design.md`, `docs/superpowers/plans/2026-05-25-knowledge-graph-zoom-and-session-display-controls.md`, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:install-hooks`, `pnpm wiki:sync-plan --staged`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-05-25T17:58:00+09:00 - implementation

- Result: Issue #67 graph zoom bounds, document-count node sizing, and bounded label rendering을 구현했다.
- Coverage: Graph renderer는 `minZoom`/`maxZoom`을 받아 zoom range 상한/하한을 제한한다. Node size slider 값은 전체 workspace document count tier baseline과 곱한 effective node size로 전달되어 큰 workspace일수록 compact하게 렌더링된다. Label font size는 zoom scale에서 계산하되 minimum/maximum으로 clamp하고, effective node size와 font size를 기준으로 node 아래에 배치한다.
- Pages: [[log|Wiki Log]].
- Source evidence: `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`, `docs/superpowers/plans/2026-05-25-knowledge-graph-zoom-and-session-display-controls.md`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`.

## 2026-05-25T17:50:00+09:00 - implementation

- Result: Issue #67 graph option 기본값과 session persistence의 첫 구현을 추가했다.
- Coverage: Graph `Tags`와 `Orphans` filters는 기본 unchecked가 되었고, filters/display/forces option은 workspace-scoped `sessionStorage`에서 hydrate/persist된다. 잘못된 stored shape, out-of-range 값, storage API exception은 in-memory 기본값과 현재 상태를 유지하도록 방어한다.
- Pages: [[log|Wiki Log]].
- Source evidence: `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`, `docs/superpowers/plans/2026-05-25-knowledge-graph-zoom-and-session-display-controls.md`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`.

## 2026-05-25T16:10:00+09:00 - design

- Result: Issue #67 knowledge graph zoom and session display controls 설계를 승인된 범위로 기록했다.
- Coverage: Graph view는 zoom range 상한/하한으로 node와 label이 과도하게 커지거나 작아지는 것을 방지하고, label font size를 zoom에 따라 bounded scaling하며, label을 effective node size 아래에 배치하는 방향이다. Tags/Orphans filters는 기본 unchecked가 되고, filters/display/forces option은 workspace-scoped `sessionStorage`에 저장되어 browser session 동안 마지막 변경값을 유지한다. Node size slider는 유지하되 `Node size = 1`의 baseline을 더 작게 정의하고 문서 수 tier로 effective node size를 조정한다.
- Pages: [[Munjib]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #67, `docs/superpowers/specs/2026-05-25-knowledge-graph-zoom-and-session-display-controls-design.md`.
- Verification: Spec self-review.

## 2026-05-25T15:35:00+09:00 - verification follow-up

- Result: E2E seed 재실행이 canonical fixture document titles를 복구하지 못하던 문제를 수정했다.
- Coverage: `prisma/seed.ts` upsert update path now resets the seeded Welcome, Engineering Runbook, Operations folder, and Operations Runbook title/slug/folder/status fields in addition to markdown content, so repeated local E2E runs do not inherit renamed or archived fixture data from prior runs. Login E2E now opens Engineering Runbook through the row action new-tab flow, creates the Product Notes child folder through the row action, and no longer expects inline body tags to appear as Properties rows. Playwright E2E runs use one worker because existing specs share the same seeded account and Welcome document.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: E2E failure investigation, `prisma/seed.ts`, `tests/e2e/login.spec.ts`, `playwright.config.ts`.
- Verification: `DATABASE_URL='postgresql://obsidian:obsidian@localhost:55432/obsidian_clone?schema=public' pnpm run db:seed`, `pnpm exec playwright test`.

## 2026-05-25T15:15:00+09:00 - review follow-up

- Result: PR #66 review feedback에 따라 graph full-markdown wiki scan에서 YAML frontmatter block을 제외하고 persisted wiki edge id 호환성을 보존했다.
- Coverage: Persisted frontmatter `links:` rows remain the source of truth for frontmatter wiki edges, while graph-only markdown scanning still registers body wiki links. This avoids adding contradictory resolved graph edges for a frontmatter link whose persisted row is ambiguous or permission-filtered. Persisted graph wiki edges keep the previous `wiki:<documentLinkId>` id format when present, and scanned-only links use synthetic ids. The markdown scan skips documents whose frontmatter-stripped body has no `[[` marker. Body-scanned graph links keep the shared resolver behavior for slash-containing document titles such as `[[Q1/Q2 Plan]]`.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #66 review thread, `lib/knowledge-graph/model.ts`, `tests/knowledge-graph/model.test.ts`.
- Verification: `pnpm exec vitest run tests/knowledge-graph/model.test.ts tests/components/knowledge-graph-view.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-25T15:00:00+09:00 - review follow-up

- Result: Issue #65 final review에서 발견한 stale e2e graph filter assertion을 갱신했다.
- Coverage: Login e2e는 graph settings reopen 후 removed Wiki links filter가 계속 보이지 않고 Tags/Orphans filters가 보이는 새 graph filter contract를 확인한다.
- Pages: [[log|Wiki Log]].
- Source evidence: final code review, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/knowledge-graph/model.test.ts tests/components/knowledge-graph-view.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-25T14:55:00+09:00 - implementation

- Result: Issue #65 knowledge graph filter/link coverage refinement를 wiki durable behavior로 정리했다.
- Coverage: Graph DTO는 readable documents의 full markdown wiki links를 scan해 persisted frontmatter link rows와 병합하고, Properties Links row/backlinks는 frontmatter `links:` 기반으로 유지한다. Visible graph는 document/tag/wiki nodes와 wiki/tag edges를 사용하며, property graph rendering은 제거되었다. Graph settings는 Tags/Orphans filters와 닫힌 Display/Forces section, node size 3/range 1-10, link thickness max 5, focus color/alpha-only highlight를 제공한다.
- Pages: [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #65, `docs/superpowers/specs/2026-05-25-knowledge-graph-filter-link-coverage-design.md`, `docs/superpowers/plans/2026-05-25-knowledge-graph-filter-link-coverage.md`, `lib/wiki-links/resolve.ts`, `lib/knowledge-graph/model.ts`, `components/knowledge-graph-view.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/knowledge-graph/model.test.ts`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: `pnpm exec vitest run tests/knowledge-graph/model.test.ts tests/components/knowledge-graph-view.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-25T14:45:00+09:00 - implementation

- Result: Issue #65 graph controls UI를 Tags/Orphans filter와 새 display 기본값으로 정리했다.
- Coverage: Graph settings에서 Wiki links와 Properties filter를 제거하고 wiki edges는 항상 표시한다. Display와 Forces section은 기본 닫힘 상태가 되었고, node size 기본값은 3 및 range 1-10, link thickness max는 5로 조정했다. 선택/hover focus는 link width를 변경하지 않고 색상/alpha만 바꾼다.
- Pages: [[log|Wiki Log]].
- Source evidence: `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`, `lib/knowledge-graph/model.ts`, `docs/superpowers/plans/2026-05-25-knowledge-graph-filter-link-coverage.md`.
- Verification: `pnpm exec vitest run tests/knowledge-graph/model.test.ts tests/components/knowledge-graph-view.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-25T14:05:00+09:00 - implementation

- Result: Issue #65 graph page wiring now passes markdown content into the graph model.
- Coverage: Workspace graph mode no longer loads document properties for graph data, and readable documents passed to `buildKnowledgeGraph()` include `contentMarkdown` so graph-only full-markdown wiki link scanning can affect the rendered graph. Graph controls UI 문서화는 후속 task에서 완료한다.
- Pages: [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/page.tsx`, `lib/knowledge-graph/model.ts`, `docs/superpowers/plans/2026-05-25-knowledge-graph-filter-link-coverage.md`.
- Verification: `pnpm exec tsc --noEmit`, `pnpm exec vitest run tests/knowledge-graph/model.test.ts`.

## 2026-05-25T13:25:00+09:00 - implementation

- Result: Issue #65 graph model의 full-markdown wiki link 수집과 property graph output 제거를 구현했다.
- Coverage: `buildKnowledgeGraph()`는 persisted frontmatter link rows와 문서 전체 markdown에서 scan한 wiki links를 같은 wiki edge 후보로 병합하고 source-target 중복 edge를 제거한다. Property graph nodes/edges는 graph model output에서 제외되며, Orphans filter는 연결 없는 document node 표시 여부를 제어한다. Page wiring과 graph controls UI 문서화는 후속 task에서 완료한다.
- Pages: [[log|Wiki Log]].
- Source evidence: `lib/knowledge-graph/model.ts`, `tests/knowledge-graph/model.test.ts`, `docs/superpowers/plans/2026-05-25-knowledge-graph-filter-link-coverage.md`.
- Verification: `pnpm exec vitest run tests/knowledge-graph/model.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-25T12:45:00+09:00 - maintenance

- Result: wiki link target resolution을 `lib/wiki-links/resolve.ts` 순수 helper로 분리해 reconciliation과 Issue #65 graph link construction이 같은 target matching 규칙을 공유할 수 있게 했다.
- Coverage: path-qualified target, underscore-aware segment matching, title fallback, ambiguous/broken 판정은 기존 `DocumentLink` persistence 의미를 유지한다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: `lib/wiki-links/resolve.ts`, `lib/wiki-links/reconcile.ts`, `tests/wiki-links/reconcile.test.ts`, `docs/superpowers/specs/2026-05-25-knowledge-graph-filter-link-coverage-design.md`.
- Verification: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/reconcile.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-25T12:10:00+09:00 - review follow-up

- Result: PR #64 review feedback에 따라 sidebar navigation의 derived document/folder arrays를 memoized values로 정리했다.
- Coverage: Favorite folders, favorite documents, and Recents arrays keep stable references when their inputs do not change, while preserving the root creation, ascending sort, and Recents behavior from Issue #63.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #64 review thread, `components/document-navigation.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-25T12:05:00+09:00 - implementation

- Result: Issue #63에서 sidebar document tree 정렬, Recents 유지, top-level 생성 위치를 정리했다.
- Coverage: Folder/document tree는 parent 안에서 folder 우선과 title/name 오름차순을 사용한다. `Recents`는 favorites 상태와 무관하게 workspace page가 내려준 readable document 순서의 앞 5개를 유지한다. Top-level `New document`와 `New folder`는 선택 folder와 무관하게 root hidden value를 제출하고, folder-scoped creation은 folder row action menu에서만 실행한다.
- Pages: [[Document Editing Workflow]], [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: GitHub issue #63, `components/document-create-controls.tsx`, `components/document-navigation.tsx`, `components/document-navigation/tree.ts`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-25T00:00:00+09:00 - design

- Result: Issue #65 knowledge graph filter/link coverage 설계를 승인된 범위로 기록했다.
- Coverage: Graph view는 문서 전체 markdown의 wiki link를 graph edge 후보로 삼되 Properties Links row와 backlinks의 frontmatter `links:` 계약은 유지한다. Filters는 Wiki links/Properties를 제거하고 Tags/Orphans 중심으로 단순화하며, Display/Forces 기본 닫힘과 node/link display range 조정을 계획한다.
- Pages: [[Munjib]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #65, `docs/superpowers/specs/2026-05-25-knowledge-graph-filter-link-coverage-design.md`, `docs/superpowers/plans/2026-05-25-knowledge-graph-filter-link-coverage.md`.
- Verification: Spec self-review.

## 2026-05-24T19:55:00+09:00 - review follow-up

- Result: PR #62 Codex review feedback에 따라 empty document title row가 blank clickable target으로 보이지 않도록 fallback label을 추가했다.
- Coverage: Document sidebar visible label은 title-only 정책을 유지하되 title이 비어 있거나 whitespace-only이면 `Untitled`를 표시한다. Document action label도 같은 fallback을 사용하고 duplicate/path context가 필요한 경우에만 path를 붙인다.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: PR #62 review thread, `lib/workspace-tree.ts`, `components/document-navigation/document-row.tsx`, `tests/workspace-tree.test.ts`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/workspace-tree.test.ts tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T19:45:00+09:00 - review follow-up

- Result: PR #61 Codex review feedback에 따라 importing progress count를 total file count로 clamp했다.
- Coverage: Import run이 마지막 file 결과를 반영한 직후 completed state로 바뀌기 전 transient render에서도 `Importing 3 / 2` 같은 impossible count가 보이지 않도록 `Math.min(completedCount + 1, totalCount)`를 사용한다.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #61 Codex review, `components/workspace-settings-panel.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T19:42:00+09:00 - review follow-up

- Result: PR #62 Gemini review feedback에 따라 folder menu creation pending guard를 route transition 완료까지 유지하도록 보강했다.
- Coverage: `Add folder`와 `Add document`는 server action 성공 후 router push/refresh transition이 settle되기 전까지 pending guard를 유지하고, 실패 시에는 pending state를 즉시 해제한 뒤 toast를 표시한다.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: PR #62 review thread, `components/document-navigation.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/workspace-tree.test.ts tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T19:40:00+09:00 - review follow-up

- Result: PR #62 Codex review feedback에 따라 folder menu creation failure feedback을 추가했다.
- Coverage: Folder row menu의 `Add folder`와 `Add document` action이 server action 실패 시 click handler rejection으로 끝나지 않고 Sonner toast로 복구 가능한 오류를 표시한다.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: PR #62 review thread, `components/document-navigation.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/workspace-tree.test.ts tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T19:35:00+09:00 - review follow-up

- Result: PR #61 review feedback에 따라 Markdown import progress status text helper를 단순화했다.
- Coverage: Import 진행 중 count는 `completedCount + 1`만 사용해 표시하며, redundant `Math.max()` guard를 제거했다. Sequential per-file import의 large batch performance note는 issue #58 설계의 backend job/streaming deferred decision과 일치하는 advisory로 남긴다.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #61 Gemini review, `components/workspace-settings-panel.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T19:35:00+09:00 - review follow-up

- Result: PR #60 automated review feedback에 따라 path-qualified target의 parent segment에도 underscore-to-space normalization을 적용했다.
- Coverage: Direct stored path matching과 parent-path title fallback 모두 parent segment를 `slugifyTitle(segment.replace(/_+/g, " "))` 방식으로 비교해 `[[Project_Plans/Roadmap]]`이 `Project Plans` folder 아래 `Roadmap` 문서와 매칭된다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #60 review threads, `lib/wiki-links/targets.ts`, `tests/wiki-links/preview.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T19:28:00+09:00 - review follow-up

- Result: PR #60 automated review feedback에 따라 wiki-link lookup key의 최종 hyphen normalization을 복원했다.
- Coverage: Lookup key는 whitespace를 hyphen으로 바꾼 뒤 hyphen run을 다시 접어 `[[A - B]]`가 `A-B` 문서와 계속 매칭된다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #60 review threads, `lib/wiki-links/targets.ts`, `tests/wiki-links/preview.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T19:20:00+09:00 - review follow-up

- Result: PR #60 automated review feedback에 따라 path-qualified wiki-link lookup의 stored path matching을 `slugifyTitle()` 기반으로 복원하고, non-ASCII parent folder fallback을 보강했다.
- Coverage: Direct path matching은 persisted `Document.path`와 같은 slug-compatible key를 사용한다. 마지막 segment title matching은 parent folder path를 slug-compatible하게 유지하고 마지막 title segment만 Unicode-preserving lookup key로 비교해 `[[역사/수에즈_운하_위기]]` 같은 link도 resolve한다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #60 review threads, `lib/wiki-links/targets.ts`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T19:12:00+09:00 - review follow-up

- Result: PR #60 automated review feedback에 따라 wiki-link lookup key의 slug-compatible punctuation normalization을 복원하고 lookup 반복 계산을 줄였다.
- Coverage: Unicode-preserving lookup key는 underscore를 공백처럼 취급하면서 punctuation을 제거해 `[[Q1Q2 Plan]]`이 `Q1/Q2 Plan` 문서와 계속 매칭된다. Path-qualified title fallback lookup key는 filter loop 밖에서 계산하고 preview candidate lookup keys는 중복 제거한다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #60 review threads, `lib/wiki-links/targets.ts`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T18:35:00+09:00 - plan

- Result: Issue #58 Markdown import progress panel implementation plan을 작성했다.
- Coverage: Plan은 progress panel test coverage, `WorkspaceSettingsPanel` sequential per-file import UI/state implementation, wiki/verification/PR workflow를 task 단위로 나눈다. Server action contract는 issue #55 batch result를 유지하고 interactive UI만 one-file batches를 순차 호출한다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-24-markdown-import-progress-panel.md`, `docs/superpowers/specs/2026-05-24-markdown-import-progress-panel-design.md`.
- Verification: Plan self-review.

## 2026-05-24T18:25:00+09:00 - design

- Result: Issue #58 Markdown import progress panel 설계를 작성했다.
- Coverage: Existing settings Import form은 file selection과 destination/start command만 담당하고, import 시작 후 별도 progress panel이 진행 요약과 selected-file table을 표시한다. Progress panel은 상단에 destination, completed/total count, progress bar, current file, final summary를 두고 하단에 file table을 둔다. 닫기 control은 text `Close`가 아니라 기존 settings panel과 같은 icon-only `X` button pattern을 사용한다. 진행 상태는 client-side sequential per-file import loop로 `Queued`, `Importing`, `Imported`, `Failed` row status를 갱신한다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #58, `docs/superpowers/specs/2026-05-24-markdown-import-progress-panel-design.md`.
## 2026-05-24T14:00:00+09:00 - bugfix

- Result: Issue #59 underscore wiki link target matching을 구현했다.
- Coverage: Body preview links와 frontmatter `links:` reconciliation은 target lookup에서 underscore를 공백처럼 취급한다. Raw markdown과 `DocumentLink.targetTitleRaw`는 보존하며, path-qualified target은 segment별 lookup normalization을 적용한다. 한글 title처럼 stored path가 title 정보를 잃는 경우에는 parent path와 마지막 title segment lookup key를 함께 비교한다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: GitHub issue #59, `lib/wiki-links/targets.ts`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`, `tests/wiki-links/reconcile.test.ts`, `docs/superpowers/plans/2026-05-24-underscore-wiki-link-targets.md`.
- Verification: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-05-24T13:55:00+09:00 - review follow-up

- Result: Issue #57 final review에서 document row action label의 duplicate title context를 복원했다.
- Coverage: Sidebar document row visible label은 계속 title만 표시하지만, row action button label은 duplicate title/path 환경에서 구분할 수 있도록 `Document.path` context를 유지한다.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: final branch review, `components/document-navigation/document-row.tsx`, `lib/workspace-tree.ts`, `tests/workspace-tree.test.ts`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/workspace-tree.test.ts tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T13:35:00+09:00 - design

- Result: Issue #59 underscore wiki link target matching 설계를 기록했다.
- Coverage: `[[수에즈_운하_위기]]`처럼 target에 underscore가 포함된 body preview link와 frontmatter `links:` entry를 `수에즈 운하 위기` 문서로 resolve하되, source markdown과 `DocumentLink.targetTitleRaw` raw text는 rewrite하지 않는다. Path-qualified target은 segment별로 같은 lookup normalization을 적용하고, global document slug/path 생성 규칙은 유지한다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: GitHub issue #59, `docs/superpowers/specs/2026-05-24-underscore-wiki-link-targets-design.md`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `lib/wiki-links/targets.ts`.
- Verification: Spec self-review.

## 2026-05-24T13:45:00+09:00 - feature

- Result: Issue #57 folder sidebar action/order refinements를 구현했다.
- Coverage: Sidebar tree는 folder 우선, 같은 kind 안에서는 title/name 내림차순으로 정렬한다. Document row visible label은 path context 없이 title만 표시한다. Folder row hover action은 `...` menu만 노출하고, `Add folder`/`Add document`는 menu-scoped client action result를 사용해 redirect-style 깜빡임을 줄인다.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: `components/document-navigation/tree.ts`, `components/document-navigation/folder-row.tsx`, `components/document-navigation.tsx`, `lib/workspace-tree.ts`, `app/workspaces/[workspaceSlug]/actions.ts`, `tests/components/document-list.test.tsx`, `tests/workspace-actions.test.ts`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/workspace-tree.test.ts tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-05-24T13:15:00+09:00 - design

- Result: Issue #57 folder sidebar action/order refinements 설계를 기록했다.
- Coverage: Folder/document tree는 folder 우선, 같은 kind 안에서는 title/name 내림차순으로 정렬한다. Folder row hover action은 `...` 메뉴만 노출하고, folder-scoped `Add folder`/`Add document`는 menu action으로 이동해 redirect-style 깜빡임을 줄이는 방향으로 설계했다. Sidebar document row는 duplicate title context를 화면에 붙이지 않고 title만 표시한다.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: GitHub issue #57, `docs/superpowers/specs/2026-05-24-folder-sidebar-actions-ordering-design.md`, `components/document-navigation/tree.ts`, `components/document-navigation/folder-row.tsx`.
- Verification: Spec self-review.

## 2026-05-24T12:55:00+09:00 - review follow-up

- Result: PR #56 review feedback에 따라 multiple Markdown import의 batch failure handling과 panel state update를 보강했다.
- Coverage: `createDocument()` 실패는 file별 failed row로 기록해 이미 생성된 document 결과와 workspace revalidation을 보존한다. Settings panel은 folder sort를 `useMemo`로 memoize하고, duplicate filename row status 계산은 React state updater 내부의 local count map으로 수행해 updater purity를 유지한다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: PR #56 review threads, `app/workspaces/[workspaceSlug]/actions.ts`, `components/workspace-settings-panel.tsx`, `tests/workspace-actions.test.ts`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T12:45:00+09:00 - feature

- Result: Issue #55 multiple Markdown file import를 구현하고 settings panel을 별도 component로 분리했다.
- Coverage: Workspace settings Import form은 multiple file selection, selected file table, root-default destination picker, folder tree popup, panel-centered status message, partial success batch result, duplicate filename row status handling, current-route 유지 refresh를 제공한다. `components/document-list.tsx`는 sidebar composition과 settings panel open/close만 맡고, import UI/state는 `components/workspace-settings-panel.tsx`로 분리했다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/document-list.tsx`, `components/workspace-settings-panel.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `tests/components/document-list.test.tsx`, `tests/workspace-actions.test.ts`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-24T00:40:00+09:00 - plan

- Result: Issue #55 multiple Markdown file import implementation plan을 작성했다.
- Coverage: Plan은 server action batch contract, settings panel multi-file UI, destination path tree picker, wiki/verification/PR workflow를 task 단위로 나눈다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-24-multiple-markdown-file-import.md`, `docs/superpowers/specs/2026-05-23-multiple-markdown-file-import-design.md`.
- Verification: Plan self-review.

## 2026-05-24T00:20:00+09:00 - design

- Result: Issue #55 multiple Markdown file import 설계에 destination path 선택 요건을 추가했다.
- Coverage: Import submit row는 약 2/3 너비의 bordered destination path 영역과 좁은 Import button으로 구성한다. Destination path는 기본 root를 표시하고, 클릭 시 popup tree에서 root 또는 folder를 선택한다. 선택한 folder는 batch 전체 `folderId`로 전달하며 미선택 시 root에 import한다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: 사용자 추가 요건, `docs/superpowers/specs/2026-05-23-multiple-markdown-file-import-design.md`.
- Verification: Spec update self-review.

## 2026-05-23T23:55:00+09:00 - design

- Result: Issue #55 multiple Markdown file import 설계를 기록했다.
- Coverage: Workspace settings Import form은 여러 Markdown file 선택, selected file table, current-route 유지, panel-centered local status message, partial success batch result를 목표로 한다. 구현 전 설계 근거는 `docs/superpowers/specs/2026-05-23-multiple-markdown-file-import-design.md`이다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #55, `docs/superpowers/specs/2026-05-23-multiple-markdown-file-import-design.md`, `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`.
- Verification: Spec self-review.

## 2026-05-21T01:00:00+09:00 - bugfix

- Result: Markdown import 직후 화면 깜빡임을 줄이기 위해 import navigation을 server redirect에서 client push로 옮겼다.
- Coverage: `importMarkdownDocumentAction()`은 document 생성과 revalidation 후 `{ documentId }`만 반환한다. Workspace settings import form은 client action에서 dialog를 닫고 `router.push()`로 imported document URL을 연다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/actions.ts`, `components/document-list.tsx`, `tests/workspace-actions.test.ts`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-21T00:56:00+09:00 - bugfix

- Result: PR review feedback에 따라 clipboard HTML image paste의 server fetch와 pending state guard를 추가 보강했다.
- Coverage: IPv4-mapped IPv6 address는 dotted form뿐 아니라 hex form도 IPv4 private range 판정으로 재검사한다. Remote image fetch는 검증된 DNS answer를 한 개만 쓰지 않고, 실패 시 다음 검증 address를 순서대로 시도한다. Unsupported/malformed `data:` image가 HTML paste form data 생성 중 동기 throw해도 pending image paste count가 finally에서 정리된다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/actions.ts`, `components/document-editor.tsx`, `tests/workspace-actions.test.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/workspace-actions.test.ts`, `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`.

## 2026-05-21T00:45:00+09:00 - security

- Result: Clipboard HTML remote image server fetch의 SSRF hardening을 PR review feedback에 맞춰 보강했다.
- Coverage: Remote image fetch는 DNS lookup으로 public address만 허용한 뒤 원래 hostname을 다시 resolve하지 않고 검증된 IP address에 직접 연결한다. HTTPS 요청은 원래 hostname을 SNI와 `Host` header에 유지해 DNS rebinding 우회를 줄인다. IPv4-mapped IPv6 private range도 IPv4 판정 경로로 재검사한다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/actions.ts`, `tests/workspace-actions.test.ts`, `components/document-editor.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/workspace-actions.test.ts tests/attachments/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-21T00:00:00+09:00 - documentation

- Result: Markdown import와 clipboard paste 프로세스를 별도 workflow 문서로 분리했다.
- Coverage: 새 [[Markdown Import And Clipboard Paste Workflow]]는 Markdown file import의 document creation 흐름과 clipboard image/rich HTML paste의 draft, attachment, Save guard, remote image server fetch, 실패 처리 차이를 정리한다. [[Document Editing Workflow]]는 상위 편집 흐름을 유지하고 세부 import/paste 설명은 새 문서로 연결한다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `lib/documents/import-markdown.ts`, `components/document-editor.tsx`, `lib/markdown/html-to-markdown.ts`, `lib/attachments/service.ts`, `tests/documents/import-markdown.test.ts`, `tests/components/document-editor-preview.test.tsx`, `tests/workspace-actions.test.ts`, `tests/attachments/service.test.ts`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-20T00:36:00+09:00 - bugfix

- Result: Clipboard rich HTML paste에 image file 없이 `<img src>`만 포함될 때 source link만 붙여넣어지던 문제를 수정했다.
- Coverage: `DocumentEditor`는 clipboard HTML의 `<img>`를 upload placeholder로 치환해 Markdown으로 삽입한다. Data URL image는 client에서 File로 만들어 `pasteImageAttachmentAction()`에 보내고, remote image URL은 browser CORS를 피하기 위해 `imageUrl`로 server action에 넘겨 서버에서 fetch/upload한 뒤 placeholder를 attachment image markdown으로 교체한다. Server-side remote image fetch는 http/https URL만 허용하고 DNS lookup 결과가 private/local/link-local address이면 fetch 전에 거부하며, redirect 차단, 5초 timeout, allowed image MIME type, content-length, streaming byte limit을 적용한다. Image-only anchor wrapper는 source link markdown으로 변환하지 않고 image placeholder로 대체한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/workspace-actions.test.ts tests/attachments/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-18T03:14:00+09:00 - review follow-up

- Result: PR #53 추가 review feedback에 따라 pending image paste draft update를 active document가 아니라 source editor view document 기준으로 기록하도록 보강했다.
- Coverage: 오래된 CodeMirror view에서 upload completion dispatch가 발생해도 `EditorView`와 source document id의 mapping을 사용해 해당 paste가 시작된 문서 draft만 갱신한다. 다른 문서에도 pending paste가 있는 상태에서 source view update가 active document draft를 덮어쓰는 corruption path를 막는다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #53 review thread, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-18T03:06:00+09:00 - review follow-up

- Result: PR #53 추가 review feedback에 따라 pasted image draft cache를 완료 후 stale server content보다 우선하지 않도록 보강했다.
- Coverage: Pending image paste draft는 upload가 진행 중인 문서 상태 또는 비활성 source document에 완료 결과를 한 번 전달하기 위한 임시 값으로 제한된다. Upload가 끝난 활성 문서는 draft cache를 지우고, 비활성 문서에서 끝난 결과도 해당 문서를 다시 열 때 한 번 반영한 뒤 cache를 지워 이후 server-side content refresh를 stale draft가 덮지 않게 한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #53 review thread, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-18T02:54:00+09:00 - review follow-up

- Result: PR #53 review feedback에 따라 pending paste upload 완료 결과를 source document draft에 적용하도록 보강했다.
- Coverage: Image upload가 pending인 동안 다른 문서로 전환해도 upload 성공 결과는 paste가 시작된 document draft에 반영된다. 사용자가 원래 문서로 돌아오면 placeholder 대신 반환된 image markdown이 표시된다.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #53 review thread, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-18T02:46:00+09:00 - review follow-up

- Result: PR #53 review feedback에 따라 pending image paste state를 document별 count로 바꿨다.
- Coverage: 서로 다른 문서에서 paste image upload가 동시에 pending이어도 각 문서의 Save guard가 독립적으로 유지된다. 한 문서의 upload 완료가 다른 문서의 pending placeholder 저장 차단을 해제하지 않는다.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #53 review thread, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-18T01:29:00+09:00 - review follow-up

- Result: PR #53 추가 review feedback에 따라 clipboard image paste 실패 복구와 pending state scope를 보강했다.
- Coverage: Upload 실패 시 placeholder를 빈 문자열로 지우지 않고 paste 전에 선택된 text로 되돌린다. Pending upload save guard는 현재 선택 문서 기준으로만 적용되어, 느린 upload가 진행 중이어도 다른 문서로 전환하면 해당 문서 Save를 막지 않는다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #53 review threads, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-18T01:21:00+09:00 - review follow-up

- Result: PR #53 review feedback에 따라 clipboard image paste placeholder 처리와 pending upload save guard를 보강했다.
- Coverage: `DocumentEditor`는 같은 paste placeholder가 여러 번 존재하면 모두 반환 markdown으로 교체하고, upload 실패 시 모두 제거한다. Image upload가 pending인 동안 Save submit을 차단해 placeholder markdown이 저장되는 것을 막고 `Image upload is still in progress` toast를 표시한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #53 review threads, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-18T01:03:00+09:00 - maintenance

- Result: Issue #52 clipboard image paste attachment workflow를 최종 구현 상태에 맞춰 정리했다.
- Coverage: Manual attachment upload는 기존처럼 markdown link append와 즉시 document version 생성을 수행하고, Markdown editor clipboard image paste는 `pasteDocumentImageAttachmentAction()`을 통해 paste-only attachment service를 호출한다. Paste-only service/action은 `image/png`, `image/jpeg`, `image/gif`, `image/webp` file blob만 저장하고 `![file](/api/attachments/<id>)` markdown을 반환하되 `Document.contentMarkdown`와 `DocumentVersion`은 즉시 바꾸지 않는다. `DocumentEditor`는 paste selection에 temporary upload placeholder를 동기 삽입하고 upload 성공 시 현재 placeholder를 반환 markdown으로 교체하며, upload 실패 시 placeholder를 제거하고 `Image paste failed` toast를 표시한다. Body markdown persistence, version 생성, metadata/link reconciliation, audit log 작성은 사용자가 Save를 누를 때 기존 `updateDocument()` 흐름에서 확정된다. Remote `<img>` download와 Markdown import image collection은 Issue #52 범위 밖이다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #52, `docs/superpowers/specs/2026-05-18-clipboard-image-paste-design.md`, `docs/superpowers/plans/2026-05-18-clipboard-image-paste-attachments.md`, `lib/attachments/service.ts`, `app/workspaces/[workspaceSlug]/actions.ts`, `components/document-editor.tsx`, `tests/attachments/service.test.ts`, `tests/workspace-actions.test.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/attachments/service.test.ts tests/workspace-actions.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-18T00:47:00+09:00 - implementation

- Result: Issue #52 Task 3 `DocumentEditor` paste integration을 추가했다.
- Coverage: Workspace page가 `pasteDocumentImageAttachmentAction`을 bind해 `DocumentEditor`에 전달하고, CodeMirror paste handler는 clipboard image file을 rich HTML 변환보다 먼저 upload해 반환된 image markdown을 현재 selection에 삽입한다. Image file이 없으면 기존 rich HTML paste 변환을 유지한다.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/page.tsx`, `components/document-editor.tsx`, `components/document-editor/types.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`.

## 2026-05-18T00:38:00+09:00 - implementation

- Result: Issue #52 Task 2 paste image attachment server action contract를 추가했다.
- Coverage: `pasteDocumentImageAttachmentAction()`은 clipboard image file과 `documentId`를 받아 `uploadPastedDocumentImageAttachment()`를 호출하고, workspace path revalidation 후 redirect 없이 editor insertion용 `{ markdown }`을 반환한다. File이 없으면 `ATTACHMENT_FILE_REQUIRED`를 throw한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/actions.ts`, `tests/workspace-actions.test.ts`.
- Verification: `pnpm exec vitest run tests/workspace-actions.test.ts`.

## 2026-05-18T00:25:00+09:00 - implementation

- Result: Issue #52 Task 1 paste-only image attachment service를 추가했다.
- Coverage: `uploadPastedDocumentImageAttachment()`는 허용된 clipboard image MIME type만 저장하고 unnamed paste fallback file name을 만들며, attachment storage/row와 `attachment.uploaded` audit log를 생성한다. Manual attachment upload는 기존처럼 markdown append, document version, link/metadata reconciliation을 수행한다.
- Pages: [[Document Knowledge Model]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `lib/attachments/service.ts`, `lib/service-errors.ts`, `tests/attachments/service.test.ts`.
- Verification: `pnpm exec vitest run tests/attachments/service.test.ts`.

## 2026-05-18T00:10:00+09:00 - plan

- Result: Issue #52 clipboard image paste attachment 구현 계획을 작성했다.
- Coverage: plan은 paste-only attachment service, server action, `DocumentEditor` paste integration, wiki maintenance, final PR workflow를 TDD task 단위로 나눈다.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/specs/2026-05-18-clipboard-image-paste-design.md`, `docs/superpowers/plans/2026-05-18-clipboard-image-paste-attachments.md`.
- Verification: plan self-review.

## 2026-05-18T00:00:00+09:00 - design

- Result: Issue #52 clipboard image paste attachment 설계를 작성했다.
- Coverage: 설계는 clipboard image file paste를 attachment로 즉시 저장하고, 반환된 image markdown을 현재 CodeMirror selection에 삽입하되 문서 본문 persistence는 기존 Save 흐름에 남기는 방향을 정한다. Remote image download, Markdown import image 가져오기, ZIP import, blob URL draft preview는 범위에서 제외한다.
- Pages: [[log|Wiki Log]].
- Source evidence: GitHub issue #52, `docs/superpowers/specs/2026-05-18-clipboard-image-paste-design.md`.
- Verification: spec self-review.

## 2026-05-18T00:25:00+09:00 - review follow-up

- Result: PR #51 Codex review에서 지적한 Docker attachment storage persistence를 반영했다.
- Coverage: Production `web` service가 `/app/storage`를 `web_storage` named volume으로 마운트해 container 재생성 후에도 uploaded attachment files가 DB attachment row와 함께 유지된다.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: PR #51 review thread, `docker-compose.yml`, `tests/docker/compose.test.ts`, `wiki/Local Development Workflow.md`.
- Verification: `pnpm exec vitest run tests/docker/compose.test.ts`.

## 2026-05-17T23:58:00+09:00 - review follow-up

- Result: PR #51 Docker review feedback를 반영했다.
- Coverage: Production `runner` image는 `pnpm prune --prod`로 devDependencies를 제거하고, Prisma/seed 등 DB 관리 명령은 devDependencies가 있는 `tools` target/service에서 실행한다. `public` directory를 runtime image에 포함하기 위해 `public/.gitkeep`을 추가했다. Compose environment는 host `.env`의 `DATABASE_URL`과 충돌하지 않도록 `DOCKER_DATABASE_URL` placeholder default를 사용하며, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`도 placeholder default를 사용한다. Host port conflict 때는 `WEB_PORT`와 `NEXTAUTH_URL`을 함께 override한다. Docker contract test는 placeholder 전체 문자열 대신 variable name과 default 핵심값을 분리해 확인한다.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: PR #51 review threads, `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`, `.env.docker.example`, `public/.gitkeep`, `tests/docker/compose.test.ts`.
- Verification: `pnpm exec vitest run tests/docker/compose.test.ts`, `docker compose build web tools`, `POSTGRES_PORT=55433 WEB_PORT=3101 NEXTAUTH_URL=http://localhost:3101 docker compose up -d postgres web`, `POSTGRES_PORT=55433 WEB_PORT=3101 NEXTAUTH_URL=http://localhost:3101 docker compose run --rm tools pnpm exec prisma db push`, `POSTGRES_PORT=55433 WEB_PORT=3101 NEXTAUTH_URL=http://localhost:3101 docker compose run --rm tools pnpm run db:seed`, `curl -I http://127.0.0.1:3101/login`, `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm test`.

## 2026-05-17T23:35:00+09:00 - implementation

- Result: Issue #50 Docker web+DB 실행 구성을 추가했다.
- Coverage: `Dockerfile`은 `runner` target에서 production dependency와 built `.next` output으로 `pnpm start`를 실행하고, `dev` target에서 source-mounted `pnpm run dev`를 지원한다. 기본 `docker-compose.yml`은 `postgres` healthcheck 이후 `web` service를 시작하며, `docker-compose.dev.yml`은 dev target, bind mount, anonymous dependency/build volumes를 적용한다. Docker contract test는 compose/Dockerfile/dockerignore의 핵심 계약을 검증한다.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #50, `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker-compose.dev.yml`, `.env.docker.example`, `tests/docker/compose.test.ts`.
- Verification: `pnpm exec vitest run tests/docker/compose.test.ts`.

## 2026-05-17T23:20:00+09:00 - design

- Result: Issue #50 Dockerized Next.js web service 설계와 구현 계획을 기록했다.
- Coverage: 기존 PostgreSQL-only `docker-compose.yml`을 web+DB 기본 compose로 확장하고, production-style `Dockerfile` runner target과 source-mounted `docker-compose.dev.yml` development override를 함께 제공하는 방향을 확정했다. Docker container 내부 DB URL은 `postgres:5432`, host machine local 개발 URL은 `localhost:55432`로 구분한다.
- Pages: [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #50, `docs/superpowers/specs/2026-05-17-dockerized-next-js-web-service-design.md`, `docs/superpowers/plans/2026-05-17-dockerized-next-js-web-service.md`, `docker-compose.yml`.
- Verification: spec/plan self-review.

## 2026-05-17T23:08:00+09:00 - review follow-up

- Result: PR #49 review에서 지적된 frontmatter property value 표시 edge case를 수정했다.
- Coverage: 일반 property row가 object value를 `[object Object]`로 표시하지 않고 JSON string으로 표시하며, null/undefined value는 literal `null`/`undefined` text 대신 빈 값으로 둔다.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #49 review thread, `components/document-editor/document-properties.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-17T22:49:00+09:00 - implementation

- Result: Issue #48에서 `DocumentEditor`와 `DocumentNavigation`의 동작을 유지하면서 큰 component 파일을 feature-local module로 분리했다.
- Coverage: editor preview/folding/properties/suggestion UI와 navigation panel/row/tree/favorites helper를 하위 module로 나누고, public entrypoint component, route shape, localStorage key, server action contract는 유지했다. `components/document-editor.tsx`는 342줄, `components/document-navigation.tsx`는 384줄로 줄었다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #48, `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`, `docs/superpowers/plans/2026-05-17-document-editor-navigation-refactor.md`, `components/document-editor.tsx`, `components/document-editor/*`, `components/document-navigation.tsx`, `components/document-navigation/*`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/components/document-list.test.tsx tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/wiki-links/preview.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-17T18:16:00+09:00 - plan

- Result: Issue #48 document editor/navigation 구조 리팩토링 구현 계획을 작성했다.
- Coverage: plan은 editor shared types, suggestion popover, folding storage, preview markdown helpers, markdown preview, document properties, navigation helpers, navigation rows, search/favorites panels, 최종 wiki/PR workflow를 task 단위로 나눈다.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`, `docs/superpowers/plans/2026-05-17-document-editor-navigation-refactor.md`.
- Verification: plan self-review.

## 2026-05-17T18:09:00+09:00 - design

- Result: Issue #48 document editor/navigation 구조 리팩토링 설계를 승인하고 spec으로 기록했다.
- Coverage: `components/document-editor.tsx`는 public `DocumentEditor` entrypoint와 editor state를 유지하고 preview/folding/properties/suggestion UI를 feature-local module로 분리한다. `components/document-navigation.tsx`는 public `DocumentNavigation` entrypoint와 container state, keyboard/menu/toast policy를 유지하고 search/favorites/document/folder rows, tree, favorites helper를 하위 module로 분리한다. Navigation 전용 `errors.ts`는 만들지 않고 작은 folder error toast policy는 container에 남긴다.
- Pages: [[Munjib]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #48, 사용자 승인, `components/document-editor.tsx`, `components/document-navigation.tsx`, `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`.
- Verification: spec self-review.

## 2026-05-17T12:15:00+09:00 - regression fix

- Result: Issue #46 branch에서 외부 branch merge 이후 다시 나타난 DocumentEditor 저장 flicker와 preview 줄바꿈 접힘 회귀를 복구했다.
- Coverage: `updateDocumentAction()`과 `createCommentAction()`은 현재 문서 query로 redirect하지 않고 workspace path revalidation만 수행한다. Preview paragraph는 `white-space: pre-wrap`을 유지하고 ReactMarkdown soft line break를 explicit break node로 렌더링해 edit mode 단일 개행과 외부 텍스트 paste 개행을 보존한다. PR review follow-up으로 HTML-to-Markdown 변환의 inline whitespace, backtick code delimiter, inline code significant whitespace, nested list indentation, table cell/row boundary, fenced code block delimiter 선택도 보강했다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 회귀 보고, PR #47 review comments, `app/workspaces/[workspaceSlug]/actions.ts`, `app/globals.css`, `components/document-editor.tsx`, `lib/markdown/html-to-markdown.ts`, `tests/workspace-actions.test.ts`, `tests/markdown/preview-styles.test.ts`, `tests/components/document-editor-preview.test.tsx`, `tests/markdown/html-to-markdown.test.ts`, `tests/e2e/preview-line-breaks.spec.ts`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/markdown/html-to-markdown.test.ts tests/workspace-actions.test.ts tests/markdown/preview-styles.test.ts`, `pnpm exec tsc --noEmit`, `pnpm exec playwright test tests/e2e/preview-line-breaks.spec.ts`.

## 2026-05-17T12:10:00+09:00 - review follow-up

- Result: Issue #46 branch를 최신 main과 merge한 뒤 Properties tags 정책에 맞춰 실패하던 DocumentEditor component tests를 수정했다.
- Coverage: Properties tags row는 YAML frontmatter `tags:` 값만 렌더링하고, 본문 `#tag`는 knowledge graph/tag extraction 용도로만 사용하며 Properties 영역에는 표시하지 않는다. Frontmatter가 없는 문서의 `frontmatter none` placeholder row도 렌더링하지 않는다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 정책 확인, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/markdown/html-to-markdown.test.ts tests/components/document-editor-preview.test.tsx tests/components/metadata-panel.test.tsx tests/components/app-shell.test.tsx tests/markdown/outline.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-17T11:55:00+09:00 - implementation

- Result: Issue #46 rich paste 동작을 추가해 외부 앱에서 복사한 styled text를 Markdown editor에 붙여넣을 때 의미 있는 스타일을 Markdown으로 보존한다.
- Coverage: clipboard `text/html`을 감지하면 CodeMirror paste handler가 기본 paste를 막고 heading, bold, italic, link, list, inline code, code block, blockquote, line break를 semantic Markdown으로 변환해 삽입한다. HTML이 없거나 변환 결과가 비어 있으면 기존 plain text paste 흐름을 유지한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #46, `components/document-editor.tsx`, `lib/markdown/html-to-markdown.ts`, `tests/markdown/html-to-markdown.test.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/markdown/html-to-markdown.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-17T11:24:00+09:00 - review follow-up

- Result: PR #45 Codex review에서 지적한 preview outline navigation edge case를 수정했다.
- Coverage: preview mode에서 접힌 parent section 아래 child heading outline row를 클릭하면 `DocumentEditor`가 target heading의 ancestor fold keys를 먼저 펼치고 DOM target을 다시 조회한 뒤 스크롤한다. 이로써 child heading이 접힘 때문에 DOM에 없던 경우에도 outline click이 no-op으로 끝나지 않는다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #45 unresolved review thread, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`, `pnpm exec vitest run tests/components/metadata-panel.test.tsx tests/components/app-shell.test.tsx tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-17T00:18:00+09:00 - review follow-up

- Result: Issue #44 final review에서 발견된 outline navigation fallback edge case를 수정했다.
- Coverage: `AppShell` heading navigator는 실제 target 처리 여부를 boolean으로 반환하고, `DocumentEditor`는 preview target 또는 CodeMirror line scroll을 성공했을 때만 handled로 보고한다. `MetadataPanel`은 registered navigator가 target을 처리하지 못하면 DOM `data-outline-heading-id` fallback으로 스크롤한다. PR review follow-up으로 `DocumentEditor`의 저장 전 `contentMarkdown` state를 `AppShell` outline document context에 등록해 metadata outline이 live markdown을 우선 사용하게 했고, selector escaping utility는 `lib/outline-targets.ts`로 공유했다. PR review loop 누락 원인은 completion rule이 wiki에는 있었지만 `AGENTS.md`의 hard rule로 고정되지 않았고, draft PR 생성과 review request/wait/recheck 단계가 별도 상태처럼 쓰인 점이었다. `AGENTS.md`, [[Local Development Workflow]], [[Wiki Maintenance Automation]]에 push/PR 선택이 review workflow 시작이라는 규칙, 5분 대기, review thread/CI 재확인, blocker 보고 요구를 명시했다. Plan의 final status checkbox도 구현 완료 상태에 맞춰 갱신했다.
- Pages: [[log|Wiki Log]], [[Local Development Workflow]], [[Wiki Maintenance Automation]].
- Source evidence: final code review, GitHub PR #45 review threads, `AGENTS.md`, `components/app-shell.tsx`, `components/document-editor.tsx`, `components/metadata-panel.tsx`, `lib/outline-targets.ts`, `tests/components/app-shell.test.tsx`, `tests/components/metadata-panel.test.tsx`, `docs/superpowers/plans/2026-05-16-metadata-panel-outline.md`.
- Verification: `pnpm exec vitest run tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/components/metadata-panel.test.tsx tests/components/document-editor-preview.test.tsx tests/components/app-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:lint`.

## 2026-05-16T23:55:00+09:00 - implementation

- Result: Issue #44 metadata panel outline navigation 구현 상태를 durable wiki에 반영했다.
- Coverage: metadata panel 첫 번째 `Outline` tab, `#`-`####` ATX heading extraction, frontmatter/fenced-code/empty-heading exclusion, `DocumentNavigation`-style `border-l` guide lines, preview `data-outline-heading-id`, edit mode CodeMirror line scroll, DOM fallback navigation을 기록했다.
- Changed files: `wiki/Document Editing Workflow.md`, `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`, `docs/superpowers/plans/2026-05-16-metadata-panel-outline.md`.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #44, `docs/superpowers/specs/2026-05-16-metadata-panel-outline-design.md`, `docs/superpowers/plans/2026-05-16-metadata-panel-outline.md`, `lib/markdown/folding.ts`, `components/metadata-panel.tsx`, `components/document-editor.tsx`, `components/app-shell.tsx`, `tests/markdown/outline.test.ts`, `tests/components/metadata-panel.test.tsx`, `tests/components/document-editor-preview.test.tsx`, `tests/components/app-shell.test.tsx`.
- Verification: `pnpm exec vitest run tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/components/metadata-panel.test.tsx tests/components/document-editor-preview.test.tsx tests/components/app-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-05-16T23:19:24+09:00 - design

- Result: metadata panel outline 기능 설계를 승인하고 spec으로 기록했다.
- Coverage: 오른쪽 metadata panel 첫 번째 icon tab으로 `Outline`을 추가하고, 현재 선택 문서의 `#`-`####` heading을 tree로 추출하며, `DocumentNavigation`과 같은 vertical guide line으로 level을 구분하고 row click으로 해당 heading에 스크롤하는 방향을 확정했다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: 사용자 승인, visual companion mockup, `components/metadata-panel.tsx`, `components/document-list.tsx`, `components/document-navigation.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `docs/superpowers/specs/2026-05-16-metadata-panel-outline-design.md`.
- Verification: spec self-review.

## 2026-05-16T19:35:00+09:00 - polish

- Result: Issue #42 metadata panel reopen icon 위치를 조정했다.
- Coverage: 오른쪽 panel collapse 후 남는 `Open metadata panel` icon을 화면 우측 상단에 더 맞게 `right-4 top-1.5` 위치로 조정했다.
- Pages: [[log|Wiki Log]].
- Source evidence: 사용자 UI 조정, `components/app-shell.tsx`, `tests/components/app-shell.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/app-shell.test.tsx`.

## 2026-05-16T19:05:00+09:00 - implementation

- Result: Issue #42 metadata panel tab UI와 오른쪽 panel collapse control을 추가했다.
- Coverage: `MetadataPanel` 상단에 `document-list.tsx` toolbar와 같은 icon tab 영역을 두고 `Attachments`, `Versions`, `Audit log`를 버튼 클릭 시 해당 목록만 표시하도록 바꿨다. Attachments tab이 기본으로 열리고, Versions/Audit log tab은 빈 목록일 때 empty state를 표시한다. Metadata panel toolbar와 reopen icon은 sidebar toolbar와 같은 tooltip pattern을 사용한다. 기존 metadata panel의 local graph UI와 기능은 제거했다. `AppShell`은 오른쪽 panel open/collapse state를 소유하며, metadata panel close button은 오른쪽 sidebar를 제거하고 화면 우측 상단 reopen icon 하나만 남긴다. 오른쪽 sidebar는 좌측 sidebar와 같은 `pt-0` alignment를 사용한다.
- Pages: [[Document Editing Workflow]], [[Munjib]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #42, 사용자 제공 Obsidian metadata panel screenshot, `components/metadata-panel.tsx`, `components/app-shell.tsx`, `tests/components/metadata-panel.test.tsx`, `tests/components/app-shell.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/components/metadata-panel.test.tsx tests/components/app-shell.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-16T18:40:49+09:00 - review follow-up

- Result: PR #41 review feedback를 반영했다.
- Coverage: Markdown import는 zero-byte empty file selection을 required-file error로 처리하고, title derivation은 YAML block scalar marker를 fallback 대상으로 처리한다. 첫 ATX heading fallback은 fenced code block 내부의 `# ...` line을 건너뛰며, settings dialog는 backdrop click으로 닫힌다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #41 review threads, `app/workspaces/[workspaceSlug]/actions.ts`, `components/document-list.tsx`, `lib/documents/import-markdown.ts`, `tests/components/document-list.test.tsx`, `tests/documents/import-markdown.test.ts`.
- Verification: `pnpm exec vitest run tests/documents/import-markdown.test.ts tests/components/document-list.test.tsx`.

## 2026-05-16T17:30:00+09:00 - implementation

- Result: Issue #40 Markdown document import 1차 기능을 추가했다.
- Coverage: `Company Handbook` title row 우측에 toolbar icon과 오른쪽 edge를 맞춘 workspace settings button을 추가했다. Settings button은 document list를 교체하지 않고 modal dialog를 띄우며, dialog 내부는 좌측 settings sidebar와 우측 content pane으로 구성된다. 현재는 `Import` menu를 기본 선택한다. Import content는 Markdown 전용 file form만 제공하고, import validation error는 `lib/service-errors.ts`의 `SERVICE_ERROR_CODES`로 전역 관리한다. Server action은 Markdown file을 읽어 `title` frontmatter, 첫 `# Heading`, file name 순서로 문서 제목을 정한 뒤 기존 `createDocument()` 흐름으로 document, initial version, wiki link/document metadata reconciliation, audit log를 만든다.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #40, 사용자 제공 Notion import screenshots, `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `lib/documents/import-markdown.ts`, `tests/components/document-list.test.tsx`, `tests/documents/import-markdown.test.ts`, `docs/superpowers/specs/2026-05-16-markdown-document-import-design.md`, `docs/superpowers/plans/2026-05-16-markdown-document-import.md`.
- Verification: `pnpm exec vitest run tests/documents/import-markdown.test.ts tests/components/document-list.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-16T16:55:00+09:00 - review follow-up

- Result: PR #39 review feedback를 반영했다.
- Coverage: graph node label Y offset 계산에 쓰이던 literal `8`을 `LABEL_VERTICAL_OFFSET` constant로 추출했다. 동작 변경 없이 readability만 보강한 review follow-up이다.
- Pages: [[log|Wiki Log]].
- Source evidence: PR #39 Gemini review comment, `components/knowledge-graph-view.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-16T13:16:00+09:00 - maintenance

- Result: task 종료와 PR review follow-up 운영 규칙을 wiki에 추가했다.
- Coverage: 모든 task 종료 시 검증과 wiki sync 이후 draft PR을 자동 작성한다. PR 리뷰 요청 완료 후 최소 5분 대기하고, review submission, unresolved thread, inline comment, CI/check 결과를 확인해 actionable feedback이나 실패 check가 있으면 같은 branch에서 추가 수정, 검증, wiki update, commit, push까지 수행한다.
- Pages: [[Local Development Workflow]], [[Wiki Maintenance Automation]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: 사용자 workflow 결정.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-16T12:40:00+09:00 - implementation

- Result: Issue #38 graph settings panel polish를 적용했다.
- Coverage: `KnowledgeGraphView` settings panel을 graph canvas 우측 상단으로 옮기고 `bg-muted` surface로 맞췄다. Panel-level `X` close는 전체 설정창을 숨기고 같은 위치에 reopen icon만 남긴다. `Filters`, `Display`, `Forces` section toggle은 `DocumentNavigation`과 같은 chevron icon을 section text 좌측에 배치한 button을 사용하며, `X` close는 `Filters` header row 우측에 배치한다. Hover focus가 활성일 때 연결되지 않은 node circle과 label을 더 낮은 alpha로 흐리게 표시해 1-hop highlight가 더 두드러지게 했다. Node label은 circle 중심과 겹치지 않도록 node center보다 아래에 그리고, 일정 수준 이상 줌아웃하면 숨긴다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #38, 사용자 제공 Obsidian graph screenshot, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`.

## 2026-05-16T12:08:00+09:00 - review follow-up

- Result: PR #37 graph display control regression을 정리했다.
- Coverage: `Text fade threshold`가 force controls 조작 이후 cooled graph canvas에서 다시 반영되지 않는 문제를 수정했다. Display state 변경 시 `react-force-graph-2d` graph ref의 animation loop를 재개해 custom label drawing이 다시 repaint되도록 했다. 추가 PR review에서 지적된 stale hovered node id도 방어해, graph refresh/removal 이후 존재하지 않는 hover target이 전체 graph를 dim 처리하지 않도록 했다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #37 review follow-up, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`.

## 2026-05-16T01:22:05+09:00 - implementation

- Result: Issue #36 workspace knowledge graph view에 Display와 Forces 설정을 추가했다.
- Coverage: Graph panel은 `Filters` 아래에 `Display`와 `Forces` section을 표시한다. Display controls는 arrows, text fade threshold, node size, link thickness를 `react-force-graph-2d` props와 label drawing에 반영한다. Forces controls는 center force, repel force, link force, link distance를 graph ref의 `d3Force` API에 적용한다. Review follow-up으로 center force는 `forceCenter.strength()`가 아니라 custom `munjib-center` gravity force를 등록하도록 바꿨고, dynamic graph ref가 늦게 mount되어도 기본 force 설정이 적용되도록 했다. Graph link color는 relation-kind color 대신 neutral gray로 통일하고, selected document 또는 hovered node의 1-hop focus link만 더 밝게 표시한다. Graph mode는 normal editor padding 없이 center 영역 높이를 채우고, canvas background는 `DocumentToolbar`와 같은 흰색 surface를 사용한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #36, 사용자 제공 Obsidian graph screenshot, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`, `docs/superpowers/specs/2026-05-16-knowledge-graph-display-force-controls-design.md`, `docs/superpowers/plans/2026-05-16-knowledge-graph-display-force-controls.md`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`, `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx tests/workspace-routes.test.ts`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`, `pnpm run test:e2e`.

## 2026-05-16T00:54:25+09:00 - review follow-up

- Result: PR #35 workspace knowledge graph view review feedback를 반영했다.
- Coverage: `react-force-graph-2d`가 renderer node/link 객체에 붙이는 layout state를 유지하기 위해 renderer 전용 graph 객체 cache를 추가하되, source `KnowledgeGraphData`는 mutation되지 않게 분리했다. 선택 문서가 있을 때는 1-hop 이웃 node/link만 원래 색상으로 유지하고 나머지는 alpha 색상으로 dim 처리한다.
- Pages: [[Document Editing Workflow]], [[Document Knowledge Model]], [[log|Wiki Log]].
- Source evidence: PR #35 Gemini review comments, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`, `pnpm exec vitest run tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/workspace-routes.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-16T00:16:54+09:00 - implementation

- Result: Issue #34 workspace knowledge graph view의 e2e smoke와 durable wiki 문서를 마무리했다.
- Coverage: Sidebar `Graph` 진입, `?graph=1` graph mode, toolbar `Graph view` path, filter panel open/close, graph DTO의 document/tag/wiki/property node와 wiki/tag/property edge semantics, frontmatter wiki link의 graph rendering을 기록했다.
- Pages: [[Document Editing Workflow]], [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #34, `tests/e2e/login.spec.ts`, `components/document-list.tsx`, `components/knowledge-graph-view.tsx`, `components/workspace-center-shell.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `lib/workspace-routes.ts`, `lib/knowledge-graph/model.ts`, `tests/components/knowledge-graph-view.test.tsx`, `tests/knowledge-graph/model.test.ts`.
- Verification: `pnpm run test:e2e`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm exec vitest run tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/workspace-routes.test.ts`, `pnpm exec tsc --noEmit`, `pnpm wiki:sync-check --staged`.

## 2026-05-15T23:07:00+09:00 - plan

- Result: Issue #34 workspace knowledge graph view 구현 계획을 작성했다.
- Coverage: Route helper, graph model, sidebar graph button, workspace shell graph mode, `react-force-graph-2d` graph component, page data wiring, e2e/wiki finalization을 TDD task 단위로 분해했다.
- Pages: [[Document Editing Workflow]], [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-15-workspace-knowledge-graph-view.md`, `docs/superpowers/specs/2026-05-15-workspace-knowledge-graph-view-design.md`.
- Verification: plan self-review, `pnpm wiki:sync-check --staged`, `pnpm wiki:lint`.

## 2026-05-15T22:53:00+09:00 - design

- Result: Issue #34 workspace knowledge graph view 설계를 정리했다.
- Coverage: Sidebar `Graph` icon button, `?graph=1` route state, center graph view, document/tag/wiki/property node model, `react-force-graph-2d` 기반 zoom/pan graph renderer, filter panel, selected document focus behavior를 설계 범위로 확정했다.
- Pages: [[Document Editing Workflow]], [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: GitHub issue #34, `docs/superpowers/specs/2026-05-15-workspace-knowledge-graph-view-design.md`, 사용자 제공 Obsidian graph screenshot.
- Verification: design only.

## 2026-05-14T23:52:00+09:00 - review follow-up

- Result: PR #33 review에서 지적된 sidebar panel 전환 안정성과 Escape UX 회귀를 정리했다.
- Coverage: `DocumentList`의 panel switching handlers를 memoized callback으로 고정해 keyboard shortcut effect가 불필요하게 재등록되지 않도록 했고, search/favorites panel 활성 상태에서 `Escape`가 기본 document list로 되돌아가도록 했다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #33 Gemini review comments, `components/document-list.tsx`, `components/document-navigation.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/components/app-shell.test.tsx tests/components/workspace-center-shell.test.tsx tests/workspace-routes.test.ts`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`.

## 2026-05-14T22:44:00+09:00 - implementation

- Result: Issue #32 document list sidebar를 Obsidian 참고 이미지에 맞춰 단순화했다.
- Coverage: WORKSPACE label과 always-visible title/body search form, quick switcher, template selection을 제거했다. `Company Handbook` 제목 아래에 icon-only `Documents`, `New document`, `New folder`, `Search`, `Favorites` toolbar를 배치했고, left sidebar top padding을 제거해 `Company Handbook` row는 `DocumentTabs`, icon toolbar row는 `DocumentToolbar`와 vertical alignment를 맞춘다. Document creation은 항상 blank `Untitled` 문서로 시작한다. `Search` button과 `Ctrl+K`는 document list 영역을 검색 결과 panel로 전환하고, `Favorites` button은 favorites-only panel로 전환하며, folder-shaped `Documents` button은 기본 document list로 되돌린다. 각 toolbar icon은 shadcn/Radix Tooltip hover 설명을 제공한다. 기존에 `Recents` 위로 favorites section을 상시 노출하던 코드는 제거했다. `Recents` / `Documents` section label은 기존 uppercase/tracking style로 복구하고, document/folder row hover 및 selected highlight를 `bg-slate-200`으로 강화했다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #32, 사용자 제공 Obsidian screenshot, `components/document-list.tsx`, `components/document-create-controls.tsx`, `components/document-navigation.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `tests/components/document-list.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/components/workspace-center-shell.test.tsx tests/workspace-routes.test.ts`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`.

## 2026-05-14T00:55:00+09:00 - implementation

- Result: Issue #31 Obsidian-style document title and mode toolbar UI를 구현했다.
- Coverage: Document title input을 borderless heading-size control로 변경했다. Edit/preview text controls는 editor 내부에서 제거하고 navigation toolbar 오른쪽 single icon toggle로 이동했다. Toolbar path는 left navigation buttons와 right mode toggle 사이의 centered column에 표시된다. Mode 전환 시 workspace center scroll position을 보존한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #31, 사용자 제공 Obsidian screenshot, `components/document-editor.tsx`, `components/document-toolbar.tsx`, `components/document-view-mode.tsx`, `components/workspace-center-shell.tsx`, `tests/components/document-editor-preview.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/components/workspace-center-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`.

## 2026-05-13T00:20:00+09:00 - refinement

- Result: Issue #29 document tabs와 navigation toolbar의 후속 UI 피드백을 반영했다.
- Coverage: App shell을 viewport height에 고정해 workspace root vertical scroll을 제거하되, 다른 routes의 document root scroll은 막지 않는다. Tab strip `+` button은 마지막 tab 바로 오른쪽에 배치하고, row 폭이 부족하면 tab width를 함께 줄인다. Minimum width 이후 overflow tab은 horizontal scroll로 접근 가능하게 했다. Sidebar Open in new tab은 search result context의 `q` query를 유지한다. Toolbar forward button은 readable document forward target이 있을 때만 활성화한다. Review follow-up으로 tab reconciliation과 document history edge-case 표현을 명확히 했다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 피드백, PR #30 review feedback, `components/app-shell.tsx`, `app/globals.css`, `components/document-tabs.tsx`, `components/document-navigation.tsx`, `components/document-toolbar.tsx`, `components/workspace-center-shell.tsx`, `lib/document-tabs.ts`, `docs/superpowers/specs/2026-05-11-document-tabs-navigation-toolbar-design.md`, `tests/document-tabs.test.ts`, `tests/components/workspace-center-shell.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/document-tabs.test.ts tests/components/workspace-center-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`.

## 2026-05-12T00:00:00+09:00 - review

- Result: Issue #29 document tabs behavior를 사용자 피드백에 맞춰 조정했다.
- Coverage: 일반 document 선택은 현재 active tab을 교체하고, tab strip 오른쪽 `+` button과 sidebar document row `...` menu의 Open in new tab만 새 tab instance를 추가한다. Inactive tab close는 현재 folder/root context를 유지한다. Root body vertical scroll은 app shell 안쪽 scroll container로 한정했다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 피드백, `lib/document-tabs.ts`, `components/use-document-tabs.ts`, `components/document-tabs.tsx`, `components/document-navigation.tsx`, `components/workspace-center-shell.tsx`, `app/globals.css`, `tests/document-tabs.test.ts`, `tests/components/workspace-center-shell.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/document-tabs.test.ts tests/components/workspace-center-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`.

## 2026-05-11T00:30:00+09:00 - implementation

- Result: Issue #29 document tabs and navigation toolbar를 구현했다.
- Coverage: workspace center 상단 tab strip, workspace-scoped `localStorage` tab state, active `?document=<id>` routing, tab close target selection, browser history back/forward toolbar, current document/folder path display, unit/component/e2e coverage.
- Pages: [[Document Editing Workflow]], [[Folder Hierarchy Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #29, `lib/document-tabs.ts`, `components/workspace-center-shell.tsx`, `components/document-tabs.tsx`, `components/document-toolbar.tsx`, `components/use-document-tabs.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/document-tabs.test.ts`, `tests/components/workspace-center-shell.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/document-tabs.test.ts tests/components/workspace-center-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`, browser visual check.

## 2026-05-11T00:15:00+09:00 - plan

- Result: Issue #29 document tabs and navigation toolbar implementation plan을 추가했다.
- Coverage: pure tab state model, workspace center chrome components, App Router page wiring, Playwright smoke, browser visual check, wiki maintenance 순서.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-11-document-tabs-navigation-toolbar.md`.

## 2026-05-11T00:00:00+09:00 - design

- Result: Issue #29 document tabs and navigation toolbar 설계를 추가했다.
- Coverage: Obsidian 참고 이미지 `wiki/designs/obsidian1.png` 기준의 상단 문서 탭 strip, 탭 하단 browser history 기반 back/forward toolbar, 현재 document/folder path 표시, workspace-scoped `localStorage` 탭 상태, 기존 `?document=<id>` active routing 유지, multi-editor unsaved buffer 보존 제외 범위를 정리했다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[Folder Hierarchy Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #29, `docs/superpowers/specs/2026-05-11-document-tabs-navigation-toolbar-design.md`, `wiki/designs/obsidian1.png`.

## 2026-05-10T17:55:00+09:00 - review

- Result: PR #27 review를 반영해 heading folding의 CRLF preview scan, no-heading preview rendering, live editor fold persistence를 보강했다.
- Coverage: Preview helper는 original offset을 보존하는 CRLF-safe line scan을 사용하고, shared definition scan은 CRLF fenced code block 종료를 인식한다. Heading 없는 preview는 definition을 재첨부하지 않으며, edit mode fold 저장은 stale React state 대신 CodeMirror live document text에서 fold tree를 계산한다. Fold key validation은 stable sorted output을 반환한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: PR #27 review comments, `components/document-editor.tsx`, `lib/markdown/folding.ts`, `tests/markdown/folding.test.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-10T17:40:00+09:00 - review

- Result: Preview heading folding follow-up으로 chevron hover/focus 배경과 border/ring 제거, heading level별 section spacing, CRLF fenced code block 뒤 heading 인식 문제를 보정했다.
- Coverage: Preview chevron은 content flow를 밀지 않는 absolute 배치를 유지하면서 hover background와 focus border/ring을 쓰지 않는다. `#`, `##`, `###` section에는 level별 margin을 적용하고, CRLF 문서의 backtick code fence 종료도 parser가 인식한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 요청, `components/document-editor.tsx`, `lib/markdown/folding.ts`, `tests/markdown/folding.test.ts`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-10T00:00:00+09:00 - review

- Result: Issue #26 folder/document row navigation polish를 보강했다.
- Coverage: `FOLDER_NOT_EMPTY` user feedback은 redirect와 `folderError` query 없이 server action result를 받아 shadcn Sonner toast로 표시한다. PR review에 따라 favorite folder row menu, folder trash confirmation, write-permitted document trash action, row-level document trash conditional navigation, folder rename/archive context preservation, create action server redirect preservation을 반영했다. Row action menu는 외부 클릭 시 닫히고, document row hover/selected highlight와 sidebar section/row font-size 조정을 유지한다.
- Pages: [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 피드백, `components/document-create-controls.tsx`, `components/ui/sonner.tsx`, `app/layout.tsx`, `components/document-navigation.tsx`, `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `package.json`, `tests/e2e/login.spec.ts`.

## 2026-05-08T01:00:00+09:00 - review

- Result: Preview heading chevron이 heading content를 밀어내지 않도록 absolute overlay 배치로 조정했다.
- Coverage: 접힘/펼침 button은 heading 왼쪽 flow 바깥에 배치하고, expanded hover/focus 노출과 folded 상시 노출 behavior는 유지한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 요청, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-06T01:05:00+09:00 - review

- Result: Issue #25 final review blocker를 반영해 edit mode CodeMirror folding도 preview와 같은 문서별 fold state를 저장하고, preview chunk의 multi-line reference/footnote definition 공유를 보강했다.
- Coverage: CodeMirror `foldedRanges`를 heading body line range와 CodeMirror heading fold range 모두에 matching해 `munjib:heading-folds:<documentId>`에 raw heading key를 저장한다. Preview chunk 공유 definition은 empty marker line과 definition line 뒤의 indented/blank continuation line까지 포함한다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: final review blockers, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`, GitHub issue #25.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`.

## 2026-05-06T00:45:00+09:00 - review

- Result: Issue #25 final review blocker를 반영해 heading-folded preview chunk에서도 문서 전체 Markdown reference definition을 공유하고, stale planned wording을 현재 구현 상태로 정리했다.
- Coverage: `[ref][x]`와 `[x]: https://example.com`이 서로 다른 heading section에 있어도 preview link가 resolve되며, Munjib/PRD/index 상태판이 edit/preview와 heading folding 구현 완료 상태를 말한다.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: final review blockers, `components/document-editor.tsx`, `tests/components/document-editor-preview.test.tsx`, GitHub issue #25.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-05-06T00:43:00+09:00 - implementation

- Result: Issue #26 folder row hover actions menu를 구현했다.
- Coverage: folder row hover/focus highlight, path-qualified action labels, `...` menu, row-level `+` document creation, inline folder rename, empty folder trash, non-empty folder trash guard feedback, folder favorites, document favorite menu migration, always-visible star icon removal.
- Pages: [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #26, `components/document-navigation.tsx`, `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec tsc --noEmit`, `pnpm run test:e2e`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-05-05T23:58:00+09:00 - plan

- Result: Issue #26 folder row hover actions menu implementation plan을 추가했다.
- Coverage: folder mutation actions, sidebar action prop threading, document/folder row menus, folder favorite/error UI, Playwright smoke, wiki maintenance 순서.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-05-folder-row-hover-actions-menu.md`.

## 2026-05-05T23:55:00+09:00 - design

- Result: Issue #26 folder row hover actions menu 설계를 추가하고 Notion-style 참고 이미지 `wiki/designs/notion1.png`를 design evidence로 등록했다.
- Coverage: folder row hover highlight, `...` menu, row-level `+` child document creation, folder rename/archive/favorite actions, existing star icon removal and document favorite menu migration.
- Pages: [[designs/index|UI Design Excalidraw Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #26, `docs/superpowers/specs/2026-05-05-folder-row-hover-actions-menu-design.md`, `wiki/designs/notion1.png`.

## 2026-05-05T23:50:00+09:00 - implementation

- Result: Issue #25에서 markdown heading folding을 구현하고 split mode를 제거했다.
- Coverage: Preview heading chevron folding, edit mode CodeMirror fold gutter/restoration, 문서별 `localStorage` fold state, wiki-link preview regression.
- Pages: [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: GitHub issue #25, `components/document-editor.tsx`, `lib/markdown/folding.ts`, `tests/markdown/folding.test.ts`, `tests/components/document-editor-preview.test.tsx`, `tests/wiki-links/preview.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.

## 2026-05-05T23:45:00+09:00 - planning

- Result: Issue #25 Markdown heading folding 구현 계획을 작성했다.
- Coverage: markdown folding pure model, preview chevron UI와 localStorage, CodeMirror fold restoration, split mode 제거, regression/wiki verification tasks.
- Pages: [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-05-markdown-heading-folding.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-05T23:35:00+09:00 - maintenance

- Result: 기존 feature branch에 다른 issue 작업이 있으면 `git worktree` 또는 clean `main` checkout으로 새 작업공간을 분리해야 한다는 운영 규칙을 추가했다.
- Coverage: `wiki:feature-start`가 이미 feature branch에서는 새 branch를 만들지 않는 동작의 전제, worktree 사용 예시, issue #25 branch separation recovery.
- Pages: [[Local Development Workflow]], [[Wiki Maintenance Automation]], [[log|Wiki Log]].
- Source evidence: Issue #25 설계 커밋을 `issue-23-centralize-service-error-codes`에서 `issue-25-markdown-heading-folding`으로 분리한 작업.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-05T23:10:00+09:00 - review

- Result: PR #24 리뷰를 반영해 document service에 남아 있던 document 관련 error code literal을 `SERVICE_ERROR_CODES`에 추가했다.
- Coverage: `DOCUMENT_NOT_FOUND`, `DOCUMENT_VERSION_NOT_FOUND`, `DOCUMENT_LINK_NOT_FOUND`를 service error registry에 포함하고 document service가 상수를 참조하도록 변경.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: PR #24 review comments, `lib/service-errors.ts`, `lib/documents/service.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts tests/documents/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T22:55:00+09:00 - review

- Result: PR #22 추가 리뷰를 반영해 slash-containing title link가 path-qualified fallback 때문에 깨지지 않도록 보강했다.
- Coverage: path-qualified document path를 먼저 resolve하고, path match가 없으면 `[[Q1/Q2 Plan]]` 같은 slash-containing title을 title slug로 fallback resolve한다. Broken link creation도 parent folder path가 없으면 root slash-title 문서로 생성한다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #22 review comments, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `lib/documents/service.ts`, `tests/wiki-links/reconcile.test.ts`, `tests/wiki-links/preview.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T18:20:00+09:00 - design

- Result: Issue #25 Markdown heading folding 설계를 기록했다.
- Coverage: Obsidian-style heading hierarchy folding, Preview chevron hover/focus behavior, Edit mode CodeMirror heading folding, 문서별 `localStorage` fold state, split mode 제거 계획.
- Pages: [[Munjib]], [[Project PRD]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #25, `docs/superpowers/specs/2026-05-05-markdown-heading-folding-design.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-05T15:25:00+09:00 - review

- Result: PR #22 추가 리뷰를 반영해 path-qualified broken link creation과 folder move slug 충돌을 수정했다.
- Coverage: `[[Operations/Incident Runbook]]` broken link에서 `/operations` folder 아래 `Incident Runbook` 문서 생성, 다음 reconciliation에서도 link 유지, folder move 시 destination sibling slug 재계산.
- Pages: [[Folder Hierarchy Model]], [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #22 review comments, `lib/documents/service.ts`, `lib/folders/service.ts`, `lib/wiki-links/targets.ts`, `tests/folders/service.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts`, `pnpm exec vitest run tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T15:05:00+09:00 - implementation

- Result: Issue #23에서 folder/document service error code 문자열을 `SERVICE_ERROR_CODES`로 중앙화했다.
- Coverage: workspace/folder not found, parent folder not found, folder move cycle, non-empty folder archive, document slug retry exhaustion code를 `lib/service-errors.ts`로 이동하고 service/tests가 상수를 참조하도록 변경.
- Pages: [[Local Development Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #23, PR #22 Gemini review comments, `lib/service-errors.ts`, `lib/folders/service.ts`, `lib/documents/service.ts`, `tests/folders/service.test.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts tests/documents/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T14:45:00+09:00 - review

- Result: PR #22 리뷰 1,2번을 반영해 folder parent workspace 검증과 path-qualified wiki target 정규화를 보강했다.
- Coverage: `createFolder`/`moveFolder`에서 parent folder가 같은 workspace의 active folder인지 검증, `[[Operations/Incident Runbook]]` 같은 multi-word path-qualified target의 reconcile/preview resolve.
- Pages: [[Folder Hierarchy Model]], [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #22 review comments, `lib/folders/service.ts`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `tests/folders/service.test.ts`, `tests/wiki-links/reconcile.test.ts`, `tests/wiki-links/preview.test.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts`, `pnpm exec vitest run tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T14:20:00+09:00 - implementation

- Result: Workspace sidebar folder tree를 editor navigation link에서 accordion disclosure UI로 조정했다.
- Coverage: folder row chevron toggle, 펼쳐진 child group 세로 guide line, folder toggle 시 editor 유지, `Recents` 최대 5개 표시, recents depth-independent padding, 전체 tree의 `Documents` heading.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: `components/document-navigation.tsx`, `tests/e2e/login.spec.ts`, `wiki/designs/obsidian1.png`, `docs/superpowers/plans/2026-05-05-real-folder-hierarchy.md`.
- Verification: `pnpm exec tsc --noEmit`, `pnpm exec vitest run tests/workspace-tree.test.ts`, `pnpm run test:e2e`.

## 2026-05-05T13:00:00+09:00 - implementation

- Result: Issue #20 최종 integration을 위해 seed data와 project wiki 현황을 실제 folder hierarchy 구현 기준으로 정리했다.
- Coverage: `/operations` folder seed, folder 하위 `Operations Runbook` seed, folder-like 문서 생성 표현 제거, PRD/제품/index 문서의 구현 현황 갱신.
- Pages: [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Folder Hierarchy Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `prisma/seed.ts`, `wiki/Munjib.md`, `wiki/Project PRD.md`, `wiki/Document Knowledge Model.md`, `wiki/Folder Hierarchy Model.md`, `wiki/index.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm exec vitest run tests/folders/path.test.ts tests/folders/service.test.ts tests/documents/service.test.ts tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts tests/wiki-links/autocomplete.test.ts tests/workspace-tree.test.ts`, `pnpm test`, `pnpm run build`, `pnpm run test:e2e`, `pnpm exec tsc --noEmit`.

## 2026-05-05T12:50:00+09:00 - implementation

- Result: Wiki link autocomplete가 duplicate title 후보에 path-qualified target을 삽입하도록 변경했다.
- Coverage: title/path query matching, duplicate title count 기반 `[[Folder/Title]]` insert text, editor suggestion label과 insertion wiring.
- Pages: [[Wiki Links And Backlinks]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/wiki-links/autocomplete.ts`, `components/document-editor.tsx`, `tests/wiki-links/autocomplete.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/autocomplete.test.ts tests/wiki-links/preview.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T12:45:00+09:00 - implementation

- Result: Issue #20 workspace 화면을 folder/document tree로 전환하고, `New folder`를 실제 `Folder` row 생성으로 분리했다.
- Coverage: active folders 조회, readable document filtering helper, folder selection query, folder detail panel, selected-folder document creation, path-aware navigation/quick switcher labels, schema 변경에 맞춘 seed upsert key 조정.
- Pages: [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `app/workspaces/[workspaceSlug]/page.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `components/document-list.tsx`, `components/document-navigation.tsx`, `components/folder-detail.tsx`, `lib/workspace-tree.ts`, `prisma/seed.ts`, `tests/workspace-tree.test.ts`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/workspace-tree.test.ts tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts tests/documents/service.test.ts tests/folders/service.test.ts`, `pnpm exec tsc --noEmit`.

## 2026-05-05T01:00:00+09:00 - implementation

- Result: Wiki link reconciliation과 preview가 folder path를 인식하도록 변경했다.
- Coverage: path-qualified wikilink의 document path resolve, duplicate title-only link의 `isAmbiguous` 저장, ambiguous link panel data, preview의 path-qualified rendering과 ambiguous plain text fallback.
- Pages: [[Wiki Links And Backlinks]], [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `lib/wiki-links/service.ts`, `lib/wiki-links/types.ts`, `tests/wiki-links/reconcile.test.ts`, `tests/wiki-links/preview.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/reconcile.test.ts tests/wiki-links/preview.test.ts`.

## 2026-05-05T00:50:00+09:00 - implementation

- Result: Document service를 folder-aware하게 변경했다.
- Coverage: `CreateDocumentInput.folderId`, folder별 document slug/path 계산, duplicate title의 cross-folder 허용, title update/version restore path 보존, `moveDocument()`와 `document.moved` audit log.
- Pages: [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: `lib/documents/service.ts`, `lib/documents/types.ts`, `tests/documents/service.test.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts tests/documents/service.test.ts`.

## 2026-05-05T00:40:00+09:00 - implementation

- Result: Folder service를 추가했다.
- Coverage: create, rename, move, archive folder mutation, workspace write 권한 검사, audit log 기록, descendant path recalculation, move cycle guard, non-empty archive guard.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: `lib/folders/service.ts`, `lib/folders/types.ts`, `tests/folders/service.test.ts`.
- Verification: `pnpm exec vitest run tests/folders/service.test.ts`.

## 2026-05-05T00:30:00+09:00 - implementation

- Result: Folder hierarchy path helper를 추가했다.
- Coverage: root/nested folder path 정규화, parent path와 child slug 결합, document path를 path-qualified wikilink target label로 변환.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: `lib/folders/path.ts`, `tests/folders/path.test.ts`.
- Verification: `pnpm exec vitest run tests/folders/path.test.ts`.

## 2026-05-05T00:20:00+09:00 - implementation

- Result: Issue #20 folder hierarchy의 첫 구현 단계로 Prisma schema와 migration에 `Folder`, `Document.folderId`, `DocumentLink.isAmbiguous`를 추가했다.
- Coverage: workspace-folder relation, nested folder parent relation, folder/document path uniqueness, root/folder별 slug partial unique index, folder creator/updater relation, ambiguous wiki link 저장 필드.
- Pages: [[Document Knowledge Model]], [[log|Wiki Log]].
- Source evidence: `prisma/schema.prisma`, `prisma/migrations/20260505001000_add_folder_hierarchy/migration.sql`.
- Verification: `pnpm exec prisma validate`, `pnpm exec prisma generate`, `pnpm exec prisma migrate deploy`.

## 2026-05-05T00:00:00+09:00 - planning

- Result: Issue #20 실제 folder hierarchy 구현 계획을 작성했다.
- Coverage: Prisma `Folder` schema, path helper, folder service, folder-aware document service, path-qualified wikilink resolution, ambiguous link 상태, workspace tree UI, autocomplete, seed, wiki maintenance, verification command 순서.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: `docs/superpowers/plans/2026-05-05-real-folder-hierarchy.md`, `docs/superpowers/specs/2026-05-04-real-folder-hierarchy-design.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-04T18:55:00+09:00 - planning

- Result: Issue #20 실제 folder hierarchy 설계를 wiki에 반영했다. `Folder`는 별도 컨테이너 model이고, `Document.folderId`와 path 기반 위치를 사용하며, 서로 다른 folder의 duplicate title을 허용한다.
- Coverage: path-qualified wikilink, title-only ambiguous link fallback, workspace-write folder 관리 권한, folder-specific permission 제외, 비어 있지 않은 folder archive 차단, 관련 implementation plan 필수 wiki 업데이트 범위.
- Pages: [[Folder Hierarchy Model]], [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #20, `docs/superpowers/specs/2026-05-04-real-folder-hierarchy-design.md`, Obsidian Hub beginner guide, `prisma/schema.prisma`, `lib/documents/service.ts`, `lib/wiki-links/preview.ts`, `lib/wiki-links/reconcile.ts`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-04T18:00:00+09:00 - maintenance

- Result: `Document Knowledge Model`에 현재 `prisma/schema.prisma` 전체 model set을 Mermaid `erDiagram`으로 추가했다.
- Coverage: 조직, workspace, 사용자 membership, 문서 tree/version/link, tag/property, attachment/comment, permission, audit log 관계를 한 다이어그램에서 확인할 수 있게 했다.
- Pages: [[Document Knowledge Model]], [[log|Wiki Log]].
- Source evidence: GitHub issue #21, `prisma/schema.prisma`, `docs/superpowers/specs/2026-05-04-mermaid-erd-wiki-design.md`, `docs/superpowers/plans/2026-05-04-mermaid-erd-wiki.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-04T17:50:00+09:00 - design

- Result: 현재 Prisma schema 전체를 `Document Knowledge Model`에 Mermaid `erDiagram`으로 추가하기 위한 설계를 확정했다.
- Coverage: ERD 대상은 `prisma/schema.prisma`의 전체 model set이며, enum은 Mermaid entity로 분리하지 않고 기존 prose 설명에 유지한다.
- Pages: [[Document Knowledge Model]], [[log|Wiki Log]].
- Source evidence: GitHub issue #21, `docs/superpowers/specs/2026-05-04-mermaid-erd-wiki-design.md`, `prisma/schema.prisma`.
- Verification: spec self-review에서 placeholder, TODO, scope ambiguity 없음.

## 2026-05-04T12:35:00+09:00 - review

- Result: Properties Links row가 content 영역의 `[[...]]`와 backlinks를 포함하지 않고 YAML frontmatter `links:` 안의 `[[...]]` outgoing만 표시하도록 수정했다.
- Coverage: `parseFrontmatterWikiLinks()`가 YAML `links:` 배열만 읽고, `DocumentLink.sortOrder`가 markdown 파일의 links 배열 순서를 보존하며, `getDocumentLinkPanels()`는 현재 frontmatter `links:` 기준으로 stale/content link row를 필터링하고 그 순서로 outgoing links를 조회한다. Properties row는 frontmatter key 순서에 맞춰 `tags`와 `links` canonical row를 해당 key 위치에 렌더링한다.
- Pages: [[Wiki Links And Backlinks]], [[Document Knowledge Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 보고, `lib/wiki-links/parser.ts`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/service.ts`, `prisma/schema.prisma`, `prisma/migrations/20260504123500_add_document_link_sort_order/migration.sql`, `tests/wiki-links/parser.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/parser.test.ts tests/wiki-links/reconcile.test.ts tests/documents/service.test.ts`.

## 2026-05-04T12:25:00+09:00 - review

- Result: Properties 영역의 frontmatter property 표시 순서가 markdown 파일의 YAML key 순서와 달라지던 문제를 수정했다.
- Coverage: `DocumentProperty.sortOrder`를 추가하고 metadata reconciliation 시 YAML key 순서를 저장하며, workspace page는 `sortOrder` 기준으로 properties를 조회한다.
- Pages: [[Document Knowledge Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 보고, `prisma/schema.prisma`, `prisma/migrations/20260504122500_add_document_property_sort_order/migration.sql`, `lib/document-metadata/reconcile.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/documents/service.test.ts`.
- Verification: `pnpm exec vitest run tests/documents/service.test.ts tests/document-metadata/parser.test.ts tests/document-metadata/display.test.ts`.

## 2026-05-04T12:15:00+09:00 - review

- Result: Properties 영역에서 YAML frontmatter `links` key가 canonical Links row와 중복 표시되던 문제와 preview content 영역에 YAML frontmatter가 재차 표시되던 문제를 수정했다.
- Coverage: `links` frontmatter property는 일반 property 목록에서 숨기고, outgoing/backlink/broken link rendering은 기존 Links row에만 맡긴다. Markdown preview는 YAML frontmatter block을 제거한 본문만 렌더링한다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: 사용자 보고, `components/document-editor.tsx`, `lib/document-metadata/display.ts`, `lib/document-metadata/parser.ts`, `tests/document-metadata/display.test.ts`, `tests/document-metadata/parser.test.ts`.
- Verification: `pnpm exec vitest run tests/document-metadata/display.test.ts tests/document-metadata/parser.test.ts tests/wiki-links/preview.test.ts tests/wiki-links/parser.test.ts`.

## 2026-05-04T01:20:00+09:00 - review

- Source evidence: PR #17 review comments by Codex and Gemini, `lib/wiki/feature-start.ts`, `tests/wiki/feature-start.test.ts`, [[Wiki Maintenance Automation]].
- Affected pages: [[Wiki Maintenance Automation]], [[log|Wiki Log]].
- Result: feature-start workflow가 GitHub Enterprise 같은 custom host의 issue URL도 parse하고, command 실패 시 stderr를 우선 표시하도록 리뷰 피드백을 반영했다.
- Verification: `pnpm exec vitest run tests/wiki/feature-start.test.ts`, `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-04T00:00:00+09:00 - maintenance

- Source evidence: GitHub issue #16, `docs/superpowers/specs/2026-05-04-feature-start-workflow-design.md`, `docs/superpowers/plans/2026-05-04-feature-start-workflow.md`, `AGENTS.md`, `scripts/wiki/feature-start.ts`, `lib/wiki/feature-start.ts`, `package.json`.
- Affected pages: [[Wiki Maintenance Automation]], [[Local Development Workflow]], [[index|Wiki Index]].
- Result: 신규 기능 구현 전 GitHub issue를 발행하고, `main`에서는 issue branch를 생성하는 feature-start workflow를 wiki 운영 절차에 추가했다.
- Verification: `pnpm exec vitest run tests/wiki/feature-start.test.ts`, `pnpm wiki:manifest`, `pnpm wiki:lint`.

## 2026-05-03T17:40:00+09:00 - maintenance

- Result: Markdown preview에서 `[[...]]` wiki link text를 Obsidian-style document navigation link로 렌더링하도록 구현했다.
- Coverage: resolved wiki link의 `?document=<id>` preview navigation, alias label, unresolved target의 bracket 없는 plain text fallback, embed/inline/fenced-code 제외.
- Pages: [[Wiki Links And Backlinks]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/document-editor.tsx`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/parser.test.ts`, `pnpm run build`.

# 2026-07-13T00:00:00+09:00 - security

- Result: Leaf 13B Task 5 adds append-only migration prefix/checksum admission,
  expand/contract policy checks, separated PostgreSQL roles, and the
  PRE_JOURNAL database-role-v1 manifest/builder. Web/RAG authority excludes
  DDL, truncate, ownership, and journal roles; fixed migrator entrypoints clear
  caller libpq variables before using a file-backed credential.
- Pages: [[CI CD And Monitoring Workflow]], [[Local Development Workflow]], [[index|Wiki Index]].
- Source evidence: `lib/deploy/migration-history.ts`, `lib/deploy/migration-policy.ts`,
  `deploy/postgres/roles-only.sql`, `deploy/postgres/finalize-ownership.sql`,
  `deploy/postgres/verify-role-separation.sql`,
  `deploy/host-bundles/database-role-v1/manifest.json`, and focused deploy tests.
- Verification: focused migration/role/bundle Vitest suites (16 tests),
  `pnpm exec tsc --noEmit --pretty false`, and migration ledger checker.

- Result: PR #174 review follow-up closes six auth-runtime/login gaps. `resolveAuthSecret()` and `resolveDefaultRuntime()` now default to the strict file reader; Google UI availability uses the validated file-backed runtime without exposing secret bytes; trial provider/UI registration share the development deployment gate; development treats a blank direct Google secret as disabled; and owner bootstrap lowercases/validates email before upsert.
- Follow-up: Leaf 13B role bootstrap now hardens every pre-existing role's
  login/escalation attributes, grants schema-owner migration authority before
  the first migration, captures caller libpq role state before RESET ROLE, and
  revokes Web/RAG access to the append-only `_prisma_migrations` ledger.
- Final follow-up: schema-owner assignment is idempotent for pre-existing
  extension schemas, and the migration-history checker fail-closed normalizes
  Prisma snake_case exports before exact prefix/checksum admission.
- External review follow-up: Prisma entrypoints now construct URL-encoded
  password/options into `DATABASE_URL` from fixed secret files, migration rows
  sort canonically before validation, policy regexes stay within statements,
  and `_prisma_migrations` ACL revocation is guarded for fresh databases.
- Final deterministic-order follow-up: migration history sorting now uses the
  same locale-independent code-unit comparator as filesystem migration ordering,
  with mixed-case regression coverage.
- Compose interpolation follow-up: runtime credential variables are escaped for
  Compose (`$$`) and inherited `PGOPTIONS` is explicitly unset before URL option
  construction; `docker compose config` coverage prevents empty interpolation.
- Migration policy follow-up: quoted semicolons are outside the accepted static
  grammar and fail closed instead of crossing statement boundaries.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]].
- Source evidence: PR #174 review comments, `lib/auth/config.ts`, `lib/auth/runtime.ts`, `app/login/login-form.tsx`, `scripts/security/bootstrap-owner.ts`, and focused auth/component/security tests.
- Verification: `pnpm exec vitest run tests/auth/config.test.ts tests/auth/runtime.test.ts tests/security/bootstrap-owner.test.ts tests/components/login-form.test.tsx`, `pnpm exec tsc --noEmit`.

- Result: auth-runtime browser oracle no longer skips database assertions. Each run creates an isolated pgvector PostgreSQL container/network, deploys the schema, connects the production runner and Playwright to that disposable database, and removes it in `finally`.
- Coverage: unlinked OAuth zero-row policy, exact linked account with token/profile media stripping, historical external image session null projection, and cleanup are now fail-closed DB-backed checks.
- Pages: [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[CI CD And Monitoring Workflow]].
- Source evidence: `scripts/security/run-auth-runtime-e2e.ts`, `tests/e2e/auth-runtime.spec.ts`.

## 2026-05-04T01:55:00+09:00 - review

- Result: PR #19 review feedback에 따라 markdown preview 변환이 multi-line inline code span, longer fenced code block, escaped wiki link, indented code block을 올바르게 보존하고, slug collision에서 임의 target을 고르지 않도록 보강했다.
- Coverage: matching backtick delimiter 기반 inline code span tracking, opening fence marker/width 기반 fenced code tracking, escaped `\[[...]]` literal fallback, 4-space/tab indented code block preservation, preview candidate slug map memoization, ReactMarkdown link component memoization, duplicate title slug ambiguity fallback.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: PR #19 review comments, `components/document-editor.tsx`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/parser.test.ts`.

## 2026-05-03T13:25:00+09:00 - maintenance

- Result: LLM wiki 운영 방식을 커밋 누락 방지에서 Ingest, Query, Lint 기반의 영속 지식층 관리 규칙으로 확장했다.
- Coverage: agent-level operating loop, query answer 환류, semantic lint checklist, 타입별 page template, source evidence 기록 규칙, index 상태판.
- Pages: `AGENTS.md`, [[Wiki Schema]], [[Wiki Maintenance Automation]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `llm-wiki.md`, 사용자 제공 LLM wiki 관리 방향 요약, `AGENTS.md`, `wiki/Wiki Schema.md`, `wiki/Wiki Maintenance Automation.md`.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check`.

## 2026-05-03T13:10:00+09:00 - maintenance

- Result: wiki sync 자동화 이전에 누락된 신규 기능 현황을 현재 code 기준으로 보강했다.
- Coverage: search/navigation, editor modes, properties, wiki link autocomplete, permission-filtered links/backlinks, broken link blank document creation, folder-like document creation, tags/frontmatter properties, attachments, comments, version restore, local graph, document-level permissions.
- Pages: [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[index|Wiki Index]].
- Source evidence: `git log`, `prisma/schema.prisma`, `app/workspaces/[workspaceSlug]/*`, `components/document-editor.tsx`, `components/document-navigation.tsx`, `components/metadata-panel.tsx`, `lib/documents/service.ts`, `lib/wiki-links/*`, `lib/document-metadata/*`, `lib/attachments/service.ts`, `lib/comments/service.ts`, `tests/e2e/login.spec.ts`.

## 2026-05-03T00:00:00+09:00 - maintenance

- Result: 커밋 전 source 변경을 기준으로 wiki 후보 page를 제안하고 wiki maintenance 누락을 감지하는 [[Wiki Maintenance Automation]] workflow를 추가했다.
- Tooling: `pnpm wiki:sync-plan`, `pnpm wiki:sync-check`, `pnpm wiki:install-hooks`, `.githooks/pre-commit`.
- Source evidence: `llm-wiki.md`, `AGENTS.md`, `.githooks/pre-commit`, `lib/wiki/sync.ts`, `package.json`.

## 2026-04-29T01:05:00+09:00 - maintenance

- Result: Obsidian에서 `[[...]]` 링크가 실제 note로 열리도록 주요 wiki page 파일명을 link target과 일치시켰다.
- Tooling: `wiki/index.md`와 `wiki/log.md`처럼 고정 경로가 필요한 운영 파일을 위해 `[[index|Wiki Index]]`, `[[log|Wiki Log]]` 형태를 사용하고, wiki lint가 파일 basename도 valid target으로 인정하도록 보강했다.
- Verification: `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm exec vitest run tests/wiki/lint.test.ts tests/wiki/manifest.test.ts tests/wiki/search.test.ts`.

## 2026-04-29T00:00:00+09:00 - rewrite

- Result: 기존 `llm-wiki` 중심 wiki를 munjib project wiki로 전면 교체했다.
- Source evidence: `prd.md`, `obsidian-analysis-report.md`, `package.json`, `prisma/schema.prisma`, `lib/documents/service.ts`, `lib/wiki-links/*`, `app/workspaces/[workspaceSlug]/*`.
- Pages: [[Munjib]], [[Project PRD]], [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[Document Editing Workflow]], [[Auth And Permissions Workflow]], [[Local Development Workflow]], [[Next.js Prisma Monolith]], [[Wiki Schema]], [[index|Wiki Index]]

## 2026-07-13T17:10:00+09:00 - security-runtime

- Result: Issue #182 production runner now preserves the generated Prisma client across `pnpm prune --prod`; the runner discovers the generated `.prisma/client` with the BusyBox-compatible `find ... -print | head -n 1` form without relying on a pnpm virtual-store version, copies it through a build-only temporary path, restores the runtime lookup path, and fails the image build when `require("@prisma/client")` cannot load.
- Coverage: Prisma CLI remains a development dependency; the existing `HOME=/tmp`, `COREPACK_HOME=/tmp/.cache/node/corepack`, non-root UID, and production prune contracts remain in force.
- Pages: [[CI CD And Monitoring Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub Issue #182, `Dockerfile`, `tests/docker/compose.test.ts`.
- Verification: focused Docker contract test RED before the Dockerfile change and GREEN after it; runner-target Docker build; production-image Prisma require smoke; non-root Prisma require smoke. TypeScript verification remains blocked by the pre-existing local missing generated Prisma client because the sandbox cannot update the Prisma engine cache; wiki gates are recorded in the task report.

## 2026-07-13T17:20:00+09:00 - maintenance

- Result: Restored the pre-existing local SDD report artifact after review; it is not part of the Issue #182 product change.
- Scope: No runtime behavior or security policy changed by this cleanup.

## 2026-07-13T17:25:00+09:00 - maintenance

- Result: Kept the SDD task report local-only after the portability follow-up; the public Issue #182 diff contains only Docker, test, and wiki changes.
## 2026-07-13T00:00:00+09:00 - security-signup-readiness

- Result: Issue #161 (`issue-161-security-signup-gate`) has a public-safe
  `PREPARATION_ONLY` readiness contract and immutable parser for Leaf 7's
  invite-first signup handoff. The branch intentionally performs no auth schema,
  route, middleware, OAuth, edge, or production mutation.
- Boundary: Production remains effectively closed until the deployed Leaf 1
  auth runtime, Leaf 2 journal/auth-tombstone authority, Issue #162 abuse/session
  capability, and Leaf 13B/13A private runtime and broker gates (#180/#184/#185)
  are independently attested. The future flow is verified-Google-only,
  raw-bearer-zero fragment to opaque attempt, atomic invitation consumption,
  no blind email linking or `OWNER` grants, and private/no-store bounded
  mutations.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]].
- Source evidence: `deploy/security/signup/invite-first-readiness-v1.json`,
  `lib/auth/invite-readiness.ts`,
  `docs/runbooks/invite-signup-gate-readiness.md`, and focused readiness tests.
- Verification: `pnpm exec vitest run tests/auth/invite-readiness.test.ts
  tests/security/invite-signup-readiness.test.ts --reporter=dot`.

## 2026-07-18T00:00:00+09:00 - release-security

- Result: Added a fail-closed standard-library Vault Transit client with loopback-only plaintext HTTP, HTTPS elsewhere, a 10-second default timeout, rejected redirects, strict bounded JSON responses, and redacted stable error codes.
- Coverage: Exact Ed25519 signing requests, strict `vault:vN` signature parsing, 64-byte signature enforcement, exact key-name validation, and version-bound raw or PKIX DER Ed25519 public-key normalization.
- Review follow-up: Standard Vault response-envelope fields and Transit key/key-version metadata are explicitly modeled without weakening unknown-field or trailing-data rejection; endpoint shape, requested-version invalid key forms, and stalled-request context cancellation have direct regression coverage.
- Source evidence: `internal/releasesigner/transit.go`, `internal/releasesigner/transit_test.go`.
- Verification: `CGO_ENABLED=0 go test -race ./internal/releasesigner -v`.

## 2026-07-19T00:00:00+09:00 - release-security

- Result: Added the testable `munjib-release-sign` adapter with `sign` and `public-key` subcommands backed by Vault Transit.
- Security contract: Vault address and token are environment-only inputs; signed-envelope stdout is machine-only JSON, errors are redacted, payload and expiry bounds fail closed, and raw Ed25519 public-key output uses exclusive mode-`0400` creation without overwrite, symlink, or directory traversal behavior.
- Review follow-up: Present-but-invalid Vault configuration is classified as unavailable (`69`), public-key creation explicitly reapplies mode `0400` after exclusive creation to defeat restrictive umasks, and signed-envelope output writer failures remain output errors (`74`) without secret-bearing diagnostics.
- Source evidence: `cmd/munjib-release-sign/main.go`, `cmd/munjib-release-sign/main_test.go`, `internal/delivery/envelope.go`, and `internal/releasesigner/transit.go`.
- Verification: focused RED/GREEN CLI tests, race-enabled delivery/signer/CLI tests, and a cgo-free Linux/ARM64 cross-build.

## 2026-07-19T17:27:00+09:00 - security-review

- Result: Added explicit regression coverage for malformed security-journal append rows, including empty or multiple rows, non-positive sequences, and non-string hashes.
- Scope: Test-only follow-up; the fail-closed append validation is unchanged.
- Source evidence: `tests/security/journal-contract.test.ts`.
- Verification: 27 focused durable-auth and security-journal tests plus TypeScript compilation.

## 2026-07-19T17:37:00+09:00 - security-review

- Result: Completed the durable session-version boundary before Leaf 2 activation: initial JWT issuance can bind the DB-owned version, while later JWT/session checks carry and compare the issued claim; missing or stale versions fail closed.
- Journal follow-up: Append results above PostgreSQL's signed `BIGINT` maximum now fail closed using the same bound as event parsing.
- Source evidence: `lib/auth/durable-auth-state.ts`, `lib/auth/downstream/contract.ts`, `lib/auth/config.ts`, `lib/security/journal.ts`, and focused regression tests.
- Verification: 33 focused auth/journal tests and TypeScript compilation.

## 2026-07-19T17:47:00+09:00 - security-review

- Result: Durable session versions now reject bigint and canonical decimal values above PostgreSQL's signed `BIGINT` maximum before they can become JWT claims.
- Source evidence: `lib/auth/durable-auth-state.ts`, `tests/auth/durable-auth-state.test.ts`, PR #199 review thread.
- Verification: focused durable-auth regression tests and TypeScript compilation.
## 2026-07-13T13:10:00+09:00 - security-ai-history

- Result: Issue #163 implementation slice adds a dependency-safe source-lineage parser, all-sources visibility decision, and non-enumerating tombstone DTO contract for derived Workspace AI history.
- Coverage: explicit v1 source-backed document/chunk pairs, explicit source-free proof, malformed/missing/sparse legacy lineage fail closed, one denied or unavailable source hides the whole turn, source-backed decisions stay scoped to assistant rows, and tombstones omit internal ids, timestamps, answer/citations, source metadata, model, counts, and denial reasons.
- Scope: no Prisma migration, route wiring, purge, provider call, telemetry, or production mutation; the helper accepts a future canonical authority callback and remains gated on Leaves 2/4/6/13B.
- Pages: [[RAG Process Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub Issue #163, `lib/rag/ai-history-authorization.ts`, `tests/rag/ai-history-authorization.test.ts`, `docs/runbooks/derived-ai-history-authorization-readiness.md`.
- Verification: `pnpm exec vitest run tests/rag/ai-history-authorization.test.ts --reporter=dot`, `pnpm exec tsc --noEmit --pretty false`.

## 2026-07-20T06:55:00+09:00 - security-review

- Result: Invite signup readiness exact-key validation now rejects non-enumerable and symbol own extensions as unknown fields, preserving the fail-closed contract boundary for in-memory objects.
- Source evidence: `lib/auth/invite-readiness.ts`, `tests/auth/invite-readiness.test.ts`, PR #161 review thread.
- Verification: focused invite readiness tests.
- Result: Attachment lifecycle inventory now counts only validated metadata rows as references, so files paired with workspace-mismatched metadata remain visible as orphan bytes; same-key entries use their issue as a deterministic ordering tie-breaker.
- Source evidence: `lib/attachments/lifecycle-inventory.ts`, `tests/attachments/lifecycle-inventory.test.ts`, PR #195 review threads.
- Verification: focused attachment lifecycle inventory tests.

## 2026-08-25T11:03:00+09:00 - running release state bootstrap

- Result: PR #211 review corrected the first-cutover procedure so `current-sha` comes from the active web container's verified `SENTRY_RELEASE`, not the installer checkout's undeployed PR `HEAD`.
- Failure boundary: A missing, malformed, or non-main running SHA stops bootstrap; operators must identify the last healthy deployed release rather than guess rollback state.
- Source evidence: PR #211 review thread, `docs/runbooks/private-oci-self-hosted-runner.md`, `tests/deploy/self-hosted-deploy-contract.test.ts`, and [[CI CD And Monitoring Workflow]].
- Verification: focused self-hosted deploy contract tests passed (7 tests).

## 2026-08-25T11:15:00+09:00 - project deployment summary reconciliation

- Result: PR #211 review updated [[Project PRD]] to describe the current private OCI self-hosted wrapper, exact per-SHA image, health-gated state update, and outbound-only runner path instead of the superseded SSH and `munjib-web:latest` flow.
- Source evidence: PR #211 review thread, [[Project PRD]], [[CI CD And Monitoring Workflow]], and `tests/deploy/self-hosted-deploy-contract.test.ts`.
- Verification: focused deployment contract regression test covers the Project PRD entry point.

## 2026-08-25T11:30:00+09:00 - monotonic production deployment admission

- Result: PR #211 review added a monotonic wrapper gate requiring the recorded `current-sha` to be an ancestor of the requested deploy SHA, preventing historical `main` workflow reruns from silently rolling production back.
- Documentation: [[Local Development Workflow]] now describes the self-hosted per-SHA path and removes retired SSH deploy secrets and `munjib-web:latest` instructions.
- Source evidence: PR #211 review threads, `scripts/deploy/munjib-deploy.sh`, `tests/deploy/self-hosted-deploy-contract.test.ts`, `docs/runbooks/private-oci-self-hosted-runner.md`, [[CI CD And Monitoring Workflow]], and [[Local Development Workflow]].

## 2026-08-25T11:47:00+09:00 - historical SSH section isolation

- Result: PR #211 review removed current wrapper and environment prose from the inactive direct-SSH details block, leaving that block consistently historical and pointing operators to the authoritative self-hosted runner section and runbook.
- Source evidence: PR #211 review thread and [[CI CD And Monitoring Workflow]].

## 2026-08-25T14:00:00+09:00 - anonymous trial AI admission ledger

- Result: Issue #212 Task 2 adds an isolated PostgreSQL-schema-backed admission boundary for anonymous Trial AI. It uses KST-day visitor/network/global counters, a partial-unique active lease, fixed Global → Network → Visitor row locking, and one transaction for ceiling checks, counter increments, and lease creation.
- Failure boundary: authenticated users are not subject to this ledger; malformed Trial admission evidence, absent/invalid positive global cap, or persistence failure returns `TRIAL_AI_ADMISSION_UNAVAILABLE`. Lease release does not decrement daily usage. Ask AI and Workspace AI route integration is deliberately deferred to Tasks 4 and 5.
- Source evidence: approved Issue #212 design, `prisma/schema.prisma`, `prisma/migrations/20260825010000_anonymous_trial_ai_admission/migration.sql`, `lib/rag/trial-ai-admission.ts`, and `tests/rag/trial-ai-admission.test.ts`.
- Verification: RED for the missing module and invalid calendar-date acceptance; GREEN `pnpm run db:generate`, focused seven-test Vitest suite, TypeScript compile, and wiki checks. Live PostgreSQL migration/locking validation is pending because Docker/PostgreSQL was unavailable.

## 2026-08-25T14:10:00+09:00 - anonymous trial AI lease concurrency review follow-up

- Result: The Task 2 lease is now visitor-wide rather than visitor/day scoped. Admission first takes a domain-separated, two-lane advisory transaction lock on the opaque visitor digest, then retains the deterministic Global → Network → Visitor day-row lock order. An unreleased request therefore blocks a second request by the same visitor even when the requests straddle KST midnight.
- Coverage: Added mock-backed cross-midnight and entropy-source-failure tests plus an opt-in PostgreSQL integration suite for concurrent global admission, cross-midnight denial, and transaction rollback when a lease-insert trigger fails. The integration suite requires `MUNJIB_RUN_TRIAL_AI_ADMISSION_DB_TESTS=1` and an already migrated disposable PostgreSQL database.
- Verification: focused unit suite and TypeScript compile passed; the opt-in PostgreSQL suite was collected but skipped because Docker/PostgreSQL remains unavailable.

## 2026-08-25T14:20:00+09:00 - anonymous trial AI PostgreSQL test hardening

- Result: The opt-in PostgreSQL admission test now pre-seeds visitor/network/global daily rows before its concurrent requests, so unique-index insert serialization cannot conceal missing `FOR UPDATE` locks.
- Concurrency oracle: The cross-midnight test starts its second request only after a test-only lease-insert trigger has reached a visible transaction-local `pg_sleep` barrier. Removing the visitor advisory lock then produces a lease uniqueness/database failure instead of the required `TRIAL_AI_REQUEST_IN_PROGRESS`; removing the daily row locks permits a fourth global admission after the pre-seeded ceiling check.
- Verification: focused unit suite and TypeScript compile passed; PostgreSQL tests remain explicitly skipped without `MUNJIB_RUN_TRIAL_AI_ADMISSION_DB_TESTS=1` and a migrated disposable database.

## 2026-08-25T14:30:00+09:00 - anonymous trial AI global-lock isolation follow-up

- Result: The four-request global-ceiling integration oracle now assigns a distinct pre-seeded network digest to every visitor. The global daily row is therefore the only shared locked resource, isolating the test from network-row serialization.
- Verification: the opt-in PostgreSQL suite remains collection-only while Docker/PostgreSQL is unavailable.

## 2026-08-25T14:45:00+09:00 - isolated anonymous Trial actor and entitlement

- Result: Issue #212 Task 3 adds a production-default-closed anonymous capability, opaque secure visitor cookie, privacy-safe entitlement projection, and a discriminated AI route actor. Authenticated users retain their normal `User.id`; anonymous visitors receive no user id and can project only to `VIEWER` on the exact server-owned demo workspace without explicit USER grants.
- Challenge boundary: New-token issuance after prior network Trial traffic uses a one-attempt Turnstile verifier with a one-second timeout, exact canonical hostname and `trial_entitlement` action, fixed-path production secret loading, and no challenge-token logging. Valid existing visitor tokens do not depend on Turnstile availability.
- Integration ruling: The legacy `trial@example.invalid` identity is neither queried nor reactivated. Task 5 must use a visitor-keyed non-shared conversation path or an explicitly stateless path; mapping every anonymous visitor to one `AiChatThread.userId` is forbidden.
- Source evidence: approved Issue #212 design, Task 3 implementation ruling, `lib/auth/trial-visitor.ts`, `lib/auth/trial-entitlement.ts`, `lib/auth/session.ts`, `app/api/trial/entitlement/route.ts`, and focused auth tests.
- Verification: strict RED/GREEN cycles for missing actor/entitlement modules, exact workspace authorization, global-cap configuration, canonical Turnstile binding, malformed challenge rejection, and bounded timeout; focused auth suites and TypeScript compilation passed.

## 2026-08-25T15:30:00+09:00 - anonymous Trial actor review hardening

- Result: Task 3 now binds the Trial principal to the immutable demo workspace ID and authorizes only after comparing that ID with the resolved workspace row; a same-slug workspace in another organization is denied.
- Ingress boundary: Staging/production network evidence now requires a strict file-backed edge-proof secret and a fresh HMAC over the normalized client IP, request method, and pathname. Missing, spoofed, stale, or context-replayed proofs fail closed, while raw-header trust is limited to an explicit development-only mode.
- Rotation and provider bounds: A previous visitor signing key requires an exact cutoff and is accepted only before it. Future-issued tokens and signed lifetimes over 180 days are rejected. Turnstile response bodies are cancelled as soon as the streamed body exceeds 8 KiB.
- Source evidence: Issue #212 Task 3 review ruling, `lib/auth/trial-entitlement.ts`, `lib/auth/trial-visitor.ts`, `lib/security/trial-network-bucket.ts`, and focused auth/security tests.
- Verification: RED/GREEN coverage includes cross-organization same-slug denial, missing/spoofed/stale edge proofs, previous-key cutoff, token-time bounds, and streaming body cancellation; focused tests, TypeScript compilation, and wiki gates passed.

## 2026-08-25T16:00:00+09:00 - Ask AI anonymous Trial admission integration

- Result: Issue #212 Task 4 splits Ask AI authorization/preparation from provider execution, then calls the shared admission ledger only after exact workspace/document authorization. Anonymous Trial callers can read only active documents in their immutable capability workspace ID, never query `WorkspaceMember` or a USER-specific document grant, and exclude documents with any explicit grant; normal authenticated calls retain the existing service wrapper behavior.
- Failure boundary: quota and active-lease denial returns pre-provider JSON 429 with private no-store caching and Retry-After; admission unavailability returns private no-store 503. An admitted provider failure remains charged and the lease release is best-effort in `finally`, so it cannot replace the original provider response.
- Source evidence: approved Issue #212 design, Task 4 ruling, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `lib/rag/ask.ts`, and `tests/rag/ask-route.test.ts`.
- Verification: focused Ask route RED/GREEN and TypeScript compilation passed. Database-backed Ask service regression tests remain blocked in this worktree because `DATABASE_URL` is unset and Docker is unavailable.

## 2026-08-25T16:15:00+09:00 - Ask AI Trial ACL and privacy hardening

- Result: Task 4 now queries anonymous Trial Ask by exact capability workspace ID plus slug, while normal-user lookup retains membership scoping for duplicate-slug isolation. Trial checks candidate documents for explicit grants but never reads a USER grant or membership; an explicitly restricted document is therefore unavailable to viewer-only Trial access.
- Privacy and model boundary: prepared Ask data carries an anonymous privacy mode that forces Langfuse metadata-only capture, even under a full server setting. Anonymous client provider/model overrides fail with `INVALID_CHAT_MODEL` before authorization/admission/provider work.
- Failure boundary: admitted abort and provider error paths release without decrementing the charge. A lease-release error is suppressed so it cannot mask an original success or provider error.
- Source evidence: Task 4 review ruling, `lib/rag/ask.ts`, Ask route, and focused route/preparation/privacy tests.
- Verification: explicit RED for anonymous override and full-capture Langfuse paths, then focused 16-test GREEN suite and TypeScript compilation.

## 2026-08-25T16:00:00+09:00 - anonymous Trial Workspace AI admission

- Result: Issue #212 Task 5 inserts exact-demo-workspace authorization and the shared Trial admission ledger before Workspace AI thread/index/model preparation and before NDJSON starts. Quota denials are JSON 429, admission failures are JSON 503, and the first admitted `start` event includes authoritative `trialAi.remaining` and `resetsAt`.
- Isolation boundary: anonymous Trial preparation is request-stateless and viewer-only over active documents in the immutable demo workspace. It never queries USER grants, never maps to an existing/shared `User`, never creates or reuses `AiChatThread`/`AiChatMessage`, never shares conversation history, and forces Langfuse metadata-only capture. Ordinary authenticated users retain the existing persistent thread/memory path.
- Charging boundary: admission precedes all provider work. Success, provider error, abort, and post-admission preparation failure await best-effort lease release, while admitted daily counters remain charged and are never decremented.
- Source evidence: approved Issue #212 design and Task 5 ruling, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/error-response.ts`, `lib/rag/workspace-chat.ts`, `tests/rag/workspace-chat-route.test.ts`, and `tests/rag/workspace-chat-trial.test.ts`.
- Verification: strict route RED/GREEN cycles covered pre-stream JSON denial, first-event quota projection, admission-before-preparation ordering, fail-closed actor mismatch, and awaited lease cleanup; focused route/stateless service tests and TypeScript compilation passed. The pgvector-backed full workspace-chat integration file remains unexecuted locally because Docker is stopped and the host PostgreSQL lacks the `vector` extension.

## 2026-08-25T16:20:00+09:00 - anonymous Trial Workspace AI review hardening

- ACL boundary: stateless Trial preflight now queries only explicit permission existence and excludes explicitly restricted active documents. It never performs a USER-subject permission query or treats the Trial visitor as a User grant subject.
- Admission boundary: any Trial provider/model override, including malformed or provider-incompatible input, returns stable `TRIAL_AI_MODEL_OVERRIDE_NOT_ALLOWED` 400 before authorization preflight/admission. A request aborted during asynchronous preflight is checked immediately before admission and is not charged.
- Privacy boundary: post-admission Trial preparation/stream failures use a Trial-only normalization/metric seam with only surface, public `AI_UNAVAILABLE`, coarse remaining bucket, and anonymous flag. Raw errors/provider responses, workspace slug, provider/model, and AI content never enter that telemetry path.
- Cleanup boundary: success, stream error, abort, and post-admission preparation tests prove response completion waits for lease release; explicit release-rejection coverage proves cleanup failure cannot replace the original success or sanitized error.
- Source evidence: Task 5 review findings, `lib/rag/workspace-chat.ts`, `lib/observability/ai-unavailable.ts`, Workspace assistant route/error helpers, and focused route/service/observability tests.

## 2026-08-25T17:10:00+09:00 - anonymous Trial answer-chain log hardening

- Privacy boundary: stateless Trial propagates an explicit privacy-safe mode into the streaming answer chain. Provider exceptions are normalized without logging the original error object, response text, prompt, question, retrieved context, or partial answer; the only console metadata is the stable RAG failure code and coarse `stream` surface.
- Compatibility boundary: authenticated Workspace AI retains its existing diagnostic provider-error logging path.
- Source evidence: Task 5 round-two review finding, `lib/rag/answer-chain.ts`, `lib/rag/workspace-chat.ts`, `tests/rag/answer-chain.test.ts`, and `tests/rag/workspace-chat-trial.test.ts`.
- Verification: focused RED reproduced raw secret-bearing provider error output; GREEN proved exact stable metadata and absence of injected prompt/provider-response/question secrets while retaining the authenticated logging assertion.

## 2026-08-25T17:25:00+09:00 - anonymous Trial allowance UI

- Result: Issue #212 Task 6 shows localized remaining Trial AI uses and the KST-midnight reset boundary in Ask AI and Workspace AI only after an authoritative route response identifies Trial allowance state. Successful Ask JSON and the validated first Workspace NDJSON `start` event synchronize both composers through an in-memory same-tab event.
- Client boundary: browser storage is not an identity, entitlement, or quota source. Daily, network, and global exhaustion 429 responses disable both composers; the transient active-request 429 stays recoverable. Responses without `trialAi` preserve the existing authenticated UI.
- Entitlement projection: the client validator accepts the initial three-use entitlement and post-admission zero-through-two values, while rejecting malformed counts or reset timestamps.
- Source evidence: `components/document-editor/ai-assistant-panel.tsx`, `components/workspace-chatbot.tsx`, `components/workspace-chatbot-stream.ts`, localized messages, and focused component/i18n tests.
## 2026-08-25T17:30:00+09:00 - 가입 없는 Trial 제품 진입 연결

- Result: Issue #212 Task 7 removes the legacy NextAuth `trial` Credentials provider. The login demo button now requests `/api/trial/entitlement`, receives an opaque HttpOnly visitor cookie, and follows only the server-projected local Trial workspace path; unavailable capability, invalid challenge/evidence, malformed response, and external paths fail closed.
- Viewer boundary: `/trial/workspaces/[workspaceSlug]` re-verifies the visitor cookie and pathname-bound edge proof, then resolves the immutable capability workspace ID and exact slug. It renders only active documents with no explicit permission row and does not query `WorkspaceMember` or USER grants, bind to a shared User, expose mutations/account UI, or persist Trial conversation history.
- Public projection: entitlement JSON exposes only quota/reset values plus `{ entry: { path } }`; workspace ID and visitor/network subjects or digests remain private.
- Source evidence: Issue #212 approved design, `app/login/login-form.tsx`, `app/api/trial/entitlement/route.ts`, `app/trial/workspaces/[workspaceSlug]/page.tsx`, `lib/auth/config.ts`, `lib/auth/trial-entitlement.ts`, `lib/workspaces/trial-viewer.ts`, and focused auth/login/workspace tests.
- Verification: strict RED reproduced the legacy provider, missing entry projection, old Trial sign-in call, and missing viewer; focused 74-test GREEN suite and TypeScript compilation passed.

## 2026-08-25T17:40:00+09:00 - Trial allowance UI review hardening

- Ordering boundary: same-window allowance merges are monotonic decreasing, later reset windows may replace them, and delayed older-window responses cannot regress the current projection. Cross-surface reverse-resolution coverage keeps an observed zero from becoming one.
- Reset boundary: a mounted timer removes expired allowance state and unlocks the composers without guessing a new three-use entitlement. A subsequent entitlement or route response remains authoritative.
- Accessibility: both dynamic allowance summaries use polite status regions, and Ask/Workspace composer controls reference their allowance/reset explanation with `aria-describedby`.
- Verification: focused fake-timer, reverse-resolution, accessibility, component, i18n, and TypeScript checks.

## 2026-08-25T17:50:00+09:00 - anonymous Trial AI privacy source contract

- Result: Issue #212 Task 7 adds one DB-independent cross-file contract for digest-only quota persistence, opaque entitlement JSON, hardened bounded visitor cookies, Ask metadata-only capture, stateless Workspace AI, sanitized Trial telemetry, server-owned model selection, legacy-provider removal, and production-default-closed capability activation.
- Mutation coverage: representative raw-IP/prompt columns, entitlement digest exposure, full-content Ask capture, Trial chat persistence, question telemetry, and a removed override guard are injected as negative fixtures and must be rejected by the same validators used for current source.
- Source evidence: `tests/security/trial-ai-privacy-source-contract.test.ts`, the anonymous Trial admission migration/schema, entitlement/cookie/auth configuration, Ask and Workspace AI route/service implementations, and Trial observability helper.

## 2026-08-25T18:05:00+09:00 - Trial viewer AI surface review hardening

- Result: The selected allowed Trial document now renders Ask AI, and Workspace AI has an explicit anonymous read-only mode that uses only the stateless messages POST. It never calls authenticated thread GET/reset APIs and omits the reset control.
- Model boundary: Anonymous Ask and Workspace clients do not read or subscribe to workspace model overrides and never serialize provider/model fields. The server-owned model is displayed and remains enforced by the existing cookie, exact workspace/document, and edge-proof authorization in each API route; the UI mode is not an authority signal.
- Allowance bootstrap: The viewer re-resolves entitlement server-side and passes only validated `{ remaining, resetsAt }` to both surfaces. The projection excludes workspace IDs and visitor/network subjects or digests and enters the existing monotonic same-tab channel, retaining KST expiry and accessible composer guidance.
- Source evidence: `app/trial/workspaces/[workspaceSlug]/page.tsx`, `components/document-editor/ai-assistant-panel.tsx`, `components/workspace-chatbot.tsx`, `lib/auth/trial-entitlement.ts`, and focused component/viewer/auth tests.
- Verification: strict RED reproduced missing Ask, authenticated thread calls, reset UI, browser model override use, and missing server allowance bootstrap; focused 118-test GREEN suite and TypeScript compilation passed.

## 2026-08-25T18:20:00+09:00 - Trial Ask review hardening

- Privacy boundary: anonymous Trial Ask now propagates privacy-safe logging into the non-streaming answer chain, which records only the stable RAG failure code and `invoke` surface. Authenticated Ask retains the raw provider-error diagnostic path.
- Quota projection: Ask quota-denial JSON now includes the admission ledger's authoritative `resetsAt`, allowing the shared client allowance parser to publish zero remaining uses and lock both composers through the KST reset boundary.
- Verification: RED reproduced secret-bearing provider-error logging, the missing privacy flag, and the missing quota reset projection; focused answer-chain, Ask privacy/route, and editor component tests passed GREEN.

## 2026-08-25T18:35:00+09:00 - Trial Ask admission and telemetry review follow-up

- Charging boundary: after asynchronous document authorization/preparation, Ask rechecks the request abort signal immediately before admission. A disconnected request returns private no-store 499 and consumes no daily use or active lease.
- Privacy boundary: admitted anonymous Ask provider failures use only the Trial metric seam with surface, public `AI_UNAVAILABLE`, coarse remaining bucket, and anonymous flag. They do not enter the authenticated handled-error path carrying raw error, workspace slug, RAG code, provider, or model.
- Source evidence: PR #213 review, Ask route, focused abort and anonymous telemetry regression tests.
- Verification: both regressions failed before the route change, then the 14-test Ask route suite and TypeScript compilation passed.

## 2026-08-25T18:50:00+09:00 - Trial entry, embedding, and citation review follow-up

- Entry boundary: `/login`, `/`, and the unauthenticated workspace page all resolve the same validated public Turnstile site key and pass it to `LoginForm`, so a shared-network challenge can complete from every login gate.
- Privacy boundary: stateless Trial query embedding and targeted index backfill propagate privacy-safe logging. Provider failures expose only a stable RAG code and coarse embedding surface, never the raw SDK error; authenticated diagnostics remain unchanged.
- Navigation boundary: Ask and Workspace Trial citations stay inside `/trial/workspaces/<slug>?document=...`; authenticated citations retain the ordinary workspace route.
- Source evidence: PR #213 review threads, shared Turnstile key resolver and login callers, embedding/index/workspace-chat privacy propagation, shared citation renderer and workspace route builder.
- Verification: focused authentication, component, RAG, and privacy-contract suites passed 186 tests together with TypeScript compilation.

## 2026-08-25T19:00:00+09:00 - charged Trial failure allowance projection

- Result: admitted Ask provider failures and Workspace pre-stream preparation failures now return authoritative `trialAi.remaining` and `trialAi.resetsAt` with private no-store 503 responses.
- Client boundary: both composers validate and publish this projection from non-success JSON before showing the generic error, while authenticated errors without Trial data remain unchanged and quota-denial fallback stays intact.
- Source evidence: PR #213 review threads, Ask and Workspace message routes/error response helpers, both AI clients, and focused route/component regression tests.
- Verification: combined Ask/Workspace route and component suites passed 148 tests with TypeScript compilation.

## 2026-08-25T19:15:00+09:00 - Trial lease lifetime and transient retry hardening

- Concurrency boundary: admitted Ask and Workspace requests renew their active lease every 30 seconds for the entire provider/index/preparation/stream lifetime. Renewal uses DB time, extends only a still-active unexpired lease, and aborts provider work if renewal fails or the lease is lost.
- Cleanup boundary: both routes await heartbeat shutdown before best-effort lease release, so a long request cannot overlap a later request merely because the original two-minute deadline passed.
- Retry boundary: `TRIAL_AI_REQUEST_IN_PROGRESS` is a transient active-request denial and no longer carries KST-midnight `resetsAt` or `Retry-After`; daily/network/global ceilings retain their normal reset projection.
- Source evidence: PR #213 review threads, admission heartbeat/renew SQL, Ask and Workspace signal composition, unit/route/UI/PostgreSQL integration tests.
- Verification: 109 focused tests and TypeScript passed after integration; the live PostgreSQL admission suite passed 4/4 including a lease kept active beyond its shortened initial deadline.

## 2026-08-25T19:25:00+09:00 - Trial pre-admission telemetry and Turnstile retry hardening

- Privacy boundary: anonymous Trial Ask selects coarse Trial telemetry from the principal even before admission. Server RAG/config failures emit an unknown remaining bucket and private no-store 503 without workspace slug, detailed RAG code, provider/model, or raw error.
- Challenge recovery: failed, timed-out, or API-missing Turnstile script elements are cleaned up and removed, allowing a later click to load a fresh script while concurrent attempts continue sharing one pending load.
- Source evidence: PR #213 review threads, Ask route and Trial observability helper/privacy source contract, Turnstile client and focused tests.
- Verification: privacy suites passed 29 tests; Turnstile/login suites passed 19 tests; both TypeScript checks and diff checks passed.

## 2026-08-25T19:35:00+09:00 - Trial heartbeat completion barrier

- Result: heartbeat stop now awaits any renewal transaction already in flight and returns its success outcome without suppressing a late lease-loss abort.
- Completion boundary: Ask success JSON and Workspace stream `done` are emitted only after the stop barrier succeeds. A pending renewal failure becomes the existing sanitized Trial `AI_UNAVAILABLE` path, then cleanup releases the lease.
- Source evidence: PR #213 review, heartbeat helper, Ask/Workspace routes, deferred-renewal unit and route regression tests.
- Verification: heartbeat unit and both AI route suites passed 101 tests before integration; combined privacy/heartbeat merge is covered by the final focused and full-suite verification.

## 2026-08-25T19:45:00+09:00 - Trial embedding abort propagation

- Result: the composed request/lease AbortSignal now reaches targeted index backfill, every chunk embedding, query embedding, and the embedding provider invocation.
- Concurrency boundary: abort checks before and after each provider await prevent later chunks or retrieval from starting after lease loss, rather than merely noticing the abort after the full backfill completes.
- Source evidence: PR #213 review, embedding client, document indexer, Workspace preparation, and signal/pending-provider/multi-chunk regression tests.
- Verification: focused embedding/index/Workspace suites passed 63 tests with TypeScript and diff checks; final full-suite verification follows integration.

## 2026-10-07 - Public signup email validation follow-up

- PR #215 late review: reject malformed email addresses before hashing and persistence, using the existing Google email shape policy.
- Eleven rejection cases cover duplicate at signs, internal whitespace, missing local/domain components, missing domain dot, raw control characters (including surrounding whitespace controls) and the login length limit; positive cases preserve plus-addressing and trimmed mixed-case input.
- Production CI stopped on the newly published sharp advisory GHSA-wq5f-xc86-pv6w; pin sharp 0.35.5. Public signup host flag remains disabled until the corrected release is verified.
- Source evidence: `lib/auth/provisioning.ts`, `tests/auth/signup-work-limit.test.ts`, production CI run 37484865738.

- Follow-up review synchronized current dependency versions and metadata across [[Local Development Workflow]], [[CI CD And Monitoring Workflow]] and [[index]]. Historical log entries retain their original version evidence.
- Google basic identity scope exception was confirmed against official documentation and the installed provider defaults; console remains Testing and a live callback is still unverified.

## 2026-10-07 - Native Trial edge proof adapter

- Issue #217 supplies the existing Trial HMAC contract through a loopback Go signer, strict systemd credential loading and Caddy header replacement. No raw-header development bypass is enabled.
- Tests cover independent Node vectors, malformed authorities, query exclusion, duplicate headers, endpoint/peer restrictions and secret permissions. CI adds race tests.
- Sources: `cmd/munjib-trial-edge`, `deploy/caddy/munjib-trial.caddy`, `deploy/systemd/munjib-trial-edge.service`, `docs/runbooks/demo-public-access.md`. Live activation remains a separate verification step.

- Host verification corrected the service identity to DynamicUser and accepted systemd's fixed-path root:root 0440 ACL-protected credential envelope; arbitrary group-readable keys remain rejected. The earlier numeric container UID has no host user entry.
- Actual Caddy 2.6.2 integration passed original POST/body/path, query exclusion, forged header replacement, ordinary-route passthrough and both legacy denials. The query-clear suffix on `/proof?` is required by this Caddy version. Reproducible probe: `scripts/deploy/verify-trial-edge.py`.
- Independent review tightened the host probe to require the actual loopback peer IP and exactly one copy of each proof header, so a valid signature over an attacker-supplied IP cannot pass the probe.
- Trial operations include a daily 00:40 KST retention timer with a dedicated four-table SELECT/DELETE role and shared deployment lock; initial dry-run/execute/dry-run is required before enabling it.
- PR review aligned the signer with the application's existing 16-character secret minimum, 256-byte file cap, UTF-8/UTF-16 length behavior and forbidden control/BOM characters. Descriptor-based no-follow loading checks inode, link count and bounded reads.

## 2026-10-07 - Full read-only Trial workspace browsing

- Issue #219 restores ordinary graph, search, folder, wiki-link/backlink, metadata and tab browsing while all write actions reject. Trial browser state and attachment routes remain separate from authenticated access; AI quota behavior is preserved.
- Updated [[Auth And Permissions Workflow]], [[index]] and `docs/runbooks/demo-public-access.md` with the authorization boundary and approved separate Company Handbook snapshot procedure.
- Source evidence: Trial page, workspace mode/routes, Trial viewer/attachment services, Caddy/Go matcher, and tests for hidden references, read-only actions, Korean attachment filenames and Trial tab isolation.
- Production baseline #218 was deployed (Actions 37491804650); email/Google signup and anonymous Trial entry plus warm Ask were observed. Full-viewer/snapshot deployment is a separate outstanding step. Previous deploy disk exhaustion was recovered by removing unused build cache and verification image, preserving data volumes and current/rollback images.
- The Markdown renderer still denies ambient external media; reviewed internal Trial attachment routing updates its protected artifact hash. Existing downstream slot ownership/version remain unchanged.
- Trial attachment responses sandbox direct document navigation so stored HTML/SVG cannot execute scripts in the application origin.
- Live Google-plus-Trial browser verification exposed authenticated-user precedence on AI calls (404 for the isolated snapshot). Added an explicit narrower-principal hint, fail-closed resolution, and coexistence regression tests; normal signed-in AI precedence remains unchanged.
- PR #220 review tightened folder projection to readable branches, normalized suffixed/encoded attachment links before allowed-ID checks, and hid ineffective Trial workspace model settings. Regression tests cover each boundary; the protected Markdown renderer hash was updated for this reviewed change.
- Follow-up PR review keeps explicit/encoded/case-variant workspace Markdown links in Trial routes and rejects other internal API links; forged/cross-workspace document IDs still fail at the exact-snapshot viewer boundary.
- The same routing rule also covers absolute URLs on the configured application origin; genuine outside destinations retain the explicit external-navigation confirmation.
- Final review also separated heading-fold keys and Workspace AI panel state for Trial. Editor and Markdown preview share one scoped fold key, preventing browser preference changes from reaching the same authenticated document.
- Fresh Trial entry selects the first readable document while explicit folder/graph navigation and invalid document IDs retain their separate behavior; page regression tests cover the initial view and denial.

## 2026-10-07 — Issue #223 login entry clarification

- Updated [[Auth And Permissions Workflow]]: Korean/English login copy no longer assumes a returning visitor; password reset is temporarily disabled and has no click handler.
- Evidence: `app/login/login-form.tsx`, `lib/i18n/messages.ts`, `tests/components/login-form.test.tsx`.

- PR #224 review: expose the password-reset explanation as visible helper text linked with `aria-describedby`, including for keyboard and touch users.

## 2026-10-07 — Read-only archive menu visibility (#221)

- Live Trial verification after #220 found a hidden archive button was made visible by its block display class. Omit the entire archive form for documents without write permission; retain the server mutation denial. Regression tests assert no archive button or document mutation input exists in the read-only menu.

## 2026-10-07 — Demo identity and admin access (#225)

- Updated [[Auth And Permissions Workflow]]: Trial account label uses the localized demo identity, including when an authenticated session coexists.
- Administrative editing uses the ordinary authenticated workspace route and existing membership checks; Trial stays read-only.
- Evidence: `components/document-list.tsx`, `lib/i18n/messages.ts`, `tests/components/document-list.test.tsx`.

## 2026-10-07 — Issue #227 Langfuse metadata observability

- Updated [[Production Observability Workflow]], [[RAG Process Workflow]], and [[index|Wiki Index]].
- Live diagnosis: production credentials authenticated to the expected JP project, but metadata capture disabled both the old callback and exporter. Local credentials were empty.
- Added a private manual exporter for content-free AI stage observations, independent of Sentry; retained explicit full-capture opt-in and Trial content exclusion.
- Evidence: `lib/rag/ai-observation.ts`, AI service/route wiring, metadata/export privacy tests. Deployment verification is recorded separately after rollout; code tests alone do not prove production ingestion.

- Issue #227 PR review follow-up: Ask preparation failures now share the request trace; model attribution follows the 160-character application validation contract; removed the obsolete metadata-export-disabled claim. Regression evidence: Ask preparation failure and model-ID boundary tests.
- Live development export verified successful generation with reported token usage and no input/output. Fixed the private provider resource to `service.name=munjib-ai` so the SDK default cannot expose the local Node executable path.
- PR #228 lease-finalization review: routes retain the Ask/Workspace request observation until the final heartbeat result is validated, so a lost Trial lease records an error instead of a premature successful root. Added service deferral and both route race regressions.

## 2026-10-09 — Issue #231 attachment upload and downloads

- Updated [[Document Editing Workflow]] and [[index]] with guarded upload submission, transient attachment-card focus, Unicode display names and native downloads.
- Source evidence: attachment upload component/action, AppShell/MetadataPanel, attachment service and response headers, targeted component/route/action tests.
- Existing ASCII storage-key validation remains unchanged; original names lost by earlier sanitization cannot be recovered.

- CI follow-up: kept the protected Markdown renderer byte-identical; attachment document links download through the response disposition. The Leaf 11 renderer integrity check remains enforced.

## 2026-10-18 - Grouped metadata sidebar (Issue #240)

- Updated [[Document Editing Workflow]] with document/category disclosures, document-targeted actions and Trial compatibility. Source: `components/metadata-panel.tsx`, `tests/components/metadata-panel.test.tsx`.
