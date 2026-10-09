import { resolveLaunchAccountSeeds } from "../../lib/auth/launch-accounts";
import { pathToFileURL } from "node:url";
import { assertValidAuthRuntimeEnv } from "../../lib/auth/runtime";

export function runAuthPreflight(input: {
  env: Record<string, string | undefined>;
  deps?: Parameters<typeof assertValidAuthRuntimeEnv>[1];
  write(line: string): void;
}) {
  const config = assertValidAuthRuntimeEnv(input.env, input.deps);
  resolveLaunchAccountSeeds(input.env);
  input.write(
    `AUTH_PREFLIGHT_OK deployment=${config.deploymentEnvironment} secureCookies=${config.secureCookies} developmentLogin=${config.developmentLoginEnabled} passwordSignup=${config.passwordSignupEnabled} oauthSignup=${config.oauthSignupEnabled}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    runAuthPreflight({ env: process.env, write: (line) => console.log(line) });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "AUTH_PREFLIGHT_FAILED");
    process.exitCode = 1;
  }
}
