import { describe, expect, it } from "vitest";

import {
  resolveAttachmentStoragePath,
  validateAttachmentStorageKey,
} from "@/lib/attachments/storage-key";

const validKey = "cmworkspace/550e8400-e29b-41d4-a716-446655440000-notes.txt";

describe("attachment storage key validation", () => {
  it("accepts the canonical workspace-scoped key", () => {
    expect(validateAttachmentStorageKey(validKey, "cmworkspace")).toEqual({
      valid: true,
      value: {
        workspaceId: "cmworkspace",
        fileName: "550e8400-e29b-41d4-a716-446655440000-notes.txt",
      },
    });
  });

  it.each([
    "/tmp/attachment",
    "../cmworkspace/550e8400-e29b-41d4-a716-446655440000-notes.txt",
    "cmworkspace/../550e8400-e29b-41d4-a716-446655440000-notes.txt",
    "cmworkspace\\550e8400-e29b-41d4-a716-446655440000-notes.txt",
    "C:\\storage\\attachment",
    "cmworkspace/550e8400-e29b-41d4-a716-446655440000-../secret",
    "cmworkspace/no-uuid.txt",
  ])("rejects unsafe key %s", (storageKey) => {
    expect(validateAttachmentStorageKey(storageKey, "cmworkspace")).toMatchObject({ valid: false });
  });

  it("rejects a key belonging to a different workspace", () => {
    expect(validateAttachmentStorageKey(validKey, "other-workspace")).toEqual({
      valid: false,
      issue: "workspace-mismatch",
    });
  });

  it("keeps path resolution inside the supplied attachment root", () => {
    expect(resolveAttachmentStoragePath("/candidate/storage/attachments", validKey, "cmworkspace")).toBe(
      "/candidate/storage/attachments/cmworkspace/550e8400-e29b-41d4-a716-446655440000-notes.txt",
    );
    expect(() => resolveAttachmentStoragePath("/candidate/storage/attachments", "../escape")).toThrow(
      "ATTACHMENT_STORAGE_KEY_INVALID",
    );
  });
});
