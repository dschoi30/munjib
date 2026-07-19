import { execFileSync } from "node:child_process";
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

  test("deploy job builds natively on the OCI host", () => {
    const deploy = workflow.jobs.deploy;
    const deployStep = deploy.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("appleboy/ssh-action@"),
    );
    const publicHealthStep = deploy.steps.find((step: { name?: string }) =>
      step.name === "Verify public deployment",
    );

    expect(deploy.needs).toBe("ci");
    expect(deploy.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(deployStep).toBeDefined();
    expect(deployStep?.env).toMatchObject({
      WEB_IMAGE: "munjib-web:latest",
      DEPLOY_SHA: "${{ github.sha }}",
      SENTRY_RELEASE: "${{ github.sha }}",
      NEXT_PUBLIC_SENTRY_RELEASE: "${{ github.sha }}",
      DEPLOY_ENV_FILE: "/etc/munjib/env",
      DEPLOY_HEALTHCHECK_URL: "http://127.0.0.1:3000",
      DEPLOY_HEALTHCHECK_HOST: "munjib.andrewchoi.link",
      DEPLOY_REPOSITORY: "${{ github.repository }}",
      DEPLOY_GIT_TOKEN: "${{ github.token }}",
    });
    expect(deployStep?.with.host).toBe("${{ secrets.DEPLOY_HOST }}");
    expect(deployStep?.with.username).toBe("${{ secrets.DEPLOY_USER }}");
    expect(deployStep?.with.key).toBe("${{ secrets.DEPLOY_SSH_KEY }}");
    expect(deployStep?.with.port).toBe("${{ secrets.DEPLOY_PORT || 22 }}");
    expect(deployStep?.with.envs).toBe(
      "WEB_IMAGE,DEPLOY_SHA,SENTRY_RELEASE,NEXT_PUBLIC_SENTRY_RELEASE,DEPLOY_ENV_FILE,DEPLOY_HEALTHCHECK_URL,DEPLOY_HEALTHCHECK_HOST,DEPLOY_REPOSITORY,DEPLOY_GIT_TOKEN,DEPLOY_NEXTAUTH_SECRET,DEPLOY_GOOGLE_CLIENT_SECRET",
    );
    expect(deployStep?.with.script).toContain('cd "${{ secrets.DEPLOY_PATH }}"');
    expect(deployStep?.with.script).toContain(
      'git_auth_header="$(printf \'x-access-token:%s\' "$DEPLOY_GIT_TOKEN" | base64 | tr -d \'\\n\')"',
    );
    expect(deployStep?.with.script).toContain(
      'git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $git_auth_header" fetch --force "https://github.com/$DEPLOY_REPOSITORY.git" main',
    );
    expect(deployStep?.with.script).not.toContain("git fetch --force origin main");
    expect(deployStep?.with.script).toContain('git checkout --detach "$DEPLOY_SHA"');
    expect(deployStep?.with.script).toContain('test "$(git rev-parse HEAD)" = "$DEPLOY_SHA"');
    expect(deployStep?.with.script).not.toContain("git pull --ff-only");
    expect(deployStep?.with.script).not.toContain("docker login ghcr.io");
    expect(deployStep?.with.script).not.toContain("docker compose pull web");
    expect(deployStep?.with.script).toContain('sudo test -r "$DEPLOY_ENV_FILE"');
    expect(deployStep?.with.script).toContain("install_secret nextauth-current");
    expect(deployStep?.with.script).toContain("sudo chown 10001:10001");
    expect(deployStep?.with.script).toContain("sudo chmod 0400");
    expect(deployStep?.with.script).toContain("docker-compose.google.yml");
    expect(deployStep?.with.script).toContain(
      'sudo env WEB_IMAGE="$WEB_IMAGE" SENTRY_RELEASE="$SENTRY_RELEASE" NEXT_PUBLIC_SENTRY_RELEASE="$NEXT_PUBLIC_SENTRY_RELEASE" docker compose $compose_files --env-file "$DEPLOY_ENV_FILE" build web tools',
    );
    expect(deployStep?.with.script).toContain(
      'sudo env WEB_IMAGE="$WEB_IMAGE" docker compose $compose_files --env-file "$DEPLOY_ENV_FILE" --profile auth-preflight run --rm --no-deps auth-preflight pnpm security:auth-preflight',
    );
    expect(deployStep?.with.script).toContain(
      'sudo env WEB_IMAGE="$WEB_IMAGE" docker compose $compose_files --env-file "$DEPLOY_ENV_FILE" run --rm tools pnpm exec prisma migrate deploy',
    );
    expect(deployStep?.with.script).toContain(
      'sudo env WEB_IMAGE="$WEB_IMAGE" docker compose $compose_files --env-file "$DEPLOY_ENV_FILE" run --rm tools pnpm run db:rag:index',
    );
    expect(deployStep?.with.script).toContain(
      'sudo env WEB_IMAGE="$WEB_IMAGE" SENTRY_RELEASE="$SENTRY_RELEASE" NEXT_PUBLIC_SENTRY_RELEASE="$NEXT_PUBLIC_SENTRY_RELEASE" docker compose $compose_files --env-file "$DEPLOY_ENV_FILE" up -d web',
    );
    const runCommands = deployStep?.with.script as string;
    expect(runCommands.indexOf("pnpm security:auth-preflight")).toBeGreaterThanOrEqual(0);
    expect(runCommands.indexOf("pnpm security:auth-preflight")).toBeLessThan(
      runCommands.indexOf("pnpm exec prisma migrate deploy"),
    );
    expect(runCommands.indexOf("install_secret nextauth-current")).toBeLessThan(
      runCommands.indexOf("pnpm security:auth-preflight"),
    );
    expect(runCommands).toContain(
      "--profile auth-preflight rm --force --stop auth-preflight",
    );
    expect(deployStep?.with.script).toContain(
      "for attempt in 1 2 3 4 5 6 7 8 9 10; do",
    );
    expect(deployStep?.with.script).toContain(
      'if curl --fail --silent --show-error --location --max-time 20 --header "Host: $DEPLOY_HEALTHCHECK_HOST" "$DEPLOY_HEALTHCHECK_URL" >/dev/null; then',
    );
    expect(deployStep?.with.script).toContain(
      'if [ "$attempt" = "10" ]; then',
    );
    expect(deployStep?.with.script).toContain(
      "sleep 3",
    );
    expect(deployStep?.with.script).toContain("sudo docker image prune -f");
    expect(publicHealthStep).toBeDefined();
    expect(publicHealthStep?.run).toBe(
      "curl --fail --silent --show-error --location --max-time 20 https://munjib.andrewchoi.link >/dev/null",
    );
  });

  test("enables Google only for non-empty dotenv client id and secret", () => {
    const deploy = workflow.jobs.deploy;
    const deployStep = deploy.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("appleboy/ssh-action@"),
    );
    const script = deployStep?.with.script as string;

    expect(script).not.toContain(
      "sudo grep -Eq '^GOOGLE_CLIENT_ID=[^[:space:]]'",
    );
    expect(script).toContain('google_client_id="$(');
    expect(script).toContain('single=sprintf("%c", 39)');
    expect(script).toContain(
      'if test -n "$google_client_id" && test -n "$DEPLOY_GOOGLE_CLIENT_SECRET"; then',
    );

    const parser = script.match(
      /sudo awk -v key=GOOGLE_CLIENT_ID '([\s\S]*?)' "\$DEPLOY_ENV_FILE"/,
    )?.[1];
    expect(parser).toBeDefined();
    const readClientId = (line: string) =>
      execFileSync("awk", ["-v", "key=GOOGLE_CLIENT_ID", parser as string], {
        input: line + "\n",
        encoding: "utf8",
      }).trim();

    expect(readClientId('GOOGLE_CLIENT_ID=""')).toBe("");
    expect(readClientId("GOOGLE_CLIENT_ID=''")).toBe("");
    expect(readClientId("GOOGLE_CLIENT_ID=client-id")).toBe("client-id");
    expect(readClientId(" GOOGLE_CLIENT_ID =  client-id  # comment")).toBe(
      "client-id",
    );
  });
});
