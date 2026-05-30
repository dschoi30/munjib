import { prisma } from "@/lib/db/client";
import { ensureDocumentChunkVectorIndex } from "@/lib/rag/vector-index";

async function main() {
  await ensureDocumentChunkVectorIndex();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
