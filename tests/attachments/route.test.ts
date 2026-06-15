import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/attachments/[attachmentId]/route";
import { getReadableAttachment } from "@/lib/attachments/service";
import { requireCurrentUser } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/attachments/service", () => ({
  getReadableAttachment: vi.fn(),
}));

describe("attachment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
    });
  });

  it("returns 404 when the attachment file cannot be read", async () => {
    vi.mocked(getReadableAttachment).mockRejectedValueOnce(
      new Error("ATTACHMENT_NOT_FOUND"),
    );

    const response = await GET(new Request("http://test.local/api/attachments/missing"), {
      params: Promise.resolve({ attachmentId: "missing" }),
    });

    await expect(response.json()).resolves.toEqual({ error: "ATTACHMENT_NOT_FOUND" });
    expect(response.status).toBe(404);
  });
});
