import { pathToFileURL } from "node:url";
import { runAuthPreflight } from "./auth-preflight";
import { readStrictSecretFileFromTemporaryPath } from "../../lib/security/strict-secret-file";

/**
 * Test-only bridge: the bytes remain in a 0400 temporary file and are injected
 * into the strict validator seam. The temporary loader performs the same
 * descriptor checks as production (owner, mode, link count, bounded size,
 * race, and content). The validator still receives the production fixed
 * `/run/secrets/<name>` logical path; no secret is placed in env/argv.
 */
export async function runAuthRuntimePreflightFromFile() {
  const file = process.env.NEXTAUTH_SECRET_FILE;
  if (!file) throw new Error("AUTH_RUNTIME_SECRET_FILE_REQUIRED");
  runAuthPreflight({
    env: {
      MUNJIB_DEPLOYMENT_ENV: "production",
      NEXTAUTH_SECRET_FILE: "/run/secrets/munjib_nextauth_secret",
      NEXTAUTH_URL: "https://munjib.example.test",
      NEXTAUTH_COOKIE_SECURE: "true",
      MUNJIB_ENABLE_DEV_LOGIN: "false",
    },
    deps: {
      readStrictSecretFile: ({ logicalName, expectedUid, maximumBytes }) =>
        readStrictSecretFileFromTemporaryPath({
          logicalName,
          path: file,
          expectedUid,
          maximumBytes,
        }),
    },
    write: (line) => {
      if (!line.startsWith("AUTH_PREFLIGHT_OK ")) throw new Error("AUTH_RUNTIME_PREFLIGHT_INVALID");
      console.log(line);
    },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runAuthRuntimePreflightFromFile().catch((error) => {
    console.error(error instanceof Error ? error.message : "AUTH_RUNTIME_PREFLIGHT_FAILED");
    process.exitCode = 1;
  });
}
