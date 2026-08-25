# Security Hardening Program Implementation Plan

**Tracking:** Parent Issue #154 · local-only branch `issue-154-security-hardening-design` (never push)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved 14-workstream security program without exposing restricted findings, disturbing the local `main` checkout, or performing destructive production changes before recovery is proven.

**Architecture:** A restricted local master plan coordinates 14 independently testable parent workstreams. Emergency containment and Wave 0.5 Phase A run first. Leaf 13A (parent Issue #167, remote branch `issue-167-security-immutable-deploy`; child Issue #169, remote branch `issue-169-delivery-substrate`) then installs a no-runtime-mutation delivery substrate whose unprivileged SSH submitter can reach privilege only through a root systemd broker that independently verifies the signed request. Leaves 3, 1, and 4 are deployed through that substrate, after which Leaf 13B promotes the exact-digest private runtime, separated database roles, monotonic capability floor, and independent recovery qualification. Any parent that needs more than one production checkpoint creates generic child issues and branches; one branch and PR always equals one deploy unit. Trial cleanup then installs the DB-owned append-only security journal before authority is removed. Later leaves append only access-reducing state. Destructive purge remains library-default fail-closed and separates logical denial, independently signed remote journal coverage, and physical deletion.

**Tech Stack:** Next.js App Router, NextAuth, Prisma/PostgreSQL, React Markdown, Docker Compose, Caddy, GitHub Actions and GHCR, Vitest, Playwright, shell operator runbooks, repository wiki tooling.

## Global Constraints

- The design, this plan, all leaf plans, and detailed operational evidence are restricted local material. Do not push commit `19bb4d2` or any planning commit without a separate disclosure review and explicit user approval.
- Keep `/Users/developer/Documents/munjib` on `main`; use issue-specific worktrees for every implementation branch.
- Remote parent branches are publication placeholders. Before the first implementation commit on a parent or child release branch, fetch and merge the latest verified `origin/main` plus every required dependency merge; do not force-push or rewrite shared history.
- The first 14 GitHub issues are parent workstreams. A multi-checkpoint leaf creates a generic child issue and branch immediately before that release starts. One branch/PR is one production deploy unit; its parent stays open until all children and production evidence close.
- GitHub receives only a generic title, priority, parent `#154`, logical dependencies, a non-sensitive acceptance summary, and the remote branch.
- Implementation branches start from verified `origin/main` and must never merge or cherry-pick the restricted planning commit. Their staged disclosure guard rejects every local security plan/spec path and the restricted wiki planning-entry fingerprints while still requiring a new public-safe implementation wiki delta.
- Keep the current Trial Caddy denial, production seed prohibition, rotated credentials, and canonical production environment until their application-level replacements pass production smoke tests.
- Close public password signup at the edge immediately; Issue 1 must close it in the application before the edge rule can be removed.
- Temporarily block Google sign-in/callback at the edge until Issue 1 proves that closed mode admits only an already-linked Google account. A verified but unlinked Google profile is signup, not login.
- No membership cleanup, destructive migration, or purge runs before its required encrypted snapshot and isolated restore evidence exists.
- Production uses `MUNJIB_DEPLOYMENT_ENV=production`; `NODE_ENV` alone never selects a production security policy.
- The implementation-time Next.js release must fix every then-applicable official advisory; `15.5.18` is only the reviewed minimum floor.
- External media from AI output, imported Markdown, or direct editor Markdown makes zero automatic browser, DNS-prefetch, or server requests. Before an explicit click/import, no external URL is emitted as a DOM `href`, media attribute, preload, preconnect, or data attribute. Rich HTML remote images require in-memory candidate staging and explicit confirmation.
- Remote image fetch permits effective ports 80 and 443 only and runs in a credential-free, public-web-only egress boundary with no database, host, metadata, provider-control-plane, or Docker access.
- Untrusted image fetch and decode are separate processes. The fetcher has only public-Web egress and emits bounded raw bytes; the one-shot canonicalizer has no network, database, attachment path, or application secret. Web never imports an image decoder, never mounts the attachment volume read-write, and cannot invoke physical unlink. A dedicated storage authority seals create-only output after the writer process and cgroup are empty; a distinct physical-deletion principal requires independent signed journal coverage.
- Production signup defaults to `invite`; invitation v1 accepts provider-verified Google identities only and never grants `OWNER`.
- The administrator and Trial identities receive zero implicit customer-workspace memberships. Historical actor relations remain intact. Trial is durably authentication-disabled; the administrator remains usable.
- Break-glass support is limited to `VIEWER|EDITOR`, derives activity and role from the grant at database time in every resolver, and cannot be promoted through ordinary membership APIs.
- Backup objectives are RPO 24 hours, RTO 4 hours, and retention of seven daily, four weekly, and three monthly copies.
- Leaf 13A lands before the ordered chain Leaf 3 -> Leaf 1 -> Leaf 4 and changes no running app, database, Caddy configuration, floor, or recovery pointer. Those three leaves are delivered only through 13A: Leaf 1 consumes deployed `secure-next-runtime@1`, and Leaf 4 consumes deployed `secure-next-runtime@1` plus `auth-runtime-fail-closed@1`. Leaf 13B then establishes exact-digest provenance, database-role separation, private binding, capability floors, compatibility, rollback, and independent recovery qualification before Issue 2 or any later schema/data-changing deployment.
- Leaf 13B emits only the pre-journal `VerifiedDatabaseRoleCapability { phase: "PRE_JOURNAL" }`: separated role OIDs/flags/ACLs are verified, but it must not require pgcrypto, journal objects, or genesis that Issue 2 has not created. Issue 2 then runs the fixed root-only pgcrypto prerequisite, migration, ownership/genesis/final grants, and emits `VerifiedSecurityJournalCapability { phase: "JOURNAL_READY" }` for Issue 14.
- The security journal is a deny-only, contiguous `BIGINT` hash chain. Its entries are immutable through DB roles and triggers, exported continuously, and retained indefinitely outside snapshot lifecycle deletion.
- Issue 2 owns the one discriminated `SecurityJournalEventKind` union, its event-to-subject mapping, immutable replay-target rules, and exact payload schemas. Later leaves import its typed append API instead of spelling event strings or passing arbitrary JSON; SQL independently rejects kind/subject mismatches, extra keys, wrong types, oversized payloads, and recursively sensitive key names.
- Restoring an older snapshot may therefore be conservatively more restrictive than production was: later grants, recoveries, invitation renewals, credential replacements, and provider opt-ins are not reconstructed. They require explicit post-restore owner/operator reauthorization after isolation; replay must never infer an access increase.
- Backup snapshot image identity is evidence only. Restore always runs a separately attested current recovery image that satisfies the current recovery capability floor and has passed the oldest-retained-point drill.
- `current.json`, `rollback.json`, `recovery-candidate.json`, and `recovery.json` are distinct records. A normal application deploy never overwrites the independently drilled recovery pointer.
- Recovery eligibility is compatibility, not equality: `recovery.json` may name a different source, digest, scan generation, and capability set from `current.json`, but it must independently satisfy every current recovery requirement, the retained migration/journal contracts, current evidence, complete offline artifacts, and the oldest-retained-point drill. Equality is neither required nor sufficient.
- For Ask AI and Workspace AI, authority flows only `Leaf 4 prompt authority -> Leaf 9 AuthorizedProviderMaterial/finalizer -> Leaf 10 canonical payload/single-attempt transport`. Leaf 10 cannot rebuild source text, mint prompt authority, finalize history, or emit partial browser bytes.
- `deploy/security/deployed-leaves.json`, the initially empty `deploy/security/protected-artifact-owners.json`, its exact full-path/normalized-projection schema and fixed nine-tuple reservation policy, and the monotonic migration ledger are cross-leaf program contracts. The ninth tuple is `invite-signup-gate -> edge-minimal-csp-nonce -> lib/security/downstream/leaf12-edge-middleware.ts`; root `middleware.ts` remains Leaf 7-owned. A protected selector change requires its owning capability version to increase and an attested publisher; `package.json`, `pnpm-lock.yaml`, and `docker-compose.yml` are projection sources rather than whole-file-owned artifacts.
- Production migration promotion order is exact: Leaf 2 `20260712000000` then `20260712003000` -> Leaf 5 `20260712010000` -> Leaf 8 `20260712020000` -> Leaf 7 `20260712030000` -> Leaf 9 `20260712040000` -> Leaf 11 v1 `20260712050000` -> Leaf 10 `20260712060000` -> Leaf 11 v2 with a new identifier strictly greater than every migration then on `main`. Leaf 6 is migration-free but deploys after Leaf 5 and before Leaf 9. Development may start earlier; merge, migration, candidate promotion, and floor publication cannot cross this order.
- Leaf 11 is two child releases: v1 transition/backfill/fail-closed convergence, then v2 contract/worker/import/deletion. Leaf 12 is also two child releases: v1 attested policy generation plus report-only observation, then v2 candidate-bound enforcement after the observation gate.
- All privileged security operations share `/run/lock/munjib-security-state.lock`. Production never executes privileged content from a checkout or deploy-user path.
- A root-owned executable run by an unprivileged account is still unprivileged. The Leaf 13 SSH frontend only submits a bounded request to a root systemd socket broker; the broker verifies `SO_PEERCRED` and independently revalidates the complete envelope, attestations, policy, replay state, and operation before privilege. There is no `sudo`, setuid, root SSH, Docker-socket handoff, or caller-selected command/path/environment.
- Destructive purge is a three-stage state machine: a locked transaction makes data logically unreachable and stores exact journal sequence/hash without deleting rows/bytes; the independent exporter/uploader/signer publishes a signed remote high-water covering that tuple; only then may a separately authorized worker perform idempotent physical deletion. The global lock is released between stages and no process waits or polls while holding it.
- Backup/restore principals are mandatory and non-combinable: capture reader, one-shot encryptor, ciphertext uploader, purpose-bound signer, catalog/registrar, exact-object restore fetcher, no-egress decryptor, restore loader/extractor, and root orchestration each receive only their fixed FDs and authority. Plaintext processes have no journald, generic Unix socket, Docker, object, KMS, or ambient network channel.
- Every code slice follows red-green-refactor, runs its focused tests, updates durable wiki knowledge, and uses the repository pre-commit wiki guards.

---

## File Structure

- `docs/superpowers/plans/2026-07-11-security-hardening-program.md`: Owns publication, sequencing, checkpoints, and program completion.
- `docs/superpowers/plans/2026-07-11-security-auth-runtime.md`: Leaf 1, production auth runtime and closed signup.
- `docs/superpowers/plans/2026-07-11-security-trial-isolation.md`: Leaf 2, durable auth disable, append-only journal/genesis, launch identity isolation, guarded cleanup, and non-manager support.
- `docs/superpowers/plans/2026-07-11-security-nextjs-upgrade.md`: Leaf 3, secure runtime dependency upgrade.
- `docs/superpowers/plans/2026-07-11-security-ai-output-egress.md`: Leaf 4, zero-egress Markdown rendering and prompt trust boundaries.
- `docs/superpowers/plans/2026-07-11-security-archive-boundaries.md`: Leaf 5, active/archive/purged access resolvers.
- `docs/superpowers/plans/2026-07-11-security-document-acl.md`: Leaf 6, folder/link ACL closure and narrow DTOs.
- `docs/superpowers/plans/2026-07-11-security-signup-gate.md`: Leaf 7, verified-Google invite mode.
- `docs/superpowers/plans/2026-07-11-security-auth-abuse-sessions.md`: Leaf 8, shared abuse limits and per-user revocation.
- `docs/superpowers/plans/2026-07-11-security-ai-history-authorization.md`: Leaf 9, source lineage and derived-history reauthorization.
- `docs/superpowers/plans/2026-07-11-security-ai-provider-policy.md`: Leaf 10, server provider policy, quotas, and metadata-only telemetry.
- `docs/superpowers/plans/2026-07-11-security-attachment-lifecycle.md`: Leaf 11, confirmed remote import, isolated fetch, attachment state machine, and disabled-by-default purge worker.
- `docs/superpowers/plans/2026-07-11-security-edge-bindings.md`: Leaf 12, versioned Caddy headers and private listeners.
- `docs/superpowers/plans/2026-07-11-security-immutable-deploy.md`: Leaf 13A delivery substrate and Leaf 13B verified image, least-privilege database roles, private runtime, monotonic capability floor, rollback, rescan, and independent recovery qualification.
- `docs/superpowers/plans/2026-07-11-security-backup-restore.md`: Leaf 14 plus Wave 0.5, encrypted snapshots, continuous journal replay, current recovery tooling, signed purge composition, and isolated drills.
- `/private/tmp/munjib-security-leaf-map.tsv`: Untracked runtime output mapping logical leaf, GitHub issue, and remote branch.
- Root-only incident evidence storage on the production host: checksum, backup identifier, restore result, deployment digest, and smoke results without secret values or private content.

---

### Task 1: Complete the Remaining Signup and OAuth Edge Containment

**Files:**
- Remote modify: `/etc/caddy/Caddyfile`
- Remote inspect: `/etc/caddy/Caddyfile`
- No repository file changes.

**Interfaces:**
- Consumes: Existing `munjib.example.invalid` site block and its Trial denial matcher.
- Produces: POST `/api/auth/signup` returns `503`; Google sign-in/callback returns `503` until Issue 1's linked-account-only policy passes; `/login` and existing password authentication remain available. This is availability-impacting containment, so keep its exact start/end time in restricted evidence.

- [ ] **Step 1: Inspect the active site block without printing unrelated secrets**

Run on the production host:

```bash
sudo sed -n '1,120p' /etc/caddy/Caddyfile
```

Expected: one `munjib.example.invalid { ... }` site block containing the current Trial matcher, its response, and `reverse_proxy 127.0.0.1:3000`.

- [ ] **Step 2: Add the signup matcher inside the site block**

Run:

```bash
sudoedit /etc/caddy/Caddyfile
```

Insert these blocks before `reverse_proxy` and keep them inside `munjib.example.invalid { ... }`:

```caddyfile
  @blocked_public_signup {
    method POST
    path /api/auth/signup /api/auth/signup/*
  }

  respond @blocked_public_signup "Signup temporarily disabled" 503

  @blocked_google_auth {
    path /api/auth/signin/google /api/auth/signin/google/* /api/auth/callback/google /api/auth/callback/google/*
  }

  respond @blocked_google_auth "Google login temporarily disabled" 503
```

Expected: password signup and both Google entry paths are denied. Password login, CSRF, provider discovery, and the login page do not match.

- [ ] **Step 3: Validate and reload Caddy**

Run:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl daemon-reload
sudo systemctl reload caddy
sudo systemctl is-active caddy
```

Expected: validation succeeds and the final command prints `active`.

- [ ] **Step 4: Verify the public containment contract**

Run from a non-authenticated client:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' --data '{"email":"containment-check@example.invalid","password":"not-a-real-password"}' https://munjib.example.invalid/api/auth/signup
curl -sS -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://munjib.example.invalid/api/auth/signup/
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://munjib.example.invalid/api/auth/signin/google
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://munjib.example.invalid/api/auth/signin/google/
curl -sS -o /dev/null -w '%{http_code}\n' 'https://munjib.example.invalid/api/auth/callback/google?code=synthetic&state=synthetic'
curl -sS -o /dev/null -w '%{http_code}\n' 'https://munjib.example.invalid/api/auth/callback/google/?code=synthetic&state=synthetic'
curl -sS -o /dev/null -w '%{http_code}\n' https://munjib.example.invalid/login
```

Expected: six `503` responses followed by `200`. Perform one fresh existing password-user login in the browser and record only pass/fail. Do not restore Google availability until Leaf 1's tests and production smoke prove that verified-but-unlinked profiles cannot create a User or Account. If Google is a required login path during this short window, stop and deploy Leaf 1 rather than weakening the matcher.

- [ ] **Step 5: Prove direct application/database/model ports are not publicly reachable**

Run from a machine outside the production network. Resolve and test every current A
and AAAA answer rather than allowing `nc` to choose one address:

```bash
set -euo pipefail
addresses="$({ dig +short A munjib.example.invalid; dig +short AAAA munjib.example.invalid; } | awk '/^[0-9A-Fa-f:.]+$/' | sort -u)"
test -n "$addresses"
while IFS= read -r address; do
  for port in 3000 55432 11434; do
    if nc -z -w 3 "$address" "$port"; then
      printf 'PUBLIC_PRIVATE_PORT_OPEN address=%s port=%s\n' "$address" "$port" >&2
      exit 1
    fi
  done
done <<EOF
$addresses
EOF
printf 'TEMPORARY_PRIVATE_PORT_CONTAINMENT_OK\n'
```

Expected: only `TEMPORARY_PRIVATE_PORT_CONTAINMENT_OK`. Any open port is a stop condition: close it in the current OCI network security list before continuing. Do not enable a host firewall blindly or risk the SSH management path. Issue 13 later makes loopback/no-publication an attested runtime capability; Issue 12 continuously probes every A/AAAA address.

---

### Task 2: Pass Wave 0.5 Phase A — the Immediate Data-Recovery Gate

**Files:**
- Execute: `docs/superpowers/plans/2026-07-11-security-backup-restore.md` Task 1 Phase A.
- Remote evidence: root-only incident evidence storage.
- No GitHub or repository changes.

**Interfaces:**
- Consumes: Current production database, attachment volume, quarantined identities, and rotated signing configuration.
- Produces: An encrypted pre-program backup identifier, authenticated manifest/checksum, isolated PostgreSQL plus attachment restore, auth-table scrub evidence, and measured restore duration. This phase deliberately requires no not-yet-existing Issue 13 record and executes no snapshot application image.

- [ ] **Step 1: Execute the minimum snapshot task from the backup plan**

Open `docs/superpowers/plans/2026-07-11-security-backup-restore.md` and execute `Task 1` Phase A exactly.

Expected: application writes are paused only for the documented capture window, the database and attachment manifest share one backup epoch, and encrypted artifacts leave the host only after authenticated verification.

- [ ] **Step 2: Execute the isolated minimum restore task**

Continue through the backup plan's Phase A isolated data-restore verification steps.

Expected: the restore network has no default route or production/provider/email credentials; `pg_restore` succeeds; every restored attachment matches the safe relative-path manifest; aggregate counts match; and every credential-bearing surface present in the captured schema is disabled/removed through fixed SQL without starting an application image. Session, verification, password/reset, OAuth-token, invitation-attempt, and support-access tables each produce only `absent` or `scrubbed_zero`; any unknown auth-bearing table blocks the gate. A synthetic database-only fixture proves the restored database is writable after scrub.

- [ ] **Step 3: Record the gate result without sensitive content**

Record these exact field names in the root-only incident record:

```text
backup_epoch
encrypted_artifact_identifier
manifest_signature_verified
isolated_restore_passed
restored_sessions_rejected
restored_oauth_tokens_unusable
snapshot_application_image_executed
restore_duration_seconds
operator_identity
```

Expected: every positive boolean result field is true, `snapshot_application_image_executed` is false, and `restore_duration_seconds` is below 14400. This proves immediate data recoverability only. Keep the exact encrypted Phase A snapshot and signed envelope immutable: after Issue 13, Task 5 Phase B reuses this same snapshot for current-image migration/replay verification. Issue 2 mutation remains blocked until that Phase B evidence and Issue 2's journal genesis contract both pass.

---

### Task 3: Publish Minimal Parent Issues and Base Remote Branches

**Files:**
- Create untracked: `/private/tmp/munjib-security-leaf-map.tsv`
- Remote create: 14 parent GitHub issues and 14 parent remote branches.
- Do not change the local `main` checkout or push the restricted design branch.

**Interfaces:**
- Consumes: User approval of this master plan, GitHub issue `#154`, and the current remote `main` SHA.
- Produces: TSV columns `leaf`, `issue`, `branch`, and `url`; downstream child-release and worktree setup resolves parent issue numbers from this file.

- [ ] **Step 1: Verify GitHub authentication and the restricted push guard**

Run:

```bash
gh auth status
git -C /private/tmp/munjib-security-hardening-design-154 config --get branch.issue-154-security-hardening-design.pushRemote
```

Expected: GitHub authentication succeeds and the second command prints `restricted-local-only`.

- [ ] **Step 2: Fix the public-safe publication manifest**

Use these exact rows. The dependency text is scheduling metadata, not a substitute for capability closure or migration admission. Issue numbers and remote branch names below are the canonical tracking handles; do not refer to a leaf without them in follow-up work.

| Leaf | Priority | Issue | Remote branch | Slug | Public title | Public dependencies | Public acceptance |
| ---: | --- | ---: | --- | --- | --- | --- | --- |
| 1 | P0 | #155 | `issue-155-security-auth-runtime` | `security-auth-runtime` | `[Security P0] Harden production authentication runtime` | Leaf 13A and deployed Leaf 3 | Production authentication fails closed and public signup stays closed. |
| 2 | P0 | #156 | `issue-156-security-trial-isolation` | `security-trial-isolation` | `[Security P0] Isolate launch identities and trial access` | Leaves 1 and 13B | Launch identities have no implicit access and every reduction is recoverably journaled. |
| 3 | P0 | #157 | `issue-157-security-nextjs-upgrade` | `security-nextjs-upgrade` | `[Security P0] Upgrade the security-critical web runtime` | Leaf 13A | The production runtime contains no applicable known advisory at release time. |
| 4 | P0 | #158 | `issue-158-security-ai-output-egress` | `security-ai-output-egress` | `[Security P0] Prevent unintended media egress` | Leaf 13A and deployed Leaves 3 and 1 | AI, document, and user-media rendering cause no automatic external request. |
| 5 | P1 | #159 | `issue-159-security-archive-boundaries` | `security-archive-boundaries` | `[Security P1] Enforce active resource boundaries` | Leaves 2 and 13B | Archived and purged resources are unavailable and reductions are journaled. |
| 6 | P1 | #160 | `issue-160-security-document-acl` | `security-document-acl` | `[Security P1] Close document authorization gaps` | Leaves 1, 2, and 5 | Folder, link, permission, and history paths enforce current authorization. |
| 7 | P1 | #161 | `issue-161-security-signup-gate` | `security-signup-gate` | `[Security P1] Add an invite-first signup gate` | Leaves 1, 2, 8, and 13B | Token-free browser attempts and verified invitations replace public signup. |
| 8 | P1 | #162 | `issue-162-security-auth-abuse-sessions` | `security-auth-abuse-sessions` | `[Security P1] Add auth abuse controls and session revocation` | Leaves 1, 2, and 13B | Auth routes fail closed under abuse and individual sessions are revocable. |
| 9 | P1 | #163 | `issue-163-security-ai-history-authorization` | `security-ai-history-authorization` | `[Security P1] Reauthorize derived AI history` | Leaves 2, 4, 6, and 13B; deploy after the Leaf 7 migration prefix | Derived data retains transitive lineage and is hidden when a source is unreadable. |
| 10 | P1 | #164 | `issue-164-security-ai-provider-policy` | `security-ai-provider-policy` | `[Security P1] Enforce server-side AI provider policy` | Leaves 2, 4, 5, 6, 9, 13B and the Leaf 11 v1 migration prefix; coordinate with #139 | Provider choice, quotas, consent revocation, and telemetry are server-owned. |
| 11 | P1 | #165 | `issue-165-security-attachment-lifecycle` | `security-attachment-lifecycle` | `[Security P1] Harden attachment import and lifecycle` | Leaves 2, 4, 5, 6, and 13B; v2 starts only after Leaf 10 | Two release checkpoints make confirmed imports, storage authority, content integrity, quota, and lifecycle fail closed. |
| 12 | P1 | #166 | `issue-166-security-edge-bindings` | `security-edge-bindings` | `[Security P1] Harden edge headers and continuous probes` | Leaves 3, 4, 7, 8, 9, 10, 11 v2, and 13B | Report-only observation precedes candidate-bound enforcement; private listeners remain continuously verified. |
| 13 | P0 | #167 | `issue-167-security-immutable-deploy` | `security-immutable-deploy` | `[Security P0] Establish immutable delivery and runtime gates` | 13A -> Leaf 3 -> Leaf 1 -> Leaf 4 -> 13B | A fixed least-authority delivery substrate precedes an exact-digest private runtime and monotonic capability floor. |
| 14 | P1 | #168 | `issue-168-security-backup-restore` | `security-backup-restore` | `[Security P1] Add encrypted backup and restore drills` | Leaves 2, 5, 6, 7, 8, 9, 10, 11 v2, 12 v2, and 13B | Encrypted backups, continuous security journal replay, and current recovery tooling meet measured objectives. |

- [ ] **Step 3: Create or verify each exact issue**

Capture one base for the entire run:

```bash
gh api repos/dschoi30/munjib/git/ref/heads/main --jq '.object.sha'
```

For every row, query all issues using the exact standalone body markers `Parent: #154` and `Program leaf: <n>`. Zero matches creates one issue with only these lines and the fixed disclosure sentence; one match is reused only when title, priority, dependency text, and acceptance are exact; two or more matches or any mismatch stops before further mutation.

```text
Parent: #154
Priority: <priority>
Program leaf: <leaf>
Dependencies: <dependencies>
Acceptance: <acceptance>

Detailed findings, operational evidence, and implementation plans remain in restricted local records.
```

- [ ] **Step 4: Create or verify each remote branch at the captured base**

For branch `issue-<issue>-<slug>`, query its exact remote ref. If absent, create it at the captured base with the GitHub Git refs API or `git push origin <base>:refs/heads/<branch>`. If present, require its SHA to equal the captured base. Any difference stops with `EXISTING_BRANCH_SHA_MISMATCH`; never update, force-push, or rewrite it.

- [ ] **Step 5: Write the mapping with one `apply_patch` operation**

Only after all 14 issue/ref pairs verify, create or replace `/private/tmp/munjib-security-leaf-map.tsv` with `apply_patch`, never redirection or append. Use header `leaf<TAB>issue<TAB>branch<TAB>url` and exactly 14 unique rows ordered 1 through 14. Re-read it and re-verify every marker and remote SHA. A rerun against matching state performs no remote mutation.

Expected: 14 verified parent issue URLs, 14 verified parent branches at one captured `base_sha`, and a 15-line TSV. No local checkout changes branch, and no restricted finding, command, topology, account state, or evidence is published.

- [ ] **Step 6: Verify publication without opening restricted content**

Run:

```bash
wc -l /private/tmp/munjib-security-leaf-map.tsv
gh issue list --repo dschoi30/munjib --state open --limit 30
git ls-remote --heads origin 'issue-*-security-*'
git -C /Users/developer/Documents/munjib status --short --branch
```

Expected: the mapping file has 15 lines, each new issue appears with generic metadata, each mapped branch exists remotely, and the main checkout remains on `main` with its pre-existing untracked files untouched.

---

### Task 4: Establish Leaf 13A, Then Deliver the P0 Runtime Leaves

**Files:**
- Execute the Leaf 13A portion of `docs/superpowers/plans/2026-07-11-security-immutable-deploy.md`.
- Execute leaf plans 3, 1, and 4 from separate child/parent release worktrees.
- Update release mappings only outside Git; never add restricted plans to implementation commits.

**Interfaces:**
- Consumes: Tasks 1 and 2 evidence, the parent issue mapping, and the Leaf 13 parent issue.
- Produces: A no-mutation fixed delivery substrate, then the dependency-closed deployed chain Leaf 3 -> Leaf 1 -> Leaf 4 through that substrate. Leaf 2 still waits for Leaf 13B.

| P0 release | Direct release dependency | Required deployed capability closure |
|---|---|---|
| Leaf 13A | Wave 0.5 Phase A evidence | Empty protected-owner registry plus schema/policy; no application capability |
| Leaf 3 | Leaf 13A | `secure-next-runtime@1` |
| Leaf 1 | Leaf 13A + deployed Leaf 3 | `secure-next-runtime@1`, then `auth-runtime-fail-closed@1` |
| Leaf 4 | Leaf 13A + deployed Leaves 3/1 | `secure-next-runtime@1`, `auth-runtime-fail-closed@1`, then `zero-ambient-media-egress@1` |
| Leaf 13B | Leaf 13A + deployed Leaves 3/1/4 | Compile all three exact deployed generations into the initial monotonic floor |

- [ ] **Step 1: Execute Leaf 13A child Issue #169 on `issue-169-delivery-substrate`**

Issue #169 and remote branch `issue-169-delivery-substrate` are the canonical tracking handles for this child. Use its isolated worktree from the latest verified `origin/main`, and use `superpowers:using-git-worktrees` plus `superpowers:subagent-driven-development`.

Expected: the host receives only the unprivileged fixed SSH submitter, root systemd socket broker, verifier, strict OCI host-bundle installer, trust policy, shared lock, audit journal, protected-owner schema/policy with an empty owner registry, and account/key restrictions. The broker verifies `SO_PEERCRED` and the full signed request independently. Before/after evidence proves no running app, database, Caddy policy, floor, `current.json`, `rollback.json`, or `recovery.json` changed. The deploy account has no interactive capability, Docker group/socket, sudo, setuid path, root SSH, forwarding, repository credential, or arbitrary argument path.

- [ ] **Step 2: Execute Leaf 3 through 13A**

Create the Leaf 3 worktree from latest `main` plus 13A and execute `docs/superpowers/plans/2026-07-11-security-nextjs-upgrade.md` with a fresh implementer/reviewer sequence.

Expected: the exact candidate has zero applicable GitHub advisories at release time, `pnpm audit --prod` passes, all runtime/security regressions pass, and the signed envelope is the only production delivery input. A fixed `15.5.18` string is not accepted as permanent proof.

- [ ] **Step 3: Execute Leaf 1 through 13A**

Execute `docs/superpowers/plans/2026-07-11-security-auth-runtime.md` from a separate worktree after merging latest `main`, 13A, and the deployed Leaf 3 release. Its signed capability must require the exact deployed `secure-next-runtime@1` generation.

Expected: canonical password verification is bounded and fail-closed; password signup and verified-but-unlinked Google are denied before adapter mutation; OAuth provider tokens/profile images are never persisted or emitted; existing password and already-linked Google login pass. Remove the temporary Google matcher only after production smoke. Keep the public password-signup matcher until invite rollout completes.

- [ ] **Step 4: Execute Leaf 4 through 13A**

Execute `docs/superpowers/plans/2026-07-11-security-ai-output-egress.md` with a fresh implementer after Leaf 1 is reviewed/deployed. Its signed capability must require the exact deployed `secure-next-runtime@1` and `auth-runtime-fail-closed@1` generations.

Expected: AI, imported Markdown, editor Markdown, avatar, provider-profile, and session media produce zero automatic browser/server fetch and no prefetchable URL. The leaf's exact capability is published before traffic switch.

- [ ] **Step 5: Close the P0 gate only after production evidence**

Record only these non-sensitive results:

```text
leaf_13a_no_runtime_mutation=pass
application_signup_denied=true
unlinked_google_signup_denied=true
oauth_token_zero_persistence=pass
profile_media_zero_persistence=pass
secure_runtime_advisory_check=pass
external_render_requests=0
external_prefetchable_hrefs=0
wave_0_5_restore_gate=pass
```

Expected: all fields satisfy the shown values. Otherwise keep the relevant containment and reopen the owner release.

---

### Task 5: Establish the Leaf 13B Immutable Runtime Gate

**Files:**
- Execute the Leaf 13B portion of `docs/superpowers/plans/2026-07-11-security-immutable-deploy.md`.

**Interfaces:**
- Consumes: 13A and completed Leaves 3, 1, and 4; current CI/Compose; Leaf 13 parent; independent release approval.
- Produces: Exact source-bound application/host-bundle digests, real DSSE attestations, current scan/SBOM evidence, native ARM integration, non-owner database roles, private bindings, monotonic capabilities, separated app/rollback/recovery records, and registry-outage recovery qualification consumed by Issue 2 and later leaves.

- [ ] **Step 1: Create and execute the Leaf 13B child release**

Create a generic child issue under Leaf 13 with title `[Security P0] Activate immutable private runtime`, branch from latest verified `main`, and merge deployed Leaves 3, 1, and 4. Execute the Leaf 13B tasks with a fresh sequential implementer and reviewers.

Expected: CI authorities are split; no privileged checkout path exists; production uses exact digest-addressed application and attested host bundles; migration/Web/tools share one image but distinct file credentials/roles; Web is non-owner/non-superuser; PostgreSQL and Web are private; blue/green promotion holds the global lock; a changed bind/evidence inode forces container recreation; the PRE_JOURNAL capability is exact-candidate and non-circular.

- [ ] **Step 2: Run rollback, rescan, and pointer-separation drills**

Expected: an eligible previous image restarts only if it satisfies the current floor; otherwise the response is maintenance/fix-forward. A rescan evidence subgeneration updates every matching current/rollback/recovery pointer under the global lock, republishes dynamic capabilities, and proves restart/restore consume the new evidence. Normal deploy never overwrites `recovery.json`.

- [ ] **Step 3: Qualify the independent recovery base for Wave 0.5 Phase B**

Restore the exact immutable Phase A snapshot in an outbound-isolated environment with the current separately attested recovery image and complete offline artifact mirror. Never execute the snapshot image. The order is roles-only, fixed allowlisted prerequisites, non-superuser `pg_restore`, ownership/default ACL, fresh PRE, current prerequisites/migrations/final ACL, auth scrub, capability publication, and synthetic verification as defined by Leaf 14.

Expected: the primary registry can be unavailable; `pg_catalog` is first; restored real credentials and sessions remain unusable; the synthetic login works only after scrub; and the oldest-point drill promotes `recovery.json` independently. This prepares but does not complete Leaf 2's two-run Phase B gate.

---

### Task 6: Execute Wave 2 Application and Data Boundaries

**Files:**
- Execute leaf plans 2, 5, 6, 7, 8, 9, 10, and 11.

**Interfaces:**
- Consumes: Leaf 13B capability/artifact gate, successful Wave 0.5 Phase A plus Phase B preparation for the same snapshot, active issue mapping, the direct capability graph, and the fixed migration-prefix deployment order.
- Produces: A continuous deny-only security journal before cleanup, durable Trial disable, active/archive enforcement, ACL closure, token-free invite signup, distributed abuse controls plus per-session revocation, transitive AI lineage, server-owned AI policy, and an attachment lifecycle that removes raw media parsing and physical-storage mutation from Web. Every destructive worker remains disabled.

- [ ] **Step 1: Execute Leaf 2 on the immutable base before any cleanup**

Merge leaves 1 and 13B into the leaf 2 worktree and execute `docs/superpowers/plans/2026-07-11-security-trial-isolation.md`.

Expected: before any production cleanup, the Leaf 2 candidate is applied to two
isolated restores of the original Phase A snapshot using the verified current recovery
image. Each run performs roles-only bootstrap, snapshot restore, ownership finalization,
fresh restore-local PRE verification, then the root-only pgcrypto prerequisite/current
migration. Its restore-only initializer binds genesis to the Phase A envelope without
production grants or a Phase-B gate; both results then create that short-lived gate.
Only the gate-consuming production initializer enables append/export grants and emits
the DB-owned contiguous journal/JOURNAL_READY capability. Cleanup durably disables
Trial and removes only reviewed memberships in the same transactions as journal
entries. Break-glass support remains non-manager, query-time-expiring, and disabled
unless explicitly invoked.

- [ ] **Step 2: Execute Leaf 5 after Leaf 2**

Run `docs/superpowers/plans/2026-07-11-security-archive-boundaries.md` from the journal-aware immutable base.

Expected: the active/archived/purged matrix passes; archive/delete reductions append atomically; recovery uses operation provenance; and library-default destructive execution still returns `DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED`.

- [ ] **Step 3: Execute migration-free Leaf 6 and then migration-bearing Leaf 8**

Run `docs/superpowers/plans/2026-07-11-security-document-acl.md`.

Expected: folder/link/permission/history paths enforce current user, workspace-member, and organization-member subjects; permission reductions append atomically; signed cursors verify a canonical MAC before body parsing.

Then rebase Leaf 8 on the deployed Leaf 5 prefix and execute `docs/superpowers/plans/2026-07-11-security-auth-abuse-sessions.md`.

Expected: `20260712020000` is the next successful production migration; shared PostgreSQL limits fail closed and a JWT remains active only when its hash-only session registry, user/session versions, and durable auth state all match.

- [ ] **Step 4: Execute Leaf 7 after Leaf 8**

```text
leaf 7 -> docs/superpowers/plans/2026-07-11-security-signup-gate.md
```

Expected: `20260712030000` is next; the browser scrubs fragment tokens before hydration and exchanges them for a hash-only server attempt registry, guarded Google linking cannot duplicate or take over an account, and invitation terminal states are journaled. Invite mode stays closed until Leaf 8 and Leaf 7 production evidence pass.

- [ ] **Step 5: Execute Leaf 9 after the complete `020000 -> 030000` prefix**

Rebase on deployed Leaves 2, 4, 6, 7, and 13B, then execute `docs/superpowers/plans/2026-07-11-security-ai-history-authorization.md`.

Expected: `20260712040000` is next. Leaf 9 consumes Leaf 4 prompt authority, propagates direct, retrieval, conversation, and memory lineage, issues one-shot `AuthorizedProviderMaterial`, buffers complete provider output, and owns the only locked finalizer. Pre-Leaf-10 telemetry contains neither content nor tenant/source identifiers.

- [ ] **Step 6: Execute Leaf 11 v1 after Leaf 9**

Create the Leaf 11 v1 child from the deployed Leaf 9 prefix and execute only the transition/backfill/storage-authority tasks in `docs/superpowers/plans/2026-07-11-security-attachment-lifecycle.md`.

Expected: `20260712050000` is next. Legacy keys converge to unique ownership, untrusted image canonicalization and native storage authority run outside Web, Web has no attachment-volume/native-addon mutation authority, and a signed production convergence report is durable. Remote fetch, contract migration, and physical deletion remain disabled.

- [ ] **Step 7: Execute Leaf 10 after Leaf 11 v1 while coordinating with Issue #139**

Rebase on deployed Leaves 2, 4, 5, 6, 9, 13B and the Leaf 11 v1 migration prefix. Run `docs/superpowers/plans/2026-07-11-security-ai-provider-policy.md` without changing the active embedding index identity owned by #139.

Expected: `20260712060000` is next. Direct overrides cannot select forbidden provider/model combinations; Leaf 10 consumes only Leaf 9 authorized material, reserves the full conservative payload budget, makes one wire attempt, and never streams partial output. Transactional request/token/cost races pass, external-provider consent revocation journals atomically, restore defaults every external opt-in to false, and telemetry contains allowlisted metadata only.

- [ ] **Step 8: Execute Leaf 11 v2 only after Leaf 10 and v1 convergence**

Create a separate generic child issue/branch only after both Leaf 10 production deployment and the Leaf 11 v1 signed convergence report pass. Allocate the contract migration strictly above `20260712060000` and every migration then on `main`; never pre-create it on v1. Rebase current Leaves 2/4/5/6/9/10/13B and execute the v2 import, worker, contract, and deletion tasks.

Expected: the root-installed fixed fetch/canonicalizer/storage/deletion overlays accept no caller-selected path, image, project, network, environment, or command. Web retains no media decoder or physical-storage mutation authority. Explicit confirmation, PENDING quota, authorization-before-fetch, safe canonical output, integrity reads, durable delete-request proof, and independently fenced physical deletion pass. After v2, only a v2-compatible rollback or fix-forward is eligible.

---

### Task 7: Execute Wave 3 Edge, Recovery, and Purge Activation

**Files:**
- Execute leaf plans 12 and 14.
- Reuse all deployed access-reduction handlers from leaves 2, 5, 6, 7, 8, 9, 10, and 11.

**Interfaces:**
- Consumes: Leaves 3/4/7/8/9/10/11/13B for edge policy; leaves 2/5/6/7/8/9/10/11/12/13B for continuous journal replay and recovery; and Issue 5's fail-closed readiness contract.
- Produces: Enforceable security headers and admin isolation, continuous dual-stack/private-listener verification, automated encrypted snapshots plus indefinite journal replay, an independently selected current recovery image, and a separately approved signed/live destructive-purge composition.

- [ ] **Step 1: Execute Leaf 12 v1 report-only generation**

Create the Leaf 12 v1 child release after rebasing every mutation-surface owner then deployed, including leaves 3, 4, 7, 8, 9, 10, 11, and 13B. Run the v1 tasks in `docs/superpowers/plans/2026-07-11-security-edge-bindings.md`.

Expected: the Leaf 13B private-binding floor remains active; minimal CSP is enforced; complete TypeScript-compiler mutation inventory and attested Caddy/systemd generation are installed; nonce policy runs report-only with sensitive log sentinels absent; Caddy has no unauthenticated TCP admin listener; reports are bounded/rate-limited; every public A/AAAA answer rejects internal ports.

- [ ] **Step 1A: Execute Leaf 12 v2 candidate-bound enforcement**

After the required observation window and false-positive review, create a separate child issue/branch, rebase every mutation-surface owner again, and activate the exact candidate-bound policy. Initial carry-forward is allowed only when the complete critical artifact set is byte-identical and the observation evidence is sufficient. Any later protected-policy change begins a new seven-day isolated synthetic shadow while production keeps the previous enforcing policy.

Expected: no environment switch such as `MUNJIB_CSP_MODE` can weaken enforcement. Caddy generation validation, traffic switch, and rollback are atomic through the root bundle dispatcher. Every state-changing route/server action has exact provenance/body/content/auth/resource/journal coverage, and live OAuth/invitation/CSP sentinels are absent from Caddy, systemd, app, Sentry, and deploy logs.

- [ ] **Step 2: Execute Leaf 14**

Rebase Leaf 14 after every listed handler/edge dependency, then run `docs/superpowers/plans/2026-07-11-security-backup-restore.md`.

Expected: scheduled encrypted off-host snapshots meet 7/4/3 retention while journal batches remain indefinite; each epoch quiesces every file/DB writer before dump+archive; plaintext reader, one-shot encryptor, ciphertext uploader, purpose-bound signer, and catalog registrar remain non-combinable; upload/catalog retry occurs only after immediate verified unfreeze; stale/failure/journal-lag alerts fire; replay closes auth, membership, ACL, invitation, archive, consent, session/OAuth, AI, and attachment reductions; and the oldest retained snapshot restores through separate exact-object fetch, no-egress decrypt, loader/extractor, and a dedicated no-route engine without a host Docker socket.

- [ ] **Step 3: Activate destructive purge only after the three gates**

Confirm the restricted evidence record contains:

```text
ai_lineage_gate=pass
attachment_deletion_queue_gate=pass
isolated_restore_gate=pass
security_journal_checkpoint_continuity=pass
logical_purge_high_water_covered=pass
auth_disabled_gate=pass
recovery_image_capability_floor=pass
purge_dry_run_reviewed=true
```

Create one immutable operator intent through Leaf 14's fixed root entrypoint; callers cannot choose scope, path, evidence, command, or phase. The crash-safe operation ledger freezes its workspace/cutoff/candidate scope and advances only through `OPEN -> STAGING_CLOSED -> FENCE_PENDING -> DOCUMENTS_FINALIZED -> COMPLETE`.

Each logical batch acquires the global lock before credentials and DB locks, rechecks current Issue 9/11 readiness inside a SERIALIZABLE transaction, stages only deny/tombstone/delete-request state, appends the canonical events last, stores their returned sequence/hash, commits, and releases the global lock. It deletes no row or byte. The independent exporter/uploader/signer then advances the remote immutable high-water while no purge lock is held. A later physical invocation prechecks that signed handoff outside the lock, acquires the same lock without waiting, re-verifies the same file descriptor and exact operation/item tuple, and performs one bounded idempotent deletion. It never polls, sleeps, or waits for export while holding the lock.

Expected: every logical candidate is inaccessible before export, every physical deletion is covered by independent signed remote high-water, queue/item rows survive document deletion, verified `ENOENT` completes a crash-after-unlink retry, and rollback can stop future work without pretending already removed bytes are recoverable.

---

### Task 8: Apply the PR, Review, and Production Evidence Loop to Every Leaf

**Files:**
- Stage only the current leaf's source, tests, migrations, and required wiki maintenance.
- Do not stage restricted master/leaf planning commits in implementation branches.

**Interfaces:**
- Consumes: A completed leaf task with focused verification.
- Produces: One reviewed, CI-green, deployed, and smoke-verified leaf or an explicitly blocked issue with the failing evidence.

- [ ] **Step 1: Confirm the leaf plan finished with a clean verified worktree**

Run:

```bash
pnpm wiki:lint
git diff --check origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected: lint exits zero, the diff check prints nothing, status is clean, and the log contains the leaf plan's focused commits. The known unresolved sidebar image warning may remain only if the leaf did not touch that artifact. Each leaf plan must already have run `wiki:sync-plan`, `wiki:manifest`, `wiki:lint`, and `wiki:sync-check --staged` before its final commit.

After every implementation commit and immediately before each push or PR action, run
this non-printing disclosure guard over the complete public branch range:

```bash
set -euo pipefail
git fetch origin main
restricted_ref=issue-154-security-hardening-design
commit_range=origin/main..HEAD
guard_tmp="$(mktemp -d)"
trap 'rm -rf -- "$guard_tmp"' EXIT

if git show-ref --verify --quiet "refs/heads/$restricted_ref"; then
  if git merge-base --is-ancestor "$restricted_ref" HEAD; then
    echo 'restricted planning history is present' >&2
    exit 1
  else
    status=$?
    if [ "$status" -ne 1 ]; then
      echo 'restricted ancestry check failed' >&2
      exit 1
    fi
  fi
else
  status=$?
  if [ "$status" -ne 1 ]; then
    echo 'restricted ref lookup failed' >&2
    exit 1
  fi
fi

fingerprints='Production containment uses rotated|quarantined Trial identity|Wave 0\.5|/private/tmp/munjib-security|2026-07-11-security-hardening-remediation-design'
scan_fingerprints() {
  file="$1"
  label="$2"
  if rg -q -- "$fingerprints" "$file"; then
    echo "restricted planning fingerprint exists in $label" >&2
    exit 1
  else
    status=$?
    if [ "$status" -ne 1 ]; then
      echo "fingerprint scanner failed for $label" >&2
      exit 1
    fi
  fi
}

git rev-list --reverse "$commit_range" > "$guard_tmp/commits"
git log --format='%B' "$commit_range" > "$guard_tmp/messages"
scan_fingerprints "$guard_tmp/messages" 'commit messages'

while IFS= read -r commit; do
  git diff-tree --root -m --no-commit-id --name-only --diff-filter=ACMR \
    -r -z "$commit" > "$guard_tmp/paths"
  while IFS= read -r -d '' path; do
    printf '%s' "$path" > "$guard_tmp/path-value"
    scan_fingerprints "$guard_tmp/path-value" "commit $commit path"
    case "$path" in
      docs/superpowers/plans/2026-07-11-security-*|\
      docs/superpowers/specs/2026-07-11-security-*)
        echo "restricted plan path exists in commit $commit" >&2
        exit 1
        ;;
    esac
    GIT_LITERAL_PATHSPECS=1 git ls-tree -z "$commit" -- "$path" \
      > "$guard_tmp/tree-entry"
    entry_count=0
    while IFS= read -r -d '' _entry; do
      entry_count=$((entry_count + 1))
    done < "$guard_tmp/tree-entry"
    if [ "$entry_count" -ne 1 ]; then
      echo "changed path lookup failed in commit $commit" >&2
      exit 1
    fi
    git show "$commit:$path" > "$guard_tmp/blob"
    scan_fingerprints "$guard_tmp/blob" "commit $commit blob"
  done < "$guard_tmp/paths"
done < "$guard_tmp/commits"
```

Expected: no output and exit 0. Implementation wiki updates describe only merged
code behavior and public-safe verification; they never copy the restricted chronology,
gates, identities, topology, or operator evidence.

- [ ] **Step 2: Push the verified commits and open a draft PR**

Run from the leaf worktree with its actual mapped branch:

```bash
git push -u origin HEAD
gh pr create --draft --base main --head "$(git branch --show-current)" --title "$(git log -1 --pretty=%s)" --body 'Parent: #154

This PR implements one non-sensitive security hardening leaf. Detailed findings and operational evidence remain in restricted local records.'
```

Expected: push succeeds and the returned PR URL targets only the current leaf branch.

- [ ] **Step 3: Mark ready and run the mandatory review wait**

Run:

```bash
gh pr ready
gh pr checks
```

Expected: the PR becomes ready. Poll `gh pr checks` through the product wait mechanism in at most 60-second increments until required checks finish; do not use `--watch` or a single blocking sleep that can exceed 60 seconds. Continue the same bounded wait until at least five minutes have elapsed since review request.

- [ ] **Step 4: Re-read review threads and checks**

Run:

```bash
gh pr view --comments
gh pr checks
gh api graphql -F owner=dschoi30 -F name=munjib -F number="$(gh pr view --json number --jq .number)" -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved comments(first:20){nodes{body path line}}}}}}}'
```

Use `superpowers:receiving-code-review` before applying review feedback. Inspect `reviewThreads.nodes[].isResolved`, not only flat comments, then repeat focused/full verification, wiki sync, commit, push, and the five-minute re-check until no actionable unresolved thread or failing check remains.

Expected: the PR has no unresolved actionable feedback and every required check passes before merge.

- [ ] **Step 5: Merge, deploy, and capture smoke evidence**

Use `superpowers:finishing-a-development-branch`, merge the PR, verify the exact deployed digest, and execute the leaf's production smoke/rollback checkpoint.

Expected: the owning issue is closed only after the production contract passes. Keep edge denials or disabled destructive workers whenever their removal/activation criteria have not passed.

---

### Task 9: Close the Program

**Files:**
- Update non-sensitive final status in GitHub issue `#154`.
- Keep detailed evidence in restricted storage.

**Interfaces:**
- Consumes: All 14 closed leaf issues, production smoke evidence, and the completed restore drill.
- Produces: A generic public completion record and an internally reviewable evidence set.

- [ ] **Step 1: Verify the final invariant set**

Confirm all of these values in restricted evidence:

```text
all_parent_workstreams_complete=14
all_required_child_releases_deployed=true
implicit_launch_memberships=0
trial_auth_disabled=pass
application_signup_policy=invite
unlinked_google_signup_denied=true
application_trial_denied=true
external_render_requests=0
external_prefetchable_hrefs=0
archived_resource_matrix=pass
ai_lineage_matrix=pass
provider_policy_and_quotas=pass
prompt_authority_chain=pass
migration_prefix_release_order=pass
private_listener_matrix=pass
middleware_reserved_seam_transition=pass
deployed_artifact_identity=digest-verified
release_broker_peer_and_envelope_reverification=pass
security_capability_floor=pass
database_runtime_role_nonowner_nonsuperuser=pass
security_journal_continuity=pass
attachment_web_storage_mutation_authority=absent
logical_purge_high_water_covered=pass
backup_role_separation=pass
recovery_compatibility_not_equality=pass
wave_0_5_phase_a_data_restore=pass
wave_0_5_phase_b_current_image_replay=pass
backup_completion_age_lt=86400
restore_browser_external_requests=0
restore_rpo_seconds_lte=86400
restore_rto_seconds_lte=14400
external_control_plane_review=pass
```

Expected: every boolean/status value matches and both numeric objectives are within their limits. `external_control_plane_review` is a restricted pass/fail checklist that verifies:

- SSH principals, disabled root/password login, forced deploy command, and disabled shell/port/agent/X11 forwarding;
- empty Docker-group membership for human/deploy accounts, no deploy sudoers/setuid/root-SSH route, and an exact-peer root systemd broker as the only delivery authority;
- current host OS/kernel patches, reboot requirement, time sync, core-dump and swap policy;
- dual-stack listener allowlist for 22/80/443 and denial of 2019/2375/2376/3000/5432/55432/9229/11434, with Caddy admin off or Unix-only;
- OCI IAM/instance principal, metadata restriction, network security groups/routes/public IP, volume encryption, backup object lock, and delete authority;
- registry immutability, package delete authority, registry-only read credential, and offline recovery mirror;
- DNS registrar MFA, transfer lock, recovery contacts, and DNSSEC;
- GitHub branch/ruleset and production-environment protection, selected actions, SHA-pinning, Dependabot, secret scanning/push protection, and code scanning;
- Sentry/Langfuse access, PII and retention policy, exact endpoint catalog, and PostgreSQL/application log redaction;
- purpose-bound KMS rotation, offline age-key custody, indefinite historical verification roots, and registry-outage oldest restore;
- quiet secret-remanence review of cloud-init, shell history, journal, stopped-container environments, OCI layers, and build cache.

The public completion comment contains none of those identities or findings. Full PostgreSQL tenant RLS and privileged human MFA/passkeys remain explicitly recorded P2 residual risks and are not misreported as complete.

- [ ] **Step 2: Post the generic tracking issue completion**

Run:

```bash
gh issue comment 154 --repo dschoi30/munjib --body 'All planned hardening leaves have been deployed and their non-sensitive acceptance checks are complete. Detailed operational evidence remains in restricted records.'
gh issue close 154 --repo dschoi30/munjib
```

Expected: issue #154 closes without publishing findings, production topology, credentials, account state, or private evidence.
