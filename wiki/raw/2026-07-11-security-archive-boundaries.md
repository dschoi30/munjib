# Security Archive Boundaries Implementation Plan

**Tracking:** Issue #159 · remote branch `issue-159-security-archive-boundaries`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce active workspace/document state consistently across reads, mutations, attachments, comments, links, search/graph/RAG, history, and retention operations.

**Architecture:** Introduce one active-resource resolver layer plus actor-scoped archive serialization and deterministic PostgreSQL locks, then move mutations so authorization and active-state checks happen inside the same transaction. Read paths consume the same non-enumerating two-argument DB-time resolver. Archive operations stamp one `archiveOperationId`, append deny-only Issue 2 journal events atomically, and recovery restores only same-operation rows under the shared lock order. Destructive purge uses a retained logical-deny/journal-fence ledger, detached signed remote-high-water verification, and a separately authorized idempotent physical worker; Leaf 5 owns compile-safe fail-closed ports while Leaf 14 later supplies fresh signed evidence and Issue 9/11 composition without a reverse dependency.

**Tech Stack:** Next.js App Router, Prisma 6, PostgreSQL row locks, TypeScript, Vitest with the repository Prisma integration fixture.

## Global Constraints

- Dependency order is exact: Issue 5 rebases on merged Issue 2 and Leaf 13B. Issues 6 and 11 consume Issue 5 only after this branch merges. Issue 5 must compile, test, and deploy independently and must not import Issue 9, Issue 11, or Issue 14.
- Active-state failure is fail-closed and non-enumerating: normal access to archived or purged workspaces/documents returns the existing workspace/document/attachment not-found code.
- Mutation transactions lock and re-check active workspace/document state. Archive and recovery use one order: actor-scoped archive advisory lock → Workspace → WorkspaceMember → optional SupportAccessGrant → Folder rows by immutable id → Document rows by immutable id → derived/attachment rows by immutable id. Join-level `FOR UPDATE OF` is not accepted as proof of cross-table order. A stale tab cannot update, move, archive, restore a version, comment, upload, create a broken-link target, or run AI after archive wins the race.
- Archived workspaces, folders, and documents are immutable and excluded from page DTOs, links/backlinks, graph, search, RAG indexing/retrieval, AI, attachment reads/uploads, comments, tags/properties, and history.
- Only `OWNER|ADMIN` through `canManageWorkspace` may change retention policy.
- Recovery is a separate reason-bearing manager/operator service; no normal read/write path implicitly clears `archivedAt` or changes `ARCHIVED` to `ACTIVE`. Recovery is access-increasing and therefore never appends to the deny-only Issue 2 journal.
- Every workspace/document/folder archive and every logical document purge appends an Issue 2 `appendSecurityJournalEvent()` row in the same business transaction. Each event id is `deriveSecurityJournalOperationId({ rootOperationId, kind, subjectType, subjectId })`; the persisted/provided root UUID makes retries deterministic and no journal event can grant access. Archive timestamps, purge cutoffs, ledger transitions, and authorization freshness use post-lock PostgreSQL `statement_timestamp()` only; application `Date`, caller time, or a test clock cannot author a security decision.
- Issue 5 defines `PurgeAuthorization`, `PurgeBatchCandidate`, `PurgePhysicalCandidate`, `PurgeLeafReadiness`, `DestructivePurgeReadiness`, `createCompositePurgeReadiness()`, and `failClosedPurgeReadiness`. Dry-run never calls readiness. Destructive purge is a durable three-stage protocol: (1) a locked SERIALIZABLE logical-deny transaction writes immutable operation/item ledger rows and exact journal sequence/hash fences without deleting rows or bytes; (2) after all transaction and host locks are released, a later one-shot verifier exact-fetches a signed remote journal high-water and atomically marks only covered ledger items `HIGH_WATER_VERIFIED`; (3) a separately authorized storage worker idempotently removes physical rows/bytes and marks retained ledger items `PHYSICAL_COMPLETE`. No process waits or polls while holding `/run/lock/munjib-security-state.lock`. Both logical and physical authorization default fail closed until Issue 14 injects the production composite with fresh signed restore evidence and live Issue 9/11 providers; prepared authorization, cached evidence, caller-supplied environment/digest/time, or a Boolean environment variable is not authorization.
- Leaf 5 owns capability `active-resource-boundaries`. It covers active-resource resolvers/locks, archive/recovery provenance, the retained purge-operation ledger, logical/physical purge workers, retention and purge-readiness ports, and the exact migration. It creates exact no-op/fail-closed version-0 seams at `lib/authorization/downstream/leaf6-document-access.ts` for `document-acl-closure` and `lib/retention/downstream/leaf14-production-readiness.ts` for `encrypted-recovery-readiness`; the latter exports both logical and physical fail-closed authorizers from one reserved path. Leaf 5 may attest each baseline once but never owns or later changes either path. Leaf 13B binds it to the exact candidate; consumers cannot republish it.
- Every task follows RED -> GREEN -> an actual durable update to its named wiki page plus `wiki/log.md` -> `pnpm wiki:install-hooks`, staged `pnpm wiki:sync-plan --staged`, `pnpm wiki:manifest`, `pnpm wiki:lint`, and `pnpm wiki:sync-check --staged` -> commit. A no-op wiki delta is not sufficient.
- Export `leaf5JournalReplayReducers` for workspace/folder/document archive, document purge, and `AI_DERIVED_DATA_PURGED`; each handler is branded-restore-only, exact-target validating, idempotent, deny-only, and unable to append or mutate journal/checkpoint state.
- Secret/disclosure scans are non-printing predicates (`rg -q` inside an `if`). A ready PR is polled at intervals no longer than 60 seconds for at least five minutes and GraphQL `reviewThreads(first: 100) { nodes { isResolved } }` must report no unresolved actionable thread.
- This plan and detailed design remain local-only. Future remote commits must omit this file, the detailed spec, secrets, private content, raw provider responses, exact incident counts, identity evidence, and topology details.

---

## File Structure

- Create: `lib/authorization/active-resources.ts` — shared active workspace/document resolution, transaction-locked active actor resolution, and document ACL lookup.
- Create: `lib/authorization/downstream/leaf6-document-access.ts` — exact legacy document-access baseline reserved at version 0 for Leaf 6; `active-resources.ts` delegates to it from the first Leaf 5 release.
- Create: `lib/authorization/active-resource-locks.ts` — actor-scoped archive advisory lock plus deterministic workspace/folder/document mutation locks.
- Create: `tests/authorization/active-resources.test.ts` — active/archive/purge and lock behavior.
- Create: `tests/security/active-resource-downstream-extension-contract.test.ts` — exact slot hashes, owners, version-0 immutability, delegation, and core-owner boundary.
- Create: `tests/security/active-membership-consumers.test.ts` — cross-leaf source contract requiring Leaf 2's DB-time resolver on authorization paths.
- Modify: `prisma/schema.prisma`; create `prisma/migrations/20260712010000_active_resource_boundaries/migration.sql` and `tests/prisma/archive-operation-provenance-migration.test.ts` — per-operation recovery provenance.
- Modify: `lib/documents/service.ts` — perform create/update/move/archive/version restore/broken-link creation within active locked transactions.
- Modify: `lib/folders/service.ts` — perform folder mutations within active workspace/folder locks.
- Modify: `lib/workspaces/management-service.ts` — serialize workspace archive with other workspace mutations.
- Modify: `tests/documents/service.test.ts`, `tests/folders/service.test.ts`, `tests/workspaces/management-service.test.ts` — stale-tab and race regressions.
- Modify: `lib/attachments/service.ts`, `lib/comments/service.ts`, `lib/wiki-links/service.ts` — use common active read/write resolution.
- Modify: `lib/rag/ask.ts`, `lib/rag/workspace-chat.ts`, `lib/rag/index-document.ts` — active source checks for AI and indexing.
- Modify: `app/workspaces/[workspaceSlug]/page.tsx` — keep page/DTO reads active-only and use batch active access results.
- Create: `tests/security/archive-boundary-matrix.test.ts` — resource-by-state acceptance matrix.
- Modify: `lib/workspaces/retention-service.ts` — require manager and active workspace inside a lock.
- Create: `lib/retention/purge-readiness.ts` — compile-safe logical/physical readiness port, composite, and fail-closed defaults with no later-leaf imports.
- Create: `lib/retention/downstream/leaf14-production-readiness.ts` — fail-closed logical/physical production entrypoint baseline reserved at version 0 for Leaf 14; the CLI and storage worker import this one seam from day one while the readiness core never does.
- Create: `lib/documents/purge-operation-ledger.ts` — immutable identity/journal fence plus monotonic logical/high-water/physical state transitions.
- Create: `lib/documents/purge-physical.ts` and `lib/documents/purge-physical-cli.ts` — separately credentialed idempotent row/byte worker that cannot run before signed high-water coverage and fresh Leaf 14/9/11 authorization.
- Modify: `lib/documents/purge-archived.ts`, `lib/documents/purge-archived-cli.ts` — default dry-run and logical-deny-only execution; no physical delete occurs here.
- Create: `lib/archive/recovery.ts` — explicit manager recovery for one archive operation under parent/descendant locks.
- Create: `lib/archive/journal-replay.ts` and `tests/archive/journal-replay.test.ts` — exact Leaf 5 restore reducers, including derived chunk purge.
- Create: `deploy/security/capabilities/active-resource-boundaries.json` and `tests/security/active-resource-capability.test.ts` — leaf-owned fragment and protected-artifact contract.
- Modify: `deploy/security/protected-artifact-owners.json` — reserve the Leaf 6 and Leaf 14 seams with their exact baseline hashes, named future owners, and Leaf 5 as creator only.
- Test: `tests/workspaces/retention-service.test.ts`, `tests/documents/purge-archived-cli.test.ts`, `tests/documents/purge-operation-ledger.test.ts`, `tests/documents/purge-physical.test.ts`, `tests/retention/purge-readiness.test.ts`, `tests/archive/recovery.test.ts`.
- Maintain after disclosure review: `wiki/Auth And Permissions Workflow.md`, `wiki/Document Editing Workflow.md`, `wiki/RAG Process Workflow.md`, `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`.

### Task 1: Common Active Resource Resolvers and Locks

**Files:**
- Create: `lib/authorization/active-resources.ts`
- Create: `lib/authorization/downstream/leaf6-document-access.ts`
- Create: `lib/authorization/active-resource-locks.ts`
- Create: `tests/authorization/active-resources.test.ts`
- Create: `tests/security/active-membership-consumers.test.ts`
- Create: `tests/security/active-resource-downstream-extension-contract.test.ts`
- Modify: `deploy/security/protected-artifact-owners.json`

**Interfaces:**
- Consumes: a `Prisma.TransactionClient` or repository `prisma` client, actor id, workspace slug/id, and document id.
- Produces: `resolveActiveWorkspaceForActor()`, `resolveActiveWorkspaceForActorForUpdate()`, `resolveActiveDocumentForActor()`, `getDocumentAccessForActor()`, `lockActorArchiveBoundary()`, `lockWorkspaceBoundary()`, `lockFolderBoundaries()`, and `lockDocumentBoundary()`; Issues 6, 10, and 11 consume these exact exports. `getDocumentAccessForActor()` delegates through the separately protected Leaf 6 version-0 seam. Leaf 10 owns its separate fixed document-indexer capability verifier and may not add a second human-membership resolver.

- [ ] **Step 1: Write the failing resolver tests**

Create `tests/authorization/active-resources.test.ts`:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  resolveActiveDocumentForActor,
  resolveActiveWorkspaceForActor,
} from "@/lib/authorization/active-resources";
import { prisma } from "@/lib/db/client";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("active resource resolvers", () => {
  beforeEach(resetTestData);

  it("returns an active workspace membership", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const result = await resolveActiveWorkspaceForActor(prisma, {
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    });
    expect(result.workspace.id).toBe(fixture.workspace.id);
    expect(result.role).toBe("EDITOR");
  });

  it("maps archived and deleted workspaces to WORKSPACE_NOT_FOUND", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { archivedAt: new Date("2026-07-11T00:00:00.000Z") },
    });
    await expect(resolveActiveWorkspaceForActor(prisma, {
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    })).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  });

  it("maps archived and purged documents to DOCUMENT_NOT_FOUND", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        title: "Boundary",
        slug: "boundary",
        path: "/boundary",
        status: "ARCHIVED",
        archivedAt: new Date("2026-07-11T00:00:00.000Z"),
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    await expect(resolveActiveDocumentForActor(prisma, {
      documentId: document.id,
      actorId: fixture.user.id,
      access: "read",
    })).rejects.toThrow(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
    await prisma.document.delete({ where: { id: document.id } });
    await expect(resolveActiveDocumentForActor(prisma, {
      documentId: document.id,
      actorId: fixture.user.id,
      access: "read",
    })).rejects.toThrow(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  });
});
```

Create `tests/security/active-membership-consumers.test.ts` to source-scan
`active-resources.ts`: it must import/call `resolveActiveWorkspaceMembership` (or the
same canonical SQL function for slug disambiguation), and may not authorize through
Prisma `members.some`, filtered `members`, or direct
`workspaceMember.findUnique/findFirst`. The integration half creates an
expired-but-unswept support grant and proves workspace/document resolution returns the
existing non-enumerating not-found denial.

The same real-DB file starts RED cases for
`resolveActiveWorkspaceForActorForUpdate()`: archive, membership insertion/deletion,
role downgrade, support revoke/expiry, and a 48-hour application-clock skew are paused
at barriers while a SERIALIZABLE consumer resolves the actor. It must lock Workspace →
WorkspaceMember → optional SupportAccessGrant, then issue one new SQL statement whose
two-argument resolver result and `statement_timestamp()` are returned together. It must
return only the post-lock active membership id/role/database clock or retry/deny, never
stale authority. `pg_proc` and source tests reject every three-argument resolver or
caller-selected timestamp.

- [ ] **Step 2: Run the resolver tests to verify red**

Run: `pnpm exec vitest run tests/authorization/active-resources.test.ts tests/security/active-membership-consumers.test.ts tests/security/active-resource-downstream-extension-contract.test.ts --reporter=dot`

Expected: FAIL with unresolved imports for `active-resources`.

- [ ] **Step 3: Implement the shared resolver**

Create `lib/authorization/active-resources.ts`:

```ts
import { Prisma, type PrismaClient, type WorkspaceRole } from "@prisma/client";
import {
  assertCanReadDocument,
  assertCanWriteDocument,
} from "@/lib/permissions/document";
import {
  assertCanReadWorkspace,
  assertCanWriteWorkspace,
} from "@/lib/permissions/workspace";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { resolveActiveWorkspaceMembership } from "@/lib/workspaces/active-membership";
import { getLeaf6DocumentAccessForActor } from "@/lib/authorization/downstream/leaf6-document-access";

type ActiveResourceDb = Prisma.TransactionClient | PrismaClient;

export async function resolveActiveWorkspaceForActor(
  db: ActiveResourceDb,
  input: { workspaceSlug: string; actorId: string; access?: "read" | "write" },
) {
  const matches = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT workspace."id"
    FROM "Workspace" workspace
    CROSS JOIN LATERAL public.resolve_active_workspace_membership(
      workspace."id", ${input.actorId}
    ) active_membership
    WHERE workspace."slug" = ${input.workspaceSlug}
      AND workspace."archivedAt" IS NULL
    ORDER BY workspace."id" ASC
    LIMIT 2
  `);
  if (matches.length === 0) throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  if (matches.length > 1) throw new Error(SERVICE_ERROR_CODES.WORKSPACE_SLUG_AMBIGUOUS);
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: matches[0].id },
    include: { organization: true },
  });
  const membership = await resolveActiveWorkspaceMembership(db, {
    workspaceId: workspace.id,
    userId: input.actorId,
  });
  if (!membership) throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  const role = membership.role;
  assertCanReadWorkspace(role);
  if (input.access === "write") assertCanWriteWorkspace(role);
  return { workspace, role: role! };
}

export async function getDocumentAccessForActor(
  db: ActiveResourceDb,
  documentId: string,
  actorId: string,
) {
  return getLeaf6DocumentAccessForActor(db, { documentId, actorId });
}

export async function resolveActiveDocumentForActor(
  db: ActiveResourceDb,
  input: { documentId: string; actorId: string; access: "read" | "write" },
) {
  const document = await db.document.findFirst({
    where: {
      id: input.documentId,
      status: "ACTIVE",
      archivedAt: null,
      workspace: { archivedAt: null },
    },
    include: {
      workspace: {
        include: {
          organization: true,
        },
      },
    },
  });
  if (!document) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  const membership = await resolveActiveWorkspaceMembership(db, {
    workspaceId: document.workspaceId,
    userId: input.actorId,
  });
  if (!membership) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  const role = membership.role;
  assertCanReadWorkspace(role);
  const documentAccess = await getDocumentAccessForActor(db, document.id, input.actorId);
  const accessInput = {
    workspaceRole: role,
    explicitPermissionCount: documentAccess.explicitPermissionCount,
    userPermission: documentAccess.userPermission,
  };
  assertCanReadDocument(accessInput);
  if (input.access === "write") {
    assertCanWriteWorkspace(role);
    assertCanWriteDocument(accessInput);
  }
  return { document, workspace: document.workspace, role: role!, access: documentAccess };
}

export async function resolveActiveWorkspaceForActorForUpdate(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; actorId: string; access?: "read" | "write" },
) {
  const workspaces = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Workspace"
    WHERE "id" = ${input.workspaceId} AND "archivedAt" IS NULL
    FOR UPDATE
  `);
  if (workspaces.length !== 1) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }
  const memberships = await tx.$queryRaw<Array<{
    id: string;
    supportAccessGrantId: string | null;
  }>>(Prisma.sql`
    SELECT "id", "supportAccessGrantId" FROM "WorkspaceMember"
    WHERE "workspaceId" = ${input.workspaceId} AND "userId" = ${input.actorId}
    ORDER BY "id" ASC FOR UPDATE
  `);
  if (memberships.length !== 1) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }
  if (memberships[0].supportAccessGrantId) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "SupportAccessGrant"
      WHERE "id" = ${memberships[0].supportAccessGrantId}
      FOR UPDATE
    `);
  }
  const activeMemberships = await tx.$queryRaw<Array<{
    membershipId: string;
    role: WorkspaceRole;
    supportAccessGrantId: string | null;
    databaseNow: Date;
  }>>(Prisma.sql`
    SELECT membership_id AS "membershipId", role,
           support_access_grant_id AS "supportAccessGrantId",
           statement_timestamp() AS "databaseNow"
    FROM public.resolve_active_workspace_membership(
      ${input.workspaceId}, ${input.actorId}
    )
  `);
  if (activeMemberships.length > 1) throw new Error("ACTIVE_MEMBERSHIP_CARDINALITY");
  const membership = activeMemberships[0] ?? null;
  if (!membership || membership.membershipId !== memberships[0].id) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }
  assertCanReadWorkspace(membership.role);
  if (input.access === "write") assertCanWriteWorkspace(membership.role);
  const workspace = await tx.workspace.findUniqueOrThrow({
    where: { id: input.workspaceId },
    include: { organization: true },
  });
  return {
    workspace,
    membershipId: membership.membershipId,
    role: membership.role,
    databaseNow: membership.databaseNow,
  };
}
```

Put the legacy `Permission` count/user-level query removed from the wrapper above into
`lib/authorization/downstream/leaf6-document-access.ts` as
`getLeaf6DocumentAccessForActor(db, { documentId, actorId })`. Its return type is the
exact frozen `{ explicitPermissionCount, userPermission }` input expected by Leaf 5's
workspace/document policy. The slot imports no Leaf 6 implementation and exactly
preserves pre-ACL behavior. Record its exact hash in
`deploy/security/protected-artifact-owners.json` as version 0, state `RESERVED`, owner
`document-acl-closure`, and creator `active-resource-boundaries`. The source-contract
test proves Leaf 5 core delegates once, the baseline cannot change at version 0, and
the Leaf 5 capability does not claim the slot as its own artifact.

The transaction helper is the sole current-role linearization seam for consumers such
as Leaf 10. It requires a SERIALIZABLE caller, locks Workspace → WorkspaceMember →
optional SupportAccessGrant in that order, then uses a separate statement to call the
canonical two-argument active-membership resolver and obtain that statement's
`statement_timestamp()`. Predicate-lock race tests cover an
absent membership concurrently inserted, deletion, downgrade, support expiry/revoke,
and workspace archive; callers retry only serialization failures and never reuse a
pre-lock role or timestamp.

- [ ] **Step 4: Implement row locks**

Create `lib/authorization/active-resource-locks.ts`:

```ts
import { Prisma } from "@prisma/client";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

type LockDb = Prisma.TransactionClient;

export async function lockActorArchiveBoundary(
  tx: Prisma.TransactionClient,
  actorId: string,
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pg_catalog.concat('munjib-archive-actor-v1:', ${actorId}),
        0
      )
    )
  `);
}

export async function lockWorkspaceBoundary(db: LockDb, workspaceId: string) {
  const rows = await db.$queryRaw<Array<{ id: string; archivedAt: Date | null }>>(Prisma.sql`
    SELECT "id", "archivedAt"
    FROM "Workspace"
    WHERE "id" = ${workspaceId}
    FOR UPDATE
  `);
  if (!rows[0] || rows[0].archivedAt) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }
  return rows[0];
}

export async function lockFolderBoundaries(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  folderIds: readonly string[],
) {
  const ids = [...new Set(folderIds)].sort();
  if (ids.length === 0) return [];
  const rows = await tx.$queryRaw<Array<{
    id: string;
    archivedAt: Date | null;
    archiveOperationId: string | null;
  }>>(Prisma.sql`
    SELECT "id", "archivedAt", "archiveOperationId"
    FROM "Folder"
    WHERE "workspaceId" = ${workspaceId}
      AND "id" IN (${Prisma.join(ids)})
    ORDER BY "id" ASC
    FOR UPDATE
  `);
  if (rows.length !== ids.length) throw new Error(SERVICE_ERROR_CODES.FOLDER_NOT_FOUND);
  return rows;
}

export async function lockDocumentBoundary(
  db: LockDb,
  documentId: string,
  lockedWorkspaceId: string,
) {
  // The caller has already used resolveActiveWorkspaceForActorForUpdate(), which locks
  // Workspace → WorkspaceMember → optional SupportAccessGrant. This function takes only
  // the next Document lock and rechecks the immutable workspace identity.
  const rows = await db.$queryRaw<Array<{
    documentId: string;
    workspaceId: string;
    status: string;
    documentArchivedAt: Date | null;
  }>>(Prisma.sql`
    SELECT d."id" AS "documentId",
           d."workspaceId" AS "workspaceId",
           d."status"::text AS "status",
           d."archivedAt" AS "documentArchivedAt"
    FROM "Document" d
    WHERE d."id" = ${documentId}
      AND d."workspaceId" = ${lockedWorkspaceId}
    FOR UPDATE OF d
  `);
  const row = rows[0];
  if (
    !row ||
    row.status !== "ACTIVE" ||
    row.documentArchivedAt
  ) {
    throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  }
  return row;
}
```

`lockActorArchiveBoundary()` is required before every archive/recovery transaction that
can change an actor's fallback-workspace set. Hash collision only over-serializes; it
cannot weaken authorization. Tests run two simultaneous workspace archives for the same
actor and require one stable success plus one `WORKSPACE_ARCHIVE_LAST_ACTIVE`, with no
deadlock or raw serialization error escaping. All document/folder/workspace archive and
recovery tests source-scan against join-level multi-table row locks and assert the exact
advisory → Workspace → membership/grant → sorted Folder → sorted Document order.

- [ ] **Step 5: Run the resolver tests to verify green**

Run:

```bash
pnpm exec vitest run tests/authorization/active-resources.test.ts tests/security/active-membership-consumers.test.ts tests/security/active-resource-downstream-extension-contract.test.ts --reporter=dot
pnpm exec prisma validate
```

Expected: PASS and Prisma validation exits 0.

- [ ] **Step 6: Commit the resolver base**

```bash
pnpm wiki:install-hooks
git add lib/authorization/active-resources.ts lib/authorization/downstream/leaf6-document-access.ts lib/authorization/active-resource-locks.ts deploy/security/protected-artifact-owners.json tests/authorization/active-resources.test.ts tests/security/active-membership-consumers.test.ts tests/security/active-resource-downstream-extension-contract.test.ts wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: centralize active resource resolution"
```

Expected: commit succeeds and does not contain the local plan/spec.

### Task 2: Transactional Document, Folder, and Workspace Mutation Boundaries

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260712010000_active_resource_boundaries/migration.sql`
- Create: `tests/prisma/archive-operation-provenance-migration.test.ts`
- Modify: `lib/documents/service.ts`
- Modify: `lib/folders/service.ts`
- Modify: `lib/workspaces/management-service.ts`
- Modify: `tests/documents/service.test.ts`
- Modify: `tests/folders/service.test.ts`
- Modify: `tests/workspaces/management-service.test.ts`
- Modify: `tests/security/active-membership-consumers.test.ts`

**Interfaces:**
- Consumes: Task 1 locks/resolvers and Issue 2 `appendSecurityJournalEvent(tx, input)`.
- Produces: nullable `archiveOperationId` on `Workspace`, `Folder`, and `Document`; every archive uses one UUID for affected rows plus journal events; every mutation either completes while active under lock or returns the existing not-found code. No mutation relies on authorization loaded before its transaction.

- [ ] **Step 1: Add stale-tab and archive-race tests**

Extend the cross-leaf source/integration test before implementation: workspace archive
fallback selection must use Leaf 2's DB-time active resolver, and an expired-unswept
support membership cannot satisfy the last-active-workspace guard.

Add to `tests/documents/service.test.ts`:

```ts
it.each([
  ["update", async (documentId: string, actorId: string) => updateDocument({
    documentId, actorId, title: "Stale", contentMarkdown: "stale",
  })],
  ["move", async (documentId: string, actorId: string) => moveDocument({
    documentId, actorId, folderId: null,
  })],
  ["archive", async (documentId: string, actorId: string) => archiveDocument({
    documentId, actorId,
  })],
] as const)("rejects stale-tab %s after document archive", async (_name, mutate) => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const document = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title: "Race",
    contentMarkdown: "active",
  });
  await prisma.document.update({
    where: { id: document.id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  await expect(mutate(document.id, fixture.user.id)).rejects.toThrow(
    SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND,
  );
});

it("rejects a version restore when the document archived after the tab loaded", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const document = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title: "Version Race",
    contentMarkdown: "v1",
  });
  const version = await prisma.documentVersion.findFirstOrThrow({
    where: { documentId: document.id },
  });
  await prisma.document.update({
    where: { id: document.id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  await expect(restoreDocumentVersion({
    versionId: version.id,
    actorId: fixture.user.id,
  })).rejects.toThrow(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
});
```

Create `tests/prisma/archive-operation-provenance-migration.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("adds archive-operation provenance without rewriting active rows", async () => {
  const sql = await readFile(
    "prisma/migrations/20260712010000_active_resource_boundaries/migration.sql",
    "utf8",
  );
  expect(sql).toContain('ALTER TABLE "Workspace" ADD COLUMN "archiveOperationId" TEXT');
  expect(sql).toContain('ALTER TABLE "Folder" ADD COLUMN "archiveOperationId" TEXT');
  expect(sql).toContain('ALTER TABLE "Document" ADD COLUMN "archiveOperationId" TEXT');
  expect(sql).toContain('WHERE "archivedAt" IS NOT NULL');
  expect(sql).not.toMatch(/DELETE|TRUNCATE|DROP TABLE/i);
});
```

Add this complete race to `tests/workspaces/management-service.test.ts`; `deferred()` is the existing test helper `{ promise, resolve }`:

```ts
it("serializes workspace archive against a stale document update", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.OWNER);
  const fallback = await seedWorkspaceFixtureForUser(fixture.user.id, WorkspaceRole.OWNER);
  const document = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title: "Archive race",
    contentMarkdown: "before",
  });
  const locked = deferred<void>();
  const release = deferred<void>();
  const archiving = archiveWorkspace({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
  }, {
    afterBoundaryLock: async () => {
      locked.resolve();
      await release.promise;
    },
  });
  await locked.promise;
  let updateSettled = false;
  const updating = updateDocument({
    documentId: document.id,
    actorId: fixture.user.id,
    title: "must not commit",
    contentMarkdown: "after",
  }).finally(() => { updateSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(updateSettled).toBe(false);
  release.resolve();
  await expect(archiving).resolves.toMatchObject({
    archivedWorkspaceSlug: fixture.workspace.slug,
    fallbackWorkspaceSlug: fallback.workspace.slug,
  });
  await expect(updating).rejects.toThrow(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  await expect(prisma.document.findUniqueOrThrow({ where: { id: document.id } }))
    .resolves.toMatchObject({ title: "Archive race", contentMarkdown: "before" });
});
```

Add a dual-archive test for one actor with exactly two active workspaces. Pause both
calls before their first workspace row lock, release them together, and require the
actor-scoped advisory lock to serialize the fallback decision: exactly one archive
commits, the second returns `WORKSPACE_ARCHIVE_LAST_ACTIVE`, one workspace remains
active, and neither a deadlock nor raw Prisma serialization error escapes. Add a source
contract asserting archive/recovery code contains no application `new Date()` security
timestamp and no `FOR UPDATE OF` list spanning more than one relation.

Add archive journal assertions to document/folder/workspace tests: the business row and its `SecurityJournalEvent` share one `archiveOperationId`/`operationId`, every persisted `archivedAt` equals a post-lock DB statement timestamp, rollback removes both, and no archive path emits an access-increasing event kind.

- [ ] **Step 2: Run the mutation tests to verify red**

Run: `pnpm exec vitest run tests/prisma/archive-operation-provenance-migration.test.ts tests/documents/service.test.ts tests/folders/service.test.ts tests/workspaces/management-service.test.ts tests/security/active-membership-consumers.test.ts --reporter=dot`

Expected: FAIL because provenance columns are absent, `getDocumentMembership()` accepts archived documents, mutation transactions do not lock/re-resolve active state, and journal rows are not atomic with archives.

- [ ] **Step 3: Add archive-operation provenance and transactional document callers**

Add `archiveOperationId String?` plus `@@index([archiveOperationId])` to `Workspace`, `Folder`, and `Document`. Create `prisma/migrations/20260712010000_active_resource_boundaries/migration.sql`:

```sql
ALTER TABLE "Workspace" ADD COLUMN "archiveOperationId" TEXT;
ALTER TABLE "Folder" ADD COLUMN "archiveOperationId" TEXT;
ALTER TABLE "Document" ADD COLUMN "archiveOperationId" TEXT;

UPDATE "Workspace"
SET "archiveOperationId" = concat('legacy-workspace:', "id")
WHERE "archivedAt" IS NOT NULL AND "archiveOperationId" IS NULL;
UPDATE "Folder"
SET "archiveOperationId" = concat('legacy-folder:', "id")
WHERE "archivedAt" IS NOT NULL AND "archiveOperationId" IS NULL;
UPDATE "Document"
SET "archiveOperationId" = concat('legacy-document:', "id")
WHERE "archivedAt" IS NOT NULL AND "archiveOperationId" IS NULL;

CREATE INDEX "Workspace_archiveOperationId_idx" ON "Workspace"("archiveOperationId");
CREATE INDEX "Folder_archiveOperationId_idx" ON "Folder"("archiveOperationId");
CREATE INDEX "Document_archiveOperationId_idx" ON "Document"("archiveOperationId");
```

In `lib/documents/service.ts`, use this complete helper and call it from `updateDocument`, `moveDocument`, and `archiveDocument`:

```ts
async function withActiveDocumentWrite<T>(
  input: { documentId: string; actorId: string },
  operation: (
    tx: Prisma.TransactionClient,
    resolved: Awaited<ReturnType<typeof resolveActiveDocumentForActor>>,
  ) => Promise<T>,
  options: { archiveBoundary?: boolean } = {},
) {
  return prisma.$transaction(async (tx) => {
    if (options.archiveBoundary) {
      await lockActorArchiveBoundary(tx, input.actorId);
    }
    const [identity] = await tx.$queryRaw<Array<{ workspaceId: string }>>(Prisma.sql`
      SELECT "workspaceId" AS "workspaceId"
      FROM "Document" WHERE "id" = ${input.documentId}
    `);
    if (!identity) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
    const lockedActor = await resolveActiveWorkspaceForActorForUpdate(tx, {
      workspaceId: identity.workspaceId,
      actorId: input.actorId,
      access: "write",
    });
    await lockDocumentBoundary(tx, input.documentId, lockedActor.workspace.id);
    const resolved = await resolveActiveDocumentForActor(tx, {
      documentId: input.documentId,
      actorId: input.actorId,
      access: "write",
    });
    return operation(tx, resolved);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
```

For example, replace the update pre-read and outer transaction with:

```ts
const updatedDocument = await runWithDocumentSlugRetry(() =>
  withActiveDocumentWrite(input, async (tx, { document, workspace }) => {
    const slug = await nextAvailableDocumentSlug(
      tx,
      workspace.id,
      document.folderId,
      input.title,
      document.id,
    );
    const parentPath = await getParentFolderPath(tx, workspace.id, document.folderId);
    const updated = await tx.document.update({
      where: { id: document.id },
      data: {
        title: input.title,
        slug,
        path: buildChildPath(parentPath, slug),
        contentMarkdown: input.contentMarkdown,
        contentText: markdownToPlainText(input.contentMarkdown),
        updatedById: input.actorId,
      },
    });
    await tx.documentVersion.create({
      data: {
        documentId: updated.id,
        versionNumber: await nextVersionNumber(tx, updated.id),
        title: updated.title,
        contentMarkdown: updated.contentMarkdown,
        createdById: input.actorId,
        changeSummary: "Updated document",
      },
    });
    await reconcileDocumentLinks(tx, {
      workspaceId: workspace.id,
      sourceDocumentId: updated.id,
      contentMarkdown: updated.contentMarkdown,
    });
    await reconcileDocumentMetadata(tx, {
      workspaceId: workspace.id,
      documentId: updated.id,
      contentMarkdown: updated.contentMarkdown,
    });
    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "document.updated",
      resourceType: "document",
      resourceId: updated.id,
      metadata: { title: updated.title, previousTitle: document.title },
    });
    return updated;
  }),
);
```

For version restore, load only `{ id, documentId }`, then enter
`withActiveDocumentWrite({ documentId, actorId })` and reload the version in that
transaction. For broken-link creation, include `sourceDocumentId` in the hint lookup,
resolve its workspace id, call `resolveActiveWorkspaceForActorForUpdate()` first, then
`lockDocumentBoundary(tx, sourceDocumentId, lockedWorkspaceId)`, and finally require
`resolveActiveDocumentForActor(..., access: "write")` before creating the target.

Replace `archiveDocument()` completely; add `randomUUID` and Issue 2 journal imports:

```ts
export async function archiveDocument(input: { documentId: string; actorId: string }) {
  const archiveOperationId = randomUUID();
  return withActiveDocumentWrite(input, async (tx, { document, workspace }) => {
    const [clock] = await tx.$queryRaw<Array<{ databaseNow: Date }>>(Prisma.sql`
      SELECT statement_timestamp() AS "databaseNow"
    `);
    if (!clock) throw new Error("ACTIVE_RESOURCE_CLOCK_UNAVAILABLE");
    const archived = await tx.document.update({
      where: { id: document.id },
      data: {
        status: "ARCHIVED",
        archivedAt: clock.databaseNow,
        archiveOperationId,
        updatedById: input.actorId,
      },
    });
    await appendSecurityJournalEvent(tx, {
      kind: "DOCUMENT_ARCHIVED",
      subjectType: "DOCUMENT",
      subjectId: archived.id,
      operationId: deriveSecurityJournalOperationId({
        rootOperationId: archiveOperationId,
        kind: "DOCUMENT_ARCHIVED",
        subjectType: "DOCUMENT",
        subjectId: archived.id,
      }),
      payload: { stateCode: "DOCUMENT_ARCHIVED", stateVersion: 1 },
    });
    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "document.archived",
      resourceType: "document",
      resourceId: archived.id,
      metadata: { archiveOperationId },
    });
    return archived;
  }, { archiveBoundary: true });
}
```

- [ ] **Step 4: Implement complete folder/workspace archive callers under deterministic locks**

In `lib/folders/service.ts`, use one deterministic tree-lock helper for folder move/archive and later recovery:

```ts
export async function lockFolderTreeForUpdate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  rootFolderId: string,
  options: {
    allowArchivedRoot?: boolean;
    boundaryFolderIds?: readonly string[];
  } = {},
) {
  // The caller already holds Workspace. Discover without row locks, then acquire every
  // parent/root/descendant Folder lock in one immutable-id order before any Document.
  const discovered = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH RECURSIVE tree AS (
      SELECT "id" FROM "Folder"
      WHERE "id" = ${rootFolderId} AND "workspaceId" = ${workspaceId}
      UNION ALL
      SELECT child."id"
      FROM "Folder" child JOIN tree parent ON child."parentFolderId" = parent."id"
      WHERE child."workspaceId" = ${workspaceId}
    )
    SELECT "id" FROM tree ORDER BY "id" ASC
  `);
  if (discovered.length === 0) {
    throw new Error(SERVICE_ERROR_CODES.FOLDER_NOT_FOUND);
  }
  const treeIds = discovered.map(({ id }) => id);
  const lockIds = [...new Set([
    ...treeIds,
    ...(options.boundaryFolderIds ?? []),
  ])].sort();
  const lockedFolders = await lockFolderBoundaries(tx, workspaceId, lockIds);
  const treeIdSet = new Set(treeIds);
  const folders = lockedFolders.filter(({ id }) => treeIdSet.has(id));
  const root = folders.find(({ id }) => id === rootFolderId);
  if (!root || (!options.allowArchivedRoot && root.archivedAt !== null)) {
    throw new Error(SERVICE_ERROR_CODES.FOLDER_NOT_FOUND);
  }
  const documents = await tx.$queryRaw<Array<{
    id: string;
    folderId: string;
    status: string;
    archivedAt: Date | null;
    archiveOperationId: string | null;
  }>>(Prisma.sql`
    SELECT document."id", document."folderId", document."status"::text,
           document."archivedAt", document."archiveOperationId"
    FROM "Document" document
    WHERE document."workspaceId" = ${workspaceId}
      AND document."folderId" IN (${Prisma.join(folders.map(({ id }) => id))})
    ORDER BY document."id" ASC
    FOR UPDATE OF document
  `);
  return { folders, documents, boundaryFolders: lockedFolders };
}
```

`Prisma.join()` is called only after discovery proves both `treeIds` and `lockIds`
non-empty. Every caller takes the actor advisory and Workspace lock first. Recovery
passes its parent id through `boundaryFolderIds`, so parent/root/descendants are one
sorted Folder lock set rather than root-then-parent. Replace `archiveFolder()`
completely:

```ts
export async function archiveFolder(input: {
  workspaceSlug: string;
  folderId: string;
  actorId: string;
}) {
  const archiveOperationId = randomUUID();
  return prisma.$transaction(async (tx) => {
    await lockActorArchiveBoundary(tx, input.actorId);
    const initial = await resolveActiveWorkspaceForActor(tx, {
      workspaceSlug: input.workspaceSlug,
      actorId: input.actorId,
      access: "write",
    });
    const active = await resolveActiveWorkspaceForActorForUpdate(tx, {
      workspaceId: initial.workspace.id,
      actorId: input.actorId,
      access: "write",
    });
    const tree = await lockFolderTreeForUpdate(tx, active.workspace.id, input.folderId);
    const folderIds = tree.folders.filter(({ archivedAt }) => archivedAt === null).map(({ id }) => id);
    const documentIds = tree.documents
      .filter(({ status, archivedAt }) => status === "ACTIVE" && archivedAt === null)
      .map(({ id }) => id);
    const [clock] = await tx.$queryRaw<Array<{ databaseNow: Date }>>(Prisma.sql`
      SELECT statement_timestamp() AS "databaseNow"
    `);
    if (!clock) throw new Error("ACTIVE_RESOURCE_CLOCK_UNAVAILABLE");
    await tx.folder.updateMany({
      where: { id: { in: folderIds }, workspaceId: active.workspace.id, archivedAt: null },
      data: { archivedAt: clock.databaseNow, archiveOperationId },
    });
    await tx.document.updateMany({
      where: {
        id: { in: documentIds },
        workspaceId: active.workspace.id,
        status: "ACTIVE",
        archivedAt: null,
      },
      data: {
        status: "ARCHIVED",
        archivedAt: clock.databaseNow,
        archiveOperationId,
        updatedById: input.actorId,
      },
    });
    for (const folderId of folderIds) {
      await appendSecurityJournalEvent(tx, {
        kind: "FOLDER_ARCHIVED",
        subjectType: "FOLDER",
        subjectId: folderId,
        operationId: deriveSecurityJournalOperationId({
          rootOperationId: archiveOperationId,
          kind: "FOLDER_ARCHIVED",
          subjectType: "FOLDER",
          subjectId: folderId,
        }),
        payload: { stateCode: "FOLDER_ARCHIVED", stateVersion: 1 },
      });
    }
    for (const documentId of documentIds) {
      await appendSecurityJournalEvent(tx, {
        kind: "DOCUMENT_ARCHIVED",
        subjectType: "DOCUMENT",
        subjectId: documentId,
        operationId: deriveSecurityJournalOperationId({
          rootOperationId: archiveOperationId,
          kind: "DOCUMENT_ARCHIVED",
          subjectType: "DOCUMENT",
          subjectId: documentId,
        }),
        payload: { stateCode: "DOCUMENT_ARCHIVED", stateVersion: 1 },
      });
    }
    return { archiveOperationId, folderIds, documentIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
```

Use the same `lockWorkspaceBoundary()` plus active-folder reload in create/rename/move, and require the destination parent to remain active after it is locked. In `lib/workspaces/management-service.ts`, define the testable dependency and replace archive with:

```ts
type ArchiveWorkspaceDeps = { afterBoundaryLock?: () => Promise<void> };

export async function archiveWorkspace(
  input: { workspaceSlug: string; actorId: string },
  deps: ArchiveWorkspaceDeps = {},
) {
  const archiveOperationId = randomUUID();
  return prisma.$transaction(async (tx) => {
    await lockActorArchiveBoundary(tx, input.actorId);
    const initial = await resolveActiveWorkspaceForActor(tx, {
      workspaceSlug: input.workspaceSlug,
      actorId: input.actorId,
      access: "read",
    });
    const active = await resolveActiveWorkspaceForActorForUpdate(tx, {
      workspaceId: initial.workspace.id,
      actorId: input.actorId,
      access: "read",
    });
    await deps.afterBoundaryLock?.();
  assertCanManageWorkspace(active.role);
  const fallbackRows = await tx.$queryRaw<Array<{ slug: string }>>(Prisma.sql`
    SELECT workspace."slug"
    FROM "Workspace" workspace
    CROSS JOIN LATERAL public.resolve_active_workspace_membership(
      workspace."id", ${input.actorId}
    ) active_membership
    WHERE workspace."id" <> ${active.workspace.id}
      AND workspace."archivedAt" IS NULL
    ORDER BY workspace."createdAt" ASC, workspace."id" ASC
    LIMIT 1
  `);
  const fallback = fallbackRows[0];
  if (!fallback) throw new Error(SERVICE_ERROR_CODES.WORKSPACE_ARCHIVE_LAST_ACTIVE);
  const [clock] = await tx.$queryRaw<Array<{ databaseNow: Date }>>(Prisma.sql`
    SELECT statement_timestamp() AS "databaseNow"
  `);
  if (!clock) throw new Error("ACTIVE_RESOURCE_CLOCK_UNAVAILABLE");
  await tx.workspace.update({
    where: { id: active.workspace.id },
    data: { archivedAt: clock.databaseNow, archiveOperationId },
  });
  await appendSecurityJournalEvent(tx, {
    kind: "WORKSPACE_ARCHIVED",
    subjectType: "WORKSPACE",
    subjectId: active.workspace.id,
    operationId: deriveSecurityJournalOperationId({
      rootOperationId: archiveOperationId,
      kind: "WORKSPACE_ARCHIVED",
      subjectType: "WORKSPACE",
      subjectId: active.workspace.id,
    }),
    payload: { stateCode: "WORKSPACE_ARCHIVED", stateVersion: 1 },
  });
  return {
    archivedWorkspaceSlug: active.workspace.slug,
    fallbackWorkspaceSlug: fallback.slug,
  };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
```

- [ ] **Step 5: Run mutation tests to verify green**

Run: `pnpm exec vitest run tests/prisma/archive-operation-provenance-migration.test.ts tests/documents/service.test.ts tests/folders/service.test.ts tests/workspaces/management-service.test.ts tests/security/active-membership-consumers.test.ts --reporter=dot`

Expected: PASS, including the stale version, broken-link source, and concurrent archive cases.

- [ ] **Step 6: Commit the mutation boundary**

```bash
git add prisma/schema.prisma prisma/migrations/20260712010000_active_resource_boundaries/migration.sql tests/prisma/archive-operation-provenance-migration.test.ts lib/documents/service.ts lib/folders/service.ts lib/workspaces/management-service.ts tests/documents/service.test.ts tests/folders/service.test.ts tests/workspaces/management-service.test.ts tests/security/active-membership-consumers.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/Document\ Editing\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: serialize active resource mutations"
```

Expected: commit succeeds with no local security-plan file staged.

### Task 3: Active Read Matrix for Attachments, Comments, Links, Page, and AI

**Files:**
- Modify: `lib/attachments/service.ts`
- Modify: `lib/comments/service.ts`
- Modify: `lib/wiki-links/service.ts`
- Modify: `lib/rag/ask.ts`
- Modify: `lib/rag/workspace-chat.ts`
- Modify: `lib/rag/index-document.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Create: `tests/security/archive-boundary-matrix.test.ts`
- Modify: `tests/attachments/service.test.ts`, `tests/comments/service.test.ts`, `tests/rag/ask.test.ts`, `tests/rag/workspace-chat.test.ts`, `tests/rag/index-document.test.ts`

**Interfaces:**
- Consumes: Task 1 read resolvers and Task 2 locked mutation behavior.
- Produces: one non-enumerating active/archive/purge matrix across page/DTO, tags/properties, links/backlinks, graph/search, RAG, AI, history, comments, and attachments.

- [ ] **Step 1: Write the failing matrix**

Create `tests/security/archive-boundary-matrix.test.ts` with real fixtures and these concrete cases:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { getReadableAttachment } from "@/lib/attachments/service";
import { createComment } from "@/lib/comments/service";
import { prisma } from "@/lib/db/client";
import { askDocumentQuestion } from "@/lib/rag/ask";
import { getDocumentLinkPanels } from "@/lib/wiki-links/service";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("archive boundary matrix", () => {
  beforeEach(resetTestData);

  it.each(["ARCHIVED", "PURGED"] as const)(
    "hides %s document-derived resources",
    async (state) => {
      const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
      const document = await prisma.document.create({
        data: {
          workspaceId: fixture.workspace.id,
          title: "Source",
          slug: "source",
          path: "/source",
          createdById: fixture.user.id,
          updatedById: fixture.user.id,
          attachments: {
            create: {
              fileName: "source.txt",
              mimeType: "text/plain",
              size: 1,
              storageKey: `${fixture.workspace.id}/source.txt`,
              uploadedById: fixture.user.id,
            },
          },
        },
        include: { attachments: true },
      });
      if (state === "ARCHIVED") {
        await prisma.document.update({
          where: { id: document.id },
          data: { status: "ARCHIVED", archivedAt: new Date() },
        });
      } else {
        await prisma.document.delete({ where: { id: document.id } });
      }
      await expect(getDocumentLinkPanels(document.id, fixture.user.id)).rejects.toThrow(
        SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND,
      );
      await expect(createComment({
        documentId: document.id,
        actorId: fixture.user.id,
        body: "stale comment",
      })).rejects.toThrow(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
      await expect(getReadableAttachment(
        document.attachments[0].id,
        fixture.user.id,
      )).rejects.toThrow(SERVICE_ERROR_CODES.ATTACHMENT_NOT_FOUND);
      await expect(askDocumentQuestion({
        workspaceSlug: fixture.workspace.slug,
        documentId: document.id,
        actorId: fixture.user.id,
        question: "What is here?",
      })).rejects.toThrow(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
    },
  );
});
```

The test must create the backing file before testing an active attachment and clean it in `afterEach`; a missing file cannot be the reason an archived assertion passes.

- [ ] **Step 2: Run matrix tests to verify red**

Run: `pnpm exec vitest run tests/security/archive-boundary-matrix.test.ts tests/attachments/service.test.ts tests/comments/service.test.ts tests/rag/index-document.test.ts --reporter=dot`

Expected: FAIL because attachment/comment/link readers do not require active workspace/document state and index loading accepts archived documents.

- [ ] **Step 3: Replace duplicated read authorization with common resolution**

In `lib/comments/service.ts`, replace `getReadableDocument()` and `getDocumentAccess()` with:

```ts
const { document, workspace } = await resolveActiveDocumentForActor(prisma, {
  documentId: input.documentId,
  actorId: input.actorId,
  access: "write",
});
return prisma.$transaction(async (tx) => {
  const lockedActor = await resolveActiveWorkspaceForActorForUpdate(tx, {
    workspaceId: document.workspaceId,
    actorId: input.actorId,
    access: "write",
  });
  await lockDocumentBoundary(tx, document.id, lockedActor.workspace.id);
  await resolveActiveDocumentForActor(tx, {
    documentId: document.id,
    actorId: input.actorId,
    access: "write",
  });
  const comment = await tx.comment.create({
    data: { documentId: document.id, userId: input.actorId, body },
  });
  await writeAuditLog(tx, {
    organizationId: workspace.organizationId,
    actorId: input.actorId,
    action: "comment.created",
    resourceType: "comment",
    resourceId: comment.id,
    metadata: { documentId: document.id },
  });
  return comment;
});
```

In `lib/attachments/service.ts`, resolve uploads with `access: "write"` inside the
file-finalization transaction using the same workspace/member/grant-before-document lock
order, and resolve reads with `access: "read"`. Map `DOCUMENT_NOT_FOUND`,
`WORKSPACE_NOT_FOUND`, and ACL failures to `ATTACHMENT_NOT_FOUND` in
`getReadableAttachment()`.

In `lib/wiki-links/service.ts`, query only `status: "ACTIVE", archivedAt: null, workspace: { archivedAt: null }` and call `resolveActiveDocumentForActor()` for the selected document. Apply those predicates to outgoing target and backlink source queries before ACL filtering.

- [ ] **Step 4: Close page, RAG, and index reads**

In `lib/rag/index-document.ts`, replace `loadSavedDocument()` and `isSavedDocumentCurrent()` with:

```ts
async function loadSavedDocument(documentId: string) {
  return prisma.document.findFirst({
    where: {
      id: documentId,
      status: "ACTIVE",
      archivedAt: null,
      workspace: { archivedAt: null },
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      contentMarkdown: true,
      updatedAt: true,
    },
  });
}

async function isSavedDocumentCurrent(document: SavedDocumentForIndex) {
  const current = await prisma.document.findFirst({
    where: {
      id: document.id,
      status: "ACTIVE",
      archivedAt: null,
      workspace: { archivedAt: null },
    },
    select: { updatedAt: true },
  });
  return current?.updatedAt.getTime() === document.updatedAt.getTime();
}
```

Use `resolveActiveWorkspaceForActor()` plus active document predicates in `lib/rag/ask.ts` and `lib/rag/workspace-chat.ts`. In `app/workspaces/[workspaceSlug]/page.tsx`, retain `buildWorkspacePageWhere()` and add `archivedAt: null` alongside every active document/folder nested query; fetch tags, properties, links, attachments, comments, versions, and audit rows only after `selectedDocument` came from the active readable list.

- [ ] **Step 5: Run matrix tests to verify green**

Run:

```bash
pnpm exec vitest run tests/security/archive-boundary-matrix.test.ts tests/attachments/service.test.ts tests/attachments/route.test.ts tests/comments/service.test.ts tests/wiki-links/reconcile.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts tests/rag/index-document.test.ts --reporter=dot
```

Expected: PASS; archived/purged paths use stable not-found codes and active paths still succeed.

- [ ] **Step 6: Commit the read matrix**

```bash
git add lib/attachments/service.ts lib/comments/service.ts lib/wiki-links/service.ts lib/rag/ask.ts lib/rag/workspace-chat.ts lib/rag/index-document.ts app/workspaces/\[workspaceSlug\]/page.tsx tests/security/archive-boundary-matrix.test.ts tests/attachments/service.test.ts tests/comments/service.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts tests/rag/index-document.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/RAG\ Process\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: enforce active state across resource reads"
```

Expected: commit succeeds with no private document fixture or incident detail staged.

### Task 4: Manager Retention, Explicit Recovery, and Destructive Purge Gate

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/migrations/20260712010000_active_resource_boundaries/migration.sql`
- Modify: `tests/prisma/archive-operation-provenance-migration.test.ts`
- Modify: `lib/workspaces/retention-service.ts`
- Create: `lib/retention/purge-readiness.ts`
- Create: `lib/retention/downstream/leaf14-production-readiness.ts`
- Create: `lib/documents/purge-operation-ledger.ts`
- Create: `lib/documents/purge-physical.ts`
- Create: `lib/documents/purge-physical-cli.ts`
- Modify: `lib/documents/purge-archived.ts`
- Modify: `lib/documents/purge-archived-cli.ts`
- Modify: `deploy/security/protected-artifact-owners.json`
- Create: `lib/archive/recovery.ts`
- Create: `lib/archive/journal-replay.ts`
- Modify: `tests/workspaces/retention-service.test.ts`
- Modify: `tests/documents/purge-archived-cli.test.ts`
- Create: `tests/documents/purge-operation-ledger.test.ts`
- Create: `tests/documents/purge-physical.test.ts`
- Create: `tests/retention/purge-readiness.test.ts`
- Modify: `tests/security/active-resource-downstream-extension-contract.test.ts`
- Create: `tests/archive/recovery.test.ts`
- Create: `tests/archive/journal-replay.test.ts`
- Modify: `tests/security/active-membership-consumers.test.ts`

**Interfaces:**
- Consumes: Task 1 active/lock functions, Task 2 `archiveOperationId`/`lockFolderTreeForUpdate()`, Issue 2 `appendSecurityJournalEvent()`, and `canManageWorkspace`.
- Produces: retained `DocumentPurgeOperation`/`DocumentPurgeItem` ledger state, `PurgeAuthorization`, `PurgeBatchCandidate`, `PurgePhysicalCandidate`, `PurgeEvaluationState`, `PurgeLeafReadiness`, `DestructivePurgeReadiness`, `PurgePhysicalExecutor`, `createCompositePurgeReadiness()`, `failClosedPurgeReadiness`, separately protected `productionPurgeReadiness`/`productionPurgePhysicalExecutor` version-0 seam exports, logical-deny/detached-high-water/idempotent-physical commands, dry-run-by-default CLI behavior, and complete `restoreArchivedDocument()` / `restoreArchivedFolder()` services. Issue 5 imports no later leaf. The two destructive readiness methods are `authorizeLogicalBatch(tx, candidate)` and `authorizePhysicalItem(tx, candidate)`; neither accepts caller-supplied deployment identity or time, and no authorization survives its transaction.

- [ ] **Step 1: Write failing policy/readiness/recovery tests**

Change the retention tests to:

```ts
it.each([WorkspaceRole.OWNER, WorkspaceRole.ADMIN])("allows %s to change retention", async (role) => {
  const fixture = await seedWorkspaceFixture(role);
  await expect(updateWorkspaceArchivedDocumentRetentionPolicy({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    policy: "DAYS_90",
  })).resolves.toEqual({ archivedDocumentRetentionPolicy: "DAYS_90" });
});

it.each([WorkspaceRole.EDITOR, WorkspaceRole.VIEWER])("rejects %s retention changes", async (role) => {
  const fixture = await seedWorkspaceFixture(role);
  await expect(updateWorkspaceArchivedDocumentRetentionPolicy({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    policy: "DAYS_90",
  })).rejects.toThrow("WORKSPACE_MANAGE_FORBIDDEN");
});
```

Add to `tests/documents/purge-archived-cli.test.ts`:

```ts
it("defaults to dry-run", () => {
  expect(parsePurgeArchivedDocumentsArgs([])).toEqual({ dryRun: true });
});

it("passes the fail-closed default to execute", async () => {
  const purge = vi.fn().mockRejectedValue(new Error("DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED"));
  await expect(runPurgeArchivedDocumentsCli(["--execute"], vi.fn(), {
    purge,
    readiness: failClosedPurgeReadiness,
  })).rejects.toThrow("DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED");
  expect(purge).toHaveBeenCalledWith(expect.objectContaining({
    dryRun: false,
    readiness: failClosedPurgeReadiness,
  }));
});

it("does not consult readiness for dry-run", async () => {
  const readiness = {
    authorizeLogicalBatch: vi.fn().mockRejectedValue(new Error("must not run")),
    authorizePhysicalItem: vi.fn().mockRejectedValue(new Error("must not run")),
  } satisfies DestructivePurgeReadiness;
  await purgeExpiredArchivedDocuments({ dryRun: true, readiness });
  expect(readiness.authorizeLogicalBatch).not.toHaveBeenCalled();
  expect(readiness.authorizePhysicalItem).not.toHaveBeenCalled();
});
```

Create `tests/retention/purge-readiness.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createCompositePurgeReadiness,
  failClosedPurgeReadiness,
} from "@/lib/retention/purge-readiness";

const candidate = {
  rootOperationId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "workspace-1",
  documentIds: ["document-1"],
} as const;

const evaluation = {
  environment: "production",
  deploymentDigest: "sha256:synthetic",
  securityFloorSha256: "a".repeat(64),
  deploymentEvidenceSha256: "b".repeat(64),
  restoreEvidenceSha256: "c".repeat(64),
  journalCheckpoint: { sequence: "9007199254740994", hash: "e".repeat(64) },
  journalHighWater: { sequence: "9007199254740994", hash: "e".repeat(64) },
  evaluationEpoch: "epoch-1",
  leafEvidence: [
    { name: "ai-lineage", issue: 9, evidenceSha256: "f".repeat(64) },
    { name: "attachments", issue: 11, evidenceSha256: "1".repeat(64) },
  ],
  databaseNow: "2026-07-11T00:01:00.000Z",
};

describe("destructive purge readiness", () => {
  it("defaults both logical and physical destructive methods to fail closed", async () => {
    await expect(failClosedPurgeReadiness.authorizeLogicalBatch({} as never, candidate))
      .rejects.toThrow("DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED");
    await expect(failClosedPurgeReadiness.authorizePhysicalItem({} as never, {
      rootOperationId: candidate.rootOperationId,
      ledgerItemId: "ledger-item-1",
      workspaceId: candidate.workspaceId,
      documentId: candidate.documentIds[0],
      journalFence: evaluation.journalHighWater,
      signedHighWaterSha256: "9".repeat(64),
    })).rejects.toThrow("DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED");
  });

  it("runs exact leaves and byte-rechecks every live fact inside one transaction", async () => {
    const calls: string[] = [];
    const readEvaluationState = vi.fn()
      .mockResolvedValueOnce(evaluation)
      .mockResolvedValueOnce(structuredClone(evaluation));
    const readiness = createCompositePurgeReadiness({
      readEvaluationState,
      leafChecks: [
        { name: "ai-lineage", assertCandidate: vi.fn(async () => { calls.push("ai-lineage"); }) },
        { name: "attachments", assertCandidate: vi.fn(async () => { calls.push("attachments"); }) },
      ],
    });

    const authorization = await readiness.authorizeLogicalBatch({} as never, candidate);

    expect(calls).toEqual(["ai-lineage", "attachments"]);
    expect(readEvaluationState).toHaveBeenCalledTimes(2);
    expect(authorization).toMatchObject({
      format: "munjib-purge-authorization-v2",
      rootOperationId: candidate.rootOperationId,
      workspaceId: candidate.workspaceId,
      documentCount: "1",
    });
  });

  it.each([
    ["deployment", { ...evaluation, deploymentDigest: "sha256:different" }],
    ["floor", { ...evaluation, securityFloorSha256: "2".repeat(64) }],
    ["restore", { ...evaluation, restoreEvidenceSha256: "3".repeat(64) }],
    ["journal", { ...evaluation, journalHighWater: { ...evaluation.journalHighWater, sequence: "9007199254740995" } }],
    ["leaf", { ...evaluation, leafEvidence: [evaluation.leafEvidence[0], { ...evaluation.leafEvidence[1], evidenceSha256: "4".repeat(64) }] }],
  ])("rejects %s drift before authorization", async (_name, changed) => {
    const readiness = createCompositePurgeReadiness({
      readEvaluationState: vi.fn().mockResolvedValueOnce(evaluation).mockResolvedValueOnce(changed),
      leafChecks: [
        { name: "ai-lineage", assertCandidate: vi.fn() },
        { name: "attachments", assertCandidate: vi.fn() },
      ],
    });
    await expect(readiness.authorizeLogicalBatch({} as never, candidate))
      .rejects.toThrow("DESTRUCTIVE_PURGE_EVALUATION_CHANGED");
  });

  it("rejects any pre-logical export lag", async () => {
    const lagged = {
      ...evaluation,
      journalCheckpoint: {
        sequence: "9007199254740993",
        hash: "d".repeat(64),
      },
    };
    const readiness = createCompositePurgeReadiness({
      readEvaluationState: vi.fn().mockResolvedValue(lagged),
      leafChecks: [
        { name: "ai-lineage", assertCandidate: vi.fn() },
        { name: "attachments", assertCandidate: vi.fn() },
      ],
    });
    await expect(readiness.authorizeLogicalBatch({} as never, candidate))
      .rejects.toThrow("DESTRUCTIVE_PURGE_JOURNAL_EXPORT_LAG");
  });
});
```

Add to `tests/documents/purge-archived.test.ts`:

```ts
it("rolls back the entire locked batch when a candidate-scoped leaf changes", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.OWNER);
  await prisma.workspace.update({
    where: { id: fixture.workspace.id },
    data: { archivedDocumentRetentionPolicy: "DAYS_7" },
  });
  const document = await prisma.document.create({
    data: {
      workspaceId: fixture.workspace.id,
      title: "Rollback sentinel",
      slug: "rollback-sentinel",
      path: "/rollback-sentinel",
      status: "ARCHIVED",
      archivedAt: new Date("2026-06-01T00:00:00.000Z"),
      archiveOperationId: crypto.randomUUID(),
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
    },
  });
  const readiness: DestructivePurgeReadiness = {
    authorizeLogicalBatch: vi.fn(async () => {
      throw new Error("ATTACHMENT_PURGE_NOT_READY");
    }),
    authorizePhysicalItem: vi.fn(async () => {
      throw new Error("PHYSICAL_PURGE_NOT_AUTHORIZED");
    }),
  };
  await expect(purgeExpiredArchivedDocuments({
    dryRun: false,
    purgeOperationId: "00000000-0000-4000-8000-000000000002",
    batchSize: 1,
    readiness,
  })).rejects.toThrow("ATTACHMENT_PURGE_NOT_READY");
  await expect(prisma.document.findUniqueOrThrow({ where: { id: document.id } }))
    .resolves.toMatchObject({ title: "Rollback sentinel", status: "ARCHIVED" });
  await expect(prisma.documentPurgeItem.count({
    where: { documentId: document.id },
  })).resolves.toBe(0);
  expect(readiness.authorizeLogicalBatch).toHaveBeenCalledTimes(1);
  expect(readiness.authorizePhysicalItem).not.toHaveBeenCalled();
});
```

Add a two-batch fixture that changes the deployment, floor, restore evidence, journal
high-water, or either leaf-evidence digest after the first logical commit. The second
SERIALIZABLE batch must call `authorizeLogicalBatch()` again and fail before its first
ledger mutation. Also reject reuse against another root operation, workspace, document
set, transaction, or a candidate containing duplicate/unsorted ids. Logical and
physical authorization use DB time, expire no more than five minutes after issue, and
preserve canonical BIGINT decimal sequences above `Number.MAX_SAFE_INTEGER`.

Create `tests/documents/purge-operation-ledger.test.ts` and
`tests/documents/purge-physical.test.ts` with barriers at every crash edge:

- retry before/after logical commit derives the same operation/item IDs and exact
  journal fence without duplicate events;
- a crash after logical commit leaves the Document and bytes physically present and
  normal access denied;
- high-water below the exact sequence/hash fence leaves the item `LOGICAL_DENIED`;
- exact signed high-water coverage advances it once to `HIGH_WATER_VERIFIED` only after
  the logical transaction and global lock have ended;
- the physical worker cannot claim an item without fresh Leaf 14 signed restore plus
  live Issue 9/11 authorization;
- crash after byte unlink but before DB finalization retries through descriptor-confined
  `ENOENT`, deletes remaining rows, and records one `PHYSICAL_COMPLETE` transition;
- crash after row deletion but before acknowledgement re-reads the retained ledger and
  completes idempotently; no retry can return to an earlier phase;
- no wait, sleep, object-store poll, or high-water retry loop runs while the shared host
  security-state lock is held.

Create `tests/archive/recovery.test.ts` with concrete fixtures for document success, editor denial, blank reason denial, archived-parent denial, a purged id returning `DOCUMENT_NOT_FOUND`, same-operation descendant restore, a previously archived descendant remaining archived, and restore-vs-parent-archive serialization. The exact folder test is included in Step 4 beside its implementation.

Extend `tests/security/active-membership-consumers.test.ts` before implementation to
cover `lib/archive/recovery.ts` and an expired-unswept support actor; direct membership
authorization fails the source contract and both recovery entrypoints deny.

Extend `tests/security/active-resource-downstream-extension-contract.test.ts` to prove
that `lib/retention/purge-readiness.ts` never imports a later leaf or downstream seam,
the logical CLI and physical worker import exactly
`leaf14-production-readiness.ts`, that version-0 slot exports both fail-closed core
defaults, and its owner-map entry is reserved for `encrypted-recovery-readiness` with
creator `active-resource-boundaries`. The test rejects a Leaf 5 fragment that claims the
slot, any baseline hash change at version 0, a physical executor reachable from the
logical CLI, or a downstream implementation that omits fresh Issue 9/11 plus signed
Leaf 14 evidence.

- [ ] **Step 2: Run policy/gate/recovery tests to verify red**

Run: `pnpm exec vitest run tests/prisma/archive-operation-provenance-migration.test.ts tests/workspaces/retention-service.test.ts tests/documents/purge-archived-cli.test.ts tests/documents/purge-operation-ledger.test.ts tests/documents/purge-physical.test.ts tests/retention/purge-readiness.test.ts tests/archive/recovery.test.ts tests/archive/journal-replay.test.ts tests/security/active-membership-consumers.test.ts tests/security/active-resource-downstream-extension-contract.test.ts --reporter=dot`

Expected: FAIL because EDITOR can change retention, purge defaults to execution,
readiness/recovery are incomplete, and the exact Leaf 5 reducer map does not exist.

- [ ] **Step 3: Add the compile-safe purge readiness port and dry-run default**

Create `lib/retention/purge-readiness.ts` with this public contract; the implementation
must follow the exact algorithm after the block and no declaration-only stub ships:

```ts
import type { Prisma } from "@prisma/client";

export const PURGE_LEAF_NAMES = ["ai-lineage", "attachments"] as const;
export type PurgeLeafName = (typeof PURGE_LEAF_NAMES)[number];
export type PurgeBatchCandidate = Readonly<{
  rootOperationId: string;
  workspaceId: string;
  documentIds: readonly string[];
}>;
export type PurgePhysicalCandidate = Readonly<{
  rootOperationId: string;
  ledgerItemId: string;
  workspaceId: string;
  documentId: string;
  journalFence: Readonly<{ sequence: string; hash: string }>;
  signedHighWaterSha256: string;
}>;
export type PurgeEvaluationState = Readonly<{
  environment: "production";
  deploymentDigest: `sha256:${string}`;
  securityFloorSha256: string;
  deploymentEvidenceSha256: string;
  restoreEvidenceSha256: string;
  journalCheckpoint: Readonly<{ sequence: string; hash: string }>;
  journalHighWater: Readonly<{ sequence: string; hash: string }>;
  evaluationEpoch: string;
  leafEvidence: readonly [
    Readonly<{ name: "ai-lineage"; issue: 9; evidenceSha256: string }>,
    Readonly<{ name: "attachments"; issue: 11; evidenceSha256: string }>,
  ];
  databaseNow: string;
}>;
type PurgeAuthorizationCommon = Readonly<{
  format: "munjib-purge-authorization-v2";
  environment: "production";
  deploymentDigest: `sha256:${string}`;
  securityFloorSha256: string;
  deploymentEvidenceSha256: string;
  restoreEvidenceSha256: string;
  journalCheckpoint: Readonly<{ sequence: string; hash: string }>;
  journalHighWater: Readonly<{ sequence: string; hash: string }>;
  evaluationEpoch: string;
  leafEvidence: PurgeEvaluationState["leafEvidence"];
  issuedAt: string;
  expiresAt: string;
}>;
export type PurgeAuthorization = PurgeAuthorizationCommon & Readonly<
  | {
      phase: "LOGICAL_DENY";
      rootOperationId: string;
      workspaceId: string;
      documentIdsSha256: string;
      documentCount: string;
    }
  | {
      phase: "PHYSICAL_DELETE";
      rootOperationId: string;
      ledgerItemId: string;
      workspaceId: string;
      documentId: string;
      journalFence: Readonly<{ sequence: string; hash: string }>;
      signedHighWaterSha256: string;
    }
>;
export interface PurgeLeafReadiness {
  name: PurgeLeafName;
  assertCandidate(
    tx: Prisma.TransactionClient,
    candidate: PurgeBatchCandidate,
    state: PurgeEvaluationState,
  ): Promise<void>;
}
export interface DestructivePurgeReadiness {
  authorizeLogicalBatch(
    tx: Prisma.TransactionClient,
    candidate: PurgeBatchCandidate,
  ): Promise<PurgeAuthorization>;
  authorizePhysicalItem(
    tx: Prisma.TransactionClient,
    candidate: PurgePhysicalCandidate,
  ): Promise<PurgeAuthorization>;
}
export interface PurgePhysicalExecutor {
  executeItem(input: {
    claimToken: string;
    ledgerItemId: string;
    rootOperationId: string;
  }): Promise<Readonly<{
    documentRowAbsent: true;
    derivedRowsAbsent: true;
    attachmentBytesAbsent: true;
    providerEvidenceSha256s: readonly [string, string];
  }>>;
}

export declare function createCompositePurgeReadiness(input: {
  readEvaluationState(
    tx: Prisma.TransactionClient,
    candidate: PurgeBatchCandidate,
  ): Promise<PurgeEvaluationState>;
  leafChecks: readonly PurgeLeafReadiness[];
}): DestructivePurgeReadiness;

export const failClosedPurgeReadiness: DestructivePurgeReadiness = {
  async authorizeLogicalBatch() {
    throw new Error("DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED");
  },
  async authorizePhysicalItem() {
    throw new Error("DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED");
  },
};
export const failClosedPurgePhysicalExecutor: PurgePhysicalExecutor = {
  async executeItem() {
    throw new Error("DESTRUCTIVE_PURGE_PHYSICAL_INTEGRATION_NOT_INSTALLED");
  },
};
```

`authorizeLogicalBatch()` and `authorizePhysicalItem()` require the exact two leaf names
in tuple order. Logical authorization rejects an empty, duplicate, or non-canonical
candidate and canonical-hashes the root operation UUID, workspace ID, sorted document
IDs, and count. Physical authorization binds one immutable ledger item, document,
journal sequence/hash fence, and signed remote-high-water digest. Each method calls
`readEvaluationState()` once, runs both leaf checks in assertion-only mode, then calls it
again in the same transaction and byte-compares canonical encodings. A leaf check may
lock/read candidate state but may not enqueue, unlink, delete, append a journal event, or
advance a ledger; side effects belong to the phase implementation after authorization.
The state includes live current deployment/floor/deployment evidence, signed
oldest-restore evidence, journal checkpoint/high-water, evaluation epoch, and exact
Issue 9/11 evidence. Before logical authorization, checkpoint sequence/hash must equal
the signed remote high-water exactly. Before physical authorization, the separately
verified signed high-water must contain the ledger's exact journal fence tuple, not just
a greater caller-claimed sequence. Every digest is lowercase SHA-256, every journal
sequence is canonical unsigned BIGINT decimal, and DB-authored
`issuedAt`/`expiresAt` span at most five minutes. Any change or parser failure throws
before returning an authorization. The returned phase-discriminated v2 object binds the
candidate and transaction and cannot be prepared, cached, or reused.

Issue 5 contains no restore-evidence parser and no import from Issue 9, Issue 11, or
Issue 14. Create `lib/retention/downstream/leaf14-production-readiness.ts` with only:

```ts
import {
  failClosedPurgePhysicalExecutor,
  failClosedPurgeReadiness,
} from "@/lib/retention/purge-readiness";

export const productionPurgeReadiness = failClosedPurgeReadiness;
export const productionPurgePhysicalExecutor = failClosedPurgePhysicalExecutor;
```

Record its exact baseline hash in `deploy/security/protected-artifact-owners.json` at
version 0, state `RESERVED`, owner `encrypted-recovery-readiness`, and creator
`active-resource-boundaries`. Leaf 5 may publish this baseline once but may never edit
it. In `lib/documents/purge-archived-cli.ts`, default parsing to dry-run and inject the
separately protected production seam:

```ts
type PurgeCliDeps = {
  readiness?: DestructivePurgeReadiness;
  purge?: typeof purgeExpiredArchivedDocuments;
  purgeOperationId?: string;
};

export function parsePurgeArchivedDocumentsArgs(args: string[]) {
  const options: PurgeArchivedDocumentsCliOptions = { dryRun: true };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--" && index === 0) continue;
    if (arg === "--dry-run") { options.dryRun = true; continue; }
    if (arg === "--execute") { options.dryRun = false; continue; }
    if (arg === "--workspace") {
      const workspaceSlug = args[index + 1]?.trim();
      if (!workspaceSlug || workspaceSlug.startsWith("-")) {
        throw new Error("--workspace requires a workspace slug");
      }
      options.workspaceSlug = workspaceSlug;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export async function runPurgeArchivedDocumentsCli(
  args = process.argv.slice(2),
  log: (line: string) => void = console.log,
  deps: PurgeCliDeps = {},
) {
  const options = parsePurgeArchivedDocumentsArgs(args);
  const result = await (deps.purge ?? purgeExpiredArchivedDocuments)({
    ...options,
    readiness: deps.readiness ?? productionPurgeReadiness,
    purgeOperationId: deps.purgeOperationId,
  });
  const prefix = result.dryRun ? "dry run: " : "";
  for (const workspace of result.workspaces) {
    log(`${prefix}workspace ${workspace.workspaceSlug}: ${workspace.count} expired archived documents`);
  }
  log(`${prefix}total expired archived documents: ${result.totalCount}`);
  return result;
}
```

Extend the same migration with an enum
`DocumentPurgePhase = LOGICAL_DENIED | HIGH_WATER_VERIFIED | PHYSICAL_COMPLETE`, retained
`DocumentPurgeOperation`, and retained `DocumentPurgeItem`. Operation identity is the
persisted root UUID. Each item has immutable `id`, operation/workspace/document ids,
candidate digest, exact `journalFenceSequence BIGINT` and 32-byte
`journalFenceHash`, plus DB-authored `logicalDeniedAt`; nullable signed-high-water
digest/sequence/hash and `highWaterVerifiedAt`; nullable physical claim token/lease;
and `physicalCompletedAt` plus final Issue 9/11 evidence digests. `Document` receives
nullable `purgeDeniedAt` and `purgeLedgerItemId`; normal access and recovery reject any
non-null value. Ledger identity/fence columns never update, phases move only forward,
every timestamp is assigned by a fixed-search-path DB trigger using
`statement_timestamp()`, and operation/item rows cannot be deleted or truncated.
Extend `tests/prisma/archive-operation-provenance-migration.test.ts` to require both
ledger tables, BIGINT/32-byte journal-fence constraints, the monotonic phase trigger,
DB-time timestamp functions, immutable/delete/truncate guards, and nullable
`Document.purgeDeniedAt`/`purgeLedgerItemId`. It fails on a caller-time column default,
mutable fence, cascading ledger deletion, or a phase transition that skips/reverses the
three states.

In `lib/documents/purge-archived.ts`, remove the production `now` input. Add only
`readiness?: DestructivePurgeReadiness`, `purgeOperationId?: string`, and
`batchSize?: number`. Use `dryRun = input.dryRun ?? true`; dry-run retains a count-only
path, uses the identical SQL `statement_timestamp()` retention CASE, and never calls
readiness. Execute requires a persisted root UUID but accepts no
clock, environment, deployment digest, floor, evidence, journal, or leaf result. Process
at most `batchSize ?? 100` rows per SERIALIZABLE logical transaction:

```ts
const readiness = input.readiness ?? failClosedPurgeReadiness;

const logicalDeniedInBatch = await prisma.$transaction(async (tx) => {
  const candidates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT document."id"
    FROM "Document" document
    JOIN "Workspace" workspace ON workspace."id" = document."workspaceId"
    WHERE document."workspaceId" = ${workspace.id}
      AND document."status" = 'ARCHIVED'
      AND document."purgeDeniedAt" IS NULL
      AND document."archivedAt" <= statement_timestamp() - CASE
        WHEN workspace."archivedDocumentRetentionPolicy" = 'DAYS_7' THEN INTERVAL '7 days'
        WHEN workspace."archivedDocumentRetentionPolicy" = 'DAYS_30' THEN INTERVAL '30 days'
        WHEN workspace."archivedDocumentRetentionPolicy" = 'DAYS_90' THEN INTERVAL '90 days'
        ELSE INTERVAL '100000 years'
      END
    ORDER BY document."archivedAt" ASC, document."id" ASC
    LIMIT ${batchSize}
    FOR UPDATE OF document SKIP LOCKED
  `);
  const documentIds = candidates.map(({ id }) => id);
  if (documentIds.length === 0) return 0;

  const derivedRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "DocumentChunk"
    WHERE "documentId" IN (${Prisma.join(documentIds)})
    ORDER BY "id" ASC FOR UPDATE
  `);
  // Lock attachment and link candidates in their documented immutable-id order too;
  // Issue 9/11 leaf checks are assertion-only and make no side effect here.
  await readiness.authorizeLogicalBatch(tx, {
    rootOperationId: input.purgeOperationId!,
    workspaceId: workspace.id,
    documentIds,
  });

  const eventResults: Array<{ sequence: bigint; eventHash: string }> = [];
  for (const derived of derivedRows) {
    eventResults.push(await appendSecurityJournalEvent(tx, {
      kind: "AI_DERIVED_DATA_PURGED",
      subjectType: "AI_DERIVED_DATA",
      subjectId: derived.id,
      operationId: deriveSecurityJournalOperationId({
        rootOperationId: input.purgeOperationId!,
        kind: "AI_DERIVED_DATA_PURGED",
        subjectType: "AI_DERIVED_DATA",
        subjectId: derived.id,
      }),
      payload: { stateCode: "AI_DERIVED_DATA_PURGED", stateVersion: 1 },
    }));
  }
  for (const documentId of documentIds) {
    eventResults.push(await appendSecurityJournalEvent(tx, {
      kind: "DOCUMENT_PURGED",
      subjectType: "DOCUMENT",
      subjectId: documentId,
      operationId: deriveSecurityJournalOperationId({
        rootOperationId: input.purgeOperationId!,
        kind: "DOCUMENT_PURGED",
        subjectType: "DOCUMENT",
        subjectId: documentId,
      }),
      payload: { stateCode: "DOCUMENT_PURGED", stateVersion: 1 },
    }));
  }
  const journalFence = eventResults.at(-1);
  if (!journalFence) throw new Error("PURGE_JOURNAL_FENCE_REQUIRED");
  await recordLogicalPurgeItems(tx, {
    rootOperationId: input.purgeOperationId!,
    workspaceId: workspace.id,
    documentIds,
    journalFence,
  });
  return documentIds.length;
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```

`recordLogicalPurgeItems()` derives stable operation/item IDs, inserts or exact-matches
retry state, and in the same transaction sets each Document's `purgeDeniedAt` from the
DB statement and `purgeLedgerItemId`. It does **not** delete or null a Document,
DocumentChunk, link, attachment row, queue row, or file. Journal/ledger/document failure
rolls the logical batch back. A second batch obtains fresh authorization even for an
identical set. The root command returns after this commit and releases
`/run/lock/munjib-security-state.lock`; it never waits for export.

Create `verifyLogicalPurgeHighWater()` in `lib/documents/purge-operation-ledger.ts` as a
separate one-shot operation. Outside all DB/host locks it exact-fetches the immutable
KMS-signed remote high-water record and its containing bundle, verifies the complete
chain, and proves the exact `(journalFenceSequence,journalFenceHash)` is present. Only
then does one short SERIALIZABLE DB transaction lock the ledger item, exact-match its
immutable fence, and move `LOGICAL_DENIED -> HIGH_WATER_VERIFIED` while storing the
signed evidence digest and DB time. Below/mismatched sequence, same sequence/wrong hash,
unsigned local chain state, or object absence leaves the item unchanged. There is no
sleep/poll loop and the global lock is not held while awaiting export.

Create `runPhysicalPurgeItem()` in `lib/documents/purge-physical.ts`. Its short claim
transaction locks one `HIGH_WATER_VERIFIED` item, re-verifies the stored signed
high-water tuple, calls `authorizePhysicalItem()` for fresh Leaf 14 signed restore plus
live Issue 9/11 evidence, and writes a DB-time bounded claim token/lease without changing
phase. After commit, `productionPurgePhysicalExecutor.executeItem()` runs under the
separate least-privilege storage worker and descriptor-confined deletion interface. It
removes Issue 11 attachment bytes/rows, Issue 9 derived rows, links, and finally the
Document idempotently; `ENOENT` is success only after parent-descriptor identity checks.
A final SERIALIZABLE transaction exact-matches claim/evidence, verifies all rows/bytes
absent, clears the lease, and advances the retained item to `PHYSICAL_COMPLETE`. Crash
after claim, byte removal, row removal, or acknowledgement resumes from the retained
ledger; a retry can never append another deny event or move a phase backward. The
logical CLI cannot call the physical executor, and the physical CLI defaults to the
fail-closed reserved Leaf 14 seam.

Create `leaf5JournalReplayReducers` with exactly `WORKSPACE_ARCHIVED`,
`FOLDER_ARCHIVED`, `DOCUMENT_ARCHIVED`, `DOCUMENT_PURGED`, and
`AI_DERIVED_DATA_PURGED`. The derived-data handler belongs here because this leaf
produces the logical-deny event and owns the later `DocumentChunk` physical phase; Leaf
9 performs no independent destructive AI purge. `DOCUMENT_PURGED` means the immutable
logical deny is replayable; it is not evidence that production rows/bytes were already
removed. Every reducer consumes Leaf 2's branded restore context, locks the immutable
subject row/key when present, idempotently preserves/reduces state, and never restores,
grants, appends, marks a production ledger physical-complete, or mutates production
journal/checkpoint rows. Add DB-role and source-contract tests in
`tests/archive/journal-replay.test.ts`.

- [ ] **Step 4: Require manager retention and implement explicit recovery**

Use a SERIALIZABLE transaction with `resolveActiveWorkspaceForActorForUpdate()` and
`assertCanManageWorkspace()` for retention changes. The locked canonical membership
role is the only authority; no pre-transaction workspace relation or application clock
is reused.

Create `lib/archive/recovery.ts`:

```ts
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/log";
import { lockFolderTreeForUpdate } from "@/lib/folders/service";
import { prisma } from "@/lib/db/client";
import { assertCanManageWorkspace } from "@/lib/permissions/workspace";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

function recoveryReason(reason: string) {
  const value = reason.trim();
  if (!value || value.length > 500) throw new Error("ARCHIVE_RECOVERY_REASON_INVALID");
  return value;
}

export async function restoreArchivedDocument(input: {
  documentId: string;
  actorId: string;
  reason: string;
}) {
  const reason = recoveryReason(input.reason);
  return prisma.$transaction(async (tx) => {
    const hints = await tx.$queryRaw<Array<{
      documentId: string;
      workspaceId: string;
      folderId: string | null;
    }>>(Prisma.sql`
      SELECT "id" AS "documentId", "workspaceId" AS "workspaceId",
             "folderId" AS "folderId"
      FROM "Document" WHERE "id" = ${input.documentId}
    `);
    const hint = hints[0];
    if (!hint) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
    await lockActorArchiveBoundary(tx, input.actorId);
    const actor = await resolveActiveWorkspaceForActorForUpdate(tx, {
      workspaceId: hint.workspaceId,
      actorId: input.actorId,
      access: "read",
    });
    assertCanManageWorkspace(actor.role);
    const parentFolders = hint.folderId
      ? await lockFolderBoundaries(tx, hint.workspaceId, [hint.folderId])
      : [];
    if (parentFolders.some(({ archivedAt }) => archivedAt !== null)) {
      throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
    }
    const rows = await tx.$queryRaw<Array<{
      documentId: string;
      workspaceId: string;
      folderId: string | null;
      archiveOperationId: string | null;
    }>>(Prisma.sql`
      SELECT d."id" AS "documentId", d."workspaceId" AS "workspaceId",
             d."folderId" AS "folderId", d."archiveOperationId" AS "archiveOperationId"
      FROM "Document" d
      WHERE d."id" = ${input.documentId}
        AND d."workspaceId" = ${hint.workspaceId}
        AND d."folderId" IS NOT DISTINCT FROM ${hint.folderId}
        AND d."status" = 'ARCHIVED'
        AND d."archivedAt" IS NOT NULL
        AND d."purgeDeniedAt" IS NULL
      FOR UPDATE OF d
    `);
    const target = rows[0];
    if (!target) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
    const restored = await tx.document.update({
      where: { id: target.documentId },
      data: {
        status: "ACTIVE",
        archivedAt: null,
        archiveOperationId: null,
        updatedById: input.actorId,
      },
    });
    await writeAuditLog(tx, {
      organizationId: (await tx.workspace.findUniqueOrThrow({
        where: { id: target.workspaceId }, select: { organizationId: true },
      })).organizationId,
      actorId: input.actorId,
      action: "document.archive_recovered",
      resourceType: "document",
      resourceId: restored.id,
      metadata: { reason, recoveredArchiveOperationId: target.archiveOperationId },
    });
    return restored;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

type RecoveryDeps = { afterTreeLock?: () => Promise<void> };

export async function restoreArchivedFolder(
  input: { folderId: string; actorId: string; reason: string },
  deps: RecoveryDeps = {},
) {
  const reason = recoveryReason(input.reason);
  return prisma.$transaction(async (tx) => {
    const hints = await tx.$queryRaw<Array<{
      folderId: string;
      workspaceId: string;
      parentFolderId: string | null;
    }>>(Prisma.sql`
      SELECT folder."id" AS "folderId", folder."workspaceId" AS "workspaceId",
             folder."parentFolderId" AS "parentFolderId"
      FROM "Folder" folder
      WHERE folder."id" = ${input.folderId}
    `);
    const hint = hints[0];
    if (!hint) throw new Error(SERVICE_ERROR_CODES.FOLDER_NOT_FOUND);
    await lockActorArchiveBoundary(tx, input.actorId);
    const actor = await resolveActiveWorkspaceForActorForUpdate(tx, {
      workspaceId: hint.workspaceId,
      actorId: input.actorId,
      access: "read",
    });
    assertCanManageWorkspace(actor.role);
    const tree = await lockFolderTreeForUpdate(tx, hint.workspaceId, hint.folderId, {
      allowArchivedRoot: true,
      boundaryFolderIds: hint.parentFolderId ? [hint.parentFolderId] : [],
    });
    const root = tree.folders.find(({ id }) => id === hint.folderId);
    const parent = hint.parentFolderId
      ? tree.boundaryFolders.find(({ id }) => id === hint.parentFolderId)
      : null;
    if (!root?.archiveOperationId || parent?.archivedAt) {
      throw new Error(SERVICE_ERROR_CODES.FOLDER_NOT_FOUND);
    }
    await deps.afterTreeLock?.();
    const folderIds = tree.folders
      .filter(({ archivedAt, archiveOperationId }) =>
        archivedAt !== null && archiveOperationId === root.archiveOperationId)
      .map(({ id }) => id);
    const documentIds = tree.documents
      .filter(({ status, archivedAt, archiveOperationId }) =>
        status === "ARCHIVED" && archivedAt !== null && archiveOperationId === root.archiveOperationId)
      .map(({ id }) => id);
    if (!folderIds.includes(root.id)) throw new Error(SERVICE_ERROR_CODES.FOLDER_NOT_FOUND);
    await tx.folder.updateMany({
      where: { id: { in: folderIds }, archiveOperationId: root.archiveOperationId },
      data: { archivedAt: null, archiveOperationId: null },
    });
    await tx.document.updateMany({
      where: {
        id: { in: documentIds },
        status: "ARCHIVED",
        archiveOperationId: root.archiveOperationId,
      },
      data: {
        status: "ACTIVE",
        archivedAt: null,
        archiveOperationId: null,
        updatedById: input.actorId,
      },
    });
    await writeAuditLog(tx, {
      organizationId: actor.workspace.organizationId,
      actorId: input.actorId,
      action: "folder.archive_recovered",
      resourceType: "folder",
      resourceId: root.id,
      metadata: {
        reason,
        recoveredArchiveOperationId: root.archiveOperationId,
        restoredFolderCount: folderIds.length,
        restoredDocumentCount: documentIds.length,
      },
    });
    return { folderId: root.id, folderIds, documentIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
```

Update `lockFolderTreeForUpdate()` to accept
`{ allowArchivedRoot?: boolean; boundaryFolderIds?: readonly string[] } = {}` and permit
an archived root only when that flag is true. All ordinary mutation callers retain the
active-root default; recovery supplies its parent as an ancillary boundary so every
Folder lock is acquired in one sorted set before Documents. Neither recovery function
calls `appendSecurityJournalEvent()` because recovery increases access, and both reject
any matching Document with `purgeDeniedAt`/ledger provenance.

Add this exact provenance/race test to `tests/archive/recovery.test.ts`:

```ts
it("restores only descendants from the same archive operation and serializes with parent archive", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.OWNER);
  const parent = await createFolder({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    parentFolderId: null,
    name: "Parent",
  });
  const root = await createFolder({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    parentFolderId: parent.id,
    name: "Recoverable",
  });
  const old = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    folderId: root.id,
    title: "Previously archived",
    contentMarkdown: "old",
  });
  await archiveDocument({ documentId: old.id, actorId: fixture.user.id });
  const current = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    folderId: root.id,
    title: "Same operation",
    contentMarkdown: "current",
  });
  const archived = await archiveFolder({
    workspaceSlug: fixture.workspace.slug,
    folderId: root.id,
    actorId: fixture.user.id,
  });
  const locked = deferred<void>();
  const release = deferred<void>();
  const restoring = restoreArchivedFolder({
    folderId: root.id,
    actorId: fixture.user.id,
    reason: "Approved recovery",
  }, { afterTreeLock: async () => { locked.resolve(); await release.promise; } });
  await locked.promise;
  let parentArchiveSettled = false;
  const parentArchive = archiveFolder({
    workspaceSlug: fixture.workspace.slug,
    folderId: parent.id,
    actorId: fixture.user.id,
  }).finally(() => { parentArchiveSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(parentArchiveSettled).toBe(false);
  release.resolve();
  await expect(restoring).resolves.toMatchObject({
    folderIds: expect.arrayContaining([root.id]),
    documentIds: [current.id],
  });
  await parentArchive;
  await expect(prisma.document.findUniqueOrThrow({ where: { id: old.id } }))
    .resolves.toMatchObject({ status: "ARCHIVED" });
  await expect(prisma.folder.findUniqueOrThrow({ where: { id: root.id } }))
    .resolves.toMatchObject({ archivedAt: expect.any(Date) });
  expect(archived.archiveOperationId).toBeTruthy();
});
```

- [ ] **Step 5: Run readiness/recovery tests to verify green**

Run: `pnpm exec vitest run tests/prisma/archive-operation-provenance-migration.test.ts tests/workspaces/retention-service.test.ts tests/documents/purge-archived-cli.test.ts tests/documents/purge-archived.test.ts tests/documents/purge-operation-ledger.test.ts tests/documents/purge-physical.test.ts tests/retention/purge-readiness.test.ts tests/archive/recovery.test.ts tests/archive/journal-replay.test.ts tests/security/active-membership-consumers.test.ts tests/security/active-resource-downstream-extension-contract.test.ts --reporter=dot`

Expected: PASS; dry-run does not call readiness, default logical and physical execution fail before mutation, each logical/physical candidate rechecks the injected composite inside its own SERIALIZABLE transaction, a leaf failure rolls the phase back, every crash edge resumes from the retained ledger, and recovery restores only matching provenance under deterministic parent/descendant locks.

- [ ] **Step 6: Commit retention/recovery safety**

```bash
git add prisma/schema.prisma prisma/migrations/20260712010000_active_resource_boundaries/migration.sql tests/prisma/archive-operation-provenance-migration.test.ts lib/workspaces/retention-service.ts lib/retention/purge-readiness.ts lib/retention/downstream/leaf14-production-readiness.ts lib/documents/purge-operation-ledger.ts lib/documents/purge-physical.ts lib/documents/purge-physical-cli.ts lib/documents/purge-archived.ts lib/documents/purge-archived-cli.ts lib/archive/recovery.ts lib/archive/journal-replay.ts deploy/security/protected-artifact-owners.json tests/workspaces/retention-service.test.ts tests/documents/purge-archived-cli.test.ts tests/documents/purge-operation-ledger.test.ts tests/documents/purge-physical.test.ts tests/retention/purge-readiness.test.ts tests/archive/recovery.test.ts tests/archive/journal-replay.test.ts tests/security/active-membership-consumers.test.ts tests/security/active-resource-downstream-extension-contract.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/Document\ Editing\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: gate purge and audit archive recovery"
```

Expected: commit succeeds; Issue 5 contains no restore-evidence parser, readiness Boolean, caller clock, premature physical delete, or import from Issue 9, Issue 11, or Issue 14.

### Task 5: Full Archive Matrix Verification and Disclosure Gate

**Files:**
- Modify after disclosure review: `wiki/Auth And Permissions Workflow.md`
- Modify after disclosure review: `wiki/Document Editing Workflow.md`
- Modify after disclosure review: `wiki/RAG Process Workflow.md`
- Modify after disclosure review: `wiki/index.md`
- Modify after disclosure review: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: verified active/archive/purge behavior and the base interfaces required by Issues 6 and 11.

- [ ] **Step 1: Record disclosure-safe durable behavior**

Use exactly this paragraph in the three workflow pages:

```markdown
Active workspace and document resolution is shared across normal reads and writes. Mutations use actor-scoped archive serialization plus deterministic workspace, membership, folder, and document locks and re-check active state inside their transaction. Archive operations carry recovery provenance and append deny-only journal events atomically, archived resources are hidden and immutable on normal paths, and manager recovery restores only the matching operation. Destructive purge first records a DB-time logical deny and exact journal fence in a retained ledger, later verifies independent signed remote high-water coverage with no lock-held polling, and only then permits a separately authorized idempotent physical worker. Both destructive phases remain fail closed until production composition is installed.
```

- [ ] **Step 2: Create and verify the canonical Leaf 5 capability**

Write `tests/security/active-resource-capability.test.ts` RED first. It requires the
canonical fragment to have exactly six keys, exact direct dependencies, an exact
evidence list, and matching ACTIVE owner-map entries for Leaf 5 core artifacts. It
also requires both later-leaf seams to be separately owned `RESERVED` entries created
by Leaf 5; neither reserved path may appear in Leaf 5's protected set.

Run:

```bash
pnpm exec vitest run tests/security/active-resource-capability.test.ts --reporter=dot
```

Expected: RED because the fragment and exact owner-map assertions do not exist.

Create `deploy/security/capabilities/active-resource-boundaries.json`:

```json
{"format":"munjib-security-capability-v1","id":"active-resource-boundaries","version":1,"leaf":5,"requires":["security-journal-auth-tombstones@1","immutable-private-runtime@1"],"evidenceTests":["tests/prisma/archive-operation-provenance-migration.test.ts","tests/authorization/active-resources.test.ts","tests/security/active-membership-consumers.test.ts","tests/security/archive-boundary-matrix.test.ts","tests/security/active-resource-downstream-extension-contract.test.ts","tests/documents/service.test.ts","tests/folders/service.test.ts","tests/workspaces/management-service.test.ts","tests/documents/purge-archived.test.ts","tests/documents/purge-archived-cli.test.ts","tests/documents/purge-operation-ledger.test.ts","tests/documents/purge-physical.test.ts","tests/retention/purge-readiness.test.ts","tests/archive/recovery.test.ts","tests/archive/journal-replay.test.ts","tests/security/active-resource-capability.test.ts"]}
```

Activate exact Leaf 5 owner-map entries for the migration,
`lib/authorization/active-resources.ts`,
`lib/authorization/active-resource-locks.ts`, `lib/archive/recovery.ts`,
`lib/archive/journal-replay.ts`, `lib/retention/purge-readiness.ts`,
`lib/workspaces/retention-service.ts`, `lib/documents/purge-archived.ts`,
`lib/documents/purge-operation-ledger.ts`, `lib/documents/purge-physical.ts`, and
`lib/documents/purge-physical-cli.ts`.
Shared service/route/schema aggregate files remain candidate-tested but are not
whole-file Leaf 5 ownership entries. The Leaf 6 and Leaf 14 extension paths remain
their named owners' version-0 reservations. The test rejects the old noncanonical
fragment keys, missing/reordered requirements or evidence, a shared aggregate claimed
as Leaf 5-only, a reserved path claimed by Leaf 5, stale hash/version, duplicate owner,
or artifact absent from the exact candidate rootfs.

Run the RED command again and require GREEN before the full matrix.

- [ ] **Step 3: Run the complete matrix**

Run:

```bash
pnpm exec vitest run tests/prisma/archive-operation-provenance-migration.test.ts tests/authorization/active-resources.test.ts tests/security/active-membership-consumers.test.ts tests/security/archive-boundary-matrix.test.ts tests/security/active-resource-capability.test.ts tests/security/active-resource-downstream-extension-contract.test.ts tests/documents/service.test.ts tests/folders/service.test.ts tests/workspaces/management-service.test.ts tests/workspaces/retention-service.test.ts tests/documents/purge-archived.test.ts tests/documents/purge-archived-cli.test.ts tests/documents/purge-operation-ledger.test.ts tests/documents/purge-physical.test.ts tests/retention/purge-readiness.test.ts tests/archive/recovery.test.ts tests/archive/journal-replay.test.ts tests/attachments/service.test.ts tests/attachments/route.test.ts tests/comments/service.test.ts tests/wiki-links/reconcile.test.ts tests/rag/index-document.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm test
pnpm run build
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: all commands exit 0; active behavior remains green, every archived/purged matrix row returns the stable not-found result, and Issue 5 execute without injected production readiness fails before mutation.

- [ ] **Step 4: Stage and inspect the remote-safe diff**

```bash
git add prisma/schema.prisma prisma/migrations/20260712010000_active_resource_boundaries/migration.sql deploy/security/capabilities/active-resource-boundaries.json deploy/security/protected-artifact-owners.json lib/authorization/active-resources.ts lib/authorization/downstream/leaf6-document-access.ts lib/authorization/active-resource-locks.ts lib/documents/service.ts lib/folders/service.ts lib/workspaces/management-service.ts lib/attachments/service.ts lib/comments/service.ts lib/wiki-links/service.ts lib/rag/ask.ts lib/rag/workspace-chat.ts lib/rag/index-document.ts lib/workspaces/retention-service.ts lib/retention/purge-readiness.ts lib/retention/downstream/leaf14-production-readiness.ts lib/documents/purge-archived.ts lib/documents/purge-archived-cli.ts lib/documents/purge-operation-ledger.ts lib/documents/purge-physical.ts lib/documents/purge-physical-cli.ts lib/archive/recovery.ts lib/archive/journal-replay.ts app/workspaces/\[workspaceSlug\]/page.tsx tests/prisma/archive-operation-provenance-migration.test.ts tests/authorization/active-resources.test.ts tests/security/active-membership-consumers.test.ts tests/security/archive-boundary-matrix.test.ts tests/security/active-resource-capability.test.ts tests/security/active-resource-downstream-extension-contract.test.ts tests/documents/service.test.ts tests/folders/service.test.ts tests/workspaces/management-service.test.ts tests/workspaces/retention-service.test.ts tests/documents/purge-archived.test.ts tests/documents/purge-archived-cli.test.ts tests/documents/purge-operation-ledger.test.ts tests/documents/purge-physical.test.ts tests/retention/purge-readiness.test.ts tests/archive/recovery.test.ts tests/archive/journal-replay.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/Document\ Editing\ Workflow.md wiki/RAG\ Process\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
pnpm wiki:sync-plan --staged
pnpm wiki:sync-check --staged
git diff --cached --check
git diff --cached --name-only
if git diff --cached | rg -q 'NEXTAUTH_SECRET|API_KEY|password|restore-evidence-[A-Za-z0-9]|docs/superpowers/(plans|specs)/2026-07-11-security'; then echo "restricted staged content detected" >&2; exit 1; fi
if rg -q 'MUNJIB_(AI_LINEAGE|ATTACHMENT|DESTRUCTIVE).*PURGE|security-ai-history|attachments/deletion|security-backup-restore' lib/retention/purge-readiness.ts lib/documents/purge-archived.ts lib/documents/purge-archived-cli.ts lib/documents/purge-operation-ledger.ts lib/documents/purge-physical.ts; then echo "later-leaf purge dependency detected" >&2; exit 1; fi
```

Expected: checks pass; both non-printing scans pass; neither this plan nor the restricted design is staged, and Issue 5 has no direct later-leaf import, caller clock, lock-held polling, same-transaction physical delete, or Boolean readiness path.

- [ ] **Step 5: Commit any final wiki-only delta**

```bash
git commit -m "docs: record active archive boundary contract"
```

Expected: the required real wiki/log delta commits. Do not push until disclosure review approves the exact remote diff.

- [ ] **Step 6: Poll ready-PR checks and GraphQL review threads**

After disclosure approval and readying the PR, poll every 60 seconds for at least five minutes. Each poll runs `gh pr checks "$pr_number"` and this GraphQL count; the final poll must pass both:

```bash
unresolved="$(gh api graphql -f owner="$repo_owner" -f name="$repo_name" -F number="$pr_number" -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved}}}}}' --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')"
test "$unresolved" = "0"
```

Any actionable thread or failed check returns to the focused/full verification and wiki-sync sequence before another commit and push.
