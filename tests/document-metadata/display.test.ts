import { describe, expect, it } from "vitest";
import { visibleDocumentProperties } from "@/lib/document-metadata/display";

describe("visibleDocumentProperties", () => {
  it("hides canonical metadata because the properties panel renders those rows separately", () => {
    expect(
      visibleDocumentProperties([
        { id: "owner", key: "owner" },
        { id: "tags", key: "tags" },
        { id: "links", key: "links" },
        { id: "status", key: "status" },
      ]),
    ).toEqual([
      { id: "owner", key: "owner" },
      { id: "status", key: "status" },
    ]);
  });
});
