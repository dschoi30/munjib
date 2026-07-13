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

## Dependency gate

This branch does not perform a snapshot, restore, destructive purge, key
rotation, or production operation. The following evidence is still required
before the corresponding phase can be implemented or accepted:

| Phase | Required evidence | Current status |
| --- | --- | --- |
| A | Leaf 13 delivery broker is installed and attested on the target host | blocked pending broker substrate work (#185) |
| B | Leaf 13B exact-digest runtime is deployed and the Leaf 2 journal contract is live | blocked pending runtime gate (#184) and Leaf 2 |
| B | Leaf 9 purge hooks and Leaf 11 attachment lifecycle are deployed | blocked pending their dependency leaves |

Issue #168 remains open. A green contract test is not evidence that a backup
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
