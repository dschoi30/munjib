import { runFeatureStart } from "@/lib/wiki/feature-start";

async function main() {
  const title = process.argv.slice(2).join(" ");
  const result = await runFeatureStart(title);
  console.log(result.message);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
