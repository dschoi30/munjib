import { describe, expect, it } from "vitest";

import { reconcileAttachmentLifecycleInventory } from "@/lib/attachments/lifecycle-inventory";

const referenced = "cmworkspace/550e8400-e29b-41d4-a716-446655440000-notes.txt";
const missing = "cmworkspace/550e8400-e29b-41d4-a716-446655440001-missing.txt";
const orphan = "cmworkspace/550e8400-e29b-41d4-a716-446655440002-orphan.txt";

describe("attachment lifecycle inventory", () => {
  it("classifies rows and files without allowing mutation", () => {
    const result = reconcileAttachmentLifecycleInventory({
      attachments: [
        { workspaceId: "cmworkspace", storageKey: missing },
        { workspaceId: "cmworkspace", storageKey: referenced },
      ],
      files: [{ storageKey: referenced }, { storageKey: orphan }],
    });

    expect(result.counts).toEqual({
      referenced: 1,
      "missing-bytes": 1,
      "orphan-bytes": 1,
      "invalid-key": 0,
    });
    expect(result.hasActionableFindings).toBe(true);
    expect(result.mutationAllowed).toBe(false);
    expect(result.entries.map((entry) => [entry.storageKey, entry.classification])).toEqual([
      [referenced, "referenced"],
      [missing, "missing-bytes"],
      [orphan, "orphan-bytes"],
    ]);
  });

  it("fails closed for malformed, mismatched, and duplicate keys", () => {
    const result = reconcileAttachmentLifecycleInventory({
      attachments: [
        { workspaceId: "cmworkspace", storageKey: "../escape" },
        { workspaceId: "cmworkspace", storageKey: referenced },
      ],
      files: [{ storageKey: referenced }, { storageKey: referenced }],
    });

    expect(result.counts["invalid-key"]).toBe(4);
    expect(result.entries.filter((entry) => entry.classification === "invalid-key")).toEqual([
      { storageKey: "../escape", classification: "invalid-key", issue: "path-traversal" },
      { storageKey: referenced, classification: "invalid-key", issue: "duplicate-storage-key" },
      { storageKey: referenced, classification: "invalid-key", issue: "duplicate-storage-key" },
      { storageKey: referenced, classification: "invalid-key", issue: "duplicate-storage-key" },
    ]);
  });

  it("is deterministic for equivalent input order", () => {
    const first = reconcileAttachmentLifecycleInventory({
      attachments: [{ workspaceId: "cmworkspace", storageKey: missing }, { workspaceId: "cmworkspace", storageKey: referenced }],
      files: [{ storageKey: referenced }],
    });
    const second = reconcileAttachmentLifecycleInventory({
      attachments: [{ workspaceId: "cmworkspace", storageKey: referenced }, { workspaceId: "cmworkspace", storageKey: missing }],
      files: [{ storageKey: referenced }],
    });
    expect(second).toEqual(first);
  });

  it("normalizes malformed runtime keys instead of throwing", () => {
    const result = reconcileAttachmentLifecycleInventory({
      attachments: [
        { workspaceId: "cmworkspace", storageKey: null },
        { workspaceId: 42, storageKey: referenced },
      ],
      files: [{ storageKey: undefined }, { storageKey: { key: referenced } }],
    });

    expect(result.counts["invalid-key"]).toBe(4);
    expect(result.entries).toEqual([
      { storageKey: "[invalid-storage-key]", classification: "invalid-key", issue: "invalid-storage-key" },
      { storageKey: "[invalid-storage-key]", classification: "invalid-key", issue: "invalid-storage-key" },
      { storageKey: "[invalid-storage-key]", classification: "invalid-key", issue: "invalid-storage-key" },
      { storageKey: referenced, classification: "invalid-key", issue: "invalid-storage-key" },
    ]);
  });

  it("sorts by UTF-16 code units rather than locale", () => {
    const uppercase = "cmworkspace/550e8400-e29b-41d4-a716-446655440000-A.txt";
    const lowercase = "cmworkspace/550e8400-e29b-41d4-a716-446655440000-a.txt";
    const result = reconcileAttachmentLifecycleInventory({
      attachments: [],
      files: [{ storageKey: lowercase }, { storageKey: uppercase }],
    });

    expect(result.entries.map((entry) => entry.storageKey)).toEqual([uppercase, lowercase]);
  });
});
