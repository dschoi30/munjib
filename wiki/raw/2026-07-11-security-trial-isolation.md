# Trial Isolation and Durable Security Journal Implementation Plan

**Tracking:** Issue #156 · remote branch `issue-156-security-trial-isolation`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Durably disable only the Trial identity, remove implicit launch privilege, establish an append-only DB-owned deny journal before cleanup, and provide resolver-enforced time-bounded support access without weakening administrator authentication.

**Architecture:** Leaf 2 runs only after deployed Leaf 1 and Leaf 13B's immutable-delivery/recovery capability. PostgreSQL owns a BIGINT hash-chain journal and DB-time support authorization; the application can append only through a fixed-search-path `SECURITY DEFINER` function and cannot mutate journal tables. Trial disable, membership cleanup, support revoke/expiry, session-version bumps, and journal append share their business transaction, while encrypted KMS-signed exports and a pinned-trust two-phase recovery replay drill protect rollback.

**Tech Stack:** Next.js 15, NextAuth v4, Prisma 6/PostgreSQL with a root-provisioned pgcrypto extension, TypeScript, Node crypto, Vitest, Docker Compose, GitHub Actions, age encryption, cosign KMS signatures

## Global Constraints

- Dependency order is deployed Leaf 1 → deployed Leaf 13B capability → Leaf 2. No Leaf 2 production migration, disable, support grant, or cleanup runs before both proofs pass.
- Leaf 2 owns `User.authDisabledAt` and `User.sessionVersion BigInt`; administrator authentication remains enabled and only the immutable Trial user ID is durably disabled.
- Email strings never grant or identify privilege. Destructive operations consume reviewed immutable user, membership, workspace, grant, and operation IDs.
- The security journal exists before the first access-reducing mutation. Cleanup, Trial disable, support revoke/expiry, and later leaf deny events append in the same database transaction.
- Every canonical kind is deny-only. Creation, grant, renewal as issuance, link, unarchive, restore, or any other access increase never appends a journal row; invitation renewal appends only INVITATION_CREDENTIAL_INVALIDATED for the superseded credential.
- Journal sequence, timestamp, previous hash, and event hash are DB-owned. Application time cannot author journal ordering or occurrence time.
- The application role has function EXECUTE only; direct INSERT/UPDATE/DELETE/TRUNCATE on journal state/events is forbidden. Event update/delete/truncate triggers always reject.
- Prisma migrations never create, update, relocate, or own extensions. A root-only, idempotent pre-step provisions the repository-allowed pgcrypto version in the locked `munjib_extensions` schema; PUBLIC and Web have no schema CREATE or direct function EXECUTE, and journal SQL schema-qualifies the exact digest function.
- Journal payloads are not free-form metadata. Every kind accepts only `{stateCode: kind, stateVersion: 1}`; immutable target identity belongs in `subjectId`, and passwords, hashes, tokens, cookies, emails, names, reasons, paths, content, provider payloads, and raw request data are forbidden.
- Journal rows, chain state, support grants, and support events are retained indefinitely. Export retention is off-host and encrypted; no cleanup command deletes them.
- Leaf 2 owns a separate DB checkpoint/pending-bundle singleton and fixed-search-path SECURITY DEFINER begin/reset-after-proven-absence/advance procedures for journal export. The checkpoint may advance, but event/chain rows never receive exported flags or mutations; Leaf 14 reuses this exact interface without adding or replacing storage.
- The chain itself starts from a one-time DB-owned genesis context hash bound to the verified Phase A recovery envelope SHA-256; exporter metadata alone is never the anchor. Every encrypted off-host bundle carries and verifies that DB anchor before KMS signing.
- Phase A/B recovery verification accepts only repository-pinned/KMS trust anchors. Operator-supplied public keys are forbidden.
- Operator evidence uses `O_NOFOLLOW` open → `fstat` → bounded same-FD read, exact deployment environment/source digest/time/nonce, and a one-use envelope.
- PRE `current.json` and the combined journal capability-pair `current.json` are atomically replaced regular files, never symlinks. Export receives one systemd credential containing the bound PRE/JOURNAL_READY pair, not independently replaceable files.
- Leaf 2 owns capability `security-journal-auth-tombstones`. It covers the journal chain/export, auth tombstones/scrub, Trial quarantine, support-access boundary, PRE/JOURNAL_READY pair, exact migrations, and only the Leaf 1-reserved `lib/auth/downstream/leaf2.ts` auth extension seam plus its Leaf 2 helper. Leaf 2 never modifies or republishes Leaf 1 auth config, downstream contract, password, adapter, candidate-context, or session-image core. Leaf 13B binds it to the exact candidate; later leaves consume but cannot republish it.
- No privileged process executes an installer, helper, migration wrapper, Compose file, or systemd unit from the mutable checkout. Every root journal artifact is installed from the exact attested `security-journal-v1` host-bundle OCI artifact through the preinstalled standard dispatcher, and root operations serialize on `/run/lock/munjib-security-state.lock`.
- Migrator, prerequisite, finalizer, initializer, emitter, verifier, and restore-candidate connections discard caller `PGOPTIONS`/service options and use fixed `PGOPTIONS=-c search_path=pg_catalog,public`; only an explicit allowlisted extension schema may follow `public`. Every actual connection requires `current_schemas(true)[1] = 'pg_catalog'` before work.
- Root support grants only `VIEWER|EDITOR`; `ADMIN|OWNER` are forbidden in service and DB trigger.
- Every authorization path uses the canonical two-argument DB statement-time active-membership resolver. The SQL signature is exactly `(workspace_id, user_id)`: there is no third timestamp argument, timestamp overload, test-only time argument, or caller-selected clock. Support expiry compares with `statement_timestamp()` inside the function so a transaction that waited on a lock cannot reuse its transaction-start timestamp. Raw `WorkspaceMember` authorization queries are a source-contract failure.
- Leaf 2 defines the branded isolated-restore replay context/reducer interface and permanently owns exact idempotent deny-only reducers for `AUTH_USER_DISABLED`, `AUTH_CREDENTIAL_INVALIDATED`, `AUTH_USER_SESSIONS_REVOKED`, `TRIAL_IDENTITY_QUARANTINED`, both support events, and organization/workspace membership revocation. Every kind emitted by Leaf 2 is replayable before cleanup can complete. Reducers never append to or mutate the production journal; later leaves export only disjoint maps under the same interface for Leaf 14 composition and must call, not redefine, Leaf 2-owned credential/all-session reducers.
- Standard membership mutation rejects support-linked rows. A support row cannot silently become ordinary membership.
- Support grant role must equal linked membership role. DB trigger rejects mismatched workspace/user/role, inactive grant, and manager role.
- Grant deletion is forbidden; the FK still uses membership cascade as defense if a privileged recovery operation ever removes a grant.
- Support sweep and session-version bump are defense in depth. Query-time DB authorization is the expiry authority.
- Trial/history preservation keeps User, Account identity, authored documents/comments/audits/AI history, while credential material and active authorization are disabled.
- Every task writes an actual wiki/log delta, runs install-hooks/sync-plan/manifest/lint/sync-check, and commits.
- Secret scans use quiet `rg -q` conditionals and never print matching material.

---

## Shared Security Journal Interface

```ts
export type SecurityJournalEventKind =
  | "AUTH_USER_DISABLED"
  | "AUTH_CREDENTIAL_INVALIDATED"
  | "AUTH_OAUTH_ACCOUNT_REVOKED"
  | "AUTH_SESSION_REVOKED"
  | "AUTH_USER_SESSIONS_REVOKED"
  | "TRIAL_IDENTITY_QUARANTINED"
  | "SUPPORT_ACCESS_REVOKED"
  | "SUPPORT_ACCESS_EXPIRED"
  | "ORGANIZATION_MEMBERSHIP_REVOKED"
  | "WORKSPACE_MEMBERSHIP_REVOKED"
  | "WORKSPACE_ARCHIVED"
  | "FOLDER_ARCHIVED"
  | "DOCUMENT_ARCHIVED"
  | "DOCUMENT_PURGED"
  | "DOCUMENT_PERMISSION_REDUCED"
  | "INVITATION_CREDENTIAL_INVALIDATED"
  | "INVITATION_CONSUMED"
  | "INVITATION_REVOKED"
  | "INVITATION_EXPIRED"
  | "AI_SOURCE_ACCESS_REVOKED"
  | "AI_HISTORY_REDACTED"
  | "AI_DERIVED_DATA_PURGED"
  | "AI_EXTERNAL_PROVIDER_DISABLED"
  | "ATTACHMENT_QUARANTINED"
  | "ATTACHMENT_DELETE_REQUESTED"
  | "ATTACHMENT_DELETED";

export type SecurityJournalPayload<
  K extends SecurityJournalEventKind,
> = Readonly<{
  stateCode: K;
  stateVersion: 1;
}>;

export type SecurityJournalSubjectTypeByKind = {
  AUTH_USER_DISABLED: "USER";
  AUTH_CREDENTIAL_INVALIDATED: "USER";
  AUTH_OAUTH_ACCOUNT_REVOKED: "OAUTH_ACCOUNT";
  AUTH_SESSION_REVOKED: "AUTH_SESSION";
  AUTH_USER_SESSIONS_REVOKED: "USER";
  TRIAL_IDENTITY_QUARANTINED: "USER";
  SUPPORT_ACCESS_REVOKED: "SUPPORT_GRANT";
  SUPPORT_ACCESS_EXPIRED: "SUPPORT_GRANT";
  ORGANIZATION_MEMBERSHIP_REVOKED: "ORGANIZATION_MEMBERSHIP";
  WORKSPACE_MEMBERSHIP_REVOKED: "WORKSPACE_MEMBERSHIP";
  WORKSPACE_ARCHIVED: "WORKSPACE";
  FOLDER_ARCHIVED: "FOLDER";
  DOCUMENT_ARCHIVED: "DOCUMENT";
  DOCUMENT_PURGED: "DOCUMENT";
  DOCUMENT_PERMISSION_REDUCED: "DOCUMENT_PERMISSION";
  INVITATION_CREDENTIAL_INVALIDATED: "INVITATION";
  INVITATION_CONSUMED: "INVITATION";
  INVITATION_REVOKED: "INVITATION";
  INVITATION_EXPIRED: "INVITATION";
  AI_SOURCE_ACCESS_REVOKED: "AI_SOURCE_ACCESS";
  AI_HISTORY_REDACTED: "AI_CHAT_TURN" | "AI_CHAT_MEMORY";
  AI_DERIVED_DATA_PURGED: "AI_DERIVED_DATA";
  AI_EXTERNAL_PROVIDER_DISABLED: "WORKSPACE";
  ATTACHMENT_QUARANTINED: "ATTACHMENT";
  ATTACHMENT_DELETE_REQUESTED: "ATTACHMENT";
  ATTACHMENT_DELETED: "ATTACHMENT";
};

export type SecurityJournalEventInput = {
  [K in SecurityJournalEventKind]: Readonly<{
    kind: K;
    subjectType: SecurityJournalSubjectTypeByKind[K];
    subjectId: string;
    operationId: string;
    payload: SecurityJournalPayload<K>;
  }>;
}[SecurityJournalEventKind];

export type SecurityJournalOperationTarget = {
  [K in SecurityJournalEventKind]: Readonly<{
    rootOperationId: string;
    kind: K;
    subjectType: SecurityJournalSubjectTypeByKind[K];
    subjectId: string;
  }>;
}[SecurityJournalEventKind];

export function deriveSecurityJournalOperationId(
  input: SecurityJournalOperationTarget,
): string;

export async function appendSecurityJournalEvent(
  tx: Prisma.TransactionClient,
  input: SecurityJournalEventInput,
): Promise<{ sequence: bigint; eventHash: string }>;

export type SecurityJournalEvent = {
  [K in SecurityJournalEventKind]: Readonly<{
    schemaVersion: 1;
    sequence: string;
    occurredAt: string;
    previousHash: string;
    eventHash: string;
    kind: K;
    subjectType: SecurityJournalSubjectTypeByKind[K];
    subjectId: string;
    operationId: string;
    payload: SecurityJournalPayload<K>;
  }>;
}[SecurityJournalEventKind];

export function parseSecurityJournalEvent(value: unknown): SecurityJournalEvent;
export function encodeSecurityJournalHashPreimage(
  event: SecurityJournalEvent,
): Uint8Array;
export function recomputeSecurityJournalEventHash(
  event: SecurityJournalEvent,
): string;

declare const verifiedJournalReplayContext: unique symbol;
export type VerifiedJournalReplayContext = Readonly<{
  mode: "isolated-restore";
  sourceEnvelopeSha256: string;
  highWaterSequence: string;
  [verifiedJournalReplayContext]: true;
}>;
export type SecurityJournalReplayReducer<K extends SecurityJournalEventKind> = (
  tx: Prisma.TransactionClient,
  event: Extract<SecurityJournalEvent, { kind: K }>,
  context: VerifiedJournalReplayContext,
) => Promise<void>;
```

Every caller uses the same literal twice, for example:

```ts
await appendSecurityJournalEvent(tx, {
  kind: "DOCUMENT_PURGED",
  subjectType: "DOCUMENT",
  subjectId: documentId,
  operationId,
  payload: { stateCode: "DOCUMENT_PURGED", stateVersion: 1 },
});
```

`subjectId` is always the immutable row/key whose denial must be replayed, not merely its parent. For example, `DOCUMENT_PERMISSION_REDUCED` uses `subjectType:"DOCUMENT_PERMISSION"` and the prior Permission row/key; `AI_HISTORY_REDACTED` uses the immutable chat-turn or memory ID. `deriveSecurityJournalOperationId` uses a repository-pinned UUIDv5 namespace and the length-delimited tuple root operation UUID, kind, subjectType, and subjectId. Every event in a multi-event or batch transaction therefore has a distinct deterministic UUID while a retry derives the same UUID. No caller puts a secondary ID, actor, role, reason, email, path, filename, content, token, provider response, or diagnostic field in `payload`. A later schema revision requires a new reviewed `stateVersion` and matching TypeScript, SQL, replay, and cross-leaf contract changes; it cannot begin accepting extra keys opportunistically.

All external/export/replay consumers import exactly `SecurityJournalEvent`, `SecurityJournalPayload`, `parseSecurityJournalEvent`, `encodeSecurityJournalHashPreimage`, and `recomputeSecurityJournalEventHash` from `@/lib/security/journal`. The JSON-safe event has exactly the keys above: sequence is canonical unsigned decimal `1..9223372036854775807` with no leading zero, occurredAt is exactly UTC `YYYY-MM-DDTHH:mm:ss.ffffffZ`, operationId is lowercase canonical UUID, and hashes are lowercase 64-hex. The parser reuses the same closed kind/subject/payload/subject-ID constraints, rejects unknown/missing keys and noncanonical encodings, and never converts sequence through `number`.

It calls only:

```sql
public.security_journal_append(
  event_kind text,
  subject_type text,
  subject_id text,
  operation_id uuid,
  payload_json jsonb
)
```

## File Structure

- `lib/security/leaf-dependencies.ts`: deployed Leaf 1/13 proof.
- Journal migration, `lib/security/journal.ts`, role/preflight tests, and an image-baked
  journal-capability contract plus external emitter/verifier: DB append-only chain and
  KMS-signed `JOURNAL_READY` handoff.
- `lib/security/operator-files.ts`, Wave verifier/exporter/replay scripts: pinned evidence and continuous off-host journal.
- `deploy/host-helpers/manifest-v1.json` and the literal `security-journal-v1` bundle: the only root installation path for journal wrappers and fixed root units.
- `deploy/security/capabilities/security-journal-auth-tombstones.json`, `deploy/security/protected-artifact-owners.json`, and `tests/security/security-journal-auth-tombstones-capability.test.ts`: leaf-owned fragment, reserved-slot `0 -> 1` transition, and protected-artifact/evidence contract.
- `lib/auth/durable-auth-state.ts`, `lib/auth/downstream/leaf2.ts`, reserved identity, Trial disable, and auth tests: durable disable without administrator impact while Leaf 1 auth core remains byte-identical.
- Owner-only provisioning: no launch backfill.
- Support schema, DB resolver/trigger, service, commands, resolver refactor: DB-time support capability.
- Cleanup/report/command: immutable-ID dry-run/apply with same-transaction journal.
- History/replay/browser/wiki/rollout tasks: preservation and operational closure.

### Task 1: Gate Leaf 2 on deployed Leaf 1 and Leaf 13 capability

**Files:**
- Create: `lib/security/leaf-dependencies.ts`
- Create: `tests/security/leaf-dependencies.test.ts`
- Modify: `.github/workflows/ci-cd.yml`
- Modify: `tests/github-actions/ci-cd.test.ts`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: exact deployed Leaf 1 digest and Leaf 13 capability envelope verified by pinned trust, including its database-role capability SHA and app/migrator/schema-owner/backup role OIDs.
- Produces: branded `VerifiedLeaf2Dependencies` required by every Leaf 2 migration/apply command.

- [ ] **Step 1: Write failing dependency tests**

```ts
// tests/security/leaf-dependencies.test.ts
import { describe, expect, it } from "vitest";
import { verifyLeaf2Dependencies } from "@/lib/security/leaf-dependencies";

describe("Leaf 2 dependencies", () => {
  it("requires exact deployed Leaf 1 and Leaf 13 digests", () => {
    expect(() =>
      verifyLeaf2Dependencies({
        expectedEnvironment: "production",
        expectedSourceDigest: "sha256:" + "a".repeat(64),
        leaf1: {
          environment: "production",
          sourceDigest: "sha256:" + "b".repeat(64),
          closedPasswordSignup: true,
          closedUnlinkedOauth: true,
        },
        leaf13: {
          environment: "production",
          sourceDigest: "sha256:" + "a".repeat(64),
          immutableDelivery: true,
          rollbackDrillPassed: true,
          databaseRoleSeparation: true,
          databaseRoleCapabilitySha256: "c".repeat(64),
        },
      }),
    ).toThrow("LEAF1_SOURCE_DIGEST_MISMATCH");
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/security/leaf-dependencies.test.ts tests/github-actions/ci-cd.test.ts`

Expected: FAIL because the branded dependency verifier and workflow gate do not exist.

- [ ] **Step 3: Implement exact dependency verification**

```ts
// lib/security/leaf-dependencies.ts
declare const verifiedLeaf2Dependencies: unique symbol;
export type VerifiedLeaf2Dependencies = {
  environment: "production";
  sourceDigest: string;
  databaseRoleCapabilitySha256: string;
  [verifiedLeaf2Dependencies]: true;
};

export function verifyLeaf2Dependencies(input: {
  expectedEnvironment: "production";
  expectedSourceDigest: string;
  leaf1: {
    environment: string;
    sourceDigest: string;
    closedPasswordSignup: boolean;
    closedUnlinkedOauth: boolean;
  };
  leaf13: {
    environment: string;
    sourceDigest: string;
    immutableDelivery: boolean;
    rollbackDrillPassed: boolean;
    databaseRoleSeparation: boolean;
    databaseRoleCapabilitySha256: string;
  };
}): VerifiedLeaf2Dependencies {
  if (input.leaf1.environment !== input.expectedEnvironment) {
    throw new Error("LEAF1_ENVIRONMENT_MISMATCH");
  }
  if (input.leaf1.sourceDigest !== input.expectedSourceDigest) {
    throw new Error("LEAF1_SOURCE_DIGEST_MISMATCH");
  }
  if (!input.leaf1.closedPasswordSignup || !input.leaf1.closedUnlinkedOauth) {
    throw new Error("LEAF1_CLOSED_SIGNUP_REQUIRED");
  }
  if (
    input.leaf13.environment !== input.expectedEnvironment ||
    input.leaf13.sourceDigest !== input.expectedSourceDigest
  ) {
    throw new Error("LEAF13_SOURCE_IDENTITY_MISMATCH");
  }
  if (
    !input.leaf13.immutableDelivery ||
    !input.leaf13.rollbackDrillPassed ||
    !input.leaf13.databaseRoleSeparation ||
    !/^[a-f0-9]{64}$/.test(input.leaf13.databaseRoleCapabilitySha256)
  ) {
    throw new Error("LEAF13_CAPABILITY_REQUIRED");
  }
  return {
    environment: "production",
    sourceDigest: input.expectedSourceDigest,
    databaseRoleCapabilitySha256: input.leaf13.databaseRoleCapabilitySha256,
    [verifiedLeaf2Dependencies]: true,
  };
}
```

- [ ] **Step 4: Gate workflow migration**

The workflow order is Leaf 1 proof → Leaf 13 proof → Leaf 2 preflight → Prisma migration. Tests compare command indices and fail if migration appears first.

- [ ] **Step 5: Run GREEN, update wiki, and commit**

Add the exact dependency order to the CI/CD wiki and one evidence line to `wiki/log.md`.

```bash
pnpm exec vitest run tests/security/leaf-dependencies.test.ts tests/github-actions/ci-cd.test.ts
git add lib/security/leaf-dependencies.ts tests/security/leaf-dependencies.test.ts .github/workflows/ci-cd.yml tests/github-actions/ci-cd.test.ts wiki/CI\ CD\ And\ Monitoring\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(security): gate Trial isolation dependencies"
```

Expected: tests/wiki gates PASS and one commit.

### Task 2: Create the DB-owned append-only journal and separated roles

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260712000000_security_journal_and_auth_tombstones/migration.sql`
- Create: `lib/security/journal.ts`
- Create: `deploy/postgres/security-journal-prereqs.sql`
- Create: `deploy/postgres/security-journal-acl.sql`
- Create: `scripts/security/finalize-journal-roles.ts`
- Create: `scripts/security/initialize-security-journal.ts`
- Create: `scripts/security/journal-preflight.ts`
- Create: `deploy/security/security-journal-capability-contract-v1.json`
- Create: `lib/security/journal-capability.ts`
- Create: `scripts/security/emit-security-journal-capability.ts`
- Create: `scripts/security/verify-security-journal-capability.ts`
- Modify: `deploy/host-helpers/manifest-v1.json`
- Create: `deploy/host-helpers/security-journal/*`
- Create: `tests/fixtures/security-journal-hash-vectors.json`
- Create: `tests/security/journal-schema.test.ts`
- Create: `tests/security/journal.test.ts`
- Create: `tests/security/journal-payload-contract.test.ts`
- Create: `tests/security/journal-external-event.test.ts`
- Create: `tests/security/journal-hash-vectors.test.ts`
- Create: `tests/security/journal-genesis.test.ts`
- Create: `tests/security/journal-roles.test.ts`
- Create: `tests/security/journal-extension-prereqs.test.ts`
- Create: `tests/security/journal-export-checkpoint.test.ts`
- Create: `tests/security/security-journal-capability.test.ts`
- Create: `tests/security/security-journal-bundle.test.ts`
- Modify: `tests/deploy/attested-helper-bootstrap.test.ts`
- Modify: `package.json`
- Modify: `wiki/Document Knowledge Model.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: Leaf 13 `VerifiedDatabaseRoleCapability { phase: "PRE_JOURNAL" }`, `Prisma.TransactionClient`, verified Phase A recovery envelope SHA-256 for one-time genesis, and the shared event interface above.
- Produces: envelope-anchored BIGINT chain state/events, external parser/encoder/hash helpers, `appendSecurityJournalEvent`, root-only genesis initialization, role/preflight enforcement, an image-baked public journal-capability contract, and the emitter/verifier that produces `VerifiedSecurityJournalCapability { phase: "JOURNAL_READY" }` for Leaf 14 after Task 3 production initialization.

- [ ] **Step 1: Write failing schema, append, immutability, and role tests**

Tests assert:

- singleton chain state starts uninitialized at sequence 0 with null envelope/genesis/last hashes; append-before-initialize fails
- root/admin initializes once from one verified lowercase 64-hex Wave envelope digest; same or different second initialization fails and no reset/update function exists
- the preinstalled attested helper-bundle verifier extracts only the literal
  `security-journal-v1` manifest members from the verified candidate; prerequisite,
  migration, finalize, capability emitter/verifier wrappers, fixed units, hashes, owners,
  modes, and command grammars pass while checkout/path/env/extra-argument substitution fails
- genesisContextHash equals SHA-256 over the fixed genesis-v1 domain bytes plus raw envelope hash, and lastEventHash starts at that anchored value
- first append sequence `1`, second `2`, and previous hash continuity
- same operation UUID is idempotent, including two concurrent callers that both miss an optional unlocked hint lookup
- reusing an operation UUID with different kind, subject, or payload raises `SECURITY_JOURNAL_OPERATION_CONFLICT`
- every listed kind accepts exactly `{stateCode: sameKind, stateVersion: 1}`
- null, array, scalar, missing key, extra key, unknown kind, mismatched stateCode, non-number/wrong stateVersion, stateCode over 64 bytes, and payload over 96 UTF-8 bytes fail before sequence allocation
- sensitive keys matching password, hash, secret, token, cookie, authorization, email, name, reason, path, URL, query, content, body, provider, address/IP, or raw fail even when nested
- every canonical kind accepts only its mapped subject type; every cross-kind mismatch fails, while AI_HISTORY_REDACTED alone accepts both AI_CHAT_TURN and AI_CHAT_MEMORY
- subjectId is 1–191 UTF-8 bytes with no control characters and tests identify the immutable replay target; DOCUMENT_PERMISSION_REDUCED uses the prior Permission row/key rather than a document ID
- TypeScript rejects a mismatched subjectType/stateCode, version other than numeric literal 1, or any additional payload property
- UUIDv5 derivation is stable for retry and distinct when kind, subjectType, or subjectId changes under one root operation UUID
- JSON event round-trips through parseSecurityJournalEvent with sequence 9007199254740993 unchanged, exact key rejection, canonical lowercase hashes/UUID, exact UTC microseconds, and no BigInt/Date in the external object
- TypeScript and PostgreSQL binary preimage/hash match checked-in known vectors containing Unicode, quotes, backslashes, boundary-length IDs, and sequence above Number.MAX_SAFE_INTEGER
- changing any encoded field, payload literal, previous hash, or Wave genesis context changes verification; replay with another envelope/genesis fails
- concurrent append from two Prisma clients yields gapless unique BIGINT sequence; concurrent identical operation IDs return the same sequence/hash, while a concurrent conflicting reuse fails only after the chain lock and authoritative re-read
- Prisma/app migration and every Leaf 2 helper never execute CREATE ROLE; pre-created role/OID identity comes only from the verified Leaf 13 capability
- Prisma/app migration contains no `CREATE EXTENSION`, `ALTER EXTENSION`, extension update, extension schema move, or unqualified pgcrypto call
- root-only `security-journal-prereqs.sql` idempotently creates the locked `munjib_extensions` schema and the repository-allowed pgcrypto version before migration; extension owner is the bootstrap/admin role, never schema owner, migrator, app, exporter, or backup
- PUBLIC and app have neither CREATE on `munjib_extensions` nor direct EXECUTE on pgcrypto functions; only the journal owner receives USAGE plus EXECUTE on the exact qualified digest overload required by the journal
- changing extension owner, namespace, version, function identity/OID, function owner, or ACL makes the root prerequisite/post-journal preflight fail; the earlier PRE_JOURNAL capability remains limited to pre-created role/database identity and cannot attest extension state that did not yet exist
- Web munjib_app current_user is NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOINHERIT, owns no journal/schema object, and INSERT/UPDATE/DELETE/TRUNCATE/ALTER/DROP/disable-trigger/SET ROLE journal owner all fail
- application can execute append function
- application cannot initialize genesis; exporter can SELECT anchored state/events but not initialize or mutate
- exporter can execute only the fixed begin/reset-after-proven-absence/advance checkpoint procedures; checkpoint starts at sequence 0 with the genesis hash after initialization, pending bundle metadata is exact-key/checksum-only, and crash/retry compare-and-swap tests never mutate event/chain rows
- migrator/schema owner creates migration objects, journal ownership transfers to munjib_journal_owner NOLOGIN, PUBLIC/default ACLs remain revoked, and only reviewed EXECUTE/SELECT grants exist
- event and chain timestamps come from DB
- User has `authDisabledAt DateTime?` and `sessionVersion BigInt @default(0)`
- [ ] **Step 2: Run RED**

Run:

```bash
pnpm exec vitest run tests/security/journal-schema.test.ts tests/security/journal.test.ts tests/security/journal-payload-contract.test.ts tests/security/journal-external-event.test.ts tests/security/journal-hash-vectors.test.ts tests/security/journal-genesis.test.ts tests/security/journal-roles.test.ts tests/security/journal-extension-prereqs.test.ts tests/security/journal-export-checkpoint.test.ts tests/security/security-journal-capability.test.ts tests/security/security-journal-bundle.test.ts tests/deploy/attested-helper-bootstrap.test.ts
pnpm exec tsc --noEmit
```

Expected: FAIL because the root extension prerequisite, journal objects, roles, function, and auth tombstones do not exist.

- [ ] **Step 3: Add Prisma auth fields and SQL journal objects**

Add:

```prisma
model User {
  authDisabledAt DateTime?
  sessionVersion BigInt @default(0)
}
```

The migration assumes the verified root prerequisite has already completed and
creates only application-owned schema objects. It contains no extension DDL.
It creates:

```sql
CREATE TABLE public."SecurityJournalChainState" (
  "singletonKey" BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK ("singletonKey"),
  "lastSequence" BIGINT NOT NULL DEFAULT 0 CHECK ("lastSequence" >= 0),
  "verifiedEnvelopeSha256" BYTEA,
  "genesisContextHash" BYTEA,
  "lastEventHash" BYTEA,
  "initializedAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (
      "initializedAt" IS NULL
      AND "verifiedEnvelopeSha256" IS NULL
      AND "genesisContextHash" IS NULL
      AND "lastEventHash" IS NULL
      AND "lastSequence" = 0
    )
    OR (
      "initializedAt" IS NOT NULL
      AND pg_catalog.octet_length("verifiedEnvelopeSha256") = 32
      AND pg_catalog.octet_length("genesisContextHash") = 32
      AND pg_catalog.octet_length("lastEventHash") = 32
    )
  )
);

INSERT INTO public."SecurityJournalChainState"
  ("singletonKey", "lastSequence")
VALUES (TRUE, 0);

CREATE TABLE public."SecurityJournalEvent" (
  "sequence" BIGINT PRIMARY KEY,
  "eventKind" TEXT NOT NULL CHECK ("eventKind" IN (
    'AUTH_USER_DISABLED',
    'AUTH_CREDENTIAL_INVALIDATED',
    'AUTH_OAUTH_ACCOUNT_REVOKED',
    'AUTH_SESSION_REVOKED',
    'AUTH_USER_SESSIONS_REVOKED',
    'TRIAL_IDENTITY_QUARANTINED',
    'SUPPORT_ACCESS_REVOKED',
    'SUPPORT_ACCESS_EXPIRED',
    'ORGANIZATION_MEMBERSHIP_REVOKED',
    'WORKSPACE_MEMBERSHIP_REVOKED',
    'WORKSPACE_ARCHIVED',
    'FOLDER_ARCHIVED',
    'DOCUMENT_ARCHIVED',
    'DOCUMENT_PURGED',
    'DOCUMENT_PERMISSION_REDUCED',
    'INVITATION_CREDENTIAL_INVALIDATED',
    'INVITATION_CONSUMED',
    'INVITATION_REVOKED',
    'INVITATION_EXPIRED',
    'AI_SOURCE_ACCESS_REVOKED',
    'AI_HISTORY_REDACTED',
    'AI_DERIVED_DATA_PURGED',
    'AI_EXTERNAL_PROVIDER_DISABLED',
    'ATTACHMENT_QUARANTINED',
    'ATTACHMENT_DELETE_REQUESTED',
    'ATTACHMENT_DELETED'
  )),
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "operationId" UUID NOT NULL UNIQUE,
  "payloadJson" JSONB NOT NULL,
  "hashVersion" SMALLINT NOT NULL DEFAULT 1 CHECK ("hashVersion" = 1),
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "previousHash" BYTEA NOT NULL CHECK (pg_catalog.octet_length("previousHash") = 32),
  "eventHash" BYTEA NOT NULL CHECK (pg_catalog.octet_length("eventHash") = 32)
);
```

The same migration also creates singleton
`public."SecurityJournalExportCheckpoint"` owned by the journal owner, with
`lastExportedSequence BIGINT`, `lastExportedEntryHash BYTEA`, nullable
`lastBatchDigest BYTEA`, and one nullable all-or-none pending tuple:
`pendingFirstSequence BIGINT`, `pendingLastSequence BIGINT`, `pendingBundleKey TEXT`,
`pendingBundleSha256 BYTEA`, `pendingCiphertextSha256 BYTEA`,
`pendingEnvelopeSha256 BYTEA`. `pendingBundleSha256` covers the one atomic remote
object containing ciphertext, canonical envelope, and detached signature. Constraints require
canonical positive ranges, 32-byte hashes, the deterministic key
`journal/v1/<pendingFirstSequence>.bundle`, `pendingFirst=lastExported+1`, and a fully
null or fully populated pending tuple. Genesis initialization atomically seeds
checkpoint sequence `0` and entry hash to genesisContextHash.

Create fixed-search-path SECURITY DEFINER procedures owned by
`munjib_journal_owner`:

- `begin_security_journal_export_bundle(first,last,key,bundle_sha256,ciphertext_sha256,envelope_sha256)`
  locks the singleton, exact-validates the next contiguous range/key/hashes, persists
  or idempotently returns the identical pending tuple, and rejects conflicts;
- `reset_security_journal_export_pending_after_absence(expected_first,expected_last,key,expected_bundle_sha256,expected_ciphertext_sha256,expected_envelope_sha256,new_bundle_sha256,new_ciphertext_sha256,new_envelope_sha256,absence_proof_sha256)`
  compare-and-swaps only an unchanged pending tuple for the same range/key after the
  caller has exact-key not-found plus healthy-store evidence, records the fixed-format
  signed absence-proof digest, and changes no exported sequence/hash; it cannot run
  after any object checksum has matched or checkpoint has advanced;
- `advance_security_journal_export_checkpoint(expected_first,expected_last,key,bundle_sha256,ciphertext_sha256,envelope_sha256,last_entry_hash,batch_digest)`
  compare-and-swaps the exact pending tuple only after object verification, advances
  sequence/entry/batch hashes, and clears pending atomically.

PUBLIC/app/migrator cannot select or execute these after finalization. Exporter has
event/chain/checkpoint SELECT plus these three procedure EXECUTEs only; backup may read
the checkpoint but cannot begin/advance. Tests cover upload-before-begin,
begin-before-upload, upload-before-advance, host loss, retry, conflict, concurrent
exporters, sequence above `Number.MAX_SAFE_INTEGER`, and exact event/chain immutability.

The Prisma/app migration contains no `CREATE ROLE`, `CREATE EXTENSION`, extension
update/relocation, role password, or superuser operation. Every pgcrypto call is
schema-qualified as `munjib_extensions.digest(...)`. It runs only as Leaf 13
`munjib_migrator` after `SET ROLE munjib_schema_owner`; the root-only role and
extension bootstrap below must already have created the journal owner/exporter
roles and verified extension prerequisite.

- [ ] **Step 4: Provision the root-only extension prerequisite, finalize roles, and define anchored binary hashing**

Create `deploy/postgres/security-journal-prereqs.sql` and invoke it as the
Leaf 13 bootstrap/admin identity after verifying the signed
`VerifiedDatabaseRoleCapability`, but before any Prisma migration. The fixed,
non-parameterized script:

1. requires `current_user` to equal the capability's bootstrap/admin role and
   fails if it has been invoked through app, migrator, owner, backup, or exporter;
2. creates `munjib_extensions` owned by bootstrap/admin when absent, revokes
   `ALL` from PUBLIC, and grants no CREATE to any runtime role;
3. creates pgcrypto with `WITH SCHEMA munjib_extensions` only when absent and
   rejects an existing installation whose owner, namespace, version, or member
   function identities do not match the repository allowlist;
4. revokes PUBLIC EXECUTE on every function in that extension schema, grants no
   direct privilege to `munjib_app`, and grants `munjib_journal_owner` only
   schema USAGE plus EXECUTE on the exact `digest(bytea,text)` overload;
5. returns only the non-secret role OIDs, extension OID/version/schema OID,
   digest function OID/owner and ACL digest to Leaf 2's post-journal preflight. The
   signed Leaf 13 PRE_JOURNAL capability is immutable and is never amended. After
   genesis/final grants, Leaf 2 signs these facts into its separate JOURNAL_READY
   capability; no connection string or role credential enters evidence.

The script is idempotent only for the exact verified state. It never silently
updates, relocates, drops, or repairs a mismatched extension. Such drift blocks
deployment for root investigation. A separate rollback removes no extension;
it revokes the newly granted journal-owner function privilege only when no
journal object has been created.

Leaf 13 pre-creates `munjib_journal_owner NOLOGIN` and `munjib_journal_exporter NOLOGIN`. Leaf 2 never creates or repairs a role. Before migration, `journal-preflight.ts` verifies the signed `VerifiedDatabaseRoleCapability`, exact database/role OIDs and flags, `current_user`, and the existing `munjib_schema_owner`, `munjib_migrator`, `munjib_app`, and `munjib_backup` roles. After migration, root-only `finalize-journal-roles.ts` executes fixed reviewed `security-journal-acl.sql`: it transfers journal tables/functions/triggers to `munjib_journal_owner`, configures SELECT-only exporter/backup access, revokes PUBLIC/default privileges, and withholds app append EXECUTE until genesis initialization succeeds. It accepts no role identifier outside the signed capability and no role password.

`deploy/security/security-journal-capability-contract-v1.json` is deterministic,
public-safe, and image-attested. It fixes the schema/version/phase, prerequisite and
migration hashes, required extension identity/version/schema/function overload,
journal role/ACL policy, checkpoint/procedure names, and canonical fact-digest
algorithm; it contains no live OIDs, cluster identifiers, credentials, timestamps, or
host facts. PRE emission writes a KMS-signed regular
`/var/lib/munjib/security/capabilities/pre-journal/current.json` by O_EXCL temp write,
fsync, live verification, atomic rename, and parent-directory fsync; `current.json` is
never a symlink. After production genesis and final grants, the root pair emitter
live-queries the database and atomically writes one KMS-signed, untracked regular
`munjib-security-journal-capability-pair-v1` to
`/var/lib/munjib/security/capabilities/journal/current.json`. The pair embeds the exact
signed PRE parent and JOURNAL_READY child plus their canonical SHA-256 values. Its body
contains exactly:

- `phase: "JOURNAL_READY"`, environment (`production` or `restore`), source SHA,
  image digest, security-floor generation, and public journal-contract digest;
- SHA-256 of the exact parent PRE_JOURNAL artifact, its cluster/database identity
  hashes and all role/OID/flag/membership facts re-observed live;
- Phase-A envelope SHA-256, DB genesis-context hash, chain/checkpoint sequence/hash,
  extension schema/OID/version plus exact digest-function OID/owner/ACL facts;
- canonical journal table/owner/ACL/default-ACL digest and exact append plus
  begin/reset/advance procedure-definition/owner/ACL digest;
- pair `generation`, `issuedAt`, `expiresAt` no more than 15 minutes later, and a
  256-bit nonce.

`verify-security-journal-capability.ts` safe-reads the file, verifies the pinned KMS
identity, exact source/image/floor/public-contract and parent PRE digest, freshness,
then re-queries the same live cluster and recomputes every fact digest. Only an exact
match returns branded `VerifiedSecurityJournalCapability { phase: "JOURNAL_READY" }`.
Production and every disposable restore emit their own pair; cluster/OID facts are
never copied. Guarded parent directories are root mode `0700`, both `current.json`
regular files are root mode `0400`, nlink 1, and
generated capability files are gitignored and never uploaded as CI artifacts. Leaf 2's
minimal exporter consumes this exact logical pair; Leaf 14 later reuses it for
multi-batch export/restore and both re-verify before each decision.

Neither `current.json` is a direct partial-write target. The root pair emitter reads
and re-verifies the fresh regular PRE, creates one complete pair with `O_EXCL`, fsyncs
and validates it, then atomically renames the regular pair file and fsyncs its parent.
A failure leaves the prior complete pair current. Leaf 2's exporter is a one-shot
systemd service scheduled at most once per minute; exactly one
`LoadCredential=journal_pair:/var/lib/munjib/security/capabilities/journal/current.json`
copies the root-only bundle into its private read-only credential mount. Thus the
exporter UID can read the copy but cannot traverse or alter the guarded source. It
verifies the embedded parent and child
and live DB facts, exports one bounded batch, and exits. The root refresh timer runs
every five minutes before the next exporter start. Effective-UID tests prove guarded
source denial, credential-copy readability, no write, expiry failure, and atomic-pair
consistency.

Define one language-independent event preimage, with no JSON serialization:

1. UTF-8 bytes `munjib-security-journal-event-v1` followed by `0x00`;
2. 32 raw previous-hash bytes;
3. positive sequence as PostgreSQL `int8send`/unsigned big-endian 8 bytes;
4. each of kind, subjectType, subjectId, lowercase UUID, and canonical UTC microsecond occurredAt as unsigned big-endian 4-byte byte-length followed by UTF-8 bytes;
5. payload stateCode with the same length prefix;
6. stateVersion as exactly one byte `0x01`.

SQL uses a fixed `security_journal_lp_utf8(text)` helper and this byte order; TypeScript `encodeSecurityJournalHashPreimage` uses DataView BigUint64/Uint32 with the identical bounds/order. Neither side hashes `jsonb::text`, JSON.stringify output, locale dates, or JavaScript numbers. The checked-in vector file contains the complete field values, preimage hex, and SHA-256 for ordinary, Unicode/quote/backslash, and sequence-9007199254740993 cases.

Create root-only `initialize_security_journal_genesis(verified_envelope_sha256 text)`. It validates lowercase 64-hex, locks the singleton, requires fully uninitialized state, computes:

    SHA256(UTF8("munjib-security-journal-genesis-v1") || 0x00 || envelope_hash_bytes)

and atomically stores verifiedEnvelopeSha256, genesisContextHash, lastEventHash, initializedAt from DB time, and sequence 0. A trigger rejects any later change to envelope/genesis/initializedAt; a second initialization fails even with the same digest. PUBLIC, migrator, app, and exporter cannot EXECUTE it. Task 3 invokes it once as root/admin only after Wave verification, then grants app EXECUTE on append.

- [ ] **Step 5: Create the fixed-search-path append function**

```sql
CREATE OR REPLACE FUNCTION public.security_journal_append(
  p_event_kind TEXT,
  p_subject_type TEXT,
  p_subject_id TEXT,
  p_operation_id UUID,
  p_payload_json JSONB
) RETURNS TABLE(sequence BIGINT, event_hash TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_state public."SecurityJournalChainState"%ROWTYPE;
  v_existing public."SecurityJournalEvent"%ROWTYPE;
  v_sequence BIGINT;
  v_occurred_at TIMESTAMPTZ := CURRENT_TIMESTAMP;
  v_expected_state_code TEXT;
  v_allowed_subject_types TEXT[];
  v_payload_keys TEXT[];
  v_canonical_occurred_at TEXT;
  v_preimage BYTEA;
  v_hash BYTEA;
BEGIN
  CASE p_event_kind
    WHEN 'AUTH_USER_DISABLED' THEN v_expected_state_code := 'AUTH_USER_DISABLED';
    WHEN 'AUTH_CREDENTIAL_INVALIDATED' THEN v_expected_state_code := 'AUTH_CREDENTIAL_INVALIDATED';
    WHEN 'AUTH_OAUTH_ACCOUNT_REVOKED' THEN v_expected_state_code := 'AUTH_OAUTH_ACCOUNT_REVOKED';
    WHEN 'AUTH_SESSION_REVOKED' THEN v_expected_state_code := 'AUTH_SESSION_REVOKED';
    WHEN 'AUTH_USER_SESSIONS_REVOKED' THEN v_expected_state_code := 'AUTH_USER_SESSIONS_REVOKED';
    WHEN 'TRIAL_IDENTITY_QUARANTINED' THEN v_expected_state_code := 'TRIAL_IDENTITY_QUARANTINED';
    WHEN 'SUPPORT_ACCESS_REVOKED' THEN v_expected_state_code := 'SUPPORT_ACCESS_REVOKED';
    WHEN 'SUPPORT_ACCESS_EXPIRED' THEN v_expected_state_code := 'SUPPORT_ACCESS_EXPIRED';
    WHEN 'ORGANIZATION_MEMBERSHIP_REVOKED' THEN v_expected_state_code := 'ORGANIZATION_MEMBERSHIP_REVOKED';
    WHEN 'WORKSPACE_MEMBERSHIP_REVOKED' THEN v_expected_state_code := 'WORKSPACE_MEMBERSHIP_REVOKED';
    WHEN 'WORKSPACE_ARCHIVED' THEN v_expected_state_code := 'WORKSPACE_ARCHIVED';
    WHEN 'FOLDER_ARCHIVED' THEN v_expected_state_code := 'FOLDER_ARCHIVED';
    WHEN 'DOCUMENT_ARCHIVED' THEN v_expected_state_code := 'DOCUMENT_ARCHIVED';
    WHEN 'DOCUMENT_PURGED' THEN v_expected_state_code := 'DOCUMENT_PURGED';
    WHEN 'DOCUMENT_PERMISSION_REDUCED' THEN v_expected_state_code := 'DOCUMENT_PERMISSION_REDUCED';
    WHEN 'INVITATION_CREDENTIAL_INVALIDATED' THEN v_expected_state_code := 'INVITATION_CREDENTIAL_INVALIDATED';
    WHEN 'INVITATION_CONSUMED' THEN v_expected_state_code := 'INVITATION_CONSUMED';
    WHEN 'INVITATION_REVOKED' THEN v_expected_state_code := 'INVITATION_REVOKED';
    WHEN 'INVITATION_EXPIRED' THEN v_expected_state_code := 'INVITATION_EXPIRED';
    WHEN 'AI_SOURCE_ACCESS_REVOKED' THEN v_expected_state_code := 'AI_SOURCE_ACCESS_REVOKED';
    WHEN 'AI_HISTORY_REDACTED' THEN v_expected_state_code := 'AI_HISTORY_REDACTED';
    WHEN 'AI_DERIVED_DATA_PURGED' THEN v_expected_state_code := 'AI_DERIVED_DATA_PURGED';
    WHEN 'AI_EXTERNAL_PROVIDER_DISABLED' THEN v_expected_state_code := 'AI_EXTERNAL_PROVIDER_DISABLED';
    WHEN 'ATTACHMENT_QUARANTINED' THEN v_expected_state_code := 'ATTACHMENT_QUARANTINED';
    WHEN 'ATTACHMENT_DELETE_REQUESTED' THEN v_expected_state_code := 'ATTACHMENT_DELETE_REQUESTED';
    WHEN 'ATTACHMENT_DELETED' THEN v_expected_state_code := 'ATTACHMENT_DELETED';
    ELSE RAISE EXCEPTION 'SECURITY_JOURNAL_KIND_INVALID';
  END CASE;

  CASE
    WHEN p_event_kind IN (
      'AUTH_USER_DISABLED',
      'AUTH_CREDENTIAL_INVALIDATED',
      'AUTH_USER_SESSIONS_REVOKED',
      'TRIAL_IDENTITY_QUARANTINED'
    ) THEN v_allowed_subject_types := ARRAY['USER'];
    WHEN p_event_kind = 'AUTH_OAUTH_ACCOUNT_REVOKED'
      THEN v_allowed_subject_types := ARRAY['OAUTH_ACCOUNT'];
    WHEN p_event_kind = 'AUTH_SESSION_REVOKED'
      THEN v_allowed_subject_types := ARRAY['AUTH_SESSION'];
    WHEN p_event_kind IN ('SUPPORT_ACCESS_REVOKED', 'SUPPORT_ACCESS_EXPIRED')
      THEN v_allowed_subject_types := ARRAY['SUPPORT_GRANT'];
    WHEN p_event_kind = 'ORGANIZATION_MEMBERSHIP_REVOKED'
      THEN v_allowed_subject_types := ARRAY['ORGANIZATION_MEMBERSHIP'];
    WHEN p_event_kind = 'WORKSPACE_MEMBERSHIP_REVOKED'
      THEN v_allowed_subject_types := ARRAY['WORKSPACE_MEMBERSHIP'];
    WHEN p_event_kind = 'WORKSPACE_ARCHIVED'
      THEN v_allowed_subject_types := ARRAY['WORKSPACE'];
    WHEN p_event_kind = 'FOLDER_ARCHIVED'
      THEN v_allowed_subject_types := ARRAY['FOLDER'];
    WHEN p_event_kind IN ('DOCUMENT_ARCHIVED', 'DOCUMENT_PURGED')
      THEN v_allowed_subject_types := ARRAY['DOCUMENT'];
    WHEN p_event_kind = 'DOCUMENT_PERMISSION_REDUCED'
      THEN v_allowed_subject_types := ARRAY['DOCUMENT_PERMISSION'];
    WHEN p_event_kind IN (
      'INVITATION_CREDENTIAL_INVALIDATED',
      'INVITATION_CONSUMED',
      'INVITATION_REVOKED',
      'INVITATION_EXPIRED'
    ) THEN v_allowed_subject_types := ARRAY['INVITATION'];
    WHEN p_event_kind = 'AI_SOURCE_ACCESS_REVOKED'
      THEN v_allowed_subject_types := ARRAY['AI_SOURCE_ACCESS'];
    WHEN p_event_kind = 'AI_HISTORY_REDACTED'
      THEN v_allowed_subject_types := ARRAY['AI_CHAT_TURN', 'AI_CHAT_MEMORY'];
    WHEN p_event_kind = 'AI_DERIVED_DATA_PURGED'
      THEN v_allowed_subject_types := ARRAY['AI_DERIVED_DATA'];
    WHEN p_event_kind = 'AI_EXTERNAL_PROVIDER_DISABLED'
      THEN v_allowed_subject_types := ARRAY['WORKSPACE'];
    WHEN p_event_kind IN (
      'ATTACHMENT_QUARANTINED',
      'ATTACHMENT_DELETE_REQUESTED',
      'ATTACHMENT_DELETED'
    ) THEN v_allowed_subject_types := ARRAY['ATTACHMENT'];
    ELSE RAISE EXCEPTION 'SECURITY_JOURNAL_SUBJECT_MAPPING_MISSING';
  END CASE;

  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'SECURITY_JOURNAL_OPERATION_ID_INVALID';
  END IF;
  IF p_subject_type IS NULL
     OR NOT (p_subject_type = ANY(v_allowed_subject_types)) THEN
    RAISE EXCEPTION 'SECURITY_JOURNAL_SUBJECT_TYPE_INVALID';
  END IF;
  IF p_subject_id IS NULL
     OR pg_catalog.octet_length(
          pg_catalog.convert_to(p_subject_id, 'UTF8')
        ) NOT BETWEEN 1 AND 191
     OR p_subject_id ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'SECURITY_JOURNAL_SUBJECT_ID_INVALID';
  END IF;
  IF p_payload_json IS NULL
     OR pg_catalog.jsonb_typeof(p_payload_json) <> 'object' THEN
    RAISE EXCEPTION 'SECURITY_JOURNAL_PAYLOAD_OBJECT_REQUIRED';
  END IF;
  IF pg_catalog.octet_length(
       pg_catalog.convert_to(p_payload_json::TEXT, 'UTF8')
     ) > 96 THEN
    RAISE EXCEPTION 'SECURITY_JOURNAL_PAYLOAD_TOO_LARGE';
  END IF;

  IF EXISTS (
    WITH RECURSIVE payload_walk(value) AS (
      SELECT p_payload_json
      UNION ALL
      SELECT child.value
      FROM payload_walk AS parent
      CROSS JOIN LATERAL (
        SELECT object_child.value
        FROM pg_catalog.jsonb_each(
          CASE
            WHEN pg_catalog.jsonb_typeof(parent.value) = 'object'
              THEN parent.value
            ELSE '{}'::JSONB
          END
        ) AS object_child(key, value)
        UNION ALL
        SELECT array_child.value
        FROM pg_catalog.jsonb_array_elements(
          CASE
            WHEN pg_catalog.jsonb_typeof(parent.value) = 'array'
              THEN parent.value
            ELSE '[]'::JSONB
          END
        ) AS array_child(value)
      ) AS child
    )
    SELECT 1
    FROM payload_walk AS node
    CROSS JOIN LATERAL pg_catalog.jsonb_object_keys(
      CASE
        WHEN pg_catalog.jsonb_typeof(node.value) = 'object'
          THEN node.value
        ELSE '{}'::JSONB
      END
    ) AS payload_key(key)
    WHERE pg_catalog.lower(payload_key.key) ~
      '(password|hash|secret|token|cookie|authorization|email|name|reason|path|url|query|content|body|provider|address|clientip|ipaddress|raw)'
  ) THEN
    RAISE EXCEPTION 'SECURITY_JOURNAL_SENSITIVE_KEY_FORBIDDEN';
  END IF;

  SELECT pg_catalog.array_agg(payload_key.key ORDER BY payload_key.key)
  INTO v_payload_keys
  FROM pg_catalog.jsonb_object_keys(p_payload_json) AS payload_key(key);
  IF v_payload_keys IS DISTINCT FROM
     ARRAY['stateCode', 'stateVersion']::TEXT[] THEN
    RAISE EXCEPTION 'SECURITY_JOURNAL_PAYLOAD_KEYS_INVALID';
  END IF;
  IF pg_catalog.jsonb_typeof(p_payload_json -> 'stateCode') <> 'string'
     OR pg_catalog.octet_length(
          pg_catalog.convert_to(p_payload_json ->> 'stateCode', 'UTF8')
        ) NOT BETWEEN 1 AND 64
     OR p_payload_json ->> 'stateCode' <> v_expected_state_code THEN
    RAISE EXCEPTION 'SECURITY_JOURNAL_STATE_CODE_INVALID';
  END IF;
  IF pg_catalog.jsonb_typeof(p_payload_json -> 'stateVersion') <> 'number'
     OR p_payload_json -> 'stateVersion' <> '1'::JSONB THEN
    RAISE EXCEPTION 'SECURITY_JOURNAL_STATE_VERSION_INVALID';
  END IF;

  SELECT * INTO v_state
  FROM public."SecurityJournalChainState"
  WHERE "singletonKey" = TRUE
  FOR UPDATE;
  IF v_state."initializedAt" IS NULL
     OR v_state."genesisContextHash" IS NULL
     OR v_state."lastEventHash" IS NULL THEN
    RAISE EXCEPTION 'SECURITY_JOURNAL_UNINITIALIZED';
  END IF;

  -- The singleton chain lock is the operation-id linearization point. A caller may
  -- perform an unlocked duplicate lookup as a latency hint before invoking this
  -- function, but only this post-lock lookup is authoritative.
  SELECT * INTO v_existing
  FROM public."SecurityJournalEvent"
  WHERE "operationId" = p_operation_id;
  IF FOUND THEN
    IF v_existing."eventKind" <> p_event_kind
       OR v_existing."subjectType" <> p_subject_type
       OR v_existing."subjectId" <> p_subject_id
       OR v_existing."payloadJson" <> p_payload_json THEN
      RAISE EXCEPTION 'SECURITY_JOURNAL_OPERATION_CONFLICT';
    END IF;
    RETURN QUERY SELECT v_existing."sequence", pg_catalog.encode(v_existing."eventHash", 'hex');
    RETURN;
  END IF;

  v_sequence := v_state."lastSequence" + 1;
  v_canonical_occurred_at := pg_catalog.to_char(
    v_occurred_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );
  v_preimage :=
    pg_catalog.convert_to('munjib-security-journal-event-v1', 'UTF8') ||
    pg_catalog.decode('00', 'hex') ||
    v_state."lastEventHash" ||
    pg_catalog.int8send(v_sequence) ||
    public.security_journal_lp_utf8(p_event_kind) ||
    public.security_journal_lp_utf8(p_subject_type) ||
    public.security_journal_lp_utf8(p_subject_id) ||
    public.security_journal_lp_utf8(pg_catalog.lower(p_operation_id::TEXT)) ||
    public.security_journal_lp_utf8(v_canonical_occurred_at) ||
    public.security_journal_lp_utf8(p_payload_json ->> 'stateCode') ||
    pg_catalog.decode('01', 'hex');
  v_hash := munjib_extensions.digest(v_preimage, 'sha256');

  INSERT INTO public."SecurityJournalEvent"
    ("sequence","eventKind","subjectType","subjectId","operationId",
     "payloadJson","hashVersion","occurredAt","previousHash","eventHash")
  VALUES
    (v_sequence,p_event_kind,p_subject_type,p_subject_id,p_operation_id,
     p_payload_json,1,v_occurred_at,v_state."lastEventHash",v_hash);

  UPDATE public."SecurityJournalChainState"
  SET "lastSequence" = v_sequence, "lastEventHash" = v_hash,
      "updatedAt" = v_occurred_at
  WHERE "singletonKey" = TRUE;

  RETURN QUERY SELECT v_sequence, pg_catalog.encode(v_hash, 'hex');
END;
$$;
```

- [ ] **Step 6: Enforce immutable events, anchored state, parsing, and role separation**

Create an immutable event trigger function with `SET search_path=pg_catalog` that always raises `SECURITY_JOURNAL_IMMUTABLE`; attach row triggers for UPDATE/DELETE and a statement trigger for TRUNCATE. A separate chain-state trigger permits the append function to advance only lastSequence/lastEventHash/updatedAt and rejects every change to verifiedEnvelopeSha256, genesisContextHash, or initializedAt after initialization. Root finalization transfers ownership to `munjib_journal_owner` and revokes PUBLIC/app direct DML/DDL/default privileges. After Task 3 initializes genesis, root grants app EXECUTE on append only and exporter SELECT only.

`deriveSecurityJournalOperationId` validates its root UUID and uses the pinned namespace plus a length-delimited canonical tuple; it never hashes ambiguous string concatenation. `appendSecurityJournalEvent` applies the exact runtime mirror of `SecurityJournalEventInput`, then calls parameterized `$queryRaw`. An optional application duplicate lookup is a hint only: `security_journal_append` always locks `SecurityJournalChainState` first and re-reads `operationId` under that lock before returning an existing row or allocating the next sequence. `parseSecurityJournalEvent` validates exact external keys/encodings without Number conversion. The TS encoder/hash helper and SQL binary encoder must match every checked-in vector byte-for-byte. Export/replay parses, recomputes each event hash from its previousHash, and starts from the DB genesisContextHash anchored to the expected Wave envelope.

Role tests connect independently as bootstrap, migrator, app, and backup/exporter and assert `current_user`, role flags, ownership, grants, default ACLs, and failed app attempts to ALTER/DROP/TRUNCATE tables, disable triggers, CREATE ROLE, or SET ROLE to journal/schema owner. Merely mocking Prisma authorization is insufficient.

- [ ] **Step 7: Run GREEN, update the durable wiki evidence, and commit through every gate**

Document Leaf 13 role dependency, root bootstrap/finalize, one-time Wave genesis binding, language-independent binary preimage, JSON-safe parser/event type, privilege separation, kind-to-subject mapping, immutable replay target, exact payload, and indefinite retention in `wiki/Document Knowledge Model.md`; add log evidence.

```bash
pnpm run db:generate
pnpm exec vitest run tests/security/journal-schema.test.ts tests/security/journal.test.ts tests/security/journal-payload-contract.test.ts tests/security/journal-external-event.test.ts tests/security/journal-hash-vectors.test.ts tests/security/journal-genesis.test.ts tests/security/journal-roles.test.ts tests/security/journal-extension-prereqs.test.ts tests/security/journal-export-checkpoint.test.ts tests/security/security-journal-capability.test.ts tests/security/security-journal-bundle.test.ts tests/deploy/attested-helper-bootstrap.test.ts
pnpm exec tsc --noEmit
git add prisma/schema.prisma prisma/migrations/20260712000000_security_journal_and_auth_tombstones/migration.sql lib/security/journal.ts lib/security/journal-capability.ts deploy/postgres/security-journal-prereqs.sql deploy/postgres/security-journal-acl.sql deploy/security/security-journal-capability-contract-v1.json deploy/host-helpers/manifest-v1.json deploy/host-helpers/security-journal scripts/security/finalize-journal-roles.ts scripts/security/initialize-security-journal.ts scripts/security/journal-preflight.ts scripts/security/emit-security-journal-capability.ts scripts/security/verify-security-journal-capability.ts tests/fixtures/security-journal-hash-vectors.json tests/security/journal-schema.test.ts tests/security/journal.test.ts tests/security/journal-payload-contract.test.ts tests/security/journal-external-event.test.ts tests/security/journal-hash-vectors.test.ts tests/security/journal-genesis.test.ts tests/security/journal-roles.test.ts tests/security/journal-extension-prereqs.test.ts tests/security/journal-export-checkpoint.test.ts tests/security/security-journal-capability.test.ts tests/security/security-journal-bundle.test.ts tests/deploy/attested-helper-bootstrap.test.ts package.json wiki/Document\ Knowledge\ Model.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(security): add append-only security journal"
```

Expected: migration, concurrency, immutability, roles, wiki gates, and commit PASS.

Production delivery sends one signed envelope over Leaf 13A's native-OpenSSH forced
command. The root dispatcher verifies `security-journal-v1` plus the exact candidate,
then its fixed finite-state operation alone performs PRE emit/verify, prerequisite,
migration, ownership finalization, and post-step PRE refresh. Neither the deploy user
nor the workflow can invoke a helper or pass a path/argument directly.

The internal migration operation does not pass `PGSERVICE` to Prisma. It verifies the
fresh PRE artifact, derives the exact staged candidate image and Leaf 13B fixed
`migrate` discriminator, mounts only the UID-10001 migrator URL file, and runs
`prisma migrate deploy` with `DATABASE_URL` loaded by the release entrypoint. It
unsets inherited libpq variables/service options, sets only fixed
`PGOPTIONS=-c search_path=pg_catalog,public`, and verifies the actual connection's
first effective schema is `pg_catalog` before migration. It has a ten-minute hard
timeout. Each privileged step verifies freshness and pins the
PRE digest at admission under the DB advisory lock; expiry after admission does not
retroactively invalidate that bounded transaction, but every following step must
re-emit and live-verify. A timeout/failure stops progression and requires fix-forward
plus a new PRE artifact; it never rolls roles or applied migrations backward.

### Task 3: Verify the two-phase recovery gate with pinned trust and continuously export the journal

**Files:**
- Create: `lib/security/operator-files.ts`
- Create: `lib/security/systemd-credential-files.ts`
- Create: `lib/security/wave-half-gate.ts`
- Create: `scripts/security/verify-wave-half.ts`
- Create: `scripts/security/create-wave-half-b-gate.ts`
- Create: `scripts/security/create-restore-candidate-isolation-proof.ts`
- Create: `scripts/security/run-wave-half-b-restore-candidate.sh`
- Create: `scripts/security/initialize-security-journal-restore-candidate.ts`
- Create: `scripts/security/export-security-journal.ts`
- Create: `scripts/security/replay-security-journal.ts`
- Create: `security/trust/recovery-signing-public.pem`
- Create: `security/trust/journal-kms-public.pem`
- Create: `security/trust/journal-age-recipient.txt`
- Create: `tests/security/operator-files.test.ts`
- Create: `tests/security/systemd-credential-files.test.ts`
- Create: `tests/security/systemd-credential-files.integration.test.ts`
- Create: `tests/security/wave-half-gate.test.ts`
- Create: `tests/security/wave-half-b-gate.test.ts`
- Create: `tests/security/journal-restore-candidate-genesis.test.ts`
- Create: `tests/security/wave-half-b-restore-orchestrator.test.ts`
- Create: `tests/security/journal-export.test.ts`
- Create: `tests/security/journal-replay.test.ts`
- Create: `deploy/systemd/munjib-security-capability-refresh.service`
- Create: `deploy/systemd/munjib-security-capability-refresh.timer`
- Create: `deploy/systemd/munjib-journal-export.service`
- Create: `deploy/systemd/munjib-journal-export.timer`
- Create: `tests/security/journal-export-automation.test.ts`
- Create: `deploy/delivery/bundle-policies/security-journal-v1.json`
- Modify: `tests/deploy/host-bundle-parser.test.ts`
- Modify: `deploy/host-helpers/manifest-v1.json`
- Modify: `deploy/host-helpers/security-journal/*`
- Modify: `tests/security/security-journal-bundle.test.ts`
- Modify: `tests/deploy/attested-helper-bootstrap.test.ts`
- Modify: `package.json`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Produces: distinct `readRootOnlyBoundedFile` and
  `readSystemdCredentialBoundedFile`, branded `VerifiedWaveHalfGate`, the immediate
  fixed root Phase-B isolation-proof/orchestrator tooling, a narrowly scoped
  restore-candidate genesis initializer, encrypted signed export bundles, and
  outbound-isolated replay verification. Leaf 14 later reuses this tooling; Task 3
  does not depend on future Leaf 14 implementation.

- [ ] **Step 1: Write failing evidence/file/export tests**

Tests cover symlink, path swap, non-regular file, wrong owner/mode, oversize, second
read, root-only/operator versus service-credential ownership separation,
operator-supplied key rejection, Phase A envelope signature/hash mismatch, Phase B
environment/source digest mismatch, stale/future Phase B timestamp, Phase B nonce
reuse, Phase A anchor substitution, restore-candidate environment/isolation/PRE/cluster
mismatch, candidate use in production, append before genesis, same/different second
initialization, app initialization denial, envelope-to-genesis mismatch, broken binary
event hash, Unicode/vector mismatch, wrong pinned signature, plaintext export, and
replay mismatch.

Automation tests require a root fixed-wrapper capability refresh every five minutes,
an unprivileged `Type=oneshot` exporter timer no slower than 60 seconds, exactly one
`journal_pair` `LoadCredential` source, effective-UID credential-copy readability but guarded
source denial, no object-list/full environment/Docker socket, and stable-code failure on
expiry, mixed pair, KMS/DB drift, or refresh/export error.
Container/source-contract tests prove Compose file-secret `uid`/`gid`/`mode` is not
trusted, inspect the actual host and in-container inode/mode/digest, atomically replace
the host bind inode, require force-recreate, and reject a running container that still
sees the previous generation.
They also require the exact-digest deploy script, once journal genesis exists, to
refresh and verify a candidate-bound pair after migrations and before Web/floor
promotion. Missing/failed refresh blocks deploy; before genesis the script accepts
only PRE and cannot fabricate JOURNAL_READY.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/security/operator-files.test.ts tests/security/systemd-credential-files.test.ts tests/security/systemd-credential-files.integration.test.ts tests/security/wave-half-gate.test.ts tests/security/wave-half-b-gate.test.ts tests/security/journal-restore-candidate-genesis.test.ts tests/security/wave-half-b-restore-orchestrator.test.ts tests/security/security-journal-bundle.test.ts tests/deploy/attested-helper-bootstrap.test.ts tests/security/journal-export.test.ts tests/security/journal-export-automation.test.ts tests/security/journal-replay.test.ts tests/deploy/exact-digest-scripts.test.ts`

Expected: FAIL because the exact Phase B gate builder, pinned verifier, restore-only
initializer/orchestrator, capability/export units, export, and replay code do not exist.

- [ ] **Step 3: Implement safe same-FD evidence reading**

```ts
export async function readRootOnlyBoundedFile(input: {
  path: string;
  maximumBytes: number;
  openFile?: typeof open;
}) {
  const handle = await (input.openFile ?? open)(
    input.path,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("OPERATOR_FILE_NOT_REGULAR");
    if (stat.uid !== 0 || (stat.mode & 0o077) !== 0) {
      throw new Error("OPERATOR_FILE_PERMISSIONS_INVALID");
    }
    if (stat.size <= 0 || stat.size > input.maximumBytes) {
      throw new Error("OPERATOR_FILE_SIZE_INVALID");
    }
    const buffer = Buffer.alloc(stat.size);
    const { bytesRead } = await handle.read(buffer, 0, stat.size, 0);
    if (bytesRead !== stat.size) throw new Error("OPERATOR_FILE_SHORT_READ");
    return buffer;
  } finally {
    await handle.close();
  }
}
```

Do not reuse or weaken that operator reader for systemd `LoadCredential` copies.
Create `readSystemdCredentialBoundedFile({ name, maximumBytes })`, which accepts only a
fixed basename, derives the path solely beneath the absolute
`CREDENTIALS_DIRECTORY`, verifies the directory is a non-symlinked, non-group/other-
writable systemd private read-only credential mount, snapshots its device/inode and
read-only mount identity before and after, opens the leaf once with
`O_RDONLY|O_NOFOLLOW`, and reads only that FD. The credential leaf must be a regular
file with nlink 1, positive bounded size, no group/other bits, owner in the target-
observed narrow set `{process effective UID, root}`, and mode exactly `0400` or `0600`.
The exporter runs as its dedicated service UID and uses only this reader for the one
combined journal-pair credential; it cannot traverse or read the root-owned source.

The unit test does not invent an euid-only/exact-0400 policy. A target Ubuntu
integration test uses a real `systemd-run`/oneshot plus `LoadCredential=` to record and
enforce observed owner/mode, credential-mount read-only identity, nlink 1, copy
readability, source denial, and unrelated-file denial. It emits only stable metadata
codes. The root-only reader still rejects service-owned operator evidence.

- [ ] **Step 4: Implement pinned Phase A/B recovery verification**

Verify two immutable exact-schema artifacts rather than redefining the Phase A
envelope. First, safe-read and verify the original long-lived
`wave-half-a-envelope-v1`, whose exact fields remain `format`, `backupId`, `epoch`,
`encryptedPayloadSha256`, `manifestSha256`, `createdAt`, and 256-bit nonce. Its full
canonical signed bytes produce the lowercase `phaseAEnvelopeSha256` that anchors DB
genesis; no later artifact can replace it.

Second, verify a short-lived signed `wave-half-b-gate-v1` containing exact:

- `environment`
- `sourceDigest`
- `createdAt`
- `expiresAt`
- a new 256-bit nonce
- `phaseAEnvelopeSha256`
- encrypted payload SHA-256 and attachment manifest SHA-256 copied from the verified
  Phase A envelope/manifest
- `restoreResultSha256s`, an ordered two-element array of distinct lowercase SHA-256
  digests from the two independent restore results
- new signing-secret proof
- unusable restored session/OAuth proof

The verifier loads only repository-pinned trust material, checks both signatures and
their cross-hashes, checks the expected environment/source digest supplied by the
deploy runtime, enforces a 15-minute Phase B evidence window and one-use Phase B nonce
record, and returns `VerifiedWaveHalfGate` with immutable lowercase
`phaseAEnvelopeSha256` plus `phaseBGateSha256`. No `--public-key` or public-key env
option exists. The Phase A envelope is not subject to the Phase B 15-minute expiry.

Phase B bootstrapping uses a separate restore-only initializer and never relaxes the
production initializer. Task 3 installs
`/usr/local/libexec/munjib-run-wave-half-b-restore-candidate` from the exact verified
`security-journal-v1` host bundle through the root dispatcher before either drill; no
deploy-user sudoers rule exists. Leaf 14 later reuses
this same primitive. For each disposable outbound-isolated restore, that fixed root
orchestrator invokes the KMS proof producer to create a short-lived signed
`munjib-restore-candidate-isolation-v1` proof binding environment `restore`, unique
cluster-system-identifier hash, database OID, source/image/floor, network-namespace
identity, deny-all-egress policy digest, issued/expiry (maximum 15 minutes), and nonce.
`initialize-security-journal-restore-candidate.ts` runs only with
`MUNJIB_RESTORE_CANDIDATE_MODE=wave-half-b`, verifies that proof with pinned trust,
verifies the long-lived Phase A envelope, and consumes a freshly emitted local
PRE_JOURNAL capability for the same restore cluster. It initializes only that restore
DB's genesis from `phaseAEnvelopeSha256`; it does not grant app append/exporter runtime
access, emit JOURNAL_READY, or modify any production artifact. The Phase B drill uses
the fixed bootstrap connection inside the isolated root orchestrator for minimal
chain/export/replay assertions and then destroys the cluster. Two independent signed
restore-result digests feed `create-wave-half-b-gate.ts`. Only after that gate exists
may the production initializer below run. Candidate mode fails in production, without
the isolation proof, on cluster/OID/PRE mismatch, after expiry, or on nonce reuse.

The fixed orchestrator is installed from the attested `security-journal-v1` bundle,
acquires `/run/lock/munjib-security-state.lock`, and receives no caller path, image,
environment, KMS, network, DB, or output argument. The dispatcher binds the signed
release envelope to fixed guarded inbox/result locations. The orchestrator derives all image,
KMS, DB-service, and network inputs. Per run it: verifies candidate provenance; creates
a unique Docker `--internal` network and unpublished empty PostgreSQL cluster; applies
Leaf 13's roles-only bootstrap and fixed allowlisted restore prerequisites; validates
the dump TOC/schema-only SQL to reject COPY PROGRAM, dump-controlled extension,
privileged SET ROLE, FDW/server/subscription/event-trigger, and unsafe language; then
restores with the ephemeral NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/
NOBYPASSRLS/NOINHERIT loader using exactly
`--exit-on-error --single-transaction --no-owner --no-privileges` and fixed
`PGOPTIONS=-c search_path=pg_catalog,public`; runs
ownership/default-ACL finalization; emits and live-verifies that restore cluster's PRE;
applies current root prerequisites and migrations using the exact candidate image and
then re-finalizes ACLs; creates
the isolation proof; invokes the candidate genesis initializer; performs the minimal
anchored export/replay/auth-denial assertions through the fixed bootstrap connection;
writes one exact-schema KMS-signed root-mode-`0400` result; and destroys containers,
network, credentials, plaintext, and temp paths in a trap. It cannot mount production
DB/attachment paths or the host network. Tests enforce the precise
`roles-only/restore prerequisites → preflight → non-superuser pg_restore → ownership → PRE → prerequisites/current migrations/final ACL → isolation proof →
candidate genesis → replay → destroy` order and two runs must have distinct cluster,
nonce, and result identities. The gate builder sorts the two signed result digests,
requires exactly two distinct values, and binds both into the signature; one result,
duplicates, or substitution fails.

Immediately after verification and before any app append EXECUTE, Trial disable,
support cleanup, or exporter start, the signed Leaf 2 release envelope selects one
fixed dispatcher operation. The operation installs exact bundle `security-journal-v1`,
emits and live-verifies PRE, safe-reads the fixed Phase A and Phase B artifacts,
initializes production genesis, verifies grants, then emits and live-verifies the one
combined PRE/JOURNAL_READY pair. The workflow and deploy principal can neither invoke
an internal helper nor select a path/argument.

The operation safe-reads both root-owned artifacts, re-verifies the branded gate, calls
the root-only initializer with only `phaseAEnvelopeSha256`, proves DB
genesisContextHash, then grants `munjib_app` EXECUTE on append and SELECT-only exporter
access. A second/different initialization, app invocation, Phase A substitution, Phase
B mismatch, or envelope/DB mismatch aborts without changing grants.

Extend the Task 2 attested `security-journal-v1` bundle to install the Phase-B
orchestrator, restore-only candidate initializer, production initializer, journal
emitter/verifier, and atomic pair refresher as root:root `0555`. Only the root
dispatcher and fixed systemd units invoke them; no deploy-user sudoers rule exists.
Manifest/source-hash tests cover every installed wrapper. Mutating
checkout bytes after image build cannot affect installed bytes. Leaf 2 installs
a root-owned five-minute capability-refresh timer that re-emits both a fresh live
regular PRE plus one complete signed JOURNAL_READY pair bundle, verifies both against
the live DB, and atomically renames their regular `current.json` files only after all
checks pass. No current symlink exists. Each artifact expires within 15 minutes. The
exporter safe-reads and re-verifies the combined pair before every cycle and stops exporting (without blocking
journal append) if refresh/freshness/live-fact verification fails. No unprivileged
process can refresh or choose KMS/DB/output paths. A separate unprivileged one-shot
exporter service runs at most every 60 seconds with one `journal_pair` systemd
credential plus the exporter DB credential, exports one bounded Leaf 2 batch, and
exits; failures page while DB journaling continues. Leaf 14 later modifies/reuses these
same units for multi-batch high-water export rather than creating a second exporter.
The attested bundle installer validates unit hashes with `systemd-analyze verify`,
installs atomically root:root `0444`, performs `daemon-reload`, and enables timers only
after the initial pair verifies; enable failure restores the previous attested
generation, leaves exporter stopped, and blocks rollout.

Compose file-secret `uid`, `gid`, and `mode` are not accepted as enforcement for file
sources. Any PRE/pair/secret regular file bind-mounted into a long-lived container is
prepared and fstat-verified on the host, then every atomic host-inode replacement
force-recreates the consuming container and verifies the in-container read-only inode/
digest as its service UID before readiness. A mere reload or path hash is insufficient.

- [ ] **Step 5: Implement continuous encrypted KMS-signed export**

The exporter:

1. reads verifiedEnvelopeSha256, genesisContextHash, and events through the exporter DB role;
2. requires the expected envelope digest to equal DB state, recomputes the genesis-v1 hash, parses each JSON-safe event with `parseSecurityJournalEvent`, and verifies every binary preimage/hash;
3. creates a canonical bundle containing `waveHalfEnvelopeSha256`, genesis hash, previous bundle digest, sequence bounds, source digest, environment, createdAt, and random nonce;
4. encrypts the bundle with pinned age recipient before off-host write;
5. hashes ciphertext and signs that digest using the configured KMS key URI;
6. verifies the signature with `security/trust/journal-kms-public.pem`;
7. calls the DB-owned begin/advance procedures around exact-key upload verification;
   it has no root-local cursor and survives host loss between upload and checkpoint.

No plaintext bundle is written to persistent disk. `replay-security-journal` decrypts only in an outbound-isolated restore, parses the exact external event type, starts from the anchored genesisContextHash, and proves envelope/genesis/event/tail equivalence. An export metadata digest cannot substitute for the DB chain anchor.

- [ ] **Step 6: Run GREEN, update wiki, and commit**

```bash
pnpm exec vitest run tests/security/operator-files.test.ts tests/security/systemd-credential-files.test.ts tests/security/systemd-credential-files.integration.test.ts tests/security/wave-half-gate.test.ts tests/security/wave-half-b-gate.test.ts tests/security/journal-restore-candidate-genesis.test.ts tests/security/wave-half-b-restore-orchestrator.test.ts tests/security/security-journal-bundle.test.ts tests/deploy/attested-helper-bootstrap.test.ts tests/security/journal-genesis.test.ts tests/security/journal-hash-vectors.test.ts tests/security/journal-external-event.test.ts tests/security/journal-export.test.ts tests/security/journal-export-automation.test.ts tests/security/journal-replay.test.ts tests/deploy/exact-digest-scripts.test.ts
if rg -q '(BEGIN PRIVATE KEY|MUNJIB_.*SECRET=.)' security/trust wiki; then exit 1; fi
```

Document pinned trust, one-use envelope, continuous exporter, KMS signature, and replay in the CI/CD wiki; append log evidence. Run:

```bash
git add lib/security/operator-files.ts lib/security/systemd-credential-files.ts lib/security/wave-half-gate.ts scripts/security/verify-wave-half.ts scripts/security/create-wave-half-b-gate.ts scripts/security/create-restore-candidate-isolation-proof.ts scripts/security/run-wave-half-b-restore-candidate.sh scripts/security/initialize-security-journal-restore-candidate.ts scripts/security/export-security-journal.ts scripts/security/replay-security-journal.ts deploy/delivery/bundle-policies/security-journal-v1.json deploy/host-helpers/manifest-v1.json deploy/host-helpers/security-journal deploy/systemd/munjib-security-capability-refresh.service deploy/systemd/munjib-security-capability-refresh.timer deploy/systemd/munjib-journal-export.service deploy/systemd/munjib-journal-export.timer security/trust/recovery-signing-public.pem security/trust/journal-kms-public.pem security/trust/journal-age-recipient.txt tests/security/operator-files.test.ts tests/security/systemd-credential-files.test.ts tests/security/systemd-credential-files.integration.test.ts tests/security/wave-half-gate.test.ts tests/security/wave-half-b-gate.test.ts tests/security/journal-restore-candidate-genesis.test.ts tests/security/wave-half-b-restore-orchestrator.test.ts tests/security/security-journal-bundle.test.ts tests/deploy/attested-helper-bootstrap.test.ts tests/deploy/host-bundle-parser.test.ts tests/security/journal-export.test.ts tests/security/journal-export-automation.test.ts tests/security/journal-replay.test.ts package.json wiki/CI\ CD\ And\ Monitoring\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(security): export signed journal evidence"
```

Expected: all tests and quiet secret scan PASS.

### Task 4: Durably disable Trial while preserving administrator authentication

**Files:**
- Create: `lib/security/reserved-identities.ts`
- Create: `lib/security/trial-disable.ts`
- Create: `scripts/security/disable-trial.ts`
- Create: `lib/auth/durable-auth-state.ts`
- Modify: `lib/auth/downstream/leaf2.ts`
- Modify: `app/login/login-form.tsx`
- Create: `tests/security/trial-disable.test.ts`
- Create: `tests/auth/trial-disabled-auth.test.ts`
- Modify: `tests/auth/config.test.ts`
- Modify: `tests/components/login-form.test.tsx`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: immutable Trial/admin user IDs, `VerifiedWaveHalfGate`, protected reserved-email hashes, operation UUID, and Leaf 1's frozen `assertDurableAuthState({ userId, surface })` slot contract.
- Produces: `disableTrialIdentity`, a root-only one-shot command, `assertCurrentUserAuthEnabled`, and the reserved Leaf 2 slot transition from version 0 to `security-journal-auth-tombstones@1`; admin remains enabled and Leaf 1 core remains byte-identical.

- [ ] **Step 1: Write failing disable/auth tests**

Tests assert:

- Trial provider and UI absent
- exact Trial user gets `authDisabledAt` from DB time, `sessionVersion + 1`, passwordHash null, OAuth token columns null, adapter sessions deleted
- exact `TRIAL_IDENTITY_QUARANTINED`, `AUTH_USER_DISABLED`, `AUTH_CREDENTIAL_INVALIDATED`, and `AUTH_USER_SESSIONS_REVOKED` rows in the same transaction, each with its own derived operation UUID and two-key payload
- administrator `authDisabledAt` remains null, credentials unchanged, existing password/linked Google policy succeeds
- wrong/equal/missing immutable IDs fail before mutation
- rollback attempt cannot clear `authDisabledAt`
- all Leaf 1 password, Google-existing, JWT, session, and provisioning call sites continue
  through the already-frozen hook order; only `lib/auth/downstream/leaf2.ts` changes
- the exact Leaf 1 config/contract/password/adapter/candidate-context/session-image hashes
  remain unchanged, the reserved Leaf 2 baseline is at version 0 before this release,
  and the changed slot is recorded for the single final activation in Task 10

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/security/trial-disable.test.ts tests/auth/trial-disabled-auth.test.ts tests/auth/config.test.ts tests/components/login-form.test.tsx`

Expected: FAIL because the durable DB check, Leaf 2 slot activation, and disable flow do
not exist; Leaf 1's already-absent Trial provider/UI assertions remain green regressions.

- [ ] **Step 3: Implement same-transaction durable disable**

```ts
export async function disableTrialIdentity(input: {
  trialUserId: string;
  administratorUserId: string;
  operationId: string;
  gate: VerifiedWaveHalfGate;
}) {
  if (input.trialUserId === input.administratorUserId) {
    throw new Error("TRIAL_ADMIN_ID_COLLISION");
  }
  return prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({
      where: { id: { in: [input.trialUserId, input.administratorUserId] } },
      select: { id: true, authDisabledAt: true },
    });
    if (users.length !== 2) throw new Error("TRIAL_DISABLE_CARDINALITY");
    const disabled = await tx.$queryRaw<Array<{ authDisabledAt: Date }>>`
      UPDATE "User"
      SET "authDisabledAt" = COALESCE("authDisabledAt", CURRENT_TIMESTAMP),
          "sessionVersion" = "sessionVersion" + 1,
          "passwordHash" = NULL
      WHERE "id" = ${input.trialUserId}
      RETURNING "authDisabledAt"
    `;
    await tx.account.updateMany({
      where: { userId: input.trialUserId },
      data: {
        access_token: null,
        refresh_token: null,
        id_token: null,
        session_state: null,
      },
    });
    await tx.session.deleteMany({ where: { userId: input.trialUserId } });
    for (const kind of [
      "TRIAL_IDENTITY_QUARANTINED",
      "AUTH_USER_DISABLED",
      "AUTH_CREDENTIAL_INVALIDATED",
      "AUTH_USER_SESSIONS_REVOKED",
    ] as const) {
      await appendSecurityJournalEvent(tx, {
        kind,
        subjectType: "USER",
        subjectId: input.trialUserId,
        operationId: deriveSecurityJournalOperationId({
          rootOperationId: input.operationId,
          kind,
          subjectType: "USER",
          subjectId: input.trialUserId,
        }),
        payload: { stateCode: kind, stateVersion: 1 },
      });
    }
    return disabled[0];
  });
}
```

Leaf 1 already omits the Trial/development provider and invokes its version-0 no-op
Leaf 2 slot, after base identity/password checks and before persistence, session issue,
or protected return, on every password, Google-existing-account, JWT, session, and
provisioning surface. Implement `lib/auth/durable-auth-state.ts` to reload the exact
server-resolved User from the authoritative database and reject missing users or
`authDisabledAt !== null`; do not accept an email or client-authored identity. Replace
only `lib/auth/downstream/leaf2.ts` so the frozen hook delegates to that helper. There
is no enable function or Web route.

Do not publish the capability fragment or change the owner map in this task. Preserve
the Leaf 1-created version-0 reservation while implementing and testing the new slot
bytes. Task 10 performs the only `0 -> 1 ACTIVE` transition, after every Leaf 2
evidence file exists, and rejects any diff to Leaf 1 core.

- [ ] **Step 4: Run GREEN, update wiki, and commit**

Document durable Trial disable and preserved administrator auth; add log evidence.

```bash
pnpm exec vitest run tests/security/trial-disable.test.ts tests/auth/trial-disabled-auth.test.ts tests/auth/config.test.ts tests/components/login-form.test.tsx
git add lib/security/reserved-identities.ts lib/security/trial-disable.ts scripts/security/disable-trial.ts lib/auth/durable-auth-state.ts lib/auth/downstream/leaf2.ts app/login/login-form.tsx tests/security/trial-disable.test.ts tests/auth/trial-disabled-auth.test.ts tests/auth/config.test.ts tests/components/login-form.test.tsx wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "fix(auth): durably disable Trial"
```

Expected: Trial denial/admin preservation/journal/wiki gates PASS.

### Task 5: Replace launch backfill with explicit owner provisioning

**Files:**
- Delete: `lib/workspaces/membership-bootstrap.ts`
- Delete: `tests/workspaces/membership-bootstrap.test.ts`
- Create: `lib/workspaces/membership-provisioning.ts`
- Create: `tests/workspaces/membership-provisioning.test.ts`
- Modify: `lib/auth/provisioning.ts`
- Modify: `lib/workspaces/management-service.ts`
- Modify: `prisma/seed.ts`
- Modify: `tests/auth/provisioning.test.ts`
- Modify: `tests/workspaces/management-service.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Produces: `ensureWorkspaceOwnerMembership(tx, workspaceId, {userId, role:"OWNER"})`; no email lookup or launch loop.

- [ ] **Step 1: Write failing owner-only tests**

The test supplies one explicit user and asserts one upsert. It also passes an existing support-linked membership and expects `SUPPORT_MEMBERSHIP_MUTATION_FORBIDDEN`, preventing standard mutation from converting temporary access.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/workspaces/membership-provisioning.test.ts tests/auth/provisioning.test.ts tests/workspaces/management-service.test.ts`

Expected: FAIL while launch bootstrap and email-driven backfill remain.

- [ ] **Step 3: Implement owner-only provisioning**

```ts
export async function ensureWorkspaceOwnerMembership(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  owner: { userId: string; role: "OWNER" },
) {
  const existing = await tx.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: owner.userId } },
    select: { supportAccessGrantId: true },
  });
  if (existing?.supportAccessGrantId) {
    throw new Error("SUPPORT_MEMBERSHIP_MUTATION_FORBIDDEN");
  }
  await tx.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId: owner.userId } },
    update: { role: "OWNER" },
    create: { workspaceId, userId: owner.userId, role: "OWNER" },
  });
}
```

Remove launch account/password arrays and global workspace backfill. Production seed remains forbidden; development fixtures use only explicit local users.

- [ ] **Step 4: Run GREEN, update wiki, and commit**

```bash
pnpm exec vitest run tests/workspaces/membership-provisioning.test.ts tests/auth/provisioning.test.ts tests/workspaces/management-service.test.ts
git add -A lib/workspaces/membership-bootstrap.ts tests/workspaces/membership-bootstrap.test.ts lib/workspaces/membership-provisioning.ts tests/workspaces/membership-provisioning.test.ts lib/auth/provisioning.ts lib/workspaces/management-service.ts prisma/seed.ts tests/auth/provisioning.test.ts tests/workspaces/management-service.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "fix(workspaces): remove implicit launch access"
```

Expected: explicit owner tests, seed contract, wiki gates, and commit PASS.

### Task 6: Add DB-time support grants, resolver, and integrity triggers

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260712003000_support_access_capability/migration.sql`
- Create: `lib/workspaces/active-membership.ts`
- Create: `tests/security/support-access-schema.test.ts`
- Create: `tests/security/support-access-db-resolver.test.ts`
- Create: `tests/security/support-access-trigger.test.ts`
- Modify: `wiki/Document Knowledge Model.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Produces: `SupportAccessGrant`, immutable `SupportAccessGrantEvent`, DB function `resolve_active_workspace_membership`, and TypeScript `resolveActiveWorkspaceMembership`.

- [ ] **Step 1: Write failing schema, resolver, and trigger tests**

Tests create:

- explicit membership
- active EDITOR support membership
- expired but unswept support membership
- ended support membership
- mismatched grant/membership role
- attempted ADMIN/OWNER support membership
- attempted grant/event delete and truncate

Assertions:

- explicit and active support resolve
- expired/ended never resolve while row remains
- DB time, not injected app time, determines expiry
- role/workspace/user mismatch and manager roles fail
- standard mutation cannot update support row
- grant/event delete/truncate fail

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/security/support-access-schema.test.ts tests/security/support-access-db-resolver.test.ts tests/security/support-access-trigger.test.ts`

Expected: FAIL because support schema/function/triggers do not exist.

- [ ] **Step 3: Add support models**

```prisma
enum SupportAccessEventAction {
  GRANTED
  REVOKED
  EXPIRED
}

model SupportAccessGrant {
  id                String                    @id @default(cuid())
  workspaceId       String
  userId            String
  role              WorkspaceRole
  reason            String
  operatorReference String
  expiresAt         DateTime
  endedAt           DateTime?
  endReason         String?
  createdAt         DateTime                  @default(now())
  workspace         Workspace                 @relation(fields: [workspaceId], references: [id], onDelete: Restrict)
  user              User                      @relation(fields: [userId], references: [id], onDelete: Restrict)
  membership        WorkspaceMember?          @relation("SupportMembership")
  events            SupportAccessGrantEvent[]

  @@index([userId, expiresAt])
  @@index([workspaceId, expiresAt])
}

model SupportAccessGrantEvent {
  id                String                   @id @default(cuid())
  grantId           String
  action            SupportAccessEventAction
  reason            String
  operatorReference String
  createdAt         DateTime                 @default(now())
  grant             SupportAccessGrant       @relation(fields: [grantId], references: [id], onDelete: Restrict)

  @@index([grantId, createdAt])
}

model WorkspaceMember {
  supportAccessGrantId String?             @unique
  supportAccessGrant   SupportAccessGrant? @relation(
    "SupportMembership",
    fields: [supportAccessGrantId],
    references: [id],
    onDelete: Cascade
  )
}
```

- [ ] **Step 4: Implement the canonical DB resolver**

```sql
CREATE OR REPLACE FUNCTION public.resolve_active_workspace_membership(
  p_workspace_id TEXT,
  p_user_id TEXT
) RETURNS TABLE (
  membership_id TEXT,
  role "WorkspaceRole",
  support_access_grant_id TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT wm."id", wm."role", wm."supportAccessGrantId"
  FROM public."WorkspaceMember" wm
  LEFT JOIN public."SupportAccessGrant" sag
    ON sag."id" = wm."supportAccessGrantId"
  WHERE wm."workspaceId" = p_workspace_id
    AND wm."userId" = p_user_id
    AND (
      wm."supportAccessGrantId" IS NULL
      OR (
        sag."endedAt" IS NULL
        AND sag."expiresAt" > statement_timestamp()
      )
    )
  LIMIT 1
$$;
```

The function has exactly two arguments. No overload, wrapper, fixture, or raw SQL path
accepts an authorization time. PostgreSQL evaluates `statement_timestamp()` inside the
resolver. Leaf 5's protected `resolveActiveWorkspaceForActorForUpdate()` first locks
Workspace → WorkspaceMember → SupportAccessGrant, then issues a new statement that calls
this two-argument resolver and selects the same statement's
`statement_timestamp() AS database_now`. Migration tests inspect `pg_proc`, revoke any
legacy three-argument overload before granting EXECUTE, and fail if any source call has
a third argument or if application/test time can influence expiry.

```ts
// lib/workspaces/active-membership.ts
import type { Prisma, PrismaClient, WorkspaceRole } from "@prisma/client";

export type ActiveWorkspaceMembership = {
  membershipId: string;
  role: WorkspaceRole;
  supportAccessGrantId: string | null;
};

export async function resolveActiveWorkspaceMembership(
  db: Prisma.TransactionClient | PrismaClient,
  input: { workspaceId: string; userId: string },
) {
  const rows = await db.$queryRaw<ActiveWorkspaceMembership[]>`
    SELECT
      membership_id AS "membershipId",
      role,
      support_access_grant_id AS "supportAccessGrantId"
    FROM public.resolve_active_workspace_membership(
      ${input.workspaceId},
      ${input.userId}
    )
  `;
  if (rows.length > 1) throw new Error("ACTIVE_MEMBERSHIP_CARDINALITY");
  return rows[0] ?? null;
}
```

- [ ] **Step 5: Add DB integrity and immutability triggers**

`WorkspaceMember` BEFORE INSERT/UPDATE trigger:

- when `supportAccessGrantId` is null, allow ordinary rules;
- otherwise load the grant;
- require same workspace/user;
- require role equals grant role;
- require role in `EDITOR|VIEWER`;
- require `endedAt IS NULL` and `expiresAt > statement_timestamp()`.
- start a transaction, wait past a synthetic grant expiry on a row lock, then resolve in
  a later two-argument resolver statement and require denial; transaction-start time or
  a caller-supplied timestamp must not preserve access. Direct SQL calling a removed
  three-argument overload must fail.

Support grant DELETE/TRUNCATE always raises `SUPPORT_GRANT_IMMUTABLE`. Support event UPDATE/DELETE/TRUNCATE always raises `SUPPORT_EVENT_IMMUTABLE`. The FK is `ON DELETE CASCADE` as a final defense and cannot turn a support membership into an untagged ordinary row.

- [ ] **Step 6: Run GREEN, update wiki, and commit**

Document DB-time resolution, trigger invariants, and indefinite retention in the data wiki; append log evidence.

```bash
pnpm exec prisma migrate deploy
pnpm run db:generate
pnpm exec vitest run tests/security/support-access-schema.test.ts tests/security/support-access-db-resolver.test.ts tests/security/support-access-trigger.test.ts
git add prisma/schema.prisma prisma/migrations/20260712003000_support_access_capability/migration.sql lib/workspaces/active-membership.ts tests/security/support-access-schema.test.ts tests/security/support-access-db-resolver.test.ts tests/security/support-access-trigger.test.ts wiki/Document\ Knowledge\ Model.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(security): add DB-time support capability"
```

Expected: resolver/trigger/retention/wiki gates PASS.

### Task 7: Enforce support expiry across every authorization path

**Files:**
- Create: `lib/security/support-access.ts`
- Create: `scripts/security/support-access.ts`
- Create: `tests/security/support-access.test.ts`
- Create: `tests/security/support-access-command.test.ts`
- Create: `tests/security/support-access-resolver-contract.test.ts`
- Modify: `lib/workspaces/page-query.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `lib/workspaces/management-service.ts`
- Modify: `lib/workspaces/retention-service.ts`
- Modify: `lib/auth/provisioning.ts`
- Modify: `lib/documents/service.ts`
- Modify: `lib/folders/service.ts`
- Modify: `lib/comments/service.ts`
- Modify: `lib/wiki-links/service.ts`
- Modify: `lib/attachments/service.ts`
- Modify: `lib/rag/ask.ts`
- Modify: `lib/rag/workspace-chat.ts`
- Modify: `package.json`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Produces: root-only `grantSupportAccess`, `revokeSupportAccess`, `expireAllSupportAccess`, and canonical resolver use on every workspace/resource authorization path.

- [ ] **Step 1: Write failing lifecycle and resolver-surface tests**

Grant tests require immutable IDs, root gate, 12–500 character reason/reference, DB expiry no more than 60 minutes, and only EDITOR/VIEWER.

The resolver-contract fixture leaves an expired `endedAt=null` support membership unswept and probes:

- workspace page and readable workspace list
- workspace rename/retention
- auth redirect/provisioning lookup
- document/folder/comment/wiki-link/attachment
- Ask AI and Workspace AI

Every probe returns not-found/forbidden before mutation, file read, or provider call. Active support and ordinary explicit membership still pass.

The source test enumerates the files above and rejects raw authorization patterns:

```ts
expect(source).not.toMatch(/members:\s*\{\s*some:\s*\{\s*userId:/);
expect(source).not.toMatch(/members:\s*\{\s*where:\s*\{\s*userId:/);
```

Allowed raw `workspaceMember` use is limited to named provisioning/support/cleanup mutation modules, never read authorization.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/security/support-access.test.ts tests/security/support-access-command.test.ts tests/security/support-access-resolver-contract.test.ts`

Expected: FAIL because lifecycle service and resolver refactor are absent.

- [ ] **Step 3: Implement grant with DB time and DB trigger enforcement**

The grant transaction uses one order shared with Leaf 5 consumers:

1. takes an advisory lock for workspace/user;
2. locks active Workspace, then the matching WorkspaceMember predicate/row, then any
   SupportAccessGrant rows in stable ID order;
3. expires any stale grant for that pair through the lifecycle helper;
4. rejects an ordinary existing membership;
5. asks DB for post-lock `statement_timestamp()` in a new statement and validates expiry interval
   `0 < duration <= 60 minutes`;
6. creates grant, linked membership, and GRANTED support event;
7. does not append a deny journal event because grant increases access.

`allowedRoles = new Set(["EDITOR","VIEWER"])`; ADMIN and OWNER fail in service and DB.

- [ ] **Step 4: Implement revoke/expiry with same-transaction journal**

Revoke and sweep first read only immutable IDs as unlocked hints, then acquire the
workspace advisory lock and lock Workspace → linked WorkspaceMember →
SupportAccessGrant in that order, re-read every identity/state, and only then mutate.
Multi-grant sweeps sort by workspace/member/grant ID and use the same order. They:

- claim `endedAt` using post-lock DB `statement_timestamp()` in the mutation statement;
- delete linked membership;
- increment target `User.sessionVersion`;
- append support event;
- append `SUPPORT_ACCESS_REVOKED` or `SUPPORT_ACCESS_EXPIRED` with `subjectType:"SUPPORT_GRANT"`, the immutable grant ID as subjectId, a deterministic derived operation UUID, and exact payload `{stateCode:kind,stateVersion:1}`;
- commit atomically.

Natural expiry is already denied by DB resolver before sweep. Session bump and row deletion are defense in depth.

- [ ] **Step 5: Refactor every authorization path**

Resolve workspace ID under active/archive rules, then call `resolveActiveWorkspaceMembership` before loading protected content. No service accepts a caller-supplied role or cached support membership. Standard membership update/delete first selects `supportAccessGrantId` and throws `SUPPORT_MEMBERSHIP_MUTATION_FORBIDDEN` when non-null.

Remove support expiry mutation from `getCurrentUser`; authentication is not the authorization boundary.

- [ ] **Step 6: Implement root-only command**

Modes:

- `--grant` with root-owned protected input
- `--revoke` with grant/operation IDs
- `--sweep` with operation UUID prefix

Grant/revoke require `MUNJIB_BREAK_GLASS_SUPPORT_ENABLED=true`; no Web/Compose default exposes it. Output is only `SUPPORT_GRANT_OK`, `SUPPORT_REVOKE_OK`, or `SUPPORT_SWEEP_OK`.

- [ ] **Step 7: Run GREEN, update the durable wiki evidence, and commit through every gate**

```bash
pnpm exec vitest run tests/security/support-access.test.ts tests/security/support-access-command.test.ts tests/security/support-access-resolver-contract.test.ts tests/security/journal.test.ts
```

Document resolver authority, role ceiling, root command, and defense-in-depth sweep; append log evidence. Run:

```bash
git add lib/security/support-access.ts scripts/security/support-access.ts tests/security/support-access.test.ts tests/security/support-access-command.test.ts tests/security/support-access-resolver-contract.test.ts lib/workspaces/page-query.ts 'app/workspaces/[workspaceSlug]/page.tsx' lib/workspaces/management-service.ts lib/workspaces/retention-service.ts lib/auth/provisioning.ts lib/documents/service.ts lib/folders/service.ts lib/comments/service.ts lib/wiki-links/service.ts lib/attachments/service.ts lib/rag/ask.ts lib/rag/workspace-chat.ts package.json wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(security): enforce expiring support access"
```

Expected: lifecycle, raw-query contract, all protected surfaces, journal, wiki gates PASS.

### Task 8: Apply immutable-ID launch membership cleanup with journaled denial

**Files:**
- Create: `lib/security/launch-membership-cleanup.ts`
- Create: `lib/security/operator-report.ts`
- Create: `scripts/security/cleanup-launch-memberships.ts`
- Create: `tests/security/launch-membership-cleanup.test.ts`
- Create: `tests/security/operator-report.test.ts`
- Create: `tests/security/launch-membership-cleanup-command.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: immutable administrator/Trial IDs, reviewed membership-ID allowlist, mode `dry-run|apply`, `VerifiedLeaf2Dependencies`, `VerifiedWaveHalfGate`, and operation UUID namespace.
- Produces: deterministic redacted report and journaled removal transaction.

- [ ] **Step 1: Write failing dry-run/apply tests**

Tests assert:

- exact two target users and distinct IDs
- administrator remains auth-enabled
- Trial is auth-disabled
- dry-run no mutation/journal
- apply without both branded gates rejected
- allowlisted membership preserved
- unauthorized membership removed only by ID
- each removal has `WORKSPACE_MEMBERSHIP_REVOKED` in same transaction
- affected user sessionVersion increments once
- crash before journal append rolls back membership deletion
- retry operation UUID is idempotent
- report contains counts/stable categories but no emails/names

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/security/launch-membership-cleanup.test.ts tests/security/operator-report.test.ts tests/security/launch-membership-cleanup-command.test.ts`

Expected: FAIL because cleanup service/report/command do not exist.

- [ ] **Step 3: Implement deterministic dry-run**

Inventory only memberships belonging to immutable target IDs. Sort by membership ID. Classify `preserve-reviewed`, `remove-unauthorized`, `support-managed`, and `already-absent`. Support-managed rows are not handled by launch cleanup.

- [ ] **Step 4: Implement same-transaction apply**

For each reviewed removal:

1. lock membership by immutable ID;
2. recheck target user and allowlist;
3. reject support-linked row;
4. delete with `deleteMany({id,userId})`;
5. append `WORKSPACE_MEMBERSHIP_REVOKED` with `subjectType:"WORKSPACE_MEMBERSHIP"`, the immutable membership row/key only in `subjectId`, and exact payload `{stateCode:"WORKSPACE_MEMBERSHIP_REVOKED",stateVersion:1}`;
6. increment each affected user's sessionVersion once.

Any append/update failure rolls back every change in the transaction.

- [ ] **Step 5: Implement protected root command**

The command reads one root-owned bounded input file, verifies both gates, runs dry-run or apply, unlinks the input only after success, and writes a redacted report to a root-owned local path. GitHub-visible output contains only stable status.

- [ ] **Step 6: Run GREEN, update the durable wiki evidence, and commit through every gate**

```bash
pnpm exec vitest run tests/security/launch-membership-cleanup.test.ts tests/security/operator-report.test.ts tests/security/launch-membership-cleanup-command.test.ts
if rg -q '@example\\.(com|test)' tests/security/operator-report.test.ts; then exit 1; fi
```

Document immutable-ID cleanup and journal rollback semantics; append log evidence. Run:

```bash
git add lib/security/launch-membership-cleanup.ts lib/security/operator-report.ts scripts/security/cleanup-launch-memberships.ts tests/security/launch-membership-cleanup.test.ts tests/security/operator-report.test.ts tests/security/launch-membership-cleanup-command.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "fix(security): journal launch access cleanup"
```

Expected: cleanup/crash/idempotency/privacy/wiki gates PASS.

### Task 9: Prove replay, history preservation, and deny-only restoration

**Files:**
- Create: `lib/security/journal-replay.ts`
- Create: `tests/security/journal-replay-reducers.test.ts`
- Create: `tests/security/trial-history-isolation.test.ts`
- Create: `tests/security/security-journal-replay-drill.test.ts`
- Create: `tests/security/leaf2-cross-contract.test.ts`
- Create: `tests/wiki/trial-isolation-docs.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/Document Knowledge Model.md`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: final production-like database snapshot, signed encrypted exports, and all Leaf 2 deny operations.
- Produces: replay oracle required before cleanup completion and cross-leaf journal contract.

- [ ] **Step 1: Write failing history/replay/cross-contract tests**

Tests verify:

- Trial authored history and Account identity remain
- Trial password/OAuth/session authorization is unusable
- administrator password and exact linked Google remain usable
- no unauthorized membership remains
- expired support row cannot authorize before sweep
- replayed chain is gapless from genesis and KMS signature/envelope binding passes
- replay re-applies Trial authDisabledAt, credential invalidation, all-session revocation,
  and membership revocations idempotently before any cleanup-complete result
- a bundle containing exactly the four events emitted by `disableTrialIdentity()` has no
  missing reducer before Leaf 8 exists; a later reducer map that duplicates either
  Leaf 2-owned auth kind fails the cross-contract test
- all 26 canonical journal kinds, kind-to-subject mapping, immutable replay-target rules, exact `@/lib/security/journal` exports, JSON-safe event parser, SQL/TS binary hash vectors, anchored genesis, replay dispatch, deterministic operation-ID helper, exact two-key payload, byte cap, and sensitive-key denial match dependent plans
- journal/grant/event tables have no delete path

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/security/journal-replay-reducers.test.ts tests/security/trial-history-isolation.test.ts tests/security/security-journal-replay-drill.test.ts tests/security/leaf2-cross-contract.test.ts tests/wiki/trial-isolation-docs.test.ts`

Expected: docs and replay contracts FAIL until final durable knowledge is written.

- [ ] **Step 3: Implement Leaf 2's exact restore-reducer map**

Create `leaf2JournalReplayReducers` as a `satisfies` map with exactly
`AUTH_USER_DISABLED`, `AUTH_CREDENTIAL_INVALIDATED`,
`AUTH_USER_SESSIONS_REVOKED`, `TRIAL_IDENTITY_QUARANTINED`,
`SUPPORT_ACCESS_REVOKED`, `SUPPORT_ACCESS_EXPIRED`,
`ORGANIZATION_MEMBERSHIP_REVOKED`, and `WORKSPACE_MEMBERSHIP_REVOKED`. The credential
handler removes restored password/reset/verification capability for the immutable User;
the all-session handler deletes restored adapter sessions and advances only the
restore-side invalidation minimum. These two reducers are permanent Leaf 2 exports;
Leaf 8 may invoke them while adding disjoint per-Account/per-session-registry reducers,
but may not publish duplicate map keys. Each handler requires the branded restore
context, exact-validates subject/payload again, locks the immutable target, and
idempotently preserves or reduces access. It never re-creates a missing row, assigns a
role, appends an event, or imports an append/checkpoint mutation. Tests use a DB role
with no journal write privilege, dispatch the exact Task 4 event bundle before cleanup,
and source-scan implementation and generated SQL.

- [ ] **Step 4: Run the outbound-isolated replay drill**

Restore the encrypted Phase A epoch with a new signing secret and no outbound network. Apply current migrations, verify/export chain from genesis, replay deny events, then assert:

- restored sessions/OAuth tokens unusable
- Trial authDisabledAt restored
- removed memberships not revived
- support revoke/expiry state preserved
- journal tail equals signed export tail
- source/environment/envelope SHA matches

Record RPO/RTO and artifact digests locally only.

- [ ] **Step 5: Complete wiki and run GREEN**

Update all four wiki pages with exact journal, resolver, Trial/admin, cleanup, exporter, replay, and rollback contracts; update index and log.

```bash
pnpm exec vitest run tests/security/journal-replay-reducers.test.ts tests/security/trial-history-isolation.test.ts tests/security/security-journal-replay-drill.test.ts tests/security/leaf2-cross-contract.test.ts tests/wiki/trial-isolation-docs.test.ts
git add lib/security/journal-replay.ts tests/security/journal-replay-reducers.test.ts tests/security/trial-history-isolation.test.ts tests/security/security-journal-replay-drill.test.ts tests/security/leaf2-cross-contract.test.ts tests/wiki/trial-isolation-docs.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/Document\ Knowledge\ Model.md wiki/CI\ CD\ And\ Monitoring\ Workflow.md wiki/index.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "test(security): prove Trial isolation replay"
```

Expected: replay/history/cross-plan/wiki gates PASS.

### Task 10: Roll out Leaf 2, review the PR, and hand off the journal

**Files:**
- Create: `tests/security/trial-isolation-rollout-contract.test.ts`
- Create: `deploy/security/capabilities/security-journal-auth-tombstones.json`
- Create: `tests/security/security-journal-auth-tombstones-capability.test.ts`
- Modify: `deploy/security/protected-artifact-owners.json`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: accepted Tasks 1–9, exact image digest, protected identity IDs, pinned Phase A recovery envelope, journal exporter health, and replay result.
- Produces: deployment/rollback checklist and the stable journal interface for Leaves 5–11 and 14.

- [ ] **Step 1: Write the failing rollout and final capability contracts**

The test requires the design/wiki to state:

- Leaf 1 and Leaf 13 first
- journal before disable/cleanup
- pinned trust and exporter before apply
- admin auth preservation
- Trial durable disable
- DB-time support resolver
- no journal/grant/event deletion
- rollback cannot clear tombstones or restore memberships
- Leaf 2 activates only its reserved auth slot at version 1, while every Leaf 1 auth
  core artifact remains byte-identical and owned by `auth-runtime-fail-closed`

Write `tests/security/security-journal-auth-tombstones-capability.test.ts` only now,
after every evidence path named below exists. It requires the fragment to have exactly
the canonical six keys, the exact ordered dependency/evidence arrays below, matching
candidate hashes for every ACTIVE Leaf 2-only core entry, and the sole Leaf 1-created
`lib/auth/downstream/leaf2.ts` reservation transition from version 0 to version 1. It
rejects a shared schema, package/lock, Compose, route, service aggregate, or Leaf 1 core
as a Leaf 2 whole-file owner.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
pnpm exec vitest run tests/security/trial-isolation-rollout-contract.test.ts tests/security/security-journal-auth-tombstones-capability.test.ts --reporter=dot
```

Expected: FAIL because the exact rollout handoff, canonical fragment, ACTIVE owner
entries, and reserved-slot transition do not yet exist.

- [ ] **Step 3: Finalize the canonical Leaf 2 capability, owner map, and rollout handoff**

Create `deploy/security/capabilities/security-journal-auth-tombstones.json` with exactly
these six keys and arrays:

```json
{
  "format": "munjib-security-capability-v1",
  "id": "security-journal-auth-tombstones",
  "version": 1,
  "leaf": 2,
  "requires": [
    "auth-runtime-fail-closed@1",
    "immutable-private-runtime@1"
  ],
  "evidenceTests": [
    "tests/security/leaf-dependencies.test.ts",
    "tests/security/journal-schema.test.ts",
    "tests/security/journal.test.ts",
    "tests/security/journal-payload-contract.test.ts",
    "tests/security/journal-external-event.test.ts",
    "tests/security/journal-hash-vectors.test.ts",
    "tests/security/journal-genesis.test.ts",
    "tests/security/journal-roles.test.ts",
    "tests/security/journal-extension-prereqs.test.ts",
    "tests/security/journal-export-checkpoint.test.ts",
    "tests/security/security-journal-capability.test.ts",
    "tests/security/security-journal-bundle.test.ts",
    "tests/security/operator-files.test.ts",
    "tests/security/systemd-credential-files.test.ts",
    "tests/security/systemd-credential-files.integration.test.ts",
    "tests/security/wave-half-gate.test.ts",
    "tests/security/wave-half-b-gate.test.ts",
    "tests/security/wave-half-b-restore-orchestrator.test.ts",
    "tests/security/journal-export.test.ts",
    "tests/security/journal-export-automation.test.ts",
    "tests/security/journal-replay.test.ts",
    "tests/security/journal-restore-candidate-genesis.test.ts",
    "tests/security/security-journal-replay-drill.test.ts",
    "tests/security/trial-disable.test.ts",
    "tests/auth/trial-disabled-auth.test.ts",
    "tests/auth/config.test.ts",
    "tests/components/login-form.test.tsx",
    "tests/workspaces/membership-provisioning.test.ts",
    "tests/workspaces/management-service.test.ts",
    "tests/auth/provisioning.test.ts",
    "tests/security/support-access-schema.test.ts",
    "tests/security/support-access-db-resolver.test.ts",
    "tests/security/support-access-trigger.test.ts",
    "tests/security/support-access.test.ts",
    "tests/security/support-access-command.test.ts",
    "tests/security/support-access-resolver-contract.test.ts",
    "tests/security/launch-membership-cleanup.test.ts",
    "tests/security/launch-membership-cleanup-command.test.ts",
    "tests/security/operator-report.test.ts",
    "tests/security/journal-replay-reducers.test.ts",
    "tests/security/trial-history-isolation.test.ts",
    "tests/security/leaf2-cross-contract.test.ts",
    "tests/security/trial-isolation-rollout-contract.test.ts",
    "tests/security/security-journal-auth-tombstones-capability.test.ts"
  ]
}
```

Activate exactly these Leaf 2-only `FULL_PATH` owner entries at version 1 with exact
candidate SHA-256 values:

```json
[
  "prisma/migrations/20260712000000_security_journal_and_auth_tombstones/migration.sql",
  "prisma/migrations/20260712003000_support_access_capability/migration.sql",
  "deploy/postgres/security-journal-prereqs.sql",
  "deploy/postgres/security-journal-acl.sql",
  "deploy/security/security-journal-capability-contract-v1.json",
  "lib/security/leaf-dependencies.ts",
  "lib/security/journal.ts",
  "lib/security/journal-capability.ts",
  "lib/security/operator-files.ts",
  "lib/security/systemd-credential-files.ts",
  "lib/security/wave-half-gate.ts",
  "lib/security/reserved-identities.ts",
  "lib/security/trial-disable.ts",
  "lib/security/support-access.ts",
  "lib/security/launch-membership-cleanup.ts",
  "lib/security/operator-report.ts",
  "lib/security/journal-replay.ts",
  "lib/auth/durable-auth-state.ts",
  "lib/auth/downstream/leaf2.ts",
  "lib/workspaces/active-membership.ts",
  "lib/workspaces/membership-provisioning.ts"
]
```

Every entry has `ownerCapabilityId: "security-journal-auth-tombstones"`, `version: 1`,
and `state: "ACTIVE"`. The downstream slot must be a verified direct `0 -> 1`
transition from the Leaf 1 baseline; every other entry is an absent-to-ACTIVE Leaf 2
core file. Shared `prisma/schema.prisma`, `package.json`, lockfiles, host-helper
manifest, application service/route files, and deployment aggregates are covered by
candidate evidence tests and never appear in this owner set.

Add the required assertions to the public-safe CI/CD wiki and rollout-contract fixture,
add index navigation, and append a dated wiki/log.md entry citing the rollout-contract
test, exact journal interface, dependency gates, and rollback rules. The restricted
design remains local-only and must not be read, changed, or staged on this leaf branch.
Do not add generic status prose; name the exact files, commands, artifacts, and denial
state retained by rollback.

- [ ] **Step 4: Run the focused contracts to GREEN**

```bash
pnpm exec vitest run tests/security/trial-isolation-rollout-contract.test.ts tests/security/security-journal-auth-tombstones-capability.test.ts --reporter=dot
```

Expected: PASS with the exact six-key fragment, exhaustive evidence list, Leaf 2-only
ACTIVE set, single reserved-slot activation, and byte-identical Leaf 1 core.

- [ ] **Step 5: Run full GREEN verification**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm exec prisma validate
pnpm security:journal-preflight
if rg -q '(BEGIN PRIVATE KEY|MUNJIB_.*SECRET=.|mjtrial@|mjadmin@)' docs/superpowers/plans/2026-07-11-security-trial-isolation.md wiki; then exit 1; fi
```

Expected: all tests/type/schema/role preflight PASS and quiet scan exits `0`.

- [ ] **Step 6: Commit the final capability and rollout knowledge through every staged wiki gate**

Run:

```bash
git add deploy/security/capabilities/security-journal-auth-tombstones.json deploy/security/protected-artifact-owners.json tests/security/security-journal-auth-tombstones-capability.test.ts tests/security/trial-isolation-rollout-contract.test.ts wiki/CI\ CD\ And\ Monitoring\ Workflow.md wiki/index.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "docs(security): hand off Trial isolation journal"
```

Expected: rollout contract, full verification, concrete wiki/log delta, and every gate PASS.

- [ ] **Step 7: Push, open PR, and inspect reviews for at least five minutes**

Run:

```bash
branch=$(git branch --show-current)
git push -u origin "$branch"
gh pr create --draft --title "security: isolate Trial access and add journal authority" --body "Implements the reviewed Leaf 2 plan with fail-closed dependency gates, append-only journal authority, durable Trial disable, DB-time support access, replay evidence, and rollback constraints."
gh pr ready
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
owner=$(printf '%s' "$repo" | cut -d/ -f1)
name=$(printf '%s' "$repo" | cut -d/ -f2-)
number=$(gh pr view --json number --jq .number)
for attempt in 1 2 3 4 5 6; do
  gh pr checks
  gh pr view --json reviewDecision,reviews,statusCheckRollup
  gh api graphql -f owner="$owner" -f name="$name" -F number="$number" -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved comments(first:20){nodes{author{login}path line body}}}}}}}' --jq '.data.repository.pullRequest.reviewThreads.nodes | map(select(.isResolved == false))'
  sleep 50
done
```

Expected: at least five minutes elapse, required checks pass, and the final unresolved-thread result is `[]`. Fix actionable feedback on the same branch, rerun affected tests and the exact wiki gates, commit/push, and repeat. Do not mark complete with a failing check or unresolved actionable thread.

- [ ] **Step 8: Execute production rollout**

Order:

1. verify deployed Leaf 1 and Leaf 13 exact digest;
2. verify Leaf 13 DB-role capability and its pre-created NOLOGIN journal roles/OIDs;
3. verify the pinned Phase A recovery envelope and one-use Phase B nonce;
4. run the fixed root-only extension prerequisite, then the journal/auth tombstone migration as migrator/schema owner and root-finalize journal ownership/ACLs;
5. initialize DB genesis once from the verified envelope, verify anchored hash, then grant app append/exporter read;
6. start exporter and verify encrypted KMS-signed anchored-genesis bundle plus TS/SQL hash vectors;
7. apply support migration and deploy exact Web/tools digest;
8. durably disable Trial, verify administrator authentication, then run reviewed cleanup/support sweep;
9. run outbound-isolated replay against the same envelope/genesis before declaring cleanup complete;
10. monitor journal continuity/export lag, DB role invariants, and auth denial codes without sensitive values.

Rollback keeps current auth secret, Trial `authDisabledAt`, sessionVersion increments, journal chain/export, removed memberships, and support ended state. No rollback restores credentials, deletes journal history, or selects an image lacking the DB-time resolver.
