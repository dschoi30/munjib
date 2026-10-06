import { describe, expect, it, vi } from "vitest";
import { readTrialAttachment } from "@/lib/workspaces/trial-attachments";
const principal = {kind:"anonymous-trial-demo",capabilityId:"anonymous-trial-v1",workspaceId:"demo",workspaceSlug:"demo",access:"viewer-only",trialVisitorSubject:"opaque"} as const;
const record = {id:"file-1",documentId:"doc-1",fileName:"guide.txt",mimeType:"text/plain",size:4,storageKey:"demo/12345678-1234-4234-8234-123456789abc-guide.txt",document:{workspaceId:"demo",status:"ACTIVE",workspace:{archivedAt:null}}};
describe("Trial attachment access",()=>{
  it("reads bytes only for a public document in the exact active demo workspace",async()=>{
    const readBytes=vi.fn(async()=>Buffer.from("demo"));
    const result=await readTrialAttachment(principal,"file-1",{findAttachment:async()=>record,hasExplicitPermission:async()=>false,readBytes});
    expect(result?.bytes.toString()).toBe("demo");
    expect(JSON.stringify(result)).not.toContain("storageKey");
    expect(readBytes).toHaveBeenCalledOnce();
  });
  it.each([
    {...record,document:{...record.document,workspaceId:"private"}},
    {...record,document:{...record.document,status:"ARCHIVED"}},
    {...record,document:{...record.document,workspace:{archivedAt:new Date()}}},
    {...record,storageKey:"../secret"},
  ])("does not touch storage for a denied record",async(candidate)=>{
    const readBytes=vi.fn();
    expect(await readTrialAttachment(principal,"file-1",{findAttachment:async()=>candidate,hasExplicitPermission:async()=>false,readBytes})).toBeNull();
    expect(readBytes).not.toHaveBeenCalled();
  });
  it("denies explicit permissions even when an authenticated owner cookie also exists",async()=>{
    const readBytes=vi.fn();
    expect(await readTrialAttachment(principal,"file-1",{findAttachment:async()=>record,hasExplicitPermission:async()=>true,readBytes})).toBeNull();
    expect(readBytes).not.toHaveBeenCalled();
  });
});
