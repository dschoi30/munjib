# Private operations delivery transition

Commit and push application changes only in this repository. A separate private
operations repository stores deployment workflow and operator procedures; it
does not mirror application source or require a commit for each release.

## Admission policy

Private operations polls current source `main` every five minutes, offset from
the hour. GitHub may delay scheduled runs. It admits only the exact current
40-character SHA whose newest push runs of `ci-cd.yml` and `secret-scan.yml`
succeeded, with matching source repository, branch, workflow and event.
The private runner repeats admission, skips an already deployed SHA, and invokes
the fixed root-owned host wrapper. Manual delivery uses the same policy and
cannot supply an arbitrary SHA. No token for writing or dispatching private
operations is kept in the application repository.

The wrapper retains source-main and previous-deployed-SHA ancestry, host flock,
native build, preflight, migration/index, service replacement, local/public
health and atomic deployed-SHA state. Application and operations SHAs differ.

## Live cutover gate

Keep source private and private delivery disabled until the following checks:

1. Register a runner with the private operations repository only. Its dedicated
   account has no Docker group and may sudo only the installed fixed wrapper.
2. Verify private runner smoke and source read access. While source is private,
   use a source-only fine-grained PAT with Contents read and Actions read.
3. Confirm no old deploy is active; stop the source-scoped runner before merging
   this source workflow removal. Do not interrupt a migration.
4. After merge, require successful source main CI and secret scan. Enable private
   delivery and verify a real deploy independently: exact source SHA, host
   `current-sha`, checkout, container image and public health must agree.
5. Remove old source runner registration. Verify zero runner access from the
   application repository before publication; job removal alone is insufficient.

Keep the old runner configuration available for recovery until private delivery
succeeds. Do not enable both delivery paths. Disabling private delivery stops
new polls; an active migration requires separate operator inspection.

Keep the scoped source-read credential after source publication; the private
operations repository token is not a replacement for cross-repository access.
Renew the PAT before expiry, or replace it with an independently verified
source-read GitHub App installation token before revocation. History replacement
requires another delivery freeze and independent old/new commit-map reconciliation;
never disable ancestry checks or guess a replacement deployment SHA.

## Evidence and limits

Issue #234 tracks this transition. Source CI now defines only GitHub-hosted
validation, with its existing contract assertions updated accordingly. Private
operations owns its separate admission, delivery and smoke workflows. This
source change alone does not attest host cutover or public-release readiness.
Legacy bootstrap evidence remains in `private-oci-self-hosted-runner.md`.

- [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use)
