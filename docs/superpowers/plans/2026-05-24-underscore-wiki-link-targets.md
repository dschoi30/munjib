# Underscore Wiki Link Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve wiki-link targets written with underscores, such as `[[수에즈_운하_위기]]`, to matching documents whose titles or paths use spaces.

**Architecture:** Keep raw markdown and stored `DocumentLink.targetTitleRaw` unchanged. Add Unicode-preserving wiki-link-target-only lookup helpers in `lib/wiki-links/targets.ts`, then use those helpers in both frontmatter reconciliation and preview rendering. Do not change global `slugifyTitle()` behavior or document creation path rules.

**Tech Stack:** TypeScript, Next.js App Router, Prisma, Vitest, Munjib wiki maintenance scripts.

---

## File Structure

- Modify `lib/wiki-links/targets.ts`: add underscore-aware lookup helpers for title and path-qualified wiki-link target comparison.
- Modify `lib/wiki-links/reconcile.ts`: replace direct `slugifyTitle()` and document-path comparison with target lookup helpers.
- Modify `lib/wiki-links/preview.ts`: build and query preview candidate maps with the same lookup helpers.
- Modify `tests/wiki-links/reconcile.test.ts`: add DB-backed regression coverage for frontmatter underscore targets.
- Modify `tests/wiki-links/preview.test.ts`: add pure preview regression coverage for underscore targets.
- Modify `wiki/Wiki Links And Backlinks.md`, `wiki/log.md`, and `wiki/manifest.json`: update durable implementation knowledge after code changes.

### Task 1: Add Failing Regression Tests

**Files:**
- Modify: `tests/wiki-links/preview.test.ts`
- Modify: `tests/wiki-links/reconcile.test.ts`

- [ ] **Step 1: Add preview tests that should fail before implementation**

In `tests/wiki-links/preview.test.ts`, add these tests before the final closing `});`:

```ts
  it("resolves underscore targets to titles with spaces", () => {
    const candidates = buildWikiLinkPreviewCandidateMap([
      {
        id: "suez",
        slug: "수에즈-운하-위기",
        title: "수에즈 운하 위기",
        path: "/수에즈-운하-위기",
      },
    ]);

    expect(renderPreviewMarkdownWithWikiLinks("[[수에즈_운하_위기]]", candidates)).toBe(
      "[수에즈_운하_위기](?document=suez)",
    );
  });

  it("resolves underscore path-qualified targets segment by segment", () => {
    const candidates = buildWikiLinkPreviewCandidateMap([
      {
        id: "suez",
        slug: "수에즈-운하-위기",
        title: "수에즈 운하 위기",
        path: "/history/수에즈-운하-위기",
      },
    ]);

    expect(renderPreviewMarkdownWithWikiLinks("[[History/수에즈_운하_위기]]", candidates)).toBe(
      "[History/수에즈_운하_위기](?document=suez)",
    );
  });
```

- [ ] **Step 2: Add reconciliation tests that should fail before implementation**

In `tests/wiki-links/reconcile.test.ts`, add these tests near the existing path-qualified reconciliation tests:

```ts
  it("resolves frontmatter underscore targets to document titles with spaces", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const target = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "수에즈 운하 위기",
      contentMarkdown: "",
    });

    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Source",
      contentMarkdown: "---\nlinks:\n  - \"[[수에즈_운하_위기]]\"\n---\n",
    });

    const link = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id },
    });
    expect(link.targetTitleRaw).toBe("수에즈_운하_위기");
    expect(link.targetDocumentId).toBe(target.id);
    expect(link.isBroken).toBe(false);
    expect(link.isAmbiguous).toBe(false);
  });

  it("resolves frontmatter underscore path-qualified targets segment by segment", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const history = await createFolder({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      parentFolderId: null,
      name: "History",
    });
    const target = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      folderId: history.id,
      title: "수에즈 운하 위기",
      contentMarkdown: "",
    });

    const source = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Source",
      contentMarkdown: "---\nlinks:\n  - \"[[History/수에즈_운하_위기]]\"\n---\n",
    });

    const link = await prisma.documentLink.findFirstOrThrow({
      where: { sourceDocumentId: source.id },
    });
    expect(link.targetTitleRaw).toBe("History/수에즈_운하_위기");
    expect(link.targetDocumentId).toBe(target.id);
    expect(link.isBroken).toBe(false);
    expect(link.isAmbiguous).toBe(false);
  });
```

- [ ] **Step 3: Run preview test and confirm the new preview cases fail**

Run:

```bash
pnpm exec vitest run tests/wiki-links/preview.test.ts
```

Expected: FAIL for the two new underscore preview tests. Existing preview tests should still pass.

- [ ] **Step 4: Run reconciliation test and confirm the new DB-backed cases fail**

Run:

```bash
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/reconcile.test.ts
```

Expected: FAIL for the two new underscore reconciliation tests. Existing reconciliation tests should still pass.

- [ ] **Step 5: Keep failing tests staged for the implementation task**

```bash
git status --short
```

Expected: `tests/wiki-links/preview.test.ts` and `tests/wiki-links/reconcile.test.ts` are modified. Do not commit yet; this repository's pre-commit wiki sync guard requires source/test changes and wiki maintenance to land together.

### Task 2: Add Shared Wiki-Link Lookup Normalization

**Files:**
- Modify: `lib/wiki-links/targets.ts`
- Modify: `lib/wiki-links/reconcile.ts`
- Modify: `lib/wiki-links/preview.ts`

- [ ] **Step 1: Add target lookup helpers**

In `lib/wiki-links/targets.ts`, add these helpers after the import:

```ts
export function wikiLinkTargetToLookupKey(targetTitleRaw: string) {
  return slugifyTitle(normalizeWikiLinkTargetForLookup(targetTitleRaw));
}

export function pathQualifiedTargetToLookupDocumentPath(targetTitleRaw: string) {
  const segments = targetTitleRaw
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) => wikiLinkTargetToLookupKey(segment))
    .filter(Boolean);
  return `/${segments.join("/")}`;
}

function normalizeWikiLinkTargetForLookup(targetTitleRaw: string) {
  return targetTitleRaw
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ");
}
```

Keep `pathQualifiedTargetToDocumentPath()` and `pathQualifiedTargetToCreateInput()` unchanged so document path creation and broken-link creation behavior do not change.

- [ ] **Step 2: Use lookup helpers in reconciliation**

In `lib/wiki-links/reconcile.ts`, replace the imports:

```ts
import { slugifyTitle } from "@/lib/text/slug";
import { parseFrontmatterWikiLinks } from "@/lib/wiki-links/parser";
import { pathQualifiedTargetToDocumentPath } from "@/lib/wiki-links/targets";
```

with:

```ts
import { parseFrontmatterWikiLinks } from "@/lib/wiki-links/parser";
import {
  pathQualifiedTargetToLookupDocumentPath,
  wikiLinkTargetToLookupKey,
} from "@/lib/wiki-links/targets";
```

Then update `resolveLinkTarget()`:

```ts
  if (targetTitleRaw.includes("/")) {
    const targetPath = pathQualifiedTargetToLookupDocumentPath(targetTitleRaw);
    const target = targets.find((candidate) => candidate.path === targetPath);
    if (target) {
      return {
        targetDocumentId: target.id,
        isBroken: false,
        isAmbiguous: false,
      };
    }
  }

  const targetSlug = wikiLinkTargetToLookupKey(targetTitleRaw);
  const matches = targets.filter((candidate) => wikiLinkTargetToLookupKey(candidate.title) === targetSlug);
```

- [ ] **Step 3: Use lookup helpers in preview candidate maps and lookups**

In `lib/wiki-links/preview.ts`, replace:

```ts
import { slugifyTitle } from "@/lib/text/slug";
import { pathQualifiedTargetToLookupKey } from "@/lib/wiki-links/targets";
```

with:

```ts
import {
  pathQualifiedTargetToLookupKey,
  wikiLinkTargetToLookupKey,
} from "@/lib/wiki-links/targets";
```

In `buildWikiLinkPreviewCandidateMap()`, replace:

```ts
    const titleSlug = slugifyTitle(candidate.title);
    setUniqueCandidate(candidateBySlug, titleSlug, candidate);
```

with:

```ts
    const titleSlug = wikiLinkTargetToLookupKey(candidate.title);
    setUniqueCandidate(candidateBySlug, titleSlug, candidate);
```

In `candidateLookupKeys()`, replace:

```ts
  return targetTitle.includes("/")
    ? [pathQualifiedTargetToLookupKey(targetTitle), slugifyTitle(targetTitle)]
    : [slugifyTitle(targetTitle)];
```

with:

```ts
  return targetTitle.includes("/")
    ? [pathQualifiedTargetToLookupKey(targetTitle), wikiLinkTargetToLookupKey(targetTitle)]
    : [wikiLinkTargetToLookupKey(targetTitle)];
```

Update `pathQualifiedTargetToLookupKey()` in `lib/wiki-links/targets.ts` to call `pathQualifiedTargetToLookupDocumentPath()`:

```ts
export function pathQualifiedTargetToLookupKey(targetTitleRaw: string) {
  return pathQualifiedTargetToLookupDocumentPath(targetTitleRaw).replace(/^\/+/, "");
}
```

Also add and use `pathQualifiedCandidateToTitleLookupKey(candidate)` so Korean titles whose stored path segment is `untitled` can still resolve by parent path plus document title:

```ts
export function pathQualifiedCandidateToTitleLookupKey(candidate: { path: string; title: string }) {
  const parentPath = candidate.path.replace(/^\/+|\/+$/g, "").split("/").slice(0, -1).join("/");
  const titleKey = wikiLinkTargetToLookupKey(candidate.title);
  return [parentPath, titleKey].filter(Boolean).join("/");
}
```

- [ ] **Step 4: Run targeted wiki-link tests**

Run:

```bash
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts
```

Expected: PASS. The suite should report all preview and reconciliation tests passing.

- [ ] **Step 5: Keep implementation changes uncommitted for the wiki update task**

```bash
git status --short
```

Expected: wiki-link library files and wiki-link tests are modified. Do not commit yet; Task 3 will update wiki maintenance files and commit the coherent source+wiki slice.

### Task 3: Update Wiki And Final Verification

**Files:**
- Modify: `wiki/Wiki Links And Backlinks.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update wiki implementation wording**

In `wiki/Wiki Links And Backlinks.md`, revise the Issue #59 paragraph so it says the behavior is implemented, not only designed:

```md
Issue #59는 wiki link target matching에서 underscore를 공백처럼 취급하도록 frontmatter reconciliation과 preview rendering을 함께 조정했다. 예를 들어 `[[수에즈_운하_위기]]`는 `수에즈 운하 위기` 문서로 resolve되지만, source markdown과 `DocumentLink.targetTitleRaw`의 raw target text는 rewrite하지 않는다. 이 규칙은 path-qualified target의 각 segment에도 적용하되 document slug/path 생성 규칙 자체는 바꾸지 않는다.
```

- [ ] **Step 2: Add final wiki log entry**

In `wiki/log.md`, add a new entry above the design entry:

```md
## 2026-05-24T14:00:00+09:00 - bugfix

- Result: Issue #59 underscore wiki link target matching을 구현했다.
- Coverage: Body preview links와 frontmatter `links:` reconciliation은 target lookup에서 underscore를 공백처럼 취급한다. Raw markdown과 `DocumentLink.targetTitleRaw`는 보존하며, path-qualified target은 segment별 lookup normalization을 적용한다.
- Pages: [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: GitHub issue #59, `lib/wiki-links/targets.ts`, `lib/wiki-links/reconcile.ts`, `lib/wiki-links/preview.ts`, `tests/wiki-links/preview.test.ts`, `tests/wiki-links/reconcile.test.ts`.
- Verification: `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.
```

Increment `source_count` in `wiki/log.md` by 1.

- [ ] **Step 3: Regenerate manifest and run wiki checks**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: both commands pass, and `wiki/manifest.json` updates source counts.

- [ ] **Step 4: Run final verification**

Run:

```bash
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55434/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts
pnpm exec tsc --noEmit
git add lib/wiki-links/targets.ts lib/wiki-links/reconcile.ts lib/wiki-links/preview.ts tests/wiki-links/preview.test.ts tests/wiki-links/reconcile.test.ts wiki/Wiki Links And Backlinks.md wiki/log.md wiki/manifest.json
pnpm wiki:sync-check --staged
```

Expected: all commands pass. If `wiki:sync-check --staged` reports source changes and wiki maintenance changes, that is acceptable only when the command exits 0.

- [ ] **Step 5: Commit implementation, tests, and wiki updates**

```bash
git commit -m "fix: resolve underscore wiki link targets"
```
