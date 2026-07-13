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
| #156 | Draft implementation PR #199 | `issue-156-security-trial-isolation-implementation` / PR #199 (d7a9b70) | Journal/auth contracts only; no migration, Trial disable/quarantine, credential cleanup, support grant, purge, or production operation. Depends on #184/#185. |
| #159 | Draft implementation PR #200 | `issue-159-active-resolver-implementation` / PR #200 (c19c294) | Active-resource/lock seams fail closed until canonical database-time membership and journal authority are deployed; no purge or production operation. |
| #160 | Draft implementation PR #201 | `issue-160-document-acl-implementation` / PR #201 (ba3c35c) | ACL seam consumes canonical authority and caps grants; no competing resolver, schema/journal change, purge, or production operation. |
| #162 | Draft implementation PR #202 | `issue-162-auth-abuse-implementation` / PR #202 (0ef75ac) | Bounded auth guard/store seam only; no session registry, migration, secret rotation, route activation, or production mutation. |
| #163 | Draft implementation PR #203 | `issue-163-ai-history-implementation` / PR #203 (1c0f1e2) | Lineage/tombstone contract only; no schema, route, purge, provider, telemetry, or production behavior change. |
| #164 | Draft implementation PR #204 | `issue-164-ai-provider-boundary-implementation` / PR #204 (b57f5a0) | Provider boundary is not wired to routes or credentials; activation remains gated on dependent leaves and #184/#185. |
| #165 | Draft implementation PR #195 | `issue-165-security-attachment-lifecycle` / PR #195 (9051a6d) | Readiness/lifecycle validation only; no purge, deletion, scheduler, storage inspection, or attachment mutation. |
| #168 | Draft implementation PR #206 | `issue-168-backup-manifest-implementation` / PR #206 (0c16e8b) | Manifest/receipt contract only; no snapshot, restore, destructive purge, key rotation, or production operation. Depends on #184/#185 and journal/purge/attachment leaves. |
| #139 | Draft implementation PR #198 | `issue-139-embedding-readiness` / PR #198 (250db1a) | Registry/config contract only; no WorkspaceAiSettings schema, backfill, reindex, provider activation, or production rollout. |
| #161 | Draft implementation PR #207 | `issue-161-invite-token-primitives` / PR #207 (316824f) | Opaque token primitives only; no invitation schema/routes/middleware/OAuth/signup activation/migration or production mutation. Depends on journal, abuse/session, #184, and #185. |
| #166 | Draft implementation PR #205 | `issue-166-edge-probe-implementation` / PR #205 (966dfd0) | Pure edge evaluator only; no Caddy, DNS, TLS, firewall, host monitoring, route, or production traffic change. |

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

Use the GitHub issue/PR pages named above for current state. The implementation
PRs #198, #199, #200, #201, #202, #203, #204, #195, #205, #206, and #207 are
draft, dependency-gated handoffs; none is deployment or issue-closure evidence.
If a branch or PR changes, update this map with the new public handle and
preserve the explicit non-claim until independent deployment evidence exists.
