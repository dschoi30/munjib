# Security hardening tracking — current MVP

## Disposition — 2026-10-09

At the owner's request, the fourteen long-term issues below are closed as
`not_planned` and labelled `deferred-mvp`. This is scope deferral, not completion
or evidence of production activation. Each issue preserves its original scope
and a prominent deferral notice. Reopen/re-scope when adopted again.

Current source audit base: `f943599` (merged application/operations separation
PR #236). Public-release preparation remains active in #234. This disposition
neither waives its release gates nor certifies the absence of vulnerabilities.

## Deferred work and retained evidence

| Issue | Preserved preparation evidence | Remaining scope is deferred |
| --- | --- | --- |
| #139 | Registry contract PR #198 merged | Embedding profile settings, schema/backfill/reindex and activation |
| #154 | Program coordination and linked releases | Acceptance/deployment of the complete hardening program |
| #159 | PRs #189/#200 merged | Resource-boundary integration with canonical authority |
| #160 | PRs #192/#201 merged | Document ACL integration and authority qualification |
| #162 | PRs #191/#202 merged | Auth abuse/session-revocation integration and activation |
| #163 | PRs #193/#203 merged | Derived-history reauthorization integration |
| #164 | PRs #194/#204 merged | Provider policy enforcement on live routes |
| #165 | PR #195 merged | Attachment lifecycle integration and operational jobs |
| #166 | PRs #196/#205 merged | Edge infrastructure activation and continuous probes |
| #167 | Substrate/database contracts PRs #170/#181 merged | Immutable delivery/runtime program activation |
| #168 | Recovery manifest PR #206 merged | Encrypted backup/restore drills and independent qualification |
| #180 | Database-authority contract PR #181 merged | Runtime continuation originally split to #184 |
| #184 | PR #188 closed **unmerged**, commits archived privately; remote branch deleted | Exact-digest private runtime and promotion/recovery qualification |
| #185 | Bundle/lab PRs #186/#209 merged | Host broker installation, trust enrollment and attestation |

The current GitHub state also confirms readiness PRs #161, #187, #189,
#191–#198 are merged. PR #190 remains closed as a duplicate. The July snapshot's
claims that these PRs are open or currently blocked by billing are superseded.
Current CI has executed; this does not retroactively certify every old acceptance
or production gate.

## Resume and verification

1. Reconfirm owner adoption and reopen/re-scope the relevant issue.
2. Reinspect current code, dependencies, host requirements and original evidence.
3. Verify current refs. Recover deferred commits from the private backup into
   an isolated local checkout if their old remote branch was deleted. After
   publication history cleanup, port only the reviewed changes onto current
   clean main; never merge or push the archived old history back. Scan recovered
   changes, request fresh review and run current CI.
4. Independently verify any required deployment or operational acceptance.

Parent/child completion rules apply to a resumed program. A `not_planned`
closure must never be cited as successful implementation or deployment.
The issue-triage step initially preserved branches. Subsequent owner-authorized
branch cleanup deleted obsolete source/operations remote branches after verified
private backups, including PR #188's unmerged branch. Preparation commits remain
recoverable privately; checked-out local worktree branches and dirty files remain.
Only main and branches required by currently open PRs were retained remotely at
cleanup time. Query current refs rather than assuming an old branch is available.
Secrets, operator/account data and restricted evidence stay outside GitHub.
