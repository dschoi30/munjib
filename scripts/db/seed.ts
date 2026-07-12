import { configureLocalSeedEnvironment } from "../../lib/security/seed-environment";

configureLocalSeedEnvironment(process.env);

// Keep the guard in prisma/seed.ts strict for direct invocations. This wrapper
// is the only entry point used by local package/Prisma seed commands and makes
// their development intent explicit without overriding production/staging.
async function main() {
  await import("../../prisma/seed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
