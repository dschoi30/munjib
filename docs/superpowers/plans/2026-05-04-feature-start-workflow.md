# Feature Start Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `pnpm wiki:feature-start "<title>"` so new feature work starts from a GitHub issue and creates an issue branch from `main` when appropriate.

**Architecture:** Put reusable behavior in `lib/wiki/feature-start.ts` and keep `scripts/wiki/feature-start.ts` as a thin CLI wrapper. The library exposes pure helpers for slugging, issue parsing, branch decisions, template rendering, and an injectable command runner for `gh` and `git`.

**Tech Stack:** TypeScript, Node `child_process.execFile`, pnpm scripts, Vitest, existing wiki markdown/manifest tooling.

---

## File Structure

- Create `lib/wiki/feature-start.ts`: helper functions and orchestration for issue creation, fallback rendering, current branch lookup, and branch creation.
- Create `scripts/wiki/feature-start.ts`: CLI entrypoint that passes `process.argv` title text into the library and prints results.
- Create `tests/wiki/feature-start.test.ts`: unit tests for helpers and simulated command-runner behavior.
- Modify `package.json`: add `wiki:feature-start`.
- Modify `AGENTS.md`: add the new start-of-feature rule before implementation work.
- Modify `wiki/Wiki Maintenance Automation.md`: document the Feature Start loop.
- Modify `wiki/Local Development Workflow.md`: add the command and branch behavior.
- Modify `wiki/index.md`, `wiki/manifest.json`, `wiki/log.md`: update navigation metadata and maintenance chronology if the content changes.

### Task 1: Feature Start Library Helpers

**Files:**
- Create: `lib/wiki/feature-start.ts`
- Test: `tests/wiki/feature-start.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `tests/wiki/feature-start.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  buildBranchName,
  buildIssueBody,
  formatManualFallback,
  parseIssueFromGhOutput,
  shouldCreateFeatureBranch,
  slugifyFeatureTitle,
} from "@/lib/wiki/feature-start";

describe("feature start helpers", () => {
  it("creates readable ascii slugs", () => {
    expect(slugifyFeatureTitle("Add graph filter controls")).toBe("add-graph-filter-controls");
    expect(slugifyFeatureTitle("  Add: issue + branch workflow!  ")).toBe("add-issue-branch-workflow");
    expect(slugifyFeatureTitle("검색 필터 추가")).toBe("feature");
  });

  it("builds issue-number branch names", () => {
    expect(buildBranchName(16, "Systematize feature start issue and branch workflow")).toBe(
      "issue-16-systematize-feature-start-issue-and-branch-workflow",
    );
  });

  it("parses issue number and url from gh output", () => {
    expect(parseIssueFromGhOutput("https://github.com/dschoi30/munjib/issues/16\n")).toEqual({
      number: 16,
      url: "https://github.com/dschoi30/munjib/issues/16",
    });
  });

  it("decides branch creation only from main", () => {
    expect(shouldCreateFeatureBranch("main")).toBe(true);
    expect(shouldCreateFeatureBranch("issue-16-existing")).toBe(false);
  });

  it("builds the reusable issue body without inventing product requirements", () => {
    expect(buildIssueBody("Add graph filter controls")).toContain("## Summary\n\nAdd graph filter controls");
    expect(buildIssueBody("Add graph filter controls")).toContain("Created from `pnpm wiki:feature-start`.");
  });

  it("formats a manual fallback with the issue body and branch guidance", () => {
    const fallback = formatManualFallback("Add graph filter controls", "gh auth failed");

    expect(fallback).toContain("GitHub issue was not created automatically.");
    expect(fallback).toContain("Reason: gh auth failed");
    expect(fallback).toContain("Title:\nAdd graph filter controls");
    expect(fallback).toContain("issue-manual-add-graph-filter-controls");
    expect(fallback).toContain("Do not start implementation until the GitHub issue exists.");
  });
});
```

- [ ] **Step 2: Run the helper tests and confirm they fail**

Run:

```bash
pnpm exec vitest run tests/wiki/feature-start.test.ts
```

Expected: FAIL because `@/lib/wiki/feature-start` does not exist.

- [ ] **Step 3: Implement helper functions**

Create `lib/wiki/feature-start.ts` with this initial content:

```ts
export type CreatedIssue = {
  number: number;
  url: string;
};

const MAX_SLUG_LENGTH = 72;

export function slugifyFeatureTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");

  return slug.length > 0 ? slug : "feature";
}

export function buildBranchName(issueNumber: number, title: string): string {
  return `issue-${issueNumber}-${slugifyFeatureTitle(title)}`;
}

export function buildManualBranchName(title: string): string {
  return `issue-manual-${slugifyFeatureTitle(title)}`;
}

export function parseIssueFromGhOutput(output: string): CreatedIssue {
  const url = output
    .split(/\s+/)
    .map((part) => part.trim())
    .find((part) => /^https:\/\/github\.com\/.+\/.+\/issues\/\d+$/.test(part));

  if (!url) {
    throw new Error("Could not find a GitHub issue URL in gh output.");
  }

  const numberText = url.match(/\/issues\/(\d+)$/)?.[1];
  const number = Number.parseInt(numberText ?? "", 10);
  if (!Number.isInteger(number)) {
    throw new Error(`Could not parse issue number from ${url}.`);
  }

  return { number, url };
}

export function shouldCreateFeatureBranch(currentBranch: string): boolean {
  return currentBranch.trim() === "main";
}

export function buildIssueBody(title: string): string {
  return [
    "## Summary",
    "",
    title,
    "",
    "## Scope",
    "",
    '- [ ] Confirm relevant wiki pages with `pnpm wiki:find "<topic>"` or `wiki/index.md`',
    "- [ ] Identify source evidence or existing behavior",
    "- [ ] Implement the smallest coherent feature slice",
    "- [ ] Update wiki pages and `wiki/log.md` if durable knowledge changes",
    "- [ ] Run targeted tests and wiki checks",
    "",
    "## Notes",
    "",
    "Created from `pnpm wiki:feature-start`.",
  ].join("\n");
}

export function formatManualFallback(title: string, reason: string): string {
  return [
    "GitHub issue was not created automatically.",
    `Reason: ${reason}`,
    "",
    "Create the issue manually with this content before implementation starts.",
    "",
    "Title:",
    title,
    "",
    "Body:",
    buildIssueBody(title),
    "",
    "Branch guidance:",
    `- Before the issue number is known: ${buildManualBranchName(title)}`,
    `- After the issue number is known: issue-<number>-${slugifyFeatureTitle(title)}`,
    "",
    "Do not start implementation until the GitHub issue exists.",
  ].join("\n");
}
```

- [ ] **Step 4: Run the helper tests and confirm they pass**

Run:

```bash
pnpm exec vitest run tests/wiki/feature-start.test.ts
```

Expected: PASS for all helper tests.

### Task 2: Command Runner Orchestration

**Files:**
- Modify: `lib/wiki/feature-start.ts`
- Modify: `tests/wiki/feature-start.test.ts`

- [ ] **Step 1: Add failing orchestration tests**

Replace the import block from `@/lib/wiki/feature-start` in `tests/wiki/feature-start.test.ts` with:

```ts
import {
  buildBranchName,
  buildIssueBody,
  formatManualFallback,
  parseIssueFromGhOutput,
  runFeatureStart,
  shouldCreateFeatureBranch,
  slugifyFeatureTitle,
  type CommandRunner,
} from "@/lib/wiki/feature-start";
```

Append these tests:

```ts
describe("runFeatureStart", () => {
  it("creates an issue and branch when running from main", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      if (command === "gh") return { stdout: "https://github.com/dschoi30/munjib/issues/16\n", stderr: "" };
      if (command === "git" && args[0] === "branch") return { stdout: "main\n", stderr: "" };
      if (command === "git" && args[0] === "switch") return { stdout: "", stderr: "" };
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    };

    const result = await runFeatureStart("Add graph filter controls", { runner });

    expect(result.status).toBe("created-with-branch");
    expect(result.issue?.number).toBe(16);
    expect(result.branchName).toBe("issue-16-add-graph-filter-controls");
    expect(calls.map((call) => `${call.command} ${call.args.join(" ")}`)).toEqual([
      "gh issue create --title Add graph filter controls --body ## Summary\n\nAdd graph filter controls\n\n## Scope\n\n- [ ] Confirm relevant wiki pages with `pnpm wiki:find \"<topic>\"` or `wiki/index.md`\n- [ ] Identify source evidence or existing behavior\n- [ ] Implement the smallest coherent feature slice\n- [ ] Update wiki pages and `wiki/log.md` if durable knowledge changes\n- [ ] Run targeted tests and wiki checks\n\n## Notes\n\nCreated from `pnpm wiki:feature-start`.",
      "git branch --show-current",
      "git switch -c issue-16-add-graph-filter-controls",
    ]);
  });

  it("creates an issue without switching when already on a feature branch", async () => {
    const runner: CommandRunner = async (command, args) => {
      if (command === "gh") return { stdout: "https://github.com/dschoi30/munjib/issues/17\n", stderr: "" };
      if (command === "git" && args[0] === "branch") return { stdout: "issue-16-existing\n", stderr: "" };
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    };

    const result = await runFeatureStart("Add graph filter controls", { runner });

    expect(result.status).toBe("created-without-branch");
    expect(result.branchName).toBeUndefined();
    expect(result.currentBranch).toBe("issue-16-existing");
  });

  it("returns manual fallback when gh issue creation fails", async () => {
    const runner: CommandRunner = async (command) => {
      if (command === "gh") throw new Error("gh auth failed");
      throw new Error(`Unexpected command: ${command}`);
    };

    const result = await runFeatureStart("Add graph filter controls", { runner });

    expect(result.status).toBe("manual-fallback");
    expect(result.message).toContain("Reason: gh auth failed");
    expect(result.message).toContain("Do not start implementation until the GitHub issue exists.");
  });
});
```

- [ ] **Step 2: Run orchestration tests and confirm they fail**

Run:

```bash
pnpm exec vitest run tests/wiki/feature-start.test.ts
```

Expected: FAIL because `runFeatureStart` and `CommandRunner` are not implemented.

- [ ] **Step 3: Implement orchestration**

Append this code to `lib/wiki/feature-start.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

export type FeatureStartStatus = "created-with-branch" | "created-without-branch" | "manual-fallback";

export type FeatureStartResult = {
  status: FeatureStartStatus;
  issue?: CreatedIssue;
  currentBranch?: string;
  branchName?: string;
  message: string;
};

export const defaultCommandRunner: CommandRunner = async (command, args) => {
  const { stdout, stderr } = await execFileAsync(command, args);
  return { stdout, stderr };
};

export async function runFeatureStart(
  rawTitle: string,
  options: { runner?: CommandRunner } = {},
): Promise<FeatureStartResult> {
  const title = rawTitle.trim();
  if (!title) {
    throw new Error('Usage: pnpm wiki:feature-start "<feature title>"');
  }

  const runner = options.runner ?? defaultCommandRunner;

  let issue: CreatedIssue;
  try {
    const created = await runner("gh", ["issue", "create", "--title", title, "--body", buildIssueBody(title)]);
    issue = parseIssueFromGhOutput(`${created.stdout}\n${created.stderr}`);
  } catch (error) {
    return {
      status: "manual-fallback",
      message: formatManualFallback(title, errorMessage(error)),
    };
  }

  const currentBranch = (await runner("git", ["branch", "--show-current"])).stdout.trim();
  if (!shouldCreateFeatureBranch(currentBranch)) {
    return {
      status: "created-without-branch",
      issue,
      currentBranch,
      message: [
        `Created GitHub issue: ${issue.url}`,
        `Current branch is ${currentBranch}; no new branch was created.`,
        'Read relevant wiki pages with `pnpm wiki:find "<topic>"` or `wiki/index.md` before implementation.',
      ].join("\n"),
    };
  }

  const branchName = buildBranchName(issue.number, title);
  await runner("git", ["switch", "-c", branchName]);

  return {
    status: "created-with-branch",
    issue,
    currentBranch,
    branchName,
    message: [
      `Created GitHub issue: ${issue.url}`,
      `Created and switched to branch: ${branchName}`,
      'Read relevant wiki pages with `pnpm wiki:find "<topic>"` or `wiki/index.md` before implementation.',
    ].join("\n"),
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
```

- [ ] **Step 4: Move imports to the top if TypeScript requires it**

If the append places `import` statements below exports, move these two lines to the top of `lib/wiki/feature-start.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
```

- [ ] **Step 5: Run tests and confirm they pass**

Run:

```bash
pnpm exec vitest run tests/wiki/feature-start.test.ts
```

Expected: PASS.

### Task 3: CLI Script And Package Command

**Files:**
- Create: `scripts/wiki/feature-start.ts`
- Modify: `package.json`
- Test: `tests/wiki/feature-start.test.ts`

- [ ] **Step 1: Create the CLI script**

Create `scripts/wiki/feature-start.ts`:

```ts
import { runFeatureStart } from "@/lib/wiki/feature-start";

async function main() {
  const title = process.argv.slice(2).join(" ");
  const result = await runFeatureStart(title);
  console.log(result.message);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 2: Add the package script**

Modify `package.json` scripts so the wiki script block includes:

```json
"wiki:feature-start": "tsx scripts/wiki/feature-start.ts",
```

Place it near `wiki:find`, `wiki:log`, `wiki:lint`, and `wiki:manifest`.

- [ ] **Step 3: Run the targeted unit tests**

Run:

```bash
pnpm exec vitest run tests/wiki/feature-start.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the command without a title**

Run:

```bash
pnpm wiki:feature-start
```

Expected: exits non-zero and prints:

```text
Usage: pnpm wiki:feature-start "<feature title>"
```

### Task 4: Workflow Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `wiki/Wiki Maintenance Automation.md`
- Modify: `wiki/Local Development Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update `AGENTS.md`**

Add this section before `## Wiki-First Lookup`:

````md
## Feature Start Workflow

Before implementing a new feature, create a GitHub issue by running:

```bash
pnpm wiki:feature-start "<feature title>"
```

The command should create the issue with GitHub CLI when possible. If GitHub CLI is unavailable or unauthenticated, use the printed issue template to create the issue manually before implementation starts.

When the current branch is `main`, the command creates and switches to `issue-<number>-<slug>`. When the current branch is already a feature branch or worktree branch, stay on that branch unless there is a concrete reason to split the work.
````

- [ ] **Step 2: Update `wiki/Wiki Maintenance Automation.md`**

Add a `## Feature Start 루프` section before `## Ingest 루프`:

````md
## Feature Start 루프

신규 기능 구현은 source 변경 전에 GitHub issue를 먼저 만든다.

```bash
pnpm wiki:feature-start "<feature title>"
```

이 명령은 `gh issue create`를 우선 사용한다. GitHub CLI가 없거나 인증되지 않았거나 네트워크 문제로 실패하면 issue title/body template과 수동 branch guidance를 출력한다. 이 fallback은 구현 시작 허가가 아니라 수동으로 issue를 발행하라는 복구 경로다.

현재 branch가 `main`이면 issue 번호 기반 `issue-<number>-<slug>` branch를 만들고 전환한다. 이미 feature branch나 worktree branch에 있으면 현재 branch를 유지한다. 이렇게 하면 기존 격리 작업공간을 방해하지 않으면서 `main`에서 바로 기능을 구현하는 실수를 줄인다.
````

- [ ] **Step 3: Update `wiki/Local Development Workflow.md`**

Add `pnpm wiki:feature-start "<feature title>"` to the wiki maintenance command block, then add:

````md
## Feature start

신규 기능 source 변경 전에는 GitHub issue를 먼저 발행한다.

```bash
pnpm wiki:feature-start "<feature title>"
```

성공 시 issue URL을 출력한다. 현재 branch가 `main`이면 `issue-<number>-<slug>` branch를 생성하고 전환한다. 이미 feature branch이면 branch를 새로 만들지 않는다.

`gh issue create`가 실패하면 issue template을 출력한다. 이 경우 구현을 시작하기 전에 출력된 template으로 GitHub issue를 수동 생성한다.
````

- [ ] **Step 4: Update index and log**

In `wiki/index.md`, make sure the workflow status board still points to `[[Wiki Maintenance Automation]]` and `[[Local Development Workflow]]`. If the summaries need to mention feature-start, update them.

Append this entry to `wiki/log.md` with the current date:

```md
## 2026-05-04T00:00:00+09:00 - maintenance

- Source evidence: GitHub issue #16, `docs/superpowers/specs/2026-05-04-feature-start-workflow-design.md`, `docs/superpowers/plans/2026-05-04-feature-start-workflow.md`, `AGENTS.md`, `scripts/wiki/feature-start.ts`, `lib/wiki/feature-start.ts`, `package.json`.
- Affected pages: [[Wiki Maintenance Automation]], [[Local Development Workflow]], [[index|Wiki Index]].
- Result: 신규 기능 구현 전 GitHub issue를 발행하고, `main`에서는 issue branch를 생성하는 feature-start workflow를 wiki 운영 절차에 추가했다.
- Verification: `pnpm exec vitest run tests/wiki/feature-start.test.ts`, `pnpm wiki:manifest`, `pnpm wiki:lint`.
```

If the exact time matters, replace `00:00:00+09:00` with the actual local time before committing.

- [ ] **Step 5: Regenerate manifest**

Run:

```bash
pnpm wiki:manifest
```

Expected: `wiki/manifest.json` updates only if frontmatter metadata changed.

### Task 5: Final Verification And Commit

**Files:**
- All files changed by Tasks 1-4

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm exec vitest run tests/wiki/feature-start.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run wiki checks**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: PASS with no unresolved links or manifest drift.

- [ ] **Step 3: Review changed files**

Run:

```bash
git status --short
git diff --stat
git diff -- AGENTS.md package.json lib/wiki/feature-start.ts scripts/wiki/feature-start.ts tests/wiki/feature-start.test.ts wiki docs/superpowers
```

Expected: changes are limited to the feature-start workflow, tests, docs, and manifest/log updates.

- [ ] **Step 4: Run commit-time wiki sync check**

Run:

```bash
git add AGENTS.md package.json lib/wiki/feature-start.ts scripts/wiki/feature-start.ts tests/wiki/feature-start.test.ts wiki docs/superpowers/specs/2026-05-04-feature-start-workflow-design.md docs/superpowers/plans/2026-05-04-feature-start-workflow.md
pnpm wiki:sync-plan --staged
pnpm wiki:sync-check --staged
```

Expected: sync check passes because source changes and wiki maintenance files are both staged.

- [ ] **Step 5: Commit**

Run:

```bash
git commit -m "feat: add feature start workflow"
```

Expected: commit succeeds after the pre-commit hook runs `pnpm wiki:sync-check --staged` and `pnpm wiki:lint`.
