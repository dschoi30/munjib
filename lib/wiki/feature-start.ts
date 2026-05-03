import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CreatedIssue = {
  number: number;
  url: string;
};

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

export type FeatureStartStatus =
  | "created-with-branch"
  | "created-without-branch"
  | "created-branch-step-failed"
  | "manual-fallback";

export type FeatureStartResult = {
  status: FeatureStartStatus;
  issue?: CreatedIssue;
  currentBranch?: string;
  branchName?: string;
  message: string;
};

const MAX_SLUG_LENGTH = 72;

export const defaultCommandRunner: CommandRunner = async (command, args) => {
  const { stdout, stderr } = await execFileAsync(command, args);
  return { stdout: String(stdout), stderr: String(stderr) };
};

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

  const branchName = buildBranchName(issue.number, title);

  let currentBranch: string;
  try {
    currentBranch = (await runner("git", ["branch", "--show-current"])).stdout.trim();
  } catch (error) {
    return {
      status: "created-branch-step-failed",
      issue,
      branchName,
      message: [
        `Created GitHub issue: ${issue.url}`,
        `Branch detection failed: ${errorMessage(error)}`,
        `Create or switch to branch ${branchName} manually before implementation.`,
        'Read relevant wiki pages with `pnpm wiki:find "<topic>"` or `wiki/index.md` before implementation.',
      ].join("\n"),
    };
  }

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

  try {
    await runner("git", ["switch", "-c", branchName]);
  } catch (error) {
    return {
      status: "created-branch-step-failed",
      issue,
      currentBranch,
      branchName,
      message: [
        `Created GitHub issue: ${issue.url}`,
        `Branch creation failed for ${branchName}.`,
        `Reason: ${errorMessage(error)}`,
        `Create or switch to branch ${branchName} manually before implementation.`,
        'Read relevant wiki pages with `pnpm wiki:find "<topic>"` or `wiki/index.md` before implementation.',
      ].join("\n"),
    };
  }

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
