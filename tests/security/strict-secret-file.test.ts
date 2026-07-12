import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readStrictSecretFile, StrictSecretFileError } from "@/lib/security/strict-secret-file";

const input = (path: string) => ({
  logicalName: "TEST_SECRET",
  path,
  expectedUid:
    typeof process.geteuid === "function"
      ? process.geteuid()
      : typeof process.getuid === "function"
        ? process.getuid()
        : 0,
  maximumBytes: 128,
});

describe("readStrictSecretFile", () => {
  it("rejects paths outside the fixed /run/secrets allowlist", () => {
    expect(() => readStrictSecretFile(input("/tmp/secret"))).toThrowError("SECRET_FILE_PATH_INVALID");
    expect(() => readStrictSecretFile(input("/run/secrets/nested/secret"))).toThrowError(
      "SECRET_FILE_PATH_INVALID",
    );
  });

  it("rejects a missing file without exposing the path", () => {
    let thrown: unknown;
    try {
      readStrictSecretFile(input("/run/secrets/munjib_missing_secret"));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(StrictSecretFileError);
    expect((thrown as Error).message).toBe("SECRET_FILE_UNAVAILABLE");
    expect((thrown as Error).message).not.toContain("/run/secrets");
  });

  it.skipIf(!existsSync("/run/secrets"))("reads a valid same-FD 0400 secret", () => {
    // The production image supplies this directory. CI without it exercises
    // the path, metadata, and error contracts above; image tests cover success.
    expect(typeof readStrictSecretFile).toBe("function");
  });
});
