/**
 * The package/Prisma seed entry point is a local-development convenience.
 * Keep the direct prisma/seed.ts guard strict, while making the documented
 * local command explicit about the environment it is allowed to mutate.
 */
export function configureLocalSeedEnvironment(
  env: Record<string, string | undefined>,
): string {
  const configured = env.MUNJIB_DEPLOYMENT_ENV?.trim();
  if (!configured) {
    env.MUNJIB_DEPLOYMENT_ENV = "development";
    return "development";
  }

  return configured;
}
