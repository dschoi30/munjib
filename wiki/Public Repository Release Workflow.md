---
id: workflow-public-repository-release
title: Public Repository Release Workflow
type: workflow
status: draft
summary: Existing-repository publication gates for credential revocation, private delivery, history and metadata cleanup, licensing, and public CI.
created: 2026-10-09
updated: 2026-10-09
source_count: 10
tags:
  - munjib
  - security
  - workflow
links:
  - "[[index|Wiki Index]]"
  - "[[CI CD And Monitoring Workflow]]"
  - "[[Auth And Permissions Workflow]]"
  - "[[Security Hardening Public Status]]"
  - "[[Wiki Maintenance Automation]]"
---

# Public Repository Release Workflow

## Decision and current state

The owner selected MIT licensing and publication of the existing repository
after cleaning its history and delivery configuration. This is preparation;
the repository remains private. The ordered operator gates are in
`docs/runbooks/public-release-readiness.md`.

## Implemented preparation

`LICENSE` records the MIT choice and `SECURITY.md` provides reporting and
fixture-handling guidance. `.gitignore` excludes local tooling, private working
material, and non-example environment variants. Ignoring files does not remove
tracked content or historical evidence.

The `Secret scan` workflow uses a checksum-verified Gitleaks 8.30.1 release,
a commit-pinned checkout with no persisted credentials, a GitHub-hosted runner,
and read-only token permissions. Reports remain redacted and are not uploaded.
Two exact historical test-example fingerprints are classified in
`.gitleaksignore`; this does not suppress whole rules or paths.

Application CI no longer defines production deploy or runner-smoke jobs. A
separate private operations repository admits successful exact source main CI
and secret scan without copying source or requiring per-release ops commits.
On 2026-10-09, private runner smoke and actual deployment succeeded. Independent
host verification matched deployment state, checkout and image to source SHA
`f94359945f118f86f68607f69f085fc5c5687c56`; local and public HTTP returned 200.
The old source runner service is disabled and its registration removed; the
source repository has zero runners and private operations has one online runner. Keep
a source-only read credential in private operations and renew it before expiry;
revoke it only after a replacement credential is independently verified. See
`docs/runbooks/private-operations-delivery.md`.

## External reference publication

The owner authorized preserving the two external full-text LLM Wiki copies in a
private backup and publishing attribution plus a project-written summary only.
`llm-wiki.md` contains that summary; `raw/sources/llm-wiki.md` is a source pointer.
This explicit publication exception does not change the ordinary immutable-raw
maintenance rule. The linked author's text is not claimed under this project's
MIT license. Historical copies still require cleanup before publication.

## Remaining gates

Credential revocation and production identity configuration need deployed-state
verification. Production runner access has moved to the private delivery path.
The current deployment wrapper's recorded-SHA ancestry contract must be
reconciled with any new commit map before the next deployment.

History rewriting also affects PR refs and cached objects. GitHub metadata and
Actions logs need their own review. A local rewrite rehearsal is not a release,
a credential-rotation result, or evidence of cache removal. The runbook records
its scope and limitations without publishing private findings.

## Branch cleanup

After private recovery backups, the owner-authorized cleanup deleted sixteen
obsolete source remote branches, one merged operations branch and thirteen
unused local branches. Checked-out worktree branches and dirty files were retained.
PR #237 is merged; its remote branch was then removed. Deferred work remains
recoverable privately, rather than requiring public branch retention.

## Evidence

- Issue #234; owner decisions on MIT and existing-history cleanup.
- `LICENSE`, `SECURITY.md`, `.gitignore`, `.gitleaksignore`.
- `scripts/security/scan-secrets.sh` and `.github/workflows/secret-scan.yml`.
- `.github/workflows/ci-cd.yml` and `tests/github-actions/ci-cd.test.ts`.
- `docs/runbooks/private-operations-delivery.md`.
- `docs/runbooks/public-release-readiness.md`.
- `scripts/deploy/munjib-deploy.sh`; `lib/security/production-seed-guard.ts`.
- GitHub secure-use and sensitive-data-removal documentation linked in the runbook.
