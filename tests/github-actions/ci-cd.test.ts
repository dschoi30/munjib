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

  test("grants package write access for GHCR publishing", () => {
    expect(workflow.permissions).toMatchObject({
      contents: "read",
      packages: "write",
    });
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

  test("publish job pushes sha and latest tags only on main pushes", () => {
    const publish = workflow.jobs.publish;
    const pushStep = publish.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("docker/build-push-action@"),
    );

    expect(publish.needs).toBe("ci");
    expect(publish.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(pushStep).toBeDefined();
    expect(pushStep?.with).toMatchObject({
      context: ".",
      target: "runner",
      push: true,
    });
    expect(pushStep?.with["build-args"]).toContain("NEXT_PUBLIC_SENTRY_DSN=${{ vars.NEXT_PUBLIC_SENTRY_DSN || secrets.NEXT_PUBLIC_SENTRY_DSN || '' }}");
    expect(pushStep?.with["build-args"]).toContain("NEXT_PUBLIC_SENTRY_ENVIRONMENT=${{ vars.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'production' }}");
    expect(pushStep?.with["build-args"]).toContain("NEXT_PUBLIC_SENTRY_RELEASE=${{ github.sha }}");
    expect(pushStep?.with["build-args"]).toContain("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=${{ vars.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || '0.05' }}");
    expect(pushStep?.with["build-args"]).toContain("SENTRY_RELEASE=${{ github.sha }}");
    expect(pushStep?.with.tags).toContain("${{ env.IMAGE_NAME }}:${{ env.IMAGE_TAG }}");
    expect(pushStep?.with.tags).toContain("${{ env.IMAGE_NAME }}:latest");
  });

  test("deploy job uses SSH secrets and passes the published image tag", () => {
    const deploy = workflow.jobs.deploy;
    const deployStep = deploy.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("appleboy/ssh-action@"),
    );

    expect(deploy.needs).toBe("publish");
    expect(deploy.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(deployStep).toBeDefined();
    expect(deployStep?.env).toMatchObject({
      WEB_IMAGE: "${{ needs.publish.outputs.image }}",
    });
    expect(deployStep?.with.host).toBe("${{ secrets.DEPLOY_HOST }}");
    expect(deployStep?.with.username).toBe("${{ secrets.DEPLOY_USER }}");
    expect(deployStep?.with.key).toBe("${{ secrets.DEPLOY_SSH_KEY }}");
    expect(deployStep?.with.port).toBe("${{ secrets.DEPLOY_PORT || 22 }}");
    expect(deployStep?.with.envs).toBe("WEB_IMAGE");
    expect(deployStep?.with.script).toContain('cd "${{ secrets.DEPLOY_PATH }}"');
    expect(deployStep?.with.script).toContain("git pull --ff-only");
    expect(deployStep?.with.script).toContain("docker compose pull web");
    expect(deployStep?.with.script).toContain("docker compose run --rm --build tools pnpm exec prisma migrate deploy");
    expect(deployStep?.with.script).toContain("docker compose run --rm --build tools pnpm run db:rag:index");
    expect(deployStep?.with.script).toContain("docker compose up -d web");
  });
});
