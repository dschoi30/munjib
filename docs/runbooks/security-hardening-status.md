# Security hardening public status (Issues #154 and #167)

This is a public-safe status map for the security hardening parents. It is
intentionally limited to GitHub-visible issue/branch/PR handles, merge and CI
claims that are already published, dependency gates, and explicit non-claims.
Secrets, host topology, account state, operator evidence, and restricted plan
material do not belong here.

## Snapshot

- Source of truth for this audit: `origin/main` at `c742a62`
  (merged PR #207, `security: add Leaf 7 invite token primitives`).
- Parent #154 (application hardening program) remains open until every child
  is deployed and its public-safe verification is complete.
- Parent #167 (immutable delivery/runtime gates) remains open. The immutable
  runtime continuation is deliberately fail-closed until the host delivery
  broker is installed and attested.
- Current GitHub Actions runs for the open readiness PRs are not reaching a
  runner: GitHub reports an account-payment failure or spending-limit block.
  This external billing gate must be cleared before CI-backed merge or deploy
  decisions; local focused tests do not replace that evidence.

## Child status map

| Issue | Public status | Branch / PR | Dependency or non-claim |
| --- | --- | --- | --- |
| #155 | Closed; production auth/runtime verification reported | merged runtime chain | No new auth mutation is implied by this status page. |
| #157 | Closed; PR #172 merged and production verification reported | `issue-157-security-nextjs-upgrade` / PR #172 | PR #173 supplied the dependency-audit remediation; no new advisory result is asserted here. |
| #158 | Closed by the media-egress release | `issue-158-security-ai-output-egress` / PR #178 | This does not authorize external media egress. |
| #167 | Parent open | `issue-167-security-immutable-deploy` | Parent tracking only; no completion claim. |
| #169 / 13A | Merged delivery-substrate code in PR #170 | `issue-169-delivery-substrate` / PR #170 | Repository code is merged; host installation and attestation are tracked separately in #185. |
| #180 | Database-authority contracts merged in PR #181; parent remains open | `issue-180-security-immutable-runtime` / PR #181 | Runtime promotion, rollback/rescan, and recovery qualification are not complete. |
| #184 | Open implementation PR #188 | `issue-184-security-immutable-runtime-gate` / PR #188 | Remains fail-closed until #185 is independently accepted and CI evidence is available. |
| #185 | Delivery bundle merged in PR #186 | `issue-185-delivery-substrate-install` / PR #186 (`394cc9b`) | Host broker installation, trust enrollment, and independent attestation remain outside repository evidence. |
| #156 | Implementation merged in PR #199 (`30da043`) | `issue-156-security-trial-isolation-implementation` / PR #199 | Journal/auth contracts only; no migration, Trial disable/quarantine, credential cleanup, support grant, purge, or production operation. Depends on #184/#185. |
| #159 | Implementation merged in PR #200 (`3a7a3e3`) | `issue-159-active-resolver-implementation` / PR #200 | Active-resource/lock seams fail closed until canonical database-time membership and journal authority are deployed; no purge or production operation. |
| #160 | Implementation merged in PR #201 (`3cdae74`) | `issue-160-document-acl-implementation` / PR #201 | ACL seam consumes canonical authority and caps grants; no competing resolver, schema/journal change, purge, or production operation. |
| #162 | Implementation merged in PR #202 (`9499224`) | `issue-162-auth-abuse-implementation` / PR #202 | Bounded auth guard/store seam only; no session registry, migration, secret rotation, route activation, or production mutation. |
| #163 | Implementation merged in PR #203 (`17d7195`) | `issue-163-ai-history-implementation` / PR #203 | Lineage/tombstone contract only; no schema, route, purge, provider, telemetry, or production behavior change. |
| #164 | Implementation merged in PR #204 (`1f5c819`) | `issue-164-ai-provider-boundary-implementation` / PR #204 | Provider boundary is not wired to routes or credentials; activation remains gated on dependent leaves and #184/#185. |
| #165 | Open readiness PR #195 (`6d6db21`); CI billing-blocked | `issue-165-security-attachment-lifecycle` / PR #195 | Readiness/lifecycle validation only; no purge, deletion, scheduler, storage inspection, or attachment mutation. |
| #166 | Implementation merged in PR #205 (`7189b8b`) | `issue-166-edge-probe-implementation` / PR #205 | Pure edge evaluator only; no Caddy, DNS, TLS, firewall, host monitoring, route, or production traffic change. |
| #168 | Implementation merged in PR #206 (`7c5e9db`) | `issue-168-backup-manifest-implementation` / PR #206 | Manifest/receipt contract only; no snapshot, restore, destructive purge, key rotation, or production operation. Depends on #184/#185 and journal/purge/attachment leaves. |
| #139 | Open readiness PR #198 (`12d0828`); CI billing-blocked | `issue-139-embedding-readiness` / PR #198 | Registry/config contract only; no WorkspaceAiSettings schema, backfill, reindex, provider activation, or production rollout. |
| #161 / Leaf 7 primitives | Implementation merged in PR #207 (`c742a62`) | `issue-161-invite-token-primitives` / PR #207 | Opaque token primitives only; no invitation schema/routes/middleware/OAuth/signup activation/migration or production mutation. |
| #161 signup gate | Open readiness PR #161 (`43311d9`); CI billing-blocked | `issue-161-security-signup-gate` / PR #161 | Verified-Google/invitation contract only; no signup activation, schema, route, middleware, OAuth, or production mutation. |
| #187 / #156 readiness | Open PR (`6b2a031`); CI billing-blocked | `issue-156-security-trial-isolation` / PR #187 | Documentation/verification handoff; review threads are resolved, but merge waits on external CI and #184/#185 evidence. |
| #189 / #159 readiness | Open PR (`6d63e10`); CI billing-blocked | `issue-159-security-archive-boundaries` / PR #189 | Readiness/runbook only; no archive/purge activation. |
| #190 | Closed as duplicate | `issue-168-security-backup-restore` / PR #190 | Superseded by the stronger recovery contract merged in PR #206. |
| #191 / #162 readiness | Open PR (`1cb34bf`); CI billing-blocked | `issue-162-security-auth-abuse-sessions` / PR #191 | Readiness/runbook only; no session/auth-abuse activation. |
| #192 / #160 readiness | Open PR (`3721c66`); CI billing-blocked | `issue-160-security-document-acl` / PR #192 | Readiness/runbook only; no ACL route activation. |
| #193 / #163 readiness | Open PR (`2432c43`); CI billing-blocked | `issue-163-security-ai-history-authorization` / PR #193 | Readiness/test handoff only; streamed authorization contract is documented, no history mutation is activated. |
| #194 / #164 readiness | Open PR (`a10c4f5`); CI billing-blocked | `issue-164-security-ai-provider-policy` / PR #194 | Public-safe policy handoff only; no provider allowlist or route activation. |
| #196 / #166 readiness | Open PR (`483e417`); CI billing-blocked | `issue-166-security-edge-bindings` / PR #196 | Readiness contract/test only; no edge infrastructure or production traffic change. |
| #197 | Open status-map PR (this branch); CI billing-blocked | `codex/issue-154-security-hardening-status` / PR #197 | Documentation only; the map never certifies deployment, host attestation, snapshot/restore, purge, or issue closure. |

## Dependency order and non-claims

The public sequence is: merged prerequisite releases → broker delivery
installation/attestation (#185) → exact-digest private runtime gate (#184) →
dependency-complete application leaves → production recovery and destructive
operations. An open PR or a branch head is a readiness handoff, not a deployed
security control. The current GitHub billing block is an external prerequisite
for accepting fresh CI evidence; it does not change the security dependency order.

This page does not close #154, #167, or any child issue; does not certify host
broker presence; does not certify a production snapshot/restore or purge; and
does not disclose restricted operator evidence. Each child must retain its own
issue/PR review and CI record before a parent can close.

## Recheck procedure

```bash
git show -s --oneline origin/main
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Use the GitHub issue/PR pages named above for current state. Recheck PR checks
and the `Billing & plans` setting before attempting any merge or deployment.
If a branch or PR changes, update this map with the new public handle and
preserve the explicit non-claim until independent deployment evidence exists.
