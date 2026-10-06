import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AiAuthorizationPrincipal } from "@/lib/auth/trial-entitlement";
import { prisma } from "@/lib/db/client";
import { resolveAttachmentStoragePath } from "@/lib/attachments/storage-key";

type AttachmentRecord = {
  id:string;documentId:string;fileName:string;mimeType:string;size:number;storageKey:string;
  document:{workspaceId:string;status:string;workspace:{archivedAt:Date|null}};
};
type Dependencies = {
  findAttachment(id:string):Promise<AttachmentRecord|null>;
  hasExplicitPermission(documentId:string):Promise<boolean>;
  readBytes(filePath:string):Promise<Buffer>;
};
const defaults:Dependencies = {
  findAttachment:id=>prisma.attachment.findUnique({where:{id},select:{id:true,documentId:true,fileName:true,mimeType:true,size:true,storageKey:true,
    document:{select:{workspaceId:true,status:true,workspace:{select:{archivedAt:true}}}}}}),
  hasExplicitPermission:async id=>(await prisma.permission.count({where:{resourceType:"DOCUMENT",resourceId:id}}))>0,
  readBytes:readFile,
};
export async function readTrialAttachment(principal:AiAuthorizationPrincipal, id:string, deps:Dependencies=defaults) {
  if(principal.kind!=="anonymous-trial-demo" || principal.access!=="viewer-only") return null;
  const row=await deps.findAttachment(id);
  if(!row || row.id!==id || row.document.workspaceId!==principal.workspaceId || row.document.status!=="ACTIVE" || row.document.workspace.archivedAt!==null) return null;
  if(await deps.hasExplicitPermission(row.documentId)) return null;
  let filePath:string;
  try { filePath=resolveAttachmentStoragePath(path.join(process.cwd(),"storage","attachments"),row.storageKey,principal.workspaceId); }
  catch { return null; }
  try {
    const bytes=await deps.readBytes(filePath);
    return {id:row.id,fileName:row.fileName,mimeType:row.mimeType,bytes};
  } catch { return null; }
}
