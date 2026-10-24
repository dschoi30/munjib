import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { EvalCase, EvalDataset } from "../../lib/rag/evaluation/schema";

export function evaluationDatabase(env: Record<string, string | undefined>): string {
  if (env.RAG_EVAL_ENVIRONMENT !== "evaluation" || env.NODE_ENV === "production" || !env.RAG_EVAL_DATABASE_URL) throw new Error("EVALUATION_DATABASE_REQUIRED");
  const url = new URL(env.RAG_EVAL_DATABASE_URL);
  if (!["postgres:","postgresql:"].includes(url.protocol) || !/^\/munjib_rag_eval(?:_[a-z0-9]+)?$/.test(url.pathname) || (url.search && url.searchParams.get("schema") !== "public") || [...url.searchParams.keys()].some(k => k !== "schema")) throw new Error("UNSAFE_EVALUATION_DATABASE");
  return url.toString();
}
export async function seedEvaluationCase(db: PrismaClient, dataset: EvalDataset, item: EvalCase, runId: string) {
  const marker = `rag-eval-${runId}-${item.id}`;
  const user = await db.user.create({ data: { name: marker, email: `${randomUUID()}@rag-eval.invalid` } });
  let organizationId: string | undefined;
  const cleanup = async () => {
    if (organizationId) {
      // Verify ownership before deleting; never reset or drop a database.
      const owned = await db.organization.findFirst({ where: { id: organizationId, slug: marker, name: marker } });
      if (!owned) throw new Error("EVAL_OWNERSHIP_LOST");
      const documents = await db.document.findMany({ where: { workspace: { organizationId } }, select: { id: true } });
      await db.permission.deleteMany({ where: { resourceType: "DOCUMENT", resourceId: { in: documents.map(d => d.id) } } });
      await db.organization.delete({ where: { id: organizationId } });
    }
    await db.user.delete({ where: { id: user.id } });
  };
  try {
    const organization = await db.organization.create({ data: { name: marker, slug: marker } });
    organizationId = organization.id;
    const workspace = await db.workspace.create({ data: { organizationId, name: marker, slug: marker, members: { create: { userId: user.id, role: "VIEWER" } } } });
    const documentIds = new Map<string,string>();
    for (const doc of dataset.documents) {
      const document = await db.document.create({ data: { workspaceId: workspace.id, title: doc.title, slug: doc.key, path: doc.key, contentMarkdown: doc.content, contentText: doc.content, createdById: user.id, updatedById: user.id } });
      documentIds.set(doc.key, document.id);
      if (!item.readableDocumentKeys.includes(doc.key)) await db.permission.create({ data: { resourceType: "DOCUMENT", resourceId: document.id, subjectType: "USER", subjectId: `not-${user.id}`, permission: "READ" } });
    }
    if (item.history.length) {
      const thread = await db.aiChatThread.create({ data: { workspaceId: workspace.id, userId: user.id } });
      for (let i=0; i<item.history.length; i++) await db.aiChatMessage.create({ data: { threadId: thread.id, ...item.history[i], createdAt: new Date(Date.UTC(2026,0,1,0,0,i)) } });
    }
    return { user, workspace, documentIds, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
