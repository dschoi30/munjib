import { NextResponse } from "next/server";
import { resolveAnonymousTrialActor, resolveAnonymousTrialCapability } from "@/lib/auth/trial-entitlement";
import { readTrialAttachment } from "@/lib/workspaces/trial-attachments";

export async function GET(request:Request,{params}:{params:Promise<{attachmentId:string}>}) {
  const deny=()=>NextResponse.json({error:"ATTACHMENT_NOT_FOUND"},{status:404,headers:{"cache-control":"private, no-store"}});
  const actor=resolveAnonymousTrialActor(request,resolveAnonymousTrialCapability());
  if(!actor) return deny();
  try {
    const result=await readTrialAttachment(actor.authorizationPrincipal,(await params).attachmentId);
    if(!result)return deny();
    return new NextResponse(new Uint8Array(result.bytes),{headers:{
      "content-type":result.mimeType,"content-length":String(result.bytes.length),
      "content-disposition": `inline; filename="attachment"; filename*=UTF-8''${encodeURIComponent(result.fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      "cache-control":"private, no-store","x-content-type-options":"nosniff",
      "content-security-policy":"sandbox; default-src 'none'",
    }});
  } catch {return deny();}
}
