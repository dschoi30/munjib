import { describe, expect, it } from "vitest";
import { sanitizeInternalSessionImage } from "@/lib/auth/session-image";

describe("authorization-bound session images", () => {
  it("accepts only an allowlisted internal attachment path", () => {
    expect(
      sanitizeInternalSessionImage("/api/attachments/att-1", new Set(["att-1"])),
    ).toBe("/api/attachments/att-1");
  });

  it.each([
    "https://evil.example/a.png",
    "//evil.example/a.png",
    "data:image/png;base64,abc",
    "blob:https://munjib.example/id",
    "/profile/avatar.png",
    "/api/attachments/att-1?x=1",
    "/api/attachments/att-1#x",
    "/api/attachments/att%2F1",
    "/api/attachments/att%5C1",
    "/api/attachments/%E0%A4%A",
  ])("rejects untrusted image %s", (value) => {
    expect(sanitizeInternalSessionImage(value, new Set(["att-1", "att/1"]))).toBeNull();
  });

  it("returns null for missing or empty authorization", () => {
    expect(sanitizeInternalSessionImage("/api/attachments/att-1", undefined)).toBeNull();
    expect(sanitizeInternalSessionImage("/api/attachments/att-1", new Set())).toBeNull();
  });
});
