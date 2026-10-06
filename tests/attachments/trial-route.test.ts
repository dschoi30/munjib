import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/trial/attachments/[attachmentId]/route";
import { resolveAnonymousTrialActor } from "@/lib/auth/trial-entitlement";
import { readTrialAttachment } from "@/lib/workspaces/trial-attachments";
vi.mock("@/lib/auth/trial-entitlement", () => ({resolveAnonymousTrialActor:vi.fn(), resolveAnonymousTrialCapability:vi.fn()}));
vi.mock("@/lib/workspaces/trial-attachments", () => ({readTrialAttachment:vi.fn()}));
beforeEach(()=>vi.clearAllMocks());
it("serves Korean attachment filenames using an ASCII-safe UTF-8 disposition",async()=>{
  vi.mocked(resolveAnonymousTrialActor).mockReturnValue({authorizationPrincipal:{kind:"anonymous-trial-demo"}} as never);
  vi.mocked(readTrialAttachment).mockResolvedValue({id:"file",fileName:"시연 안내.pdf",mimeType:"application/pdf",bytes:Buffer.from("file")});
  const response=await GET(new Request("https://example.test/api/trial/attachments/file"),{params:Promise.resolve({attachmentId:"file"})});
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''"+encodeURIComponent("시연 안내.pdf"));
  expect(await response.text()).toBe("file");
});
it("requires a valid Trial actor before looking up attachment data",async()=>{
  vi.mocked(resolveAnonymousTrialActor).mockReturnValue(null);
  const response=await GET(new Request("https://example.test/api/trial/attachments/file"),{params:Promise.resolve({attachmentId:"file"})});
  expect(response.status).toBe(404);
  expect(readTrialAttachment).not.toHaveBeenCalled();
});
