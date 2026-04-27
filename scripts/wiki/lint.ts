import { lintWiki } from "@/lib/wiki/lint";

async function main() {
  const result = await lintWiki();

  for (const warning of result.warnings) {
    console.warn(`WARN ${warning}`);
  }

  for (const error of result.errors) {
    console.error(`ERROR ${error}`);
  }

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
