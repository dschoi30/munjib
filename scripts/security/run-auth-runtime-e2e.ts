import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

function runCapture(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "inherit"], shell: false });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code: code ?? (signal ? 1 : 0), stdout }));
  });
}

async function waitFor(url: string) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Container is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("AUTH_RUNTIME_BROWSER_SERVER_TIMEOUT");
}

async function waitForPostgres(containerName: string, env: NodeJS.ProcessEnv): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ready = await runCapture(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "auth_runtime", "-d", "auth_runtime"],
      env,
    );
    if (ready.code === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("AUTH_RUNTIME_POSTGRES_TIMEOUT");
}

function mappedPort(output: string): number {
  const match = output.match(/:(\d+)\s*$/m);
  const port = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("AUTH_RUNTIME_POSTGRES_PORT_INVALID");
  }
  return port;
}

async function main() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "munjib-auth-runtime-"));
  const secretPath = path.join(directory, "nextauth-secret");
  const secret = randomBytes(32).toString("base64url");
  const port = Number(process.env.AUTH_RUNTIME_PORT ?? 3411);
  const baseURL = process.env.AUTH_RUNTIME_BASE_URL ?? `http://127.0.0.1:${port}`;
  const containerName = `munjib-auth-runtime-${process.pid}`;
  const runtimeUid = typeof process.getuid === "function" ? process.getuid() : 0;
  const runtimeGid = typeof process.getgid === "function" ? process.getgid() : 0;
  let containerStarted = false;
  let databaseStarted = false;
  let networkCreated = false;
  const databaseContainerName = `munjib-auth-runtime-db-${process.pid}`;
  const networkName = `munjib-auth-runtime-network-${process.pid}`;
  let databaseURL: string | null = null;
  try {
    await writeFile(secretPath, secret, { mode: 0o400, flag: "wx" });
    await chmod(directory, 0o700);
    await chmod(secretPath, 0o400);

    const childEnv = { ...process.env };
    // Keep credentials out of the child environment. The child receives only
    // the path; shell tracing is disabled and no command interpolates bytes.
    delete childEnv.NEXTAUTH_SECRET;
    delete childEnv.GOOGLE_CLIENT_SECRET;
    delete childEnv.BASH_XTRACEFD;
    delete childEnv.BASHOPTS;
    // Do not inherit a developer or production database. This oracle owns a
    // disposable database and fails closed if it cannot create one.
    delete childEnv.DATABASE_URL;
    childEnv.NEXTAUTH_SECRET_FILE = secretPath;
    childEnv.NEXTAUTH_COOKIE_SECURE = "true";
    childEnv.MUNJIB_ENABLE_DEV_LOGIN = "false";
    childEnv.NEXTAUTH_URL ??= "http://127.0.0.1:3411";
    childEnv.AUTH_RUNTIME_SECRET_FILE = secretPath;
    childEnv.AUTH_RUNTIME_PORT ??= "3411";

    const preflightCode = await run("pnpm", [
      "exec",
      "tsx",
      "scripts/security/auth-runtime-preflight-e2e.ts",
    ], childEnv);
    if (preflightCode !== 0) {
      process.exitCode = preflightCode;
      return;
    }
    const buildCode = await run("pnpm", ["run", "build"], childEnv);
    if (buildCode !== 0) { process.exitCode = buildCode; return; }

    const network = await runCapture("docker", ["network", "create", networkName], childEnv);
    if (network.code !== 0) throw new Error("AUTH_RUNTIME_POSTGRES_NETWORK_CREATE_FAILED");
    networkCreated = true;
    const database = await runCapture("docker", [
      "run", "--detach", "--name", databaseContainerName,
      "--network", networkName,
      "--network-alias", "auth-runtime-db",
      "--publish", "127.0.0.1::5432",
      "--env", "POSTGRES_USER=auth_runtime",
      "--env", "POSTGRES_PASSWORD=auth_runtime",
      "--env", "POSTGRES_DB=auth_runtime",
      "pgvector/pgvector:0.8.2-pg16",
    ], childEnv);
    if (database.code !== 0 || !database.stdout.trim()) {
      throw new Error("AUTH_RUNTIME_POSTGRES_START_FAILED");
    }
    databaseStarted = true;
    await waitForPostgres(databaseContainerName, childEnv);
    const published = await runCapture("docker", ["port", databaseContainerName, "5432/tcp"], childEnv);
    if (published.code !== 0) throw new Error("AUTH_RUNTIME_POSTGRES_PORT_LOOKUP_FAILED");
    const hostPort = mappedPort(published.stdout);
    databaseURL = `postgresql://auth_runtime:auth_runtime@127.0.0.1:${hostPort}/auth_runtime?schema=public`;
    const migrationCode = await run("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      ...childEnv,
      DATABASE_URL: databaseURL,
    });
    if (migrationCode !== 0) throw new Error("AUTH_RUNTIME_POSTGRES_MIGRATION_FAILED");

    if (!process.env.AUTH_RUNTIME_BASE_URL) {
      const imageTag = `munjib-auth-runtime:${process.pid}`;
      const imageCode = await run("docker", ["build", "--target", "runner", "--tag", imageTag, "."], childEnv);
      if (imageCode !== 0) { process.exitCode = imageCode; return; }
      const container = await runCapture("docker", [
        "run", "--detach", "--name", containerName,
        // The bind-mounted descriptor keeps the host uid/gid. Running the
        // image with the same identity lets the strict reader verify owner
        // equality without chowning or copying secret bytes.
        "--user", `${runtimeUid}:${runtimeGid}`,
        "--network", networkName,
        "--publish", `${port}:3000`,
        "--mount", `type=bind,src=${secretPath},dst=/run/secrets/munjib_nextauth_secret,readonly`,
        "--env", "NODE_ENV=production",
        "--env", "MUNJIB_DEPLOYMENT_ENV=production",
        "--env", "MUNJIB_LAUNCH_ADMIN_EMAIL=admin@example.invalid",
        "--env", "MUNJIB_LAUNCH_VIEWER_EMAIL=trial@example.invalid",
        "--env", "HOME=/tmp",
        "--env", "COREPACK_HOME=/tmp/corepack",
        "--env", "NEXTAUTH_SECRET_FILE=/run/secrets/munjib_nextauth_secret",
        "--env", "NEXTAUTH_URL=https://munjib.example.test",
        "--env", "NEXTAUTH_COOKIE_SECURE=true",
        "--env", "MUNJIB_ENABLE_DEV_LOGIN=false",
        "--env", "DATABASE_URL=postgresql://auth_runtime:auth_runtime@auth-runtime-db:5432/auth_runtime?schema=public",
        imageTag,
      ], childEnv);
      if (container.code !== 0 || !container.stdout.trim()) {
        process.exitCode = container.code || 1;
        return;
      }
      containerStarted = true;
      childEnv.AUTH_RUNTIME_BASE_URL = baseURL;
      await waitFor(`${baseURL}/login`);
    }
    const code = await run("pnpm", [
      "exec",
      "playwright",
      "test",
      "--config=playwright.auth-runtime.config.ts",
      "tests/e2e/auth-runtime.spec.ts",
    ], { ...childEnv, AUTH_RUNTIME_BASE_URL: baseURL, DATABASE_URL: databaseURL ?? "" });
    if (code !== 0) process.exitCode = code;
  } finally {
    // Do not log the path or secret. Best-effort cleanup also removes the
    // directory if a browser process exits early.
    await rm(directory, { recursive: true, force: true });
    if (containerStarted) {
      await run("docker", ["rm", "--force", containerName], process.env);
    }
    if (databaseStarted) {
      await run("docker", ["rm", "--force", databaseContainerName], process.env);
    }
    if (networkCreated) {
      await run("docker", ["network", "rm", networkName], process.env);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "AUTH_RUNTIME_E2E_FAILED");
  process.exitCode = 1;
});
