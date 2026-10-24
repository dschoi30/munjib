import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { parseDataset } from "@/lib/rag/evaluation/schema";
import { seedEvaluationCase } from "@/scripts/rag/eval-seed";
import { indexSavedDocument } from "@/lib/rag/index-document";
import { buildVectorSearchSql, searchSimilarChunks, toPgVectorLiteral } from "@/lib/rag/vector-store";

it("detects a removed retrieval authorization filter using pre-indexed forbidden evidence", async () => {
  const dataset=parseDataset(JSON.parse(readFileSync("tests/fixtures/rag-eval/core-ko-v1.json","utf8")));
  const item=dataset.cases.find(c=>c.id==="ko-26")!;
  const fixture=await seedEvaluationCase(prisma,dataset,item,randomUUID());
  const embedding=[1,...Array(1023).fill(0)] as number[];
  const model="ollama:bge-m3:1024";
  try {
    for (const key of ["leave","restricted"]) {
      const document=await prisma.document.findUniqueOrThrow({where:{id:fixture.documentIds.get(key)!}});
      await indexSavedDocument({document,embeddingModel:model,embedText:async()=>embedding});
    }
    const readableIds=[fixture.documentIds.get("leave")!];
    const chunks=await searchSimilarChunks({workspaceId:fixture.workspace.id,embeddingModel:model,embedding,readableDocumentIds:readableIds,limit:60});
    expect(chunks.map(c=>c.documentId)).toEqual(readableIds);
    const brokenSql=buildVectorSearchSql().replace('"DocumentChunk"."documentId" = ANY(CAST($4 AS text[]))','CAST($4 AS text[]) IS NOT NULL');
    const withoutAuthorization=await prisma.$queryRawUnsafe<{documentId:string}[]>(brokenSql,toPgVectorLiteral(embedding),fixture.workspace.id,model,readableIds,60);
    expect(withoutAuthorization.some(c=>c.documentId===fixture.documentIds.get("restricted"))).toBe(true);
    expect(dataset.documents.find(d=>d.key==="restricted")?.authorizationProbe).toBe(true);
  } finally { await fixture.cleanup(); }
});
