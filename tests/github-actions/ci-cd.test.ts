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
    expect(runCommands).toContain("pnpm run db:generate");
    expect(runCommands).toContain("pnpm exec prisma migrate deploy");
    expect(runCommands).toContain("pnpm run db:rag:index");
    expect(runCommands).toContain("pnpm test");
    expect(runCommands).toContain("pnpm run build");
    expect(runCommands).toContain("docker build --target runner");
  });

  test("does not publish GHCR images before deploy", () => {
    const workflowText = read(".github/workflows/ci-cd.yml");

    expect(workflow.jobs.publish).toBeUndefined();
    expect(workflowText).not.toContain("docker/build-push-action");
    expect(workflowText).not.toContain("docker/setup-qemu-action");
    expect(workflowText).not.toContain("docker/login-action");
  });

  test("deploy job builds natively on the OCI host", () => {
    const deploy = workflow.jobs.deploy;
    const deployStep = deploy.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("appleboy/ssh-action@"),
    );

    expect(deploy.needs).toBe("ci");
    expect(deploy.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(deployStep).toBeDefined();
    expect(deployStep?.env).toMatchObject({
      WEB_IMAGE: "munjib-web:latest",
      SENTRY_RELEASE: "${{ github.sha }}",
      NEXT_PUBLIC_SENTRY_RELEASE: "${{ github.sha }}",
      DEPLOY_HEALTHCHECK_URL: "https://munjib.andrewchoi.link",
    });
    expect(deployStep?.with.host).toBe("${{ secrets.DEPLOY_HOST }}");
    expect(deployStep?.with.username).toBe("${{ secrets.DEPLOY_USER }}");
    expect(deployStep?.with.key).toBe("${{ secrets.DEPLOY_SSH_KEY }}");
    expect(deployStep?.with.port).toBe("${{ secrets.DEPLOY_PORT || 22 }}");
    expect(deployStep?.with.envs).toBe(
      "WEB_IMAGE,SENTRY_RELEASE,NEXT_PUBLIC_SENTRY_RELEASE,DEPLOY_HEALTHCHECK_URL",
    );
    expect(deployStep?.with.script).toContain('cd "${{ secrets.DEPLOY_PATH }}"');
    expect(deployStep?.with.script).toContain("git pull --ff-only");
    expect(deployStep?.with.script).not.toContain("docker login ghcr.io");
    expect(deployStep?.with.script).not.toContain("docker compose pull web");
    expect(deployStep?.with.script).toContain(
      'sudo env WEB_IMAGE="$WEB_IMAGE" SENTRY_RELEASE="$SENTRY_RELEASE" NEXT_PUBLIC_SENTRY_RELEASE="$NEXT_PUBLIC_SENTRY_RELEASE" docker compose build web tools',
    );
    expect(deployStep?.with.script).toContain(
      'sudo env WEB_IMAGE="$WEB_IMAGE" docker compose run --rm tools pnpm exec prisma migrate deploy',
    );
    expect(deployStep?.with.script).toContain(
      'sudo env WEB_IMAGE="$WEB_IMAGE" docker compose run --rm tools pnpm run db:rag:index',
    );
    expect(deployStep?.with.script).toContain(
      'sudo env WEB_IMAGE="$WEB_IMAGE" SENTRY_RELEASE="$SENTRY_RELEASE" NEXT_PUBLIC_SENTRY_RELEASE="$NEXT_PUBLIC_SENTRY_RELEASE" docker compose up -d web',
    );
    expect(deployStep?.with.script).toContain(
      "for attempt in 1 2 3 4 5 6 7 8 9 10; do",
    );
    expect(deployStep?.with.script).toContain(
      'if curl --fail --silent --show-error --location --max-time 20 "$DEPLOY_HEALTHCHECK_URL" >/dev/null; then',
    );
    expect(deployStep?.with.script).toContain(
      'if [ "$attempt" = "10" ]; then',
    );
    expect(deployStep?.with.script).toContain(
      "sleep 3",
    );
  });
});
