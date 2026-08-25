# Security AI Provider Policy Implementation Plan

**Tracking:** Issue #164 · remote branch `issue-164-security-ai-provider-policy`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI provider/model choice server-owned and workspace-scoped, enforce transactional request/token/concurrency/cost budgets, and emit only privacy-safe AI telemetry.

**Architecture:** Store a workspace AI policy and allowlisted chat-model rows; clients send an opaque chat-policy id, never a provider/model id. Resolve credentials and effective provider/model on the server after active workspace and role authorization, while embeddings remain bound to `CURRENT_EMBEDDING_INDEX`. Consume Leaf 9's runtime-issued `AuthorizedProviderMaterial`, encode and hash one exact canonical provider request, reserve its conservative complete-payload upper bound in a UTC daily bucket under a PostgreSQL advisory lock, create a short-lived concurrency lease, and send those exact bytes through a single-attempt transport. The only legal order is reserve full conservative budget -> begin/revalidate -> one wire attempt -> complete bounded result -> Leaf 9 final authorization/persistence -> construct response -> settlement. Replace permissive telemetry metadata with an allowlist that has no tenant/user/source identifiers or content.

**Tech Stack:** Prisma/PostgreSQL, Next.js App Router, LangChain, AbortSignal timeouts, Sentry, Langfuse, Vitest, Testing Library.

## Global Constraints

- Dependency order is exact: Issue 10 rebases on merged Issues 2, 4, 5, 6, and 9 plus
  deployed Leaf 13B. Production release additionally waits for deployed Leaf 11 v1
  migration `20260712050000_attachment_lifecycle_transition` and its signed convergence
  evidence; this release-order gate is not a direct capability dependency. Its direct
  capability requirements remain exactly `security-journal-auth-tombstones@1`,
  `zero-ambient-media-egress@1`, `active-resource-boundaries@1`,
  `document-acl-closure@1`, `ai-history-reauthorization@1`, and
  `immutable-private-runtime@1`. It consumes Leaf 9 `AuthorizedProviderMaterial` and
  finalizer contracts and has no Leaf 11 capability dependency.
- Issue 10 coordinates with existing Issue #139 but does not change `CURRENT_EMBEDDING_INDEX`, embedding provider/model/dimensions, vector schema dimension, or trigger a reindex.
- Leaf 13B immutable delivery is required before this schema-changing P1 branch deploys.
- Production provider credentials use strict file variables only: `MUNJIB_OPENAI_API_KEY_FILE`, `MUNJIB_OPENROUTER_API_KEY_FILE`, and `MUNJIB_LANGFUSE_SECRET_KEY_FILE`/`MUNJIB_LANGFUSE_PUBLIC_KEY_FILE`. Direct key variables and arbitrary base URLs are development/test-only and make production preflight fail.
- Provider runtime comes from a root-installed, separately attested, exact-id overlay descriptor. Allowed ids are `ollama-internal-v1`, `openai-official-v1`, `openrouter-official-v1`, and `langfuse-official-v1`. The deploy API accepts no arbitrary `-f`, URL, secret slot, environment, image, or Compose argument.
- The endpoint catalog is source-controlled and exact: origin, default port, and base path are fixed; HTTPS is required externally; userinfo, query, fragment, redirect, alternate port, literal/private/metadata address, proxy, custom CA, and TLS-disable override are rejected. Every connect re-resolves and validates all A/AAAA answers before using a pinned public address.
- Ollama is exactly `http://ollama:11434` inside its fixed overlay, with no host port, host-gateway, automatic model pull, or mutable image/model tag. Image and model are pinned by digest. If the overlay/model is absent, return `AI_UNAVAILABLE`; never fall through to an external provider.
- A new OpenAI-compatible endpoint requires a reviewed source catalog row, fixed overlay, credential-file slot, exact origin/path policy, security review, and a higher `issue-10-ai-provider-policy` capability version.
- This leaf owns canonical capability `issue-10-ai-provider-policy@1` with `leaf: 10` and the exact six direct dependencies above. Its committed fragment contains only the canonical six keys (`format`, `id`, `version`, `leaf`, `requires`, `evidenceTests`) and is authored, tested, owner-mapped, and staged only in Task 5 after Tasks 1–4 and their evidence exist. Leaf 10 advances owner-map entries only for Leaf 10-exclusive core/descriptor/bundle paths; shared aggregate files remain candidate-tested evidence, not whole-file Leaf 10 ownership. Leaf 13B verifies those entries and binds the fragment to the exact candidate, but no runtime host, earlier task, later leaf, or deploy script may synthesize or republish it.
- Clear/reject `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` and lowercase forms, `NODE_USE_ENV_PROXY`, `GLOBAL_AGENT*`, `UNDICI_PROXY`, `NODE_OPTIONS`, and TLS override variables before provider startup.
- Clients cannot choose arbitrary provider or model ids. Effective selection comes from an enabled workspace model-policy row, actor role policy, server model catalog, and current server credentials.
- External providers require explicit workspace opt-in by a current `OWNER|ADMIN`; local Ollama remains the fail-closed default where configured.
- A normal current-manager external-provider disablement is access/egress-reducing and appends Issue 2 `AI_EXTERNAL_PROVIDER_DISABLED` in the same SERIALIZABLE transaction. Enabling is access-increasing and never enters the deny-only journal. Restore uses a separate branded restore-only scrub that forces opt-in false without actor permission, journal append, checkpoint mutation, or any other journal-state write. The manager and restore entrypoints never call each other.
- Opt-in/out authority is linearized with active workspace membership and role. The same SERIALIZABLE transaction locks and re-resolves the current membership/role plus policy row using DB time. Each external lease binds `policyVersion`; immediately before network connect a second locked transition verifies current membership, opt-in, policy version, catalog, and lease, then changes `RESERVED` to `CALLING`. Opt-out increments the version and cancels every still-RESERVED external lease before its deny journal append. The call/connect transition and opt-out therefore have one serial order.
- Every write to provider enablement, quota/timeout/body limits, or a workspace model-policy row goes through one locked server mutation seam that increments `WorkspaceAiPolicy.policyVersion` in the same transaction. Direct model-row writes outside migrations/tests are forbidden and source-scanned, so a reserved lease can never survive a policy change merely because one field owner forgot the version bump.
- Leaf 10 owns `document-indexer-authority.ts`, its branded `VerifiedDocumentIndexerCapability`, the document-indexer descriptor policy, and the `ai-provider-generation` publisher/install path for the separately attested `ai-provider-v1` root bundle. A document-indexer lease stores the verified descriptor generation and SHA-256; user leases store both as null. Reserve verifies and binds the current root-installed descriptor, and begin re-verifies the current generation/SHA before `CALLING`, so a rotated or revoked worker cannot use a stale lease. Only Leaf 13B's fixed forced dispatcher operation installs or rolls back descriptor generations. The principal remains exactly `system:document-indexer-v1`.
- Reservation callers supply only the operation's raw user input plus immutable source identifiers; they never supply token/cost estimates, assembled prompts, chunks, history, policy versions, quota limits, concurrency, timeout, or external-provider flags. Under the workspace lock, Leaf 9 issues the exact `AuthorizedProviderMaterial` from current document/conversation revisions; `canonical-provider-payload.ts` alone encodes the byte-for-byte provider request body and reserves its complete input plus the exact output allowance. It cannot rebuild prompt authority, history, retrieval, or lineage. The lease binds that payload SHA-256 and the single-attempt adapter sends those same bytes unchanged. A one-character question with large authorized context must therefore reserve the large context, not one character. Chat generation always requests exactly the current policy `maxOutputTokens`, which must not exceed the chat catalog/provider maximum.
- Export `leaf10JournalReplayReducers` with exactly `AI_EXTERNAL_PROVIDER_DISABLED`; it is branded-restore-only, exact workspace-target validating, idempotent, deny-only, and unable to append or mutate journal/checkpoint state.
- Request body bytes, message characters, estimated input/output tokens, concurrency, total timeout, daily request count, daily tokens, and daily cost are bounded server-side.
- Quota reservation occurs before any provider call; reconciliation charges actual usage when present and the conservative reservation when usage is missing, aborted, or timed out.
- A provider attempt that completes but then fails Leaf 9 final authorization is still settled and charged from valid bounded usage or the conservative reservation. It persists no AI turn/message/source row, maps to private/no-store `SOURCE_ACCESS_CHANGED` HTTP 409, and emits no partial answer byte.
- Quota counters use internal transactional identifiers, reset at `00:00:00 UTC`, and return stable `403`/`429` codes. `429` includes `Retry-After` and a non-sensitive scope (`request`, `concurrency`, `daily_tokens`, or `daily_cost`).
- Every lease state or accounting decision uses a fresh database clock read only after the target `AiUsageBucket` and `AiRequestLease` rows are locked. A timestamp sampled before a row-lock wait is never used for expiry, cancellation, begin, settlement, or reconciliation. Reservation locks/authorizes policy and sources, locks the authoritative UTC bucket, then samples DB time and binds that same post-lock time to the day, `createdAt`, expiry, and `Retry-After`; a midnight rollover is re-resolved under deterministic bucket lock order.
- Every provider/SDK/HTTP/stream transport has automatic retry, redirect, reconnect, resume, and replay disabled. A reserved payload produces at most one wire attempt under `429`, connection reset, timeout, truncated stream, or redirect. Any retry requires a new reservation, lease, payload object, payload hash, and quota charge; no adapter may reuse a `CALLING` lease or consumed payload.
- The Leaf 10 provider transport is AI-provider-only. It cannot import, call, or share Issue 11 attachment fetch, redirect, DNS, decode, canonicalization, or storage helpers.
- Provider keys, prompts, document bodies, raw provider errors, email, workspace slug/id, direct user id, source ids, URL path/query, and request headers never reach clients, logs, Sentry, or Langfuse.
- Production full prompt/response capture is invalid configuration and fails startup/preflight. Metadata capture includes only operation, provider/model, policy version, outcome, latency, and bounded usage.
- Provider time metadata must be finite, non-negative, and no later than the request settlement time; token usage must be safe integers within the reserved/catalog maximum. Invalid time, negative/non-finite values, or over-maximum usage discard provider metadata and conservatively charge the reservation.
- Provider response collection is an internal implementation detail of the single-attempt transport. It returns one Leaf 9 `CompleteBoundedAiResult` and exposes no callback, `ReadableStream`, `AsyncIterable`, token event, reconnect, resume, or partial byte. It has no attachment imports and creates no Issue 11 dependency.
- Chat selection and embedding/index identity are separate catalog purposes. Workspace model-policy rows may reference only `CHAT` entries. Query embeddings and document indexing always bind an `EMBEDDING` entry constructed from the unchanged `CURRENT_EMBEDDING_INDEX` provider, model, dimensions, and index id; a chat id is invalid for embedding and an embedding id is invalid for chat. The same runtime/workspace opt-in/quota/lease/restore-opt-out contract applies to both purposes. Missing runtime leaves existing chunks unchanged and returns `AI_UNAVAILABLE`; it never falls back, changes `CURRENT_EMBEDDING_INDEX`, alters dimensions, or triggers reindex.
- The canonical builder enforces the locked `WorkspaceAiPolicy.maxMessageChars` against Unicode scalar count for Ask questions, Workspace AI messages, and query-embedding text before retrieval or encoding. Reservation and begin both return their locked/revalidated `requestTimeoutMs`, but only begin's post-revalidation value may construct `AbortSignal.timeout()` for provider I/O; no service uses a stale pre-resolve or reservation-time policy object for the network timeout.
- Public reservation, begin, cancel, reconciliation, indexing, and settlement inputs contain no clock. Production always uses PostgreSQL `clock_timestamp()` after the authorizing bucket/lease/source rows are locked. One source-scanned Vitest-only dependency harness injects a fake `AiQuotaClock` consistently across every transition; it is unavailable to production callsites.
- Sentry and Langfuse origins are exact protected endpoint-catalog entries. No arbitrary build-time DSN/telemetry URL is emitted into the client or CSP. Langfuse receives file-backed credentials and metadata only, never prompt or response content.
- Every policy mutation context and every canonical provider payload is runtime-issued and one-shot, not merely structurally branded in TypeScript. Module-private `WeakSet` registries reject forged, cross-workspace, mutated, or reused objects before any Prisma write or provider transition.
- Every task follows RED -> GREEN -> an actual durable update to its named wiki page plus `wiki/log.md` -> all wiki install/sync/manifest/lint/sync-check gates -> commit. Secret scans are non-printing `rg -q`; ready PR checks/reviews are polled at no more than 60-second intervals with GraphQL unresolved threads blocking completion. This branch produces one PR and exactly one Leaf 13B production deploy unit; migration, descriptor/bundle activation, candidate promotion, smoke, and rollback evidence belong to that single deploy.
- This plan and detailed design remain local-only; omit them and all restricted values/evidence from remote commits.

---

## File Structure

- Modify: `prisma/schema.prisma` — workspace AI policy/model allowlist, UTC quota buckets, and request leases.
- Create: `prisma/migrations/20260712060000_ai_provider_policy/migration.sql`.
- Create: `tests/prisma/workspace-ai-policy-migration.test.ts`.
- Create: `lib/rag/provider-catalog.ts` — immutable catalog entries, exact row validation, role comparison, and catalog cost calculation.
- Create: `lib/rag/canonical-provider-payload.ts` — runtime-issued exact provider bytes from Leaf 9 `AuthorizedProviderMaterial`, payload hash binding, and conservative token accounting.
- Create: `lib/rag/provider-policy.ts` — opaque selection resolver and manager opt-in update.
- Create: `lib/rag/lease-control.ts` — database clock, workspace AI lock, lease expiry/cancellation, and call-boundary authorization.
- Create: `lib/rag/document-indexer-authority.ts` — Leaf 10-owned branded capability verification, generation/SHA binding, and rotation-safe revalidation.
- Create: `lib/rag/policy-provisioning.ts` — workspace-creation defaults and guarded policy/model/quota mutation API.
- Modify: `lib/workspaces/management-service.ts`, `lib/auth/provisioning.ts`, `prisma/seed.ts`, `tests/workspaces/management-service.test.ts`, `tests/auth/provisioning.test.ts`, `tests/auth/provisioning-current-user.test.ts` — atomic provisioning on every create/upsert path.
- Create: `tests/prisma/seed-ai-policy.test.ts` — seeded/upserted workspaces receive the fail-closed policy and exact local model.
- Create: `lib/rag/provider-runtime.ts`, `lib/rag/provider-endpoints.ts`, `lib/rag/secret-file.ts` — fixed overlay descriptor, exact endpoint catalog, per-connect address validation, proxy/TLS override rejection, and strict file-secret reader.
- Create: `deploy/ai/provider-runtime-v1.json`, `deploy/ai/provider-endpoints-v1.json`, `docker-compose.ai-ollama.yml`, `docker-compose.ai-openai.yml`, `docker-compose.ai-openrouter.yml`, `docker-compose.ai-langfuse.yml` — root-selected attested runtime descriptors/overlays.
- Create: `deploy/ai/provider-generation-policy-v1.json`, `deploy/ai/document-indexer/descriptor.v1.json`, `deploy/ai/attested-root-bundle/manifest.json`, `deploy/ai/attested-root-bundle/dispatcher-operation.json`, `deploy/ai/attested-root-bundle/munjib-ai-provider-install`, `deploy/ai/attested-root-bundle/munjib-document-indexer-install`, and `scripts/security/publish-ai-provider-generation.ts` — one exact four-member composite generation policy, separately attested `ai-provider-v1` host bundle, provider runtime/endpoint installer, document-indexer installer, and exact signed-generation publisher.
- Create: `scripts/deploy/preflight-ai-provider.ts` — no-network production startup/deploy preflight for capture, exact runtime/endpoint ids, file-secret slots, proxy/TLS overrides, embedding identity, and installed descriptor shape.
- Create: `lib/rag/provider-transport.ts` and `tests/rag/provider-single-attempt.test.ts` — AI-provider-only exact-byte transport with retry/redirect/reconnect/resume/replay disabled and one complete bounded result.
- Create: `tests/setup/provider-runtime.ts`, `tests/setup/ai-quota-dependencies.ts`, `tests/rag/provider-catalog.test.ts`, `tests/rag/canonical-provider-payload.test.ts`, `tests/rag/provider-runtime.test.ts`, `tests/rag/provider-endpoints.test.ts`, `tests/rag/provider-egress.test.ts`, `tests/rag/lease-control.test.ts`, `tests/rag/document-indexer-authority.test.ts`, `tests/security/ai-provider-generation-publisher.test.ts`, `tests/security/ai-provider-generation-install.test.ts`, `tests/rag/provider-policy-source-inventory.test.ts`, `tests/docker/ai-provider-overlays.test.ts`, `tests/deploy/ai-provider-preflight.test.ts`.
- Create: `deploy/security/capabilities/issue-10-ai-provider-policy.json`, `tests/security/ai-provider-capability.test.ts`.
- Modify: `deploy/security/protected-artifact-owners.json` — activate the exact Leaf 10 artifact set at `issue-10-ai-provider-policy@1`; the canonical fragment itself contains no non-schema artifact list.
- Create: `lib/rag/provider-journal-replay.ts` and `tests/rag/provider-journal-replay.test.ts` — exact external-provider-disable restore reducer.
- Create: `tests/rag/provider-policy.test.ts`.
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `components/workspace-settings-panel.tsx`, `components/document-editor/ai-assistant-panel.tsx`, `components/workspace-chatbot.tsx`, `lib/rag/client-model-settings.ts`, `lib/i18n/messages.ts` — authorized option DTO and opaque selection id.
- Modify: `tests/components/workspace-settings-panel.test.tsx`, `tests/components/ai-assistant-panel.test.tsx`, `tests/components/workspace-chatbot.test.tsx`, `tests/workspace-actions.test.ts`, `tests/rag/client-model-settings.test.ts`, `tests/i18n/messages.test.ts`.
- Create: `lib/http/bounded-json.ts` — request byte cap.
- Create: `lib/rag/quota.ts` — current-policy reservation, DB-time settlement, shared-lease re-exports, and UTC retry time.
- Modify: `lib/rag/answer-chain.ts` — usage-bearing invoke/stream seams.
- Modify: `lib/rag/ask.ts`, `lib/rag/workspace-chat.ts` — policy resolution, quota, timeout, and reconciliation.
- Modify: Ask/Workspace AI routes and tests — body limits and stable 403/429.
- Create: `lib/observability/ai-telemetry.ts` — fixed allowlisted event shape.
- Modify: `lib/rag/langfuse.ts`, `lib/rag/model-config.ts`, `lib/rag/answer-chain.ts`, `lib/rag/embedding-client.ts`, `lib/observability/ai-unavailable.ts`, `instrumentation.ts` — remove content/tenant identifiers and raw errors; fail closed on production full capture.
- Modify: observability/model/langfuse tests.
- Maintain after disclosure review: `wiki/RAG Process Workflow.md`, `wiki/Production Observability Workflow.md`, `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`.

### Task 1: Workspace Provider Policy and Quota Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260712060000_ai_provider_policy/migration.sql`
- Create: `tests/prisma/workspace-ai-policy-migration.test.ts`

**Interfaces:**
- Consumes: `Workspace`, `WorkspaceRole`, and current Ollama default.
- Produces: `WorkspaceAiPolicy`, `WorkspaceAiModelPolicy`, `AiUsageBucket`, `AiRequestLease`, and `AiRequestLeaseStatus`; Tasks 2–4 consume these models.

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/prisma/workspace-ai-policy-migration.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

it("adds fail-closed workspace policy and transactional quota tables", async () => {
  const [sql, schema] = await Promise.all([
    readFile(path.join(
      process.cwd(),
      "prisma/migrations/20260712060000_ai_provider_policy/migration.sql",
    ), "utf8"),
    readFile(path.join(process.cwd(), "prisma/schema.prisma"), "utf8"),
  ]);
  expect(sql).toContain('CREATE TABLE "WorkspaceAiPolicy"');
  expect(sql).toContain('CREATE TABLE "WorkspaceAiModelPolicy"');
  expect(sql).toContain('CREATE TABLE "AiUsageBucket"');
  expect(sql).toContain('CREATE TABLE "AiRequestLease"');
  expect(sql).toContain("('RESERVED', 'CALLING', 'SETTLED', 'EXPIRED', 'CANCELLED')");
  for (const column of [
    "operation", "catalogId", "externalProvider", "policyVersion",
    "documentIndexerCapabilityGeneration", "documentIndexerCapabilitySha256", "canonicalPayloadSha256",
  ]) {
    expect(sql).toContain(`"${column}"`);
  }
  expect(sql).toContain('CONSTRAINT "AiRequestLease_state_shape_check"');
  expect(sql).toContain('"reservedRequests" = 1 AND "reservedTokens" >= 1');
  expect(sql).toContain('CREATE TRIGGER "AiRequestLease_transition_guard"');
  expect(sql).toContain('SET search_path = pg_catalog');
  expect(sql).toContain("RAISE EXCEPTION 'invalid AI lease transition' USING ERRCODE = '23514'");
  expect(schema).toMatch(/enum AiRequestLeaseStatus\s*{\s*RESERVED\s+CALLING\s+SETTLED\s+EXPIRED\s+CANCELLED\s*}/);
  expect(schema).toContain('@relation(fields: [bucketId, workspaceId], references: [id, workspaceId]');
  expect(schema).toContain('@@unique([id, workspaceId])');
  expect(schema).toContain('documentIndexerCapabilityGeneration Int?');
  expect(schema).toContain('documentIndexerCapabilitySha256      String?');
  expect(schema).toContain('canonicalPayloadSha256      String');
  expect(sql).toContain('"canonicalPayloadSha256" ~ \'^[0-9a-f]{64}$\'');
  expect(sql).toContain('"externalProvidersEnabled" BOOLEAN NOT NULL DEFAULT false');
  expect(sql).toContain('CREATE UNIQUE INDEX "AiUsageBucket_workspaceId_dayStartUtc_key"');
  expect(sql).toContain('"dailyRequestLimit" INTEGER NOT NULL DEFAULT 200');
  expect(sql).toContain('"reservedRequests" INTEGER NOT NULL DEFAULT 0');
  expect(sql).toContain('"usedRequests" INTEGER NOT NULL DEFAULT 0');
  expect(sql).toContain('CONSTRAINT "AiUsageBucket_workspaceId_fkey"');
  expect(sql).toContain('CONSTRAINT "AiRequestLease_workspaceId_fkey"');
  expect(sql).toContain('CONSTRAINT "AiRequestLease_bucketId_fkey"');
  expect(sql).toMatch(/FOREIGN KEY \("bucketId", "workspaceId"\)[\s\S]*REFERENCES "AiUsageBucket"\("id", "workspaceId"\)/);
  expect(sql).toContain('CREATE UNIQUE INDEX "AiUsageBucket_id_workspaceId_key"');
  expect(sql).toMatch(/AiUsageBucket_workspaceId_fkey[\s\S]*ON DELETE CASCADE/);
  expect(sql).toMatch(/AiRequestLease_bucketId_fkey[\s\S]*ON DELETE CASCADE/);
  expect(sql).not.toContain('AiRequestLease_actorId_fkey');
  expect(sql).not.toMatch(/ALTER TABLE "DocumentChunk"/);
  expect(schema).toContain('embedding       Unsupported("vector(1024)")');
});
```

- [ ] **Step 2: Run the migration test to verify red**

Run: `pnpm exec vitest run tests/prisma/workspace-ai-policy-migration.test.ts --reporter=dot`

Expected: FAIL with `ENOENT` for the migration.

- [ ] **Step 3: Add policy/quota models**

In `prisma/schema.prisma`, add:

```prisma
enum AiRequestLeaseStatus {
  RESERVED
  CALLING
  SETTLED
  EXPIRED
  CANCELLED
}

model WorkspaceAiPolicy {
  workspaceId               String   @id
  policyVersion             Int      @default(1)
  externalProvidersEnabled  Boolean  @default(false)
  maxRequestBodyBytes       Int      @default(32768)
  maxMessageChars           Int      @default(12000)
  maxOutputTokens           Int      @default(2048)
  maxConcurrentRequests     Int      @default(2)
  requestTimeoutMs          Int      @default(30000)
  dailyRequestLimit         Int      @default(200)
  dailyTokenLimit           BigInt   @default(1000000)
  dailyCostLimitMicros      BigInt   @default(0)
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
  workspace                 Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  models                    WorkspaceAiModelPolicy[]
}

model WorkspaceAiModelPolicy {
  id                       String        @id @default(cuid())
  workspaceId              String
  catalogId                String
  provider                 String
  model                    String
  minimumRole              WorkspaceRole @default(VIEWER)
  enabled                  Boolean       @default(true)
  isDefault                Boolean       @default(false)
  createdAt                DateTime      @default(now())
  updatedAt                DateTime      @updatedAt
  policy                   WorkspaceAiPolicy @relation(fields: [workspaceId], references: [workspaceId], onDelete: Cascade)

  @@unique([workspaceId, catalogId])
  @@index([workspaceId, enabled, isDefault])
}

model AiUsageBucket {
  id                 String   @id @default(cuid())
  workspaceId        String
  dayStartUtc        DateTime
  reservedRequests   Int      @default(0)
  usedRequests       Int      @default(0)
  reservedTokens     BigInt   @default(0)
  usedTokens         BigInt   @default(0)
  reservedCostMicros BigInt   @default(0)
  usedCostMicros     BigInt   @default(0)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  workspace          Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  leases             AiRequestLease[]

  @@unique([workspaceId, dayStartUtc])
  @@unique([id, workspaceId])
}

model AiRequestLease {
  id                 String               @id @default(cuid())
  workspaceId        String
  actorId            String
  bucketId           String
  status             AiRequestLeaseStatus @default(RESERVED)
  operation          String
  catalogId          String
  externalProvider   Boolean
  policyVersion      Int
  documentIndexerCapabilityGeneration Int?
  documentIndexerCapabilitySha256      String?
  canonicalPayloadSha256      String
  reservedRequests   Int                  @default(1)
  reservedTokens     BigInt
  reservedCostMicros BigInt
  chargedRequests    Int                  @default(0)
  chargedTokens      BigInt               @default(0)
  chargedCostMicros  BigInt               @default(0)
  expiresAt          DateTime
  createdAt          DateTime             @default(now())
  settledAt          DateTime?
  workspace          Workspace            @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  bucket             AiUsageBucket        @relation(fields: [bucketId, workspaceId], references: [id, workspaceId], onDelete: Cascade)

  @@index([workspaceId, actorId, status, expiresAt])
  @@index([bucketId, status])
}
```

Add these relations to `Workspace`:

```prisma
aiPolicy        WorkspaceAiPolicy?
aiUsageBuckets  AiUsageBucket[]
aiRequestLeases AiRequestLease[]
```

`AiRequestLease.actorId` deliberately has no foreign key: a short-lived/crash lease must remain settleable after user deletion and is removed with its UTC bucket/workspace retention. It is an internal operational identifier and is never exported to telemetry. Prisma makes `reservedTokens` required and defaults `reservedRequests` to one; the SQL check strengthens that to exactly one request and at least one token, while the source-inventory test permits lease creation only in the internal canonical-payload reservation seam. The composite bucket relation proves the lease and bucket share one workspace. Workspace and bucket relations cascade, so deletion cannot orphan counters or cross-link a bucket from another workspace. Do not add or alter an embedding field.

- [ ] **Step 4: Create the complete additive migration and safe default**

Create `prisma/migrations/20260712060000_ai_provider_policy/migration.sql`:

```sql
CREATE TYPE "AiRequestLeaseStatus" AS ENUM
  ('RESERVED', 'CALLING', 'SETTLED', 'EXPIRED', 'CANCELLED');

CREATE TABLE "WorkspaceAiPolicy" (
  "workspaceId" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "externalProvidersEnabled" BOOLEAN NOT NULL DEFAULT false,
  "maxRequestBodyBytes" INTEGER NOT NULL DEFAULT 32768,
  "maxMessageChars" INTEGER NOT NULL DEFAULT 12000,
  "maxOutputTokens" INTEGER NOT NULL DEFAULT 2048,
  "maxConcurrentRequests" INTEGER NOT NULL DEFAULT 2,
  "requestTimeoutMs" INTEGER NOT NULL DEFAULT 30000,
  "dailyRequestLimit" INTEGER NOT NULL DEFAULT 200,
  "dailyTokenLimit" BIGINT NOT NULL DEFAULT 1000000,
  "dailyCostLimitMicros" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceAiPolicy_pkey" PRIMARY KEY ("workspaceId"),
  CONSTRAINT "WorkspaceAiPolicy_bounds_check" CHECK (
    "policyVersion" >= 1 AND "maxRequestBodyBytes" BETWEEN 1024 AND 32768
    AND "maxMessageChars" BETWEEN 1 AND 12000 AND "maxOutputTokens" BETWEEN 1 AND 8192
    AND "maxConcurrentRequests" BETWEEN 1 AND 16 AND "requestTimeoutMs" BETWEEN 1000 AND 120000
    AND "dailyRequestLimit" BETWEEN 1 AND 100000 AND "dailyTokenLimit" BETWEEN 1 AND 1000000000
    AND "dailyCostLimitMicros" BETWEEN 0 AND 1000000000000
  )
);
CREATE TABLE "WorkspaceAiModelPolicy" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "catalogId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "minimumRole" "WorkspaceRole" NOT NULL DEFAULT 'VIEWER',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceAiModelPolicy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiUsageBucket" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dayStartUtc" TIMESTAMP(3) NOT NULL,
  "reservedRequests" INTEGER NOT NULL DEFAULT 0,
  "usedRequests" INTEGER NOT NULL DEFAULT 0,
  "reservedTokens" BIGINT NOT NULL DEFAULT 0,
  "usedTokens" BIGINT NOT NULL DEFAULT 0,
  "reservedCostMicros" BIGINT NOT NULL DEFAULT 0,
  "usedCostMicros" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiUsageBucket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiUsageBucket_nonnegative_check" CHECK (
    "reservedRequests" >= 0 AND "usedRequests" >= 0 AND "reservedTokens" >= 0
    AND "usedTokens" >= 0 AND "reservedCostMicros" >= 0 AND "usedCostMicros" >= 0
  )
);
CREATE TABLE "AiRequestLease" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "bucketId" TEXT NOT NULL,
  "status" "AiRequestLeaseStatus" NOT NULL DEFAULT 'RESERVED',
  "operation" TEXT NOT NULL,
  "catalogId" TEXT NOT NULL,
  "externalProvider" BOOLEAN NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "documentIndexerCapabilityGeneration" INTEGER,
  "documentIndexerCapabilitySha256" TEXT,
  "canonicalPayloadSha256" TEXT NOT NULL,
  "reservedRequests" INTEGER NOT NULL DEFAULT 1,
  "reservedTokens" BIGINT NOT NULL,
  "reservedCostMicros" BIGINT NOT NULL,
  "chargedRequests" INTEGER NOT NULL DEFAULT 0,
  "chargedTokens" BIGINT NOT NULL DEFAULT 0,
  "chargedCostMicros" BIGINT NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "AiRequestLease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiRequestLease_nonnegative_check" CHECK (
    "reservedRequests" = 1 AND "reservedTokens" >= 1 AND "reservedCostMicros" >= 0
    AND "chargedRequests" >= 0 AND "chargedTokens" >= 0 AND "chargedCostMicros" >= 0
    AND "policyVersion" >= 1
    AND "operation" IN ('ask_document', 'workspace_chat', 'query_embedding', 'document_indexing')
    AND octet_length("catalogId") BETWEEN 1 AND 191
    AND "canonicalPayloadSha256" ~ '^[0-9a-f]{64}$'
    AND (
      ("actorId" = 'system:document-indexer-v1'
       AND "operation" = 'document_indexing'
       AND "documentIndexerCapabilityGeneration" >= 1
       AND "documentIndexerCapabilitySha256" ~ '^[0-9a-f]{64}$')
      OR
      ("actorId" <> 'system:document-indexer-v1'
       AND "documentIndexerCapabilityGeneration" IS NULL
       AND "documentIndexerCapabilitySha256" IS NULL)
    )
  ),
  CONSTRAINT "AiRequestLease_state_shape_check" CHECK (
    (
      "status" IN ('RESERVED', 'CALLING')
      AND "settledAt" IS NULL
      AND "chargedRequests" = 0
      AND "chargedTokens" = 0
      AND "chargedCostMicros" = 0
    ) OR (
      "status" = 'SETTLED'
      AND "settledAt" IS NOT NULL
      AND "chargedRequests" = "reservedRequests"
      AND "chargedTokens" <= "reservedTokens"
      AND "chargedCostMicros" <= "reservedCostMicros"
    ) OR (
      "status" = 'CANCELLED'
      AND "settledAt" IS NOT NULL
      AND "chargedRequests" = 0
      AND "chargedTokens" = 0
      AND "chargedCostMicros" = 0
    ) OR (
      "status" = 'EXPIRED'
      AND "settledAt" IS NOT NULL
      AND (
        ("chargedRequests" = 0 AND "chargedTokens" = 0 AND "chargedCostMicros" = 0)
        OR
        ("chargedRequests" = "reservedRequests"
         AND "chargedTokens" = "reservedTokens"
         AND "chargedCostMicros" = "reservedCostMicros")
      )
    )
  )
);

CREATE FUNCTION public."enforceAiRequestLeaseTransition"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD."id" IS DISTINCT FROM NEW."id"
     OR OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
     OR OLD."actorId" IS DISTINCT FROM NEW."actorId"
     OR OLD."bucketId" IS DISTINCT FROM NEW."bucketId"
     OR OLD."operation" IS DISTINCT FROM NEW."operation"
     OR OLD."catalogId" IS DISTINCT FROM NEW."catalogId"
     OR OLD."externalProvider" IS DISTINCT FROM NEW."externalProvider"
     OR OLD."policyVersion" IS DISTINCT FROM NEW."policyVersion"
     OR OLD."documentIndexerCapabilityGeneration" IS DISTINCT FROM NEW."documentIndexerCapabilityGeneration"
     OR OLD."documentIndexerCapabilitySha256" IS DISTINCT FROM NEW."documentIndexerCapabilitySha256"
     OR OLD."canonicalPayloadSha256" IS DISTINCT FROM NEW."canonicalPayloadSha256"
     OR OLD."reservedRequests" IS DISTINCT FROM NEW."reservedRequests"
     OR OLD."reservedTokens" IS DISTINCT FROM NEW."reservedTokens"
     OR OLD."reservedCostMicros" IS DISTINCT FROM NEW."reservedCostMicros"
     OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'immutable AI lease field changed' USING ERRCODE = '23514';
  END IF;

  IF OLD."status" IN ('SETTLED', 'EXPIRED', 'CANCELLED') THEN
    RAISE EXCEPTION 'terminal AI lease changed' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'RESERVED' AND NEW."status" = 'CALLING'
     AND NEW."chargedRequests" = 0 AND NEW."chargedTokens" = 0
     AND NEW."chargedCostMicros" = 0 AND NEW."settledAt" IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'RESERVED' AND NEW."status" IN ('CANCELLED', 'EXPIRED')
     AND NEW."chargedRequests" = 0 AND NEW."chargedTokens" = 0
     AND NEW."chargedCostMicros" = 0 AND NEW."settledAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'CALLING' AND NEW."status" = 'SETTLED'
     AND NEW."chargedRequests" = NEW."reservedRequests"
     AND NEW."chargedTokens" <= NEW."reservedTokens"
     AND NEW."chargedCostMicros" <= NEW."reservedCostMicros"
     AND NEW."settledAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'CALLING' AND NEW."status" = 'EXPIRED'
     AND NEW."chargedRequests" = NEW."reservedRequests"
     AND NEW."chargedTokens" = NEW."reservedTokens"
     AND NEW."chargedCostMicros" = NEW."reservedCostMicros"
     AND NEW."settledAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invalid AI lease transition' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "AiRequestLease_transition_guard"
BEFORE UPDATE ON "AiRequestLease"
FOR EACH ROW EXECUTE FUNCTION public."enforceAiRequestLeaseTransition"();

CREATE UNIQUE INDEX "WorkspaceAiModelPolicy_workspaceId_catalogId_key"
  ON "WorkspaceAiModelPolicy"("workspaceId", "catalogId");
CREATE INDEX "WorkspaceAiModelPolicy_workspaceId_enabled_isDefault_idx"
  ON "WorkspaceAiModelPolicy"("workspaceId", "enabled", "isDefault");
CREATE UNIQUE INDEX "AiUsageBucket_workspaceId_dayStartUtc_key"
  ON "AiUsageBucket"("workspaceId", "dayStartUtc");
CREATE UNIQUE INDEX "AiUsageBucket_id_workspaceId_key"
  ON "AiUsageBucket"("id", "workspaceId");
CREATE INDEX "AiRequestLease_workspaceId_actorId_status_expiresAt_idx"
  ON "AiRequestLease"("workspaceId", "actorId", "status", "expiresAt");
CREATE INDEX "AiRequestLease_bucketId_status_idx" ON "AiRequestLease"("bucketId", "status");

ALTER TABLE "WorkspaceAiPolicy" ADD CONSTRAINT "WorkspaceAiPolicy_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceAiModelPolicy" ADD CONSTRAINT "WorkspaceAiModelPolicy_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "WorkspaceAiPolicy"("workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiUsageBucket" ADD CONSTRAINT "AiUsageBucket_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRequestLease" ADD CONSTRAINT "AiRequestLease_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRequestLease" ADD CONSTRAINT "AiRequestLease_bucketId_fkey"
  FOREIGN KEY ("bucketId", "workspaceId")
  REFERENCES "AiUsageBucket"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "WorkspaceAiPolicy" ("workspaceId", "policyVersion", "createdAt", "updatedAt")
SELECT "id", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Workspace"
ON CONFLICT ("workspaceId") DO NOTHING;

INSERT INTO "WorkspaceAiModelPolicy"
  ("id", "workspaceId", "catalogId", "provider", "model", "minimumRole", "enabled", "isDefault", "createdAt", "updatedAt")
SELECT concat('local-', "id"), "id", 'local.ollama.gemma4-e4b', 'ollama', 'gemma4:e4b', 'VIEWER', true, true,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Workspace"
ON CONFLICT ("workspaceId", "catalogId") DO NOTHING;
```

External rows are not inserted by the migration. Operators add only exact catalog rows after workspace opt-in and credential preflight.

The migration test compares the Prisma enum and SQL enum exactly, requires all seven
lease binding columns including the immutable canonical provider-payload SHA-256, the composite bucket/workspace foreign key, exact terminal
charge shapes, and the `pg_catalog`-first transition
trigger. Against a disposable database it exercises every legal transition:
`RESERVED→CALLING→SETTLED`, `RESERVED→CANCELLED`,
`RESERVED→EXPIRED`, and `CALLING→EXPIRED`. It also proves immutable reservation
identity/accounting/capability/payload fields and terminal rows cannot be rewritten; direct
inserts with `reservedRequests <> 1`, `reservedTokens < 1`, a mismatched bucket
workspace, a malformed payload hash, or a malformed user/system capability shape fail. It checks RESERVED
expiry/cancel charge zero, CALLING expiry charges the full reservation, and SETTLED
charges exactly one request with bounded tokens/cost. Every other
transition fails with SQLSTATE `23514` before application transition APIs exist.

- [ ] **Step 5: Run schema/migration tests to verify green**

Run:

```bash
pnpm exec vitest run tests/prisma/workspace-ai-policy-migration.test.ts --reporter=dot
pnpm exec prisma validate
pnpm run db:generate
```

Expected: PASS; generated client includes policy/quota models and `CURRENT_EMBEDDING_INDEX` is unchanged.

- [ ] **Step 6: Commit the schema slice**

```bash
pnpm wiki:install-hooks
git add prisma/schema.prisma prisma/migrations/20260712060000_ai_provider_policy/migration.sql tests/prisma/workspace-ai-policy-migration.test.ts wiki/RAG\ Process\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: add workspace AI policy and quota schema"
```

Expected: commit succeeds without provider credentials or a changed embedding identity.

### Task 2: Server-Owned Model Selection and Workspace Opt-In

**Files:**
- Create: `lib/rag/provider-catalog.ts`
- Create: `lib/rag/canonical-provider-payload.ts` — runtime-issued envelope, pure begin validation, post-commit one-shot marking, and exact-byte consumption; Task 3 adds locked context construction.
- Create: `lib/rag/provider-policy.ts`
- Create: `lib/rag/lease-control.ts`
- Create: `lib/rag/document-indexer-authority.ts`
- Create: `lib/rag/policy-provisioning.ts`
- Create: `lib/rag/provider-journal-replay.ts`
- Create: `lib/rag/provider-runtime.ts`, `lib/rag/provider-endpoints.ts`, `lib/rag/secret-file.ts`
- Create: `deploy/ai/provider-runtime-v1.json`, `deploy/ai/provider-endpoints-v1.json`, and the four fixed AI Compose overlays
- Create: `deploy/ai/provider-generation-policy-v1.json`, `deploy/ai/document-indexer/descriptor.v1.json`, the four fixed files under `deploy/ai/attested-root-bundle/`, and `scripts/security/publish-ai-provider-generation.ts`
- Create: `tests/rag/provider-policy.test.ts`
- Create: `tests/rag/lease-control.test.ts`
- Create: `tests/rag/document-indexer-authority.test.ts`
- Create: `tests/rag/provider-catalog.test.ts`
- Create: `tests/security/ai-provider-generation-publisher.test.ts`, `tests/security/ai-provider-generation-install.test.ts`
- Create: `tests/rag/provider-policy-source-inventory.test.ts`
- Create: `tests/setup/provider-runtime.ts`
- Modify: `lib/workspaces/management-service.ts`, `lib/auth/provisioning.ts`, `prisma/seed.ts`, `tests/workspaces/management-service.test.ts`, `tests/auth/provisioning.test.ts`, `tests/auth/provisioning-current-user.test.ts` — call the same provisioning helper from every create/upsert transaction.
- Create: `tests/prisma/seed-ai-policy.test.ts`
- Create: `tests/rag/provider-journal-replay.test.ts`
- Create: `tests/rag/provider-runtime.test.ts`, `tests/rag/provider-endpoints.test.ts`, `tests/rag/provider-egress.test.ts`, `tests/docker/ai-provider-overlays.test.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `app/workspaces/[workspaceSlug]/actions.ts`
- Modify: `components/workspace-settings-panel.tsx`
- Modify: `components/document-editor/ai-assistant-panel.tsx`
- Modify: `components/workspace-chatbot.tsx`
- Modify: `lib/rag/client-model-settings.ts`
- Modify: `lib/i18n/messages.ts`
- Modify: `tests/components/workspace-settings-panel.test.tsx`, `tests/components/ai-assistant-panel.test.tsx`, `tests/components/workspace-chatbot.test.tsx`, `tests/workspace-actions.test.ts`, `tests/rag/client-model-settings.test.ts`, `tests/i18n/messages.test.ts`

**Interfaces:**
- Consumes: Task 1 policy/lease rows, Leaf 5's exact active-workspace/document-access APIs, `canManageWorkspace`, the unchanged `CURRENT_EMBEDDING_INDEX`, an injected verified provider-runtime descriptor, strict file-secret reader, and the source-controlled endpoint/model catalog.
- Produces: purpose-separated immutable `CHAT`/`EMBEDDING` catalog lookup and role comparison; `AiModelOptionDto { selectionId, label }`; `resolveEffectiveAiModel()`; `listAuthorizedAiModelOptions()`; runtime-issued guarded provisioning/mutation APIs; Leaf 10-owned `VerifiedDocumentIndexerCapability` plus its signed descriptor publisher/attested installer; `updateWorkspaceExternalProviderOptIn()`; exact `leaf10JournalReplayReducers`; and the shared production DB-time lease seams consumed by Task 3. Clients send only `aiModelSelectionId?: string`, and only chat operations consume it. No capability fragment or protected-owner activation exists in this task.

- [ ] **Step 1: Write failing provider-policy tests**

Create `tests/rag/provider-policy.test.ts` with this setup and complete cases:

Before the policy cases, write RED runtime tests for strict `*_FILE` production
secrets; exact overlay ids/origins/base paths; HTTPS/default external ports; per-connect
A/AAAA validation; literal/private/metadata/userinfo/query/fragment/redirect rejection;
all proxy/TLS-override variables; exact internal Ollama with no published port or model
pull; absent-runtime `AI_UNAVAILABLE` with no fallback; embedding/indexing parity; exact
Sentry/Langfuse origins; and capability-version bump for any new catalog row.

Add real concurrent DB tests in which opt-in races workspace archive, membership
delete, and ADMIN→VIEWER downgrade. Only a transaction that locked and revalidated a
still-active manager may enable egress. Add opt-out versus `beginAiProviderCall()`
races: opt-out-first cancels the RESERVED external lease and sends zero request;
connect-first marks CALLING before opt-out and is the only allowed already-started
call. No stale `policyVersion` lease may connect.

Create `tests/rag/provider-catalog.test.ts` RED first. It asserts that every
`WorkspaceAiModelPolicy` row resolves only through a `CHAT` entry, that
`query_embedding` and `document_indexing` resolve only through the single `EMBEDDING`
entry whose provider/model/dimensions/index id equal `CURRENT_EMBEDDING_INDEX`, and
that cross-purpose ids fail `AI_CATALOG_PURPOSE_MISMATCH`. Snapshot
`CURRENT_EMBEDDING_INDEX` before and after policy resolution and prove it is unchanged;
no workspace selection, external opt-in, or chat catalog row may rewrite it or request
a reindex.

Add mutation-context cases to `tests/rag/provider-policy.test.ts`: a plain object cast
to `WorkspaceAiPolicyMutationContext`, a copied/frozen object, a valid context issued
for another workspace, and reuse of a consumed context all fail
`AI_POLICY_CONTEXT_INVALID` before a Prisma mutation. Only a freshly issued one-shot
context from the current-manager, branded-restore, or canonical-create path succeeds.

Create `tests/rag/lease-control.test.ts` in RED before implementation. Its real-DB
matrix covers all legal/illegal transitions, exact counter deltas, duplicate workers,
public cancellation, bounded-runtime failure, current-role/model reauthorization, and
the fixed document-indexer capability. It must fail because `provider-catalog.ts` and
`lease-control.ts` do not exist, not because of a missing test fixture or required
reservation field.

```ts
import { WorkspaceRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  listAuthorizedAiModelOptions,
  resolveEffectiveAiModel,
  updateWorkspaceExternalProviderOptIn,
} from "@/lib/rag/provider-policy";
import { scrubExternalProvidersForRestore } from "@/lib/rag/provider-journal-replay";
import { installVerifiedJournalReplayContextFixture } from "../setup/security-journal";
import { installProviderRuntimeFixture } from "../setup/provider-runtime";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

async function createPolicyFixture(role: WorkspaceRole, externalProvidersEnabled = false) {
  const fixture = await seedWorkspaceFixture(role);
  const policy = await prisma.workspaceAiPolicy.create({
    data: {
      workspaceId: fixture.workspace.id,
      externalProvidersEnabled,
      models: {
        create: [
          {
            id: `local-${fixture.workspace.id}`,
            catalogId: "local.ollama.gemma4-e4b",
            provider: "ollama",
            model: "gemma4:e4b",
            minimumRole: "VIEWER",
            enabled: true,
            isDefault: true,
          },
          {
            id: `external-${fixture.workspace.id}`,
            catalogId: "external.openai.gpt-5-4-mini",
            provider: "openai",
            model: "gpt-5.4-mini",
            minimumRole: "ADMIN",
            enabled: true,
            isDefault: false,
          },
        ],
      },
    },
    include: { models: true },
  });
  return { ...fixture, policy };
}

describe("workspace AI provider policy", () => {
  beforeEach(async () => {
    await resetTestData();
    await installProviderRuntimeFixture({ overlayId: "ollama-internal-v1" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("resolves an enabled local model by opaque selection id", async () => {
    const fixture = await createPolicyFixture(WorkspaceRole.VIEWER);
    const resolved = await resolveEffectiveAiModel({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      selectionId: `local-${fixture.workspace.id}`,
    });
    expect(resolved.model).toMatchObject({ provider: "ollama", model: "gemma4:e4b" });
    expect(resolved.generation.chat).toMatchObject({ provider: "ollama", model: "gemma4:e4b" });
  });

  it("rejects a provider/model string that is not a workspace policy id", async () => {
    const fixture = await createPolicyFixture(WorkspaceRole.EDITOR);
    await expect(resolveEffectiveAiModel({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      selectionId: "openai-compatible:attacker/model",
    })).rejects.toThrow("AI_POLICY_FORBIDDEN");
  });

  it("rejects an external model until the workspace opts in", async () => {
    const fixture = await createPolicyFixture(WorkspaceRole.ADMIN, false);
    await installProviderRuntimeFixture({ overlayId: "openai-official-v1", secretFile: "synthetic" });
    await expect(resolveEffectiveAiModel({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      selectionId: `external-${fixture.workspace.id}`,
    })).rejects.toThrow("AI_POLICY_FORBIDDEN");
  });

  it("caps model access by actor workspace role", async () => {
    const fixture = await createPolicyFixture(WorkspaceRole.VIEWER, true);
    await installProviderRuntimeFixture({ overlayId: "openai-official-v1", secretFile: "synthetic" });
    await expect(resolveEffectiveAiModel({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      selectionId: `external-${fixture.workspace.id}`,
    })).rejects.toThrow("AI_POLICY_FORBIDDEN");
  });

  it("rejects a catalog row when server credentials are unavailable", async () => {
    const fixture = await createPolicyFixture(WorkspaceRole.ADMIN, true);
    await installProviderRuntimeFixture({ overlayId: "openai-official-v1", secretFile: null });
    await expect(resolveEffectiveAiModel({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      selectionId: `external-${fixture.workspace.id}`,
    })).rejects.toThrow("AI_POLICY_FORBIDDEN");
  });

  it.each([
    { provider: "openai", model: "gemma4:e4b" },
    { provider: "ollama", model: "tampered-model" },
  ])("rejects a DB row whose provider/model drift from the immutable catalog: %o", async (drift) => {
    const fixture = await createPolicyFixture(WorkspaceRole.ADMIN, true);
    await prisma.workspaceAiModelPolicy.update({
      where: { id: `local-${fixture.workspace.id}` },
      data: drift,
    });
    await expect(resolveEffectiveAiModel({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      selectionId: `local-${fixture.workspace.id}`,
    })).rejects.toThrow("AI_POLICY_FORBIDDEN");
  });

  it("rejects an unknown catalog id even when its provider/model look valid", async () => {
    const fixture = await createPolicyFixture(WorkspaceRole.ADMIN, true);
    await prisma.workspaceAiModelPolicy.update({
      where: { id: `local-${fixture.workspace.id}` },
      data: { catalogId: "unknown.catalog.row" },
    });
    await expect(resolveEffectiveAiModel({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      selectionId: `local-${fixture.workspace.id}`,
    })).rejects.toThrow("AI_POLICY_FORBIDDEN");
  });

  it("lists only catalog-valid, role-authorized, credential-available rows", async () => {
    const fixture = await createPolicyFixture(WorkspaceRole.ADMIN, true);
    await installProviderRuntimeFixture({ overlayId: "openai-official-v1", secretFile: null });
    await expect(listAuthorizedAiModelOptions({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    })).resolves.toEqual([{
      selectionId: `local-${fixture.workspace.id}`,
      label: "Local Ollama · Gemma 4 E4B",
    }]);
  });

  it.each([WorkspaceRole.OWNER, WorkspaceRole.ADMIN])(
    "allows %s to change external opt-in",
    async (role) => {
      const fixture = await createPolicyFixture(role);
      await expect(updateWorkspaceExternalProviderOptIn({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        enabled: true,
        rootOperationId: "00000000-0000-4000-8000-000000000010",
      })).resolves.toMatchObject({ externalProvidersEnabled: true, policyVersion: 2 });
    },
  );

  it.each([WorkspaceRole.EDITOR, WorkspaceRole.VIEWER])(
    "rejects %s external opt-in changes",
    async (role) => {
      const fixture = await createPolicyFixture(role);
      await expect(updateWorkspaceExternalProviderOptIn({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        enabled: true,
        rootOperationId: "00000000-0000-4000-8000-000000000011",
      })).rejects.toThrow("WORKSPACE_MANAGE_FORBIDDEN");
    },
  );

  it("journals normal manager opt-out atomically and never opt-in", async () => {
    const fixture = await createPolicyFixture(WorkspaceRole.OWNER, true);
    const appendJournal = vi.fn().mockResolvedValue({ sequence: 1n, eventHash: "synthetic" });
    await updateWorkspaceExternalProviderOptIn({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      enabled: false,
      rootOperationId: "00000000-0000-4000-8000-000000000012",
    }, { appendJournal });
    expect(appendJournal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      kind: "AI_EXTERNAL_PROVIDER_DISABLED",
      subjectId: fixture.workspace.id,
      payload: { stateCode: "AI_EXTERNAL_PROVIDER_DISABLED", stateVersion: 1 },
    }));
    appendJournal.mockClear();
    await updateWorkspaceExternalProviderOptIn({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      enabled: true,
      rootOperationId: "00000000-0000-4000-8000-000000000013",
    }, { appendJournal });
    expect(appendJournal).not.toHaveBeenCalled();
  });

  it("uses a branded no-append restore scrub with no actor permission", async () => {
    const fixture = await createPolicyFixture(WorkspaceRole.VIEWER, true);
    const restoreContext = await installVerifiedJournalReplayContextFixture();
    await prisma.$transaction((tx) => scrubExternalProvidersForRestore(
      tx,
      restoreContext,
    ));
    await expect(prisma.workspaceAiPolicy.findUniqueOrThrow({
      where: { workspaceId: fixture.workspace.id },
    })).resolves.toMatchObject({ externalProvidersEnabled: false });
  });
});
```

- [ ] **Step 2: Run provider-policy tests to verify red**

Run: `pnpm exec vitest run tests/rag/provider-policy.test.ts tests/rag/provider-catalog.test.ts tests/rag/provider-policy-source-inventory.test.ts tests/rag/lease-control.test.ts tests/rag/document-indexer-authority.test.ts tests/security/ai-provider-generation-publisher.test.ts tests/security/ai-provider-generation-install.test.ts tests/rag/provider-journal-replay.test.ts tests/rag/provider-runtime.test.ts tests/rag/provider-endpoints.test.ts tests/rag/provider-egress.test.ts tests/workspaces/management-service.test.ts tests/auth/provisioning.test.ts tests/auth/provisioning-current-user.test.ts tests/prisma/seed-ai-policy.test.ts tests/docker/ai-provider-overlays.test.ts --reporter=dot`

Expected: FAIL because the exact catalog, lease-control seam, provider policy, restore
reducer, verified runtime, strict secret-file reader, endpoint catalog, and fixed
overlays do not exist.

- [ ] **Step 3: Implement the server catalog and policy resolver**

Create `lib/rag/provider-catalog.ts`. This is the single owner of catalog ids,
provider/model pairs, role ordering, and price arithmetic; policy, admission, and
settlement code import these exports rather than keeping private copies:

```ts
import type { WorkspaceRole } from "@prisma/client";
import {
  CURRENT_EMBEDDING_INDEX,
  type RagProvider,
} from "@/lib/rag/model-config";

export type AiOperation =
  | "ask_document"
  | "workspace_chat"
  | "query_embedding"
  | "document_indexing";
export type AiCatalogPurpose = "CHAT" | "EMBEDDING";

type AiCatalogCommon = Readonly<{
  catalogId: string;
  provider: RagProvider;
  model: string;
  label: string;
  external: boolean;
  runtimeId: "ollama-internal-v1" | "openai-official-v1" | "openrouter-official-v1";
  endpointId: "ollama.internal" | "openai.official" | "openrouter.official";
  secretSlot: null | "openai" | "openrouter";
  maxInputTokens: number;
  fixedFramingTokenUpperBound: number;
  perInputFramingTokenUpperBound: number;
  inputMicrosPerMillion: bigint;
  outputMicrosPerMillion: bigint;
}>;

export type AiChatCatalogEntry = AiCatalogCommon & Readonly<{
  purpose: "CHAT";
  maxOutputTokens: number;
}>;

export type AiEmbeddingCatalogEntry = AiCatalogCommon & Readonly<{
  purpose: "EMBEDDING";
  dimensions: number;
  indexId: string;
}>;

export type AiCatalogEntry = AiChatCatalogEntry | AiEmbeddingCatalogEntry;

export const AI_CHAT_MODEL_CATALOG = Object.freeze({
  "local.ollama.gemma4-e4b": Object.freeze({
    catalogId: "local.ollama.gemma4-e4b",
    purpose: "CHAT" as const,
    provider: "ollama",
    model: "gemma4:e4b",
    label: "Local Ollama · Gemma 4 E4B",
    external: false,
    runtimeId: "ollama-internal-v1",
    endpointId: "ollama.internal",
    secretSlot: null,
    maxInputTokens: 32_768,
    maxOutputTokens: 8_192,
    fixedFramingTokenUpperBound: 64,
    perInputFramingTokenUpperBound: 16,
    inputMicrosPerMillion: 0n,
    outputMicrosPerMillion: 0n,
  }),
  "external.openai.gpt-5-4-mini": Object.freeze({
    catalogId: "external.openai.gpt-5-4-mini",
    purpose: "CHAT" as const,
    provider: "openai",
    model: "gpt-5.4-mini",
    label: "OpenAI · GPT-5.4 mini",
    external: true,
    runtimeId: "openai-official-v1",
    endpointId: "openai.official",
    secretSlot: "openai",
    maxInputTokens: 128_000,
    maxOutputTokens: 16_384,
    fixedFramingTokenUpperBound: 64,
    perInputFramingTokenUpperBound: 16,
    inputMicrosPerMillion: 2_000_000n,
    outputMicrosPerMillion: 8_000_000n,
  }),
  "external.openrouter.gemma-4-31b-free": Object.freeze({
    catalogId: "external.openrouter.gemma-4-31b-free",
    purpose: "CHAT" as const,
    provider: "openai-compatible",
    model: "google/gemma-4-31b-it:free",
    label: "OpenRouter · Gemma 4 31B free",
    external: true,
    runtimeId: "openrouter-official-v1",
    endpointId: "openrouter.official",
    secretSlot: "openrouter",
    maxInputTokens: 128_000,
    maxOutputTokens: 8_192,
    fixedFramingTokenUpperBound: 64,
    perInputFramingTokenUpperBound: 16,
    inputMicrosPerMillion: 0n,
    outputMicrosPerMillion: 0n,
  }),
} satisfies Record<string, AiChatCatalogEntry>);

export const CURRENT_EMBEDDING_CATALOG_ENTRY = Object.freeze({
  catalogId: "embedding.current.bge-m3-v1",
  purpose: "EMBEDDING" as const,
  provider: CURRENT_EMBEDDING_INDEX.provider,
  model: CURRENT_EMBEDDING_INDEX.model,
  label: "Current embedding index",
  external: false,
  runtimeId: "ollama-internal-v1" as const,
  endpointId: "ollama.internal" as const,
  secretSlot: null,
  maxInputTokens: 8_192,
  dimensions: CURRENT_EMBEDDING_INDEX.dimensions,
  indexId: CURRENT_EMBEDDING_INDEX.indexId,
  fixedFramingTokenUpperBound: 64,
  perInputFramingTokenUpperBound: 16,
  inputMicrosPerMillion: 0n,
  outputMicrosPerMillion: 0n,
} satisfies AiEmbeddingCatalogEntry);

export const AI_CATALOG = Object.freeze({
  ...AI_CHAT_MODEL_CATALOG,
  [CURRENT_EMBEDDING_CATALOG_ENTRY.catalogId]: CURRENT_EMBEDDING_CATALOG_ENTRY,
} satisfies Record<string, AiCatalogEntry>);

const roleRank: Record<WorkspaceRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function roleMeetsMinimum(actual: WorkspaceRole, minimum: WorkspaceRole) {
  return roleRank[actual] >= roleRank[minimum];
}

export function purposeForOperation(operation: AiOperation): AiCatalogPurpose {
  return operation === "ask_document" || operation === "workspace_chat"
    ? "CHAT"
    : "EMBEDDING";
}

export function requireExactCatalogEntry(
  catalogId: string,
  purpose: AiCatalogPurpose,
): AiCatalogEntry {
  const entry = (AI_CATALOG as Record<string, AiCatalogEntry>)[catalogId];
  if (!entry) throw new Error("AI_POLICY_FORBIDDEN");
  if (entry.purpose !== purpose) throw new Error("AI_CATALOG_PURPOSE_MISMATCH");
  return entry;
}

export function requireCurrentEmbeddingCatalogEntry(): AiEmbeddingCatalogEntry {
  const entry = requireExactCatalogEntry(
    CURRENT_EMBEDDING_CATALOG_ENTRY.catalogId,
    "EMBEDDING",
  ) as AiEmbeddingCatalogEntry;
  if (
    entry.provider !== CURRENT_EMBEDDING_INDEX.provider ||
    entry.model !== CURRENT_EMBEDDING_INDEX.model ||
    entry.dimensions !== CURRENT_EMBEDDING_INDEX.dimensions ||
    entry.indexId !== CURRENT_EMBEDDING_INDEX.indexId
  ) throw new Error("AI_EMBEDDING_INDEX_IDENTITY_MISMATCH");
  return entry;
}

export function requireExactWorkspaceChatModelPolicy(model: {
  catalogId: string;
  provider: string;
  model: string;
  enabled: boolean;
}): AiChatCatalogEntry {
  const entry = requireExactCatalogEntry(model.catalogId, "CHAT") as AiChatCatalogEntry;
  if (!model.enabled || entry.provider !== model.provider || entry.model !== model.model) {
    throw new Error("AI_POLICY_FORBIDDEN");
  }
  return entry;
}

export function catalogCostMicros(
  entry: AiCatalogEntry,
  inputTokens: number,
  outputTokens: number,
) {
  if (
    !Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
    !Number.isSafeInteger(outputTokens) || outputTokens < 0
  ) throw new Error("AI_USAGE_INVALID");
  return (
    BigInt(inputTokens) * entry.inputMicrosPerMillion +
    BigInt(outputTokens) * entry.outputMicrosPerMillion +
    999_999n
  ) / 1_000_000n;
}

export function catalogReservationCostMicros(entry: AiCatalogEntry, totalTokens: bigint) {
  if (totalTokens < 0n || totalTokens > 1_000_000_000_000n) {
    throw new Error("AI_USAGE_INVALID");
  }
  const worstRate = entry.inputMicrosPerMillion > entry.outputMicrosPerMillion
    ? entry.inputMicrosPerMillion
    : entry.outputMicrosPerMillion;
  return (totalTokens * worstRate + 999_999n) / 1_000_000n;
}
```

Create `lib/rag/provider-policy.ts`:

```ts
import { Prisma, type WorkspaceRole } from "@prisma/client";
import {
  resolveActiveWorkspaceForActor,
  resolveActiveWorkspaceForActorForUpdate,
} from "@/lib/authorization/active-resources";
import { prisma } from "@/lib/db/client";
import { canManageWorkspace } from "@/lib/permissions/workspace";
import {
  type AiChatCatalogEntry,
  requireExactCatalogEntry,
  requireExactWorkspaceChatModelPolicy,
  roleMeetsMinimum,
} from "@/lib/rag/provider-catalog";
import {
  cancelReservedExternalLeases,
} from "@/lib/rag/lease-control";
import {
  isVerifiedProviderRuntimeAvailable,
  requireVerifiedProviderRuntime,
} from "@/lib/rag/provider-runtime";
import {
  appendSecurityJournalEvent,
  assertVerifiedJournalReplayContext,
  deriveSecurityJournalOperationId,
  type VerifiedJournalReplayContext,
} from "@/lib/security/journal";

export type AiModelOptionDto = { selectionId: string; label: string };

export async function resolveEffectiveAiModel(input: {
  workspaceSlug: string;
  actorId: string;
  selectionId?: string;
}) {
  const { workspace, role } = await resolveActiveWorkspaceForActor(prisma, {
    workspaceSlug: input.workspaceSlug,
    actorId: input.actorId,
  });
  const policy = await prisma.workspaceAiPolicy.findUnique({
    where: { workspaceId: workspace.id },
    include: { models: { where: { enabled: true }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] } },
  });
  if (!policy) throw new Error("AI_POLICY_FORBIDDEN");
  const model = input.selectionId
    ? policy.models.find(({ id }) => id === input.selectionId)
    : policy.models.find(({ isDefault }) => isDefault);
  if (!model || !roleMeetsMinimum(role, model.minimumRole)) {
    throw new Error("AI_POLICY_FORBIDDEN");
  }
  const catalog = requireExactWorkspaceChatModelPolicy(model);
  if (catalog.external && !policy.externalProvidersEnabled) {
    throw new Error("AI_POLICY_FORBIDDEN");
  }
  const config = await requireVerifiedProviderRuntime(catalog);
  return { workspace, role, policy, model, catalog, generation: config };
}

export async function listAuthorizedAiModelOptions(input: {
  workspaceSlug: string;
  actorId: string;
}): Promise<AiModelOptionDto[]> {
  const resolved = await resolveActiveWorkspaceForActor(prisma, input);
  const policy = await prisma.workspaceAiPolicy.findUnique({
    where: { workspaceId: resolved.workspace.id },
    include: { models: { where: { enabled: true }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] } },
  });
  if (!policy) return [];
  const options: AiModelOptionDto[] = [];
  for (const model of policy.models) {
    if (!roleMeetsMinimum(resolved.role, model.minimumRole)) continue;
    let catalog: AiChatCatalogEntry;
    try { catalog = requireExactWorkspaceChatModelPolicy(model); } catch { continue; }
    if (catalog.external && !policy.externalProvidersEnabled) continue;
    if (!(await isVerifiedProviderRuntimeAvailable(catalog))) continue;
    options.push({ selectionId: model.id, label: catalog.label });
  }
  return options;
}

type ReviewedWorkspaceModelMutation =
  | { kind: "UPSERT"; catalogId: string; minimumRole: WorkspaceRole; isDefault: boolean }
  | { kind: "DISABLE"; catalogId: string };

type BoundedWorkspaceAiPolicyPatch = Partial<{
  externalProvidersEnabled: boolean;
  maxRequestBodyBytes: number;
  maxMessageChars: number;
  maxOutputTokens: number;
  maxConcurrentRequests: number;
  requestTimeoutMs: number;
  dailyRequestLimit: number;
  dailyTokenLimit: bigint;
  dailyCostLimitMicros: bigint;
}>;

const workspaceAiPolicyMutationBrand: unique symbol = Symbol("WorkspaceAiPolicyMutationContext");
const issuedWorkspaceAiPolicyMutationContexts = new WeakSet<object>();
export type WorkspaceAiPolicyMutationContext = Readonly<{
  [workspaceAiPolicyMutationBrand]: true;
  workspaceId: string;
  authority: "CURRENT_MANAGER" | "BRANDED_RESTORE" | "WORKSPACE_CREATE";
}>;

function issueWorkspaceAiPolicyMutationContext(
  workspaceId: string,
  authority: WorkspaceAiPolicyMutationContext["authority"],
): WorkspaceAiPolicyMutationContext {
  const context = Object.freeze({
    [workspaceAiPolicyMutationBrand]: true as const,
    workspaceId,
    authority,
  });
  issuedWorkspaceAiPolicyMutationContexts.add(context);
  return context;
}

function createCurrentManagerPolicyMutationContext(resolved: {
  workspace: { id: string };
  role: WorkspaceRole;
}): WorkspaceAiPolicyMutationContext {
  if (!canManageWorkspace(resolved.role)) throw new Error("WORKSPACE_MANAGE_FORBIDDEN");
  return issueWorkspaceAiPolicyMutationContext(resolved.workspace.id, "CURRENT_MANAGER");
}

export function issueRestorePolicyMutationContextForReplay(
  workspaceId: string,
  context: VerifiedJournalReplayContext,
): WorkspaceAiPolicyMutationContext {
  assertVerifiedJournalReplayContext(context);
  return issueWorkspaceAiPolicyMutationContext(workspaceId, "BRANDED_RESTORE");
}

export function issueWorkspaceCreatePolicyMutationContextForProvisioning(
  workspaceId: string,
): WorkspaceAiPolicyMutationContext {
  // Source inventory permits this issuer only in policy-provisioning.ts, after the
  // canonical create/upsert transaction has created and locked the workspace row.
  return issueWorkspaceAiPolicyMutationContext(workspaceId, "WORKSPACE_CREATE");
}

function assertBoundedPolicyPatch(patch: BoundedWorkspaceAiPolicyPatch | undefined) {
  if (!patch || Object.keys(patch).length === 0) throw new Error("AI_POLICY_PATCH_INVALID");
  const integerBounds = {
    maxRequestBodyBytes: [1_024, 32_768],
    maxMessageChars: [1, 12_000],
    maxOutputTokens: [1, 8_192],
    maxConcurrentRequests: [1, 16],
    requestTimeoutMs: [1_000, 120_000],
    dailyRequestLimit: [1, 100_000],
  } as const;
  for (const [key, [minimum, maximum]] of Object.entries(integerBounds)) {
    const value = patch[key as keyof typeof integerBounds];
    if (value !== undefined && (!Number.isInteger(value) || value < minimum || value > maximum)) {
      throw new Error("AI_POLICY_PATCH_INVALID");
    }
  }
  if (
    patch.externalProvidersEnabled !== undefined &&
    typeof patch.externalProvidersEnabled !== "boolean"
  ) throw new Error("AI_POLICY_PATCH_INVALID");
  if (
    patch.dailyTokenLimit !== undefined &&
    (patch.dailyTokenLimit < 1n || patch.dailyTokenLimit > 1_000_000_000n)
  ) throw new Error("AI_POLICY_PATCH_INVALID");
  if (
    patch.dailyCostLimitMicros !== undefined &&
    (patch.dailyCostLimitMicros < 0n || patch.dailyCostLimitMicros > 1_000_000_000_000n)
  ) throw new Error("AI_POLICY_PATCH_INVALID");
}

async function applyReviewedExactModelMutation(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  mutation: ReviewedWorkspaceModelMutation,
) {
  const catalog = requireExactCatalogEntry(mutation.catalogId, "CHAT") as AiChatCatalogEntry;
  if (mutation.kind === "DISABLE") {
    await tx.workspaceAiModelPolicy.update({
      where: { workspaceId_catalogId: { workspaceId, catalogId: mutation.catalogId } },
      data: { enabled: false, isDefault: false },
    });
    return;
  }
  await tx.workspaceAiModelPolicy.upsert({
    where: { workspaceId_catalogId: { workspaceId, catalogId: mutation.catalogId } },
    create: {
      workspaceId,
      catalogId: catalog.catalogId,
      provider: catalog.provider,
      model: catalog.model,
      minimumRole: mutation.minimumRole,
      enabled: true,
      isDefault: mutation.isDefault,
    },
    update: {
      provider: catalog.provider,
      model: catalog.model,
      minimumRole: mutation.minimumRole,
      enabled: true,
      isDefault: mutation.isDefault,
    },
  });
}

export async function mutateWorkspaceAiPolicyForUpdate(
  tx: Prisma.TransactionClient,
  input: {
    context: WorkspaceAiPolicyMutationContext;
    workspaceId: string;
    policyPatch?: BoundedWorkspaceAiPolicyPatch;
    modelMutation?: ReviewedWorkspaceModelMutation;
  },
) {
  if (
    !input.context || typeof input.context !== "object" ||
    !issuedWorkspaceAiPolicyMutationContexts.has(input.context) ||
    input.context[workspaceAiPolicyMutationBrand] !== true ||
    input.context.workspaceId !== input.workspaceId ||
    !["CURRENT_MANAGER", "BRANDED_RESTORE", "WORKSPACE_CREATE"].includes(
      input.context.authority,
    )
  ) throw new Error("AI_POLICY_CONTEXT_INVALID");
  // Contexts are one-shot. A retry must reacquire current authority and mint a new context.
  issuedWorkspaceAiPolicyMutationContexts.delete(input.context);
  if (!input.policyPatch && !input.modelMutation) throw new Error("AI_POLICY_PATCH_INVALID");
  if (input.policyPatch) assertBoundedPolicyPatch(input.policyPatch);
  if (input.modelMutation) {
    await applyReviewedExactModelMutation(tx, input.workspaceId, input.modelMutation);
  }
  return tx.workspaceAiPolicy.update({
    where: { workspaceId: input.workspaceId },
    data: { ...input.policyPatch, policyVersion: { increment: 1 } },
    select: { externalProvidersEnabled: true, policyVersion: true },
  });
}

export async function updateWorkspaceExternalProviderOptIn(input: {
  workspaceSlug: string;
  actorId: string;
  enabled: boolean;
  rootOperationId: string;
}, deps: { appendJournal?: typeof appendSecurityJournalEvent } = {}) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.workspace.findUniqueOrThrow({
      where: { slug: input.workspaceSlug },
      select: { id: true },
    });
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${target.id}, 0))
    `);
    const resolved = await resolveActiveWorkspaceForActorForUpdate(tx, {
      workspaceId: target.id,
      actorId: input.actorId,
      access: "write",
    });
    if (!canManageWorkspace(resolved.role)) {
      throw new Error("WORKSPACE_MANAGE_FORBIDDEN");
    }
    await tx.$queryRaw(Prisma.sql`
      SELECT "workspaceId" FROM "WorkspaceAiPolicy"
      WHERE "workspaceId" = ${resolved.workspace.id} FOR UPDATE
    `);
    const current = await tx.workspaceAiPolicy.findUniqueOrThrow({
      where: { workspaceId: resolved.workspace.id },
    });
    if (current.externalProvidersEnabled === input.enabled) {
      return {
        externalProvidersEnabled: current.externalProvidersEnabled,
        policyVersion: current.policyVersion,
      };
    }
    const updated = await mutateWorkspaceAiPolicyForUpdate(tx, {
      context: createCurrentManagerPolicyMutationContext(resolved),
      workspaceId: resolved.workspace.id,
      policyPatch: { externalProvidersEnabled: input.enabled },
    });
    if (!input.enabled) {
      await cancelReservedExternalLeases(
        tx,
        resolved.workspace.id,
      );
      await (deps.appendJournal ?? appendSecurityJournalEvent)(tx, {
        kind: "AI_EXTERNAL_PROVIDER_DISABLED",
        subjectType: "WORKSPACE",
        subjectId: resolved.workspace.id,
        operationId: deriveSecurityJournalOperationId({
          rootOperationId: input.rootOperationId,
          kind: "AI_EXTERNAL_PROVIDER_DISABLED",
          subjectType: "WORKSPACE",
          subjectId: resolved.workspace.id,
        }),
        payload: { stateCode: "AI_EXTERNAL_PROVIDER_DISABLED", stateVersion: 1 },
      });
    }
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
```

Create `lib/rag/document-indexer-authority.ts` in Leaf 10. It does not reuse a user id or
accept a caller-provided capability object:

```ts
import { createHash } from "node:crypto";
import { Prisma, type WorkspaceRole } from "@prisma/client";
import { readRootInstalledGenerationArtifact } from "@/lib/security/root-descriptor";

const verifiedDocumentIndexerBrand: unique symbol = Symbol("VerifiedDocumentIndexerCapability");
const issuedVerifiedDocumentIndexerCapabilities = new WeakSet<object>();
export type VerifiedDocumentIndexerCapability = Readonly<{
  [verifiedDocumentIndexerBrand]: true;
  generation: number;
  sha256: string;
  effectiveRole: WorkspaceRole;
}>;

export const DOCUMENT_INDEXER_ACTOR_ID = "system:document-indexer-v1";

export async function verifyCurrentDocumentIndexerCapability(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    expectedBinding?: { generation: number; sha256: string };
  },
): Promise<VerifiedDocumentIndexerCapability> {
  const workspaces = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Workspace"
    WHERE "id" = ${input.workspaceId} AND "archivedAt" IS NULL FOR UPDATE
  `);
  if (workspaces.length !== 1 || workspaces[0]?.id !== input.workspaceId) {
    throw new Error("AI_SYSTEM_WORKSPACE_NOT_ACTIVE");
  }
  const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`
    SELECT clock_timestamp() AS "now"
  `);
  if (!clock || !Number.isFinite(clock.now.getTime())) {
    throw new Error("AI_SYSTEM_CLOCK_INVALID");
  }
  const bytes = await readRootInstalledGenerationArtifact(
    "/etc/munjib/ai/provider-generation-v1.json",
    "document-indexer/descriptor.v1.json",
    { maxPointerBytes: 4_096, maxArtifactBytes: 8_192, ownerUid: 0, disallowSymlink: true },
  );
  const descriptor = parseAndVerifyDocumentIndexerDescriptor(bytes, {
    exactPrincipal: DOCUMENT_INDEXER_ACTOR_ID,
    exactCapability: "document-indexer-v1",
    databaseNow: clock.now,
  });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (
    input.expectedBinding &&
    (descriptor.generation !== input.expectedBinding.generation ||
      sha256 !== input.expectedBinding.sha256)
  ) throw new Error("AI_SYSTEM_CAPABILITY_CHANGED");
  const capability = Object.freeze({
    [verifiedDocumentIndexerBrand]: true as const,
    generation: descriptor.generation,
    sha256,
    effectiveRole: "EDITOR",
  });
  issuedVerifiedDocumentIndexerCapabilities.add(capability);
  return capability;
}

export function assertIssuedDocumentIndexerCapability(
  capability: VerifiedDocumentIndexerCapability,
) {
  if (
    !capability || typeof capability !== "object" ||
    !issuedVerifiedDocumentIndexerCapabilities.has(capability) ||
    capability[verifiedDocumentIndexerBrand] !== true
  ) throw new Error("AI_SYSTEM_CAPABILITY_FORGED");
}
```

The descriptor parser requires a positive integer generation, fixed service/operation,
expiry later than DB time, and the Leaf 13B signature/attestation chain. It exposes no
constructor or type assertion. Every internal lease-binding consumer calls
`assertIssuedDocumentIndexerCapability()` before reading generation/SHA. Tests reject a
structural cast/copy, zero/multiple active-workspace result, rotate generation with the same bytes, replace
bytes without a generation bump, revoke/expire the descriptor, archive the workspace,
and prove each stale lease fails before `CALLING`.

Create the composite provider-generation publisher and attested install path in the same RED/GREEN slice.
The committed `deploy/ai/document-indexer/descriptor.v1.json` is policy, not a live
self-signed capability. It fixes this exact tuple and rejects unknown keys:

```json
{
  "format": "munjib-document-indexer-descriptor-policy-v1",
  "principal": "system:document-indexer-v1",
  "capability": "document-indexer-v1",
  "operation": "document_indexing",
  "dispatcherOperation": "ai-provider-generation",
  "maxDescriptorBytes": 8192,
  "maxLifetimeSeconds": 3600
}
```

`deploy/ai/provider-generation-policy-v1.json` fixes exactly four generation members:
(1) exact application OCI digest, (2) exact provider-runtime descriptor, (3) exact
endpoint catalog, and (4) signed document-indexer descriptor.
`scripts/security/publish-ai-provider-generation.ts` accepts no path,
principal, capability, operation, endpoint, overlay, or signer override. In the
protected attest/sign job it consumes the exact candidate source SHA/application
digest, hashes of `provider-runtime-v1.json`, `provider-endpoints-v1.json`, and
`document-indexer/descriptor.v1.json`, the `ai-provider-v1` host-bundle digest, monotonic
generation, expected previous generation, expiry, and Leaf 13B attestation/KMS signer.
It emits one untracked signed generation envelope and descriptor; signatures cover all
four members and hashes. The root-bundle `manifest.json` hashes exactly the other three
bundle members—`dispatcher-operation.json`, `munjib-ai-provider-install`, and
`munjib-document-indexer-install`—and never hashes itself. The outer OCI/root-bundle
attestation binds the manifest hash, so the chain is acyclic. Self-asserted `passed`
booleans, mutable tags, workspace ids, and
secrets are invalid. `tests/security/ai-provider-generation-publisher.test.ts` rejects
wrong source/image/bundle/policy hash, replayed or non-increasing generation, excessive
lifetime, unknown field, wrong signer/purpose, mutable tag, or evidence not bound to the
exact candidate.

The separately attested `ai-provider-v1` host bundle contains exactly
`manifest.json`, `dispatcher-operation.json`, `munjib-ai-provider-install`, and
`munjib-document-indexer-install`; its outer attestation also binds the three exact source
policy hashes packaged as read-only payloads. The provider installer validates and
installs the fixed runtime/endpoint generation; the document-indexer installer validates and
installs `document-indexer-v1`. Neither accepts a caller path or edits policy. The
manifest hashes every member and binds bundle id, architecture, source SHA, builder
identity, exact OCI digest, install order, owner/mode, and destination allowlist. Leaf
13B's forced dispatcher accepts only operation `ai-provider-generation`, the signed
generation envelope, and the allowlisted bundle digest; it accepts no checkout path,
shell, Compose file, URL, environment, secret, uid, or arbitrary argument.

Under `/run/lock/munjib-security-state.lock`, the two installers re-verify bundle,
envelope, and policy hashes, write root-owned regular files beneath
`/var/lib/munjib/ai-provider/generations/<generation>/`, fsync every file/directory,
then atomically replace the root-owned regular pointer
`/etc/munjib/ai/provider-generation-v1.json`. Runtime, endpoint, and document-indexer capability
readers resolve only through that one pointer and verify all artifact hashes; they can
observe either the complete old generation or complete new generation, never a mixed
set. The host never reads or executes repository checkout bytes.

`tests/security/ai-provider-generation-install.test.ts` runs crash injection at every
write/fsync/rename and both-installer boundary and rejects missing provider installer,
missing document-indexer installer, manifest self-hash, runtime/endpoint/descriptor hash drift, mixed generations,
symlink/hardlink/non-root/writable input, non-ARM64 bundle, stale expected generation,
wrong global-lock inode, or partial installation. Rollback selects the immediately
previous complete four-member composite generation only when its exact app/bundle/capability
evidence still satisfies the current floor. Otherwise the dispatcher keeps current,
enters maintenance if required, and requires signed fix-forward; it never synthesizes
an older runtime, endpoint, or indexer descriptor.

Create the initial `lib/rag/canonical-provider-payload.ts` runtime core in this task:
the real private symbol/issued registry, `CanonicalProviderPayload` type, pure
`validateCanonicalProviderPayloadForBegin()`, post-commit
`markCanonicalProviderPayloadBegun()`, and exactly-once
`consumeCanonicalProviderPayloadForInvoke()`. A test-only issuer is available only
under Vitest and is source-scanned out of production callsites so Task 2 lease-control
tests can exercise forged/copy/retry/descriptor-failure state. Task 3 removes that
fixture from service paths and adds the only production issuer, the locked full-context
builder.

Create `lib/rag/lease-control.ts` in this task, before the policy tests can turn
GREEN. It contains no quota admission logic, but it owns the shared database clock,
workspace lock, state transitions, cancellation, expiry, and the authorization
linearization point immediately before a provider call:

```ts
import { type AiRequestLease, Prisma, type WorkspaceRole } from "@prisma/client";
import { resolveActiveWorkspaceForActorForUpdate } from "@/lib/authorization/active-resources"; // Leaf 5 export
import { prisma } from "@/lib/db/client";
import {
  markCanonicalProviderPayloadBegun,
  type CanonicalProviderPayload,
  validateCanonicalProviderPayloadForBegin,
} from "@/lib/rag/canonical-provider-payload";
import {
  type AiOperation,
  purposeForOperation,
  requireCurrentEmbeddingCatalogEntry,
  requireExactWorkspaceChatModelPolicy,
  roleMeetsMinimum,
} from "@/lib/rag/provider-catalog";
import { requireVerifiedProviderRuntimeDescriptor } from "@/lib/rag/provider-runtime";
import {
  assertIssuedDocumentIndexerCapability,
  DOCUMENT_INDEXER_ACTOR_ID,
  verifyCurrentDocumentIndexerCapability,
} from "@/lib/rag/document-indexer-authority";

const SERIALIZABLE_ATTEMPTS = 3;

export type AiQuotaClock = {
  now(tx: Prisma.TransactionClient): Promise<Date>;
};

const databaseQuotaClock: AiQuotaClock = {
  async now(tx) {
    const [row] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`
      SELECT clock_timestamp() AS "now"
    `);
    if (!row || !Number.isFinite(row.now.getTime())) {
      throw new Error("AI_QUOTA_CLOCK_INVALID");
    }
    return row.now;
  },
};

/** @internal; source-scanned to lease/quota modules and the Vitest harness only. */
export type AiQuotaDependencies = Readonly<{ clock: AiQuotaClock }>;
export const productionAiQuotaDependencies: AiQuotaDependencies = Object.freeze({
  clock: databaseQuotaClock,
});

export async function withSerializableRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 1; attempt <= SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === SERIALIZABLE_ATTEMPTS) throw error;
    }
  }
  throw new Error("AI_QUOTA_SERIALIZATION_RETRY_EXHAUSTED");
}

export async function lockWorkspaceAiTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: string,
) {
  await tx.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))
  `);
}

export async function expireLockedLeaseAndUpdateBucket(
  tx: Prisma.TransactionClient,
  lease: AiRequestLease,
  now: Date,
) {
  const calling = lease.status === "CALLING";
  const claimed = await tx.aiRequestLease.updateMany({
    where: { id: lease.id, status: lease.status },
    data: {
      status: "EXPIRED",
      chargedRequests: calling ? lease.reservedRequests : 0,
      chargedTokens: calling ? lease.reservedTokens : 0n,
      chargedCostMicros: calling ? lease.reservedCostMicros : 0n,
      settledAt: now,
    },
  });
  if (claimed.count !== 1) return false;
  await tx.aiUsageBucket.update({
    where: { id: lease.bucketId },
    data: {
      reservedRequests: { decrement: lease.reservedRequests },
      reservedTokens: { decrement: lease.reservedTokens },
      reservedCostMicros: { decrement: lease.reservedCostMicros },
      usedRequests: { increment: calling ? lease.reservedRequests : 0 },
      usedTokens: { increment: calling ? lease.reservedTokens : 0n },
      usedCostMicros: { increment: calling ? lease.reservedCostMicros : 0n },
    },
  });
  return true;
}

async function cancelReservedLeaseUnderLock(
  tx: Prisma.TransactionClient,
  hint: Pick<AiRequestLease, "id" | "workspaceId" | "bucketId">,
  clock: AiQuotaClock,
) {
  const buckets = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "AiUsageBucket"
    WHERE "id" = ${hint.bucketId} AND "workspaceId" = ${hint.workspaceId} FOR UPDATE
  `);
  if (buckets.length !== 1) return false;
  const leases = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "AiRequestLease" WHERE "id" = ${hint.id} FOR UPDATE
  `);
  if (leases.length !== 1) return false;
  const lease = await tx.aiRequestLease.findUnique({ where: { id: hint.id } });
  if (!lease || lease.bucketId !== hint.bucketId || lease.workspaceId !== hint.workspaceId) return false;
  // This is the first authoritative time read for this transition and occurs only
  // after both target rows are locked.
  const now = await clock.now(tx);
  if (lease.status === "RESERVED" && lease.expiresAt <= now) {
    await expireLockedLeaseAndUpdateBucket(tx, lease, now);
    return false;
  }
  const claimed = await tx.aiRequestLease.updateMany({
    where: { id: lease.id, status: "RESERVED" },
    data: { status: "CANCELLED", settledAt: now },
  });
  if (claimed.count !== 1) return false;
  await tx.aiUsageBucket.update({
    where: { id: lease.bucketId },
    data: {
      reservedRequests: { decrement: lease.reservedRequests },
      reservedTokens: { decrement: lease.reservedTokens },
      reservedCostMicros: { decrement: lease.reservedCostMicros },
    },
  });
  return true;
}

export async function cancelReservedExternalLeasesWithDependencies(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  dependencies: AiQuotaDependencies,
) {
  const leases = await tx.aiRequestLease.findMany({
    where: { workspaceId, externalProvider: true, status: "RESERVED" },
    orderBy: [{ bucketId: "asc" }, { id: "asc" }],
  });
  for (const lease of leases) {
    await cancelReservedLeaseUnderLock(tx, lease, dependencies.clock);
  }
}

export function cancelReservedExternalLeases(
  tx: Prisma.TransactionClient,
  workspaceId: string,
) {
  return cancelReservedExternalLeasesWithDependencies(
    tx,
    workspaceId,
    productionAiQuotaDependencies,
  );
}

export async function cancelAiRequestWithDependencies(input: {
  leaseId: string;
  expectedActorId: string;
}, dependencies: AiQuotaDependencies) {
  const identity = await prisma.aiRequestLease.findUnique({
    where: { id: input.leaseId },
    select: { workspaceId: true, actorId: true, bucketId: true },
  });
  if (!identity || identity.actorId !== input.expectedActorId) return false;
  return withSerializableRetry(() => prisma.$transaction(async (tx) => {
    await lockWorkspaceAiTransaction(tx, identity.workspaceId);
    const cancelled = await cancelReservedLeaseUnderLock(tx, {
      id: input.leaseId,
      workspaceId: identity.workspaceId,
      bucketId: identity.bucketId,
    }, dependencies.clock);
    if (!cancelled) return false;
    const lease = await tx.aiRequestLease.findUniqueOrThrow({ where: { id: input.leaseId } });
    return lease.actorId === input.expectedActorId;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

export function cancelAiRequest(input: {
  leaseId: string;
  expectedActorId: string;
}) {
  return cancelAiRequestWithDependencies(input, productionAiQuotaDependencies);
}

export async function reconcileExpiredAiLeasesWithDependencies(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  dependencies: AiQuotaDependencies,
) {
  // Candidate reads are hints only. Do not filter with a pre-lock timestamp.
  const leases = await tx.aiRequestLease.findMany({
    where: {
      workspaceId,
      status: { in: ["RESERVED", "CALLING"] },
    },
    orderBy: [{ bucketId: "asc" }, { id: "asc" }],
  });
  for (const hint of leases) {
    const buckets = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AiUsageBucket"
      WHERE "id" = ${hint.bucketId} AND "workspaceId" = ${hint.workspaceId} FOR UPDATE
    `);
    if (buckets.length !== 1) continue;
    const lockedLeases = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AiRequestLease" WHERE "id" = ${hint.id} FOR UPDATE
    `);
    if (lockedLeases.length !== 1) continue;
    const lease = await tx.aiRequestLease.findUnique({ where: { id: hint.id } });
    if (!lease || !["RESERVED", "CALLING"].includes(lease.status)) continue;
    const now = await dependencies.clock.now(tx); // post-lock DB time in production
    if (lease.expiresAt > now) continue;
    await expireLockedLeaseAndUpdateBucket(tx, lease, now);
  }
}

export function reconcileExpiredAiLeases(
  tx: Prisma.TransactionClient,
  workspaceId: string,
) {
  return reconcileExpiredAiLeasesWithDependencies(
    tx,
    workspaceId,
    productionAiQuotaDependencies,
  );
}

async function resolveLeaseAuthorityForUpdate(
  tx: Prisma.TransactionClient,
  hint: {
    workspaceId: string;
    actorId: string;
    operation: string;
    documentIndexerCapabilityGeneration: number | null;
    documentIndexerCapabilitySha256: string | null;
  },
): Promise<{ role: WorkspaceRole }> {
  if (hint.actorId === DOCUMENT_INDEXER_ACTOR_ID) {
    if (
      hint.operation !== "document_indexing" ||
      hint.documentIndexerCapabilityGeneration === null ||
      hint.documentIndexerCapabilitySha256 === null
    ) throw new Error("AI_SYSTEM_ACTOR_FORBIDDEN");
    const capability = await verifyCurrentDocumentIndexerCapability(tx, {
      workspaceId: hint.workspaceId,
      expectedBinding: {
        generation: hint.documentIndexerCapabilityGeneration,
        sha256: hint.documentIndexerCapabilitySha256,
      },
    });
    assertIssuedDocumentIndexerCapability(capability);
    return { role: capability.effectiveRole };
  }
  if (
    hint.documentIndexerCapabilityGeneration !== null ||
    hint.documentIndexerCapabilitySha256 !== null
  ) {
    throw new Error("AI_SYSTEM_ACTOR_FORBIDDEN");
  }
  return resolveActiveWorkspaceForActorForUpdate(tx, {
    workspaceId: hint.workspaceId,
    actorId: hint.actorId,
    access: "read",
  });
}

export async function beginAiProviderCallWithDependencies(input: {
  leaseId: string;
  payload: CanonicalProviderPayload;
}, dependencies: AiQuotaDependencies) {
  const hint = await prisma.aiRequestLease.findUniqueOrThrow({
    where: { id: input.leaseId },
    select: {
      workspaceId: true,
      actorId: true,
      operation: true,
      catalogId: true,
      bucketId: true,
      documentIndexerCapabilityGeneration: true,
      documentIndexerCapabilitySha256: true,
      canonicalPayloadSha256: true,
    },
  });
  const outcome = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    await lockWorkspaceAiTransaction(tx, hint.workspaceId);

    // Admission lock order: membership/system authority -> policy -> optional CHAT
    // model row -> canonical source revisions -> bucket -> lease.
    const authority = await resolveLeaseAuthorityForUpdate(tx, hint);
    await tx.$queryRaw(Prisma.sql`
      SELECT "workspaceId" FROM "WorkspaceAiPolicy"
      WHERE "workspaceId" = ${hint.workspaceId} FOR UPDATE
    `);
    const policy = await tx.workspaceAiPolicy.findUniqueOrThrow({
      where: { workspaceId: hint.workspaceId },
    });
    const purpose = purposeForOperation(hint.operation as AiOperation);
    const catalog = purpose === "CHAT"
      ? await (async () => {
          await tx.$queryRaw(Prisma.sql`
            SELECT "id" FROM "WorkspaceAiModelPolicy"
            WHERE "workspaceId" = ${hint.workspaceId} AND "catalogId" = ${hint.catalogId}
            FOR UPDATE
          `);
          const model = await tx.workspaceAiModelPolicy.findUniqueOrThrow({
            where: {
              workspaceId_catalogId: {
                workspaceId: hint.workspaceId,
                catalogId: hint.catalogId,
              },
            },
          });
          const chat = requireExactWorkspaceChatModelPolicy(model);
          if (!roleMeetsMinimum(authority.role, model.minimumRole)) {
            throw new Error("AI_POLICY_CHANGED_BEFORE_CALL");
          }
          return chat;
        })()
      : requireCurrentEmbeddingCatalogEntry();
    if (catalog.catalogId !== hint.catalogId) {
      throw new Error("AI_POLICY_CHANGED_BEFORE_CALL");
    }
    // Transaction-time payload validation is pure with respect to process-local
    // one-shot state so a P2034 retry starts from an unpoisoned payload.
    await validateCanonicalProviderPayloadForBegin(tx, {
      payload: input.payload,
      workspaceId: hint.workspaceId,
      actorId: hint.actorId,
      operation: hint.operation as AiOperation,
      expectedSha256: hint.canonicalPayloadSha256,
    });

    const buckets = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AiUsageBucket"
      WHERE "id" = ${hint.bucketId} AND "workspaceId" = ${hint.workspaceId} FOR UPDATE
    `);
    const leases = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AiRequestLease" WHERE "id" = ${input.leaseId} FOR UPDATE
    `);
    if (buckets.length !== 1 || leases.length !== 1) {
      throw new Error("AI_LEASE_BINDING_INVALID");
    }
    const lease = await tx.aiRequestLease.findUniqueOrThrow({ where: { id: input.leaseId } });
    // Bounded root-installed descriptor read only: no DNS, socket, redirect, or
    // provider I/O. Read it while target rows remain locked, then sample DB time.
    const runtime = await requireVerifiedProviderRuntimeDescriptor(catalog, { maxBytes: 16_384 });
    const now = await dependencies.clock.now(tx); // never sampled before the bucket/lease lock wait
    if (
      lease.status !== "RESERVED" ||
      lease.workspaceId !== hint.workspaceId || lease.actorId !== hint.actorId ||
      lease.operation !== hint.operation || lease.catalogId !== hint.catalogId ||
      lease.bucketId !== hint.bucketId ||
      lease.documentIndexerCapabilityGeneration !== hint.documentIndexerCapabilityGeneration ||
      lease.documentIndexerCapabilitySha256 !== hint.documentIndexerCapabilitySha256 ||
      lease.canonicalPayloadSha256 !== hint.canonicalPayloadSha256 ||
      catalog.external !== lease.externalProvider
    ) throw new Error("AI_POLICY_CHANGED_BEFORE_CALL");
    if (lease.expiresAt <= now) {
      await expireLockedLeaseAndUpdateBucket(tx, lease, now);
      return { kind: "expired" as const };
    }
    if (
      policy.policyVersion !== lease.policyVersion ||
      (catalog.external && !policy.externalProvidersEnabled)
    ) throw new Error("AI_POLICY_CHANGED_BEFORE_CALL");

    const claimed = await tx.aiRequestLease.updateMany({
      where: { id: lease.id, status: "RESERVED", policyVersion: policy.policyVersion },
      data: { status: "CALLING" },
    });
    if (claimed.count !== 1) throw new Error("AI_LEASE_BEGIN_RACE");
    return {
      kind: "callable" as const,
      callable: {
        runtime,
        operation: lease.operation,
        catalogId: lease.catalogId,
        canonicalPayloadSha256: lease.canonicalPayloadSha256,
        requestTimeoutMs: policy.requestTimeoutMs,
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  if (outcome.kind === "expired") throw new Error("AI_LEASE_EXPIRED");
  const callable = outcome.callable;
  // Mark begun only after the SERIALIZABLE transaction committed. If this fails,
  // no provider I/O occurs and the CALLING lease expires with conservative charge.
  markCanonicalProviderPayloadBegun(input.payload, {
    leaseId: input.leaseId,
    expectedSha256: callable.canonicalPayloadSha256,
  });
  return callable;
}

export function beginAiProviderCall(input: {
  leaseId: string;
  payload: CanonicalProviderPayload;
}) {
  return beginAiProviderCallWithDependencies(input, productionAiQuotaDependencies);
}
```

`tests/setup/ai-quota-dependencies.ts` exposes
`createAiQuotaTestHarness({ clock })` only under Vitest. That harness closes over the
same internal dependency object and returns wrappers for reserve, begin, cancel,
reconcile, opt-out cancellation, indexing, and settlement. Production exports accept
business input only; source tests reject `clock`/`now` keys and imports of the harness
outside tests.

`tests/rag/lease-control.test.ts` uses a real database and covers every state edge,
counter delta, duplicate worker, the canonical bucket-before-lease row-lock order, and
the exact opt-out/connect serial order. It must
also prove that disabling the model row, drifting provider/model, deleting membership,
ADMIN→VIEWER downgrade, stale `policyVersion`, expired lease, missing bounded runtime
descriptor, or using the system principal for a non-index operation prevents
`RESERVED→CALLING`. A descriptor failure is followed by public `cancelAiRequest()` and
immediately releases all reserved counters. The document-indexer success case verifies
the root-installed `document-indexer-v1` service capability and active workspace, then
still applies policy, the exact `CURRENT_EMBEDDING_INDEX` catalog binding, opt-in,
canonical payload, quota, and lease checks; it never reads a chat model-policy row.
Inject one `P2034` after payload/source validation and prove the retry commits and the
same payload invokes exactly once. Also fail descriptor validation and lease re-read
after payload validation, then prove the payload was never marked begun, can be used by
a later valid begin of the same still-RESERVED lease when source/policy remain current,
and produced zero provider I/O before that successful commit.
Add real PostgreSQL wait-past-expiry cases for begin, public cancel, manager opt-out
cancel, and reconciliation: connection A locks the exact bucket then lease while still
before `expiresAt`; connection B enters the operation and blocks; A holds the rows past
the database expiry and commits; B must read `clock_timestamp()` only after acquiring
both rows and commit `EXPIRED` (RESERVED zero charge, CALLING full charge), never
`CALLING` or `CANCELLED`. A clock-spy/source-order test fails if `now(tx)` is called
before both lock queries. Repeat with two waiters to prove exactly one transition and
counter delta.

All settings/model administration functions share `mutateWorkspaceAiPolicyForUpdate()`:
after the workspace advisory lock and current-manager check it locks the policy row,
applies the bounded policy/model mutation, and increments `policyVersion` exactly once.
`provider-policy.test.ts` source-scans production code so direct
`workspaceAiPolicy.update`/`workspaceAiModelPolicy.create|update|delete` calls exist only
inside this seam, the migration, and explicit test fixtures. Concurrent chat tests
cover a quota reduction and model disable between reserve and begin; both prevent the
call. Embedding/index tests instead prove an index/catalog identity drift or payload
binding drift prevents the call without changing `CURRENT_EMBEDDING_INDEX`.

`lib/rag/policy-provisioning.ts` exports
`provisionWorkspaceAiPolicyForCreate(tx, workspaceId, context)`. The context is branded
`WORKSPACE_CREATE` only by the canonical workspace-creation transaction after the
workspace row exists. It inserts the fail-closed policy and exact local default model;
failure rolls back workspace creation. `lib/workspaces/management-service.ts`,
`lib/auth/provisioning.ts` (including `workspace.upsert`), and `prisma/seed.ts`
(including seed upserts) call the same helper inside their transaction before returning
a workspace. The exported guarded
`mutateWorkspaceAiPolicyForUpdate()` is the only policy, quota, timeout, consent, or
model mutation API and requires one of the three branded contexts above.
`tests/rag/provider-policy-source-inventory.test.ts` enumerates every production
workspace create/upsert/seed and AI-policy/model write callsite, rejects an unprovisioned workspace,
rejects direct Prisma/raw writes outside provisioning/mutation modules, and proves
create, manager mutation, and restore paths use the correct brand and version bump.
The module-private real `Symbol` plus `WeakSet` is the runtime authority: the mutation
seam verifies membership in that set, exact workspace and authority, then deletes the
entry before its first write. The source inventory permits the exported create issuer
only in `policy-provisioning.ts`. Structural casts, object copies, cross-workspace
contexts, and retry/reuse without fresh authorization are rejected.

`resolveEffectiveAiModel()` performs a bounded local availability check against the
root-installed descriptor and strict credential-file slot. The transaction-local
`requireVerifiedProviderRuntimeDescriptor()` reads at most 16 KiB and performs no DNS,
socket, redirect, or provider I/O. After `CALLING` commits, the provider connector uses
that opaque descriptor to call `resolveExactProviderEndpoint(entry.endpointId)`, re-check
all A/AAAA answers, pin the accepted address, and open the strict secret file immediately
before connect. Production code never accepts a caller URL, direct key variable,
arbitrary compatible provider, proxy, redirect, or fallback, and no runtime object or
secret reaches a page/client. Issue 14 calls
`scrubExternalProvidersForRestore()` inside isolated restore finalization before
service access.

- [ ] **Step 4: Replace client provider/model fields with opaque selection ids**

In page DTOs pass `aiModelOptions` and the default `selectionId`. In both AI clients, send:

```ts
body: JSON.stringify({
  question,
  aiModelSelectionId: selectedAiModelSelectionId || undefined,
  uiLanguage,
})
```

and for Workspace AI:

```ts
body: JSON.stringify({
  message,
  selectedDocumentId,
  aiModelSelectionId: selectedAiModelSelectionId || undefined,
  uiLanguage,
})
```

Replace `client-model-settings.ts` with an opaque-id helper:

```ts
export function resolveStoredAiSelection(
  stored: string | null,
  options: readonly AiModelOptionDto[],
  defaultSelectionId: string | null,
) {
  return options.some(({ selectionId }) => selectionId === stored)
    ? stored!
    : defaultSelectionId && options.some(({ selectionId }) => selectionId === defaultSelectionId)
      ? defaultSelectionId
      : options[0]?.selectionId ?? "";
}
```

Add the server action:

```ts
export async function updateExternalProviderOptInAction(
  workspaceSlug: string,
  enabled: boolean,
) {
  const user = await requireCurrentUser();
  const result = await updateWorkspaceExternalProviderOptIn({
    workspaceSlug,
    actorId: user.id,
    enabled,
    rootOperationId: randomUUID(),
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  return result;
}
```

The settings component receives `{ aiModelOptions, selectedAiModelSelectionId, externalProvidersEnabled, canManageExternalProviders }`. Render only catalog labels/opaque values and this controlled checkbox:

```tsx
<select value={selectedAiModelSelectionId} onChange={(event) => onAiModelSelectionChange(event.target.value)}>
  {aiModelOptions.map((option) => (
    <option key={option.selectionId} value={option.selectionId}>{option.label}</option>
  ))}
</select>
<input
  type="checkbox"
  aria-label="Allow external AI providers"
  checked={externalProvidersEnabled}
  disabled={!canManageExternalProviders || pending}
  onChange={(event) => startTransition(() => updateExternalProviderOptInAction(
    workspaceSlug,
    event.currentTarget.checked,
  ))}
/>
```

Delete arbitrary provider/model text inputs and their local-storage keys. Tests assert every option value is a returned selection id, stale stored ids fall back, non-managers cannot toggle, opt-out calls the journaled action, and request bodies contain no `chatProvider`, `chatModel`, key, or base URL.

Create `leaf10JournalReplayReducers` with exactly
`AI_EXTERNAL_PROVIDER_DISABLED`. Under Leaf 2's branded restore context, it locks the
workspace target if present and idempotently forces every external-provider opt-in
false. It never enables a provider, changes model choice to an external provider,
appends, or mutates journal/checkpoint state. Its RED test covers exact map membership,
subject/payload validation, idempotence, missing target, and no-append source contract.

Implement the initial restore scrub and replay reducer in
`lib/rag/provider-journal-replay.ts`; this module does not import the production append
function, manager permission helpers, journal/checkpoint models, or the manager
entrypoint:

```ts
import { Prisma } from "@prisma/client";
import {
  assertVerifiedJournalReplayContext,
  type SecurityJournalReplayReducer,
  type VerifiedJournalReplayContext,
} from "@/lib/security/journal";
import {
  issueRestorePolicyMutationContextForReplay,
  mutateWorkspaceAiPolicyForUpdate,
} from "@/lib/rag/provider-policy";
import {
  cancelReservedExternalLeases,
  lockWorkspaceAiTransaction,
} from "@/lib/rag/lease-control";

function assertExactAiExternalProviderDisabledEvent(event: unknown): asserts event is {
  kind: "AI_EXTERNAL_PROVIDER_DISABLED";
  subjectType: "WORKSPACE";
  subjectId: string;
  payload: { stateCode: "AI_EXTERNAL_PROVIDER_DISABLED"; stateVersion: 1 };
} {
  if (!isPlainRecord(event) || !hasExactKeys(event, [
    "kind", "subjectType", "subjectId", "payload",
  ])) throw new Error("AI_RESTORE_EVENT_INVALID");
  if (
    event.kind !== "AI_EXTERNAL_PROVIDER_DISABLED" ||
    event.subjectType !== "WORKSPACE" ||
    !isCanonicalBoundedId(event.subjectId)
  ) throw new Error("AI_RESTORE_EVENT_INVALID");
  if (!isPlainRecord(event.payload) || !hasExactKeys(event.payload, [
    "stateCode", "stateVersion",
  ])) throw new Error("AI_RESTORE_EVENT_INVALID");
  if (
    event.payload.stateCode !== "AI_EXTERNAL_PROVIDER_DISABLED" ||
    event.payload.stateVersion !== 1
  ) throw new Error("AI_RESTORE_EVENT_INVALID");
}

async function scrubOneWorkspaceForRestore(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  context: VerifiedJournalReplayContext,
) {
  assertVerifiedJournalReplayContext(context);
  await lockWorkspaceAiTransaction(tx, workspaceId);
  await tx.$queryRaw(Prisma.sql`
    SELECT "workspaceId" FROM "WorkspaceAiPolicy"
    WHERE "workspaceId" = ${workspaceId} FOR UPDATE
  `);
  const policy = await tx.workspaceAiPolicy.findUnique({ where: { workspaceId } });
  if (!policy || !policy.externalProvidersEnabled) return false;
  await mutateWorkspaceAiPolicyForUpdate(tx, {
    context: issueRestorePolicyMutationContextForReplay(workspaceId, context),
    workspaceId,
    policyPatch: { externalProvidersEnabled: false },
  });
  await cancelReservedExternalLeases(tx, workspaceId);
  return true;
}

export async function scrubExternalProvidersForRestore(
  tx: Prisma.TransactionClient,
  context: VerifiedJournalReplayContext,
) {
  assertVerifiedJournalReplayContext(context);
  const rows = await tx.workspaceAiPolicy.findMany({
    where: { externalProvidersEnabled: true },
    select: { workspaceId: true },
    orderBy: { workspaceId: "asc" },
  });
  let disabled = 0;
  for (const row of rows) {
    if (await scrubOneWorkspaceForRestore(tx, row.workspaceId, context)) disabled += 1;
  }
  return disabled;
}

const replayExternalProviderDisabled: SecurityJournalReplayReducer<
  "AI_EXTERNAL_PROVIDER_DISABLED"
> = async (tx, event, context) => {
  assertExactAiExternalProviderDisabledEvent(event);
  await scrubOneWorkspaceForRestore(tx, event.subjectId, context);
};

export const leaf10JournalReplayReducers = Object.freeze({
  AI_EXTERNAL_PROVIDER_DISABLED: replayExternalProviderDisabled,
});
```

`tests/rag/provider-journal-replay.test.ts` invokes the all-workspace scrub and exact
event reducer with a real runtime-issued `VerifiedJournalReplayContext`, proves a
VIEWER/no-member restore needs no actor authorization, verifies policy version and
reserved counters change atomically, and snapshots production journal rows, chain
state, export checkpoint, and restore checkpoint before/after. Production journal/
chain/export state and both checkpoints remain byte-identical; only the caller-owned
restore dispatcher may advance its restore checkpoint outside this reducer. A forged
context fails before any write. A source contract rejects imports/calls containing
`appendSecurityJournalEvent`, `deriveSecurityJournalOperationId`, journal/checkpoint
Prisma models, or `updateWorkspaceExternalProviderOptIn`. The normal manager test
proves `updateWorkspaceExternalProviderOptIn(... enabled: false)` remains the only path
that appends `AI_EXTERNAL_PROVIDER_DISABLED`.
The validator matrix rejects missing/extra keys, wrong kind/subject type, empty,
oversized, control-bearing or noncanonical workspace ids, payload substitutions,
numeric/string version coercion, prototypes, arrays, and inherited properties. Snapshot
the production journal/chain/checkpoint tables and source-scan the reducer's complete
transitive import graph: restore must make the opt-out mutation and reserved-lease
cancellation with zero journal append or checkpoint write.

- [ ] **Step 5: Run policy/UI tests to verify green**

Run:

```bash
pnpm exec vitest run tests/rag/provider-policy.test.ts tests/rag/provider-catalog.test.ts tests/rag/provider-policy-source-inventory.test.ts tests/rag/lease-control.test.ts tests/rag/document-indexer-authority.test.ts tests/security/ai-provider-generation-publisher.test.ts tests/security/ai-provider-generation-install.test.ts tests/rag/provider-journal-replay.test.ts tests/rag/provider-runtime.test.ts tests/rag/provider-endpoints.test.ts tests/rag/provider-egress.test.ts tests/workspaces/management-service.test.ts tests/auth/provisioning.test.ts tests/auth/provisioning-current-user.test.ts tests/prisma/seed-ai-policy.test.ts tests/docker/ai-provider-overlays.test.ts tests/rag/client-model-settings.test.ts tests/components/workspace-settings-panel.test.tsx tests/components/ai-assistant-panel.test.tsx tests/components/workspace-chatbot.test.tsx tests/workspace-actions.test.ts tests/i18n/messages.test.ts --reporter=dot
```

Expected: PASS; request payload snapshots contain `aiModelSelectionId` and no `chatProvider`, `chatModel`, API key, or base URL.

- [ ] **Step 6: Commit server-owned selection**

```bash
git add lib/rag/provider-catalog.ts lib/rag/provider-policy.ts lib/rag/lease-control.ts lib/rag/document-indexer-authority.ts lib/rag/policy-provisioning.ts lib/rag/provider-journal-replay.ts lib/rag/provider-runtime.ts lib/rag/provider-endpoints.ts lib/rag/secret-file.ts lib/workspaces/management-service.ts lib/auth/provisioning.ts prisma/seed.ts deploy/ai/provider-runtime-v1.json deploy/ai/provider-endpoints-v1.json deploy/ai/provider-generation-policy-v1.json deploy/ai/document-indexer/descriptor.v1.json deploy/ai/attested-root-bundle/manifest.json deploy/ai/attested-root-bundle/dispatcher-operation.json deploy/ai/attested-root-bundle/munjib-ai-provider-install deploy/ai/attested-root-bundle/munjib-document-indexer-install scripts/security/publish-ai-provider-generation.ts docker-compose.ai-ollama.yml docker-compose.ai-openai.yml docker-compose.ai-openrouter.yml docker-compose.ai-langfuse.yml tests/setup/provider-runtime.ts tests/rag/provider-policy.test.ts tests/rag/provider-catalog.test.ts tests/rag/provider-policy-source-inventory.test.ts tests/rag/lease-control.test.ts tests/rag/document-indexer-authority.test.ts tests/security/ai-provider-generation-publisher.test.ts tests/security/ai-provider-generation-install.test.ts tests/rag/provider-journal-replay.test.ts tests/rag/provider-runtime.test.ts tests/rag/provider-endpoints.test.ts tests/rag/provider-egress.test.ts tests/workspaces/management-service.test.ts tests/auth/provisioning.test.ts tests/auth/provisioning-current-user.test.ts tests/prisma/seed-ai-policy.test.ts tests/docker/ai-provider-overlays.test.ts app/workspaces/\[workspaceSlug\]/page.tsx app/workspaces/\[workspaceSlug\]/actions.ts components/workspace-settings-panel.tsx components/document-editor/ai-assistant-panel.tsx components/workspace-chatbot.tsx lib/rag/client-model-settings.ts lib/i18n/messages.ts tests/rag/client-model-settings.test.ts tests/components/workspace-settings-panel.test.tsx tests/components/ai-assistant-panel.test.tsx tests/components/workspace-chatbot.test.tsx tests/workspace-actions.test.ts tests/i18n/messages.test.ts wiki/RAG\ Process\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: enforce workspace AI model policy"
```

Expected: commit succeeds without provider secrets or arbitrary model strings from a user fixture.

### Task 3: Bounded JSON, Transactional Quotas, Leases, and Timeout

**Files:**
- Create: `lib/http/bounded-json.ts`
- Modify: `lib/rag/canonical-provider-payload.ts`
- Create: `lib/rag/quota.ts`
- Modify: `lib/rag/answer-chain.ts`
- Modify: `lib/rag/ask.ts`
- Modify: `lib/rag/workspace-chat.ts`
- Modify: `lib/rag/embedding-client.ts`, `lib/rag/index-document.ts`, `lib/rag/vector-store.ts`
- Modify: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`
- Modify: `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`
- Create: `tests/http/bounded-json.test.ts`
- Create: `tests/rag/quota.test.ts`
- Create: `tests/rag/canonical-provider-payload.test.ts`
- Create: `tests/rag/embedding-index-quota.test.ts`
- Modify: `tests/setup/prisma.ts`
- Modify: `tests/rag/answer-chain.test.ts`, `tests/rag/ask.test.ts`, `tests/rag/workspace-chat.test.ts`, route tests

**Interfaces:**
- Consumes: Task 2 purpose-separated exact catalog/model resolver, Leaf 5's exact workspace lock API and document ACL lookup, bounded runtime descriptor, database clock, workspace lock, cancellation/expiry, and payload-bound `beginAiProviderCall()`.
- Produces: `readBoundedJsonObject()`, runtime-issued `CanonicalProviderPayload`, current-policy `reserveAiRequest()`, fixed-capability `reserveDocumentIndexingRequest()`, DB-time `settleAiRequest()`, re-exported `beginAiProviderCall()`/`cancelAiRequest()`, quota-bound `query_embedding|document_indexing|ask_document|workspace_chat` operations, Leaf 9 `CompleteBoundedAiResult` integration, and route error payload `{ error, scope }` with optional `Retry-After`.

- [ ] **Step 1: Write failing boundary/quota tests**

Create `tests/http/bounded-json.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { readBoundedJsonObject } from "@/lib/http/bounded-json";

function chunkedRequest(chunks: Uint8Array[], onCancel: () => void) {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() { onCancel(); },
  });
  return new Request("http://test.local/api", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("readBoundedJsonObject", () => {
  it("parses a bounded object", async () => {
    const request = new Request("http://test.local/api", {
      method: "POST",
      body: JSON.stringify({ message: "ok" }),
    });
    await expect(readBoundedJsonObject(request, 32_768)).resolves.toEqual({ message: "ok" });
  });

  it("cancels chunked input immediately after maxBytes and never parses it", async () => {
    const cancelled = vi.fn();
    const parse = vi.spyOn(JSON, "parse");
    const request = chunkedRequest([
      new Uint8Array(16_384).fill(0x7b),
      new Uint8Array(16_384).fill(0x20),
      new Uint8Array(1).fill(0x7d),
      new Uint8Array(16_384).fill(0x41),
    ], cancelled);
    expect(request.headers.get("content-length")).toBeNull();
    await expect(readBoundedJsonObject(request, 32_768)).rejects.toThrow("REQUEST_BODY_TOO_LARGE");
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it("cancels a declared oversized body without reading or parsing", async () => {
    const request = new Request("http://test.local/api", {
      method: "POST",
      headers: { "content-length": "32769" },
      body: new Uint8Array([0x7b, 0x7d]),
    });
    const cancel = vi.spyOn(request.body!, "cancel");
    const parse = vi.spyOn(JSON, "parse");
    await expect(readBoundedJsonObject(request, 32_768)).rejects.toThrow("REQUEST_BODY_TOO_LARGE");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it("rejects malformed or non-object bounded JSON", async () => {
    for (const body of ["{", "[]", "null"]) {
      const request = new Request("http://test.local/api", { method: "POST", body });
      await expect(readBoundedJsonObject(request, 32_768)).rejects.toThrow("INVALID_JSON");
    }
  });
});
```

Create `tests/rag/canonical-provider-payload.test.ts` and
`tests/rag/quota.test.ts` with a real DB, this harness, and every case below. The
canonical-payload suite must prove all of these before quota code exists:

- a one-character Ask question plus a large authorized document/retrieval context and
  system prompt reserves the entire exact provider body plus `maxOutputTokens`;
- Workspace AI includes the deterministic saved conversation history, selected source,
  authorized retrieved chunks, new message, system prompt, model, and output limit;
- Ask/workspace payload construction uses only rows that pass the owned revision lock
  and Leaf 5 `getDocumentAccessForActor()` result; archived, stale-revision, inaccessible,
  reordered, or post-lock changed sources fail closed;
- query embedding encodes exactly the normalized query once, while document indexing
  encodes the exact deterministic chunker output for the locked source revision;
- the payload hash covers every provider-bound byte. Omitting/reordering history or a
  chunk, changing whitespace/model/dimensions/output limit, rebuilding after reserve,
  forging/copying a branded object, or invoking one payload twice fails before I/O;
- a provider mock reports its actual input token count and asserts
  `reservedTokens >= actualInputTokens + exactOutputAllowance` for every catalog entry.
  No caller-provided token count, estimated prompt, or preassembled messages parameter
  exists in the public reservation API.
- Ask, Workspace AI, and query-embedding input enforce the locked
  `maxMessageChars` by Unicode scalar value before retrieval, normalization,
  tokenization, or encoding. Exactly-at-cap astral input passes; cap-plus-one,
  lone high/low surrogate, and malformed pair input fails with zero retrieval,
  provider, lease, or counter activity. Combining sequences count by scalar rather than
  grapheme and UTF-16 code-unit length is never used as the policy decision.

Then create `tests/rag/quota.test.ts` with this harness and every case below:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { AiQuotaExceededError } from "@/lib/rag/quota";
import { createAiQuotaTestHarness } from "../setup/ai-quota-dependencies";
import { installProviderRuntimeFixture } from "../setup/provider-runtime";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

const FIXED_NOW = new Date("2026-07-11T12:00:00.000Z");
const fixedQuotaClock = (now: Date) => ({ now: async () => now });
const quotaAt = (now: Date) => createAiQuotaTestHarness({
  clock: fixedQuotaClock(now),
});
const {
  beginAiProviderCall,
  cancelAiRequest,
  reconcileExpiredAiLeasesForWorkspace,
  reserveAiRequest,
  settleAiRequest,
} = quotaAt(FIXED_NOW);
const payloadByLease = new Map<
  string,
  Awaited<ReturnType<typeof reserveAiRequest>>["payload"]
>();

describe("AI quota reservation", () => {
  beforeEach(async () => {
    payloadByLease.clear();
    await resetTestData();
    await installProviderRuntimeFixture({ overlayId: "ollama-internal-v1" });
    await installProviderRuntimeFixture({ overlayId: "openai-official-v1", secretFile: "synthetic" });
  });

  async function fixtureInput(
    options: {
      external?: boolean;
      role?: WorkspaceRole;
      policy?: Partial<{
        maxConcurrentRequests: number;
        maxOutputTokens: number;
        dailyRequestLimit: number;
        dailyTokenLimit: bigint;
        dailyCostLimitMicros: bigint;
        requestTimeoutMs: number;
      }>;
      source?: Parameters<typeof reserveAiRequest>[0]["source"];
    } = {},
  ) {
    const external = options.external ?? false;
    const fixture = await seedWorkspaceFixture(options.role ?? (external ? WorkspaceRole.ADMIN : WorkspaceRole.EDITOR));
    const catalogId = external
      ? "external.openai.gpt-5-4-mini"
      : "local.ollama.gemma4-e4b";
    const policyValues = {
      policyVersion: 1,
      maxConcurrentRequests: options.policy?.maxConcurrentRequests ?? 2,
      maxOutputTokens: options.policy?.maxOutputTokens ?? 2,
      dailyRequestLimit: options.policy?.dailyRequestLimit ?? 100,
      dailyTokenLimit: options.policy?.dailyTokenLimit ?? 1_000_000n,
      dailyCostLimitMicros: options.policy?.dailyCostLimitMicros ?? 1_000_000_000_000n,
      requestTimeoutMs: options.policy?.requestTimeoutMs ?? 30_000,
    };
    await prisma.workspaceAiPolicy.create({
      data: {
        workspaceId: fixture.workspace.id,
        externalProvidersEnabled: external,
        ...policyValues,
        models: {
          create: {
            catalogId,
            provider: external ? "openai" : "ollama",
            model: external ? "gpt-5.4-mini" : "gemma4:e4b",
            minimumRole: external ? "ADMIN" : "VIEWER",
            enabled: true,
            isDefault: true,
          },
        },
      },
    });
    return {
      fixture,
      input: {
        workspaceId: fixture.workspace.id,
        actorId: fixture.user.id,
        catalogId,
        source: options.source ?? {
          kind: "workspace_chat" as const,
          rawMessage: "quota fixture message",
        },
      },
    };
  }

  async function reserve(input: Parameters<typeof reserveAiRequest>[0]) {
    const reservation = await reserveAiRequest(input);
    payloadByLease.set(reservation.leaseId, reservation.payload);
    return reservation;
  }

  async function begin(leaseId: string) {
    const payload = payloadByLease.get(leaseId);
    if (!payload) throw new Error("test reservation payload missing");
    return beginAiProviderCall({
      leaseId,
      payload,
    });
  }

  async function beginAndSettle(leaseId: string, inputTokens: number, outputTokens: number) {
    await begin(leaseId);
    return settleAiRequest({
      leaseId,
      usage: { inputTokens, outputTokens, completedAt: FIXED_NOW.toISOString() },
    });
  }

  it("serializes concurrent reservations so only the configured count succeeds", async () => {
    const { input } = await fixtureInput();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => reserveAiRequest(input)),
    );
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(2);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected).toHaveLength(2);
    expect(rejected.every(({ reason }) =>
      reason instanceof AiQuotaExceededError && reason.scope === "concurrency",
    )).toBe(true);
  });

  it("rejects a reservation that would exceed daily tokens", async () => {
    const { input } = await fixtureInput({
      policy: { dailyTokenLimit: 1_000_000n, maxConcurrentRequests: 10 },
      source: { kind: "workspace_chat", rawMessage: "first" },
    });
    const first = await reserve(input);
    const firstLease = await prisma.aiRequestLease.findUniqueOrThrow({
      where: { id: first.leaseId },
    });
    await prisma.workspaceAiPolicy.update({
      where: { workspaceId: input.workspaceId },
      data: {
        dailyTokenLimit: firstLease.reservedTokens,
        policyVersion: { increment: 1 },
      },
    });
    await expect(reserveAiRequest({
      ...input,
      source: { kind: "workspace_chat", rawMessage: "x" },
    })).rejects.toMatchObject({
      message: "AI_QUOTA_EXCEEDED",
      scope: "daily_tokens",
    });
  });

  it("rejects the next sequential request at the daily request boundary", async () => {
    const { input } = await fixtureInput({
      policy: { dailyRequestLimit: 1, maxConcurrentRequests: 10 },
    });
    const { leaseId } = await reserve(input);
    await beginAndSettle(leaseId, 1, 0);
    await expect(reserveAiRequest(input)).rejects.toMatchObject({
      message: "AI_QUOTA_EXCEEDED",
      scope: "request",
      retryAfterSeconds: 43_200,
    });
  });

  it("serializes request-budget reservations so a race cannot exceed the daily count", async () => {
    const { input } = await fixtureInput({
      policy: { dailyRequestLimit: 1, maxConcurrentRequests: 10 },
    });
    const results = await Promise.allSettled([reserveAiRequest(input), reserveAiRequest(input)]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ message: "AI_QUOTA_EXCEEDED", scope: "request" }),
      }),
    ]);
  });

  it("rejects a reservation that would exceed daily cost", async () => {
    const { input } = await fixtureInput({
      external: true,
      policy: { dailyCostLimitMicros: 1_000_000_000_000n, maxConcurrentRequests: 10 },
    });
    const first = await reserve(input);
    const firstLease = await prisma.aiRequestLease.findUniqueOrThrow({
      where: { id: first.leaseId },
    });
    await prisma.workspaceAiPolicy.update({
      where: { workspaceId: input.workspaceId },
      data: {
        dailyCostLimitMicros: firstLease.reservedCostMicros,
        policyVersion: { increment: 1 },
      },
    });
    await expect(reserveAiRequest(input)).rejects.toMatchObject({
      message: "AI_QUOTA_EXCEEDED",
      scope: "daily_cost",
    });
  });

  it("reconciles actual usage and releases reserved counters", async () => {
    const { input } = await fixtureInput();
    const { leaseId } = await reserve(input);
    await expect(beginAndSettle(leaseId, 3, 1)).resolves.toBe(true);
    await expect(prisma.aiUsageBucket.findFirstOrThrow({
      where: { workspaceId: input.workspaceId },
      select: { reservedRequests: true, usedRequests: true, reservedTokens: true, usedTokens: true, reservedCostMicros: true, usedCostMicros: true },
    })).resolves.toEqual({
      reservedRequests: 0,
      usedRequests: 1,
      reservedTokens: 0n,
      usedTokens: 4n,
      reservedCostMicros: 0n,
      usedCostMicros: 0n,
    });
  });

  it("calculates actual external cost from the immutable catalog", async () => {
    const { input } = await fixtureInput({ external: true });
    const { leaseId } = await reserve(input);
    await beginAndSettle(leaseId, 1, 1);
    await expect(prisma.aiUsageBucket.findFirstOrThrow({
      where: { workspaceId: input.workspaceId },
      select: { usedTokens: true, usedCostMicros: true },
    })).resolves.toEqual({ usedTokens: 2n, usedCostMicros: 10n });
  });

  it("charges the conservative reservation when usage is missing", async () => {
    const { input } = await fixtureInput();
    const { leaseId } = await reserve(input);
    const lease = await prisma.aiRequestLease.findUniqueOrThrow({ where: { id: leaseId } });
    await begin(leaseId);
    await settleAiRequest({ leaseId });
    await expect(prisma.aiUsageBucket.findFirstOrThrow({
      where: { workspaceId: input.workspaceId },
      select: { reservedRequests: true, usedRequests: true, reservedTokens: true, usedTokens: true, usedCostMicros: true },
    })).resolves.toEqual({
      reservedRequests: 0,
      usedRequests: 1,
      reservedTokens: 0n,
      usedTokens: lease.reservedTokens,
      usedCostMicros: lease.reservedCostMicros,
    });
  });

  it("expires an uncalled RESERVED lease with zero charge", async () => {
    const { input } = await fixtureInput({ policy: { requestTimeoutMs: 1_000 } });
    await reserveAiRequest(input);
    await quotaAt(new Date(FIXED_NOW.getTime() + 11_001))
      .reconcileExpiredAiLeasesForWorkspace(input.workspaceId);
    await expect(prisma.aiUsageBucket.findFirstOrThrow({
      where: { workspaceId: input.workspaceId },
      select: { reservedRequests: true, usedRequests: true, reservedTokens: true, usedTokens: true, usedCostMicros: true },
    })).resolves.toEqual({
      reservedRequests: 0,
      usedRequests: 0,
      reservedTokens: 0n,
      usedTokens: 0n,
      usedCostMicros: 0n,
    });
  });

  it("charges an expired CALLING lease once when two workers race", async () => {
    const { input } = await fixtureInput({ policy: { requestTimeoutMs: 1_000 } });
    const { leaseId } = await reserve(input);
    const lease = await prisma.aiRequestLease.findUniqueOrThrow({ where: { id: leaseId } });
    await begin(leaseId);
    const expiredQuota = quotaAt(new Date(FIXED_NOW.getTime() + 11_001));
    await Promise.all([
      expiredQuota.reconcileExpiredAiLeasesForWorkspace(input.workspaceId),
      expiredQuota.reconcileExpiredAiLeasesForWorkspace(input.workspaceId),
    ]);
    await expect(prisma.aiUsageBucket.findFirstOrThrow({
      where: { workspaceId: input.workspaceId },
      select: { reservedRequests: true, usedRequests: true, reservedTokens: true, usedTokens: true },
    })).resolves.toEqual({
      reservedRequests: 0,
      usedRequests: 1,
      reservedTokens: 0n,
      usedTokens: lease.reservedTokens,
    });
  });

  it("does not double-decrement when duplicate settlement calls race", async () => {
    const { input } = await fixtureInput();
    const { leaseId } = await reserve(input);
    await begin(leaseId);
    const usage = { inputTokens: 2, outputTokens: 1, completedAt: FIXED_NOW.toISOString() };
    const results = await Promise.all([
      settleAiRequest({ leaseId, usage }),
      settleAiRequest({ leaseId, usage }),
    ]);
    expect(results.sort()).toEqual([false, true]);
    await expect(prisma.aiUsageBucket.findFirstOrThrow({
      where: { workspaceId: input.workspaceId },
      select: { reservedRequests: true, usedRequests: true, reservedTokens: true, usedTokens: true },
    })).resolves.toEqual({ reservedRequests: 0, usedRequests: 1, reservedTokens: 0n, usedTokens: 3n });
  });

  it("returns retry seconds to the next UTC boundary for daily limits", async () => {
    const { input } = await fixtureInput({
      policy: { dailyTokenLimit: 1_000_000n, maxConcurrentRequests: 10 },
    });
    const first = await reserve(input);
    const firstLease = await prisma.aiRequestLease.findUniqueOrThrow({
      where: { id: first.leaseId },
    });
    await prisma.workspaceAiPolicy.update({
      where: { workspaceId: input.workspaceId },
      data: {
        dailyTokenLimit: firstLease.reservedTokens,
        policyVersion: { increment: 1 },
      },
    });
    try {
      await reserveAiRequest(input);
      throw new Error("expected quota rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(AiQuotaExceededError);
      expect(error).toMatchObject({ scope: "daily_tokens", retryAfterSeconds: 43_200 });
    }
  });

  it("public cancellation releases a pre-connect reservation immediately", async () => {
    const { fixture, input } = await fixtureInput();
    const { leaseId } = await reserve(input);
    await expect(cancelAiRequest({
      leaseId,
      expectedActorId: fixture.user.id,
    })).resolves.toBe(true);
    await expect(prisma.aiUsageBucket.findFirstOrThrow({
      where: { workspaceId: input.workspaceId },
      select: { reservedRequests: true, reservedTokens: true, usedRequests: true },
    })).resolves.toEqual({ reservedRequests: 0, reservedTokens: 0n, usedRequests: 0 });
  });

  it("expires a late CALLING settlement before considering its raw usage", async () => {
    const { input } = await fixtureInput({ policy: { requestTimeoutMs: 1_000 } });
    const { leaseId } = await reserve(input);
    const lease = await prisma.aiRequestLease.findUniqueOrThrow({ where: { id: leaseId } });
    await begin(leaseId);
    await expect(quotaAt(new Date(FIXED_NOW.getTime() + 11_001)).settleAiRequest({
      leaseId,
      usage: { inputTokens: 1, outputTokens: 0, completedAt: FIXED_NOW.toISOString() },
    })).resolves.toBe(false);
    await expect(prisma.aiRequestLease.findUniqueOrThrow({ where: { id: leaseId } }))
      .resolves.toMatchObject({ status: "EXPIRED", chargedTokens: lease.reservedTokens });
  });

  it("uses freshly locked policy limits without caller-supplied policy fields", async () => {
    const { input } = await fixtureInput();
    await prisma.workspaceAiPolicy.update({
      where: { workspaceId: input.workspaceId },
      data: { maxConcurrentRequests: 1, policyVersion: { increment: 1 } },
    });
    await reserveAiRequest(input);
    await expect(reserveAiRequest(input)).rejects.toMatchObject({
      message: "AI_QUOTA_EXCEEDED",
      scope: "concurrency",
    });
  });

  it.each([
    null,
    { kind: "workspace_chat" },
    { kind: "query_embedding", rawQuery: 42 },
    { kind: "document_indexing", documentId: "", sourceUpdatedAt: "" },
  ] as const)("rejects invalid raw reservation sources: %o", async (source) => {
    const { input } = await fixtureInput();
    await expect(reserveAiRequest({
      ...input,
      source: source as Parameters<typeof reserveAiRequest>[0]["source"],
    })).rejects.toThrow("AI_QUOTA_INPUT_INVALID");
    await expect(prisma.aiRequestLease.count({ where: { workspaceId: input.workspaceId } }))
      .resolves.toBe(0);
  });

  it.each([
    { inputTokens: -100, outputTokens: 1, completedAt: FIXED_NOW.toISOString() },
    { inputTokens: 11, outputTokens: 0, completedAt: FIXED_NOW.toISOString() },
    { inputTokens: Number.NaN, outputTokens: 1, completedAt: FIXED_NOW.toISOString() },
    { inputTokens: 1, outputTokens: 0, completedAt: "2026-07-11T11:59:59.000Z" },
    { inputTokens: 1, outputTokens: 0, completedAt: "2026-07-11T12:00:01.000Z" },
  ])("charges exactly the lease reservation for invalid or over-lease settlement: %o", async (usage) => {
    const { input } = await fixtureInput();
    const { leaseId } = await reserve(input);
    const lease = await prisma.aiRequestLease.findUniqueOrThrow({ where: { id: leaseId } });
    await begin(leaseId);
    await settleAiRequest({ leaseId, usage });
    await expect(prisma.aiUsageBucket.findFirstOrThrow({
      where: { workspaceId: input.workspaceId },
      select: { reservedTokens: true, usedTokens: true, reservedCostMicros: true, usedCostMicros: true },
    })).resolves.toEqual({
      reservedTokens: 0n,
      usedTokens: lease.reservedTokens,
      reservedCostMicros: 0n,
      usedCostMicros: lease.reservedCostMicros,
    });
  });
});
```

Update `resetTestData()` in `tests/setup/prisma.ts` to delete `aiRequestLease`, then `aiUsageBucket`, then workspace policy/model rows before deleting workspaces so every quota test begins cleanly.
Define `fixedQuotaClock(date)` only for `createAiQuotaTestHarness({ clock })`. Public
inputs contain no `clock` or `now`. Use the harness consistently for reservation,
begin, cancellation, reconciliation, opt-out, indexing, and settlement. Add a
two-worker skew test whose application clocks differ by 48 hours but whose injected
database clock is identical, and assert both use the same UTC bucket/expiry decision.

- [ ] **Step 2: Run quota/boundary tests to verify red**

Run: `pnpm exec vitest run tests/http/bounded-json.test.ts tests/rag/canonical-provider-payload.test.ts tests/rag/provider-catalog.test.ts tests/rag/quota.test.ts tests/rag/embedding-index-quota.test.ts --reporter=dot`

Expected: FAIL because bounded JSON, quota admission/settlement, and embedding/indexing
integration do not exist; Task 2 lease-control tests remain GREEN.

- [ ] **Step 3: Implement bounded JSON**

Create `lib/http/bounded-json.ts`:

```ts
export async function readBoundedJsonObject(request: Request, maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("INVALID_BODY_LIMIT");
  const lengthHeader = request.headers.get("content-length");
  const length = lengthHeader && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null;
  if (length !== null && (!Number.isSafeInteger(length) || length > maxBytes)) {
    await request.body?.cancel("REQUEST_BODY_TOO_LARGE").catch(() => undefined);
    throw new Error("REQUEST_BODY_TOO_LARGE");
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        if (total + value.byteLength > maxBytes) {
          await reader.cancel("REQUEST_BODY_TOO_LARGE").catch(() => undefined);
          throw new Error("REQUEST_BODY_TOO_LARGE");
        }
        chunks.push(value);
        total += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("INVALID_JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_JSON");
  }
  return value as Record<string, unknown>;
}
```

- [ ] **Step 4: Build and bind the complete canonical provider payload, then implement atomic reservation and settlement**

Extend `lib/rag/canonical-provider-payload.ts`. This module alone owns exact provider
encoding, conservative accounting, SHA binding, and one-shot payload issuance. It does
not own or duplicate source authorization, prompt authority, retrieval/history
selection, memory, or lineage. Leaf 9's `authorized-provider-material.ts` owns those
decisions and returns the only runtime-issued material accepted here:

```ts
import { createHash } from "node:crypto";
import { Prisma, type WorkspaceAiPolicy, type WorkspaceRole } from "@prisma/client";
import {
  assertIssuedAuthorizedProviderMaterial,
  issueAuthorizedProviderMaterialForReservation,
  revalidateAuthorizedProviderMaterialForBegin,
  type AuthorizedProviderMaterial,
  type AuthorizedProviderMaterialBinding,
} from "@/lib/rag/authorized-provider-material";
import {
  type AiCatalogEntry,
  type AiOperation,
} from "@/lib/rag/provider-catalog";

const canonicalProviderPayloadBrand: unique symbol = Symbol("CanonicalProviderPayload");
const issuedPayloads = new WeakSet<object>();
const begunPayloads = new WeakMap<object, Readonly<{ leaseId: string; sha256: string }>>();
const payloadBindings = new WeakMap<object, readonly AuthorizedProviderMaterialBinding[]>();
const payloadMaterials = new WeakMap<object, AuthorizedProviderMaterial>();

export type CanonicalProviderPayload = Readonly<{
  [canonicalProviderPayloadBrand]: true;
  operation: AiOperation;
  purpose: "CHAT" | "EMBEDDING";
  catalogId: string;
  bodyUtf8: string;
  sha256: string;
  inputTokensUpperBound: number;
  outputTokens: number;
}>;

export type AiReservationSource =
  | { kind: "ask_document"; rawQuestion: string; documentId: string; sourceUpdatedAt: string }
  | { kind: "workspace_chat"; rawMessage: string; selectedDocumentId?: string }
  | { kind: "query_embedding"; rawQuery: string }
  | { kind: "document_indexing"; documentId: string; sourceUpdatedAt: string };

```

`issueAuthorizedProviderMaterialForReservation()` applies Leaf 4 prompt authority and
Leaf 6 ACL closure, locks every source/thread/message/chunk revision in deterministic
order, and issues the complete direct/retrieval/conversation/memory union. The
document-indexer variant verifies its fixed capability and exact
`Document.updatedAt` without fabricating a human identity. A changed or inaccessible
row aborts before reservation. The cross-leaf lock order remains
`workspace/member or document-indexer descriptor -> policy -> optional CHAT model ->
Leaf 9 material bindings -> bucket -> lease`.

The builder has one internal entry point:

```ts
export async function buildCanonicalProviderPayloadForReservation(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    actorId: string;
    workspaceRole: WorkspaceRole;
    source: AiReservationSource;
    policy: WorkspaceAiPolicy;
    catalog: AiCatalogEntry;
  },
): Promise<CanonicalProviderPayload> {
  const material = await issueAuthorizedProviderMaterialForReservation(tx, input);
  assertIssuedAuthorizedProviderMaterial(material);
  const outputTokens = input.catalog.purpose === "CHAT"
    ? input.policy.maxOutputTokens
    : 0;
  if (
    input.catalog.purpose === "CHAT" &&
    outputTokens > input.catalog.maxOutputTokens
  ) throw new Error("AI_POLICY_OUTPUT_LIMIT_INVALID");

  // This is the exact provider request body: model, system/user/assistant messages or
  // embedding inputs, dimensions/index identity, and exact max output are all encoded.
  // Provider adapters may add only fixed transport headers and send these bytes unchanged.
  const bodyUtf8 = encodeExactProviderRequestBody({
    catalog: input.catalog,
    material,
    outputTokens,
  });
  const byteLength = Buffer.byteLength(bodyUtf8, "utf8");
  const inputTokensUpperBound = Math.max(
    1,
    byteLength + input.catalog.fixedFramingTokenUpperBound +
      material.providerInputUnitCount * input.catalog.perInputFramingTokenUpperBound,
  );
  if (inputTokensUpperBound > input.catalog.maxInputTokens) {
    throw new Error("AI_PROVIDER_INPUT_TOO_LARGE");
  }
  const sha256 = createHash("sha256").update(bodyUtf8, "utf8").digest("hex");
  const payload = Object.freeze({
    [canonicalProviderPayloadBrand]: true as const,
    operation: material.operation,
    purpose: input.catalog.purpose,
    catalogId: input.catalog.catalogId,
    bodyUtf8,
    sha256,
    inputTokensUpperBound,
    outputTokens,
  });
  issuedPayloads.add(payload);
  payloadBindings.set(payload, Object.freeze(material.sourceBindings));
  payloadMaterials.set(payload, material);
  return payload;
}

export function authorizedMaterialForCanonicalPayload(
  payload: CanonicalProviderPayload,
): AuthorizedProviderMaterial {
  if (!issuedPayloads.has(payload)) throw new Error("AI_CANONICAL_PAYLOAD_INVALID");
  const material = payloadMaterials.get(payload);
  if (!material) throw new Error("AI_AUTHORIZED_PROVIDER_MATERIAL_MISSING");
  assertIssuedAuthorizedProviderMaterial(material);
  return material;
}
```

Leaf 9 material issuance uses the same source-controlled system prompt, retrieval
filters, ranking/tie-breaks, history window, memory summary, and chunker as the actual
product. It deterministically reduces context until the
conservative byte-plus-framing upper bound fits; it never truncates after hashing or
lets a caller substitute messages. Ask includes its locked document and every selected
authorized retrieval chunk. Workspace chat includes the locked saved history/memory,
new message, selected document, and every selected authorized chunk. Query embedding
contains the exact normalized query. Indexing contains the exact ordered chunker output
from the locked document revision. The encoder emits canonical JSON with fixed key
order and no insignificant variation. Counting every UTF-8 body byte as a token plus
catalog-pinned fixed/per-input framing is deliberately conservative; versioned provider
tokenizer fixtures must prove it never falls below actual input tokens before a catalog
entry can ship.

`validateCanonicalProviderPayloadForBegin()` requires the exact object in
`issuedPayloads`, recomputes its SHA, matches workspace/actor/operation/catalog and the
lease hash, and calls Leaf 9 `revalidateAuthorizedProviderMaterialForBegin()` for the
private bindings. It is deliberately
side-effect-free with respect to `issuedPayloads`/`begunPayloads`: a SERIALIZABLE
`P2034` retry, descriptor failure, policy failure, or lost lease race cannot poison the
one-shot object. Only after the transaction has committed `RESERVED -> CALLING` does
`beginAiProviderCall()` call `markCanonicalProviderPayloadBegun(payload, { leaseId,
expectedSha256 })`. That post-commit function atomically records the lease binding in
the process-local begun registry and rejects a second mark. If marking fails, no
provider I/O occurs and the already-CALLING lease is conservatively expired/settled.
`consumeCanonicalProviderPayloadForInvoke()` requires the issued and post-commit begun
bindings plus the begin-returned SHA, deletes both entries before returning a new byte
buffer, and permits exactly one adapter invocation. Copies, structural casts, changed
body text, a payload from another lease/workspace, rebuilding after reservation, and
second invocation all fail `AI_CANONICAL_PAYLOAD_INVALID` before endpoint resolution or
socket I/O. Payload bodies/source bindings are never persisted to the lease, log, or
telemetry; only the SHA-256 and conservative counters are persisted.
The payload-to-material registry is likewise process-local and one-shot: Task 3 returns
the exact Leaf 9 material associated with the issued payload, and the finalizer consumes
that material after the provider has returned one complete bounded result. Callers can
neither supply a substitute material object nor derive one from the encoded body.

Create `lib/rag/quota.ts` with these public types and transaction:

```ts
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { resolveActiveWorkspaceForActorForUpdate } from "@/lib/authorization/active-resources"; // Leaf 5 export
import { prisma } from "@/lib/db/client";
import {
  authorizedMaterialForCanonicalPayload,
  buildCanonicalProviderPayloadForReservation,
  type AiReservationSource,
} from "@/lib/rag/canonical-provider-payload";
import {
  type AiOperation,
  catalogCostMicros,
  purposeForOperation,
  requireCurrentEmbeddingCatalogEntry,
  requireExactCatalogEntry,
  requireExactWorkspaceChatModelPolicy,
  roleMeetsMinimum,
} from "@/lib/rag/provider-catalog";
import {
  type AiQuotaDependencies,
  beginAiProviderCall,
  cancelAiRequest,
  expireLockedLeaseAndUpdateBucket,
  lockWorkspaceAiTransaction,
  productionAiQuotaDependencies,
  reconcileExpiredAiLeases,
  reconcileExpiredAiLeasesWithDependencies,
  withSerializableRetry,
} from "@/lib/rag/lease-control";
import {
  assertIssuedDocumentIndexerCapability,
  DOCUMENT_INDEXER_ACTOR_ID,
  verifyCurrentDocumentIndexerCapability,
} from "@/lib/rag/document-indexer-authority";

export {
  beginAiProviderCall,
  cancelAiRequest,
  reconcileExpiredAiLeases,
} from "@/lib/rag/lease-control";

export type AiQuotaScope = "request" | "concurrency" | "daily_tokens" | "daily_cost";
export class AiQuotaExceededError extends Error {
  constructor(public scope: AiQuotaScope, public retryAfterSeconds: number) {
    super("AI_QUOTA_EXCEEDED");
  }
}

function assertReservationSource(source: AiReservationSource) {
  if (!source || typeof source !== "object") throw new Error("AI_QUOTA_INPUT_INVALID");
  if (source.kind === "ask_document" && typeof source.rawQuestion !== "string") {
    throw new Error("AI_QUOTA_INPUT_INVALID");
  }
  if (source.kind === "workspace_chat" && typeof source.rawMessage !== "string") {
    throw new Error("AI_QUOTA_INPUT_INVALID");
  }
  if (source.kind === "query_embedding" && typeof source.rawQuery !== "string") {
    throw new Error("AI_QUOTA_INPUT_INVALID");
  }
  if (
    (source.kind === "ask_document" || source.kind === "document_indexing") &&
    (!source.documentId || !source.sourceUpdatedAt ||
      !Number.isFinite(Date.parse(source.sourceUpdatedAt)))
  ) throw new Error("AI_QUOTA_INPUT_INVALID");
}

function countUnicodeScalars(value: string) {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) {
        throw new Error("AI_MESSAGE_UNICODE_INVALID");
      }
      index += 1;
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      throw new Error("AI_MESSAGE_UNICODE_INVALID");
    }
    count += 1;
  }
  return count;
}

function assertLockedMessageScalarLimit(
  source: AiReservationSource,
  maxMessageChars: number,
) {
  const text =
    source.kind === "ask_document" ? source.rawQuestion :
    source.kind === "workspace_chat" ? source.rawMessage :
    source.kind === "query_embedding" ? source.rawQuery :
    null;
  if (text !== null && countUnicodeScalars(text) > maxMessageChars) {
    throw new Error("AI_MESSAGE_TOO_LARGE");
  }
}

export async function reconcileExpiredAiLeasesForWorkspace(workspaceId: string) {
  return withSerializableRetry(() => prisma.$transaction(async (tx) => {
    await lockWorkspaceAiTransaction(tx, workspaceId);
    return reconcileExpiredAiLeases(tx, workspaceId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

function utcDayStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function lockAuthoritativeCurrentBucket(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  dependencies: AiQuotaDependencies,
) {
  // This locating sample occurs only after authority, policy, model, and source locks.
  // It is never used for lease/accounting state.
  let locatingNow = await dependencies.clock.now(tx);
  for (let rollover = 0; rollover < 2; rollover += 1) {
    const candidateDay = utcDayStart(locatingNow);
    const candidate = await tx.aiUsageBucket.upsert({
      where: { workspaceId_dayStartUtc: { workspaceId, dayStartUtc: candidateDay } },
      create: { workspaceId, dayStartUtc: candidateDay },
      update: {},
    });
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AiUsageBucket"
      WHERE "id" = ${candidate.id} AND "workspaceId" = ${workspaceId} FOR UPDATE
    `);
    if (rows.length !== 1) throw new Error("AI_QUOTA_BUCKET_BINDING_INVALID");
    const now = await dependencies.clock.now(tx); // authoritative after the bucket lock wait
    if (utcDayStart(now).getTime() === candidateDay.getTime()) {
      const bucket = await tx.aiUsageBucket.findUniqueOrThrow({ where: { id: candidate.id } });
      return { bucket, now, dayStartUtc: candidateDay };
    }
    // Midnight passed while waiting. The old day is already locked, so acquiring the
    // newer day preserves chronological lock order; no lease uses the stale day/time.
    locatingNow = now;
  }
  throw new Error("AI_QUOTA_DAY_ROLLOVER_RETRY");
}

type ReserveAiRequestInput = {
  workspaceId: string;
  actorId: string;
} & (
  | {
      catalogId: string;
      source: Extract<AiReservationSource, { kind: "ask_document" | "workspace_chat" }>;
    }
  | {
      catalogId?: never;
      source: Extract<AiReservationSource, { kind: "query_embedding" | "document_indexing" }>;
    }
);

export async function reserveAiRequestWithDependencies(
  input: ReserveAiRequestInput,
  dependencies: AiQuotaDependencies,
) {
  assertReservationSource(input.source);
  return withSerializableRetry(() => prisma.$transaction(async (tx) => {
    await lockWorkspaceAiTransaction(tx, input.workspaceId);

    // Admission lock order: membership/system authority -> policy -> optional CHAT model
    // -> canonical source revisions -> bucket -> lease.
    const documentIndexerCapability = input.actorId === DOCUMENT_INDEXER_ACTOR_ID
      ? await verifyCurrentDocumentIndexerCapability(tx, { workspaceId: input.workspaceId })
      : null;
    if (documentIndexerCapability) {
      assertIssuedDocumentIndexerCapability(documentIndexerCapability);
    }
    const authority = documentIndexerCapability
      ? { role: documentIndexerCapability.effectiveRole }
        : await resolveActiveWorkspaceForActorForUpdate(tx, {
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          access: "read",
        });
    if (
      (input.actorId === DOCUMENT_INDEXER_ACTOR_ID && input.source.kind !== "document_indexing") ||
      (input.actorId !== DOCUMENT_INDEXER_ACTOR_ID && input.source.kind === "document_indexing")
    ) throw new Error("AI_SYSTEM_ACTOR_FORBIDDEN");

    await tx.$queryRaw(Prisma.sql`
      SELECT "workspaceId" FROM "WorkspaceAiPolicy"
      WHERE "workspaceId" = ${input.workspaceId} FOR UPDATE
    `);
    const policy = await tx.workspaceAiPolicy.findUniqueOrThrow({
      where: { workspaceId: input.workspaceId },
    });
    // This precedes Leaf 9 material issuance, retrieval, normalization, and encoding.
    assertLockedMessageScalarLimit(input.source, policy.maxMessageChars);
    const purpose = purposeForOperation(input.source.kind);
    const catalog = purpose === "CHAT"
      ? await (async () => {
          if (!input.catalogId) throw new Error("AI_POLICY_FORBIDDEN");
          await tx.$queryRaw(Prisma.sql`
            SELECT "id" FROM "WorkspaceAiModelPolicy"
            WHERE "workspaceId" = ${input.workspaceId} AND "catalogId" = ${input.catalogId}
            FOR UPDATE
          `);
          const model = await tx.workspaceAiModelPolicy.findUniqueOrThrow({
            where: {
              workspaceId_catalogId: {
                workspaceId: input.workspaceId,
                catalogId: input.catalogId,
              },
            },
          });
          const chat = requireExactWorkspaceChatModelPolicy(model);
          if (!roleMeetsMinimum(authority.role, model.minimumRole)) {
            throw new Error("AI_POLICY_CHANGED_BEFORE_RESERVE");
          }
          return chat;
        })()
      : requireCurrentEmbeddingCatalogEntry();
    if (catalog.external && !policy.externalProvidersEnabled) {
      throw new Error("AI_POLICY_CHANGED_BEFORE_RESERVE");
    }
    const payload = await buildCanonicalProviderPayloadForReservation(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      workspaceRole: authority.role,
      source: input.source,
      policy,
      catalog,
    });
    const reservedTokens = BigInt(
      payload.inputTokensUpperBound + payload.outputTokens,
    );
    if (reservedTokens < 1n) throw new Error("AI_QUOTA_ESTIMATOR_INVALID");
    const reservedCostMicros = catalogCostMicros(
      catalog,
      payload.inputTokensUpperBound,
      payload.outputTokens,
    );

    await reconcileExpiredAiLeasesWithDependencies(tx, input.workspaceId, dependencies);
    const { bucket, now, dayStartUtc } = await lockAuthoritativeCurrentBucket(
      tx,
      input.workspaceId,
      dependencies,
    );
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((dayStartUtc.getTime() + 86_400_000 - now.getTime()) / 1000),
    );
    const concurrent = await tx.aiRequestLease.count({
      where: {
        workspaceId: input.workspaceId,
        status: { in: ["RESERVED", "CALLING"] },
        expiresAt: { gt: now },
      },
    });
    if (concurrent >= policy.maxConcurrentRequests) {
      throw new AiQuotaExceededError("concurrency", 1);
    }
    if (bucket.usedRequests + bucket.reservedRequests + 1 > policy.dailyRequestLimit) {
      throw new AiQuotaExceededError("request", retryAfterSeconds);
    }
    if (bucket.usedTokens + bucket.reservedTokens + reservedTokens > policy.dailyTokenLimit) {
      throw new AiQuotaExceededError("daily_tokens", retryAfterSeconds);
    }
    if (
      bucket.usedCostMicros + bucket.reservedCostMicros + reservedCostMicros > policy.dailyCostLimitMicros
    ) throw new AiQuotaExceededError("daily_cost", retryAfterSeconds);
    const leaseId = randomUUID();
    await tx.aiUsageBucket.update({
      where: { id: bucket.id },
      data: {
        reservedRequests: { increment: 1 },
        reservedTokens: { increment: reservedTokens },
        reservedCostMicros: { increment: reservedCostMicros },
      },
    });
    await tx.aiRequestLease.create({
      data: {
        id: leaseId,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        bucketId: bucket.id,
        operation: payload.operation,
        catalogId: catalog.catalogId,
        externalProvider: catalog.external,
        policyVersion: policy.policyVersion,
        documentIndexerCapabilityGeneration: documentIndexerCapability?.generation ?? null,
        documentIndexerCapabilitySha256: documentIndexerCapability?.sha256 ?? null,
        canonicalPayloadSha256: payload.sha256,
        reservedRequests: 1,
        reservedTokens,
        reservedCostMicros,
        expiresAt: new Date(now.getTime() + policy.requestTimeoutMs + 10_000),
        createdAt: now,
      },
    });
    return {
      leaseId,
      retryAfterSeconds,
      payload,
      authorizedMaterial: authorizedMaterialForCanonicalPayload(payload),
      providerMaxOutputTokens: payload.outputTokens,
      requestTimeoutMs: policy.requestTimeoutMs,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

export function reserveAiRequest(input: ReserveAiRequestInput) {
  return reserveAiRequestWithDependencies(input, productionAiQuotaDependencies);
}

export function reserveDocumentIndexingRequest(input: {
  workspaceId: string;
  documentId: string;
  sourceUpdatedAt: string;
}) {
  return reserveAiRequest({
    ...input,
    actorId: DOCUMENT_INDEXER_ACTOR_ID,
    source: {
      kind: "document_indexing",
      documentId: input.documentId,
      sourceUpdatedAt: input.sourceUpdatedAt,
    },
  });
}

export type AiProviderUsageEvidence = {
  inputTokens: unknown;
  outputTokens: unknown;
  completedAt: unknown;
};

export async function settleAiRequestWithDependencies(input: {
  leaseId: string;
  usage?: AiProviderUsageEvidence | null;
}, dependencies: AiQuotaDependencies) {
  const identity = await prisma.aiRequestLease.findUnique({
    where: { id: input.leaseId },
    select: { workspaceId: true, bucketId: true },
  });
  if (!identity) return false;
  return withSerializableRetry(() => prisma.$transaction(async (tx) => {
    await lockWorkspaceAiTransaction(tx, identity.workspaceId);
    const buckets = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AiUsageBucket"
      WHERE "id" = ${identity.bucketId} AND "workspaceId" = ${identity.workspaceId}
      FOR UPDATE
    `);
    const leases = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AiRequestLease" WHERE "id" = ${input.leaseId} FOR UPDATE
    `);
    if (buckets.length !== 1 || leases.length !== 1) return false;
    const lease = await tx.aiRequestLease.findUnique({ where: { id: input.leaseId } });
    if (
      !lease || lease.bucketId !== identity.bucketId ||
      lease.workspaceId !== identity.workspaceId || lease.status !== "CALLING"
    ) return false;
    // Settlement metadata and expiry authority use only this post-row-lock DB time.
    const now = await dependencies.clock.now(tx);
    if (lease.expiresAt <= now) {
      await expireLockedLeaseAndUpdateBucket(tx, lease, now);
      return false;
    }

    const catalog = requireExactCatalogEntry(
      lease.catalogId,
      purposeForOperation(lease.operation as AiOperation),
    );
    const completedAt = typeof input.usage?.completedAt === "string"
      ? Date.parse(input.usage.completedAt)
      : Number.NaN;
    const inputTokens = typeof input.usage?.inputTokens === "number"
      ? input.usage.inputTokens
      : Number.NaN;
    const outputTokens = typeof input.usage?.outputTokens === "number"
      ? input.usage.outputTokens
      : Number.NaN;
    const metadataValid =
      Number.isFinite(completedAt) &&
      completedAt >= lease.createdAt.getTime() && completedAt <= now.getTime() &&
      Number.isSafeInteger(inputTokens) && inputTokens >= 0 &&
      Number.isSafeInteger(outputTokens) && outputTokens >= 0;
    const actualTokens = metadataValid
      ? BigInt(inputTokens) + BigInt(outputTokens)
      : lease.reservedTokens + 1n;
    const actualCost = metadataValid
      ? catalogCostMicros(catalog, inputTokens, outputTokens)
      : lease.reservedCostMicros + 1n;
    const useActual =
      actualTokens <= lease.reservedTokens && actualCost <= lease.reservedCostMicros;
    const chargedTokens = useActual ? actualTokens : lease.reservedTokens;
    const chargedCostMicros = useActual ? actualCost : lease.reservedCostMicros;

    // State first, then its bucket; the SQL trigger and transaction make both atomic.
    const claimed = await tx.aiRequestLease.updateMany({
      where: { id: lease.id, status: "CALLING", expiresAt: { gt: now } },
      data: {
        status: "SETTLED",
        chargedRequests: lease.reservedRequests,
        chargedTokens,
        chargedCostMicros,
        settledAt: now,
      },
    });
    if (claimed.count !== 1) throw new Error("AI_QUOTA_SETTLEMENT_RACE");
    await tx.aiUsageBucket.update({
      where: { id: lease.bucketId },
      data: {
        reservedRequests: { decrement: lease.reservedRequests },
        usedRequests: { increment: lease.reservedRequests },
        reservedTokens: { decrement: lease.reservedTokens },
        reservedCostMicros: { decrement: lease.reservedCostMicros },
        usedTokens: { increment: chargedTokens },
        usedCostMicros: { increment: chargedCostMicros },
      },
    });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

export function settleAiRequest(input: {
  leaseId: string;
  usage?: AiProviderUsageEvidence | null;
}) {
  return settleAiRequestWithDependencies(input, productionAiQuotaDependencies);
}
```

Every mutating path takes the workspace advisory lock first. Admission paths
(`reserveAiRequest()` and `beginAiProviderCall()`) then use the exact global order
`active membership or fixed system authority -> WorkspaceAiPolicy FOR UPDATE ->
optional enabled CHAT WorkspaceAiModelPolicy FOR UPDATE -> canonical source revisions
-> bucket -> lease`. Embedding/indexing omit the chat-model lock and bind the exact
current embedding catalog. Opt-out uses
`membership -> policy -> bucket -> lease`. Cleanup paths (cancel, expiry, settlement)
must remain usable after membership/user deletion, so after the advisory lock they use
only `bucket -> lease` and never reach backward into membership, policy, or model rows.
Pre-lock identity/bucket reads are hints only; every mutating transaction re-locks the
composite `(bucketId, workspaceId)` bucket row before the lease row and re-validates the
immutable binding before changing counters.
The real-DB race suite asserts these orders and runs archive, membership delete,
downgrade, opt-out, reserve, begin, cancel, expiry, and settlement concurrently.
A `RESERVED` lease has not crossed the network boundary: cancellation or expiry
releases its reserved counters, charges zero, and records `CANCELLED` or `EXPIRED`.
A `CALLING` lease has crossed the provider boundary: settlement or expiry releases
its reserved counters and charges bounded actual usage or the full conservative
reservation. `SETTLED`, `EXPIRED`, and `CANCELLED` are terminal. The settlement
function itself—not a caller—bounds each supplied actual value to that locked lease's
reservation; negative, globally-valid-but-over-lease, malformed, or missing usage
charges exactly the conservative reservation. Add direct `settleAiRequest()` tests
for token overage, cost overage, both negative, and concurrent repeated settlement so
no alternative caller can bypass the bound.

Use the database transaction clock for day, expiry, provider-metadata validity, and
settlement authority. `AiQuotaClock.now(tx)` runs
`SELECT clock_timestamp() AS now`; for every existing lease transition it is called
only after the exact composite bucket row and lease row have both been acquired in
that order. For reservation, the authoritative sample occurs after authority/policy/
source locks and the selected UTC bucket lock. Tests use the one Vitest-only
`createAiQuotaTestHarness({ clock })` dependency seam for every transition and also
assert call order. Public inputs contain neither `clock` nor `now`. Compute `dayStartUtc`, lease expiry,
`Retry-After`, expiry selection, provider `completedAt` validation, and `settledAt`
from those post-target-lock timestamps; no timestamp sampled before a lock wait may
cross into a state predicate or persisted timestamp. Raw provider
usage/time evidence crosses into `settleAiRequest()`; no caller supplies a derived
`settleNow`, actual cost, or already-trusted token total. This prevents workers with
skewed application clocks from admitting different days, accepting future metadata,
or expiring leases early. Expiry of `RESERVED` releases
the unused reservation with zero charge; expiry of `CALLING` converts the full
reservation to used counters before admitting new work. Thus a crashed provider call
is conservatively charged, while a request that never connected cannot consume daily
budget. Conditional status updates make repeated cancel/expiry/settlement workers
idempotent. `withSerializableRetry()` retries only Prisma `P2034` at most three times
with no delay; every attempt reruns the full transaction, obtains a fresh database
timestamp, and re-reads policy, lease, and bucket state.

The test harness is source-scanned out of production callsites and applies one supplied
clock consistently to reserve, begin, cancel, reconcile, manager opt-out, restore
scrub, document indexing, and settlement. Production wrappers always close over
`databaseQuotaClock`; no route/service/indexer caller can select time.

The real-DB suite holds bucket+lease rows in a separate connection until after expiry,
then releases begin, cancel, settle, and reconcile waiters. Every waiter must decide
from its post-wait DB time. A second midnight test holds the initially selected daily
bucket across `00:00:00 UTC`; reservation locks the newer bucket in chronological order
and binds `dayStartUtc`, `createdAt`, `expiresAt`, and `Retry-After` only to the fresh
new-day sample. It never creates a lease against the stale day.

- [ ] **Step 5: Add the single-attempt transport and exact finalization sequence**

Create `lib/rag/provider-transport.ts`. It accepts only the begin-returned runtime,
the begun `CanonicalProviderPayload`, expected payload SHA-256, and the timeout signal.
It immediately consumes the payload's one-shot bytes, resolves the exact endpoint and
secret, and performs at most one wire attempt. All SDK/HTTP retry counts are zero;
redirect mode is reject/manual-fail; reconnect, resume, replay, and stream retry are
disabled. A 429, redirect, connection reset, timeout, truncated response, malformed
usage, or premature EOF ends that attempt. A retry requires a new reservation, lease,
material, payload object/hash, and charge.

The transport may collect response frames internally only during that one attempt. It
passes one finished string and raw bounded usage/time evidence to Leaf 9
`completeBoundedAiResult()` and returns `CompleteBoundedAiResult`. Its public type has
no callback, `onToken`, `ReadableStream`, `AsyncIterable`, iterator, NDJSON event,
partial-byte field, reconnect token, or resume cursor.

`tests/rag/provider-single-attempt.test.ts` uses a counting local provider and covers
success, 429, redirect, reset-before-headers, reset-mid-body, timeout, malformed/truncated
body, and attempted adapter reuse. Every case observes zero or one connect/request and
never two. A source contract rejects automatic retry options and any import from
attachment fetch, attachment URL/DNS validation, decoder, canonicalizer, or storage
modules; provider transport and Issue 11 remain disjoint.

In Ask/Workspace AI services: resolve the opaque chat selection, reject message length
over `maxMessageChars` by Unicode scalar count before retrieval, pass only raw
input/source revision identifiers to reservation, and use the returned runtime-issued
canonical payload plus its exact Leaf 9 material. Call `beginAiProviderCall()`
immediately before the first network connect. Only the begin result's post-lock,
post-revalidation `requestTimeoutMs` may construct the timeout combined with
`request.signal`; a reservation-time or service-cached policy object is never network
timeout authority. The begin transition locks the current active membership, policy,
optional chat catalog row, bound source revisions, bucket, and lease; it requires the
exact policy version, payload SHA, catalog purpose, opt-in, and Leaf 9 bindings.

Apply the identical sequence to query embedding and document indexing. Each operation
uses the source-controlled complete-payload upper bound/catalog price, shared concurrency/daily buckets,
workspace external opt-in, a bound `policyVersion`, timeout, and conservative settle.
Background indexing can enter only through `reserveDocumentIndexingRequest()` with a
branded, root-installed `VerifiedDocumentIndexerCapability` for exact principal
`system:document-indexer-v1`; the generic user path rejects `document_indexing`, and
the system principal rejects every other operation. The resolver locks and verifies an
active workspace before applying the same policy, exact current embedding catalog, opt-in,
quota, lease, timeout, and settlement contract. If the verified runtime disappears before reservation or
connect, return `AI_UNAVAILABLE`, settle/cancel the lease, and leave every existing
`DocumentChunk`, `CURRENT_EMBEDDING_INDEX`, vector dimension, source `updatedAt`, and
index-completion marker unchanged. There is no provider fallback or automatic pull.

`tests/rag/embedding-index-quota.test.ts` races chat, query embeddings, and indexing
against one last quota/concurrency token; exactly the policy limit wins. It also tests
opt-out/downgrade between reserve and connect, runtime removal, timeout/abort/missing
usage, missing/forged document-indexer capability, wrong system operation, retry
idempotence, and a byte-for-byte unchanged chunk/index snapshot on every pre-connect
failure.

Build the reservation only from server-owned policy/catalog values:

```ts
const reservation = await reserveAiRequest({
  workspaceId: resolved.workspace.id,
  actorId: input.actorId,
  catalogId: resolved.catalog.catalogId,
  source: {
    kind: "ask_document",
    rawQuestion: question,
    documentId: resolved.document.id,
    sourceUpdatedAt: resolved.document.updatedAt.toISOString(),
  },
});
```

For query embedding, the caller omits `catalogId`; reservation binds
`CURRENT_EMBEDDING_CATALOG_ENTRY` or fails. For document indexing, the caller passes
only `(workspaceId, documentId, sourceUpdatedAt)` to
`reserveDocumentIndexingRequest()`; it likewise has no catalog/model parameter. Chat
ids are rejected on both operations, and the embedding id is rejected on Ask/chat.
The provider invocation receives the exact `reservation.payload` and begin-returned
`canonicalPayloadSha256`. The already encoded body contains the exact output limit;
no callsite or adapter may rebuild messages, retrieve more context, recompute, lower,
increase, or omit that value.

For Ask and Workspace AI, the legal sequence is exact and source-tested:
`reserve full conservative budget -> begin/revalidate -> one wire attempt -> complete
bounded result -> Leaf 9 final authorization/persistence -> construct one private
response -> settlement`. The service never derives trusted usage or settlement time.
It keeps the complete result only in memory, passes its raw bounded usage evidence to
settlement, and explicitly cancels a lease that never reached `CALLING`:

```ts
let began = false;
let completeResult: CompleteBoundedAiResult | undefined;
try {
  const callable = await beginAiProviderCall({
    leaseId: reservation.leaseId,
    payload: reservation.payload,
  });
  began = true;
  const signal = combineAbortSignals(
    request.signal,
    AbortSignal.timeout(callable.requestTimeoutMs),
  );
  completeResult = await invokeAiProviderOnce({
    runtime: callable.runtime,
    payload: reservation.payload,
    expectedPayloadSha256: callable.canonicalPayloadSha256,
    signal,
  });
  const finalized = reservation.payload.operation === "workspace_chat"
    ? await finalizeAuthorizedWorkspaceAiResult(
        reservation.authorizedMaterial,
        completeResult,
      )
    : await finalizeAuthorizedAskResult(
        reservation.authorizedMaterial,
        completeResult,
      );
  // The finalizer has committed before this immutable, non-streaming response exists.
  return constructPrivateAiResponse(finalized.publicDto);
} catch (error) {
  if (!began) {
    await cancelAiRequest({
      leaseId: reservation.leaseId,
      expectedActorId: input.actorId,
    });
  }
  if (began && isSourceAccessChanged(error)) {
    // Finalization rolled back: zero turn/message/source rows and no answer bytes.
    return NextResponse.json(
      { error: "SOURCE_ACCESS_CHANGED" },
      { status: 409, headers: { "cache-control": "private, no-store" } },
    );
  }
  throw error;
} finally {
  if (began) {
    await settleAiRequest({
      leaseId: reservation.leaseId,
      usage: completeResult?.usageEvidence ?? null,
    });
  }
}
```

`invokeAiProviderOnce()` immediately calls
`consumeCanonicalProviderPayloadForInvoke()`, obtains a fresh byte buffer, resolves the
exact endpoint/secret, and sends that buffer as the request body unchanged. It can add
only fixed transport headers. It buffers at most the Leaf 9 complete-result byte cap,
constructs exactly one `CompleteBoundedAiResult`, and returns no transport stream or
partial surface. The old prompt-building `invokeAnswerChain*` helpers may parse provider
results but are not allowed to construct or mutate the request in these four
quota-bound paths. Adapter tests capture request bytes and compare their SHA-256 to
both the reservation and lease before returning usage.

Add a route/service event-order oracle that records those seven boundaries and rejects
any permutation. Its final-authorization race revokes membership or source access after
the provider completes and asserts: the wire-attempt count remains one; settlement
charges bounded actual usage when valid and otherwise the full conservative reservation;
the finalizer transaction leaves zero new AI turn/message/source rows; the only route
result is private/no-store `SOURCE_ACCESS_CHANGED` HTTP 409; and no answer byte, token
event, callback, or other partial result is observable before settlement finishes.

`settleAiRequest()` requires `lease.createdAt <= completedAt <=` its own DB timestamp, validates both
token fields as non-negative safe integers, bounds their sum by the locked reservation,
and calculates cost from the immutable catalog. Missing, malformed, future, negative,
or over-reservation evidence charges the full token and cost reservation. Provider-
reported cost is never accepted. Quota tests—not answer-chain callers—cover all of
these accounting decisions, including a 48-hour application-clock skew.

Update both routes to call `readBoundedJsonObject()` with the resolved policy's byte cap (or the fail-closed global maximum 32,768 before workspace resolution), map `AI_POLICY_FORBIDDEN` to 403, and map `AiQuotaExceededError` to:

```ts
return NextResponse.json(
  { error: "AI_QUOTA_EXCEEDED", scope: error.scope },
  {
    status: 429,
    headers: {
      "retry-after": String(error.retryAfterSeconds),
      "cache-control": "private, no-store",
    },
  },
);
```

- [ ] **Step 6: Run quota/service/route tests to verify green**

Run:

```bash
pnpm exec vitest run tests/http/bounded-json.test.ts tests/rag/canonical-provider-payload.test.ts tests/rag/provider-catalog.test.ts tests/rag/quota.test.ts tests/rag/embedding-index-quota.test.ts tests/rag/provider-single-attempt.test.ts tests/rag/embedding-client.test.ts tests/rag/index-document.test.ts tests/rag/vector-store.test.ts tests/rag/answer-chain.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts --reporter=dot
```

Expected: PASS; mixed chat/embedding/index concurrency admits exactly the shared policy limit; reserve/connect opt-out and membership races are linearized; timeout/missing/crashed usage charges conservatively once; duplicate settlement cannot double-decrement; runtime failure preserves chunks/index identity; route responses expose no other tenant data.

- [ ] **Step 7: Commit quota enforcement**

```bash
git add lib/http/bounded-json.ts lib/rag/canonical-provider-payload.ts lib/rag/quota.ts lib/rag/provider-catalog.ts lib/rag/provider-transport.ts lib/rag/answer-chain.ts lib/rag/ask.ts lib/rag/workspace-chat.ts lib/rag/embedding-client.ts lib/rag/index-document.ts lib/rag/vector-store.ts app/api/workspaces/\[workspaceSlug\]/documents/\[documentId\]/ask/route.ts app/api/workspaces/\[workspaceSlug\]/assistant/messages/route.ts tests/setup/prisma.ts tests/setup/ai-quota-dependencies.ts tests/http/bounded-json.test.ts tests/rag/canonical-provider-payload.test.ts tests/rag/provider-catalog.test.ts tests/rag/quota.test.ts tests/rag/embedding-index-quota.test.ts tests/rag/provider-single-attempt.test.ts tests/rag/embedding-client.test.ts tests/rag/index-document.test.ts tests/rag/vector-store.test.ts tests/rag/answer-chain.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts wiki/RAG\ Process\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: bound and quota AI requests"
```

Expected: commit succeeds after all focused tests pass.

### Task 4: Privacy-Safe Telemetry and Fail-Closed Production Capture

**Files:**
- Create: `lib/observability/ai-telemetry.ts`
- Modify: `lib/rag/langfuse.ts`
- Modify: `lib/rag/model-config.ts`
- Modify: `lib/rag/answer-chain.ts`
- Modify: `lib/rag/embedding-client.ts`
- Modify: `lib/rag/workspace-chat.ts`
- Modify: `lib/rag/ask.ts`
- Modify: `lib/observability/ai-unavailable.ts`
- Modify: `instrumentation.ts`
- Create: `scripts/deploy/preflight-ai-provider.ts`
- Create: `tests/deploy/ai-provider-preflight.test.ts`
- Create: `tests/observability/ai-telemetry.test.ts`
- Modify: `tests/rag/langfuse.test.ts`, `tests/rag/model-config.test.ts`, `tests/rag/answer-chain.test.ts`, `tests/observability/ai-unavailable.test.ts`

**Interfaces:**
- Consumes: Task 2 policy version/effective provider/model and Task 3 bounded usage/outcome.
- Produces: `AiTelemetryEvent` fixed allowlist and `assertProductionAiCapturePolicy()` startup/preflight guard; Sentry/Langfuse receive the same safe fields.

- [ ] **Step 1: Write failing telemetry/privacy tests**

Create `tests/observability/ai-telemetry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  aiTelemetryFields,
  assertProductionAiCapturePolicy,
} from "@/lib/observability/ai-telemetry";

it("exports only the fixed low-cardinality allowlist", () => {
  const fields = aiTelemetryFields({
    operation: "workspace_chat",
    provider: "openai-compatible",
    model: "catalog-model",
    policyVersion: 4,
    outcome: "quota_blocked",
    latencyMs: 120,
    inputTokens: 10,
    outputTokens: 0,
  });
  expect(Object.keys(fields).sort()).toEqual([
    "input_tokens", "latency_ms", "model", "operation", "outcome",
    "output_tokens", "policy_version", "provider",
  ]);
  expect(JSON.stringify(fields)).not.toMatch(/workspace|actor|user|document|chunk|slug|email|url/i);
});

it("fails production preflight when full prompt capture is requested", () => {
  expect(() => assertProductionAiCapturePolicy({
    MUNJIB_DEPLOYMENT_ENV: "production",
    MUNJIB_LANGFUSE_CAPTURE_MODE: "full",
  })).toThrow("PRODUCTION_AI_FULL_CAPTURE_FORBIDDEN");
});
```

Change Langfuse tests so metadata with workspace/source ids is absent, not sanitized-through. Change answer/embedding tests so console calls contain only stable error code and never the original error message.

- [ ] **Step 2: Run telemetry tests to verify red**

Run: `pnpm exec vitest run tests/observability/ai-telemetry.test.ts tests/rag/langfuse.test.ts tests/rag/answer-chain.test.ts tests/rag/embedding-client.test.ts tests/observability/ai-unavailable.test.ts tests/deploy/ai-provider-preflight.test.ts --reporter=dot`

Expected: FAIL because current Langfuse includes workspace/source identifiers, Sentry includes workspace slug, and raw provider errors are logged.

- [ ] **Step 3: Implement the telemetry allowlist and production guard**

Create `lib/observability/ai-telemetry.ts`:

```ts
export type AiTelemetryEvent = {
  operation:
    | "ask_document"
    | "workspace_chat"
    | "query_embedding"
    | "document_indexing"
    | "memory_summary";
  provider: string;
  model: string;
  policyVersion: number;
  outcome: "success" | "provider_error" | "timeout" | "aborted" | "policy_blocked" | "quota_blocked";
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
};

export function aiTelemetryFields(event: AiTelemetryEvent) {
  return {
    operation: event.operation,
    provider: event.provider,
    model: event.model,
    policy_version: event.policyVersion,
    outcome: event.outcome,
    latency_ms: Math.max(0, Math.round(event.latencyMs)),
    ...(event.inputTokens === undefined ? {} : { input_tokens: Math.max(0, event.inputTokens) }),
    ...(event.outputTokens === undefined ? {} : { output_tokens: Math.max(0, event.outputTokens) }),
  };
}

export function assertProductionAiCapturePolicy(env: Record<string, string | undefined> = process.env) {
  const deployment = env.MUNJIB_DEPLOYMENT_ENV?.trim().toLowerCase();
  const capture = (env.MUNJIB_LANGFUSE_CAPTURE_MODE ?? env.MUNJIB_LANGFUSE_CAPTURE)
    ?.trim().toLowerCase();
  if (deployment === "production" && capture === "full") {
    throw new Error("PRODUCTION_AI_FULL_CAPTURE_FORBIDDEN");
  }
}
```

Call the guard from `instrumentation.ts` before initializing Langfuse and from the
Leaf 10-owned `scripts/deploy/preflight-ai-provider.ts`. The fixed Leaf 13B candidate
qualifier invokes that script with no caller URL/path/secret arguments. Its tests prove
startup and deploy preflight apply the same capture, file-secret, proxy/TLS override,
exact endpoint/runtime id, unchanged embedding identity, and installed document-indexer
descriptor checks before any SDK initialization or network access.

- [ ] **Step 4: Restrict Langfuse/Sentry/log payloads**

Replace `LangfuseCallbackConfigInput` metadata/citation fields with:

```ts
export type LangfuseCallbackConfigInput = {
  enabled?: boolean;
  captureMode?: "metadata" | "full";
  callbackFactory?: LangfuseCallbackFactory;
  telemetry: AiTelemetryEvent;
};
```

`buildMetadata()` returns only `aiTelemetryFields(input.telemetry)` plus `capture_mode: "metadata"`. In production, full mode has already failed preflight; no callback may capture prompts/responses.

Remove `workspaceSlug` from `CaptureHandledAiUnavailableInput` and Sentry context. Add `policyVersion`/`outcome`, and call `aiTelemetryFields()` for the safe context. Replace raw logging with stable forms:

```ts
console.error("RAG answer chain invocation failed", { code: RAG_ERROR_CODES.CHAT_REQUEST_FAILED });
console.error("RAG embedding request failed", { code: RAG_ERROR_CODES.EMBED_REQUEST_FAILED });
console.error("Workspace memory summarization failed", { code: RAG_ERROR_CODES.CHAT_REQUEST_FAILED });
```

Never attach the original error as `cause`, an object field, or a template interpolation.

- [ ] **Step 5: Run telemetry tests to verify green**

Run:

```bash
pnpm exec vitest run tests/observability/ai-telemetry.test.ts tests/rag/langfuse.test.ts tests/rag/model-config.test.ts tests/rag/answer-chain.test.ts tests/rag/embedding-client.test.ts tests/observability/ai-unavailable.test.ts tests/observability/sentry-scrub-event.test.ts tests/deploy/ai-provider-preflight.test.ts --reporter=dot
```

Expected: PASS; serialized Sentry/Langfuse fields contain no workspace/user/source/content/URL/header key and production full capture throws before SDK initialization.

- [ ] **Step 6: Commit telemetry hardening**

```bash
git add lib/observability/ai-telemetry.ts lib/rag/langfuse.ts lib/rag/model-config.ts lib/rag/answer-chain.ts lib/rag/embedding-client.ts lib/rag/workspace-chat.ts lib/rag/ask.ts lib/observability/ai-unavailable.ts instrumentation.ts scripts/deploy/preflight-ai-provider.ts tests/observability/ai-telemetry.test.ts tests/rag/langfuse.test.ts tests/rag/model-config.test.ts tests/rag/answer-chain.test.ts tests/rag/embedding-client.test.ts tests/observability/ai-unavailable.test.ts tests/observability/sentry-scrub-event.test.ts tests/deploy/ai-provider-preflight.test.ts wiki/RAG\ Process\ Workflow.md wiki/Production\ Observability\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: restrict AI telemetry to safe fields"
```

Expected: commit succeeds without prompts, provider errors, tenant ids, or credentials in snapshots.

### Task 5: Full Provider/Quota/Privacy Verification and Disclosure Gate

**Files:**
- Create: `deploy/security/capabilities/issue-10-ai-provider-policy.json`
- Create: `tests/security/ai-provider-capability.test.ts`
- Modify: `deploy/security/protected-artifact-owners.json`
- Modify after disclosure review: `wiki/RAG Process Workflow.md`
- Modify after disclosure review: `wiki/Production Observability Workflow.md`
- Modify after disclosure review: `wiki/index.md`
- Modify after disclosure review: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: the one canonical Leaf 10 capability fragment, its exact evidence array,
  and Leaf 10-exclusive protected-owner activation, plus a server-authoritative
  provider policy and quota/telemetry contract coordinated with, but not changing,
  Issue #139. No earlier task authors, stages, tests, or owner-maps the fragment.

- [ ] **Step 1: Record minimal durable behavior**

Use this exact disclosure-safe paragraph:

```markdown
AI model selection uses an opaque workspace policy id resolved against the exact server catalog under current role and external-provider opt-in. Opt-out is journaled atomically and restore forces every workspace back to opt-out. Requests reserve transactional UTC-daily token/cost budget and a bounded concurrency lease before provider work, conservatively reject invalid time or over-maximum usage, and emit only allowlisted operation/model/policy/outcome/latency/usage telemetry.
```

- [ ] **Step 1b: Finalize the stable v1 capability fragment and ownership evidence**

Create `deploy/security/capabilities/issue-10-ai-provider-policy.json` with the
canonical Leaf 13 schema. The object has exactly six keys; its arrays are exact and any
semantic/evidence addition requires a reviewed version bump:

```json
{
  "format": "munjib-security-capability-v1",
  "id": "issue-10-ai-provider-policy",
  "version": 1,
  "leaf": 10,
  "requires": [
    "security-journal-auth-tombstones@1",
    "zero-ambient-media-egress@1",
    "active-resource-boundaries@1",
    "document-acl-closure@1",
    "ai-history-reauthorization@1",
    "immutable-private-runtime@1"
  ],
  "evidenceTests": [
    "tests/prisma/workspace-ai-policy-migration.test.ts",
    "tests/prisma/seed-ai-policy.test.ts",
    "tests/rag/provider-catalog.test.ts",
    "tests/rag/provider-policy.test.ts",
    "tests/rag/provider-policy-source-inventory.test.ts",
    "tests/rag/canonical-provider-payload.test.ts",
    "tests/rag/document-indexer-authority.test.ts",
    "tests/security/ai-provider-generation-publisher.test.ts",
    "tests/security/ai-provider-generation-install.test.ts",
    "tests/rag/lease-control.test.ts",
    "tests/rag/provider-journal-replay.test.ts",
    "tests/http/bounded-json.test.ts",
    "tests/rag/quota.test.ts",
    "tests/rag/embedding-index-quota.test.ts",
    "tests/rag/provider-runtime.test.ts",
    "tests/rag/provider-endpoints.test.ts",
    "tests/rag/provider-egress.test.ts",
    "tests/rag/provider-single-attempt.test.ts",
    "tests/docker/ai-provider-overlays.test.ts",
    "tests/deploy/ai-provider-preflight.test.ts",
    "tests/observability/ai-telemetry.test.ts",
    "tests/rag/langfuse.test.ts",
    "tests/rag/model-config.test.ts",
    "tests/rag/authorized-provider-material.test.ts",
    "tests/rag/authorized-ai-finalization.test.ts",
    "tests/rag/answer-chain.test.ts",
    "tests/rag/ask.test.ts",
    "tests/rag/workspace-chat.test.ts",
    "tests/rag/ask-route.test.ts",
    "tests/rag/workspace-chat-route.test.ts",
    "tests/security/ai-provider-capability.test.ts"
  ]
}
```

The protected artifact list is not a seventh fragment key. Define this exact
`protectedArtifacts` set in `tests/security/ai-provider-capability.test.ts` and require
matching `ownerCapabilityId: "issue-10-ai-provider-policy"`, `version: 1`, `state:
"ACTIVE"`, and exact candidate-file SHA-256 entries in
`deploy/security/protected-artifact-owners.json`:

```json
[
  "prisma/migrations/20260712060000_ai_provider_policy/migration.sql",
  "lib/rag/provider-catalog.ts",
  "lib/rag/provider-policy.ts",
  "lib/rag/policy-provisioning.ts",
  "lib/rag/provider-journal-replay.ts",
  "lib/rag/canonical-provider-payload.ts",
  "lib/rag/document-indexer-authority.ts",
  "lib/rag/lease-control.ts",
  "lib/rag/quota.ts",
  "lib/http/bounded-json.ts",
  "lib/rag/provider-runtime.ts",
  "lib/rag/provider-endpoints.ts",
  "lib/rag/secret-file.ts",
  "lib/rag/provider-transport.ts",
  "lib/observability/ai-telemetry.ts",
  "scripts/deploy/preflight-ai-provider.ts",
  "deploy/ai/provider-runtime-v1.json",
  "deploy/ai/provider-endpoints-v1.json",
  "deploy/ai/provider-generation-policy-v1.json",
  "docker-compose.ai-ollama.yml",
  "docker-compose.ai-openai.yml",
  "docker-compose.ai-openrouter.yml",
  "docker-compose.ai-langfuse.yml",
  "deploy/ai/document-indexer/descriptor.v1.json",
  "deploy/ai/attested-root-bundle/manifest.json",
  "deploy/ai/attested-root-bundle/dispatcher-operation.json",
  "deploy/ai/attested-root-bundle/munjib-ai-provider-install",
  "deploy/ai/attested-root-bundle/munjib-document-indexer-install",
  "scripts/security/publish-ai-provider-generation.ts",
  "deploy/security/capabilities/issue-10-ai-provider-policy.json"
]
```

This is the exact exclusive set. Shared aggregates and consumers—including
`prisma/schema.prisma`, `prisma/seed.ts`, `model-config.ts`, embedding/indexing
modules, Langfuse/Sentry instrumentation, auth/workspace provisioning, services,
routes, and UI—remain evidence-tested candidate files and are never claimed as
whole-file Leaf 10 ownership.

The generation has exactly four members: the application OCI digest,
`provider-runtime-v1.json`, `provider-endpoints-v1.json`, and the signed
document-indexer descriptor. The in-bundle `manifest.json` hashes exactly the other
three root-bundle files—`dispatcher-operation.json`,
`munjib-ai-provider-install`, and `munjib-document-indexer-install`—and never hashes
itself. The separately attested outer `ai-provider-v1` OCI/root-bundle envelope binds
the manifest digest and the exact four-member generation.

The capability test rejects any fragment unknown key (including the old
`capabilityId`, `owner`, `protectedArtifacts`, or `bindings` keys), reordered/missing
requirement or evidence, wrong id/version/leaf, missing exact dependency, missing or
multiply owned protected artifact, stale SHA/version, wrong migration path, or artifact
absent from the exact candidate rootfs. Only this Leaf 10 source branch authors the
fragment and owner-map version advance. Leaf 13B hashes artifacts from the candidate
rootfs, runs the exact evidence list from that source tree, and binds the canonical
fragment, owner map, test results, app digest, and host-bundle digest into the signed
release envelope. No runtime host, later leaf, publisher, or deployment script may
synthesize, amend, or republish the Leaf 10 fragment.

- [ ] **Step 2: Run focused and full verification**

Run:

```bash
pnpm exec vitest run \
  tests/prisma/workspace-ai-policy-migration.test.ts tests/prisma/seed-ai-policy.test.ts \
  tests/rag/provider-catalog.test.ts tests/rag/provider-policy.test.ts tests/rag/provider-policy-source-inventory.test.ts \
  tests/rag/canonical-provider-payload.test.ts tests/rag/lease-control.test.ts tests/rag/document-indexer-authority.test.ts \
  tests/security/ai-provider-generation-publisher.test.ts tests/security/ai-provider-generation-install.test.ts \
  tests/rag/provider-journal-replay.test.ts tests/rag/provider-runtime.test.ts tests/rag/provider-endpoints.test.ts \
  tests/rag/provider-egress.test.ts tests/rag/provider-single-attempt.test.ts tests/docker/ai-provider-overlays.test.ts tests/deploy/ai-provider-preflight.test.ts \
  tests/workspaces/management-service.test.ts tests/auth/provisioning.test.ts tests/auth/provisioning-current-user.test.ts \
  tests/security/ai-provider-capability.test.ts tests/http/bounded-json.test.ts tests/rag/quota.test.ts \
  tests/rag/embedding-index-quota.test.ts tests/rag/embedding-client.test.ts tests/rag/index-document.test.ts \
  tests/rag/vector-store.test.ts tests/rag/client-model-settings.test.ts tests/components/workspace-settings-panel.test.tsx \
  tests/components/ai-assistant-panel.test.tsx tests/components/workspace-chatbot.test.tsx tests/workspace-actions.test.ts \
  tests/i18n/messages.test.ts tests/rag/answer-chain.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts \
  tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts tests/observability/ai-telemetry.test.ts \
  tests/rag/langfuse.test.ts tests/rag/model-config.test.ts tests/rag/authorized-provider-material.test.ts \
  tests/rag/authorized-ai-finalization.test.ts tests/observability/ai-unavailable.test.ts \
  tests/observability/sentry-scrub-event.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm test
pnpm run build
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: all commands exit 0; concurrent quota tests admit only the configured count; production full capture fails preflight; embedding identity tests remain unchanged.

- [ ] **Step 3: Run a secret/content telemetry scan**

Run:

```bash
git diff --cached --check
if rg -q 'console\.(error|warn)\([^\n]*error|workspaceSlug.*telemetry|actorId.*telemetry|citationDocumentIds|citationChunkIds' lib/rag lib/observability app/api/workspaces; then echo "unsafe telemetry pattern detected" >&2; exit 1; fi
```

Expected: the scan finds no raw-error log, tenant/user/source telemetry field, or old citation-id telemetry field. Legitimate service authorization inputs may still use `workspaceSlug`/`actorId`; none may be passed to telemetry.

- [ ] **Step 4: Stage, sync-check, and inspect disclosure**

```bash
git add prisma/schema.prisma prisma/migrations/20260712060000_ai_provider_policy/migration.sql prisma/seed.ts deploy/ai deploy/security/capabilities/issue-10-ai-provider-policy.json docker-compose.ai-ollama.yml docker-compose.ai-openai.yml docker-compose.ai-openrouter.yml docker-compose.ai-langfuse.yml lib/rag/provider-catalog.ts lib/rag/provider-policy.ts lib/rag/lease-control.ts lib/rag/document-indexer-authority.ts lib/rag/policy-provisioning.ts lib/rag/provider-journal-replay.ts lib/rag/provider-runtime.ts lib/rag/provider-endpoints.ts lib/rag/secret-file.ts lib/rag/provider-transport.ts lib/workspaces/management-service.ts lib/auth/provisioning.ts lib/http/bounded-json.ts lib/rag/quota.ts lib/observability/ai-telemetry.ts lib/rag/answer-chain.ts lib/rag/ask.ts lib/rag/workspace-chat.ts lib/rag/langfuse.ts lib/rag/model-config.ts lib/rag/embedding-client.ts lib/rag/index-document.ts lib/rag/vector-store.ts lib/observability/ai-unavailable.ts instrumentation.ts app/workspaces/\[workspaceSlug\]/page.tsx app/workspaces/\[workspaceSlug\]/actions.ts app/api/workspaces/\[workspaceSlug\]/documents/\[documentId\]/ask/route.ts app/api/workspaces/\[workspaceSlug\]/assistant/messages/route.ts components/workspace-settings-panel.tsx components/document-editor/ai-assistant-panel.tsx components/workspace-chatbot.tsx lib/rag/client-model-settings.ts lib/i18n/messages.ts tests/setup/prisma.ts tests/setup/provider-runtime.ts tests/setup/ai-quota-dependencies.ts tests/prisma/workspace-ai-policy-migration.test.ts tests/prisma/seed-ai-policy.test.ts tests/rag/provider-policy.test.ts tests/rag/provider-policy-source-inventory.test.ts tests/rag/lease-control.test.ts tests/rag/document-indexer-authority.test.ts tests/rag/provider-journal-replay.test.ts tests/rag/provider-runtime.test.ts tests/rag/provider-endpoints.test.ts tests/rag/provider-egress.test.ts tests/rag/provider-single-attempt.test.ts tests/workspaces/management-service.test.ts tests/auth/provisioning.test.ts tests/auth/provisioning-current-user.test.ts tests/docker/ai-provider-overlays.test.ts tests/security/ai-provider-capability.test.ts tests/http/bounded-json.test.ts tests/rag/quota.test.ts tests/rag/embedding-index-quota.test.ts tests/rag/embedding-client.test.ts tests/rag/index-document.test.ts tests/rag/vector-store.test.ts tests/rag/client-model-settings.test.ts tests/components/workspace-settings-panel.test.tsx tests/components/ai-assistant-panel.test.tsx tests/components/workspace-chatbot.test.tsx tests/workspace-actions.test.ts tests/i18n/messages.test.ts tests/observability/ai-telemetry.test.ts tests/rag/answer-chain.test.ts tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts tests/rag/langfuse.test.ts tests/rag/model-config.test.ts tests/observability/ai-unavailable.test.ts tests/observability/sentry-scrub-event.test.ts wiki/RAG\ Process\ Workflow.md wiki/Production\ Observability\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
git add deploy/security/protected-artifact-owners.json lib/rag/canonical-provider-payload.ts scripts/security/publish-ai-provider-generation.ts scripts/deploy/preflight-ai-provider.ts tests/rag/provider-catalog.test.ts tests/rag/canonical-provider-payload.test.ts tests/security/ai-provider-generation-publisher.test.ts tests/security/ai-provider-generation-install.test.ts tests/deploy/ai-provider-preflight.test.ts
pnpm wiki:sync-plan --staged
pnpm wiki:sync-check --staged
git diff --cached --check
git diff --cached --name-only
if git diff --cached | rg -q 'NEXTAUTH_SECRET|[A-Z_]*API_KEY\s*[:=]\s*[^$<]|password|raw provider|docs/superpowers/(plans|specs)/2026-07-11-security'; then echo "restricted staged content detected" >&2; exit 1; fi
```

Expected: checks pass; the non-printing scan exposes no matching line; no plan/spec/secret/raw error is staged.

- [ ] **Step 5: Commit a final documentation delta only when one exists**

```bash
git commit -m "docs: record AI provider policy contract"
```

Expected: the required real wiki/log delta commits. Do not push before explicit disclosure approval.

- [ ] **Step 6: Poll ready-PR checks and GraphQL review threads**

After disclosure approval, ready the PR and poll checks/reviews every 60 seconds for at least five minutes. Query `reviewThreads(first: 100) { nodes { isResolved } }` on every pass; final checks pass and unresolved count is zero. Any failure repeats verification and wiki sync before another commit/push.

- [ ] **Step 7: Merge and execute the single Leaf 10 production deploy unit**

This work has one issue branch, one PR, one merge commit, and one production deploy.
Do not split migration, provider overlays, AI-provider/document-indexer generation, or application
promotion across independently deployable PRs, and do not deploy an intermediate Task
commit. After Step 6 is green and the disclosure gate approves the remote-safe diff:

1. merge the one PR and have Leaf 13B build one exact ARM64 application digest from
   that merge commit plus one separately attested `ai-provider-v1` host-bundle digest;
2. verify the canonical `issue-10-ai-provider-policy@1` fragment, all six required
   upstream capability generations, exact protected-owner hashes, SBOM/provenance/
   scans/tests, migration ledger entry
   `20260712060000_ai_provider_policy`, expected current generation, and rollback
   eligibility before any production mutation;
3. under `/run/lock/munjib-security-state.lock`, run the exact image migrator once with
   the fixed migration role and `pg_catalog`-first `PGOPTIONS`; verify the successful
   checksum and additive schema before Web or indexer activation. Never execute SQL
   from a checkout or run `prisma db push`;
4. through the fixed forced dispatcher, install the attested provider runtime/endpoint
   descriptors and `document-indexer-v1` generation from the exact host bundle, then
   stage the same application digest off traffic with email/OAuth callbacks/background
   jobs/provider egress/indexing disabled;
5. run candidate smoke for local chat, external opt-out and manager opt-in/out,
   `AI_EXTERNAL_PROVIDER_DISABLED` journal replay, full canonical-payload hash and quota
   settlement, query embedding and document indexing with the unchanged
   `CURRENT_EMBEDDING_INDEX`, descriptor rotation/revalidation, strict file secrets,
   exact endpoint/proxy rules, startup/preflight, Langfuse/Sentry content absence, and
   zero public Ollama/Web/PostgreSQL/debug listeners;
6. only after every smoke passes, execute Leaf 13B's fsynced
   `PREPARED -> TRAFFIC_SWITCHED -> COMMITTED` promotion, atomically install the app,
   provider/indexer generation, protected-owner/deployed-leaf pointers, and then raise
   the monotonic capability floor to `issue-10-ai-provider-policy@1`; re-run public
   health, exact backend, embedding/index identity, quota, log-redaction, and listener
   smoke before recording success;
7. retain the additive schema on rollback. Before floor promotion, a failed candidate
   may return to the previous generation only if its exact app/provider/indexer
   descriptors still verify. After floor promotion, rollback is limited to an exact
   previous generation that independently satisfies `issue-10-ai-provider-policy@1`
   and all current dependencies. Otherwise enter fixed maintenance mode and perform a
   signed fix-forward; never downgrade the migration, capability, external opt-out,
   embedding identity, protected-owner version, or descriptor generation;
8. archive one deploy evidence record binding PR/merge/source, app and bundle digests,
   migration checksum, capability generation/floor, descriptor generation/SHA, smoke
   classifications, active backend, and rollback eligibility. It contains no secret,
   prompt, content, workspace/user/source id, raw provider response, or topology detail.

Expected: exactly one deploy record reaches `COMMITTED`; migration, app, host bundle,
descriptor, capability floor, and active backend all name the same release. Any
pre-promotion failure leaves old traffic live, while any post-floor failure is handled
only by an eligible same-floor rollback or fix-forward.
