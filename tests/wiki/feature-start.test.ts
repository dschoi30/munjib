import { describe, expect, it } from "vitest";
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

  it("returns branch guidance when branch lookup fails after creating an issue", async () => {
    const runner: CommandRunner = async (command, args) => {
      if (command === "gh") return { stdout: "https://github.com/dschoi30/munjib/issues/18\n", stderr: "" };
      if (command === "git" && args[0] === "branch") throw new Error("not a git repository");
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    };

    const result = await runFeatureStart("Add graph filter controls", { runner });

    expect(result.status).toBe("created-branch-step-failed");
    expect(result.issue?.url).toBe("https://github.com/dschoi30/munjib/issues/18");
    expect(result.branchName).toBe("issue-18-add-graph-filter-controls");
    expect(result.message).toContain("Created GitHub issue: https://github.com/dschoi30/munjib/issues/18");
    expect(result.message).toContain("Branch detection failed: not a git repository");
    expect(result.message).toContain(
      "Create or switch to branch issue-18-add-graph-filter-controls manually before implementation.",
    );
  });

  it("returns branch guidance when branch creation fails after creating an issue", async () => {
    const runner: CommandRunner = async (command, args) => {
      if (command === "gh") return { stdout: "https://github.com/dschoi30/munjib/issues/19\n", stderr: "" };
      if (command === "git" && args[0] === "branch") return { stdout: "main\n", stderr: "" };
      if (command === "git" && args[0] === "switch") throw new Error("branch already exists");
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    };

    const result = await runFeatureStart("Add graph filter controls", { runner });

    expect(result.status).toBe("created-branch-step-failed");
    expect(result.issue?.url).toBe("https://github.com/dschoi30/munjib/issues/19");
    expect(result.branchName).toBe("issue-19-add-graph-filter-controls");
    expect(result.message).toContain("Created GitHub issue: https://github.com/dschoi30/munjib/issues/19");
    expect(result.message).toContain("Branch creation failed for issue-19-add-graph-filter-controls");
    expect(result.message).toContain("Reason: branch already exists");
  });
});
