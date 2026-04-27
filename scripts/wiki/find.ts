import { searchWiki } from "@/lib/wiki/search";

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  const results = await searchWiki(query);

  if (results.length === 0) {
    console.log("wiki miss, use rg next");
    process.exit(0);
  }

  for (const result of results) {
    console.log(`${result.path} | ${result.title} | ${result.type} | ${result.status}`);
    console.log(result.summary);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
