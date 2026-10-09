# Encrypted Backup and Restore Readiness

Status: dependency-safe preparation for Issue #168. This document is a public
contract and review aid; it is not an operational acceptance record.

## Scope

The checked-in contract at
`deploy/backup/recovery-readiness-v1.json` fixes the recovery objectives and the
ordering boundaries that later capture/restore work must satisfy:

- RPO is 86,400 seconds and RTO is 14,400 seconds.
- Retention is seven daily, four weekly, and three monthly recovery points.
- Phase A is a manually invoked, isolated recovery gate.
- Phase B is a candidate-only recovery gate that reuses the exact Phase-A
  envelope before any journal or purge mutation.
  The public contract encodes that Phase B requires Phase-A acceptance and
  reuse of the Phase-A envelope.
- The snapshot image is evidence only; restore selects an independently attested
  recovery image.
- Ciphertext is authenticated and decrypted before any signature or catalog
  publication.
- Restore never targets production and no production private decryption key is
  stored on the production host.

The parser in `lib/backup/recovery-contract.ts` is deliberately side-effect free.
It accepts only the exact public contract, rejects unknown or sensitive fields,
and returns an immutable value. It does not read a database, fetch an object,
start a container, or report that a recovery is accepted.

## Snapshot manifest v2 contract slice

`lib/backup/manifest.ts` now provides a second, dependency-safe boundary for the
private `SnapshotManifestV2` and public `SnapshotEnvelopeV2` records. It performs
recursive exact-key validation, canonical lowercase SHA-256/digest/decimal/UTC
checks, bounded IDs and safe relative paths, deterministic migration and
attachment ordering, and the attachment state rules that keep non-`READY` rows
inventory-only. `assertManifestPayloadIntegrity` compares database/archive/file
receipts without opening a database or storage path. `assertRecoveryCompatibility`
requires independently supplied capability-floor and full recovery-pointer /
contract verifiers (including image, release-evidence, and artifact-set fields);
manifest-owned migration/schema digests are never treated as their own
attestation. Snapshot runtime source commits are full, non-zero 40-character
Git object IDs rather than abbreviated or null-looking revisions.

The public envelope parser accepts no signing path until a root ciphertext seal,
immutable exact-read receipt, and authenticated decrypt verification receipt all
match the envelope. The `snapshotImageDigest` field is audit evidence only; the
parser exposes no executable restore-image selector. The parser and helpers never
perform backup, restore, key rotation, purge, provider access, or host mutation.

The v2 builder, capture coordinator, decryptor, restore loader, and production
acceptance evidence remain intentionally out of scope until their Leaf 13/13B,
Leaf 2, Leaf 9, and Leaf 11 dependency gates are independently deployed.

## Dependency gate

This branch does not perform a snapshot, restore, destructive purge, key
rotation, or production operation. The following evidence is still required
before the corresponding phase can be implemented or accepted:

| Phase | Required evidence | Current status |
| --- | --- | --- |
| A | Leaf 13 delivery broker is installed and attested on the target host | deferred; #185 closed as not planned, acceptance still required if resumed |
| B | Leaf 13B exact-digest runtime is deployed and the Leaf 2 journal contract is live | deferred; #184 closed as not planned, runtime/Leaf 2 acceptance still required if resumed |
| B | Leaf 9 purge hooks and Leaf 11 attachment lifecycle are deployed | deferred; dependency acceptance still required if resumed |

Issue #168 is closed as `not_planned` for the current MVP; its remaining scope
is deferred, not completed. Reopen/re-scope before adopting this future work.
A green contract test is not evidence that a backup
exists, that a restore succeeded, or that production is recoverable.

## Evidence boundary

Public commits and issue comments may contain only contract versions, stable
check names, test results, and dependency references. They must not contain
credentials, private keys, object identifiers, database URLs, host details,
row values, attachment paths, or backup identifiers. Restricted plans and
production evidence remain local-only.

## Verification

Run the contract tests from the isolated worktree:

```bash
pnpm exec vitest run tests/backup/recovery-contract.test.ts tests/backup/recovery-runbook.test.ts --reporter=dot
```

The later implementation must add independent capture, decrypt, restore, and
teardown evidence before changing this status from preparation.
