import { spawnSync } from "node:child_process";

const MINIMUM_SUPPORTED_NEXT = /^15\.\d+\.\d+$/;

export function parseCandidate(value: string): string {
  if (!/^\d+\.\d+\.\d+$/.test(value) || !MINIMUM_SUPPORTED_NEXT.test(value)) {
    throw new Error("candidate must be an exact Next.js 15 version");
  }
  return value;
}

export function parsePageCounts(stdout: string): number[] {
  const text = stdout.trim();
  if (!text) throw new Error("advisory response was empty");
  const lines = text.split(/\r?\n/);
  if (lines.some((line) => !/^\d+$/.test(line))) {
    throw new Error("advisory response was malformed or truncated");
  }
  return lines.map((line) => {
    const value = Number(line);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("advisory count was invalid");
    }
    return value;
  });
}

export function queryAdvisories(candidate: string): number {
  const result = spawnSync(
    "gh",
    [
      "api",
      "--paginate",
      `/advisories?affects=next@${candidate}&per_page=100`,
      "--jq",
      'if type == "array" then length else error("invalid advisories page") end',
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (result.error || result.status !== 0) {
    throw new Error("GitHub advisory API request failed");
  }
  const counts = parsePageCounts(result.stdout);
  return counts.reduce((total, count) => total + count, 0);
}

export function parseArguments(argv: string[]): string {
  if (argv.length !== 2 || argv[0] !== "--candidate") {
    throw new Error("usage: check-next-advisories.ts --candidate <15.x.y>");
  }
  return parseCandidate(argv[1]!);
}

export function main(argv = process.argv.slice(2)): number {
  try {
    const candidate = parseArguments(argv);
    const count = queryAdvisories(candidate);
    if (count !== 0) {
      process.stderr.write(`NEXT_ADVISORIES_MATCH candidate=${candidate} count=${count}\n`);
      return 1;
    }
    process.stdout.write(`candidate=${candidate} count=${count}\n`);
    return 0;
  } catch {
    process.stderr.write("NEXT_ADVISORIES_FAILED\n");
    return 1;
  }
}

if (process.argv[1]?.endsWith("check-next-advisories.ts")) {
  process.exitCode = main();
}
