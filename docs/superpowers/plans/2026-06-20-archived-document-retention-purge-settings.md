# Archived Document Retention Purge Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workspace-configurable archived document retention, default it to 30 days, and provide a CLI/tools purge command that hard deletes expired archived documents only.

**Architecture:** Store a workspace-wide retention policy in Prisma as an enum-backed column, but expose client-safe string constants from a small helper so browser components never import Prisma runtime. Keep web requests limited to saving settings; the purge path lives in a server-only service and a thin CLI wrapper that can run from local shell, Docker `tools`, cron, or future scheduler. Hard delete only `Document` rows in this slice and rely on existing Prisma relation behavior for dependent DB rows.

**Tech Stack:** Next.js App Router server actions, React client components, Prisma/PostgreSQL, Vitest, tsx scripts, repository wiki maintenance commands.

---

## Execution Setup

The design spec is already committed in commit `994ab5d` and GitHub issue #119 exists. Before implementing, create or switch to an isolated worktree/branch for issue #119 using the required execution skill. Do not continue implementation on `issue-117-hide-unresolved-graph-targets-in-graph-view`; start from the intended base branch and bring the design/plan commits along deliberately.

Recommended branch name:

```bash
git switch main
git pull
git switch -c issue-119-archived-document-retention-purge-settings
```

If the branch already exists locally:

```bash
git switch issue-119-archived-document-retention-purge-settings
```

## File Structure

- Create `lib/workspaces/retention-policy.ts`: client-safe retention constants, labels, validation, and cutoff math.
- Create `lib/workspaces/retention-service.ts`: server-only workspace policy update service with workspace write guard.
- Modify `prisma/schema.prisma`: add `ArchivedDocumentRetentionPolicy` enum and `Workspace.archivedDocumentRetentionPolicy`.
- Create `prisma/migrations/20260620140000_add_archived_document_retention_policy/migration.sql`: add enum and column defaulting existing rows to `DAYS_30`.
- Create `tests/workspaces/retention-policy.test.ts`: helper and DB default coverage.
- Create `lib/documents/purge-archived.ts`: server-only purge service.
- Create `tests/documents/purge-archived.test.ts`: purge behavior coverage.
- Create `lib/documents/purge-archived-cli.ts`: argument parsing, service invocation, stdout formatting.
- Create `scripts/documents/purge-archived.ts`: thin executable entrypoint with Prisma disconnect and non-zero failure.
- Create `tests/documents/purge-archived-cli.test.ts`: CLI helper tests without spawning a child process.
- Modify `package.json`: add `documents:purge-archived`.
- Modify `app/workspaces/[workspaceSlug]/actions.ts`: add retention update server action.
- Modify `app/workspaces/[workspaceSlug]/page.tsx`: pass current retention policy and bound action to `DocumentList`.
- Modify `components/document-list.tsx`: accept and forward retention props.
- Modify `components/workspace-settings-panel.tsx`: add `Retention` navigation pane and save flow.
- Create `tests/workspaces/retention-service.test.ts`: DB-backed policy update and permission coverage.
- Modify `tests/workspace-actions.test.ts`: action contract tests.
- Modify `tests/components/document-list.test.tsx`: retention UI tests.
- Update wiki pages after implementation: `wiki/Document Knowledge Model.md`, `wiki/Document Editing Workflow.md`, `wiki/Next.js Prisma Monolith.md`, `wiki/index.md`, `wiki/log.md`, and regenerate `wiki/manifest.json`.

---

### Task 1: Data Model And Client-Safe Policy Helper

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260620140000_add_archived_document_retention_policy/migration.sql`
- Create: `lib/workspaces/retention-policy.ts`
- Create: `tests/workspaces/retention-policy.test.ts`

- [ ] **Step 1: Write the failing policy helper and DB default tests**

Create `tests/workspaces/retention-policy.test.ts`:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ARCHIVED_DOCUMENT_RETENTION_POLICIES,
  DEFAULT_ARCHIVED_DOCUMENT_RETENTION_POLICY,
  archivedDocumentRetentionCutoff,
  archivedDocumentRetentionDays,
  archivedDocumentRetentionLabel,
  isArchivedDocumentRetentionPolicy,
  parseArchivedDocumentRetentionPolicy,
} from "@/lib/workspaces/retention-policy";
import { prisma } from "@/lib/db/client";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("archived document retention policy", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("uses 30 days as the default workspace retention policy", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: fixture.workspace.id },
      select: { archivedDocumentRetentionPolicy: true },
    });

    expect(workspace.archivedDocumentRetentionPolicy).toBe("DAYS_30");
    expect(DEFAULT_ARCHIVED_DOCUMENT_RETENTION_POLICY).toBe("DAYS_30");
  });

  it("exposes the supported retention presets in UI order", () => {
    expect(ARCHIVED_DOCUMENT_RETENTION_POLICIES).toEqual([
      { value: "NEVER", label: "Never", days: null },
      { value: "DAYS_7", label: "7 days", days: 7 },
      { value: "DAYS_30", label: "30 days", days: 30 },
      { value: "DAYS_90", label: "90 days", days: 90 },
    ]);
  });

  it("validates and parses only supported policy values", () => {
    expect(isArchivedDocumentRetentionPolicy("DAYS_7")).toBe(true);
    expect(isArchivedDocumentRetentionPolicy("DAYS_365")).toBe(false);
    expect(parseArchivedDocumentRetentionPolicy("DAYS_90")).toBe("DAYS_90");
    expect(parseArchivedDocumentRetentionPolicy("bad-value")).toBeNull();
    expect(parseArchivedDocumentRetentionPolicy(null)).toBeNull();
  });

  it("maps policies to labels, day counts, and cutoffs", () => {
    const now = new Date("2026-06-20T00:00:00.000Z");

    expect(archivedDocumentRetentionLabel("NEVER")).toBe("Never");
    expect(archivedDocumentRetentionLabel("DAYS_30")).toBe("30 days");
    expect(archivedDocumentRetentionDays("NEVER")).toBeNull();
    expect(archivedDocumentRetentionDays("DAYS_7")).toBe(7);
    expect(archivedDocumentRetentionCutoff("NEVER", now)).toBeNull();
    expect(archivedDocumentRetentionCutoff("DAYS_30", now)?.toISOString()).toBe(
      "2026-05-21T00:00:00.000Z",
    );
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/workspaces/retention-policy.test.ts
```

Expected: FAIL because `@/lib/workspaces/retention-policy` and `Workspace.archivedDocumentRetentionPolicy` do not exist yet.

- [ ] **Step 3: Add the Prisma schema enum and workspace column**

In `prisma/schema.prisma`, add this enum after `DocumentStatus`:

```prisma
enum ArchivedDocumentRetentionPolicy {
  NEVER
  DAYS_7
  DAYS_30
  DAYS_90
}
```

In the `Workspace` model, add this field after `visibility`:

```prisma
  archivedDocumentRetentionPolicy ArchivedDocumentRetentionPolicy @default(DAYS_30)
```

- [ ] **Step 4: Add the migration SQL**

Create `prisma/migrations/20260620140000_add_archived_document_retention_policy/migration.sql`:

```sql
CREATE TYPE "ArchivedDocumentRetentionPolicy" AS ENUM ('NEVER', 'DAYS_7', 'DAYS_30', 'DAYS_90');

ALTER TABLE "Workspace"
ADD COLUMN "archivedDocumentRetentionPolicy" "ArchivedDocumentRetentionPolicy" NOT NULL DEFAULT 'DAYS_30';
```

- [ ] **Step 5: Add the client-safe helper**

Create `lib/workspaces/retention-policy.ts`:

```ts
export const ARCHIVED_DOCUMENT_RETENTION_POLICIES = [
  { value: "NEVER", label: "Never", days: null },
  { value: "DAYS_7", label: "7 days", days: 7 },
  { value: "DAYS_30", label: "30 days", days: 30 },
  { value: "DAYS_90", label: "90 days", days: 90 },
] as const;

export type ArchivedDocumentRetentionPolicyValue =
  (typeof ARCHIVED_DOCUMENT_RETENTION_POLICIES)[number]["value"];

export const DEFAULT_ARCHIVED_DOCUMENT_RETENTION_POLICY =
  "DAYS_30" satisfies ArchivedDocumentRetentionPolicyValue;

const retentionPolicies = new Set<string>(
  ARCHIVED_DOCUMENT_RETENTION_POLICIES.map((policy) => policy.value),
);

export function isArchivedDocumentRetentionPolicy(
  value: unknown,
): value is ArchivedDocumentRetentionPolicyValue {
  return typeof value === "string" && retentionPolicies.has(value);
}

export function parseArchivedDocumentRetentionPolicy(
  value: FormDataEntryValue | null,
): ArchivedDocumentRetentionPolicyValue | null {
  return isArchivedDocumentRetentionPolicy(value) ? value : null;
}

export function archivedDocumentRetentionDays(
  policy: ArchivedDocumentRetentionPolicyValue,
): number | null {
  return ARCHIVED_DOCUMENT_RETENTION_POLICIES.find((option) => option.value === policy)?.days ?? null;
}

export function archivedDocumentRetentionLabel(
  policy: ArchivedDocumentRetentionPolicyValue,
): string {
  return ARCHIVED_DOCUMENT_RETENTION_POLICIES.find((option) => option.value === policy)?.label ?? policy;
}

export function archivedDocumentRetentionCutoff(
  policy: ArchivedDocumentRetentionPolicyValue,
  now: Date,
): Date | null {
  const days = archivedDocumentRetentionDays(policy);
  if (days === null) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
```

- [ ] **Step 6: Regenerate Prisma Client**

Run:

```bash
pnpm run db:generate
```

Expected: PASS and Prisma Client includes `archivedDocumentRetentionPolicy`.

- [ ] **Step 7: Run the focused test to verify it passes**

Run:

```bash
pnpm exec vitest run tests/workspaces/retention-policy.test.ts
```

Expected: PASS.

---

### Task 2: Archived Document Purge Service

**Files:**
- Create: `lib/documents/purge-archived.ts`
- Create: `tests/documents/purge-archived.test.ts`

- [ ] **Step 1: Write failing purge service tests**

Create `tests/documents/purge-archived.test.ts`:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rag/index-document", () => ({
  scheduleSavedDocumentIndex: vi.fn(),
  safeIndexSavedDocument: vi.fn().mockResolvedValue(true),
}));

import { createDocument } from "@/lib/documents/service";
import { purgeExpiredArchivedDocuments } from "@/lib/documents/purge-archived";
import { prisma } from "@/lib/db/client";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("purgeExpiredArchivedDocuments", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("dry-runs expired archived documents without deleting them", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const expired = await createArchivedDocument(fixture, "Expired", "2026-05-01T00:00:00.000Z");

    const result = await purgeExpiredArchivedDocuments({
      now: new Date("2026-06-20T00:00:00.000Z"),
      dryRun: true,
    });

    expect(result.totalCount).toBe(1);
    expect(result.workspaces).toEqual([
      { workspaceId: fixture.workspace.id, workspaceSlug: fixture.workspace.slug, count: 1 },
    ]);
    await expect(prisma.document.findUniqueOrThrow({ where: { id: expired.id } })).resolves.toBeTruthy();
  });

  it("hard deletes only expired archived documents", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const expired = await createArchivedDocument(fixture, "Expired", "2026-05-01T00:00:00.000Z");
    const fresh = await createArchivedDocument(fixture, "Fresh", "2026-06-10T00:00:00.000Z");
    const active = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Active",
      contentMarkdown: "Active",
    });

    const result = await purgeExpiredArchivedDocuments({
      now: new Date("2026-06-20T00:00:00.000Z"),
      dryRun: false,
    });

    expect(result.totalCount).toBe(1);
    expect(await prisma.document.findUnique({ where: { id: expired.id } })).toBeNull();
    await expect(prisma.document.findUniqueOrThrow({ where: { id: fresh.id } })).resolves.toBeTruthy();
    await expect(prisma.document.findUniqueOrThrow({ where: { id: active.id } })).resolves.toBeTruthy();
  });

  it("skips workspaces whose policy is NEVER", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    await prisma.workspace.update({
      where: { id: fixture.workspace.id },
      data: { archivedDocumentRetentionPolicy: "NEVER" },
    });
    const expired = await createArchivedDocument(fixture, "Expired", "2026-01-01T00:00:00.000Z");

    const result = await purgeExpiredArchivedDocuments({
      now: new Date("2026-06-20T00:00:00.000Z"),
    });

    expect(result.totalCount).toBe(0);
    expect(result.workspaces).toEqual([]);
    await expect(prisma.document.findUniqueOrThrow({ where: { id: expired.id } })).resolves.toBeTruthy();
  });

  it("skips archived documents whose archivedAt is null", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "No Archive Date",
      contentMarkdown: "Archived without a clock",
    });
    await prisma.document.update({
      where: { id: document.id },
      data: { status: "ARCHIVED", archivedAt: null },
    });

    const result = await purgeExpiredArchivedDocuments({
      now: new Date("2026-06-20T00:00:00.000Z"),
    });

    expect(result.totalCount).toBe(0);
    await expect(prisma.document.findUniqueOrThrow({ where: { id: document.id } })).resolves.toBeTruthy();
  });

  it("scopes purge by workspace slug", async () => {
    const first = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const second = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const firstExpired = await createArchivedDocument(first, "First Expired", "2026-05-01T00:00:00.000Z");
    const secondExpired = await createArchivedDocument(second, "Second Expired", "2026-05-01T00:00:00.000Z");

    const result = await purgeExpiredArchivedDocuments({
      now: new Date("2026-06-20T00:00:00.000Z"),
      workspaceSlug: first.workspace.slug,
    });

    expect(result.totalCount).toBe(1);
    expect(await prisma.document.findUnique({ where: { id: firstExpired.id } })).toBeNull();
    await expect(prisma.document.findUniqueOrThrow({ where: { id: secondExpired.id } })).resolves.toBeTruthy();
  });

  it("throws WORKSPACE_NOT_FOUND for an unknown scoped workspace", async () => {
    await expect(
      purgeExpiredArchivedDocuments({
        now: new Date("2026-06-20T00:00:00.000Z"),
        workspaceSlug: "missing-workspace",
      }),
    ).rejects.toThrow("WORKSPACE_NOT_FOUND");
  });
});

async function createArchivedDocument(
  fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>,
  title: string,
  archivedAt: string,
) {
  const document = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title,
    contentMarkdown: title,
  });
  return prisma.document.update({
    where: { id: document.id },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date(archivedAt),
    },
  });
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/documents/purge-archived.test.ts
```

Expected: FAIL because `@/lib/documents/purge-archived` does not exist.

- [ ] **Step 3: Implement the purge service**

Create `lib/documents/purge-archived.ts`:

```ts
import { DocumentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import {
  archivedDocumentRetentionCutoff,
  type ArchivedDocumentRetentionPolicyValue,
} from "@/lib/workspaces/retention-policy";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

export type PurgeExpiredArchivedDocumentsInput = {
  now?: Date;
  dryRun?: boolean;
  workspaceSlug?: string;
};

export type PurgeExpiredArchivedDocumentsWorkspaceResult = {
  workspaceId: string;
  workspaceSlug: string;
  count: number;
};

export type PurgeExpiredArchivedDocumentsResult = {
  dryRun: boolean;
  totalCount: number;
  workspaces: PurgeExpiredArchivedDocumentsWorkspaceResult[];
};

export async function purgeExpiredArchivedDocuments(
  input: PurgeExpiredArchivedDocumentsInput = {},
): Promise<PurgeExpiredArchivedDocumentsResult> {
  const now = input.now ?? new Date();
  const dryRun = input.dryRun ?? false;
  const workspaces = await prisma.workspace.findMany({
    where: {
      ...(input.workspaceSlug ? { slug: input.workspaceSlug } : {}),
      archivedDocumentRetentionPolicy: { not: "NEVER" },
    },
    select: {
      id: true,
      slug: true,
      archivedDocumentRetentionPolicy: true,
    },
    orderBy: { slug: "asc" },
  });

  if (input.workspaceSlug && workspaces.length === 0) {
    const workspaceExists = await prisma.workspace.findFirst({
      where: { slug: input.workspaceSlug },
      select: { id: true },
    });
    if (!workspaceExists) throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }

  const results: PurgeExpiredArchivedDocumentsWorkspaceResult[] = [];

  for (const workspace of workspaces) {
    const cutoff = archivedDocumentRetentionCutoff(
      workspace.archivedDocumentRetentionPolicy as ArchivedDocumentRetentionPolicyValue,
      now,
    );
    if (!cutoff) continue;

    const where = {
      workspaceId: workspace.id,
      status: DocumentStatus.ARCHIVED,
      archivedAt: { not: null, lte: cutoff },
    };

    const count = dryRun
      ? await prisma.document.count({ where })
      : (await prisma.document.deleteMany({ where })).count;

    if (count > 0) {
      results.push({
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
        count,
      });
    }
  }

  return {
    dryRun,
    totalCount: results.reduce((total, workspace) => total + workspace.count, 0),
    workspaces: results,
  };
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
pnpm exec vitest run tests/documents/purge-archived.test.ts
```

Expected: PASS.

---

### Task 3: CLI Wrapper And Package Script

**Files:**
- Create: `lib/documents/purge-archived-cli.ts`
- Create: `scripts/documents/purge-archived.ts`
- Create: `tests/documents/purge-archived-cli.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing CLI helper tests**

Create `tests/documents/purge-archived-cli.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  purgeExpiredArchivedDocuments: vi.fn(),
}));

vi.mock("@/lib/documents/purge-archived", () => ({
  purgeExpiredArchivedDocuments: mocks.purgeExpiredArchivedDocuments,
}));

import {
  parsePurgeArchivedDocumentsArgs,
  runPurgeArchivedDocumentsCli,
} from "@/lib/documents/purge-archived-cli";

describe("purge archived documents CLI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses dry-run and workspace flags", () => {
    expect(parsePurgeArchivedDocumentsArgs(["--dry-run", "--workspace", "company-handbook"])).toEqual({
      dryRun: true,
      workspaceSlug: "company-handbook",
    });
  });

  it("rejects unknown flags", () => {
    expect(() => parsePurgeArchivedDocumentsArgs(["--bad-flag"])).toThrow(
      "Unknown argument: --bad-flag",
    );
  });

  it("rejects workspace without a slug", () => {
    expect(() => parsePurgeArchivedDocumentsArgs(["--workspace"])).toThrow(
      "--workspace requires a workspace slug",
    );
  });

  it("runs the purge service and prints delete-mode counts", async () => {
    mocks.purgeExpiredArchivedDocuments.mockResolvedValue({
      dryRun: false,
      totalCount: 3,
      workspaces: [
        { workspaceId: "workspace-1", workspaceSlug: "company-handbook", count: 3 },
      ],
    });
    const lines: string[] = [];

    const result = await runPurgeArchivedDocumentsCli([], (line) => lines.push(line));

    expect(mocks.purgeExpiredArchivedDocuments).toHaveBeenCalledWith({
      dryRun: false,
      workspaceSlug: undefined,
    });
    expect(result.totalCount).toBe(3);
    expect(lines).toEqual([
      "workspace company-handbook: 3 expired archived documents",
      "total expired archived documents: 3",
    ]);
  });

  it("prints dry-run counts without changing the output shape", async () => {
    mocks.purgeExpiredArchivedDocuments.mockResolvedValue({
      dryRun: true,
      totalCount: 1,
      workspaces: [
        { workspaceId: "workspace-1", workspaceSlug: "company-handbook", count: 1 },
      ],
    });
    const lines: string[] = [];

    await runPurgeArchivedDocumentsCli(["--dry-run"], (line) => lines.push(line));

    expect(mocks.purgeExpiredArchivedDocuments).toHaveBeenCalledWith({
      dryRun: true,
      workspaceSlug: undefined,
    });
    expect(lines).toEqual([
      "dry run: workspace company-handbook: 1 expired archived documents",
      "dry run: total expired archived documents: 1",
    ]);
  });
});
```

- [ ] **Step 2: Run the focused CLI test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/documents/purge-archived-cli.test.ts
```

Expected: FAIL because `@/lib/documents/purge-archived-cli` does not exist.

- [ ] **Step 3: Implement the CLI helper**

Create `lib/documents/purge-archived-cli.ts`:

```ts
import {
  purgeExpiredArchivedDocuments,
  type PurgeExpiredArchivedDocumentsResult,
} from "@/lib/documents/purge-archived";

export type PurgeArchivedDocumentsCliOptions = {
  dryRun: boolean;
  workspaceSlug?: string;
};

export function parsePurgeArchivedDocumentsArgs(
  args: string[],
): PurgeArchivedDocumentsCliOptions {
  const options: PurgeArchivedDocumentsCliOptions = { dryRun: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--workspace") {
      const workspaceSlug = args[index + 1];
      if (!workspaceSlug || workspaceSlug.startsWith("--")) {
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
  args: string[] = process.argv.slice(2),
  log: (line: string) => void = console.log,
): Promise<PurgeExpiredArchivedDocumentsResult> {
  const options = parsePurgeArchivedDocumentsArgs(args);
  const result = await purgeExpiredArchivedDocuments({
    dryRun: options.dryRun,
    workspaceSlug: options.workspaceSlug,
  });
  const prefix = result.dryRun ? "dry run: " : "";

  for (const workspace of result.workspaces) {
    log(
      `${prefix}workspace ${workspace.workspaceSlug}: ${workspace.count} expired archived documents`,
    );
  }
  log(`${prefix}total expired archived documents: ${result.totalCount}`);

  return result;
}
```

- [ ] **Step 4: Add the executable script**

Create `scripts/documents/purge-archived.ts`:

```ts
import { prisma } from "@/lib/db/client";
import { runPurgeArchivedDocumentsCli } from "@/lib/documents/purge-archived-cli";

async function main() {
  await runPurgeArchivedDocumentsCli();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 5: Add the package script**

In `package.json`, add this entry after `db:seed` and keep valid JSON commas:

```json
"documents:purge-archived": "tsx scripts/documents/purge-archived.ts"
```

- [ ] **Step 6: Run the focused CLI test and script smoke check**

Run:

```bash
pnpm exec vitest run tests/documents/purge-archived-cli.test.ts
pnpm run documents:purge-archived -- --dry-run
```

Expected: Vitest PASS. The script prints a dry-run total line. If the local database is not available, record the DB connection error and continue with the unit test result; the full DB-backed script run is covered in the final verification once the database is available.

---

### Task 4: Server Action And Workspace Page Plumbing

**Files:**
- Create: `lib/workspaces/retention-service.ts`
- Modify: `lib/service-errors.ts`
- Modify: `app/workspaces/[workspaceSlug]/actions.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `components/document-list.tsx`
- Create: `tests/workspaces/retention-service.test.ts`
- Modify: `tests/workspace-actions.test.ts`

- [ ] **Step 1: Add failing workspace retention service tests**

Create `tests/workspaces/retention-service.test.ts`:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { updateWorkspaceArchivedDocumentRetentionPolicy } from "@/lib/workspaces/retention-service";
import { prisma } from "@/lib/db/client";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("workspace archived document retention service", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("persists a workspace retention policy for writers", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);

    const updated = await updateWorkspaceArchivedDocumentRetentionPolicy({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      policy: "DAYS_90",
    });

    expect(updated.archivedDocumentRetentionPolicy).toBe("DAYS_90");
    await expect(
      prisma.workspace.findUniqueOrThrow({
        where: { id: fixture.workspace.id },
        select: { archivedDocumentRetentionPolicy: true },
      }),
    ).resolves.toEqual({ archivedDocumentRetentionPolicy: "DAYS_90" });
  });

  it("rejects retention policy updates from viewers", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.VIEWER);

    await expect(
      updateWorkspaceArchivedDocumentRetentionPolicy({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        policy: "DAYS_7",
      }),
    ).rejects.toThrow("WORKSPACE_WRITE_FORBIDDEN");
  });
});
```

- [ ] **Step 2: Add failing server action tests**

Modify the `mocks` object in `tests/workspace-actions.test.ts`:

```ts
const mocks = vi.hoisted(() => ({
  archiveDocument: vi.fn(),
  archiveFolder: vi.fn(),
  createComment: vi.fn(),
  createDocument: vi.fn(),
  createDocumentFromBrokenLink: vi.fn(),
  createFolder: vi.fn(),
  deriveMarkdownImportTitle: vi.fn(),
  isSupportedMarkdownImportFile: vi.fn(),
  pasteDocumentImageAttachment: vi.fn(),
  redirect: vi.fn(),
  renameFolder: vi.fn(),
  requireCurrentUser: vi.fn(),
  restoreDocumentVersion: vi.fn(),
  revalidatePath: vi.fn(),
  updateDocument: vi.fn(),
  updateWorkspaceArchivedDocumentRetentionPolicy: vi.fn(),
  uploadDocumentAttachment: vi.fn(),
  lookup: vi.fn(),
  httpRequest: vi.fn(),
  httpsRequest: vi.fn(),
}));
```

Add this mock near the folder/document service mocks:

```ts
vi.mock("@/lib/workspaces/retention-service", () => ({
  updateWorkspaceArchivedDocumentRetentionPolicy:
    mocks.updateWorkspaceArchivedDocumentRetentionPolicy,
}));
```

Add these tests near the other action tests:

```ts
  test("updateWorkspaceRetentionPolicyAction stores a valid policy", async () => {
    mocks.updateWorkspaceArchivedDocumentRetentionPolicy.mockResolvedValue({
      archivedDocumentRetentionPolicy: "DAYS_90",
    });
    const { updateWorkspaceRetentionPolicyAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("archivedDocumentRetentionPolicy", "DAYS_90");

    const result = await updateWorkspaceRetentionPolicyAction("company-handbook", formData);

    expect(mocks.updateWorkspaceArchivedDocumentRetentionPolicy).toHaveBeenCalledWith({
      actorId: "user-1",
      workspaceSlug: "company-handbook",
      policy: "DAYS_90",
    });
    expect(result).toEqual({ archivedDocumentRetentionPolicy: "DAYS_90" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
  });

  test("updateWorkspaceRetentionPolicyAction rejects invalid policies", async () => {
    const { updateWorkspaceRetentionPolicyAction } = await import(
      "@/app/workspaces/[workspaceSlug]/actions"
    );
    const formData = new FormData();
    formData.set("archivedDocumentRetentionPolicy", "DAYS_365");

    const result = await updateWorkspaceRetentionPolicyAction("company-handbook", formData);

    expect(result).toEqual({
      error: SERVICE_ERROR_CODES.ARCHIVED_DOCUMENT_RETENTION_POLICY_INVALID,
    });
    expect(mocks.updateWorkspaceArchivedDocumentRetentionPolicy).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run service and action tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/workspaces/retention-service.test.ts
pnpm exec vitest run tests/workspace-actions.test.ts
```

Expected: both commands FAIL because the retention service and action do not exist.

- [ ] **Step 4: Add the service error code**

In `lib/service-errors.ts`, add this entry before the closing `} as const`:

```ts
  ARCHIVED_DOCUMENT_RETENTION_POLICY_INVALID: "ARCHIVED_DOCUMENT_RETENTION_POLICY_INVALID",
```

- [ ] **Step 5: Implement the workspace retention service**

Create `lib/workspaces/retention-service.ts`:

```ts
import type { ArchivedDocumentRetentionPolicy } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { assertCanReadWorkspace, assertCanWriteWorkspace } from "@/lib/permissions/workspace";
import type { ArchivedDocumentRetentionPolicyValue } from "@/lib/workspaces/retention-policy";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

export type UpdateWorkspaceArchivedDocumentRetentionPolicyInput = {
  workspaceSlug: string;
  actorId: string;
  policy: ArchivedDocumentRetentionPolicyValue;
};

export async function updateWorkspaceArchivedDocumentRetentionPolicy(
  input: UpdateWorkspaceArchivedDocumentRetentionPolicyInput,
) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: input.workspaceSlug },
    include: {
      members: { where: { userId: input.actorId }, take: 1 },
    },
  });

  if (!workspace) throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);

  const role = workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  assertCanWriteWorkspace(role);

  return prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      archivedDocumentRetentionPolicy:
        input.policy as ArchivedDocumentRetentionPolicy,
    },
    select: { archivedDocumentRetentionPolicy: true },
  });
}
```

- [ ] **Step 6: Add the server action**

In `app/workspaces/[workspaceSlug]/actions.ts`, add imports:

```ts
import { updateWorkspaceArchivedDocumentRetentionPolicy } from "@/lib/workspaces/retention-service";
import { parseArchivedDocumentRetentionPolicy } from "@/lib/workspaces/retention-policy";
```

Add this action after `archiveDocumentAction`:

```ts
export async function updateWorkspaceRetentionPolicyAction(
  workspaceSlug: string,
  formData: FormData,
) {
  const user = await requireCurrentUser();
  const policy = parseArchivedDocumentRetentionPolicy(
    formData.get("archivedDocumentRetentionPolicy"),
  );

  if (!policy) {
    return { error: SERVICE_ERROR_CODES.ARCHIVED_DOCUMENT_RETENTION_POLICY_INVALID };
  }

  const updated = await updateWorkspaceArchivedDocumentRetentionPolicy({
    workspaceSlug,
    actorId: user.id,
    policy,
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);

  return {
    archivedDocumentRetentionPolicy: updated.archivedDocumentRetentionPolicy,
  };
}
```

- [ ] **Step 7: Pass retention props through the workspace page**

In `app/workspaces/[workspaceSlug]/page.tsx`, import the new action and bind it:

```ts
  updateWorkspaceRetentionPolicyAction,
```

Add this binding near the other workspace actions:

```ts
  const updateRetentionPolicy = updateWorkspaceRetentionPolicyAction.bind(null, workspaceSlug);
```

Pass these props into `DocumentList`:

```tsx
            archivedDocumentRetentionPolicy={workspace.archivedDocumentRetentionPolicy}
            updateRetentionPolicyAction={updateRetentionPolicy}
```

- [ ] **Step 8: Add DocumentList prop forwarding**

In `components/document-list.tsx`, import the policy value type and the action result type:

```ts
import type { ArchivedDocumentRetentionPolicyValue } from "@/lib/workspaces/retention-policy";
```

```ts
import {
  type MarkdownImportActionResult,
  type RetentionPolicyActionResult,
  WorkspaceSettingsPanel,
} from "@/components/workspace-settings-panel";
```

Add these props to `DocumentList`:

```ts
  archivedDocumentRetentionPolicy,
  updateRetentionPolicyAction,
```

Add these prop types:

```ts
  archivedDocumentRetentionPolicy: ArchivedDocumentRetentionPolicyValue;
  updateRetentionPolicyAction: (formData: FormData) => Promise<RetentionPolicyActionResult>;
```

Forward them into `WorkspaceSettingsPanel`:

```tsx
          archivedDocumentRetentionPolicy={archivedDocumentRetentionPolicy}
          updateRetentionPolicyAction={updateRetentionPolicyAction}
```

- [ ] **Step 9: Run the service and action tests**

Run:

```bash
pnpm exec vitest run tests/workspaces/retention-service.test.ts
pnpm exec vitest run tests/workspace-actions.test.ts
```

Expected: PASS.

---

### Task 5: Settings Panel Retention UI

**Files:**
- Modify: `components/workspace-settings-panel.tsx`
- Modify: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Add failing component tests and render defaults**

In `tests/components/document-list.test.tsx`, import the retention type:

```ts
import type { ArchivedDocumentRetentionPolicyValue } from "@/lib/workspaces/retention-policy";
```

Add these defaults to the `baseProps` object:

```ts
  archivedDocumentRetentionPolicy: "DAYS_30" as ArchivedDocumentRetentionPolicyValue,
  updateRetentionPolicyAction: async (formData: FormData) => ({
    archivedDocumentRetentionPolicy: String(
      formData.get("archivedDocumentRetentionPolicy"),
    ) as ArchivedDocumentRetentionPolicyValue,
  }),
```

Add these tests near the existing workspace settings tests:

```ts
  it("opens the Retention settings tab with 30 days selected by default", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Retention" }));

    expect(screen.getByRole("button", { name: "Retention" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("heading", { name: "Document retention" })).toBeTruthy();
    expect(screen.getByLabelText("Deleted document retention")).toHaveProperty(
      "value",
      "DAYS_30",
    );
    expect(screen.getByRole("button", { name: "Save retention" })).toBeTruthy();
  });

  it("saves the selected retention policy through the settings action", async () => {
    const updateRetentionPolicyAction = vi.fn(async (formData: FormData) => ({
      archivedDocumentRetentionPolicy: String(
        formData.get("archivedDocumentRetentionPolicy"),
      ) as ArchivedDocumentRetentionPolicyValue,
    }));
    renderList({ updateRetentionPolicyAction });

    fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Retention" }));
    fireEvent.change(screen.getByLabelText("Deleted document retention"), {
      target: { value: "DAYS_90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save retention" }));

    await waitFor(() => {
      expect(updateRetentionPolicyAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submitted = (updateRetentionPolicyAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submitted.get("archivedDocumentRetentionPolicy")).toBe("DAYS_90");
    expect(screen.getByText("Saved retention: 90 days")).toBeTruthy();
  });

  it("disables retention saving for read-only users", () => {
    renderList({ canWrite: false });

    fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Retention" }));

    expect(screen.getByLabelText("Deleted document retention")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Save retention" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows a validation status when retention saving returns an error", async () => {
    renderList({
      updateRetentionPolicyAction: async () => ({
        error: "ARCHIVED_DOCUMENT_RETENTION_POLICY_INVALID",
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Retention" }));
    fireEvent.click(screen.getByRole("button", { name: "Save retention" }));

    expect(await screen.findByText("Choose a valid retention period.")).toBeTruthy();
  });
```

- [ ] **Step 2: Run component tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: FAIL because the retention props and settings UI do not exist.

- [ ] **Step 3: Extend WorkspaceSettingsPanel props and state**

Change the existing lucide import from:

```ts
import { Bot, FileText, Upload, X } from "lucide-react";
```

to:

```ts
import { Bot, Clock3, FileText, Upload, X } from "lucide-react";
```

Add this retention helper import near the RAG settings import:

```ts
import {
  ARCHIVED_DOCUMENT_RETENTION_POLICIES,
  archivedDocumentRetentionLabel,
  type ArchivedDocumentRetentionPolicyValue,
} from "@/lib/workspaces/retention-policy";
```

Add this action result type near `MarkdownImportActionResult`:

```ts
export type RetentionPolicyActionResult = {
  archivedDocumentRetentionPolicy?: ArchivedDocumentRetentionPolicyValue;
  error?: string;
};
```

Change `SettingsSection`:

```ts
type SettingsSection = "import" | "ai" | "retention";
```

Add props to `WorkspaceSettingsPanel`:

```ts
  archivedDocumentRetentionPolicy,
  updateRetentionPolicyAction,
```

Add prop types:

```ts
  archivedDocumentRetentionPolicy: ArchivedDocumentRetentionPolicyValue;
  updateRetentionPolicyAction: (formData: FormData) => Promise<RetentionPolicyActionResult>;
```

Add state near the AI model state:

```ts
  const [selectedRetentionPolicy, setSelectedRetentionPolicy] =
    useState<ArchivedDocumentRetentionPolicyValue>(archivedDocumentRetentionPolicy);
  const [retentionStatus, setRetentionStatus] = useState<string | null>(null);
  const [isRetentionPending, startRetentionTransition] = useTransition();
```

- [ ] **Step 4: Add the retention submit handler**

Inside `WorkspaceSettingsPanel`, add this callback before `return (`:

```ts
  const handleSaveRetentionPolicy = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite || isRetentionPending) return;

    const formData = new FormData(event.currentTarget);
    startRetentionTransition(async () => {
      const result = await updateRetentionPolicyAction(formData);
      if (result.error || !result.archivedDocumentRetentionPolicy) {
        setRetentionStatus("Choose a valid retention period.");
        return;
      }

      setSelectedRetentionPolicy(result.archivedDocumentRetentionPolicy);
      setRetentionStatus(
        `Saved retention: ${archivedDocumentRetentionLabel(
          result.archivedDocumentRetentionPolicy,
        )}`,
      );
    });
  }, [canWrite, isRetentionPending, updateRetentionPolicyAction]);
```

- [ ] **Step 5: Add the Retention nav button**

In the settings nav, add this button after `AI`:

```tsx
            <Button
              type="button"
              aria-label="Retention"
              aria-pressed={activeSection === "retention"}
              onClick={() => setActiveSection("retention")}
              className={settingsNavButtonClassName(activeSection === "retention")}
            >
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              Retention
            </Button>
```

- [ ] **Step 6: Render the retention section**

Replace the final AI-only ternary branch with an explicit three-section branch. The retention branch should render this section:

```tsx
          {activeSection === "retention" ? (
            <section aria-label="Document retention settings" className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">Workspace</p>
                  <h3 className="mt-2 text-2xl font-semibold text-ink">
                    Document retention
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Permanently delete documents after they have been in trash.
                  </p>
                </div>
                <Button
                  type="button"
                  aria-label="Close settings"
                  onClick={() => {
                    if (!isImportActive) onClose();
                  }}
                  disabled={isImportActive}
                  className="ml-auto h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <form onSubmit={handleSaveRetentionPolicy} className="space-y-4">
                <div>
                  <label
                    htmlFor="archivedDocumentRetentionPolicy"
                    className="text-sm font-semibold text-ink"
                  >
                    Deleted document retention
                  </label>
                  <select
                    id="archivedDocumentRetentionPolicy"
                    name="archivedDocumentRetentionPolicy"
                    aria-label="Deleted document retention"
                    value={selectedRetentionPolicy}
                    onChange={(event) =>
                      setSelectedRetentionPolicy(
                        event.target.value as ArchivedDocumentRetentionPolicyValue,
                      )
                    }
                    disabled={!canWrite || isRetentionPending}
                    className="mt-3 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {ARCHIVED_DOCUMENT_RETENTION_POLICIES.map((policy) => (
                      <option key={policy.value} value={policy.value}>
                        {policy.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="submit"
                    disabled={!canWrite || isRetentionPending}
                    className="h-10"
                  >
                    Save retention
                  </Button>
                  {retentionStatus ? (
                    <p role="status" className="text-sm font-medium text-slate-700">
                      {retentionStatus}
                    </p>
                  ) : null}
                </div>
              </form>
            </section>
          ) : null}
```

Keep the existing Import and AI sections unchanged except for converting the conditional rendering to support the third section.

- [ ] **Step 7: Run the component tests**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: PASS.

---

### Task 6: Wiki Maintenance And Final Verification

**Files:**
- Modify: `wiki/Document Knowledge Model.md`
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/Next.js Prisma Monolith.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Review staged sync plan after source changes**

Run:

```bash
pnpm wiki:sync-plan --staged
```

Expected: It lists the retention-related source files and candidate wiki pages.

- [ ] **Step 2: Update wiki pages from planned to implemented**

Update `wiki/Document Knowledge Model.md` so the Issue #119 paragraph says:

```md
Issue #119 adds `Workspace.archivedDocumentRetentionPolicy` as a workspace-wide archived document retention policy. Values are `NEVER`, `DAYS_7`, `DAYS_30`, and `DAYS_90`, with `DAYS_30` as the default for new and existing workspaces. The policy is DB-backed rather than browser-local and is used by the archived document purge CLI to calculate each workspace's `archivedAt` cutoff.
```

Update `wiki/Document Editing Workflow.md` so the archive section says:

```md
Issue #119 adds a `Retention` section to workspace settings. Workspace writers can save `Never`, `7 days`, `30 days`, or `90 days`; the default policy is `30 days`. Saving this setting does not delete documents during the request. Hard delete is performed only by the CLI/tools purge command against archived documents whose `archivedAt` is older than the workspace policy cutoff.
```

Update `wiki/Next.js Prisma Monolith.md` so the maintenance paragraph says:

```md
Issue #119 keeps archived document purge inside the monolith as a CLI/tools maintenance command. `pnpm run documents:purge-archived` invokes a Prisma-backed service that reads workspace retention policies and hard deletes expired archived documents. The command supports `--dry-run` and `--workspace <workspaceSlug>`, and production can run it from host cron, Docker `tools`, or a future scheduled workflow.
```

Update `wiki/index.md` status board retention bullet so it uses present tense:

```md
- Document retention: Issue #119 adds a workspace settings `Retention` section and stores `Never`, `7 days`, `30 days`, or `90 days` as a DB-backed policy. The default is `30 days`; `pnpm run documents:purge-archived` hard deletes expired archived documents by `archivedAt` cutoff. Archived folder hard delete and attachment storage file cleanup remain follow-ups.
```

Add a top entry to `wiki/log.md`:

```md
## 2026-06-20T14:30:00+09:00 - implementation

- Result: Implemented Issue #119 archived document retention settings and purge command.
- Coverage: Added DB-backed workspace retention policy with 30-day default, settings-panel Retention section, server action validation, archived document purge service, CLI dry-run/delete modes, and scoped workspace purge.
- Pages: [[Document Knowledge Model]], [[Document Editing Workflow]], [[Next.js Prisma Monolith]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #119, `prisma/schema.prisma`, `lib/workspaces/retention-policy.ts`, `lib/workspaces/retention-service.ts`, `components/workspace-settings-panel.tsx`, `lib/documents/purge-archived.ts`, `lib/documents/purge-archived-cli.ts`, `scripts/documents/purge-archived.ts`, `package.json`, `tests/workspaces/retention-policy.test.ts`, `tests/workspaces/retention-service.test.ts`, `tests/documents/purge-archived.test.ts`, `tests/documents/purge-archived-cli.test.ts`, `tests/workspace-actions.test.ts`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/workspaces/retention-policy.test.ts tests/workspaces/retention-service.test.ts tests/documents/purge-archived.test.ts tests/documents/purge-archived-cli.test.ts tests/workspace-actions.test.ts tests/components/document-list.test.tsx`, `pnpm exec tsc --noEmit --pretty false`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.
```

- [ ] **Step 3: Regenerate manifest and run wiki lint**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: `wiki:manifest` writes `wiki/manifest.json`. `wiki:lint` exits 0. The existing unresolved image warning in `wiki/designs/sidebar.md` can remain if it is still present and unrelated.

- [ ] **Step 4: Run focused verification**

Run:

```bash
pnpm exec vitest run tests/workspaces/retention-policy.test.ts tests/workspaces/retention-service.test.ts tests/documents/purge-archived.test.ts tests/documents/purge-archived-cli.test.ts tests/workspace-actions.test.ts tests/components/document-list.test.tsx
pnpm exec tsc --noEmit --pretty false
git diff --check
```

Expected: All commands pass. If DB-backed tests fail because `DATABASE_URL` or Postgres is unavailable, start the local Postgres service using the repo's approved Docker workflow, then rerun the same Vitest command.

- [ ] **Step 5: Run staged wiki guard**

Run:

```bash
git add -- prisma/schema.prisma prisma/migrations/20260620140000_add_archived_document_retention_policy/migration.sql lib/workspaces/retention-policy.ts lib/workspaces/retention-service.ts lib/documents/purge-archived.ts lib/documents/purge-archived-cli.ts scripts/documents/purge-archived.ts package.json 'app/workspaces/[workspaceSlug]/actions.ts' 'app/workspaces/[workspaceSlug]/page.tsx' components/document-list.tsx components/workspace-settings-panel.tsx tests/workspaces/retention-policy.test.ts tests/workspaces/retention-service.test.ts tests/documents/purge-archived.test.ts tests/documents/purge-archived-cli.test.ts tests/workspace-actions.test.ts tests/components/document-list.test.tsx 'wiki/Document Knowledge Model.md' 'wiki/Document Editing Workflow.md' 'wiki/Next.js Prisma Monolith.md' wiki/index.md wiki/log.md wiki/manifest.json
pnpm wiki:sync-check --staged
```

Expected: staged sync-check exits 0 and reports both source changes and wiki maintenance changes.

- [ ] **Step 6: Commit**

Run:

```bash
git commit -m "Add archived document retention purge settings"
```

Expected: pre-commit wiki checks pass and the implementation commit is created.
