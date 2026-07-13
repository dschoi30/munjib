# Security hardening public status (Issues #154 and #167)

This is a public-safe status map for the security hardening parents. It is
intentionally limited to GitHub-visible issue/branch/PR handles, merge and CI
claims that are already published, dependency gates, and explicit non-claims.
Secrets, host topology, account state, operator evidence, and restricted plan
material do not belong here.

## Snapshot

- Source of truth for this audit: `origin/main` at `545e8cb`
  (`security: preserve generated Prisma client in runtime image (#183)`).
- Parent #154 (application hardening program) remains open until every child
  is deployed and its public-safe verification is complete.
- Parent #167 (immutable delivery/runtime gates) remains open. The immutable
  runtime continuation is deliberately fail-closed until the host delivery
  broker is installed and attested.

## Child status map

| Issue | Public status | Branch / PR | Dependency or non-claim |
| --- | --- | --- | --- |
| #155 | Closed; production auth/runtime verification reported | merged runtime chain | No new auth mutation is implied by this status page. |
| #157 | Closed; PR #172 merged and production verification reported | `issue-157-security-nextjs-upgrade` / PR #172 | PR #173 supplied the dependency-audit remediation; no new advisory result is asserted here. |
| #158 | Closed by the media-egress release | `issue-158-security-ai-output-egress` / PR #178 | This does not authorize external media egress. |
| #167 | Parent open | `issue-167-security-immutable-deploy` | Parent tracking only; no completion claim. |
| #169 / 13A | Merged delivery-substrate code in PR #170 | `issue-169-delivery-substrate` / PR #170 | Repository code is merged; host installation and attestation are tracked separately in #185. |
| #180 | Database-authority contracts merged in PR #181; parent remains open | `issue-180-security-immutable-runtime` / PR #181 | Runtime promotion, rollback/rescan, and recovery qualification are not complete. |
| #184 | Draft implementation PR #188 with successful CI | `issue-184-security-immutable-runtime-gate` / PR #188 | Must remain draft/open until #185 is independently accepted. |
| #185 | Draft delivery bundle PR #186 | `issue-185-delivery-substrate-install` / PR #186 | Host broker installation, trust enrollment, and attestation require the restricted root/bootstrap channel; no production mutation is claimed. |
| #156 | Draft dependency seam PR #187 | `issue-156-security-trial-isolation` / PR #187 | No Trial disable, membership cleanup, support grant, journal mutation, or workflow activation. Depends on #184/#185. |
| #159 | Draft documentation-only readiness PR #189 | `issue-159-security-archive-boundaries` / PR #189 | Canonical database-time membership authority and deny-only journal semantics are not present on the release line. |
| #160 | Draft documentation-only readiness PR #192 | `issue-160-security-document-acl` / PR #192 | No competing ACL lookup, schema/journal change, purge, or production operation. Depends on the active-resource authority leaf. |
| #162 | Draft documentation-only readiness PR #191 | `issue-162-security-auth-abuse-sessions` / PR #191 | No limiter/session registry, schema migration, secret rotation, route activation, or host operation. |
| #163 | Draft documentation-only readiness PR #193 | `issue-163-security-ai-history-authorization` / PR #193 | No schema, route, purge, broker, secret, or production behavior change. |
| #164 | Draft documentation-only readiness PR #194 | `issue-164-security-ai-provider-policy` / PR #194 | Activation is gated on #139, #160, #163, #184, and #185; no provider or credential policy mutation. |
| #165 | Draft readiness PR #195 | `issue-165-security-attachment-lifecycle` / PR #195 (`7185ff8`) | Preparation-only contract; no purge, file deletion, scheduler, production storage inspection, or attachment mutation. |
| #168 | Draft recovery-readiness PR #190 | `issue-168-security-backup-restore` / PR #190 | No snapshot, restore, destructive purge, key rotation, or production operation. Depends on #184/#185 and the attachment/purge/journal leaves. |
| #139 | Assessment only; no implementation PR | issue #139 | Safe independent slice is limited to a future embedding registry/config contract; schema/backfill/activation remain gated. |
| #161 | Branch/commit prepared; no PR currently visible | `issue-161-security-signup-gate` (`4b22bb2`) | Preparation-only invite contract; no auth schema, route, middleware, OAuth, edge, migration, or production change. |
| #166 | Draft readiness PR #196 | `issue-166-security-edge-bindings` / PR #196 | Documentation/contract-only; no Caddy, DNS, TLS, firewall, host monitoring, route, or production traffic change. |

## Dependency order and non-claims

The public sequence is: merged prerequisite releases → broker delivery
installation/attestation (#185) → exact-digest private runtime gate (#184) →
dependency-complete application leaves → production recovery and destructive
operations. A draft PR or a branch head is a readiness handoff, not a deployed
security control.

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

Use the GitHub issue/PR pages named above for current state. The separately
anticipated signup handle `#198` and a PR for the current signup branch were
not visible at this audit; the branch/commit is prepared but not yet a draft
PR. If a branch or PR
changes, update this map with the new public handle and preserve the explicit
non-claim until independent deployment evidence exists.
