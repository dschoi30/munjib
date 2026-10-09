# Existing-repository public release preparation

The selected release path preserves this repository and cleans its existing
history. The license choice is MIT. Keep the repository private until every
release gate below has been independently verified.

## 1. Preserve evidence and audit

- Keep an access-restricted backup of all original refs and a separate remote
  mirror for cleanup rehearsals. Do not rewrite an active checkout or another
  worktree, and never commit a replacement specification or private audit data.
- Scan remote branches, tags, and pull-request refs, not just `main`.
- Review issues, PR bodies, review submissions, inline comments, releases,
  Actions logs/artifacts, repository settings, and forks separately from Git.
- Scan with Gitleaks 8.30.1 using `scripts/security/scan-secrets.sh history`.
  Exact fixture fingerprints in `.gitleaksignore` cover two historical synthetic
  attachment-key examples. These exclusions are not evidence of credential
  rotation or of a complete manual audit.

The 2026-10-09 audit examined 136 remote refs: 15 branch heads and 121 pull refs.
Gitleaks examined 957 non-merge commit diffs with no remaining automated
findings after the two fixture classifications. Manual review found historical
credential context and operational identifiers that require cleanup. The
metadata inventory included 234 issue/PR records, 175 issue comments, 914 inline
review comments, 495 workflow runs, and no release records or current artifacts.
Review-submission bodies, retained Actions log contents, and other attachments
are separate pending audit surfaces. Private findings remain outside Git.

## 2. Revoke credentials and externalize operator configuration

- Confirm that every credential previously recorded as a production credential
  is revoked or rotated. Verify that the previous credential fails, without
  writing its value or the account identity to logs or repository content.
- Invalidate affected sessions through the actual deployed authentication
  mechanism. Do not assume an undeployed session-revocation contract is active.
- Keep real operator identities, hostnames, paths, and deployment configuration
  in private host configuration or a private operations repository. Public
  examples must use reserved example domains and local-only credentials.
- Validate that reserved-signup identities and workspace provisioning continue
  to protect the configured production identities after their configuration is
  externalized. Do not merely replace account literals in the live application.
- Keep production/staging seed execution blocked.

Local development fixtures and a forbidden development-secret blacklist do
not, by themselves, establish that an operational credential is active. Do not
remove a known-weak-secret rejection rule merely to hide its value from source.

## 3. Move production automation off the public repository

GitHub recommends avoiding self-hosted runners on public repositories. Remove
this repository's access to the production runner before publication. A private
operations repository can own runner registration, host readiness evidence,
operator runbooks, and deployment credentials. Public CI must use
GitHub-hosted runners with read-only default tokens.

The source CI no longer defines production deploy or runner-smoke jobs. Private
operations polls exact source main after successful source CI and secret scan;
it repeats provenance checks before using the fixed wrapper. App code is not
copied and each release does not need an operations commit. Follow
`private-operations-delivery.md` for the live cutover gate.

Workflow removal alone does not detach a registered runner. Complete runner
smoke, actual deployment and source runner detachment before publication.
While source is private, operations needs a narrowly scoped source read token;
its own repository token does not automatically read private source.

## 4. Rehearse and replace Git history

Use git-filter-repo >= 2.47 in a disposable mirror with an explicitly reviewed
private replacement specification. Include file contents and commit messages,
and consider all branch/tag/PR refs. Generate a commit map and changed-ref
report. Re-scan all reachable objects and review the latest-tree diff; database
migrations must retain their exact bytes/checksums.

A local rehearsal on 2026-10-09 changed 1,078 of 1,084 commits and affected 121
pull refs. Its latest tree touched 49 files and preserved Prisma migrations.
That rehearsal is a scope estimate, not an approved or deployable release: it
predates the required authentication configuration and private-runner cutover.
Regenerate it from frozen remote refs after those changes are ready.

The production wrapper checks the recorded deployed SHA for ancestry before
accepting a later deployment. History replacement changes those SHAs. Before
resuming deployment, independently match the installed release to the reviewed
old/new commit map and verify source/artifact equivalence. Rebind deployment
state through a reviewed host procedure; do not disable the ancestry check or
write a guessed SHA. Reconcile image tags, monitoring releases, other clones,
worktrees, open PRs, and any signed metadata that refers to old commits.

Only after the local result is reviewed should the frozen remote branches/tags
be replaced. Guard against concurrent pushes with explicit ref leases. GitHub
pull refs cannot be force-updated by a normal push. GitHub's sensitive-data
removal process describes cached views and PR references; Support assistance
is subject to its eligibility criteria and is not guaranteed. Rotation remains
necessary even when history is rewritten.

## 5. Clean metadata and complete publication gates

- Review and redact eligible issue/PR bodies, comments, and retained logs; keep
  a private recovery copy and avoid deleting unrelated discussion.
- Resolve old pull refs/cached sensitive content, forks, and external copies as
  required by the confirmed risk. Do not claim a force-push erases them.
- Review third-party source, screenshots, fonts, and icon licenses. MIT covers
  this project's licensed work, not separately licensed third-party material.
- Configure main protection, required review/checks, private vulnerability
  reporting, secret scanning, and push protection where the account supports
  them. A private-repository plan restriction is not proof of the settings that
  will be available after publication.
- Verify that public CI requires no production secrets, can process fork PRs
  safely, and has no self-hosted runner access.
- Verify the deployed service independently after the history/automation
  transition, then make the final repository-visibility change explicitly.

## Sources

- `LICENSE`, `SECURITY.md`, `.gitleaksignore`, `scripts/security/scan-secrets.sh`
- `.github/workflows/{ci-cd,secret-scan}.yml`
- `lib/auth/{launch-accounts,signup-policy}.ts`, `prisma/seed.ts`
- `lib/security/production-seed-guard.ts`, `scripts/deploy/munjib-deploy.sh`
- [GitHub: Secure use](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- Issue #234
