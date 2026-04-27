import { buildWikiManifest, writeWikiManifest } from "@/lib/wiki/manifest";

const manifest = await buildWikiManifest();
await writeWikiManifest(process.cwd(), manifest);
console.log(`wrote wiki/manifest.json with ${manifest.pages.length} pages`);
