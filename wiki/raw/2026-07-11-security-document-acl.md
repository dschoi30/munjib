# Security Document ACL Implementation Plan

**Tracking:** Issue #160 · remote branch `issue-160-security-document-acl`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close descendant-folder and broken-link ACL gaps, cap explicit permissions by workspace role, and replace broad page serialization with minimal authenticated document DTOs and paginated history.

**Architecture:** Build on Issue 5's active-resource resolver and locks. Resolve explicit permissions only from the actor's exact `USER`, current `WORKSPACE_MEMBER`, and current same-organization `ORGANIZATION_MEMBER` tuples, then cap the result by workspace role. Require write access to every active descendant before a folder transaction mutates anything and authorize broken-link creation from the source document. Load only current-view fields on the server page; fetch versions, audit records, and attachments through permission-checked routes whose canonical, capped, domain-separated HMAC cursor is authenticated before parsing.

**Tech Stack:** Next.js App Router, React client components, Prisma/PostgreSQL, Node HMAC cursors, Vitest, Testing Library.

## Global Constraints

- Dependency order is exact: Issue 6 rebases on merged Issues 1, 2, and 5 so its cursor key consumes Leaf 1's validated file-backed runtime subkey API. Issue 9 consumes Issue 6 only after this branch merges.
- Every folder rename, move, or cascade archive computes all active descendant documents inside the locked transaction and requires write access to every one. One denial rejects the full transaction and changes zero rows.
- Broken-link creation requires current write access to the source document; workspace write access alone is insufficient.
- An explicit document permission is capped by its subject's workspace role: `OWNER|ADMIN -> MANAGE`, `EDITOR -> WRITE`, `VIEWER -> READ`.
- Subject matching uses exactly `USER:<actorId>`, `WORKSPACE_MEMBER:<current membership id for document.workspaceId>`, and `ORGANIZATION_MEMBER:<current membership id for document.workspace.organizationId>`. USER, WORKSPACE_MEMBER, and ORGANIZATION_MEMBER validity is authoritative only after the canonical two-argument DB-time workspace-membership resolver confirms the subject user is currently active; raw User/membership row existence is a hint, never authorization. Cross-workspace, cross-organization, nonexistent, deleted, expired-support, and stale membership ids neither grant access nor activate an explicit ACL.
- Batch/folder authorization never accepts a caller-supplied or relation-loaded workspace role. It uses the canonical active membership returned after Leaf 5's Workspace → WorkspaceMember → optional SupportAccessGrant locks, and re-resolves/matches that membership inside the ACL query transaction.
- Current-view DTOs contain only fields rendered immediately. Full `DocumentVersion`, `AuditLog`, and `Attachment` Prisma objects must never cross the server-component boundary.
- Versions, audit, and attachments use authenticated paginated reads that re-check active workspace/document and current read permission on every page.
- Cursors use canonical JSON, strict encoded/body caps, exact keys, and the domain `munjib-document-cursor-v1`. Verify the HMAC in constant time before base64-decoding or parsing the body; bind it to route kind, workspace id, and document id. Responses are `Cache-Control: private, no-store`; unreadable resources reveal no count, cursor, or internal id.
- Permission revoke/downgrade appends Issue 2 `DOCUMENT_PERMISSION_REDUCED` through `appendSecurityJournalEvent()` in the same SERIALIZABLE transaction. Grant/upgrade is access-increasing and never enters the deny-only journal.
- Export `leaf6JournalReplayReducers` with exactly `DOCUMENT_PERMISSION_REDUCED`; it consumes the immutable prior permission row/key, is branded-restore-only/idempotent/deny-only, and cannot append or mutate journal/checkpoint state.
- Issue 6's current-view/history DTOs delegate attachment projection through `lib/documents/downstream/leaf11-attachments.ts` without importing Issue 11. Issue 6 creates the exact legacy-query baseline reserved for `attachment-integrity-lifecycle` at version 0; after rebasing, Issue 11 changes only that slot to expose verified `READY` attachments. Issue 6 must compile independently before that transition, and its current-view/history core remains byte-identical afterward.
- Leaf 6 owns capability `document-acl-closure`. It covers document/folder ACL helpers, signed cursors, current-view DTOs, history routes, journaling reducers, and only its Leaf 5-reserved `lib/authorization/downstream/leaf6-document-access.ts` seam plus Leaf 6 helpers. It creates but does not own the Leaf 11 version-0 attachment seam. Leaf 13B binds it to the exact candidate; later attachment/AI leaves consume but cannot republish it.
- Every task follows RED -> GREEN -> an actual durable update to its named wiki page plus `wiki/log.md` -> `pnpm wiki:install-hooks`, staged `pnpm wiki:sync-plan --staged`, `pnpm wiki:manifest`, `pnpm wiki:lint`, and `pnpm wiki:sync-check --staged` -> commit. A no-op wiki delta is not sufficient.
- Secret/disclosure scans are non-printing predicates (`rg -q` inside an `if`). A ready PR is polled at intervals no longer than 60 seconds for at least five minutes and GraphQL unresolved review threads block completion.
- This plan and detailed design remain local-only. Remote commits must omit them and all restricted incident evidence, secrets, raw provider/document content beyond synthetic tests, and private topology.

---

## File Structure

- Modify: `lib/permissions/document.ts` — workspace-role ceilings and effective explicit permission.
- Create: `lib/permissions/document-access.ts` — batch ACL loading for descendants/page/AI.
- Create: `lib/permissions/document-grants.ts` — current-subject validation plus atomic grant/revoke/downgrade journaling.
- Create: `lib/permissions/document-journal-replay.ts` and `tests/permissions/document-journal-replay.test.ts` — exact restore reducer for prior permission rows.
- Modify: `lib/authorization/downstream/leaf6-document-access.ts` — transition only the Leaf 5-reserved seam to Leaf 6 v1 and consume effective capped access; `lib/authorization/active-resources.ts` stays byte-identical.
- Modify: `tests/permissions/document.test.ts` — role-ceiling matrix.
- Create: `tests/permissions/document-access.test.ts` — batch ACL map.
- Create: `tests/permissions/document-grants.test.ts` — same-transaction deny-only journal behavior.
- Modify: `tests/security/active-membership-consumers.test.ts` — require Leaf 2's DB-time resolver in ACL actor/subject authorization.
- Modify: `lib/folders/service.ts` — descendant write authorization inside locked transactions.
- Modify: `tests/folders/service.test.ts` — mixed-ACL atomic rejection.
- Modify: `lib/documents/service.ts` — source-document authorization for broken-link creation.
- Modify: `tests/documents/service.test.ts` — source/target and role-ceiling combinations.
- Create: `lib/http/signed-document-cursor.ts` — HMAC cursor binding.
- Create: `lib/documents/current-view.ts` — minimal current-document DTO loader.
- Create: `lib/documents/history.ts` — paginated versions/audit/attachments service.
- Create: `lib/documents/downstream/leaf11-attachments.ts` — exact legacy current/history attachment projection reserved at version 0 for Leaf 11.
- Create: `lib/documents/history-route.ts` — shared authenticated/no-store route wrapper.
- Create: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/versions/route.ts`.
- Create: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/audit/route.ts`.
- Create: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/attachments/route.ts`.
- Modify: `app/workspaces/[workspaceSlug]/page.tsx` — remove broad history queries/props.
- Modify: `components/metadata-panel.tsx` — fetch on tab open and page forward.
- Create: `components/metadata-panel/document-history-list.tsx` — complete lazy page state and minimal row rendering.
- Create: `tests/http/signed-document-cursor.test.ts`, `tests/documents/current-view.test.ts`, `tests/documents/history.test.ts`.
- Create in Task 6: `deploy/security/capabilities/document-acl-closure.json` and `tests/security/document-acl-capability.test.ts` — final leaf-owned fragment and protected-artifact map after all evidence exists.
- Modify in Task 6: `deploy/security/protected-artifact-owners.json` and both downstream extension-contract tests — activate only Leaf 6's reserved seam, reserve Leaf 11's baseline, and prove producer/core paths stay byte-identical.
- Create: `tests/documents/history-routes.test.ts`, modify `tests/components/metadata-panel.test.tsx`.
- Maintain after disclosure review: `wiki/Auth And Permissions Workflow.md`, `wiki/Document Editing Workflow.md`, `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`.

### Task 1: Workspace-Role Permission Ceilings and Batch Access

**Files:**
- Modify: `lib/permissions/document.ts`
- Create: `lib/permissions/document-access.ts`
- Modify: `lib/authorization/downstream/leaf6-document-access.ts`
- Create: `lib/permissions/document-grants.ts`
- Create: `lib/permissions/document-journal-replay.ts`
- Modify: `tests/permissions/document.test.ts`
- Create: `tests/permissions/document-access.test.ts`
- Create: `tests/permissions/document-grants.test.ts`
- Create: `tests/permissions/document-journal-replay.test.ts`
- Modify: `tests/security/active-membership-consumers.test.ts`

**Interfaces:**
- Consumes: Issue 5 `getDocumentAccessForActor()` call sites through the exact reserved Leaf 6 seam, Issue 2 `appendSecurityJournalEvent()`, and Prisma `Permission`, `WorkspaceMember`, and `OrganizationMember` rows.
- Produces: `workspaceRolePermissionCeiling(role)`, `effectiveDocumentPermission(input)`, `loadDocumentAccessMap(db, input): Promise<Map<string, DocumentAccessDecision>>`, the version-1 Leaf 6 seam implementation, `setDocumentPermission()`, and exact `leaf6JournalReplayReducers`; Tasks 2–5 and Issue 9 consume the access map.

- [ ] **Step 1: Write failing ceiling tests**

Add to `tests/permissions/document.test.ts`:

```ts
import {
  canReadDocument,
  canWriteDocument,
  effectiveDocumentPermission,
  workspaceRolePermissionCeiling,
} from "@/lib/permissions/document";
import { resolveActiveWorkspaceMembership } from "@/lib/workspaces/active-membership";

it.each([
  ["OWNER", "MANAGE"],
  ["ADMIN", "MANAGE"],
  ["EDITOR", "WRITE"],
  ["VIEWER", "READ"],
] as const)("caps %s at %s", (role, ceiling) => {
  expect(workspaceRolePermissionCeiling(role)).toBe(ceiling);
  expect(effectiveDocumentPermission({ workspaceRole: role, userPermission: "MANAGE" })).toBe(
    ceiling,
  );
});

it("does not let a VIEWER explicit WRITE row exceed the workspace ceiling", () => {
  expect(canWriteDocument({
    workspaceRole: "VIEWER",
    explicitPermissionCount: 1,
    userPermission: "WRITE",
  })).toBe(false);
  expect(canReadDocument({
    workspaceRole: "VIEWER",
    explicitPermissionCount: 1,
    userPermission: "WRITE",
  })).toBe(true);
});
```

Add one explicit subject-activation matrix: a nonexistent USER id, a deleted
WORKSPACE_MEMBER id, and an expired-unswept support membership are ignored and leave
`explicitPermissionCount` at zero; a real alternate user with a currently active
workspace membership activates the ACL but does not grant the actor; a same-organization
ORGANIZATION_MEMBER activates only while that member's user also has a current active
membership in this workspace. Pause support expiry on a row lock and require the later
statement-time resolver to deny without an application clock.

Extend `tests/security/active-membership-consumers.test.ts` to source-scan
`document-access.ts` and `document-grants.ts`: actor and USER/WORKSPACE_MEMBER subject
authorization must call `resolveActiveWorkspaceMembership`; a direct
`workspaceMember.findUnique` actor lookup or relation membership filter fails. Add an
expired-unswept support fixture proving no explicit USER, workspace-member, or
organization-member ACL can reactivate access through the expired workspace boundary.

Create `tests/permissions/document-access.test.ts`:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { loadDocumentAccessMap } from "@/lib/permissions/document-access";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("batch document access", () => {
  beforeEach(resetTestData);

  it("returns one capped decision per requested document", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.VIEWER);
    const documents = await Promise.all(["one", "two"].map((slug) =>
      prisma.document.create({
        data: {
          workspaceId: fixture.workspace.id,
          title: slug,
          slug,
          path: `/${slug}`,
          createdById: fixture.user.id,
          updatedById: fixture.user.id,
        },
      }),
    ));
    await prisma.permission.create({
      data: {
        resourceType: "DOCUMENT",
        resourceId: documents[0].id,
        subjectType: "USER",
        subjectId: fixture.user.id,
        permission: "MANAGE",
      },
    });
    const access = await loadDocumentAccessMap(prisma, {
    documentIds: documents.map(({ id }) => id),
    actorId: fixture.user.id,
    workspaceId: fixture.workspace.id,
    });
    expect(access.get(documents[0].id)).toMatchObject({ canRead: true, canWrite: false });
    expect(access.get(documents[1].id)).toMatchObject({ canRead: true, canWrite: false });
  });

  it("matches USER plus the actor's current workspace and organization membership tuples", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const workspaceMember = await prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: fixture.workspace.id, userId: fixture.user.id } },
    });
    const organizationMember = await prisma.organizationMember.create({
      data: {
        organizationId: fixture.organization.id,
        userId: fixture.user.id,
        role: "MEMBER",
      },
    });
    const subjects = [
      ["USER", fixture.user.id],
      ["WORKSPACE_MEMBER", workspaceMember.id],
      ["ORGANIZATION_MEMBER", organizationMember.id],
    ] as const;
    const documents = await Promise.all(subjects.map(async ([subjectType, subjectId], index) => {
      const document = await prisma.document.create({
        data: {
          workspaceId: fixture.workspace.id,
          title: `Subject ${index}`,
          slug: `subject-${index}`,
          path: `/subject-${index}`,
          createdById: fixture.user.id,
          updatedById: fixture.user.id,
        },
      });
      await prisma.permission.create({
        data: {
          resourceType: "DOCUMENT",
          resourceId: document.id,
          subjectType,
          subjectId,
          permission: "WRITE",
        },
      });
      return document;
    }));
    const access = await loadDocumentAccessMap(prisma, {
    documentIds: documents.map(({ id }) => id),
    actorId: fixture.user.id,
    workspaceId: fixture.workspace.id,
    });
    expect(documents.map(({ id }) => access.get(id)?.canWrite)).toEqual([true, true, true]);
  });

  it("ignores cross-tenant and stale membership subject ids", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const other = await seedWorkspaceFixture(WorkspaceRole.OWNER);
    const document = await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        title: "Tuple boundary",
        slug: "tuple-boundary",
        path: "/tuple-boundary",
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    const otherWorkspaceMember = await prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: other.workspace.id, userId: other.user.id } },
    });
    const otherOrganizationMember = await prisma.organizationMember.create({
      data: { organizationId: other.organization.id, userId: other.user.id, role: "MEMBER" },
    });
    const staleUser = await prisma.user.create({ data: { email: `stale-${crypto.randomUUID()}@example.com` } });
    const staleMembership = await prisma.workspaceMember.create({
      data: { workspaceId: fixture.workspace.id, userId: staleUser.id, role: "VIEWER" },
    });
    await prisma.permission.createMany({ data: [
      { resourceType: "DOCUMENT", resourceId: document.id, subjectType: "WORKSPACE_MEMBER", subjectId: otherWorkspaceMember.id, permission: "MANAGE" },
      { resourceType: "DOCUMENT", resourceId: document.id, subjectType: "ORGANIZATION_MEMBER", subjectId: otherOrganizationMember.id, permission: "MANAGE" },
      { resourceType: "DOCUMENT", resourceId: document.id, subjectType: "WORKSPACE_MEMBER", subjectId: staleMembership.id, permission: "MANAGE" },
    ] });
    await prisma.workspaceMember.delete({ where: { id: staleMembership.id } });
    const access = await loadDocumentAccessMap(prisma, {
      documentIds: [document.id],
      actorId: fixture.user.id,
      workspaceId: fixture.workspace.id,
    });
    expect(access.get(document.id)).toMatchObject({ explicitPermissionCount: 0, canWrite: true });
    const wrongWorkspace = await loadDocumentAccessMap(prisma, {
      documentIds: [document.id],
      actorId: other.user.id,
      workspaceId: other.workspace.id,
    });
    expect(wrongWorkspace.get(document.id)).toMatchObject({ canRead: false, canWrite: false });
  });
});
```

- [ ] **Step 2: Run ACL tests to verify red**

Run: `pnpm exec vitest run tests/permissions/document.test.ts tests/permissions/document-access.test.ts tests/permissions/document-grants.test.ts tests/permissions/document-journal-replay.test.ts tests/security/active-membership-consumers.test.ts --reporter=dot`

Expected: FAIL because exact subject validation, ceiling/batch exports, and atomic grant/revoke service are absent, and a VIEWER explicit `WRITE` currently returns `true`.

- [ ] **Step 3: Implement role ceilings**

In `lib/permissions/document.ts`, use this implementation:

```ts
const permissionRanks: Record<PermissionLevel, number> = { READ: 1, WRITE: 2, MANAGE: 3 };

export function workspaceRolePermissionCeiling(
  role: WorkspaceRole | null | undefined,
): PermissionLevel | null {
  if (role === "OWNER" || role === "ADMIN") return "MANAGE";
  if (role === "EDITOR") return "WRITE";
  if (role === "VIEWER") return "READ";
  return null;
}

export function effectiveDocumentPermission(input: {
  workspaceRole: WorkspaceRole | null | undefined;
  userPermission: PermissionLevel | null | undefined;
}): PermissionLevel | null {
  const ceiling = workspaceRolePermissionCeiling(input.workspaceRole);
  if (!ceiling || !input.userPermission) return null;
  return permissionRanks[input.userPermission] <= permissionRanks[ceiling]
    ? input.userPermission
    : ceiling;
}

export function canReadDocument(input: {
  workspaceRole: WorkspaceRole | null | undefined;
  explicitPermissionCount: number;
  userPermission: PermissionLevel | null | undefined;
}) {
  if (canManageWorkspace(input.workspaceRole)) return true;
  if (input.explicitPermissionCount === 0) return canReadWorkspace(input.workspaceRole);
  const effective = effectiveDocumentPermission(input);
  return Boolean(effective && permissionRanks[effective] >= permissionRanks.READ);
}

export function canWriteDocument(input: {
  workspaceRole: WorkspaceRole | null | undefined;
  explicitPermissionCount: number;
  userPermission: PermissionLevel | null | undefined;
}) {
  if (canManageWorkspace(input.workspaceRole)) return true;
  if (input.explicitPermissionCount === 0) return canWriteWorkspace(input.workspaceRole);
  const effective = effectiveDocumentPermission(input);
  return Boolean(effective && permissionRanks[effective] >= permissionRanks.WRITE);
}
```

- [ ] **Step 4: Implement batch access and update Issue 5 resolver**

Create `lib/permissions/document-access.ts`:

```ts
import type { PermissionLevel, Prisma, PrismaClient } from "@prisma/client";
import {
  canReadDocument,
  canWriteDocument,
  effectiveDocumentPermission,
  highestPermissionLevel,
} from "@/lib/permissions/document";

type AccessDb = Prisma.TransactionClient | PrismaClient;
export type DocumentAccessDecision = {
  explicitPermissionCount: number;
  userPermission: PermissionLevel | null;
  effectivePermission: PermissionLevel | null;
  canRead: boolean;
  canWrite: boolean;
};

export async function loadDocumentAccessMap(
  db: AccessDb,
  input: {
    documentIds: string[];
    actorId: string;
    workspaceId: string;
  },
) {
  const ids = [...new Set(input.documentIds)];
  if (ids.length === 0) return new Map<string, DocumentAccessDecision>();
  if (ids.length > 500) throw new Error("DOCUMENT_ACCESS_BATCH_TOO_LARGE");
  const documents = await db.document.findMany({
    where: { id: { in: ids }, workspaceId: input.workspaceId },
    select: { id: true, workspace: { select: { organizationId: true } } },
  });
  const documentIds = documents.map(({ id }) => id);
  const organizationId = documents[0]?.workspace.organizationId;
  const permissions = documentIds.length === 0 ? [] : await db.permission.findMany({
    where: { resourceType: "DOCUMENT", resourceId: { in: documentIds } },
    select: { resourceId: true, subjectType: true, subjectId: true, permission: true },
  });
  const userSubjectIds = [...new Set(permissions
    .filter(({ subjectType }) => subjectType === "USER")
    .map(({ subjectId }) => subjectId))];
  const workspaceMemberSubjectIds = permissions
    .filter(({ subjectType }) => subjectType === "WORKSPACE_MEMBER")
    .map(({ subjectId }) => subjectId);
  const organizationMemberSubjectIds = permissions
    .filter(({ subjectType }) => subjectType === "ORGANIZATION_MEMBER")
    .map(({ subjectId }) => subjectId);
  const activeMembership = await resolveActiveWorkspaceMembership(db, {
    workspaceId: input.workspaceId,
    userId: input.actorId,
  });
  const [workspaceMembers, organizationMembers, actorOrganizationMember] = await Promise.all([
    db.workspaceMember.findMany({
      where: { id: { in: workspaceMemberSubjectIds }, workspaceId: input.workspaceId },
      select: { id: true, userId: true },
    }),
    organizationId ? db.organizationMember.findMany({
      where: { id: { in: organizationMemberSubjectIds }, organizationId },
      select: { id: true, userId: true },
    }) : Promise.resolve([]),
    organizationId ? db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: input.actorId } },
      select: { id: true },
    }) : Promise.resolve(null),
  ]);
  const subjectUserIds = [...new Set([
    ...userSubjectIds,
    ...workspaceMembers.map(({ userId }) => userId),
    ...organizationMembers.map(({ userId }) => userId),
  ])];
  const activeSubjectMemberships = new Map(await Promise.all(subjectUserIds.map(async (userId) => [
    userId,
    await resolveActiveWorkspaceMembership(db, {
      workspaceId: input.workspaceId,
      userId,
    }),
  ] as const)));
  const validUsers = new Set(userSubjectIds.filter((userId) =>
    Boolean(activeSubjectMemberships.get(userId))));
  const validWorkspaceMembers = new Set(workspaceMembers
    .filter((row) => activeSubjectMemberships.get(row.userId)?.membershipId === row.id)
    .map(({ id }) => id));
  const validOrganizationMembers = new Set(organizationMembers
    .filter((row) => Boolean(activeSubjectMemberships.get(row.userId)))
    .map(({ id }) => id));
  const actorSubjects = new Set([
    `USER:${input.actorId}`,
    ...(activeMembership ? [`WORKSPACE_MEMBER:${activeMembership.membershipId}`] : []),
    ...(actorOrganizationMember ? [`ORGANIZATION_MEMBER:${actorOrganizationMember.id}`] : []),
  ]);
  const validRows = permissions.filter((row) => {
    if (row.subjectType === "USER") return validUsers.has(row.subjectId);
    if (row.subjectType === "WORKSPACE_MEMBER") return validWorkspaceMembers.has(row.subjectId);
    return validOrganizationMembers.has(row.subjectId);
  });
  const countById = new Map<string, number>();
  const permissionsById = new Map<string, PermissionLevel[]>();
  for (const row of validRows) {
    countById.set(row.resourceId, (countById.get(row.resourceId) ?? 0) + 1);
    if (actorSubjects.has(`${row.subjectType}:${row.subjectId}`)) {
      permissionsById.set(row.resourceId, [
        ...(permissionsById.get(row.resourceId) ?? []),
        row.permission,
      ]);
    }
  }
  const existing = new Set(documentIds);
  return new Map(ids.map((documentId) => {
    if (!existing.has(documentId) || !activeMembership) return [documentId, {
      explicitPermissionCount: 0,
      userPermission: null,
      effectivePermission: null,
      canRead: false,
      canWrite: false,
    }];
    const explicitPermissionCount = countById.get(documentId) ?? 0;
    const userPermission = highestPermissionLevel(permissionsById.get(documentId) ?? []);
    const permissionInput = { workspaceRole: activeMembership.role, explicitPermissionCount, userPermission };
    return [documentId, {
      explicitPermissionCount,
      userPermission,
      effectivePermission: effectiveDocumentPermission(permissionInput),
      canRead: canReadDocument(permissionInput),
      canWrite: canWriteDocument(permissionInput),
    }];
  }));
}
```

The raw WorkspaceMember/OrganizationMember reads above recover only immutable
membership-id → user-id hints. A subject enters `validRows` only when the canonical
two-argument active resolver confirms that user in this workspace and, for a
WORKSPACE_MEMBER subject, returns that exact membership id. USER subjects require the
same active result; ORGANIZATION_MEMBER subjects additionally require the exact current
same-organization row. Nonexistent and expired-unswept support subjects therefore do not
increase `explicitPermissionCount`.

Do not change Issue 5's `lib/authorization/active-resources.ts`. Change only the
reserved `lib/authorization/downstream/leaf6-document-access.ts` implementation so its
frozen function calls `loadDocumentAccessMap()` for one id and returns that decision;
it must not perform a second raw `Permission` query. Preserve the exact Issue 5-created
version-0 owner-map reservation while implementing these bytes. Task 6 performs the
single version-1 ACTIVE transition after every evidence file exists and rejects a Leaf
6 claim on Issue 5 core or any byte change to `lib/authorization/active-resources.ts`.

Create `lib/permissions/document-grants.ts`:

```ts
import { randomUUID } from "node:crypto";
import { Prisma, type PermissionLevel, type PermissionSubjectType } from "@prisma/client";
import { appendSecurityJournalEvent, deriveSecurityJournalOperationId } from "@/lib/security/journal";
import { lockDocumentBoundary } from "@/lib/authorization/active-resource-locks";
import {
  resolveActiveDocumentForActor,
  resolveActiveWorkspaceForActorForUpdate,
} from "@/lib/authorization/active-resources";
import { prisma } from "@/lib/db/client";
import { highestPermissionLevel } from "@/lib/permissions/document";
import { assertCanManageWorkspace } from "@/lib/permissions/workspace";

const rank: Record<PermissionLevel, number> = { READ: 1, WRITE: 2, MANAGE: 3 };

async function assertCurrentSubject(tx: Prisma.TransactionClient, input: {
  subjectType: PermissionSubjectType;
  subjectId: string;
  workspaceId: string;
  organizationId: string;
}) {
  if (input.subjectType === "USER") {
    return Boolean(await resolveActiveWorkspaceMembership(tx, {
      workspaceId: input.workspaceId,
      userId: input.subjectId,
    }));
  }
  if (input.subjectType === "WORKSPACE_MEMBER") {
    const row = await tx.workspaceMember.findFirst({
      where: { id: input.subjectId, workspaceId: input.workspaceId },
      select: { id: true, userId: true },
    });
    if (!row) return false;
    const active = await resolveActiveWorkspaceMembership(tx, {
      workspaceId: input.workspaceId,
      userId: row.userId,
    });
    return active?.membershipId === row.id;
  }
  const organizationMember = await tx.organizationMember.findFirst({
    where: { id: input.subjectId, organizationId: input.organizationId },
    select: { id: true, userId: true },
  });
  if (!organizationMember) return false;
  return Boolean(await resolveActiveWorkspaceMembership(tx, {
    workspaceId: input.workspaceId,
    userId: organizationMember.userId,
  }));
}

export async function setDocumentPermission(input: {
  documentId: string;
  actorId: string;
  subjectType: PermissionSubjectType;
  subjectId: string;
  permission: PermissionLevel | null;
}, deps: { appendJournal?: typeof appendSecurityJournalEvent } = {}) {
  const rootOperationId = randomUUID();
  return prisma.$transaction(async (tx) => {
    const [identity] = await tx.$queryRaw<Array<{ workspaceId: string }>>(Prisma.sql`
      SELECT "workspaceId" AS "workspaceId"
      FROM "Document" WHERE "id" = ${input.documentId}
    `);
    if (!identity) throw new Error("DOCUMENT_NOT_FOUND");
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
    assertCanManageWorkspace(resolved.role);
    if (!await assertCurrentSubject(tx, {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      workspaceId: resolved.workspace.id,
      organizationId: resolved.workspace.organizationId,
    })) throw new Error("DOCUMENT_PERMISSION_SUBJECT_INVALID");
    const previousRows = await tx.permission.findMany({
      where: {
        resourceType: "DOCUMENT",
        resourceId: input.documentId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
      },
      orderBy: { id: "asc" },
      select: { id: true, permission: true },
    });
    const previous = highestPermissionLevel(previousRows.map(({ permission }) => permission));
    await tx.permission.deleteMany({
      where: {
        resourceType: "DOCUMENT",
        resourceId: input.documentId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
      },
    });
    const current = input.permission ? await tx.permission.create({
      data: {
        resourceType: "DOCUMENT",
        resourceId: input.documentId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        permission: input.permission,
      },
    }) : null;
    const reducing = previous !== null && (input.permission === null || rank[input.permission] < rank[previous]);
    const reducedRows = reducing ? previousRows.filter((row) =>
      input.permission === null || rank[input.permission] < rank[row.permission]) : [];
    for (const prior of reducedRows) await (deps.appendJournal ?? appendSecurityJournalEvent)(tx, {
      kind: "DOCUMENT_PERMISSION_REDUCED",
      subjectType: "DOCUMENT_PERMISSION",
      subjectId: prior.id,
      operationId: deriveSecurityJournalOperationId({
        rootOperationId,
        kind: "DOCUMENT_PERMISSION_REDUCED",
        subjectType: "DOCUMENT_PERMISSION",
        subjectId: prior.id,
      }),
      payload: { stateCode: "DOCUMENT_PERMISSION_REDUCED", stateVersion: 1 },
    });
    return current;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
```

Create `tests/permissions/document-grants.test.ts`:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { setDocumentPermission } from "@/lib/permissions/document-grants";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

async function fixtureWithWriteGrant() {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.OWNER);
  const target = await prisma.user.create({
    data: { email: `grant-target-${crypto.randomUUID()}@example.com` },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: fixture.workspace.id, userId: target.id, role: "EDITOR" },
  });
  const document = await prisma.document.create({
    data: {
      workspaceId: fixture.workspace.id,
      title: "Grant target",
      slug: "grant-target",
      path: "/grant-target",
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
    },
  });
  await prisma.permission.create({
    data: {
      resourceType: "DOCUMENT",
      resourceId: document.id,
      subjectType: "USER",
      subjectId: target.id,
      permission: "WRITE",
    },
  });
  return { fixture, target, document };
}

describe("document permission mutation journal", () => {
  beforeEach(resetTestData);

  it("journals downgrade but never upgrade", async () => {
    const { fixture, target, document } = await fixtureWithWriteGrant();
    const appendJournal = vi.fn().mockResolvedValue({ sequence: 1n, eventHash: "synthetic" });
    await setDocumentPermission({
      documentId: document.id,
      actorId: fixture.user.id,
      subjectType: "USER",
      subjectId: target.id,
      permission: "READ",
    }, { appendJournal });
    expect(appendJournal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      kind: "DOCUMENT_PERMISSION_REDUCED",
      subjectType: "DOCUMENT_PERMISSION",
      subjectId: expect.any(String),
      payload: { stateCode: "DOCUMENT_PERMISSION_REDUCED", stateVersion: 1 },
    }));
    appendJournal.mockClear();
    await setDocumentPermission({
      documentId: document.id,
      actorId: fixture.user.id,
      subjectType: "USER",
      subjectId: target.id,
      permission: "WRITE",
    }, { appendJournal });
    expect(appendJournal).not.toHaveBeenCalled();
  });

  it("rolls back a revoke when the same-transaction journal append fails", async () => {
    const { fixture, target, document } = await fixtureWithWriteGrant();
    await expect(setDocumentPermission({
      documentId: document.id,
      actorId: fixture.user.id,
      subjectType: "USER",
      subjectId: target.id,
      permission: null,
    }, {
      appendJournal: vi.fn().mockRejectedValue(new Error("journal unavailable")),
    })).rejects.toThrow("journal unavailable");
    await expect(prisma.permission.findFirstOrThrow({
      where: { resourceType: "DOCUMENT", resourceId: document.id, subjectId: target.id },
    })).resolves.toMatchObject({ permission: "WRITE" });
  });
});
```

Create `leaf6JournalReplayReducers` with exactly
`DOCUMENT_PERMISSION_REDUCED`. It requires Leaf 2's branded restore context and the
prior immutable Permission row/key in `subjectId`; a document parent id is invalid.
The reducer locks that row when present and idempotently removes/reduces access, never
creates a permission, raises a role, appends, or mutates journal/checkpoint state.

- [ ] **Step 5: Run ACL tests to verify green**

Run: `pnpm exec vitest run tests/permissions/document.test.ts tests/permissions/document-access.test.ts tests/permissions/document-grants.test.ts tests/permissions/document-journal-replay.test.ts tests/security/active-membership-consumers.test.ts tests/authorization/active-resources.test.ts --reporter=dot`

Expected: PASS; all three current subject tuples work, cross-tenant/stale tuples are ignored, a VIEWER remains read-only under a legacy `MANAGE` row, and downgrade plus journal append commit or roll back together.

- [ ] **Step 6: Commit the ACL core**

```bash
pnpm wiki:install-hooks
git add lib/permissions/document.ts lib/permissions/document-access.ts lib/permissions/document-grants.ts lib/permissions/document-journal-replay.ts lib/authorization/downstream/leaf6-document-access.ts tests/permissions/document.test.ts tests/permissions/document-access.test.ts tests/permissions/document-grants.test.ts tests/permissions/document-journal-replay.test.ts tests/security/active-membership-consumers.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: cap document permissions by workspace role"
```

Expected: commit succeeds with the local plan/spec unstaged.

### Task 2: Atomic Descendant Folder ACL Enforcement

**Files:**
- Modify: `lib/folders/service.ts`
- Modify: `tests/folders/service.test.ts`

**Interfaces:**
- Consumes: Issue 5 `resolveActiveWorkspaceForActorForUpdate()` / `lockFolderTreeForUpdate()` and Task 1 `loadDocumentAccessMap()`.
- Produces: `assertCanWriteAllDocuments(...)`; folder rename/move/cascade archive consume the already locked, immutable-id-sorted Document set from Issue 5's `lockFolderTreeForUpdate()` before their first write.

- [ ] **Step 1: Write mixed-ACL failing tests**

Add to `tests/folders/service.test.ts`:

```ts
it.each(["rename", "move", "archive"] as const)(
  "atomically rejects %s when one active descendant is not writable",
  async (operation) => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const root = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "Restricted Tree",
    });
    const child = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: root.id,
      name: "Child",
    });
    const allowed = await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        folderId: root.id,
        title: "Allowed",
        slug: "allowed",
        path: "/restricted-tree/allowed",
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    const denied = await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        folderId: child.id,
        title: "Denied",
        slug: "denied",
        path: "/restricted-tree/child/denied",
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    const alternate = await prisma.user.create({
      data: { email: `alternate-${crypto.randomUUID()}@example.test` },
    });
    await prisma.workspaceMember.create({
      data: {
        workspaceId: fixture.workspace.id,
        userId: alternate.id,
        role: "EDITOR",
      },
    });
    await prisma.permission.create({
      data: {
        resourceType: "DOCUMENT",
        resourceId: denied.id,
        subjectType: "USER",
        subjectId: alternate.id,
        permission: "WRITE",
      },
    });
    const action = operation === "rename"
      ? renameFolder({ folderId: root.id, actorId: fixture.user.id, name: "Changed" })
      : operation === "move"
        ? moveFolder({ folderId: root.id, actorId: fixture.user.id, parentFolderId: null })
        : archiveFolder({ folderId: root.id, actorId: fixture.user.id, cascade: true });
    await expect(action).rejects.toThrow("DOCUMENT_WRITE_FORBIDDEN");
    await expect(prisma.folder.findUniqueOrThrow({ where: { id: root.id } })).resolves.toMatchObject({
      name: "Restricted Tree",
      status: "ACTIVE",
    });
    await expect(prisma.document.findMany({
      where: { id: { in: [allowed.id, denied.id] } },
      orderBy: { title: "asc" },
      select: { status: true },
    })).resolves.toEqual([{ status: "ACTIVE" }, { status: "ACTIVE" }]);
  },
);
```

- [ ] **Step 2: Run folder tests to verify red**

Run: `pnpm exec vitest run tests/folders/service.test.ts --reporter=dot`

Expected: FAIL because folder mutations currently authorize only the workspace role and mutate unreadable descendants.

- [ ] **Step 3: Implement descendant discovery and authorization**

Add to `lib/folders/service.ts`:

```ts
async function assertCanWriteAllDocuments(
  tx: Prisma.TransactionClient,
  input: {
    documentIds: string[];
    actorId: string;
    workspaceId: string;
  },
) {
  const access = await loadDocumentAccessMap(tx, input);
  if (input.documentIds.some((documentId) => !access.get(documentId)?.canWrite)) {
    throw new Error("DOCUMENT_WRITE_FORBIDDEN");
  }
}
```

Use the immutable folder/workspace identity only as an unlocked hint. Take the actor
archive advisory where applicable, then call Issue 5's
`resolveActiveWorkspaceForActorForUpdate()` so Workspace → WorkspaceMember → optional
SupportAccessGrant are locked and the canonical role is known before
`lockFolderTreeForUpdate()` acquires sorted Folder → Document locks. Before the first
`update`, call:

```ts
const lockedActor = await resolveActiveWorkspaceForActorForUpdate(tx, {
  workspaceId: folder.workspaceId,
  actorId: input.actorId,
  access: "write",
});
const tree = await lockFolderTreeForUpdate(tx, folder.workspaceId, folder.id);
const documentIds = tree.documents
  .filter(({ status, archivedAt }) => status === "ACTIVE" && archivedAt === null)
  .map(({ id }) => id);
await assertCanWriteAllDocuments(tx, {
  documentIds,
  actorId: input.actorId,
  workspaceId: folder.workspaceId,
});
assertCanWriteWorkspace(lockedActor.role);
```

Apply this call to rename, move, and cascade archive. `loadDocumentAccessMap()` performs
its own canonical active-membership recheck and has no role parameter, so relation-loaded
workspace members cannot become authority. Non-cascade archive still checks an empty
folder and therefore authorizes an empty list. Extend
`tests/security/active-membership-consumers.test.ts` to scan `lib/folders/service.ts` and
to expire support access while the folder transaction waits; the post-lock statement
must deny before any write.

- [ ] **Step 4: Run folder tests to verify green**

Run: `pnpm exec vitest run tests/folders/service.test.ts tests/permissions/document-access.test.ts --reporter=dot`

Expected: PASS; every mixed-ACL case leaves folder/document rows unchanged.

- [ ] **Step 5: Commit descendant enforcement**

```bash
git add lib/folders/service.ts tests/folders/service.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: authorize folder descendants atomically"
```

Expected: commit succeeds after green tests.

### Task 3: Broken-Link Source ACL and Link Combination Matrix

**Files:**
- Modify: `lib/documents/service.ts`
- Modify: `tests/documents/service.test.ts`

**Interfaces:**
- Consumes: Issue 5 `resolveActiveWorkspaceForActorForUpdate()` / `lockDocumentBoundary()` / `resolveActiveDocumentForActor()` and Task 1 role ceilings.
- Produces: `createDocumentFromBrokenLink()` authorizes `DocumentLink.sourceDocumentId` for write in the same transaction before target creation.

- [ ] **Step 1: Write failing source/role tests**

Add to `tests/documents/service.test.ts`:

```ts
it("rejects broken-link creation when the source document is not writable", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const source = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title: "Restricted Source",
    contentMarkdown: "[[New Target]]",
  });
  const link = await prisma.documentLink.findFirstOrThrow({
    where: { sourceDocumentId: source.id, isBroken: true },
  });
  const alternate = await prisma.user.create({
    data: { email: `link-alternate-${crypto.randomUUID()}@example.test` },
  });
  await prisma.workspaceMember.create({
    data: {
      workspaceId: fixture.workspace.id,
      userId: alternate.id,
      role: "EDITOR",
    },
  });
  await prisma.permission.create({
    data: {
      resourceType: "DOCUMENT",
      resourceId: source.id,
      subjectType: "USER",
      subjectId: alternate.id,
      permission: "WRITE",
    },
  });
  await expect(createDocumentFromBrokenLink({
    linkId: link.id,
    actorId: fixture.user.id,
  })).rejects.toThrow("DOCUMENT_WRITE_FORBIDDEN");
  await expect(prisma.document.count({
    where: { workspaceId: fixture.workspace.id, title: "New Target" },
  })).resolves.toBe(0);
});

it("keeps a VIEWER read-only even when a legacy source permission says WRITE", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.VIEWER);
  const source = await prisma.document.create({
    data: {
      workspaceId: fixture.workspace.id,
      title: "Viewer Source",
      slug: "viewer-source",
      path: "/viewer-source",
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
    },
  });
  await prisma.permission.create({
    data: {
      resourceType: "DOCUMENT",
      resourceId: source.id,
      subjectType: "USER",
      subjectId: fixture.user.id,
      permission: "WRITE",
    },
  });
  await expect(updateDocument({
    documentId: source.id,
    actorId: fixture.user.id,
    title: source.title,
    contentMarkdown: "changed",
  })).rejects.toThrow("WORKSPACE_WRITE_FORBIDDEN");
});
```

- [ ] **Step 2: Run broken-link tests to verify red**

Run: `pnpm exec vitest run tests/documents/service.test.ts --reporter=dot`

Expected: FAIL because current broken-link creation authorizes only workspace read/write and ignores source explicit ACL.

- [ ] **Step 3: Authorize the source inside the transaction**

In `createDocumentFromBrokenLink()`, load only immutable link identity first:

```ts
const linkIdentity = await prisma.documentLink.findUnique({
  where: { id: input.linkId },
  select: { id: true, sourceDocumentId: true },
});
if (!linkIdentity) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_LINK_NOT_FOUND);
```

Then perform the complete authorization/reload under lock:

```ts
const created = await runWithDocumentSlugRetry(() => prisma.$transaction(async (tx) => {
  const sourceIdentity = await tx.document.findUnique({
    where: { id: linkIdentity.sourceDocumentId },
    select: { workspaceId: true },
  });
  if (!sourceIdentity) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_LINK_NOT_FOUND);
  const lockedActor = await resolveActiveWorkspaceForActorForUpdate(tx, {
    workspaceId: sourceIdentity.workspaceId,
    actorId: input.actorId,
    access: "write",
  });
  await lockDocumentBoundary(
    tx,
    linkIdentity.sourceDocumentId,
    lockedActor.workspace.id,
  );
  const source = await resolveActiveDocumentForActor(tx, {
    documentId: linkIdentity.sourceDocumentId,
    actorId: input.actorId,
    access: "write",
  });
  const link = await tx.documentLink.findFirst({
    where: {
      id: linkIdentity.id,
      sourceDocumentId: source.document.id,
      workspaceId: source.workspace.id,
      isBroken: true,
    },
  });
  if (!link) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_LINK_NOT_FOUND);
  const target = await getBrokenLinkCreateInput(tx, {
    workspaceId: source.workspace.id,
    targetTitleRaw: link.targetTitleRaw,
  });
  const document = await createDocumentWithInitialVersion(tx, {
    workspaceId: source.workspace.id,
    actorId: input.actorId,
    folderId: target.folderId,
    title: target.title,
    contentMarkdown: "",
    changeSummary: "Created from broken wiki link",
  });
  await repairBrokenLinksForTarget(tx, {
    workspaceId: source.workspace.id,
    targetDocumentId: document.id,
    targetTitle: link.targetTitleRaw,
  });
  await writeAuditLog(tx, {
    organizationId: source.workspace.organizationId,
    actorId: input.actorId,
    action: "document.created_from_broken_link",
    resourceType: "document",
    resourceId: document.id,
    metadata: { repairedLinkId: link.id },
  });
  return document;
}));
```

- [ ] **Step 4: Run broken-link tests to verify green**

Run: `pnpm exec vitest run tests/documents/service.test.ts tests/permissions/document.test.ts --reporter=dot`

Expected: PASS; denied source combinations create no target and no audit row.

- [ ] **Step 5: Commit broken-link authorization**

```bash
git add lib/documents/service.ts tests/documents/service.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: authorize broken-link source documents"
```

Expected: commit succeeds after the focused tests pass.

### Task 4: Minimal Current-View DTO and Query-Bound Cursors

**Files:**
- Create: `lib/http/signed-document-cursor.ts`
- Create: `lib/documents/current-view.ts`
- Create: `lib/documents/downstream/leaf11-attachments.ts`
- Create: `tests/http/signed-document-cursor.test.ts`
- Create: `tests/documents/current-view.test.ts`
- Create: `tests/security/document-downstream-extension-contract.test.ts`

**Interfaces:**
- Consumes: Issue 5 active resolver and Task 1 batch ACL.
- Produces: `CurrentDocumentDto`, `loadCurrentDocumentAttachmentIds(db, documentId)`, `loadCurrentDocumentView()`, `encodeDocumentCursor()`, and `decodeDocumentCursor()` for Task 5 routes plus the separately protected Leaf 11 projection seam. Cursor payload is `{ kind, workspaceId, documentId, createdAt, id }`. Issue 11 rebases on this exact slot and changes only its implementation to verified `READY` rows without changing the frozen function or DTO shapes.

- [ ] **Step 1: Write failing DTO/cursor tests**

Create `tests/http/signed-document-cursor.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  decodeDocumentCursor,
  encodeDocumentCursor,
} from "@/lib/http/signed-document-cursor";

it("binds a signed cursor to kind, workspace, and document", () => {
  const cursor = encodeDocumentCursor({
    kind: "versions",
    workspaceId: "workspace-1",
    documentId: "document-1",
    createdAt: "2026-07-11T00:00:00.000Z",
    id: "version-1",
  }, "test-cursor-secret-at-least-32-bytes");
  expect(decodeDocumentCursor(cursor, {
    kind: "versions",
    workspaceId: "workspace-1",
    documentId: "document-1",
  }, "test-cursor-secret-at-least-32-bytes")).toMatchObject({ id: "version-1" });
  expect(() => decodeDocumentCursor(cursor, {
    kind: "audit",
    workspaceId: "workspace-1",
    documentId: "document-1",
  }, "test-cursor-secret-at-least-32-bytes")).toThrow("INVALID_CURSOR");
});

it("rejects oversized/noncanonical cursors and authenticates before JSON parsing", () => {
  const parse = vi.spyOn(JSON, "parse");
  const invalidBody = Buffer.from("not-json").toString("base64url");
  expect(() => decodeDocumentCursor(`${invalidBody}.${"A".repeat(43)}`, {
    kind: "versions",
    workspaceId: "workspace-1",
    documentId: "document-1",
  }, "test-cursor-secret-at-least-32-bytes")).toThrow("INVALID_CURSOR");
  expect(parse).not.toHaveBeenCalled();
  expect(() => decodeDocumentCursor("x".repeat(2_049), {
    kind: "versions",
    workspaceId: "workspace-1",
    documentId: "document-1",
  }, "test-cursor-secret-at-least-32-bytes")).toThrow("INVALID_CURSOR");
});

it("rejects an HMAC created without the document-cursor domain", () => {
  const body = Buffer.from(JSON.stringify({
    kind: "versions", workspaceId: "workspace-1", documentId: "document-1",
    createdAt: "2026-07-11T00:00:00.000Z", id: "version-1",
  })).toString("base64url");
  const signature = createHmac("sha256", "test-cursor-secret-at-least-32-bytes")
    .update(body).digest("base64url");
  expect(() => decodeDocumentCursor(`${body}.${signature}`, {
    kind: "versions", workspaceId: "workspace-1", documentId: "document-1",
  }, "test-cursor-secret-at-least-32-bytes")).toThrow("INVALID_CURSOR");
});
```

Create `tests/documents/current-view.test.ts`:

```ts
it("returns only current fields, attachment ids, and bound endpoints", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const document = await prisma.document.create({
    data: {
      workspaceId: fixture.workspace.id,
      title: "Minimal",
      slug: "minimal",
      path: "/minimal",
      contentMarkdown: "# Minimal",
      contentText: "Minimal",
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
      versions: { create: {
        versionNumber: 1, title: "Minimal", contentMarkdown: "# Historical body",
        createdById: fixture.user.id,
      } },
      attachments: { create: {
        fileName: "minimal.txt", mimeType: "text/plain", size: 9,
        storageKey: "synthetic/private/key", uploadedById: fixture.user.id,
      } },
    },
    include: { attachments: true },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: fixture.organization.id,
      actorId: fixture.user.id,
      action: "document.updated",
      resourceType: "document",
      resourceId: document.id,
      metadataJson: { private: "must not serialize" },
    },
  });
  const result = await loadCurrentDocumentView({
    workspaceSlug: fixture.workspace.slug,
    documentId: document.id,
    actorId: fixture.user.id,
  });
  expect(result).toEqual({
    document: { id: document.id, title: "Minimal", contentMarkdown: "# Minimal" },
    canWrite: true,
    attachmentIds: [document.attachments[0].id],
    attachmentsEndpoint: `/api/workspaces/${fixture.workspace.slug}/documents/${document.id}/attachments`,
    versionsEndpoint: `/api/workspaces/${fixture.workspace.slug}/documents/${document.id}/versions`,
    auditEndpoint: `/api/workspaces/${fixture.workspace.slug}/documents/${document.id}/audit`,
  });
  expect(JSON.stringify(result)).not.toMatch(
    /storageKey|uploadedById|contentText|createdById|Historical body|must not serialize|organizationId/,
  );
});
```

- [ ] **Step 2: Run DTO/cursor tests to verify red**

Run: `pnpm exec vitest run tests/http/signed-document-cursor.test.ts tests/documents/current-view.test.ts tests/security/document-downstream-extension-contract.test.ts --reporter=dot`

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement signed cursors**

Create `lib/http/signed-document-cursor.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  assertValidAuthRuntimeEnv,
  deriveAuthRuntimeSubkey,
} from "@/lib/auth/runtime";

export type DocumentCursorKind = "versions" | "audit" | "attachments";
export type DocumentCursorPayload = {
  kind: DocumentCursorKind;
  workspaceId: string;
  documentId: string;
  createdAt: string;
  id: string;
};

const CURSOR_DOMAIN = Buffer.from("munjib-document-cursor-v1\0", "utf8");
const MAX_CURSOR_CHARS = 2_048;
const MAX_CURSOR_BODY_BYTES = 768;
const EXACT_KEYS = ["createdAt", "documentId", "id", "kind", "workspaceId"] as const;

let cachedCursorKey: Buffer | undefined;

function cursorKey(value?: Uint8Array) {
  if (value) {
    if (value.byteLength !== 32) throw new Error("CURSOR_SECRET_INVALID");
    return Buffer.from(value);
  }
  cachedCursorKey ??= Buffer.from(deriveAuthRuntimeSubkey(
    assertValidAuthRuntimeEnv(process.env),
    "document-cursor-v1",
  ));
  return cachedCursorKey;
}

function canonicalPayload(payload: DocumentCursorPayload) {
  const createdAtMs = typeof payload.createdAt === "string" ? Date.parse(payload.createdAt) : NaN;
  if (
    !["versions", "audit", "attachments"].includes(payload.kind) ||
    typeof payload.workspaceId !== "string" || !payload.workspaceId || payload.workspaceId.length > 191 ||
    typeof payload.documentId !== "string" || !payload.documentId || payload.documentId.length > 191 ||
    typeof payload.id !== "string" || !payload.id || payload.id.length > 191 ||
    !Number.isFinite(createdAtMs) || new Date(createdAtMs).toISOString() !== payload.createdAt
  ) throw new Error("INVALID_CURSOR");
  return JSON.stringify({
    kind: payload.kind,
    workspaceId: payload.workspaceId,
    documentId: payload.documentId,
    createdAt: payload.createdAt,
    id: payload.id,
  });
}

function signature(body: string, key?: Uint8Array) {
  return createHmac("sha256", cursorKey(key))
    .update(CURSOR_DOMAIN)
    .update(body, "ascii")
    .digest();
}

export function encodeDocumentCursor(payload: DocumentCursorPayload, key?: Uint8Array) {
  const canonical = canonicalPayload(payload);
  if (Buffer.byteLength(canonical) > MAX_CURSOR_BODY_BYTES) throw new Error("INVALID_CURSOR");
  const body = Buffer.from(canonical).toString("base64url");
  const mac = signature(body, key).toString("base64url");
  const cursor = `${body}.${mac}`;
  if (cursor.length > MAX_CURSOR_CHARS) throw new Error("INVALID_CURSOR");
  return cursor;
}

export function decodeDocumentCursor(
  cursor: string,
  expected: Pick<DocumentCursorPayload, "kind" | "workspaceId" | "documentId">,
  key?: Uint8Array,
) {
  if (!cursor || cursor.length > MAX_CURSOR_CHARS) throw new Error("INVALID_CURSOR");
  const parts = cursor.split(".");
  if (parts.length !== 2) throw new Error("INVALID_CURSOR");
  const [body, suppliedSignature] = parts;
  if (!body || !/^[A-Za-z0-9_-]{43}$/.test(suppliedSignature)) {
    throw new Error("INVALID_CURSOR");
  }
  const expectedSignature = signature(body, key);
  const supplied = Buffer.from(suppliedSignature, "base64url");
  if (supplied.toString("base64url") !== suppliedSignature ||
    supplied.length !== expectedSignature.length ||
    !timingSafeEqual(expectedSignature, supplied)) {
    throw new Error("INVALID_CURSOR");
  }

  let decoded: Buffer;
  let payload: unknown;
  try {
    decoded = Buffer.from(body, "base64url");
    if (decoded.byteLength > MAX_CURSOR_BODY_BYTES) throw new Error("oversized");
    payload = JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new Error("INVALID_CURSOR");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("INVALID_CURSOR");
  }
  const record = payload as Record<string, unknown>;
  if (Object.keys(record).sort().join("|") !== [...EXACT_KEYS].sort().join("|")) {
    throw new Error("INVALID_CURSOR");
  }
  const typed = record as DocumentCursorPayload;
  let canonicalBody: string;
  try { canonicalBody = Buffer.from(canonicalPayload(typed)).toString("base64url"); }
  catch { throw new Error("INVALID_CURSOR"); }
  if (
    typed.kind !== expected.kind ||
    typed.workspaceId !== expected.workspaceId ||
    typed.documentId !== expected.documentId ||
    canonicalBody !== body
  ) throw new Error("INVALID_CURSOR");
  return typed;
}
```

Production callers omit the optional key and therefore use a process-cached 32-byte
subkey derived from Leaf 1's strictly validated `NEXTAUTH_SECRET_FILE` runtime config.
Tests pass a generated synthetic `Uint8Array(32)`. Add a source-contract assertion
that this module never reads `process.env.NEXTAUTH_SECRET`,
`process.env.GOOGLE_CLIENT_SECRET`, or a secret file directly and never returns/logs
the root auth secret or derived key. Rotation is restart-based so one process never
mixes cursor keys.

- [ ] **Step 4: Implement the current-view loader**

Create `lib/documents/current-view.ts`:

```ts
import { prisma } from "@/lib/db/client";
import { resolveActiveDocumentForActor } from "@/lib/authorization/active-resources";
import { loadLeaf11CurrentDocumentAttachmentIds } from "@/lib/documents/downstream/leaf11-attachments";
import type { Prisma, PrismaClient } from "@prisma/client";

type CurrentViewDb = Prisma.TransactionClient | PrismaClient;

export async function loadCurrentDocumentAttachmentIds(
  db: CurrentViewDb,
  documentId: string,
) {
  return loadLeaf11CurrentDocumentAttachmentIds(db, documentId);
}

export type CurrentDocumentDto = {
  document: { id: string; title: string; contentMarkdown: string };
  canWrite: boolean;
  attachmentIds: string[];
  attachmentsEndpoint: string;
  versionsEndpoint: string;
  auditEndpoint: string;
};

export async function loadCurrentDocumentView(input: {
  workspaceSlug: string;
  documentId: string;
  actorId: string;
}): Promise<CurrentDocumentDto> {
  const resolved = await resolveActiveDocumentForActor(prisma, {
    documentId: input.documentId,
    actorId: input.actorId,
    access: "read",
  });
  if (resolved.workspace.slug !== input.workspaceSlug) throw new Error("DOCUMENT_NOT_FOUND");
  const attachmentIds = await loadCurrentDocumentAttachmentIds(prisma, resolved.document.id);
  const base = `/api/workspaces/${encodeURIComponent(input.workspaceSlug)}/documents/${resolved.document.id}`;
  return {
    document: {
      id: resolved.document.id,
      title: resolved.document.title,
      contentMarkdown: resolved.document.contentMarkdown,
    },
    canWrite: resolved.access.canWrite,
    attachmentIds,
    attachmentsEndpoint: `${base}/attachments`,
    versionsEndpoint: `${base}/versions`,
    auditEndpoint: `${base}/audit`,
  };
}
```

Create `lib/documents/downstream/leaf11-attachments.ts` with the exact legacy
attachment queries removed from the current-view wrapper above and the Task 5 history
service below. It exports only the frozen functions
`loadLeaf11CurrentDocumentAttachmentIds(db, documentId): Promise<string[]>` and
`listLeaf11HistoryAttachments(db, input): Promise<readonly { id; fileName; mimeType;
size; createdAt: Date }[]>`; the
baseline selects the existing document's attachment IDs/minimal history fields in
stable order and imports no Leaf 11 helper. Keep those baseline bytes fixed for Task
6, but do not publish the reservation in this task. Task 6 records its exact hash at
version 0, state `RESERVED`, owner `attachment-integrity-lifecycle`, and creator
`document-acl-closure` after every Leaf 6 evidence file exists.

At this task, `tests/security/document-downstream-extension-contract.test.ts` proves
both Leaf 6 core modules delegate to this seam and fixes the baseline bytes. Task 6
adds the owner-map/hash assertions proving Leaf 6 cannot claim or change the reserved
path after publication. The document ACL capability claims `current-view.ts` and
`history.ts`, never the slot whose owner is Leaf 11 from version 0.

- [ ] **Step 5: Run DTO/cursor tests to verify green**

Run: `pnpm exec vitest run tests/http/signed-document-cursor.test.ts tests/documents/current-view.test.ts tests/security/document-downstream-extension-contract.test.ts --reporter=dot`

Expected: PASS; the DTO snapshot has only the listed keys and cursor swapping returns `INVALID_CURSOR`.

- [ ] **Step 6: Commit DTO/cursor core**

```bash
git add lib/http/signed-document-cursor.ts lib/documents/current-view.ts lib/documents/downstream/leaf11-attachments.ts tests/http/signed-document-cursor.test.ts tests/documents/current-view.test.ts tests/security/document-downstream-extension-contract.test.ts wiki/Document\ Editing\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: minimize current document DTO"
```

Expected: commit succeeds after both focused tests pass.

### Task 5: Authenticated Paginated History Routes and Lazy Metadata UI

**Files:**
- Create: `lib/documents/history.ts`
- Create: `lib/documents/history-route.ts`
- Create: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/versions/route.ts`
- Create: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/audit/route.ts`
- Create: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/attachments/route.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `components/metadata-panel.tsx`
- Create: `components/metadata-panel/document-history-list.tsx`
- Create: `tests/documents/history.test.ts`
- Create: `tests/documents/history-routes.test.ts`
- Modify: `tests/components/metadata-panel.test.tsx`
- Modify: `tests/security/document-downstream-extension-contract.test.ts`

**Interfaces:**
- Consumes: Task 4 cursor/current-view exports, its version-0 Leaf 11 attachment projection seam, and Issue 5 active resolution.
- Produces: `listDocumentVersions()`, `listDocumentAudit()`, and `listDocumentAttachments()`, each returning exactly `{ items, nextCursor }`; `MetadataPanel` receives endpoint strings instead of Prisma arrays.

- [ ] **Step 1: Write failing service/route/UI tests**

Create `tests/documents/history.test.ts` with this complete pagination/race case:

```ts
it("binds pages to the active readable document and denies page two after archive", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const document = await prisma.document.create({
    data: {
      workspaceId: fixture.workspace.id,
      title: "History",
      slug: "history",
      path: "/history",
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
    },
  });
  const other = await prisma.document.create({
    data: {
      workspaceId: fixture.workspace.id,
      title: "Other",
      slug: "other-history",
      path: "/other-history",
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
    },
  });
  await prisma.documentVersion.createMany({
    data: Array.from({ length: 26 }, (_, index) => ({
      documentId: document.id,
      versionNumber: index + 1,
      title: `Version ${index + 1}`,
      contentMarkdown: "synthetic",
      createdById: fixture.user.id,
      createdAt: new Date(Date.UTC(2026, 6, 11, 0, index)),
    })),
  });
  const first = await listDocumentVersions({
    workspaceSlug: fixture.workspace.slug,
    documentId: document.id,
    actorId: fixture.user.id,
  });
  expect(first.items).toHaveLength(20);
  expect(first.nextCursor).toEqual(expect.any(String));
  await expect(listDocumentVersions({
    workspaceSlug: fixture.workspace.slug,
    documentId: other.id,
    actorId: fixture.user.id,
    cursor: first.nextCursor!,
  })).rejects.toThrow("INVALID_CURSOR");
  const second = await listDocumentVersions({
    workspaceSlug: fixture.workspace.slug,
    documentId: document.id,
    actorId: fixture.user.id,
    cursor: first.nextCursor!,
  });
  expect(second.items).toHaveLength(6);
  await prisma.document.update({
    where: { id: document.id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  await expect(listDocumentVersions({
    workspaceSlug: fixture.workspace.slug,
    documentId: document.id,
    actorId: fixture.user.id,
    cursor: first.nextCursor!,
  })).rejects.toThrow(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
});
```

Create `tests/documents/history-routes.test.ts`:

```ts
vi.mock("@/lib/auth/session", () => ({ requireCurrentUser: vi.fn(async () => ({ id: "user-1" })) }));
vi.mock("@/lib/documents/history", () => ({
  listDocumentVersions: vi.fn(),
  listDocumentAudit: vi.fn(),
  listDocumentAttachments: vi.fn(),
}));

import { GET as getVersions } from "@/app/api/workspaces/[workspaceSlug]/documents/[documentId]/versions/route";
import { GET as getAudit } from "@/app/api/workspaces/[workspaceSlug]/documents/[documentId]/audit/route";
import { GET as getAttachments } from "@/app/api/workspaces/[workspaceSlug]/documents/[documentId]/attachments/route";
import { listDocumentAttachments, listDocumentAudit, listDocumentVersions } from "@/lib/documents/history";

it.each([
  ["versions", getVersions, listDocumentVersions],
  ["audit", getAudit, listDocumentAudit],
  ["attachments", getAttachments, listDocumentAttachments],
] as const)("returns a private minimal %s page", async (_kind, get, service) => {
  vi.mocked(service).mockResolvedValueOnce({
    items: [{ id: "item-1", createdAt: "2026-07-11T00:00:00.000Z" }] as never,
    nextCursor: "signed-cursor",
  });
  const response = await get(
    new Request("https://munjib.invalid/api/history?cursor=prior"),
    { params: Promise.resolve({ workspaceSlug: "workspace", documentId: "document-1" }) },
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    items: [{ id: "item-1", createdAt: "2026-07-11T00:00:00.000Z" }],
    nextCursor: "signed-cursor",
  });
  expect(service).toHaveBeenCalledWith({
    workspaceSlug: "workspace", documentId: "document-1", actorId: "user-1", cursor: "prior",
  });
});

it("maps unreadable history to a count-free 404", async () => {
  vi.mocked(listDocumentVersions).mockRejectedValueOnce(new Error("DOCUMENT_NOT_FOUND"));
  const response = await getVersions(new Request("https://munjib.invalid/api/history"), {
    params: Promise.resolve({ workspaceSlug: "workspace", documentId: "document-1" }),
  });
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "DOCUMENT_NOT_FOUND" });
});
```

Add to `tests/components/metadata-panel.test.tsx`:

```tsx
it("loads only the opened minimal history tab and appends only its signed next page", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{ id: "v1", versionNumber: 1, title: "Minimal", changeSummary: null,
        createdAt: "2026-07-11T00:00:00.000Z" }],
      nextCursor: "signed-next",
    }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{ id: "v0", versionNumber: 0, title: "Older", changeSummary: null,
        createdAt: "2026-07-10T00:00:00.000Z" }],
      nextCursor: null,
    }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  renderMetadataPanel({
    metadataEndpoints: {
      versions: "/api/workspaces/w/documents/d/versions",
      audit: "/api/workspaces/w/documents/d/audit",
      attachments: "/api/workspaces/w/documents/d/attachments",
    },
  });
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "Versions" }));
  expect(await screen.findByText(/v1.*Minimal/)).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/w/documents/d/versions", expect.objectContaining({
    credentials: "same-origin", cache: "no-store",
  }));
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/workspaces/w/documents/d/versions?cursor=signed-next",
    expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
  ));
  expect(screen.queryByText(/storageKey|uploadedById|contentMarkdown/)).toBeNull();
});
```

- [ ] **Step 2: Run history tests to verify red**

Run: `pnpm exec vitest run tests/documents/history.test.ts tests/documents/history-routes.test.ts tests/components/metadata-panel.test.tsx tests/security/document-downstream-extension-contract.test.ts --reporter=dot`

Expected: FAIL because history services/routes are absent and `MetadataPanel` still accepts broad Prisma arrays.

- [ ] **Step 3: Implement paginated history service**

Create `lib/documents/history.ts` with one shared authorizer and these exact output types:

```ts
import { listLeaf11HistoryAttachments } from "@/lib/documents/downstream/leaf11-attachments";

export type VersionListItem = {
  id: string;
  versionNumber: number;
  title: string;
  changeSummary: string | null;
  createdAt: string;
};
export type AuditListItem = { id: string; action: string; createdAt: string };
export type AttachmentListItem = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

const PAGE_SIZE = 20;
```

Use this complete authorization/cursor skeleton for each query:

```ts
async function authorizeHistory(input: {
  workspaceSlug: string;
  documentId: string;
  actorId: string;
}) {
  const resolved = await resolveActiveDocumentForActor(prisma, {
    documentId: input.documentId,
    actorId: input.actorId,
    access: "read",
  });
  if (resolved.workspace.slug !== input.workspaceSlug) {
    throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  }
  return resolved;
}

export async function listDocumentVersions(input: {
  workspaceSlug: string;
  documentId: string;
  actorId: string;
  cursor?: string;
}) {
  const resolved = await authorizeHistory(input);
  const cursor = input.cursor ? decodeDocumentCursor(input.cursor, {
    kind: "versions",
    workspaceId: resolved.workspace.id,
    documentId: resolved.document.id,
  }) : null;
  const rows = await prisma.documentVersion.findMany({
    where: {
      documentId: resolved.document.id,
      ...(cursor ? {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      versionNumber: true,
      title: true,
      changeSummary: true,
      createdAt: true,
    },
  });
  const hasNext = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    nextCursor: hasNext && last ? encodeDocumentCursor({
      kind: "versions",
      workspaceId: resolved.workspace.id,
      documentId: resolved.document.id,
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }) : null,
  };
}
```

Add the other two complete functions:

```ts
export async function listDocumentAudit(input: {
  workspaceSlug: string; documentId: string; actorId: string; cursor?: string;
}) {
  const resolved = await authorizeHistory(input);
  const cursor = input.cursor ? decodeDocumentCursor(input.cursor, {
    kind: "audit",
    workspaceId: resolved.workspace.id,
    documentId: resolved.document.id,
  }) : null;
  const rows = await prisma.auditLog.findMany({
    where: {
      resourceType: "document",
      resourceId: resolved.document.id,
      ...(cursor ? { OR: [
        { createdAt: { lt: new Date(cursor.createdAt) } },
        { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
      ] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: { id: true, action: true, createdAt: true },
  });
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeDocumentCursor({
      kind: "audit",
      workspaceId: resolved.workspace.id,
      documentId: resolved.document.id,
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }) : null,
  };
}

export async function listDocumentAttachments(input: {
  workspaceSlug: string; documentId: string; actorId: string; cursor?: string;
}) {
  const resolved = await authorizeHistory(input);
  const cursor = input.cursor ? decodeDocumentCursor(input.cursor, {
    kind: "attachments",
    workspaceId: resolved.workspace.id,
    documentId: resolved.document.id,
  }) : null;
  const rows = await listLeaf11HistoryAttachments(prisma, {
    documentId: resolved.document.id,
    cursor: cursor ? { createdAt: new Date(cursor.createdAt), id: cursor.id } : null,
    take: PAGE_SIZE + 1,
  });
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeDocumentCursor({
      kind: "attachments",
      workspaceId: resolved.workspace.id,
      documentId: resolved.document.id,
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }) : null,
  };
}
```

The version-0 slot contains the legacy attachment `where`/projection moved out of this
service. Issue 11 later replaces only that slot implementation with verified
`READY` plus integrity constraints; `lib/documents/history.ts`, its signature, and its
minimal output type remain byte-identical. Extend the downstream extension-contract
test now so both current-view and history delegation are mandatory.

- [ ] **Step 4: Implement all routes and the complete lazy UI state**

Create `lib/documents/history-route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

type Params = { params: Promise<{ workspaceSlug: string; documentId: string }> };
type ListHistory = (input: {
  workspaceSlug: string; documentId: string; actorId: string; cursor?: string;
}) => Promise<{ items: unknown[]; nextCursor: string | null }>;

const noStore = { "cache-control": "private, no-store" };

export function createDocumentHistoryGet(list: ListHistory) {
  return async function GET(request: Request, { params }: Params) {
    const user = await requireCurrentUser();
    const { workspaceSlug, documentId } = await params;
    const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
    try {
      const result = await list({ workspaceSlug, documentId, actorId: user.id, cursor });
      return NextResponse.json(result, { headers: noStore });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND) {
        return NextResponse.json({ error: code }, { status: 404, headers: noStore });
      }
      if (code === "INVALID_CURSOR") {
        return NextResponse.json({ error: code }, { status: 400, headers: noStore });
      }
      return NextResponse.json({ error: "HISTORY_REQUEST_FAILED" }, {
        status: 500,
        headers: noStore,
      });
    }
  };
}
```

Create the three complete route modules:

```ts
// versions/route.ts
import { listDocumentVersions } from "@/lib/documents/history";
import { createDocumentHistoryGet } from "@/lib/documents/history-route";
export const GET = createDocumentHistoryGet(listDocumentVersions);

// audit/route.ts
import { listDocumentAudit } from "@/lib/documents/history";
import { createDocumentHistoryGet } from "@/lib/documents/history-route";
export const GET = createDocumentHistoryGet(listDocumentAudit);

// attachments/route.ts
import { listDocumentAttachments } from "@/lib/documents/history";
import { createDocumentHistoryGet } from "@/lib/documents/history-route";
export const GET = createDocumentHistoryGet(listDocumentAttachments);
```

In `app/workspaces/[workspaceSlug]/page.tsx`, delete server queries for versions, audit logs, and broad attachments. After selecting the active readable document, use:

```tsx
const currentView = selectedDocument
  ? await loadCurrentDocumentView({
      workspaceSlug,
      documentId: selectedDocument.id,
      actorId: user.id,
    })
  : null;

<DocumentEditor
  document={currentView?.document ?? null}
  canWrite={currentView?.canWrite ?? false}
  attachmentIds={currentView?.attachmentIds ?? []}
  metadataEndpoints={currentView ? {
    versions: currentView.versionsEndpoint,
    audit: currentView.auditEndpoint,
    attachments: currentView.attachmentsEndpoint,
  } : null}
/>
```

Create `components/metadata-panel/document-history-list.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { AttachmentListItem, AuditListItem, VersionListItem } from "@/lib/documents/history";

type HistoryKind = "versions" | "audit" | "attachments";
type HistoryItem = VersionListItem | AuditListItem | AttachmentListItem;

function itemLabel(kind: HistoryKind, item: HistoryItem) {
  if (kind === "versions") {
    const version = item as VersionListItem;
    return `v${version.versionNumber} · ${version.title}${version.changeSummary ? ` · ${version.changeSummary}` : ""}`;
  }
  if (kind === "audit") return (item as AuditListItem).action;
  const attachment = item as AttachmentListItem;
  return `${attachment.fileName} · ${attachment.mimeType} · ${attachment.size} bytes`;
}

export function DocumentHistoryList({ kind, endpoint }: { kind: HistoryKind; endpoint: string }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor: string | null, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(endpoint, window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(`${url.pathname}${url.search}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      const body = await response.json() as { items?: HistoryItem[]; nextCursor?: string | null; error?: string };
      if (!response.ok || !Array.isArray(body.items) || body.items.length > 20) {
        throw new Error(body.error ?? "HISTORY_REQUEST_FAILED");
      }
      setItems((current) => cursor ? [...current, ...body.items!] : body.items!);
      setNextCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError("HISTORY_REQUEST_FAILED");
      }
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    setNextCursor(null);
    void load(null, controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <section aria-label={`${kind} history`}>
      {error ? <p role="alert">{error}</p> : null}
      <ul>{items.map((item) => <li key={item.id}>{itemLabel(kind, item)}</li>)}</ul>
      {nextCursor ? (
        <button type="button" disabled={loading} onClick={() => void load(nextCursor)}>
          Load more
        </button>
      ) : null}
    </section>
  );
}
```

Change `MetadataPanel` props to `metadataEndpoints: { versions: string; audit: string; attachments: string } | null`. It renders no history component for the default Outline tab and uses these exact tab bodies:

```tsx
{activeTab === "versions" && metadataEndpoints
  ? <DocumentHistoryList kind="versions" endpoint={metadataEndpoints.versions} /> : null}
{activeTab === "audit" && metadataEndpoints
  ? <DocumentHistoryList kind="audit" endpoint={metadataEndpoints.audit} /> : null}
{activeTab === "attachments" && metadataEndpoints
  ? <DocumentHistoryList kind="attachments" endpoint={metadataEndpoints.attachments} /> : null}
```

- [ ] **Step 5: Run history tests to verify green**

Run: `pnpm exec vitest run tests/documents/history.test.ts tests/documents/history-routes.test.ts tests/documents/current-view.test.ts tests/components/metadata-panel.test.tsx tests/security/document-downstream-extension-contract.test.ts --reporter=dot`

Expected: PASS; cursor swap is rejected, archived page 2 is denied, and initial server markup contains no historical bodies/storage keys.

- [ ] **Step 6: Commit paginated history**

```bash
git add lib/documents/history.ts app/api/workspaces/\[workspaceSlug\]/documents/\[documentId\]/versions/route.ts app/api/workspaces/\[workspaceSlug\]/documents/\[documentId\]/audit/route.ts app/api/workspaces/\[workspaceSlug\]/documents/\[documentId\]/attachments/route.ts app/workspaces/\[workspaceSlug\]/page.tsx components/metadata-panel.tsx tests/documents/history.test.ts tests/documents/history-routes.test.ts tests/components/metadata-panel.test.tsx tests/security/document-downstream-extension-contract.test.ts wiki/Document\ Editing\ Workflow.md wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: paginate authorized document history"
```

Expected: commit succeeds after all focused tests pass.

### Task 6: Full ACL/DTO Verification and Disclosure Gate

**Files:**
- Create: `deploy/security/capabilities/document-acl-closure.json`
- Create: `tests/security/document-acl-capability.test.ts`
- Modify: `deploy/security/protected-artifact-owners.json`
- Modify: `tests/security/active-resource-downstream-extension-contract.test.ts`
- Modify: `tests/security/document-downstream-extension-contract.test.ts`
- Modify after disclosure review: `wiki/Auth And Permissions Workflow.md`
- Modify after disclosure review: `wiki/Document Editing Workflow.md`
- Modify after disclosure review: `wiki/index.md`
- Modify after disclosure review: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: Tasks 1–5 and Issue 5 active-resource interfaces.
- Produces: the ACL-aware base required by Issue 9.

- [ ] **Step 1: Record minimal durable behavior**

Use this exact disclosure-safe paragraph:

```markdown
Explicit document permissions match only the user and current same-tenant workspace/organization membership tuples, are capped by workspace role, and journal revokes/downgrades atomically. Folder tree mutations authorize every active descendant document before writing, broken-link creation authorizes its source document, and versions/audit/attachments use active permission-checked routes with canonical capped domain-separated cursors instead of broad server-component DTOs. Current-view and history delegate through one separately protected attachment projection slot that the attachment lifecycle leaf activates for verified READY rows without modifying the document ACL core.
```

- [ ] **Step 2: Write and run the final capability contract RED**

Create `tests/security/document-acl-capability.test.ts` only after Tasks 1–5 have
created all evidence paths. It requires exactly six fragment keys, the exact arrays
below, exact candidate hashes for the Leaf 6-only ACTIVE set, the sole Leaf 5 slot
transition `0 -> 1`, and the separately owned Leaf 11 version-0 reservation. It rejects
whole-file ownership of shared schema, package/lock, service, route, page, or component
aggregate files.

```bash
pnpm exec vitest run tests/security/document-acl-capability.test.ts tests/security/active-resource-downstream-extension-contract.test.ts tests/security/document-downstream-extension-contract.test.ts --reporter=dot
```

Expected: RED because the final fragment, ACTIVE owner entries, Leaf 5 slot activation,
and Leaf 11 reservation are not yet published.

- [ ] **Step 3: Finalize the canonical Leaf 6 capability and owner map, then run GREEN**

Create `deploy/security/capabilities/document-acl-closure.json`:

```json
{
  "format": "munjib-security-capability-v1",
  "id": "document-acl-closure",
  "version": 1,
  "leaf": 6,
  "requires": [
    "auth-runtime-fail-closed@1",
    "security-journal-auth-tombstones@1",
    "active-resource-boundaries@1",
    "immutable-private-runtime@1"
  ],
  "evidenceTests": [
    "tests/permissions/document.test.ts",
    "tests/permissions/document-access.test.ts",
    "tests/permissions/document-grants.test.ts",
    "tests/permissions/document-journal-replay.test.ts",
    "tests/security/active-membership-consumers.test.ts",
    "tests/authorization/active-resources.test.ts",
    "tests/security/active-resource-downstream-extension-contract.test.ts",
    "tests/folders/service.test.ts",
    "tests/documents/service.test.ts",
    "tests/http/signed-document-cursor.test.ts",
    "tests/documents/current-view.test.ts",
    "tests/documents/history.test.ts",
    "tests/documents/history-routes.test.ts",
    "tests/components/metadata-panel.test.tsx",
    "tests/security/document-downstream-extension-contract.test.ts",
    "tests/security/document-acl-capability.test.ts"
  ]
}
```

Activate exactly these Leaf 6-only `FULL_PATH` entries at version 1 with
`ownerCapabilityId: "document-acl-closure"`, `state: "ACTIVE"`, and exact candidate
SHA-256 values:

```json
[
  "lib/permissions/document.ts",
  "lib/permissions/document-access.ts",
  "lib/permissions/document-grants.ts",
  "lib/permissions/document-journal-replay.ts",
  "lib/authorization/downstream/leaf6-document-access.ts",
  "lib/http/signed-document-cursor.ts",
  "lib/documents/current-view.ts",
  "lib/documents/history.ts",
  "lib/documents/history-route.ts",
  "components/metadata-panel/document-history-list.tsx"
]
```

The authorization seam is the verified direct transition from Leaf 5's exact
version-0 baseline. Separately add
`lib/documents/downstream/leaf11-attachments.ts` as version 0, state `RESERVED`,
`ownerCapabilityId: "attachment-integrity-lifecycle"`, and
`createdByCapabilityId: "document-acl-closure"`, with exact baseline hash. It is not
in the Leaf 6 ACTIVE set. Shared service/route/page/component aggregates remain
candidate-tested only.

Run the RED command again and require GREEN before any full-suite, staging, or deploy
step.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
pnpm exec vitest run tests/permissions/document.test.ts tests/permissions/document-access.test.ts tests/permissions/document-grants.test.ts tests/authorization/active-resources.test.ts tests/security/active-resource-downstream-extension-contract.test.ts tests/security/document-downstream-extension-contract.test.ts tests/security/document-acl-capability.test.ts tests/folders/service.test.ts tests/documents/service.test.ts tests/http/signed-document-cursor.test.ts tests/documents/current-view.test.ts tests/documents/history.test.ts tests/documents/history-routes.test.ts tests/components/metadata-panel.test.tsx --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm test
pnpm run build
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: all commands exit 0; DTO/cursor snapshots contain no historical body, storage key, uploader id, actor id, or audit metadata.

- [ ] **Step 5: Stage, sync-check, and inspect disclosure**

```bash
git add deploy/security/capabilities/document-acl-closure.json deploy/security/protected-artifact-owners.json lib/permissions/document.ts lib/permissions/document-access.ts lib/permissions/document-grants.ts lib/authorization/downstream/leaf6-document-access.ts lib/folders/service.ts lib/documents/service.ts lib/http/signed-document-cursor.ts lib/documents/current-view.ts lib/documents/history.ts lib/documents/downstream/leaf11-attachments.ts lib/documents/history-route.ts app/api/workspaces/\[workspaceSlug\]/documents/\[documentId\]/versions/route.ts app/api/workspaces/\[workspaceSlug\]/documents/\[documentId\]/audit/route.ts app/api/workspaces/\[workspaceSlug\]/documents/\[documentId\]/attachments/route.ts app/workspaces/\[workspaceSlug\]/page.tsx components/metadata-panel.tsx components/metadata-panel/document-history-list.tsx tests/permissions/document.test.ts tests/permissions/document-access.test.ts tests/permissions/document-grants.test.ts tests/security/active-resource-downstream-extension-contract.test.ts tests/security/document-downstream-extension-contract.test.ts tests/security/document-acl-capability.test.ts tests/folders/service.test.ts tests/documents/service.test.ts tests/http/signed-document-cursor.test.ts tests/documents/current-view.test.ts tests/documents/history.test.ts tests/documents/history-routes.test.ts tests/components/metadata-panel.test.tsx wiki/Auth\ And\ Permissions\ Workflow.md wiki/Document\ Editing\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
pnpm wiki:sync-plan --staged
pnpm wiki:sync-check --staged
git diff --cached --check
git diff --cached --name-only
if git diff --cached | rg -q 'NEXTAUTH_SECRET|API_KEY|password|storageKey.*fixture-secret|docs/superpowers/(plans|specs)/2026-07-11-security'; then echo "restricted staged content detected" >&2; exit 1; fi
```

Expected: checks pass; the non-printing scan exposes no matching line; the plan/spec are not staged.

- [ ] **Step 6: Commit a final documentation delta only when one exists**

Run:

```bash
git commit -m "docs: record document ACL boundary"
```

Expected: the required real wiki/log delta commits. Do not push before explicit disclosure approval.

- [ ] **Step 7: Poll the ready PR every 60 seconds and require resolved GraphQL threads**

After disclosure approval, ready the PR and poll checks/review submissions for at least five minutes. On every poll, query GraphQL `reviewThreads(first: 100) { nodes { isResolved } }`; the final check requires zero unresolved nodes. Any actionable review or failing check repeats focused/full verification, real wiki sync, commit, and push before polling again.
