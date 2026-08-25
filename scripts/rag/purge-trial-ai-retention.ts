import { prisma } from "@/lib/db/client";
import { runTrialAiRetentionCli } from "@/lib/rag/trial-ai-retention-cli";

async function main() {
  try {
    await runTrialAiRetentionCli();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
