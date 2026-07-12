import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../lib/auth/passwords";

const prisma = new PrismaClient();
const email = process.env.SECURITY_RUNTIME_FIXTURE_EMAIL?.trim().toLowerCase();
const passwordFile = process.env.SECURITY_RUNTIME_FIXTURE_PASSWORD_FILE?.trim();
const slug = process.env.SECURITY_RUNTIME_FIXTURE_SLUG?.trim();

async function remove() {
  if (!email || !slug) throw new Error("SECURITY_RUNTIME_FIXTURE_CONFIG_INVALID");
  const organizations = await prisma.organization.findMany({
    where: { slug: `${slug}-org` },
    select: { id: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.organization.deleteMany({ where: { id: { in: organizations.map(({ id }) => id) } } });
    await tx.user.deleteMany({ where: { email } });
  });
}

async function create() {
  if (!email?.endsWith("@invalid.example") || !passwordFile || !slug?.startsWith("security-runtime-")) {
    throw new Error("SECURITY_RUNTIME_FIXTURE_CONFIG_INVALID");
  }
  await remove();
  const password = (await readFile(passwordFile, "utf8")).trim();
  if (password.length < 32) throw new Error("SECURITY_RUNTIME_FIXTURE_PASSWORD_INVALID");
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name: "Runtime Smoke", passwordHash, emailVerified: new Date() },
    });
    const organization = await tx.organization.create({
      data: { name: "Runtime Smoke", slug: `${slug}-org` },
    });
    const workspace = await tx.workspace.create({
      data: { organizationId: organization.id, name: "Runtime Smoke", slug },
    });
    await tx.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
    });
    await tx.document.create({
      data: {
        workspaceId: workspace.id,
        title: "Runtime Smoke",
        slug: "runtime-smoke",
        path: "/runtime-smoke",
        contentMarkdown: "# Runtime Smoke\n\nSynthetic fixture only.",
        contentText: "Runtime Smoke Synthetic fixture only.",
        createdById: user.id,
        updatedById: user.id,
      },
    });
  });
}

async function main() {
  if (!email?.endsWith("@invalid.example") || !passwordFile || !slug?.startsWith("security-runtime-")) {
    throw new Error("SECURITY_RUNTIME_FIXTURE_CONFIG_INVALID");
  }
  if (process.argv.length !== 3) throw new Error("SECURITY_RUNTIME_FIXTURE_OPERATION_INVALID");
  const operation = process.argv[2];
  if (operation === "create") await create();
  else if (operation === "delete") await remove();
  else throw new Error("SECURITY_RUNTIME_FIXTURE_OPERATION_INVALID");
  process.stdout.write(`security runtime fixture ${operation} OK\n`);
}

main()
  .catch(() => {
    process.stderr.write("SECURITY_RUNTIME_FIXTURE_FAILED\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
