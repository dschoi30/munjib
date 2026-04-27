import { buildWikiManifest, writeWikiManifest } from "@/lib/wiki/manifest";

async function main() {
  const manifest = await buildWikiManifest();
  await writeWikiManifest(process.cwd(), manifest);
  console.log(`wrote wiki/manifest.json with ${manifest.pages.length} pages`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
