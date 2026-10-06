import type { AiAuthorizationPrincipal } from "@/lib/auth/trial-entitlement";
import { prisma } from "@/lib/db/client";
import type { DocumentLinkPanels } from "@/lib/wiki-links/types";
import { parseFrontmatterWikiLinks } from "@/lib/wiki-links/parser";

type TrialDocument = Readonly<{
  id: string; title: string; contentMarkdown: string; status: "ACTIVE";
  slug: string; path: string; contentText: string; folderId: string | null; updatedAt: Date;
}>;
type TrialFolder = Readonly<{ id: string; parentFolderId: string | null; name: string; path: string }>;
type TrialLink = Readonly<{
  id: string; sourceDocumentId: string; targetDocumentId: string | null;
  targetTitleRaw: string; alias: string | null; isBroken: boolean; isAmbiguous: boolean;
}>;
type TrialWorkspaceRecord = Readonly<{
  id: string; slug: string; name: string; archivedAt: Date | null;
  documents: readonly TrialDocument[]; folders: readonly TrialFolder[];
}>;
export type TrialWorkspaceViewer = Readonly<{
  id: string; slug: string; name: string;
  documents: readonly TrialDocument[]; folders: readonly TrialFolder[]; links: readonly TrialLink[];
}>;
type TrialViewerStore = Readonly<{
  findWorkspace(input: Readonly<{ id: string; slug: string }>): Promise<TrialWorkspaceRecord | null>;
  listExplicitDocumentIds(documentIds: readonly string[]): Promise<readonly string[]>;
  listDocumentLinks(workspaceId: string, readableDocumentIds: readonly string[]): Promise<readonly TrialLink[]>;
}>;

export async function loadTrialWorkspaceViewer(
  principal: AiAuthorizationPrincipal, requestedSlug: string,
  store: TrialViewerStore = prismaTrialViewerStore,
): Promise<TrialWorkspaceViewer | null> {
  if (principal.kind !== "anonymous-trial-demo" || principal.access !== "viewer-only") return null;
  if (requestedSlug !== principal.workspaceSlug) return null;
  const workspace = await store.findWorkspace({ id: principal.workspaceId, slug: requestedSlug });
  if (!workspace || workspace.archivedAt !== null || workspace.id !== principal.workspaceId) return null;
  const explicitIds = new Set(workspace.documents.length
    ? await store.listExplicitDocumentIds(workspace.documents.map(d => d.id)) : []);
  const documents = workspace.documents.filter(d => d.status === "ACTIVE" && !explicitIds.has(d.id));
  const readableIds = new Set(documents.map(d => d.id));
  const foldersById = new Map(workspace.folders.map(folder => [folder.id, folder]));
  const visibleFolderIds = new Set<string>();
  for (const document of documents) {
    let folderId = document.folderId;
    while (folderId && !visibleFolderIds.has(folderId)) {
      const folder = foldersById.get(folderId);
      if (!folder) break;
      visibleFolderIds.add(folderId);
      folderId = folder.parentFolderId;
    }
  }
  const links = documents.length ? await store.listDocumentLinks(workspace.id, [...readableIds]) : [];
  return {
    id: workspace.id, slug: workspace.slug, name: workspace.name, documents,
    folders: workspace.folders.filter(folder => visibleFolderIds.has(folder.id)).map(({ id, parentFolderId, name, path }) => ({ id, parentFolderId, name, path })),
    links: links.filter(l => readableIds.has(l.sourceDocumentId) && (!l.targetDocumentId || readableIds.has(l.targetDocumentId))),
  };
}

export function trialDocumentLinkPanels(workspace: TrialWorkspaceViewer, documentId: string): DocumentLinkPanels {
  const document = workspace.documents.find(d => d.id === documentId);
  if (!document) return { outgoing: [], backlinks: [], brokenLinks: [], ambiguousLinks: [] };
  const summary = (d: TrialDocument) => ({ id: d.id, title: d.title, slug: d.slug, path: d.path });
  const byId = new Map(workspace.documents.map(d => [d.id, d]));
  const order = new Map(parseFrontmatterWikiLinks(document.contentMarkdown).map((l, i) => [l.targetTitleRaw.toLowerCase(), i]));
  const outgoing = workspace.links.filter(l => l.sourceDocumentId === documentId && order.has(l.targetTitleRaw.toLowerCase()))
    .sort((a,b) => order.get(a.targetTitleRaw.toLowerCase())! - order.get(b.targetTitleRaw.toLowerCase())!)
    .map(l => ({ id:l.id, targetTitleRaw:l.targetTitleRaw, alias:l.alias, isBroken:l.isBroken, isAmbiguous:l.isAmbiguous,
      targetDocument:l.targetDocumentId && byId.has(l.targetDocumentId) ? summary(byId.get(l.targetDocumentId)!) : null }));
  return {
    outgoing,
    backlinks: workspace.links.filter(l => l.targetDocumentId === documentId && !l.isBroken && byId.has(l.sourceDocumentId))
      .map(l => ({ id:l.id, sourceDocument:summary(byId.get(l.sourceDocumentId)!) })),
    brokenLinks: outgoing.filter(l => l.isBroken).map(({id,targetTitleRaw,alias}) => ({id,targetTitleRaw,alias})),
    ambiguousLinks: outgoing.filter(l => l.isAmbiguous).map(({id,targetTitleRaw,alias}) => ({id,targetTitleRaw,alias})),
  };
}

/** Only display fields cross the Server Component boundary; no storage keys, user IDs or historical bodies. */
export async function loadTrialDocumentDetails(workspace: TrialWorkspaceViewer, documentId: string) {
  if (!workspace.documents.some(d => d.id === documentId)) return null;
  const details = await prisma.document.findFirst({
    where: { id:documentId, workspaceId:workspace.id, status:"ACTIVE", workspace:{archivedAt:null} },
    select: {
      versions: { orderBy:{versionNumber:"desc"}, select:{id:true,versionNumber:true,title:true,changeSummary:true} },
      attachments: { orderBy:{createdAt:"desc"}, select:{id:true,fileName:true,mimeType:true,size:true} },
      properties: { orderBy:[{sortOrder:"asc"},{key:"asc"}], select:{id:true,key:true,valueJson:true} },
      tags: { select:{tag:{select:{id:true,name:true}}} },
      comments: { orderBy:{createdAt:"asc"}, select:{id:true,body:true} },
    },
  });
  if (!details) return null;
  const auditLogs = await prisma.auditLog.findMany({ where:{resourceType:"document",resourceId:documentId},orderBy:{createdAt:"desc"},take:10,select:{id:true,action:true} });
  return {...details,auditLogs};
}

const prismaTrialViewerStore: TrialViewerStore = {
  findWorkspace({ id, slug }) {
    return prisma.workspace.findFirst({ where:{id,slug,archivedAt:null}, select:{
      id:true,slug:true,name:true,archivedAt:true,
      folders:{where:{status:"ACTIVE"},orderBy:{path:"asc"},select:{id:true,parentFolderId:true,name:true,path:true}},
      documents:{where:{status:"ACTIVE"},orderBy:{updatedAt:"desc"},select:{
        id:true,title:true,slug:true,path:true,folderId:true,contentText:true,contentMarkdown:true,status:true,updatedAt:true,
      }},
    }}) as Promise<TrialWorkspaceRecord | null>;
  },
  async listExplicitDocumentIds(documentIds) {
    const rows = await prisma.permission.findMany({where:{resourceType:"DOCUMENT",resourceId:{in:[...documentIds]}},distinct:["resourceId"],select:{resourceId:true}});
    return rows.map(row => row.resourceId);
  },
  listDocumentLinks(workspaceId, ids) {
    return prisma.documentLink.findMany({where:{workspaceId,sourceDocumentId:{in:[...ids]},OR:[{targetDocumentId:null},{targetDocumentId:{in:[...ids]}}]},
      orderBy:[{sourceDocumentId:"asc"},{sortOrder:"asc"},{id:"asc"}],
      select:{id:true,sourceDocumentId:true,targetDocumentId:true,targetTitleRaw:true,alias:true,isBroken:true,isAmbiguous:true}});
  },
};
