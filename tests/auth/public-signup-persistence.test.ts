import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { buildAuthOptions, resolveDefaultRuntime } from "@/lib/auth/config";
import { ensureCurrentUserWorkspaceAndRedirect } from "@/lib/auth/provisioning";
const emails: string[] = [];
afterEach(async () => {
  for (const email of emails.splice(0)) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const memberships = await prisma.organizationMember.findMany({ where: { userId: user.id }, select: { organizationId: true } });
      await prisma.organization.deleteMany({ where: { id: { in: memberships.map(row => row.organizationId) } } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
});
it("persists a new Google user and minimal account, then provisions an owned workspace", async () => {
  const email = `demo-google-${randomUUID()}@example.com`;
  emails.push(email);
  const options = buildAuthOptions({ ...resolveDefaultRuntime({ NODE_ENV: "development" }), oauthSignupEnabled: true });
  const user = await options.adapter!.createUser!({ email, name: "Provider Name", image: "https://provider.example/avatar", emailVerified: null } as never);
  await options.adapter!.linkAccount!({ userId: user.id, provider: "google", type: "oauth", providerAccountId: randomUUID(), access_token: "discard-provider-token" } as never);
  const account = await prisma.account.findFirstOrThrow({ where: { userId: user.id } });
  expect(account.access_token).toBeNull();
  expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).image).toBeNull();
  expect(await ensureCurrentUserWorkspaceAndRedirect({ userId: user.id, language: "ko" })).toMatch(/^\/workspaces\/my-workspace-/);
  expect(await prisma.workspaceMember.count({ where: { userId: user.id, role: "OWNER" } })).toBe(1);
});
