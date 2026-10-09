import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/workspaces/[workspaceSlug]/ai/connection/route";
const mocks = vi.hoisted(() => ({ user: vi.fn(), workspace: vi.fn(), probe: vi.fn(), config: vi.fn(), availability: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/db/client", () => ({ prisma: { workspace: { findFirst: mocks.workspace } } }));
vi.mock("@/lib/rag/check-model-connection", () => ({ checkModelConnection: mocks.probe }));
vi.mock("@/lib/rag/model-config", () => ({ getRagGenerationConfig: mocks.config, getRagChatProviderAvailability: mocks.availability }));
const input = { chatProvider: "openai", chatModel: "gpt-5.4-mini" };
function request(body: unknown = input) { return new Request("http://localhost/api/workspaces/test/ai/connection", { method: "POST", body: JSON.stringify(body) }); }
const context = { params: Promise.resolve({ workspaceSlug: "test" }) };
beforeEach(() => {
  vi.resetAllMocks(); mocks.user.mockResolvedValue({ id: "user" }); mocks.workspace.mockResolvedValue({ id: "workspace" });
  mocks.availability.mockReturnValue({ openai: true }); mocks.config.mockReturnValue({ chat: { provider: "openai", model: input.chatModel } }); mocks.probe.mockResolvedValue(true);
});
afterEach(() => vi.restoreAllMocks());
describe("model connection route", () => {
  it("authorizes active workspace membership and probes the requested model", async () => {
    const response = await POST(request(), context);
    expect(await response.json()).toEqual({ connected: true });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.workspace).toHaveBeenCalledWith({ where: { slug: "test", archivedAt: null, members: { some: { userId: "user" } } }, select: { id: true } });
    expect(mocks.config).toHaveBeenCalledWith(process.env, { provider: "openai", model: input.chatModel });
    expect(mocks.probe).toHaveBeenCalledWith({ provider: "openai", model: input.chatModel }, expect.any(AbortSignal));
  });
  it("rejects unauthenticated callers before provider work", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request(), context)).status).toBe(401);
    expect(mocks.workspace).not.toHaveBeenCalled(); expect(mocks.probe).not.toHaveBeenCalled();
  });
  it("rejects inaccessible or archived workspaces", async () => {
    mocks.workspace.mockResolvedValue(null);
    expect((await POST(request(), context)).status).toBe(404); expect(mocks.probe).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { chatProvider: "openai", chatModel: "../bad?" }, { chatProvider: "invalid", chatModel: "ok" }])("rejects invalid settings %j", async (body) => {
    expect((await POST(request(body), context)).status).toBe(400); expect(mocks.probe).not.toHaveBeenCalled();
  });
  it("does not expose provider errors", async () => {
    mocks.probe.mockRejectedValue(new Error("secret endpoint and token"));
    expect(await (await POST(request(), context)).json()).toEqual({ connected: false });
  });
  it("does not probe unavailable providers", async () => {
    mocks.availability.mockReturnValue({ openai: false });
    expect(await (await POST(request(), context)).json()).toEqual({ connected: false }); expect(mocks.probe).not.toHaveBeenCalled();
  });
});
