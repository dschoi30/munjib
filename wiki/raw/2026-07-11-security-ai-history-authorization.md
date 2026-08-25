# Security AI History Authorization Implementation Plan

**Tracking:** Issue #163 · remote branch `issue-163-security-ai-history-authorization`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist document/version lineage for Workspace AI turns and memory, reauthorize that lineage on every view/send/finalize boundary, and hide derived history when source access disappears.

**Architecture:** Add a turn entity that groups user/assistant messages with an explicit `SOURCE_BACKED|SOURCE_FREE` basis, immutable source document/version identifiers, and revisioned memory sources. A new turn's lineage is the bounded deduplicated union of direct-document, retrieval, included conversation-turn, and authorized-memory sources, preventing follow-up laundering. Leaf 9 exclusively issues `AuthorizedProviderMaterial` from Leaf 4-owned prompt authority plus currently authorized source material and exclusively consumes a complete bounded provider result in its finalizer. The result is one finished in-memory value with no callback, `AsyncIterable`, stream, or partial-byte surface. Before any browser byte is sent, the Leaf 9 finalizer takes shared membership/role/source locks in a SERIALIZABLE transaction, reloads current authorization, persists the turn atomically where applicable, and commits. Legacy unprovable history is irreversibly hidden but does not permanently block candidate-scoped purge readiness.

**Tech Stack:** Prisma 6, PostgreSQL shared row locks and SERIALIZABLE transactions, Next.js App Router JSON responses, LangChain server-side buffering, TypeScript, Vitest integration tests.

## Global Constraints

- Dependency order is exact: Issue 9 rebases on merged Issues 2, 4, and 6 plus the
  deployed Leaf 13B immutable runtime. Release admission additionally requires the
  deployed migration prefix through Leaf 8 `20260712020000` and Leaf 7
  `20260712030000`; that scheduling gate is not a capability dependency. Its direct
  capability requirements remain exactly `security-journal-auth-tombstones@1`,
  `zero-ambient-media-egress@1`, `document-acl-closure@1`, and
  `immutable-private-runtime@1`. It imports only the Issue 5 purge-readiness type
  through the merged Issue 6 base and does not wire production composition.
- Every persisted Workspace AI turn and memory revision records the bounded deduplicated union of direct-document sources, retrieval chunks, sources of every included conversation turn, and sources of authorized memory used in its prompt—not only answer-visible citations. The cap is 512 unique `(workspaceId, documentId, documentVersionId, chunkId?)` rows; overflow fails closed.
- A turn with zero document/version sources must persist `lineageBasis: SOURCE_FREE`; a source-backed turn may never persist zero sources, and later callers may not reclassify a source-backed turn as source-free.
- Source authorization is rechecked when loading a thread, preparing a follow-up, saving a memory summary, and finalizing an answer.
- If any source becomes unreadable, archived, or purged, the entire derived turn becomes a non-enumerating redaction tombstone in every view and is excluded from every future prompt.
- Provider chunks are accumulated into one complete bounded server-only result. The result rejects invalid UTF-8, empty output, and output above 65,536 bytes and exposes no callback, `ReadableStream`, `AsyncIterable`, token event, or partial-byte API. The browser receives no `start` or partial token event; the first response body is emitted only after current membership/role/source authorization has been linearized under shared locks and the final turn has committed.
- Original message/memory rows remain for audit/retention. This issue performs no destructive AI purge, imports no attachment/restore leaf, and exports only `aiLineagePurgeReadiness: PurgeLeafReadiness` for Issue 14 composition.
- Legacy threads whose source lineage cannot be proved are migrated to archived/hidden, not guessed or exposed.
- `LEGACY_HIDDEN` is irreversible. Because it is never viewable or prompt-eligible and has no fabricated source rows, candidate-scoped readiness ignores it instead of permanently blocking every purge.
- Every transition to `SOURCE_REDACTED` appends Issue 2 `AI_HISTORY_REDACTED` in the same transaction. No AI journal event can make a turn or memory visible.
- The same first redaction transaction appends `AI_SOURCE_ACCESS_REVOKED` for each immutable `AiChatTurnSource`/`AiChatMemorySource` row that made the derived object unreadable, before the turn/memory `AI_HISTORY_REDACTED` event. Retries derive stable disjoint operation UUIDs and never emit duplicates.
- Every prompt/history/memory authorization query requires source
  `accessRevokedAt IS NULL`; a revoked lineage row is permanently unusable even if a
  crash left its parent visibility stale. The same transaction sets the timestamp and
  parent redaction, and replay idempotently restores both denial layers.
- Export `leaf9JournalReplayReducers` with exactly `AI_SOURCE_ACCESS_REVOKED` and `AI_HISTORY_REDACTED`; Leaf 5—not Leaf 9—owns `AI_DERIVED_DATA_PURGED`. Reducers are branded-restore-only, idempotent, deny-only, and unable to append or mutate journal/checkpoint state.
- Leaf 9 owns capability `ai-history-reauthorization`. Its exclusive AI composition artifacts are `lib/rag/authorized-provider-material.ts` and `lib/rag/authorized-ai-finalization.ts`; only the latter may perform final authorization/persistence. Shared `workspace-chat.ts`, `ask.ts`, routes, provider adapters, and UI files are exact evidence consumers, not whole-file Leaf 9 ownership. The capability also covers lineage schema, source-lock authorization, restore reducers, and purge readiness. Leaf 13B binds it to the exact candidate; Leaf 14 consumes but cannot republish it.
- Document/version identifiers used for lineage stay server-side and are excluded from production telemetry.
- Before Leaf 10 is available, production Langfuse full capture and Langfuse OTEL prompt/response export are disabled fail-closed. Langfuse/Sentry metadata excludes prompt, answer, history, memory, workspace/user/tenant identifiers, document/version/chunk/source/citation identifiers, and URL material. `AuthorizedProviderMaterial` carries no telemetry callback and no tenant/source metadata.
- Every persisted security-relevant AI timestamp uses PostgreSQL time sampled after the rows that authorize the decision are locked. Application `new Date()`/`Date.now()` values are test fixtures only and cannot author memory revision, redaction, finalization, or visibility timestamps.
- Every task follows RED -> GREEN -> an actual durable update to its named wiki page plus `wiki/log.md` -> all wiki install/sync/manifest/lint/sync-check gates -> commit. A no-op wiki delta is not sufficient. Secret scans use non-printing `rg -q`; ready-PR checks/reviews are polled at no more than 60-second intervals and GraphQL unresolved threads block completion.
- This plan and detailed design are local-only. Remote commits must omit them, private document content, prompts, answers, raw provider errors, source identifiers in telemetry, secrets, and incident evidence.

---

## File Structure

- Modify: `prisma/schema.prisma` — AI turn/visibility/lineage models, memory revision state, and chunk source version.
- Create: `prisma/migrations/20260712040000_ai_history_reauthorization/migration.sql` — additive schema plus legacy archive/hide migration.
- Modify: `lib/rag/index-document.ts`, `lib/rag/vector-store.ts` — persist/retrieve source version id.
- Modify: `tests/rag/index-document.test.ts`, `tests/rag/vector-store.test.ts`.
- Create: `tests/prisma/ai-source-lineage-migration.test.ts` — migration safety contract.
- Create: `lib/rag/source-authorization.ts` — batch active/ACL/version authorization and tombstone DTOs.
- Create: `lib/rag/authorized-provider-material.ts` — Leaf 9-owned runtime-issued prompt/source material built from Leaf 4 authority and exact current lineage.
- Create: `lib/rag/authorized-ai-finalization.ts` — Leaf 9-only complete-result validation plus final Ask authorization and Workspace turn persistence.
- Create: `tests/rag/authorized-provider-material.test.ts`, `tests/rag/authorized-ai-finalization.test.ts`.
- Create: `lib/rag/journal-replay.ts`, `lib/rag/source-access-revocation.ts`, and `tests/rag/journal-replay.test.ts` — source/history deny events and exact restore reducers.
- Create: `lib/rag/lineage-purge-readiness.ts` — Issue 5 type-only, candidate-scoped AI lineage readiness leaf.
- Create: `tests/rag/source-authorization.test.ts`.
- Modify: `lib/rag/workspace-chat.ts` — authorized thread view, prompt filtering, turn lineage persistence, final reauthorization.
- Modify: `lib/rag/ask.ts` — direct Ask final source reauthorization.
- Modify: `tests/rag/workspace-chat.test.ts`, `tests/rag/ask.test.ts`.
- Modify: `lib/rag/langfuse.ts`, `lib/rag/langfuse-otel.ts`, `instrumentation.ts`; modify `tests/rag/langfuse.test.ts` and `tests/rag/langfuse-otel.test.ts` — pre-Leaf 10 full-capture/OTEL disable and tenant/source/content absence.
- Create: `tests/rag/lineage-purge-readiness.test.ts`.
- Modify: `lib/rag/workspace-chat.ts` memory code — revisioned memory lineage and source reauthorization.
- Create: `tests/rag/workspace-chat-memory-authorization.test.ts`.
- Modify: `app/api/workspaces/[workspaceSlug]/assistant/thread/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/error-response.ts` — private/no-store and source-access error mapping.
- Modify: `components/workspace-chatbot.tsx`, `lib/i18n/messages.ts` — render fixed redaction tombstones.
- Modify: `tests/rag/workspace-chat-route.test.ts`, `tests/components/workspace-chatbot.test.tsx`, `tests/i18n/messages.test.ts`.
- Create: `deploy/security/capabilities/ai-history-reauthorization.json` and `tests/security/ai-history-capability.test.ts` — leaf-owned fragment and protected-artifact map.
- Maintain after disclosure review: `wiki/RAG Process Workflow.md`, `wiki/Auth And Permissions Workflow.md`, `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`.

### Task 1: AI Turn, Source Lineage, and Legacy-Hidden Migration

**Files:**
- Create: `lib/rag/journal-replay.ts`
- Create: `tests/rag/journal-replay.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260712040000_ai_history_reauthorization/migration.sql`
- Create: `tests/prisma/ai-source-lineage-migration.test.ts`

**Interfaces:**
- Consumes: existing `AiChatThread`, `AiChatMessage`, `DocumentChunk`, and the partial unique active-thread index.
- Produces: `AiChatTurn`, `AiChatTurnSource`, `AiChatMemorySource`, nullable immutable-source `accessRevokedAt`, `AiDerivedVisibility`, `AiLineageState`, `AiLineageBasis`, nullable `AiChatMessage.turnId`, `AiChatThread.memoryRevision`, `AiChatThread.memoryVisibility`, and `DocumentChunk.sourceVersionId`.

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/prisma/ai-source-lineage-migration.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20260712040000_ai_history_reauthorization/migration.sql",
);

describe("AI source lineage migration", () => {
  it("adds lineage without deleting legacy records and archives unprovable active threads", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain('CREATE TABLE "AiChatTurn"');
    expect(sql).toContain('CREATE TABLE "AiChatTurnSource"');
    expect(sql).toContain('CREATE TABLE "AiChatMemorySource"');
    expect(sql).toContain('CREATE TYPE "AiLineageBasis"');
    expect(sql).toContain('"lineageBasis" "AiLineageBasis" NOT NULL');
    expect(sql).toContain('"sourceKey" TEXT NOT NULL');
    expect(sql.match(/"accessRevokedAt" TIMESTAMP\(3\)/g)).toHaveLength(2);
    expect(sql).toContain('ADD COLUMN "sourceVersionId" TEXT');
    expect(sql).toContain("SET \"status\" = 'ARCHIVED', \"lineageState\" = 'LEGACY_HIDDEN'");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"AiChat(?:Thread|Message)"/i);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
  });
});
```

- [ ] **Step 2: Run the migration test to verify red**

Run: `pnpm exec vitest run tests/prisma/ai-source-lineage-migration.test.ts --reporter=dot`

Expected: FAIL with `ENOENT` for the migration file.

- [ ] **Step 3: Add the Prisma models**

In `prisma/schema.prisma`, add:

```prisma
enum AiDerivedVisibility {
  VISIBLE
  SOURCE_REDACTED
  LEGACY_HIDDEN
}

enum AiLineageState {
  PROVEN
  LEGACY_HIDDEN
}

enum AiLineageBasis {
  SOURCE_BACKED
  SOURCE_FREE
}

model AiChatTurn {
  id         String              @id @default(cuid())
  threadId   String
  visibility AiDerivedVisibility @default(VISIBLE)
  lineageBasis AiLineageBasis
  createdAt  DateTime            @default(now())
  updatedAt  DateTime            @updatedAt
  thread     AiChatThread        @relation(fields: [threadId], references: [id], onDelete: Cascade)
  messages   AiChatMessage[]
  sources    AiChatTurnSource[]

  @@index([threadId, createdAt])
}

model AiChatTurnSource {
  id                String     @id @default(cuid())
  turnId            String
  workspaceId       String
  documentId        String
  documentVersionId String
  sourceUpdatedAt   DateTime
  chunkId           String?
  sourceKey         String
  accessRevokedAt   DateTime?
  createdAt         DateTime   @default(now())
  turn              AiChatTurn @relation(fields: [turnId], references: [id], onDelete: Cascade)

  @@unique([turnId, sourceKey])
  @@index([workspaceId, documentId])
}

model AiChatMemorySource {
  id                String       @id @default(cuid())
  threadId          String
  memoryRevision    Int
  workspaceId       String
  documentId        String
  documentVersionId String
  sourceUpdatedAt   DateTime
  accessRevokedAt   DateTime?
  createdAt         DateTime     @default(now())
  thread            AiChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@unique([threadId, memoryRevision, documentId, documentVersionId])
  @@index([threadId, memoryRevision])
  @@index([workspaceId, documentId])
}
```

Add these fields/relations:

```prisma
model AiChatThread {
  // existing fields remain
  lineageState     AiLineageState      @default(PROVEN)
  memoryRevision   Int                 @default(0)
  memoryVisibility AiDerivedVisibility @default(VISIBLE)
  turns            AiChatTurn[]
  memorySources    AiChatMemorySource[]
}

model AiChatMessage {
  // existing fields remain
  turnId String?
  turn   AiChatTurn? @relation(fields: [turnId], references: [id], onDelete: SetNull)
  @@index([turnId])
}

model DocumentChunk {
  // existing fields remain
  sourceVersionId String?
}
```

`AiChatTurnSource.documentId` and `documentVersionId` intentionally have no foreign key, so hard-purge tombstones retain immutable lineage identifiers for authorization failure/audit without reviving content.

- [ ] **Step 4: Create the additive migration**

Create `prisma/migrations/20260712040000_ai_history_reauthorization/migration.sql` with this complete additive DDL:

```sql
CREATE TYPE "AiDerivedVisibility" AS ENUM ('VISIBLE', 'SOURCE_REDACTED', 'LEGACY_HIDDEN');
CREATE TYPE "AiLineageState" AS ENUM ('PROVEN', 'LEGACY_HIDDEN');
CREATE TYPE "AiLineageBasis" AS ENUM ('SOURCE_BACKED', 'SOURCE_FREE');

CREATE TABLE "AiChatTurn" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "visibility" "AiDerivedVisibility" NOT NULL DEFAULT 'VISIBLE',
  "lineageBasis" "AiLineageBasis" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiChatTurn_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiChatTurnSource" (
  "id" TEXT NOT NULL,
  "turnId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "documentVersionId" TEXT NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "chunkId" TEXT,
  "sourceKey" TEXT NOT NULL,
  "accessRevokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiChatTurnSource_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiChatMemorySource" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "memoryRevision" INTEGER NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "documentVersionId" TEXT NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "accessRevokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiChatMemorySource_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DocumentChunk" ADD COLUMN "sourceVersionId" TEXT;
ALTER TABLE "AiChatMessage" ADD COLUMN "turnId" TEXT;
ALTER TABLE "AiChatThread"
  ADD COLUMN "lineageState" "AiLineageState" NOT NULL DEFAULT 'PROVEN',
  ADD COLUMN "memoryRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "memoryVisibility" "AiDerivedVisibility" NOT NULL DEFAULT 'VISIBLE';

UPDATE "AiChatThread"
SET "status" = 'ARCHIVED', "lineageState" = 'LEGACY_HIDDEN',
    "memoryVisibility" = 'LEGACY_HIDDEN'
WHERE EXISTS (
  SELECT 1 FROM "AiChatMessage" m
  WHERE m."threadId" = "AiChatThread"."id" AND m."turnId" IS NULL
) OR "memorySummary" IS NOT NULL;

CREATE INDEX "AiChatTurn_threadId_createdAt_idx" ON "AiChatTurn"("threadId", "createdAt");
CREATE UNIQUE INDEX "AiChatTurnSource_turnId_sourceKey_key" ON "AiChatTurnSource"("turnId", "sourceKey");
CREATE INDEX "AiChatTurnSource_workspaceId_documentId_idx" ON "AiChatTurnSource"("workspaceId", "documentId");
CREATE UNIQUE INDEX "AiChatMemorySource_threadId_memoryRevision_documentId_documentVersionId_key"
  ON "AiChatMemorySource"("threadId", "memoryRevision", "documentId", "documentVersionId");
CREATE INDEX "AiChatMemorySource_threadId_memoryRevision_idx"
  ON "AiChatMemorySource"("threadId", "memoryRevision");
CREATE INDEX "AiChatMemorySource_workspaceId_documentId_idx"
  ON "AiChatMemorySource"("workspaceId", "documentId");
CREATE INDEX "AiChatMessage_turnId_idx" ON "AiChatMessage"("turnId");
CREATE INDEX "DocumentChunk_sourceVersionId_idx" ON "DocumentChunk"("sourceVersionId");

ALTER TABLE "AiChatTurn" ADD CONSTRAINT "AiChatTurn_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "AiChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiChatTurnSource" ADD CONSTRAINT "AiChatTurnSource_turnId_fkey"
  FOREIGN KEY ("turnId") REFERENCES "AiChatTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiChatMemorySource" ADD CONSTRAINT "AiChatMemorySource_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "AiChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_turnId_fkey"
  FOREIGN KEY ("turnId") REFERENCES "AiChatTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Do not fabricate source ids for legacy messages and do not delete messages or memory.

- [ ] **Step 5: Run schema/migration checks to verify green**

Run:

```bash
pnpm exec vitest run tests/prisma/ai-source-lineage-migration.test.ts --reporter=dot
pnpm exec prisma validate
pnpm run db:generate
```

Expected: PASS; Prisma client generation exits 0 and the migration test finds no destructive DDL.

- [ ] **Step 6: Commit the additive schema**

```bash
pnpm wiki:install-hooks
git add prisma/schema.prisma prisma/migrations/20260712040000_ai_history_reauthorization/migration.sql tests/prisma/ai-source-lineage-migration.test.ts wiki/RAG\ Process\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: add AI source lineage schema"
```

Expected: commit succeeds without legacy content or production counts in the migration/log.

### Task 2: Carry Exact Source Versions Through the RAG Index

**Files:**
- Modify: `lib/rag/index-document.ts`
- Modify: `lib/rag/vector-store.ts`
- Modify: `tests/rag/index-document.test.ts`
- Modify: `tests/rag/vector-store.test.ts`

**Interfaces:**
- Consumes: Task 1 `DocumentChunk.sourceVersionId`.
- Produces: `SavedDocumentForIndex.versionId: string`, `RetrievedChunk.sourceVersionId: string`, and new chunk writes with exact latest version id; Task 4 persists these values as turn sources.

- [ ] **Step 1: Write failing source-version tests**

Add to `tests/rag/index-document.test.ts`:

```ts
it("writes the exact saved document version id into every chunk", async () => {
  const replaceDocumentChunks = vi.fn().mockResolvedValue(true);
  await indexSavedDocument({
    document: {
      id: "doc-1",
      workspaceId: "workspace-1",
      versionId: "version-7",
      title: "Policy",
      contentMarkdown: "# Policy\n\nSaved text",
      updatedAt: new Date("2026-07-11T00:00:00.000Z"),
    },
    embeddingModel: "bge-m3",
    embedText: vi.fn().mockResolvedValue(Array(1024).fill(0.1)),
    replaceDocumentChunks,
  });
  expect(replaceDocumentChunks).toHaveBeenCalledWith(expect.objectContaining({
    chunks: [expect.objectContaining({ sourceVersionId: "version-7" })],
  }));
});
```

Add to `tests/rag/vector-store.test.ts` an assertion that `searchSimilarChunks()` returns `sourceVersionId` from a seeded chunk row.

- [ ] **Step 2: Run index/vector tests to verify red**

Run: `pnpm exec vitest run tests/rag/index-document.test.ts tests/rag/vector-store.test.ts --reporter=dot`

Expected: FAIL because current chunk inputs/results have no source version.

- [ ] **Step 3: Persist and retrieve source versions**

In `lib/rag/index-document.ts`, add `versionId: string` to `SavedDocumentForIndex`, add `sourceVersionId: document.versionId` to every embedded chunk, and load the source with:

```ts
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
    versions: {
      orderBy: [{ versionNumber: "desc" }, { id: "desc" }],
      take: 1,
      select: { id: true },
    },
  },
}).then((document) => document?.versions[0]
  ? { ...document, versionId: document.versions[0].id }
  : null);
```

In `lib/rag/vector-store.ts`, add `sourceVersionId` to `ReplaceDocumentChunkInput` and `RetrievedChunk`, persist it in `createMany`/raw insert, require `sourceVersionId IS NOT NULL` in search, and select it into the returned object. Old null chunks are unusable and are rebuilt by the existing targeted index backfill.

- [ ] **Step 4: Run index/vector tests to verify green**

Run: `pnpm exec vitest run tests/rag/index-document.test.ts tests/rag/vector-store.test.ts tests/rag/workspace-chat.test.ts --reporter=dot`

Expected: PASS; every retrieval result used for a prompt has a non-null `sourceVersionId`.

- [ ] **Step 5: Commit source-version propagation**

```bash
git add lib/rag/index-document.ts lib/rag/vector-store.ts tests/rag/index-document.test.ts tests/rag/vector-store.test.ts wiki/RAG\ Process\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: carry source versions through RAG"
```

Expected: commit succeeds after focused tests pass.

### Task 3: Source Authorization and Tombstone Views

**Files:**
- Create: `lib/rag/source-authorization.ts`
- Create: `tests/rag/source-authorization.test.ts`

**Interfaces:**
- Consumes: Issue 5 active state and Issue 6 `loadDocumentAccessMap()` role-capped ACL.
- Produces: `AiSourceLineage`, `authorizeAiSources(db, input)`, `authorizeThreadTurns(db, input)`, `AiAuthorizedMessageDto`, and the fixed `SOURCE_ACCESS_CHANGED` tombstone; Tasks 4–6 consume these exact exports.

- [ ] **Step 1: Write failing source-authorization tests**

Create `tests/rag/source-authorization.test.ts` with this fixture and complete cases:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  authorizeAiSources,
  authorizeThreadTurns,
  type AiSourceLineage,
} from "@/lib/rag/source-authorization";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

async function createSourceFixture(title: string) {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const document = await prisma.document.create({
    data: {
      workspaceId: fixture.workspace.id,
      title,
      slug: title.toLowerCase().replace(/\s+/g, "-"),
      path: `/${title.toLowerCase().replace(/\s+/g, "-")}`,
      contentMarkdown: "secret source body",
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
      versions: {
        create: {
          versionNumber: 1,
          title,
          contentMarkdown: "secret source body",
          createdById: fixture.user.id,
        },
      },
    },
    include: { versions: true },
  });
  const source: AiSourceLineage = {
    workspaceId: fixture.workspace.id,
    documentId: document.id,
    documentVersionId: document.versions[0].id,
    sourceUpdatedAt: document.updatedAt,
  };
  return { fixture, document, source };
}

describe("AI source authorization", () => {
  beforeEach(resetTestData);

  it("authorizes an active readable document/version source", async () => {
    const { fixture, source } = await createSourceFixture("Readable Source");
    await expect(authorizeAiSources(prisma, {
      workspaceId: fixture.workspace.id,
      actorId: fixture.user.id,
      workspaceRole: "EDITOR",
      sources: [source],
    })).resolves.toBe(true);
  });

  it("rejects a source after explicit ACL revocation", async () => {
    const { fixture, document, source } = await createSourceFixture("Revoked Source");
    await prisma.permission.create({
      data: {
        resourceType: "DOCUMENT",
        resourceId: document.id,
        subjectType: "USER",
        subjectId: "different-user",
        permission: "READ",
      },
    });
    await expect(authorizeAiSources(prisma, {
      workspaceId: fixture.workspace.id,
      actorId: fixture.user.id,
      workspaceRole: "EDITOR",
      sources: [source],
    })).resolves.toBe(false);
  });

  it.each(["DOCUMENT", "WORKSPACE"] as const)(
    "rejects a source after %s archive",
    async (target) => {
      const { fixture, document, source } = await createSourceFixture(`${target} Source`);
      if (target === "DOCUMENT") {
        await prisma.document.update({
          where: { id: document.id },
          data: { status: "ARCHIVED", archivedAt: new Date() },
        });
      } else {
        await prisma.workspace.update({
          where: { id: fixture.workspace.id },
          data: { archivedAt: new Date() },
        });
      }
      await expect(authorizeAiSources(prisma, {
        workspaceId: fixture.workspace.id,
        actorId: fixture.user.id,
        workspaceRole: "EDITOR",
        sources: [source],
      })).resolves.toBe(false);
    },
  );

  it("returns one fixed tombstone for a mixed-source turn when any source is denied", async () => {
    const allowed = await createSourceFixture("Allowed Source");
    const deniedDocument = await prisma.document.create({
      data: {
        workspaceId: allowed.fixture.workspace.id,
        title: "Denied Source",
        slug: "denied-source",
        path: "/denied-source",
        contentMarkdown: "secret source body",
        createdById: allowed.fixture.user.id,
        updatedById: allowed.fixture.user.id,
        versions: { create: {
          versionNumber: 1,
          title: "Denied Source",
          contentMarkdown: "secret source body",
          createdById: allowed.fixture.user.id,
        } },
      },
      include: { versions: true },
    });
    await prisma.permission.create({
      data: {
        resourceType: "DOCUMENT",
        resourceId: deniedDocument.id,
        subjectType: "USER",
        subjectId: "different-user",
        permission: "READ",
      },
    });
    const turn = { id: "turn-mixed", createdAt: new Date("2026-07-11T00:00:00.000Z") };
    const result = await authorizeThreadTurns(prisma, {
      workspaceId: allowed.fixture.workspace.id,
      actorId: allowed.fixture.user.id,
      workspaceRole: "EDITOR",
      turns: [{
        ...turn,
        visibility: "VISIBLE",
        lineageBasis: "SOURCE_BACKED",
        messages: [{
          id: "assistant-mixed",
          role: "ASSISTANT",
          content: "derived secret answer",
          createdAt: turn.createdAt,
        }],
        sources: [allowed.source, {
          workspaceId: allowed.fixture.workspace.id,
          documentId: deniedDocument.id,
          documentVersionId: deniedDocument.versions[0].id,
          sourceUpdatedAt: deniedDocument.updatedAt,
        }],
      }],
    });
    expect(result.messages).toEqual([{
      id: turn.id,
      role: "SYSTEM",
      content: null,
      redacted: true,
      code: "SOURCE_ACCESS_CHANGED",
      createdAt: turn.createdAt.toISOString(),
    }]);
    expect(JSON.stringify(result)).not.toContain(deniedDocument.id);
    expect(JSON.stringify(result)).not.toContain("secret source body");
  });
});
```

- [ ] **Step 2: Run source-authorization tests to verify red**

Run: `pnpm exec vitest run tests/rag/source-authorization.test.ts --reporter=dot`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement batch source authorization**

Create `lib/rag/source-authorization.ts`:

```ts
import type { Prisma, PrismaClient, WorkspaceRole } from "@prisma/client";
import { loadDocumentAccessMap } from "@/lib/permissions/document-access";

type SourceDb = Prisma.TransactionClient | PrismaClient;
export type AiSourceLineage = {
  workspaceId: string;
  documentId: string;
  documentVersionId: string;
  sourceUpdatedAt: Date;
  chunkId?: string | null;
};
export type AiAuthorizedMessageDto =
  | { id: string; role: "USER" | "ASSISTANT"; content: string; redacted: false; createdAt: string }
  | { id: string; role: "SYSTEM"; content: null; redacted: true; code: "SOURCE_ACCESS_CHANGED"; createdAt: string };

export async function authorizeAiSources(
  db: SourceDb,
  input: {
    workspaceId: string;
    actorId: string;
    workspaceRole: WorkspaceRole;
    sources: AiSourceLineage[];
  },
) {
  const sources = dedupeSources(input.sources);
  if (sources.length === 0) return true;
  if (sources.some((source) => source.workspaceId !== input.workspaceId)) return false;
  const documentIds = [...new Set(sources.map(({ documentId }) => documentId))];
  const versionIds = [...new Set(sources.map(({ documentVersionId }) => documentVersionId))];
  const [documents, versions, access] = await Promise.all([
    db.document.findMany({
      where: {
        id: { in: documentIds },
        workspaceId: input.workspaceId,
        status: "ACTIVE",
        archivedAt: null,
        workspace: { archivedAt: null },
      },
      select: { id: true },
    }),
    db.documentVersion.findMany({
      where: { id: { in: versionIds }, documentId: { in: documentIds } },
      select: { id: true, documentId: true },
    }),
    loadDocumentAccessMap(db, {
      documentIds,
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      workspaceRole: input.workspaceRole,
    }),
  ]);
  const activeIds = new Set(documents.map(({ id }) => id));
  const versionPairs = new Set(versions.map(({ id, documentId }) => `${documentId}:${id}`));
  return sources.every((source) =>
    activeIds.has(source.documentId) &&
    versionPairs.has(`${source.documentId}:${source.documentVersionId}`) &&
    access.get(source.documentId)?.canRead === true,
  );
}

export async function authorizeThreadTurns(
  db: SourceDb,
  input: {
    workspaceId: string;
    actorId: string;
    workspaceRole: WorkspaceRole;
    turns: Array<{
      id: string;
      visibility: "VISIBLE" | "SOURCE_REDACTED" | "LEGACY_HIDDEN";
      lineageBasis: "SOURCE_BACKED" | "SOURCE_FREE";
      createdAt: Date;
      messages: Array<{ id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: Date }>;
      sources: AiSourceLineage[];
    }>;
  },
) {
  const messages: AiAuthorizedMessageDto[] = [];
  const visibleTurnIds: string[] = [];
  const visibleTurns: typeof input.turns = [];
  for (const turn of input.turns) {
    const lineageValid = turn.lineageBasis === "SOURCE_FREE"
      ? turn.sources.length === 0
      : turn.sources.length > 0;
    const readable = turn.visibility === "VISIBLE" && lineageValid && (
      turn.lineageBasis === "SOURCE_FREE" || await authorizeAiSources(db, {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        workspaceRole: input.workspaceRole,
        sources: turn.sources,
      })
    );
    if (!readable) {
      messages.push({
        id: turn.id,
        role: "SYSTEM",
        content: null,
        redacted: true,
        code: "SOURCE_ACCESS_CHANGED",
        createdAt: turn.createdAt.toISOString(),
      });
      continue;
    }
    visibleTurnIds.push(turn.id);
    visibleTurns.push(turn);
    messages.push(...turn.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      redacted: false as const,
      createdAt: message.createdAt.toISOString(),
    })));
  }
  return { messages, visibleTurnIds, visibleTurns };
}

function dedupeSources(sources: AiSourceLineage[]) {
  return [...new Map(sources.map((source) => [
    `${source.workspaceId}:${source.documentId}:${source.documentVersionId}:${source.chunkId ?? ""}`,
    source,
  ])).values()];
}
```

- [ ] **Step 4: Run source-authorization tests to verify green**

Run: `pnpm exec vitest run tests/rag/source-authorization.test.ts tests/permissions/document-access.test.ts --reporter=dot`

Expected: PASS; the mixed-source result contains one fixed tombstone and no source id/body.

- [ ] **Step 5: Commit the source authorizer**

```bash
git add lib/rag/source-authorization.ts tests/rag/source-authorization.test.ts wiki/RAG\ Process\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: reauthorize AI source lineage"
```

Expected: commit succeeds with synthetic source fixtures only.

### Task 4: Issue Authorized Provider Material and Own Finalization

**Files:**
- Create: `lib/rag/authorized-provider-material.ts`
- Create: `lib/rag/authorized-ai-finalization.ts`
- Modify: `lib/rag/workspace-chat.ts`
- Modify: `lib/rag/ask.ts`
- Modify: `lib/rag/langfuse.ts`
- Modify: `lib/rag/langfuse-otel.ts`
- Modify: `instrumentation.ts`
- Create: `tests/rag/authorized-provider-material.test.ts`
- Create: `tests/rag/authorized-ai-finalization.test.ts`
- Modify: `tests/rag/workspace-chat.test.ts`
- Modify: `tests/rag/ask.test.ts`
- Modify: `tests/rag/langfuse.test.ts`
- Modify: `tests/rag/langfuse-otel.test.ts`

**Interfaces:**
- Consumes: Leaf 4 `trustedPromptSystem()`/`untrustedPromptBlock()`, Task 2 `RetrievedChunk.sourceVersionId`, Task 3 source authorization, and Issue 6 active ACLs.
- Produces: runtime-issued `AuthorizedProviderMaterial`, `CompleteBoundedAiResult`, `issueAuthorizedProviderMaterial()`, `completeBoundedAiResult()`, `finalizeAuthorizedWorkspaceAiResult()`, and `finalizeAuthorizedAskResult()`. Only `authorized-ai-finalization.ts` performs the final shared-lock/Serializable authorization and atomic turn+messages+sources persistence. Shared services never persist a provider answer directly, prepared workspace roles are never reused as authority, and no result exposes a callback, `ReadableStream`, `AsyncIterable`, token event, or partial byte.

- [ ] **Step 1: Write revocation/archive/purge-during-generation tests**

Add to `tests/rag/workspace-chat.test.ts`:

```ts
type WorkspaceFixture = Awaited<ReturnType<typeof seedWorkspaceFixture>>;

async function createSavedDocumentWithVersion(fixture: WorkspaceFixture, title: string) {
  const document = await prisma.document.create({
    data: {
      workspaceId: fixture.workspace.id,
      title,
      slug: title.toLowerCase().replace(/\s+/g, "-"),
      path: `/${title.toLowerCase().replace(/\s+/g, "-")}`,
      contentMarkdown: "synthetic authorized source",
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
      versions: {
        create: {
          versionNumber: 1,
          title,
          contentMarkdown: "synthetic authorized source",
          createdById: fixture.user.id,
        },
      },
    },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const version = document.versions[0];
  if (!version) throw new Error("Expected saved document version fixture");
  return { document, version };
}

it.each(["REVOKE", "ARCHIVE", "PURGE"] as const)(
  "does not persist a buffered final turn when source state changes before linearization: %s",
  async (change) => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const source = await createSavedDocumentWithVersion(fixture, "Lineage Source");
    vi.mocked(searchSimilarChunks).mockResolvedValue([{
      id: "chunk-lineage",
      documentId: source.document.id,
      sourceVersionId: source.version.id,
      documentTitle: source.document.title,
      documentPath: source.document.path,
      headingPath: null,
      content: "authorized source",
      distance: 0.1,
    }]);
    const prepared = await prepareWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "question",
    });
    if (change === "REVOKE") {
      await prisma.permission.create({
        data: {
          resourceType: "DOCUMENT",
          resourceId: source.document.id,
          subjectType: "USER",
          subjectId: "different-user",
          permission: "READ",
        },
      });
    } else if (change === "ARCHIVE") {
      await prisma.document.update({
        where: { id: source.document.id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
    } else {
      await prisma.document.delete({ where: { id: source.document.id } });
    }
    await expect(generateAndPersistWorkspaceChatMessage(prepared, {
      generate: vi.fn().mockResolvedValue("server-buffered answer"),
    })).rejects.toThrow("SOURCE_ACCESS_CHANGED");
    await expect(prisma.aiChatMessage.count({
      where: { threadId: prepared.threadId },
    })).resolves.toBe(0);
    await expect(prisma.aiChatTurn.count({
      where: { threadId: prepared.threadId },
    })).resolves.toBe(0);
  },
);

it("unions direct, retrieval, included-turn, and authorized-memory sources", () => {
  const source = (suffix: string): AiSourceLineage => ({
    workspaceId: "workspace-1",
    documentId: `document-${suffix}`,
    documentVersionId: `version-${suffix}`,
    sourceUpdatedAt: new Date("2026-07-11T00:00:00.000Z"),
    chunkId: `chunk-${suffix}`,
  });
  const result = collectPreparedSources({
    directDocumentSources: [source("direct")],
    retrievalSources: [source("retrieval"), source("direct")],
    includedConversationTurns: [{
      lineageBasis: "SOURCE_BACKED",
      sources: [source("conversation")],
    }],
    authorizedMemory: { summary: "synthetic", sources: [source("memory")] },
  });
  expect(result.lineageBasis).toBe("SOURCE_BACKED");
  expect(result.sources.map(({ documentId }) => documentId)).toEqual([
    "document-direct", "document-retrieval", "document-conversation", "document-memory",
  ]);
});

it("uses explicit SOURCE_FREE only for an actually empty union and caps dedupe", () => {
  expect(collectPreparedSources({
    directDocumentSources: [], retrievalSources: [], includedConversationTurns: [], authorizedMemory: null,
  })).toEqual({ lineageBasis: "SOURCE_FREE", sources: [] });
  const many = Array.from({ length: 513 }, (_, index): AiSourceLineage => ({
    workspaceId: "workspace-1",
    documentId: `document-${index}`,
    documentVersionId: `version-${index}`,
    sourceUpdatedAt: new Date("2026-07-11T00:00:00.000Z"),
  }));
  expect(() => collectPreparedSources({
    directDocumentSources: many, retrievalSources: [], includedConversationTurns: [], authorizedMemory: null,
  })).toThrow("AI_TURN_SOURCE_LIMIT_EXCEEDED");
  expect(() => collectPreparedSources({
    directDocumentSources: [], retrievalSources: [],
    includedConversationTurns: [{ lineageBasis: "SOURCE_BACKED", sources: [] }],
    authorizedMemory: null,
  })).toThrow("AI_TURN_LINEAGE_INVALID");
});

it("rejects a role downgrade after provider buffering and before finalization", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const prepared = await prepareWorkspaceChatMessage({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    message: "source-free status",
  });
  await expect(generateAndPersistWorkspaceChatMessage(prepared, {
    generate: vi.fn().mockResolvedValue("must never reach the browser"),
    beforeFinalize: async () => {
      await prisma.workspaceMember.update({
        where: {
          workspaceId_userId: { workspaceId: fixture.workspace.id, userId: fixture.user.id },
        },
        data: { role: "VIEWER" },
      });
    },
  })).rejects.toThrow("SOURCE_ACCESS_CHANGED");
  await expect(prisma.aiChatMessage.count({ where: { threadId: prepared.threadId } }))
    .resolves.toBe(0);
});
```

Create `tests/rag/authorized-provider-material.test.ts` and
`tests/rag/authorized-ai-finalization.test.ts` RED first. Require all of the following:

- only `authorized-provider-material.ts` can issue a material object, issuance records
  the exact direct/retrieval/conversation/memory union, and copied/forged/reused or
  post-issuance-mutated material fails;
- the material contains Leaf 4-produced fixed system authority plus labeled untrusted
  user data, but no Langfuse callback, provider transport, tenant/workspace/user/source
  telemetry field, or persistence function;
- `completeBoundedAiResult()` accepts exactly one complete string plus bounded raw
  provider usage/time evidence, rejects invalid UTF-8/empty/over-65,536-byte output, and
  has no callback, `onToken`, stream, iterator, `AsyncIterable`, or partial event member;
- only `authorized-ai-finalization.ts` imports the turn/message write seam. Shared
  `workspace-chat.ts` and `ask.ts` may call the finalizer but source scans reject direct
  assistant-message/turn persistence there;
- revoke, archive, purge, membership removal, and role change after the complete result
  but before finalization produce zero turn/message/source rows and no browser byte.

Change Langfuse/OTEL tests so production `full` capture fails before SDK
initialization, instrumentation never starts a prompt/response exporter, and metadata
contains no prompt/answer/history/memory, tenant/workspace/user, document/version/chunk,
source/citation, URL, or header field. This pre-Leaf 10 denial is part of Leaf 9, not
deferred to provider policy.

Add to `tests/rag/ask.test.ts`:

```ts
it("discards the answer when the selected source archives during generation", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const selected = await createSavedDocument({
    workspaceId: fixture.workspace.id,
    userId: fixture.user.id,
    title: "Archive During Ask",
    contentMarkdown: "synthetic saved context",
  });
  vi.mocked(invokeAnswerChain).mockImplementationOnce(async () => {
    await prisma.document.update({
      where: { id: selected.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    return "answer that must be discarded";
  });

  await expect(askDocumentQuestion({
    workspaceSlug: fixture.workspace.slug,
    documentId: selected.id,
    actorId: fixture.user.id,
    question: "What changed?",
  })).rejects.toThrow(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  expect(invokeAnswerChain).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run finalization tests to verify red**

Run: `pnpm exec vitest run tests/rag/authorized-provider-material.test.ts tests/rag/authorized-ai-finalization.test.ts tests/rag/workspace-chat.test.ts tests/rag/ask.test.ts tests/rag/langfuse.test.ts tests/rag/langfuse-otel.test.ts --reporter=dot`

Expected: FAIL because prepared messages have only chunk ids and finalization checks only thread status.

- [ ] **Step 3: Build the non-launderable bounded source union**

Add to `lib/rag/authorized-provider-material.ts`. Keep the source-union implementation
private except for the material issuer; shared services cannot construct a structurally
equivalent object:

```ts
const MAX_TURN_SOURCES = 512;

function aiSourceKey(source: AiSourceLineage) {
  return [source.workspaceId, source.documentId, source.documentVersionId, source.chunkId ?? ""]
    .join(":");
}

export function collectPreparedSources(input: {
  directDocumentSources: readonly AiSourceLineage[];
  retrievalSources: readonly AiSourceLineage[];
  includedConversationTurns: readonly {
    lineageBasis: "SOURCE_BACKED" | "SOURCE_FREE";
    sources: readonly AiSourceLineage[];
  }[];
  authorizedMemory: null | { summary: string; sources: readonly AiSourceLineage[] };
}) {
  for (const turn of input.includedConversationTurns) {
    if (turn.lineageBasis === "SOURCE_BACKED" && turn.sources.length === 0) {
      throw new Error("AI_TURN_LINEAGE_INVALID");
    }
  }
  if (input.authorizedMemory?.summary && input.authorizedMemory.sources.length === 0) {
    throw new Error("AI_MEMORY_LINEAGE_INVALID");
  }
  const all = [
    ...input.directDocumentSources,
    ...input.retrievalSources,
    ...input.includedConversationTurns.flatMap(({ sources }) => sources),
    ...(input.authorizedMemory?.sources ?? []),
  ];
  const sources = [...new Map(all.map((source) => [aiSourceKey(source), source])).values()];
  if (sources.length > MAX_TURN_SOURCES) throw new Error("AI_TURN_SOURCE_LIMIT_EXCEEDED");
  return {
    lineageBasis: sources.length === 0 ? "SOURCE_FREE" as const : "SOURCE_BACKED" as const,
    sources,
  };
}
```

Replace `WorkspaceChatPreparedMessage` with a shared-service wrapper around the
runtime-issued material:

```ts
export type WorkspaceChatPreparedMessage = {
  providerMaterial: AuthorizedProviderMaterial;
};
```

At the end of preparation, build every input class and call the union exactly once:

```ts
const retrievalSources = promptChunks.map((chunk) => ({
  workspaceId: workspace.id,
  documentId: chunk.documentId,
  documentVersionId: chunk.sourceVersionId,
  sourceUpdatedAt: chunk.sourceUpdatedAt,
  chunkId: chunk.id,
}));
const lineage = collectPreparedSources({
  directDocumentSources: selectedDocumentSource ? [selectedDocumentSource] : [],
  retrievalSources,
  includedConversationTurns: authorizedConversationTurns.map((turn) => ({
    lineageBasis: turn.lineageBasis,
    sources: turn.sources,
  })),
  authorizedMemory,
});

return {
  providerMaterial: issueAuthorizedProviderMaterial({
  threadId: thread.id,
  workspaceId: workspace.id,
  actorId: input.actorId,
  workspaceRoleAtPreparation: workspaceRole,
  message,
  prompt,
  lineageBasis: lineage.lineageBasis,
  sources: lineage.sources,
  promptChunkCount: promptChunks.length,
  citationChunkIds: promptChunks.map(({ id }) => id),
  chatProviderName,
  chatModelName,
  }),
};
```

`selectedDocumentSource`, `authorizedConversationTurns`, and `authorizedMemory` are the exact objects whose text is inserted into the prompt. If a caller omits one of their sources, tests fail. Do not derive lineage from answer-visible citations; every input that could influence generation is included.
`issueAuthorizedProviderMaterial()` freezes a private snapshot and records it in a
module-private issued-object registry. It includes no callback, telemetry trace,
provider transport, persistence callback, or tenant/source identifier intended for
telemetry. Leaf 10 later consumes this exact object rather than rebuilding prompt or
source material.

- [ ] **Step 4: Complete one bounded result, then invoke the only finalizer**

Create the complete-result primitive in `lib/rag/authorized-ai-finalization.ts`:

```ts
const MAX_COMPLETE_AI_RESULT_BYTES = 65_536;
const issuedCompleteResults = new WeakSet<object>();

export type CompleteBoundedAiResult = Readonly<{
  answer: string;
  usageEvidence: {
    inputTokens: unknown;
    outputTokens: unknown;
    completedAt: unknown;
  } | null;
}>;

export function completeBoundedAiResult(input: {
  answer: string;
  usageEvidence?: CompleteBoundedAiResult["usageEvidence"];
}): CompleteBoundedAiResult {
  const answer = input.answer.trim();
  if (!answer) throw new Error(RAG_ERROR_CODES.CHAT_REQUEST_FAILED);
  if (Buffer.byteLength(answer, "utf8") > MAX_COMPLETE_AI_RESULT_BYTES) {
    throw new Error("AI_RESPONSE_TOO_LARGE");
  }
  const result = Object.freeze({
    answer,
    usageEvidence: input.usageEvidence ?? null,
  });
  issuedCompleteResults.add(result);
  return result;
}
```

The provider adapter may internally collect transport chunks, but it must return one
finished string to `completeBoundedAiResult()`. No Leaf 9 API accepts or returns
`onToken`, a callback, `ReadableStream`, `AsyncIterable`, iterator, NDJSON event, or
partial byte. Source tests reject those member names and types.

Move the complete message-create transaction into
`finalizeAuthorizedWorkspaceAiResult(material, result)` in
`lib/rag/authorized-ai-finalization.ts`. It first verifies both objects were issued,
consumes each once, normalizes the complete answer/citations, and then executes this
transaction. Shared `workspace-chat.ts` may only call the finalizer:

```ts
const prepared = consumeAuthorizedProviderMaterial(material);
assertIssuedCompleteBoundedAiResult(result);
const normalizedAnswer = normalizeAnswerCitations(result.answer, prepared.citations);
const { userMessage, assistantMessage, updatedThread } = await prisma.$transaction(async (tx) => {
  const boundary = await tx.$queryRaw<Array<{
    threadId: string;
    workspaceRole: WorkspaceRole;
    organizationId: string;
  }>>(Prisma.sql`
    SELECT thread."id" AS "threadId", member."role"::text AS "workspaceRole",
           workspace."organizationId" AS "organizationId"
    FROM "AiChatThread" thread
    JOIN "Workspace" workspace ON workspace."id" = thread."workspaceId"
    JOIN "WorkspaceMember" member
      ON member."workspaceId" = workspace."id" AND member."userId" = ${prepared.actorId}
    WHERE thread."id" = ${prepared.threadId}
      AND thread."workspaceId" = ${prepared.workspaceId}
      AND thread."userId" = ${prepared.actorId}
      AND thread."status" = 'ACTIVE'
      AND thread."lineageState" = 'PROVEN'
      AND workspace."archivedAt" IS NULL
    FOR UPDATE OF thread
    FOR SHARE OF workspace, member
  `);
  const current = boundary[0];
  if (!current) throw new Error(WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED);
  if (current.workspaceRole !== prepared.workspaceRoleAtPreparation) {
    throw new Error("SOURCE_ACCESS_CHANGED");
  }
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "OrganizationMember"
    WHERE "organizationId" = ${current.organizationId} AND "userId" = ${prepared.actorId}
    FOR SHARE
  `);
  if (prepared.sources.length > 0) {
    await tx.$queryRaw(Prisma.sql`
      SELECT document."id"
      FROM "Document" document
      JOIN "DocumentVersion" version ON version."documentId" = document."id"
      WHERE (document."id", version."id") IN (${Prisma.join(prepared.sources.map((source) =>
        Prisma.sql`(${source.documentId}, ${source.documentVersionId})`))})
      ORDER BY document."id" ASC, version."id" ASC
      FOR SHARE OF document, version
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT permission."id" FROM "Permission" permission
      WHERE permission."resourceType" = 'DOCUMENT'
        AND permission."resourceId" IN (${Prisma.join(prepared.sources.map(({ documentId }) => documentId))})
      ORDER BY permission."id" ASC
      FOR SHARE OF permission
    `);
  }
  if (
    (prepared.lineageBasis === "SOURCE_BACKED" && prepared.sources.length === 0) ||
    (prepared.lineageBasis === "SOURCE_FREE" && prepared.sources.length !== 0)
  ) throw new Error("AI_TURN_LINEAGE_INVALID");
  const sourcesAuthorized = prepared.lineageBasis === "SOURCE_FREE" || await authorizeAiSources(tx, {
    workspaceId: prepared.workspaceId,
    actorId: prepared.actorId,
    workspaceRole: current.workspaceRole,
    sources: prepared.sources,
  });
  if (!sourcesAuthorized) throw new Error("SOURCE_ACCESS_CHANGED");
  const turn = await tx.aiChatTurn.create({
    data: {
      threadId: prepared.threadId,
      visibility: "VISIBLE",
      lineageBasis: prepared.lineageBasis,
      sources: {
        create: prepared.sources.map((source) => ({
          workspaceId: source.workspaceId,
          documentId: source.documentId,
          documentVersionId: source.documentVersionId,
          sourceUpdatedAt: source.sourceUpdatedAt,
          chunkId: source.chunkId ?? null,
          sourceKey: aiSourceKey(source),
        })),
      },
    },
  });
  const persistedUserMessage = await tx.aiChatMessage.create({
    data: {
      threadId: prepared.threadId,
      turnId: turn.id,
      role: "USER",
      content: prepared.message,
    },
  });
  const persistedAssistantMessage = await tx.aiChatMessage.create({
    data: {
      threadId: prepared.threadId,
      turnId: turn.id,
      role: "ASSISTANT",
      content: normalizedAnswer.answer,
      citations: normalizedAnswer.citations as Prisma.InputJsonValue,
      contextMeta: {
        retrievedChunkCount: prepared.promptChunkCount,
        policyVersion: 1,
      },
      model: prepared.chatModelName,
    },
  });
  const persistedThread = await tx.aiChatThread.update({
    where: { id: prepared.threadId },
    data: { lastMessageAt: persistedAssistantMessage.createdAt },
    include: {
      turns: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: THREAD_MESSAGE_LIMIT / 2,
        include: { messages: true, sources: true },
      },
    },
  });
  return {
    userMessage: persistedUserMessage,
    assistantMessage: persistedAssistantMessage,
    updatedThread: persistedThread,
  };
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```

The finalizer returns a frozen internal object containing the committed public DTO and
the complete result's raw bounded usage evidence for Leaf 10 settlement. The usage
evidence is never placed in the public DTO. A source-access failure returns no object
and the transaction leaves zero turn/message/source rows.

For direct Ask, `lib/rag/ask.ts` issues `AuthorizedProviderMaterial`, obtains one
complete result without Langfuse/OTEL callbacks, and calls the only Ask finalizer:

```ts
const material = issueAuthorizedProviderMaterial({
  kind: "ask_document",
  workspaceId: workspace.id,
  actorId: input.actorId,
  workspaceRoleAtPreparation,
  prompt,
  lineageBasis: "SOURCE_BACKED",
  sources: [source],
});
const completeResult = completeBoundedAiResult({
  answer: await invokeAnswerChain({
  systemPrompt: material.systemPrompt,
  userPrompt: material.userPrompt,
  chatModel,
  }),
});
return finalizeAuthorizedAskResult(material, completeResult);
```

`finalizeAuthorizedAskResult()` lives in `authorized-ai-finalization.ts` and owns this
exact boundary:

```ts
return prisma.$transaction(async (tx) => {
  const prepared = consumeAuthorizedProviderMaterial(material);
  assertIssuedCompleteBoundedAiResult(completeResult);
  const rows = await tx.$queryRaw<Array<{ workspaceRole: WorkspaceRole }>>(Prisma.sql`
    SELECT member."role"::text AS "workspaceRole"
    FROM "Document" document
    JOIN "Workspace" workspace ON workspace."id" = document."workspaceId"
    JOIN "WorkspaceMember" member
      ON member."workspaceId" = workspace."id" AND member."userId" = ${input.actorId}
    JOIN "DocumentVersion" version
      ON version."id" = ${source.documentVersionId} AND version."documentId" = document."id"
    WHERE document."id" = ${source.documentId}
      AND document."workspaceId" = ${source.workspaceId}
      AND document."status" = 'ACTIVE' AND document."archivedAt" IS NULL
      AND workspace."archivedAt" IS NULL
    FOR SHARE OF document, workspace, member, version
  `);
  const currentRole = rows[0]?.workspaceRole;
  if (!currentRole || currentRole !== workspaceRoleAtPreparation) {
    throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  }
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Permission"
    WHERE "resourceType" = 'DOCUMENT' AND "resourceId" = ${source.documentId}
    ORDER BY "id" ASC FOR SHARE
  `);
  if (!await authorizeAiSources(tx, {
    workspaceId: source.workspaceId,
    actorId: input.actorId,
    workspaceRole: currentRole,
    sources: [source],
  })) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  return {
    response: { answer: completeResult.answer, citations: prepared.citations },
    settlementEvidence: completeResult.usageEvidence,
  };
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```

The Ask route awaits the owned finalizer before constructing `NextResponse`; a
rejected final boundary sends no answer bytes. Leaf 10 later settles the provider lease
after response construction on both success and final-authorization failure.

In the same task, make `lib/rag/langfuse.ts` reject production `full` capture and
return no LangChain callback in production metadata mode. Make
`lib/rag/langfuse-otel.ts` and `instrumentation.ts` skip Langfuse OTEL initialization
unless a future capability version explicitly requalifies a content-free exporter.
The only interim metadata keys are fixed low-cardinality operation/outcome codes; no
tenant, workspace, user, source, document, version, chunk, citation, content, or URL
field is accepted. Startup validates this before any SDK initialization.

- [ ] **Step 5: Run finalization tests to verify green**

Run: `pnpm exec vitest run tests/rag/authorized-provider-material.test.ts tests/rag/authorized-ai-finalization.test.ts tests/rag/workspace-chat.test.ts tests/rag/ask.test.ts tests/rag/source-authorization.test.ts tests/rag/langfuse.test.ts tests/rag/langfuse-otel.test.ts --reporter=dot`

Expected: PASS; changed source state persists zero turn/message rows and direct Ask returns no answer.

- [ ] **Step 6: Commit turn lineage finalization**

```bash
git add lib/rag/authorized-provider-material.ts lib/rag/authorized-ai-finalization.ts lib/rag/workspace-chat.ts lib/rag/ask.ts lib/rag/langfuse.ts lib/rag/langfuse-otel.ts instrumentation.ts tests/rag/authorized-provider-material.test.ts tests/rag/authorized-ai-finalization.test.ts tests/rag/workspace-chat.test.ts tests/rag/ask.test.ts tests/rag/langfuse.test.ts tests/rag/langfuse-otel.test.ts wiki/RAG\ Process\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: persist and reauthorize AI turn lineage"
```

Expected: commit succeeds after generation-race tests pass.

### Task 5: Reauthorize Thread Views and Follow-Up Prompts

**Files:**
- Modify: `lib/rag/workspace-chat.ts`
- Create: `lib/rag/source-access-revocation.ts`
- Modify: `tests/rag/workspace-chat.test.ts`
- Create: `tests/rag/source-access-revocation.test.ts`

**Interfaces:**
- Consumes: Task 3 `authorizeThreadTurns()` and Task 4 turn relations.
- Produces: thread responses with `AiAuthorizedMessageDto[]`; `authorizedConversationTurns` carries each included turn's exact sources into Task 4's union; fixed tombstones never enter prompts; new redactions append per-source `AI_SOURCE_ACCESS_REVOKED` followed by `AI_HISTORY_REDACTED` atomically.

- [ ] **Step 1: Write post-generation revocation tests**

Add to `tests/rag/workspace-chat.test.ts`:

```ts
async function createTwoSourcePersistedTurn(fixture: WorkspaceFixture) {
  const allowed = await createSavedDocumentWithVersion(fixture, "Allowed Turn Source");
  const denied = await createSavedDocumentWithVersion(fixture, "Denied Turn Source");
  const thread = await prisma.aiChatThread.create({
    data: {
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      status: "ACTIVE",
      lineageState: "PROVEN",
      turns: {
        create: {
          visibility: "VISIBLE",
          lineageBasis: "SOURCE_BACKED",
          messages: {
            create: [
              { role: "USER", content: "synthetic question" },
              { role: "ASSISTANT", content: "derived secret answer" },
            ],
          },
          sources: {
            create: [allowed, denied].map(({ document, version }) => ({
              workspaceId: fixture.workspace.id,
              documentId: document.id,
              documentVersionId: version.id,
              sourceUpdatedAt: document.updatedAt,
              sourceKey: `${fixture.workspace.id}:${document.id}:${version.id}:`,
            })),
          },
        },
      },
    },
  });
  return {
    threadId: thread.id,
    allowedDocumentId: allowed.document.id,
    deniedDocumentId: denied.document.id,
  };
}

it("redacts an entire mixed-source turn after one source is revoked and excludes it from follow-up", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const sources = await createTwoSourcePersistedTurn(fixture);
  await prisma.permission.create({
    data: {
      resourceType: "DOCUMENT",
      resourceId: sources.deniedDocumentId,
      subjectType: "USER",
      subjectId: "different-user",
      permission: "READ",
    },
  });
  const loaded = await getOrCreateWorkspaceChatThread({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
  });
  expect(loaded.messages).toEqual([expect.objectContaining({
    redacted: true,
    code: "SOURCE_ACCESS_CHANGED",
    content: null,
  })]);
  expect(JSON.stringify(loaded)).not.toContain("derived secret answer");

  await sendWorkspaceChatMessage({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    message: "follow up",
  });
  const prompt = vi.mocked(invokeAnswerChain).mock.calls.at(-1)?.[0].userPrompt;
  expect(prompt).not.toContain("derived secret answer");
  expect(prompt).not.toContain("SOURCE_ACCESS_CHANGED");
  const prepared = await prepareWorkspaceChatMessage({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    message: "another follow up",
  });
  expect(prepared.sources.some(({ documentId }) => documentId === sources.allowedDocumentId)).toBe(false);
  expect(prepared.sources.some(({ documentId }) => documentId === sources.deniedDocumentId)).toBe(false);
});

async function createPersistedTurnWithSources(
  fixture: WorkspaceFixture,
  sources: Array<Awaited<ReturnType<typeof createSavedDocumentWithVersion>>>,
) {
  return prisma.aiChatThread.create({
    data: {
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      status: "ACTIVE",
      lineageState: "PROVEN",
      turns: { create: {
        visibility: "VISIBLE",
        lineageBasis: "SOURCE_BACKED",
        messages: { create: [
          { role: "USER", content: "synthetic prior question" },
          { role: "ASSISTANT", content: "synthetic prior answer" },
        ] },
        sources: { create: sources.map(({ document, version }) => ({
          workspaceId: fixture.workspace.id,
          documentId: document.id,
          documentVersionId: version.id,
          sourceUpdatedAt: document.updatedAt,
          sourceKey: `${fixture.workspace.id}:${document.id}:${version.id}:`,
        })) },
      } },
    },
  });
}

it("carries every authorized included-turn source into a follow-up even with no new retrieval", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const prior = await createSavedDocumentWithVersion(fixture, "Prior Source");
  await createPersistedTurnWithSources(fixture, [prior]);
  vi.mocked(searchSimilarChunks).mockResolvedValue([]);
  const prepared = await prepareWorkspaceChatMessage({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    message: "continue from that answer",
  });
  expect(prepared.lineageBasis).toBe("SOURCE_BACKED");
  expect(prepared.sources).toEqual([expect.objectContaining({
    documentId: prior.document.id,
    documentVersionId: prior.version.id,
  })]);
});
```

- [ ] **Step 2: Run view/follow-up tests to verify red**

Run: `pnpm exec vitest run tests/rag/workspace-chat.test.ts --reporter=dot`

Expected: FAIL because thread loads return raw messages and follow-up prompt construction reads all thread messages.

- [ ] **Step 3: Load turns, authorize, and persist redaction state**

Change active-thread includes to:

```ts
turns: {
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  take: THREAD_MESSAGE_LIMIT / 2,
  include: {
    messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    sources: true,
  },
},
```

Import `randomUUID`, `appendSecurityJournalEvent`, and `deriveSecurityJournalOperationId`. After loading, call `authorizeThreadTurns()`. Replace the standalone update with one SERIALIZABLE journaled transition:

```ts
const deniedTurnIds = thread.turns
  .filter((turn) => !authorized.visibleTurnIds.includes(turn.id))
  .filter((turn) => turn.visibility === "VISIBLE")
  .map(({ id }) => id);
const redactionRootOperationId = randomUUID();
if (deniedTurnIds.length > 0) {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.aiChatTurn.findMany({
      where: { id: { in: deniedTurnIds }, threadId: thread.id, visibility: "VISIBLE" },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    await tx.aiChatTurn.updateMany({
      where: { id: { in: claimed.map(({ id }) => id) }, visibility: "VISIBLE" },
      data: { visibility: "SOURCE_REDACTED" },
    });
    for (const turn of claimed) {
      const revokedSources = await lockUnreadableTurnSources(tx, turn.id);
      await appendAiSourceAccessRevocations(tx, {
        rootOperationId: redactionRootOperationId,
        sources: revokedSources.map(({ id }) => ({ subjectId: id })),
      });
      await appendSecurityJournalEvent(tx, {
        kind: "AI_HISTORY_REDACTED",
        subjectType: "AI_CHAT_TURN",
        subjectId: turn.id,
        operationId: deriveSecurityJournalOperationId({
          rootOperationId: redactionRootOperationId,
          kind: "AI_HISTORY_REDACTED",
          subjectType: "AI_CHAT_TURN",
          subjectId: turn.id,
        }),
        payload: { stateCode: "AI_HISTORY_REDACTED", stateVersion: 1 },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
return {
  thread: publicThreadDto(thread),
  messages: authorized.messages,
  authorizedConversationTurns: authorized.visibleTurns.map((turn) => ({
    lineageBasis: turn.lineageBasis,
    messages: turn.messages,
    sources: turn.sources,
  })),
};
```

For follow-up preparation, pass only `authorizedConversationTurns.flatMap(({ messages }) => messages)` as text and pass those same turn objects to `collectPreparedSources()`. Never pass tombstone text, hidden raw rows, or a source-free replacement for a source-backed prior turn.

- [ ] **Step 4: Run view/follow-up tests to verify green**

Run: `pnpm exec vitest run tests/rag/workspace-chat.test.ts tests/rag/source-authorization.test.ts --reporter=dot`

Expected: PASS; the thread response has one tombstone and the follow-up prompt has no hidden content/tombstone code.

- [ ] **Step 5: Commit authorized thread views**

```bash
git add lib/rag/workspace-chat.ts tests/rag/workspace-chat.test.ts wiki/RAG\ Process\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: redact unauthorized AI history"
```

Expected: commit succeeds after thread-view tests pass.

### Task 6: Memory Revision Lineage and Authorization

**Files:**
- Modify: `lib/rag/workspace-chat.ts`
- Create: `tests/rag/workspace-chat-memory-authorization.test.ts`

**Interfaces:**
- Consumes: Task 3 source authorization and Task 5 authorized turn set.
- Produces: exported `loadAuthorizedMemory(input): Promise<{ summary: string; sources: AiSourceLineage[] } | null>` and `refreshWorkspaceChatMemory(input): Promise<{ memoryRevision: number; memorySummary: string }>`; memory revisions store the exact source union in `AiChatMemorySource`, unauthorized memory becomes journaled `SOURCE_REDACTED`, and no hidden memory enters a prompt.

- [ ] **Step 1: Write failing memory tests**

Create `tests/rag/workspace-chat-memory-authorization.test.ts`:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import type { AiSourceLineage } from "@/lib/rag/source-authorization";
import {
  loadAuthorizedMemory,
  refreshWorkspaceChatMemory,
} from "@/lib/rag/workspace-chat";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

type Fixture = Awaited<ReturnType<typeof seedWorkspaceFixture>>;

async function createSource(fixture: Fixture, suffix: string) {
  const document = await prisma.document.create({
    data: {
      workspaceId: fixture.workspace.id,
      title: `Memory Source ${suffix}`,
      slug: `memory-source-${suffix}`,
      path: `/memory-source-${suffix}`,
      contentMarkdown: `synthetic source ${suffix}`,
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
      versions: {
        create: {
          versionNumber: 1,
          title: `Memory Source ${suffix}`,
          contentMarkdown: `synthetic source ${suffix}`,
          createdById: fixture.user.id,
        },
      },
    },
    include: { versions: true },
  });
  const source: AiSourceLineage = {
    workspaceId: fixture.workspace.id,
    documentId: document.id,
    documentVersionId: document.versions[0].id,
    sourceUpdatedAt: document.updatedAt,
  };
  return { document, source };
}

async function createThread(fixture: Fixture) {
  return prisma.aiChatThread.create({
    data: {
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      status: "ACTIVE",
      lineageState: "PROVEN",
    },
  });
}

describe("Workspace AI memory source authorization", () => {
  beforeEach(resetTestData);

  it("stores the deduplicated source union for a new memory revision", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const thread = await createThread(fixture);
    const first = await createSource(fixture, "first");
    const second = await createSource(fixture, "second");

    const saved = await refreshWorkspaceChatMemory({
      threadId: thread.id,
      workspaceId: fixture.workspace.id,
      actorId: fixture.user.id,
      workspaceRole: WorkspaceRole.EDITOR,
      sources: [first.source, second.source, first.source],
      summarize: async () => "synthetic memory summary",
    });

    expect(saved).toEqual({ memoryRevision: 1, memorySummary: "synthetic memory summary" });
    const rows = await prisma.aiChatMemorySource.findMany({
      where: { threadId: thread.id, memoryRevision: 1 },
      orderBy: { documentId: "asc" },
    });
    expect(rows.map(({ documentId, documentVersionId }) => ({ documentId, documentVersionId })))
      .toEqual([
        { documentId: first.document.id, documentVersionId: first.document.versions[0].id },
        { documentId: second.document.id, documentVersionId: second.document.versions[0].id },
      ].sort((left, right) => left.documentId.localeCompare(right.documentId)));
    await expect(loadAuthorizedMemory({
      threadId: thread.id,
      workspaceId: fixture.workspace.id,
      actorId: fixture.user.id,
      workspaceRole: WorkspaceRole.EDITOR,
    })).resolves.toMatchObject({
      summary: "synthetic memory summary",
      sources: expect.arrayContaining([
        expect.objectContaining({ documentId: first.document.id }),
        expect.objectContaining({ documentId: second.document.id }),
      ]),
    });
  });

  it("redacts and does not return memory after one source ACL is revoked", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const thread = await createThread(fixture);
    const source = await createSource(fixture, "revoked");
    await refreshWorkspaceChatMemory({
      threadId: thread.id,
      workspaceId: fixture.workspace.id,
      actorId: fixture.user.id,
      workspaceRole: WorkspaceRole.EDITOR,
      sources: [source.source],
      summarize: async () => "restricted memory text",
    });
    await prisma.permission.create({
      data: {
        resourceType: "DOCUMENT",
        resourceId: source.document.id,
        subjectType: "USER",
        subjectId: "different-user",
        permission: "READ",
      },
    });

    await expect(loadAuthorizedMemory({
      threadId: thread.id,
      workspaceId: fixture.workspace.id,
      actorId: fixture.user.id,
      workspaceRole: WorkspaceRole.EDITOR,
    })).resolves.toBeNull();
    await expect(prisma.aiChatThread.findUniqueOrThrow({
      where: { id: thread.id },
      select: { memoryVisibility: true },
    })).resolves.toEqual({ memoryVisibility: "SOURCE_REDACTED" });
  });

  it("does not save a summary when a source archives during summarization", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const thread = await createThread(fixture);
    const source = await createSource(fixture, "archive-race");

    await expect(refreshWorkspaceChatMemory({
      threadId: thread.id,
      workspaceId: fixture.workspace.id,
      actorId: fixture.user.id,
      workspaceRole: WorkspaceRole.EDITOR,
      sources: [source.source],
      summarize: async () => {
        await prisma.document.update({
          where: { id: source.document.id },
          data: { status: "ARCHIVED", archivedAt: new Date() },
        });
        return "must not persist";
      },
    })).rejects.toThrow("SOURCE_ACCESS_CHANGED");
    await expect(prisma.aiChatThread.findUniqueOrThrow({
      where: { id: thread.id },
      select: { memorySummary: true, memoryRevision: true },
    })).resolves.toEqual({ memorySummary: null, memoryRevision: 0 });
    await expect(prisma.aiChatMemorySource.count({ where: { threadId: thread.id } }))
      .resolves.toBe(0);
  });

  it("keeps legacy hidden memory out of the callable prompt-memory seam", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const thread = await prisma.aiChatThread.create({
      data: {
        workspaceId: fixture.workspace.id,
        userId: fixture.user.id,
        status: "ARCHIVED",
        lineageState: "LEGACY_HIDDEN",
        memorySummary: "legacy hidden memory",
        memoryVisibility: "LEGACY_HIDDEN",
      },
    });

    await expect(loadAuthorizedMemory({
      threadId: thread.id,
      workspaceId: fixture.workspace.id,
      actorId: fixture.user.id,
      workspaceRole: WorkspaceRole.EDITOR,
    })).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run memory tests to verify red**

Run: `pnpm exec vitest run tests/rag/workspace-chat-memory-authorization.test.ts --reporter=dot`

Expected: FAIL because current memory has no lineage and is always placed into subsequent prompts.

- [ ] **Step 3: Reauthorize memory before use**

Add this exported helper in `lib/rag/workspace-chat.ts`, and call it before `buildConversationQuestion()` so only its return value can populate `memorySummary`:

```ts
export async function loadAuthorizedMemory(input: {
  threadId: string;
  workspaceId: string;
  actorId: string;
  workspaceRole: WorkspaceRole;
}): Promise<{ summary: string; sources: AiSourceLineage[] } | null> {
  const redactionRootOperationId = randomUUID();
  const thread = await prisma.aiChatThread.findUnique({
    where: { id: input.threadId },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      status: true,
      lineageState: true,
      memorySummary: true,
      memoryRevision: true,
      memoryVisibility: true,
    },
  });
  if (
    !thread ||
    thread.workspaceId !== input.workspaceId ||
    thread.userId !== input.actorId ||
    thread.status !== "ACTIVE" ||
    thread.lineageState !== "PROVEN" ||
    !thread.memorySummary ||
    thread.memoryVisibility !== "VISIBLE" ||
    thread.memoryRevision < 1
  ) return null;
  const sources = await prisma.aiChatMemorySource.findMany({
    where: { threadId: thread.id, memoryRevision: thread.memoryRevision },
  });
  if (sources.length === 0) {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.aiChatThread.updateMany({
        where: { id: thread.id, memoryVisibility: "VISIBLE" },
        data: { memoryVisibility: "LEGACY_HIDDEN" },
      });
      if (changed.count === 1) await appendSecurityJournalEvent(tx, {
        kind: "AI_HISTORY_REDACTED",
        subjectType: "AI_CHAT_MEMORY",
        subjectId: thread.id,
        operationId: deriveSecurityJournalOperationId({
          rootOperationId: redactionRootOperationId,
          kind: "AI_HISTORY_REDACTED",
          subjectType: "AI_CHAT_MEMORY",
          subjectId: thread.id,
        }),
        payload: { stateCode: "AI_HISTORY_REDACTED", stateVersion: 1 },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return null;
  }
  const allowed = await authorizeAiSources(prisma, {
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    workspaceRole: input.workspaceRole,
    sources,
  });
  if (allowed) return {
    summary: thread.memorySummary,
    sources: sources.map((source) => ({
      workspaceId: source.workspaceId,
      documentId: source.documentId,
      documentVersionId: source.documentVersionId,
      sourceUpdatedAt: source.sourceUpdatedAt,
    })),
  };
  await prisma.$transaction(async (tx) => {
    const changed = await tx.aiChatThread.updateMany({
      where: { id: thread.id, memoryVisibility: "VISIBLE" },
      data: { memoryVisibility: "SOURCE_REDACTED" },
    });
    if (changed.count === 1) await appendSecurityJournalEvent(tx, {
      kind: "AI_HISTORY_REDACTED",
      subjectType: "AI_CHAT_MEMORY",
      subjectId: thread.id,
      operationId: deriveSecurityJournalOperationId({
        rootOperationId: redactionRootOperationId,
        kind: "AI_HISTORY_REDACTED",
        subjectType: "AI_CHAT_MEMORY",
        subjectId: thread.id,
      }),
      payload: { stateCode: "AI_HISTORY_REDACTED", stateVersion: 1 },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return null;
}
```

`appendAiSourceAccessRevocations` sorts exact immutable typed source targets. The
canonical `AI_SOURCE_ACCESS` subject id is
`TURN_SOURCE:<AiChatTurnSource.id>` or
`MEMORY_SOURCE:<AiChatMemorySource.id>`; `encodeAiSourceAccessSubject` and
`parseAiSourceAccessSubject` reject unknown prefixes, empty/oversize/control-character
IDs, document/version substitutions, and non-canonical round trips. The helper derives
one UUID per typed target and appends the exact two-key payload before the parent
history redaction. In the same transaction it sets that exact lineage row's nullable
`accessRevokedAt` once using DB time. The whole source+history transition rolls back on
any row/event failure. Memory redaction in Task 6 uses the same helper with the
`MEMORY_SOURCE` target.

- [ ] **Step 4: Save memory and lineage atomically after reauthorization**

When summarizing authorized turns, calculate the deduplicated union of their sources and use this exported callable seam. Passing `summarize` makes the source-change race deterministic in tests while production passes `() => summarizeConversationMemory(...)`:

```ts
export async function refreshWorkspaceChatMemory(input: {
  threadId: string;
  workspaceId: string;
  actorId: string;
  workspaceRole: WorkspaceRole;
  sources: AiSourceLineage[];
  summarize: () => Promise<string | null>;
}): Promise<{ memoryRevision: number; memorySummary: string }> {
  const memoryRefreshRootOperationId = randomUUID();
  const memorySources = [...new Map(input.sources.map((source) => [
    `${source.workspaceId}:${source.documentId}:${source.documentVersionId}`,
    {
      workspaceId: source.workspaceId,
      documentId: source.documentId,
      documentVersionId: source.documentVersionId,
      sourceUpdatedAt: source.sourceUpdatedAt,
    },
  ])).values()];
  if (memorySources.length > 512) throw new Error("AI_MEMORY_SOURCE_LIMIT_EXCEEDED");
  if (memorySources.length === 0) throw new Error("SOURCE_ACCESS_CHANGED");
  const memorySummary = normalizeMemorySummary(await input.summarize());
  if (!memorySummary) throw new Error("MEMORY_SUMMARY_EMPTY");

  try {
    return await prisma.$transaction(async (tx) => {
    const current = await tx.aiChatThread.findFirst({
      where: {
        id: input.threadId,
        workspaceId: input.workspaceId,
        userId: input.actorId,
        status: "ACTIVE",
        lineageState: "PROVEN",
        workspace: { archivedAt: null },
      },
      select: { id: true, memoryRevision: true },
    });
    if (!current) throw new Error(WORKSPACE_CHAT_ERROR_CODES.THREAD_ARCHIVED);
    const allowed = await authorizeAiSources(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      workspaceRole: input.workspaceRole,
      sources: memorySources,
    });
    if (!allowed) throw new Error("SOURCE_ACCESS_CHANGED");
    const [clock] = await tx.$queryRaw<Array<{ databaseNow: Date }>>(Prisma.sql`
      SELECT clock_timestamp() AS "databaseNow"
    `);
    if (!clock || !Number.isFinite(clock.databaseNow.getTime())) {
      throw new Error("AI_HISTORY_CLOCK_INVALID");
    }
    const memoryRevision = current.memoryRevision + 1;
    await tx.aiChatMemorySource.createMany({
      data: memorySources.map((source) => ({
        threadId: current.id,
        memoryRevision,
        workspaceId: source.workspaceId,
        documentId: source.documentId,
        documentVersionId: source.documentVersionId,
        sourceUpdatedAt: source.sourceUpdatedAt,
      })),
      skipDuplicates: true,
    });
    await tx.aiChatThread.update({
      where: { id: current.id },
      data: {
        memorySummary,
        memoryUpdatedAt: clock.databaseNow,
        memoryRevision,
        memoryVisibility: "VISIBLE",
      },
    });
      return { memoryRevision, memorySummary };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SOURCE_ACCESS_CHANGED") {
      await prisma.$transaction(async (tx) => {
        const changed = await tx.aiChatThread.updateMany({
          where: {
            id: input.threadId,
            workspaceId: input.workspaceId,
            userId: input.actorId,
            memoryVisibility: "VISIBLE",
          },
          data: { memoryVisibility: "SOURCE_REDACTED" },
        });
        if (changed.count === 1) await appendSecurityJournalEvent(tx, {
          kind: "AI_HISTORY_REDACTED",
          subjectType: "AI_CHAT_MEMORY",
          subjectId: input.threadId,
          operationId: deriveSecurityJournalOperationId({
            rootOperationId: memoryRefreshRootOperationId,
            kind: "AI_HISTORY_REDACTED",
            subjectType: "AI_CHAT_MEMORY",
            subjectId: input.threadId,
          }),
          payload: { stateCode: "AI_HISTORY_REDACTED", stateVersion: 1 },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
    throw error;
  }
}
```

On `SOURCE_ACCESS_CHANGED`, do not overwrite the old retained summary; mark its visibility redacted and proceed with bounded authorized recent history only.
Add a two-worker test with application clocks skewed by 48 hours. Both workers must
persist the post-lock PostgreSQL time, and no `new Date()`/`Date.now()` call may author
memory revision, visibility, redaction, or finalization state.

- [ ] **Step 5: Run memory tests to verify green**

Run: `pnpm exec vitest run tests/rag/workspace-chat-memory-authorization.test.ts tests/rag/workspace-chat.test.ts --reporter=dot`

Expected: PASS; revoked/archive-race memory never enters a prompt and legacy memory remains hidden.

- [ ] **Step 6: Commit memory lineage**

```bash
git add lib/rag/workspace-chat.ts tests/rag/workspace-chat-memory-authorization.test.ts wiki/RAG\ Process\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: authorize AI memory lineage"
```

Expected: commit succeeds after memory authorization tests pass.

### Task 7: Route and UI Tombstone Contract

**Files:**
- Modify: `app/api/workspaces/[workspaceSlug]/assistant/thread/route.ts`
- Modify: `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`
- Modify: `app/api/workspaces/[workspaceSlug]/assistant/error-response.ts`
- Modify: `components/workspace-chatbot.tsx`
- Modify: `lib/i18n/messages.ts`
- Modify: `tests/rag/workspace-chat-route.test.ts`
- Modify: `tests/components/workspace-chatbot.test.tsx`
- Modify: `tests/i18n/messages.test.ts`

**Interfaces:**
- Consumes: Tasks 4–6 authorized DTO/error codes.
- Produces: one committed JSON response or `SOURCE_ACCESS_CHANGED` HTTP 409, never a token stream; fixed localized tombstone UI; `private, no-store` thread/message responses.

- [ ] **Step 1: Write failing route/UI tests**

Add route assertions:

```ts
expect(response.headers.get("cache-control")).toBe("private, no-store");
expect(await response.json()).toEqual({ error: "SOURCE_ACCESS_CHANGED" });
expect(response.status).toBe(409);
```

Add a deferred finalization route test:

```ts
it("does not expose a response body before buffered output is authorized and committed", async () => {
  const finalized = deferred<WorkspaceChatResult>();
  vi.mocked(sendWorkspaceChatMessage).mockReturnValueOnce(finalized.promise);
  let settled = false;
  const responsePromise = POST(validWorkspaceRequest()).finally(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  finalized.reject(new Error("SOURCE_ACCESS_CHANGED"));
  const response = await responsePromise;
  expect(response.status).toBe(409);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual({ error: "SOURCE_ACCESS_CHANGED" });
});
```

Add a component test rendering a redacted message DTO and assert it shows catalog key text `Some AI history is hidden because its source access changed.` while neither original content nor source/citation ids appear.

- [ ] **Step 2: Run route/UI tests to verify red**

Run: `pnpm exec vitest run tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx tests/i18n/messages.test.ts --reporter=dot`

Expected: FAIL because source-access errors collapse to `AI_UNAVAILABLE` and message types do not support tombstones.

- [ ] **Step 3: Return only post-commit JSON and disable caching**

In `workspaceChatErrorResponse()`, add before RAG runtime mapping:

```ts
if (message === "SOURCE_ACCESS_CHANGED") {
  return NextResponse.json({ error: message }, {
    status: 409,
    headers: { "cache-control": "private, no-store" },
  });
}
```

Replace the message route's streaming branch with:

```ts
try {
  const result = await sendWorkspaceChatMessage({
    workspaceSlug,
    actorId: user.id,
    message: body.message,
    selectedDocumentId: body.selectedDocumentId,
  });
  return NextResponse.json(result, {
    status: 200,
    headers: { "cache-control": "private, no-store" },
  });
} catch (error) {
  return workspaceChatErrorResponse(error);
}
```

Delete the NDJSON `start`, `token`, `done`, and post-start error event writer. Set `private, no-store` on thread GET and message POST. In `components/workspace-chatbot.tsx`, replace the stream reader with:

```tsx
type CommittedWorkspaceChatResponse = {
  thread: WorkspaceChatThreadDto;
  userMessage: AiAuthorizedMessageDto;
  assistantMessage: AiAuthorizedMessageDto;
};

async function postWorkspaceChatMessage(input: {
  endpoint: string;
  message: string;
  selectedDocumentId?: string;
  signal: AbortSignal;
}): Promise<CommittedWorkspaceChatResponse> {
  const response = await fetch(input.endpoint, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: input.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: input.message,
      selectedDocumentId: input.selectedDocumentId,
    }),
  });
  const body = await response.json() as CommittedWorkspaceChatResponse | { error: string };
  if (!response.ok || !("assistantMessage" in body)) {
    throw new Error("error" in body ? body.error : "AI_UNAVAILABLE");
  }
  return body;
}

const submitMessage = async () => {
  const controller = new AbortController();
  setSending(true);
  try {
    const committed = await postWorkspaceChatMessage({
      endpoint: messagesEndpoint,
      message: draft,
      selectedDocumentId,
      signal: controller.signal,
    });
    setThread(committed.thread);
    setMessages((current) => [
      ...current.filter(({ id }) => !id.startsWith("optimistic:")),
      committed.userMessage,
      committed.assistantMessage,
    ]);
    setDraft("");
  } catch (error) {
    setMessages((current) => current.filter(({ id }) => !id.startsWith("optimistic:")));
    setError(error instanceof Error ? error.message : "AI_UNAVAILABLE");
  } finally {
    setSending(false);
  }
};
```

Do not create an optimistic assistant row; if the existing UI keeps an optimistic user row for responsiveness, it is removed on every error and replaced only by the committed server DTO.

- [ ] **Step 4: Render a fixed tombstone**

Add `workspaceAi.historyRedacted` in English/Korean catalogs and render redacted DTOs in `components/workspace-chatbot.tsx` with:

```tsx
if (message.redacted) {
  return (
    <div className="rounded border border-border bg-surface-muted px-3 py-2 text-sm text-ink-muted">
      {t("workspaceAi.historyRedacted")}
    </div>
  );
}
```

Do not render citations, a source count, document title, or navigation link for a tombstone.

- [ ] **Step 5: Run route/UI tests to verify green**

Run: `pnpm exec vitest run tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx tests/i18n/messages.test.ts --reporter=dot`

Expected: PASS; the response remains unsettled until finalization, errors are stable JSON, and no partial assistant content ever enters browser state.

- [ ] **Step 6: Commit the tombstone contract**

```bash
git add app/api/workspaces/\[workspaceSlug\]/assistant/thread/route.ts app/api/workspaces/\[workspaceSlug\]/assistant/messages/route.ts app/api/workspaces/\[workspaceSlug\]/assistant/error-response.ts components/workspace-chatbot.tsx lib/i18n/messages.ts tests/rag/workspace-chat-route.test.ts tests/components/workspace-chatbot.test.tsx tests/i18n/messages.test.ts wiki/RAG\ Process\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: expose AI history redaction tombstones"
```

Expected: commit succeeds after route/UI tests pass.

### Task 8: Candidate-Scoped AI Lineage Purge Readiness Leaf

**Files:**
- Create: `lib/rag/lineage-purge-readiness.ts`
- Create: `tests/rag/lineage-purge-readiness.test.ts`

**Interfaces:**
- Consumes: type-only `PurgeLeafReadiness`, `PurgeBatchCandidate`, and `PurgeEvaluationState` from Issue 5, Task 1 lineage tables, and Issue 2 `appendSecurityJournalEvent()`.
- Produces: `assertAiLineagePurgeCandidate(tx, candidate, state): Promise<void>` and `aiLineagePurgeReadiness: PurgeLeafReadiness`. It does not import Issue 11 or Issue 14, read caller environment/deployment identity, parse restore evidence, wire production purge, or alter Issue 5's fail-closed default.

- [ ] **Step 1: Write candidate/readiness and legacy-hidden tests**

Create `tests/rag/lineage-purge-readiness.test.ts`:

```ts
const syntheticPurgeEvaluationState = {
  environment: "production",
  deploymentDigest: `sha256:${"a".repeat(64)}`,
  securityFloorSha256: "b".repeat(64),
  deploymentEvidenceSha256: "c".repeat(64),
  restoreEvidenceSha256: "d".repeat(64),
  journalCheckpoint: { sequence: "10", hash: "e".repeat(64) },
  journalHighWater: { sequence: "12", hash: "f".repeat(64) },
  evaluationEpoch: "00000000-0000-4000-8000-000000000004",
  leafEvidence: [
    { name: "ai-lineage", issue: 9, evidenceSha256: "1".repeat(64) },
    { name: "attachments", issue: 11, evidenceSha256: "2".repeat(64) },
  ],
  databaseNow: "2026-07-11T00:00:00.000Z",
} as const;

async function seedLineageReadinessFixture() {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.OWNER);
  const makeDocument = (suffix: string) => prisma.document.create({
    data: {
      workspaceId: fixture.workspace.id,
      title: `Readiness ${suffix}`,
      slug: `readiness-${suffix}`,
      path: `/readiness-${suffix}`,
      status: "ARCHIVED",
      archivedAt: new Date("2026-07-01T00:00:00.000Z"),
      createdById: fixture.user.id,
      updatedById: fixture.user.id,
      versions: { create: {
        versionNumber: 1,
        title: `Readiness ${suffix}`,
        contentMarkdown: "synthetic",
        createdById: fixture.user.id,
      } },
    },
    include: { versions: true },
  });
  const candidate = await makeDocument("candidate");
  const unrelated = await makeDocument("unrelated");
  const candidateThread = await prisma.aiChatThread.create({
    data: {
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      status: "ACTIVE",
      lineageState: "PROVEN",
      memorySummary: "synthetic memory",
      memoryRevision: 1,
      memoryVisibility: "VISIBLE",
      turns: { create: {
        visibility: "VISIBLE",
        lineageBasis: "SOURCE_BACKED",
        sources: { create: {
          workspaceId: fixture.workspace.id,
          documentId: candidate.id,
          documentVersionId: candidate.versions[0].id,
          sourceUpdatedAt: candidate.updatedAt,
          sourceKey: `${fixture.workspace.id}:${candidate.id}:${candidate.versions[0].id}:`,
        } },
      } },
      memorySources: { create: {
        memoryRevision: 1,
        workspaceId: fixture.workspace.id,
        documentId: candidate.id,
        documentVersionId: candidate.versions[0].id,
        sourceUpdatedAt: candidate.updatedAt,
      } },
    },
    include: { turns: true },
  });
  const unrelatedThread = await prisma.aiChatThread.create({
    data: {
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      status: "ARCHIVED",
      lineageState: "PROVEN",
      turns: { create: {
        visibility: "VISIBLE",
        lineageBasis: "SOURCE_BACKED",
        sources: { create: {
          workspaceId: fixture.workspace.id,
          documentId: unrelated.id,
          documentVersionId: unrelated.versions[0].id,
          sourceUpdatedAt: unrelated.updatedAt,
          sourceKey: `${fixture.workspace.id}:${unrelated.id}:${unrelated.versions[0].id}:`,
        } },
      } },
    },
    include: { turns: true },
  });
  const legacy = await prisma.aiChatThread.create({
    data: {
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      status: "ARCHIVED",
      lineageState: "LEGACY_HIDDEN",
      memorySummary: "irreversibly hidden",
      memoryVisibility: "LEGACY_HIDDEN",
    },
  });
  return {
    workspaceId: fixture.workspace.id,
    candidateDocumentId: candidate.id,
    candidateTurnId: candidateThread.turns[0].id,
    unrelatedTurnId: unrelatedThread.turns[0].id,
    legacyHiddenThreadId: legacy.id,
  };
}

it("redacts only candidate-derived visible state in the caller transaction", async () => {
  const fixture = await seedLineageReadinessFixture();
  await prisma.$transaction(async (tx) => {
    await assertAiLineagePurgeCandidate(tx, {
      rootOperationId: "00000000-0000-4000-8000-000000000003",
      workspaceId: fixture.workspaceId,
      documentIds: [fixture.candidateDocumentId],
    }, syntheticPurgeEvaluationState);
  });
  await expect(prisma.aiChatTurn.findUniqueOrThrow({ where: { id: fixture.candidateTurnId } }))
    .resolves.toMatchObject({ visibility: "SOURCE_REDACTED" });
  await expect(prisma.aiChatTurn.findUniqueOrThrow({ where: { id: fixture.unrelatedTurnId } }))
    .resolves.toMatchObject({ visibility: "VISIBLE" });
  await expect(prisma.aiChatThread.findUniqueOrThrow({ where: { id: fixture.legacyHiddenThreadId } }))
    .resolves.toMatchObject({ lineageState: "LEGACY_HIDDEN", memoryVisibility: "LEGACY_HIDDEN" });
});

it("rolls candidate redaction back when a later leaf fails", async () => {
  const fixture = await seedLineageReadinessFixture();
  await expect(prisma.$transaction(async (tx) => {
    await aiLineagePurgeReadiness.assertCandidate(tx, {
      rootOperationId: "00000000-0000-4000-8000-000000000003",
      workspaceId: fixture.workspaceId,
      documentIds: [fixture.candidateDocumentId],
    }, syntheticPurgeEvaluationState);
    throw new Error("ATTACHMENT_PURGE_NOT_READY");
  })).rejects.toThrow("ATTACHMENT_PURGE_NOT_READY");
  await expect(prisma.aiChatTurn.findUniqueOrThrow({ where: { id: fixture.candidateTurnId } }))
    .resolves.toMatchObject({ visibility: "VISIBLE" });
});
```

- [ ] **Step 2: Run readiness tests to verify red**

Run: `pnpm exec vitest run tests/rag/lineage-purge-readiness.test.ts --reporter=dot`

Expected: FAIL because the Issue 9 leaf adapter is absent.

- [ ] **Step 3: Implement the type-only candidate leaf**

Create `lib/rag/lineage-purge-readiness.ts`:

```ts
import { Prisma } from "@prisma/client";
import { appendSecurityJournalEvent, deriveSecurityJournalOperationId } from "@/lib/security/journal";
import type {
  PurgeBatchCandidate,
  PurgeEvaluationState,
  PurgeLeafReadiness,
} from "@/lib/retention/purge-readiness";

export async function assertAiLineagePurgeCandidate(
  tx: Prisma.TransactionClient,
  candidate: PurgeBatchCandidate,
  _state: PurgeEvaluationState,
) {
  const documentIds = [...new Set(candidate.documentIds)];
  if (documentIds.length === 0 || documentIds.length > 100) {
    throw new Error("AI_LINEAGE_PURGE_NOT_READY");
  }
  const turns = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT DISTINCT turn."id"
    FROM "AiChatTurn" turn
    JOIN "AiChatTurnSource" source ON source."turnId" = turn."id"
    WHERE source."workspaceId" = ${candidate.workspaceId}
      AND source."documentId" IN (${Prisma.join(documentIds)})
      AND turn."visibility" = 'VISIBLE'
      AND turn."lineageBasis" = 'SOURCE_BACKED'
    ORDER BY turn."id" ASC
    FOR UPDATE OF turn
  `);
  const memories = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT DISTINCT thread."id"
    FROM "AiChatThread" thread
    JOIN "AiChatMemorySource" source ON source."threadId" = thread."id"
      AND source."memoryRevision" = thread."memoryRevision"
    WHERE source."workspaceId" = ${candidate.workspaceId}
      AND source."documentId" IN (${Prisma.join(documentIds)})
      AND thread."memoryVisibility" = 'VISIBLE'
      AND thread."lineageState" = 'PROVEN'
    ORDER BY thread."id" ASC
    FOR UPDATE OF thread
  `);
  for (const turn of turns) {
    await tx.aiChatTurn.update({ where: { id: turn.id }, data: { visibility: "SOURCE_REDACTED" } });
    await appendSecurityJournalEvent(tx, {
      kind: "AI_HISTORY_REDACTED",
      subjectType: "AI_CHAT_TURN",
      subjectId: turn.id,
      operationId: deriveSecurityJournalOperationId({
        rootOperationId: candidate.rootOperationId,
        kind: "AI_HISTORY_REDACTED",
        subjectType: "AI_CHAT_TURN",
        subjectId: turn.id,
      }),
      payload: { stateCode: "AI_HISTORY_REDACTED", stateVersion: 1 },
    });
  }
  for (const thread of memories) {
    await tx.aiChatThread.update({
      where: { id: thread.id }, data: { memoryVisibility: "SOURCE_REDACTED" },
    });
    await appendSecurityJournalEvent(tx, {
      kind: "AI_HISTORY_REDACTED",
      subjectType: "AI_CHAT_MEMORY",
      subjectId: thread.id,
      operationId: deriveSecurityJournalOperationId({
        rootOperationId: candidate.rootOperationId,
        kind: "AI_HISTORY_REDACTED",
        subjectType: "AI_CHAT_MEMORY",
        subjectId: thread.id,
      }),
      payload: { stateCode: "AI_HISTORY_REDACTED", stateVersion: 1 },
    });
  }
}

export const aiLineagePurgeReadiness: PurgeLeafReadiness = {
  name: "ai-lineage",
  assertCandidate: assertAiLineagePurgeCandidate,
};
```

The queries intentionally exclude `LEGACY_HIDDEN` and unrelated rows. There is no readiness environment variable.

- [ ] **Step 4: Run readiness tests to verify green**

Run: `pnpm exec vitest run tests/rag/lineage-purge-readiness.test.ts tests/rag/source-authorization.test.ts --reporter=dot`

Expected: PASS; candidate redactions and journal events share the caller transaction and legacy hidden rows do not block.

- [ ] **Step 5: Record the leaf contract, run all wiki gates, and commit**

Update `wiki/RAG Process Workflow.md` plus `wiki/log.md`, then run the complete wiki install/sync-plan/manifest/lint/sync-check sequence and commit source, tests, and the real wiki delta with `security: add AI lineage purge readiness`.

```bash
pnpm wiki:install-hooks
git add lib/rag/lineage-purge-readiness.ts tests/rag/lineage-purge-readiness.test.ts wiki/RAG\ Process\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: add AI lineage purge readiness"
```

### Task 9: Full Lineage Verification and Destructive-Readiness Handoff

**Files:**
- Create: `deploy/security/capabilities/ai-history-reauthorization.json`
- Create: `tests/security/ai-history-capability.test.ts`
- Modify: `deploy/security/protected-artifact-owners.json`
- Modify after disclosure review: `wiki/RAG Process Workflow.md`
- Modify after disclosure review: `wiki/Auth And Permissions Workflow.md`
- Modify after disclosure review: `wiki/index.md`
- Modify after disclosure review: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: Tasks 1–8, the direct Leaf 4 prompt-authority capability, and Issue 6 ACL base.
- Produces: verified lineage behavior, exact `leaf9JournalReplayReducers`, plus `aiLineagePurgeReadiness`; Issue 14 later imports both into final replay/readiness composition. No environment Boolean activates it.

- [ ] **Step 1: Write and run the failing exact reducer-map contract**

Create tests requiring exactly `AI_SOURCE_ACCESS_REVOKED` and
`AI_HISTORY_REDACTED`, both turn/memory subject variants, immutable source-row/derived-
row targets, branded context, idempotence, no grant/visibility restoration, and source
contracts forbidding append/checkpoint imports. Assert `AI_DERIVED_DATA_PURGED` is
absent and owned by Leaf 5.

Run: `pnpm exec vitest run tests/rag/journal-replay.test.ts --reporter=dot`

Expected: RED because the exact Leaf 9 reducer map does not exist.

- [ ] **Step 2: Implement the exact deny-only reducer map**

Under the verified restore context, source-access revoke parses the canonical typed
subject, locks exactly that turn-source or memory-source row, and idempotently sets
`accessRevokedAt` when present; history redaction locks the immutable turn
or memory and preserves/sets `SOURCE_REDACTED`. Missing targets remain denied and do
not get recreated. Both reducers exact-validate payload/subject and cannot append or
change production journal/checkpoint state.

- [ ] **Step 3: Create and verify the canonical Leaf 9 capability**

Write `tests/security/ai-history-capability.test.ts` RED first. It requires an exact
canonical six-key fragment, direct dependency closure on Leaves 2, 4, 6, and 13B, the exact
evidence list, and one ACTIVE owner-map entry for every Leaf 9-only core artifact.
Shared schema, route, and workspace-chat aggregate files remain candidate-tested but
are not claimed as whole-file Leaf 9 artifacts.

Run:

```bash
pnpm exec vitest run tests/security/ai-history-capability.test.ts --reporter=dot
```

Expected: RED because the capability fragment and owner-map evidence do not exist.

Create `deploy/security/capabilities/ai-history-reauthorization.json`:

```json
{"format":"munjib-security-capability-v1","id":"ai-history-reauthorization","version":1,"leaf":9,"requires":["security-journal-auth-tombstones@1","zero-ambient-media-egress@1","document-acl-closure@1","immutable-private-runtime@1"],"evidenceTests":["tests/prisma/ai-source-lineage-migration.test.ts","tests/rag/index-document.test.ts","tests/rag/vector-store.test.ts","tests/rag/source-authorization.test.ts","tests/rag/authorized-provider-material.test.ts","tests/rag/authorized-ai-finalization.test.ts","tests/rag/source-access-revocation.test.ts","tests/rag/journal-replay.test.ts","tests/rag/workspace-chat.test.ts","tests/rag/workspace-chat-memory-authorization.test.ts","tests/rag/ask.test.ts","tests/rag/workspace-chat-route.test.ts","tests/rag/langfuse.test.ts","tests/rag/langfuse-otel.test.ts","tests/rag/lineage-purge-readiness.test.ts","tests/security/ai-history-capability.test.ts"]}
```

Activate exact owner-map entries for the migration,
`lib/rag/source-authorization.ts`, `lib/rag/authorized-provider-material.ts`,
`lib/rag/authorized-ai-finalization.ts`, `lib/rag/source-access-revocation.ts`,
`lib/rag/journal-replay.ts`, and `lib/rag/lineage-purge-readiness.ts`. `prisma/schema.prisma`,
index/vector sources, `workspace-chat.ts`, `ask.ts`, Langfuse/instrumentation, routes,
and UI are exact candidate-tested evidence with no Leaf 9 ACTIVE owner entry. The test rejects
unknown legacy fragment keys, reordered/missing dependencies or evidence, a shared
aggregate claimed as Leaf 9-only, missing/multiply-owned paths, stale hashes/versions,
or an artifact absent from the exact candidate rootfs. Leaf 13B hashes the candidate
files and binds this fragment and owner map to the exact release; Leaf 14 consumes but
never republishes it.

Run the RED command again and require GREEN.

- [ ] **Step 4: Record minimal durable behavior**

Use this exact disclosure-safe paragraph:

```markdown
Workspace AI persists a bounded union of direct, retrieval, included-turn, and authorized-memory source lineage, with an explicit SOURCE_FREE basis only when that union is empty. Leaf 9 issues the authorized provider material and accepts only one complete bounded server-side result with no partial-byte surface; its finalizer rechecks current role and every source under shared locks before committing a turn. Before provider policy lands, production full content capture and tenant/source telemetry remain disabled. Revoked or legacy-unproven history is retained only as an irreversible tombstone, and candidate purge readiness redacts matching visible derivations in the caller transaction without blocking on unrelated legacy-hidden rows.
```

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
pnpm exec vitest run tests/prisma/ai-source-lineage-migration.test.ts tests/security/ai-history-capability.test.ts tests/rag/index-document.test.ts tests/rag/vector-store.test.ts tests/rag/source-authorization.test.ts tests/rag/authorized-provider-material.test.ts tests/rag/authorized-ai-finalization.test.ts tests/rag/source-access-revocation.test.ts tests/rag/journal-replay.test.ts tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-memory-authorization.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat-route.test.ts tests/rag/langfuse.test.ts tests/rag/langfuse-otel.test.ts tests/rag/lineage-purge-readiness.test.ts tests/components/workspace-chatbot.test.tsx --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm test
pnpm run build
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: all commands exit 0; revoke/downgrade/archive/purge races emit no browser partial content and persist zero final rows, source-union laundering tests pass, the legacy migration is non-destructive, and candidate readiness ignores irreversible legacy-hidden state.

- [ ] **Step 6: Stage, sync-check, and inspect disclosure**

```bash
git add prisma/schema.prisma prisma/migrations/20260712040000_ai_history_reauthorization/migration.sql deploy/security/capabilities/ai-history-reauthorization.json deploy/security/protected-artifact-owners.json lib/rag/index-document.ts lib/rag/vector-store.ts lib/rag/source-authorization.ts lib/rag/authorized-provider-material.ts lib/rag/authorized-ai-finalization.ts lib/rag/source-access-revocation.ts lib/rag/journal-replay.ts lib/rag/lineage-purge-readiness.ts lib/rag/workspace-chat.ts lib/rag/ask.ts lib/rag/langfuse.ts lib/rag/langfuse-otel.ts instrumentation.ts app/api/workspaces/\[workspaceSlug\]/assistant/thread/route.ts app/api/workspaces/\[workspaceSlug\]/assistant/messages/route.ts app/api/workspaces/\[workspaceSlug\]/assistant/error-response.ts components/workspace-chatbot.tsx lib/i18n/messages.ts tests/prisma/ai-source-lineage-migration.test.ts tests/security/ai-history-capability.test.ts tests/rag/index-document.test.ts tests/rag/vector-store.test.ts tests/rag/source-authorization.test.ts tests/rag/authorized-provider-material.test.ts tests/rag/authorized-ai-finalization.test.ts tests/rag/source-access-revocation.test.ts tests/rag/journal-replay.test.ts tests/rag/lineage-purge-readiness.test.ts tests/rag/workspace-chat.test.ts tests/rag/workspace-chat-memory-authorization.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat-route.test.ts tests/rag/langfuse.test.ts tests/rag/langfuse-otel.test.ts tests/components/workspace-chatbot.test.tsx tests/i18n/messages.test.ts wiki/RAG\ Process\ Workflow.md wiki/Auth\ And\ Permissions\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
pnpm wiki:sync-plan --staged
pnpm wiki:sync-check --staged
git diff --cached --check
git diff --cached --name-only
if git diff --cached | rg -q 'NEXTAUTH_SECRET|API_KEY|password|secret source body|process\.env.*PURGE|docs/superpowers/(plans|specs)/2026-07-11-security'; then echo "restricted staged content detected" >&2; exit 1; fi
```

Expected: checks pass; the non-printing scan exposes no matching line; no plan/spec/private fixture or Boolean purge activation is staged.

- [ ] **Step 7: Commit the final reducer and documentation delta**

```bash
git commit -m "docs: record AI lineage authorization contract"
```

Expected: the required real wiki/log delta commits. Do not push before explicit disclosure approval; production composition remains Issue 14-owned.

- [ ] **Step 8: Poll ready-PR checks/reviews at 60-second intervals**

After disclosure approval, ready the PR, poll for at least five minutes, and query GraphQL `reviewThreads(first: 100) { nodes { isResolved } }` on each pass. Final checks must pass and unresolved count must be zero; otherwise fix, rerun focused/full tests and all wiki gates, commit, push, and repeat.
