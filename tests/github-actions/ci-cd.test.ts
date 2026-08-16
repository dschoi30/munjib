import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("GitHub Actions CI/CD workflow", () => {
  const workflowText = read(".github/workflows/ci-cd.yml");
  const workflow = parse(workflowText);

  test("runs on pull requests and main pushes", () => {
    expect(workflow.on).toMatchObject({
      pull_request: null,
      push: {
        branches: ["main"],
      },
    });
  });

  test("uses least-privilege repository read permissions", () => {
    expect(workflow.permissions).toMatchObject({
      contents: "read",
    });
    expect(workflow.permissions).not.toHaveProperty("packages");
  });

  test("ci job installs, tests, builds, and validates the runtime image", () => {
    const ci = workflow.jobs.ci;
    const runCommands = ci.steps
      .map((step: { run?: string }) => step.run)
      .filter(Boolean)
      .join("\n");

    expect(ci.env).toMatchObject({
      DATABASE_URL: "postgresql://obsidian:obsidian@localhost:5432/obsidian_clone?schema=public",
    });
    expect(ci.services.postgres).toMatchObject({
      image: "pgvector/pgvector:0.8.2-pg16",
      env: {
        POSTGRES_USER: "obsidian",
        POSTGRES_PASSWORD: "obsidian",
        POSTGRES_DB: "obsidian_clone",
      },
      ports: ["5432:5432"],
    });
    expect(ci.services.postgres.options).toContain("pg_isready -U obsidian -d obsidian_clone");

    expect(ci["runs-on"]).toBe("ubuntu-latest");
    expect(runCommands).toContain("corepack enable");
    expect(runCommands).toContain("corepack prepare pnpm@${PNPM_VERSION} --activate");
    expect(runCommands).toContain("pnpm install --frozen-lockfile");
    const installIndex = ci.steps.findIndex(
      (step: { run?: string }) => step.run === "pnpm install --frozen-lockfile",
    );
    const auditIndex = ci.steps.findIndex(
      (step: { name?: string }) => step.name === "Audit production dependencies",
    );
    expect(auditIndex).toBe(installIndex + 1);
    expect(ci.steps[auditIndex]?.run).toBe("pnpm audit --prod");
    const nextAdvisoryIndex = ci.steps.findIndex(
      (step: { name?: string }) => step.name === "Check Next.js advisories",
    );
    expect(nextAdvisoryIndex).toBe(auditIndex + 1);
    expect(ci.steps[nextAdvisoryIndex]?.run).toContain(
      "scripts/security/check-next-advisories.ts --candidate",
    );
    expect(ci.steps[nextAdvisoryIndex]?.run).toContain(
      "require('./package.json').dependencies.next",
    );
    expect(ci.steps[nextAdvisoryIndex]?.env).toMatchObject({
      GH_TOKEN: "${{ github.token }}",
    });
    expect(runCommands).toContain("pnpm run db:generate");
    expect(runCommands).toContain("pnpm exec prisma migrate deploy");
    expect(runCommands).toContain("pnpm run db:rag:index");
    expect(runCommands).toContain("pnpm test");
    expect(runCommands).toContain("pnpm run build");
    expect(runCommands).toContain("docker build --target runner");
  });

  test("builds and verifies only public Linux ARM64 delivery metadata", () => {
    const ci = workflow.jobs.ci;
    const setupGo = ci.steps.find(
      (step: { name?: string }) => step.name === "Set up Go for delivery bundle",
    );
    expect(setupGo?.uses).toBe(
      "actions/setup-go@d35c59abb061a4a6fb18e82ac0862c26744d6ab5",
    );
    expect(setupGo?.with).toMatchObject({
      "go-version": "1.22.12",
      cache: false,
    });

    const build = ci.steps.find(
      (step: { name?: string }) => step.name === "Build and verify Linux ARM64 delivery bundle",
    );
    const script = build?.run as string;
    expect(script).toContain("GOOS=linux GOARCH=arm64");
    expect(script).toContain("CGO_ENABLED=0");
    expect(script).toContain("go build");
    expect(script).toContain("pnpm delivery:build-bundle");
    expect(script).toContain("pnpm delivery:verify-bundle");
    expect(script).toContain("bundle_format=munjib-delivery-bundle-manifest-v2");
    expect(script).toContain("sha256sum");
    expect(script).toContain("GITHUB_STEP_SUMMARY");
    expect(script).not.toMatch(/ed25519|sign|private.?key|ssh|sudo|docker|compose/i);
  });

  test("does not publish GHCR images before deploy", () => {
    const workflowText = read(".github/workflows/ci-cd.yml");

    expect(workflow.jobs.publish).toBeUndefined();
    expect(workflowText).not.toContain("docker/build-push-action");
    expect(workflowText).not.toContain("docker/setup-qemu-action");
    expect(workflowText).not.toContain("docker/login-action");
  });

  test("deploys successful main pushes through the private OCI runner", () => {
    const deploy = workflow.jobs.deploy;
    const deployStep = deploy.steps.find(
      (step: { name?: string }) => step.name === "Deploy exact main SHA",
    );

    expect(workflowText).not.toContain("appleboy/ssh-action");
    expect(deploy.needs).toBe("ci");
    expect(deploy.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(deploy["runs-on"]).toEqual([
      "self-hosted",
      "linux",
      "ARM64",
      "munjib-production",
    ]);
    expect(deploy.permissions).toEqual({ contents: "read" });
    expect(deploy.concurrency).toEqual({
      group: "munjib-production",
      "cancel-in-progress": false,
    });
    expect(deployStep?.run).toBe(
      'printf \'%s\\n\' "${{ github.token }}" | sudo /usr/local/sbin/munjib-deploy "${{ github.sha }}"',
    );
    expect(workflowText).not.toMatch(/DEPLOY_(HOST|USER|PORT|PATH|SSH_KEY)/);
    expect(workflowText).not.toMatch(/DEPLOY_(NEXTAUTH_SECRET|GOOGLE_CLIENT_SECRET)/);
  });

  test("keeps the production runner smoke manual and read only", () => {
    const smokeText = read(".github/workflows/runner-smoke.yml");
    const smoke = parse(smokeText);

    expect(smoke.on).toEqual({ workflow_dispatch: null });
    expect(smoke.permissions).toEqual({ contents: "read" });
    expect(smoke.jobs.smoke["runs-on"]).toEqual([
      "self-hosted",
      "linux",
      "ARM64",
      "munjib-production",
    ]);
    expect(smokeText).not.toContain("sudo");
    expect(smokeText).not.toContain("secrets.");
    expect(smokeText).not.toContain("actions/checkout");
  });
});
