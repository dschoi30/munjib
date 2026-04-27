import { lintWiki } from "@/lib/wiki/lint";

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
