import type { WorkspaceRole } from "@prisma/client";

/** Local fixtures only. Runtime privileged identities are resolved lazily below. */
export const launchAccountSeeds = [
  { email: "admin@example.invalid", name: "Munjib Admin", workspaceRole: "ADMIN" },
  { email: "trial@example.invalid", name: "Munjib Trial", workspaceRole: "VIEWER" },
] as const satisfies ReadonlyArray<{
  email: string;
  name: string;
  workspaceRole: WorkspaceRole;
}>;

export function resolveLaunchAccountSeeds(
  env: Record<string, string | undefined> = process.env,
): ReadonlyArray<Omit<(typeof launchAccountSeeds)[number], "email"> & { email: string }> {
  const raw = [env.MUNJIB_LAUNCH_ADMIN_EMAIL, env.MUNJIB_LAUNCH_VIEWER_EMAIL];
  const deployment = env.MUNJIB_DEPLOYMENT_ENV?.trim().toLowerCase();
  if (deployment && !["development", "staging", "production"].includes(deployment)) {
    throw new Error("LAUNCH_ACCOUNT_CONFIG_INVALID");
  }
  const strict = deployment ? deployment !== "development" : env.NODE_ENV === "production";
  if (raw.every(value => value === undefined || value === "") && !strict) {
    return launchAccountSeeds;
  }
  const emails = raw.map(value => {
    // Configuration errors must never include the privileged identity value.
    if (!value || value !== value.trim() || value.length > 320 ||
      /[\s\x00-\x1f\x7f-\x9f]/u.test(value) || !/^[^@]+@[^@]+\.[^@]+$/u.test(value)) {
      throw new Error("LAUNCH_ACCOUNT_CONFIG_INVALID");
    }
    return value.toLowerCase();
  });
  if (emails[0] === emails[1]) throw new Error("LAUNCH_ACCOUNT_CONFIG_INVALID");
  return launchAccountSeeds.map((account, index) => ({ ...account, email: emails[index]! }));
}
