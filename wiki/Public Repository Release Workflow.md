---
id: workflow-public-repository-release
title: Public Repository Release Workflow
type: workflow
status: draft
summary: Existing-repository publication gates for credential revocation, private delivery, history and metadata cleanup, licensing, and public CI.
created: 2026-10-09
updated: 2026-10-09
source_count: 8
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

Existing production jobs require the repository to remain private. This guard
only prevents the unchanged jobs from running after a visibility change. A
public fork may propose different workflow content, so removal of production
runner access remains a mandatory publication gate.

## Remaining gates

Credential revocation and production identity configuration need deployed-state
verification. Production runner access must move to a private delivery path.
The current deployment wrapper's recorded-SHA ancestry contract must be
reconciled with any new commit map before the next deployment.

History rewriting also affects PR refs and cached objects. GitHub metadata and
Actions logs need their own review. A local rewrite rehearsal is not a release,
a credential-rotation result, or evidence of cache removal. The runbook records
its scope and limitations without publishing private findings.

## Evidence

- Issue #234; owner decisions on MIT and existing-history cleanup.
- `LICENSE`, `SECURITY.md`, `.gitignore`, `.gitleaksignore`.
- `scripts/security/scan-secrets.sh` and `.github/workflows/secret-scan.yml`.
- `.github/workflows/{ci-cd,runner-smoke}.yml` and `tests/github-actions/ci-cd.test.ts`.
- `docs/runbooks/public-release-readiness.md`.
- `scripts/deploy/munjib-deploy.sh`; `lib/security/production-seed-guard.ts`.
- GitHub secure-use and sensitive-data-removal documentation linked in the runbook.
