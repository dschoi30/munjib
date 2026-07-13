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
    expect(workflow.on).toMatchObject({ pull_request: null, push: { branches: ["main"] } });
  });

  test("uses least-privilege repository read permissions", () => {
    expect(workflow.permissions).toMatchObject({ contents: "read" });
    expect(workflow.permissions).not.toHaveProperty("packages");
  });

  test("CI is native ARM64 and uses an exact postgres digest", () => {
    const ci = workflow.jobs.ci;
    const runCommands = ci.steps.map((step: { run?: string }) => step.run).filter(Boolean).join("\n");

    expect(ci["runs-on"]).toBe("ubuntu-24.04-arm");
    expect(ci.services.postgres).toMatchObject({
      image: "pgvector/pgvector:0.8.2-pg16@sha256:b759abdeb144e561a4dbfe9863b5ac58cdd3fb6350cee7e68035baffdbca9693",
      env: {
        POSTGRES_USER: "obsidian",
        POSTGRES_PASSWORD: "obsidian",
        POSTGRES_DB: "obsidian_clone",
      },
    });
    expect(ci.services.postgres.ports).toEqual(["5432:5432"]);
    expect(ci.services.postgres.options).toContain("pg_isready -U obsidian -d obsidian_clone");
    expect(runCommands).toContain("corepack prepare pnpm@${PNPM_VERSION} --activate");
    expect(runCommands).toContain("pnpm install --frozen-lockfile");
    expect(runCommands).toContain("pnpm audit --prod");
    expect(runCommands).toContain("pnpm test");
    expect(runCommands).toContain("pnpm run build");
    expect(runCommands).toContain("docker build --platform linux/arm64 --target runner --iidfile");
    expect(runCommands).toContain('runtime_id="$(cat /tmp/munjib-runtime.iid)"');
    expect(runCommands).toContain("grep -Eq '^sha256:[a-f0-9]{64}$'");
  });

  test("does not publish GHCR images or use mutable action fallbacks", () => {
    expect(workflow.jobs.publish).toBeUndefined();
    expect(workflowText).not.toContain("docker/build-push-action");
    expect(workflowText).not.toContain("docker/setup-qemu-action");
    expect(workflowText).not.toContain("docker/login-action");
    expect(workflowText).not.toMatch(/uses:\s+[^\s@]+@v\d/);
  });

  test("deploy submits exact artifacts to the root broker without host checkout/build", () => {
    const deploy = workflow.jobs.deploy;
    const deployStep = deploy.steps.find((step: { uses?: string }) => step.uses?.startsWith("appleboy/ssh-action@"));
    const publicHealthStep = deploy.steps.find((step: { name?: string }) => step.name === "Verify public deployment");
    expect(deploy.needs).toBe("ci");
    expect(deploy.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main' && vars.MUNJIB_PRIVATE_RUNTIME_BROKER_READY == 'true'");
    expect(deployStep?.uses).toBe("appleboy/ssh-action@7eaf76671a0d7eec5d98ee897acda4f968735a17");
    expect(deployStep?.env).toMatchObject({
      APP_IMAGE_DIGEST: "${{ secrets.MUNJIB_APP_IMAGE_DIGEST }}",
      POSTGRES_IMAGE_DIGEST: "${{ secrets.MUNJIB_POSTGRES_IMAGE_DIGEST }}",
      HOST_BUNDLE_DIGEST: "${{ secrets.MUNJIB_HOST_BUNDLE_DIGEST }}",
      STORAGE_INIT_IMAGE_DIGEST: "${{ secrets.MUNJIB_STORAGE_INIT_IMAGE_DIGEST }}",
      RELEASE_ENVELOPE: "${{ secrets.MUNJIB_RELEASE_ENVELOPE }}",
    });
    expect(deployStep?.with.envs).toBe(
      "APP_IMAGE_DIGEST,POSTGRES_IMAGE_DIGEST,HOST_BUNDLE_DIGEST,STORAGE_INIT_IMAGE_DIGEST,RELEASE_ENVELOPE,SENTRY_RELEASE,NEXT_PUBLIC_SENTRY_RELEASE,DEPLOY_HEALTHCHECK_URL,DEPLOY_HEALTHCHECK_HOST",
    );
    const script = deployStep?.with.script as string;
    expect(script).toContain("test -S /run/munjib/release-broker.sock");
    expect(script).toContain("ghcr.io/dschoi30/munjib@sha256:");
    expect(script).toContain("pgvector/pgvector@sha256:");
    expect(script).toContain('grep -F -- "$APP_IMAGE_DIGEST"');
    expect(script).toContain('grep -F -- "$POSTGRES_IMAGE_DIGEST"');
    expect(script).toContain('grep -F -- "$HOST_BUNDLE_DIGEST"');
    expect(script).toContain("/etc/munjib/security/broker-operations-v1.json");
    expect(script).toContain('grep -Eq \'"PROMOTE"|"MIGRATE"\'');
    expect(script).toContain("printf '%s' \"$RELEASE_ENVELOPE\" | /usr/local/libexec/munjib-release-submit");
    expect(script).not.toContain("git checkout");
    expect(script).not.toContain("git fetch");
    expect(script).not.toContain("docker compose");
    expect(script).not.toContain("docker build");
    expect(script).not.toContain("systemctl");
    expect(publicHealthStep?.run).toBe(
      "curl --fail --silent --show-error --location --max-time 20 https://munjib.andrewchoi.link >/dev/null",
    );
  });
});
