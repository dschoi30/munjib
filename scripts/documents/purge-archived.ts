import { prisma } from "@/lib/db/client";
import { runPurgeArchivedDocumentsCli } from "@/lib/documents/purge-archived-cli";

async function main() {
  try {
    await runPurgeArchivedDocumentsCli();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
