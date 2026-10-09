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

  it("normalizes a malformed persisted storage key to the same 404", async () => {
    vi.mocked(getReadableAttachment).mockRejectedValueOnce(
      new Error("ATTACHMENT_STORAGE_KEY_INVALID"),
    );

    const response = await GET(new Request("http://test.local/api/attachments/unsafe"), {
      params: Promise.resolve({ attachmentId: "unsafe" }),
    });

    await expect(response.json()).resolves.toEqual({ error: "ATTACHMENT_NOT_FOUND" });
    expect(response.status).toBe(404);
  });
});

it.each([
  ["text/plain", "", "attachment"],
  ["image/png", "", "inline"],
  ["image/png", "?download=1", "attachment"],
])("serves %s %s with Unicode filename and unchanged bytes", async (mimeType, query, disposition) => {
  const bytes = Buffer.from([0xbe, 0xc8, 0xb3, 0xe7]); // legacy Korean text bytes must remain untouched
  vi.mocked(getReadableAttachment).mockResolvedValue({
    attachment: { fileName: "한글-문서.txt", mimeType, size: bytes.length }, bytes,
  } as Awaited<ReturnType<typeof getReadableAttachment>>);
  const response = await GET(new Request(`http://test.local/api/attachments/file${query}`), {
    params: Promise.resolve({ attachmentId: "file" }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toBe(`${disposition}; filename="attachment"; filename*=UTF-8''${encodeURIComponent("한글-문서.txt")}`);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
});
