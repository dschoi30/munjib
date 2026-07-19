import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Leaf 6 document ACL source contract", () => {
  it("does not introduce a second membership or Permission-table authority", async () => {
    const source = await readFile("lib/authorization/document-acl.ts", "utf8");

    expect(source).not.toContain("WorkspaceMember");
    expect(source).not.toContain("workspaceMember");
    expect(source).not.toContain("prisma.permission");
    expect(source).not.toContain("findMany");
    expect(source).toContain("ActiveDocumentResource");
    expect(source).toContain("ACTIVE_RESOURCE_AUTHORITY_REQUIRED");
    expect(source).toContain("isActiveDocumentResource");
  });

  it("requires an opaque runtime proof rather than a structural ACL object", async () => {
    const source = await readFile("lib/authorization/active-resources.ts", "utf8");

    expect(source).toContain("Symbol(\"munjib.active-document-authority-v1\")");
    expect(source).toContain("issueActiveDocumentResource");
    expect(source).toContain("activeDocumentAuthorityBrand");
    expect(source).not.toContain("export function issueActiveDocumentResource");
  });

  it("keeps the server entrypoint ordered behind active-resource resolution", async () => {
    const source = await readFile("lib/authorization/document-acl-entrypoint.ts", "utf8");
    const transactionCall = source.indexOf("db.$transaction(async (tx)");
    const resolverCall = source.indexOf("resolveActiveDocumentForActorForUpdate(tx");
    const aclCall = source.indexOf("getDocumentAccessForActor(tx");

    expect(transactionCall).toBeGreaterThanOrEqual(0);
    expect(resolverCall).toBeGreaterThanOrEqual(0);
    expect(resolverCall).toBeGreaterThan(transactionCall);
    expect(aclCall).toBeGreaterThan(resolverCall);
  });
});
