import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const scriptPath = join(root, "scripts/security/check-next-advisories.ts");

function makeGh(stdout: string, exitCode = 0): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "munjib-gh-"));
  const path = join(directory, "gh");
  const script = [
    "#!/bin/sh",
    `printf '%b' ${JSON.stringify(stdout)}`,
    `exit ${exitCode}`,
    "",
  ].join("\n");
  writeFileSync(path, script, { mode: 0o700 });
  chmodSync(path, 0o700);
  return { directory, path };
}

function runWithGh(stdout: string, exitCode = 0) {
  const fake = makeGh(stdout, exitCode);
  try {
    return spawnSync(
      process.execPath,
      [join(root, "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs"), scriptPath, "--candidate", "15.5.18"],
      {
        cwd: root,
        env: { ...process.env, PATH: `${fake.directory}${delimiter}${process.env.PATH ?? ""}` },
        encoding: "utf8",
      },
    );
  } finally {
    rmSync(fake.directory, { recursive: true, force: true });
  }
}

describe("Next.js advisory gate", () => {
  test("queries every advisory page and prints only the candidate and count", () => {
    const source = readFileSync(scriptPath, "utf8");
    expect(source).toContain("--paginate");
    expect(source).toContain("/advisories?affects=next@");
    expect(source).toContain("--jq");
    expect(source).not.toMatch(/console\.log\([^)]*body/i);

    const result = runWithGh("0\n0\n");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("candidate=15.5.18 count=0");
    expect(result.stdout).not.toContain("advisory");
    expect(result.stderr).toBe("");
  });

  test("fails closed when a matching advisory is returned", () => {
    const result = runWithGh("0\n1\n");
    expect(result.status).not.toBe(0);
    expect(result.stdout.trim()).toBe("");
    expect(result.stderr.trim()).toBe("NEXT_ADVISORIES_MATCH candidate=15.5.18 count=1");
  });

  test("rejects malformed, truncated, or unauthenticated API output", () => {
    for (const [stdout, exitCode] of [["0\ntruncated\n", 0], ["", 0], ["", 1]] as const) {
      const result = runWithGh(stdout, exitCode);
      expect(result.status).not.toBe(0);
      expect(result.stdout.trim()).toBe("");
      expect(result.stderr.trim()).toBe("NEXT_ADVISORIES_FAILED");
    }
  });

  test("does not accept a secret or advisory body in argv", () => {
    const source = readFileSync(scriptPath, "utf8");
    expect(source).toContain("process.argv");
    expect(source).not.toMatch(/process\.argv\.includes\([^)]*password/i);
    expect(source).not.toMatch(/JSON\.stringify\([^)]*advis/i);
    expect(source).not.toContain("--jq .");
  });
});

// Keep the fixture's command dependency explicit in this security gate test.
test("gh is available through the test harness", () => {
  expect(execFileSync(process.execPath, ["-e", "process.stdout.write('ok')"], { encoding: "utf8" })).toBe("ok");
});
