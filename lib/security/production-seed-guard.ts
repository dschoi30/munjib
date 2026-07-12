/**
 * The Prisma seed is a local-development fixture operation.  It must never
 * be a convenient way to mutate a staging or production database.
 */
export function assertProductionSeedForbidden(
  env: Record<string, string | undefined>,
) {
  if (env.MUNJIB_DEPLOYMENT_ENV !== "development") {
    throw new Error("PRODUCTION_SEED_FORBIDDEN");
  }
}
