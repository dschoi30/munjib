import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const script = readFileSync(
  join(process.cwd(), "scripts/test/run-security-runtime-smoke.sh"),
  "utf8",
);

describe("security runtime smoke launcher", () => {
  test("exports the generated auth secret instead of placing it in env argv", () => {
    const exportIndex = script.indexOf("export NEXTAUTH_SECRET=");
    const envIndex = script.indexOf("\nenv \\");

    expect(exportIndex).toBeGreaterThanOrEqual(0);
    expect(envIndex).toBeGreaterThan(exportIndex);

    const envBlockEnd = script.indexOf("\nSERVER_PID=", envIndex);
    const envBlock = script.slice(envIndex, envBlockEnd);
    expect(envBlock).not.toMatch(/^\s+NEXTAUTH_SECRET=/m);
  });

  test("installs cleanup immediately after work creation and guards partial state", () => {
    const workIndex = script.indexOf('WORK="$(mktemp -d');
    const trapIndex = script.indexOf("trap cleanup EXIT INT TERM");
    const passwordIndex = script.indexOf(
      'openssl rand -base64 48 > "$SECURITY_RUNTIME_FIXTURE_PASSWORD_FILE"',
    );

    expect(workIndex).toBeGreaterThanOrEqual(0);
    expect(trapIndex).toBeGreaterThan(workIndex);
    expect(trapIndex).toBeLessThan(passwordIndex);
    expect(script).toContain('"${SERVER_PID:-}"');
    expect(script).toContain('"${FIXTURE_CREATED:-false}"');
    expect(script).toContain('"${WORK:-}"');
  });
});
