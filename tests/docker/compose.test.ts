import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const readCompose = () =>
  parse(read("docker-compose.yml")) as {
    services: Record<
      string,
      {
        build?: { args?: Record<string, string> };
        environment?: Record<string, string>;
      }
    >;
  };

describe("Docker web service configuration", () => {
  test("default compose runs web with the existing postgres service", () => {
    const compose = read("docker-compose.yml");
    const composeConfig = readCompose();
    const web = composeConfig.services.web;
    const tools = composeConfig.services.tools;

    expect(compose).toContain("postgres:");
    expect(compose).toContain("web:");
    expect(compose).toContain("WEB_IMAGE");
    expect(compose).toContain("ghcr.io/dschoi30/munjib:latest");
    expect(compose).toContain("target: runner");
    expect(compose).toContain("target: tools");
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("DOCKER_DATABASE_URL");
    expect(compose).toContain("postgres:5432");
    expect(compose).toContain("NEXTAUTH_URL");
    expect(compose).toContain("localhost:3000");
    expect(compose).toContain("NEXTAUTH_SECRET");
    expect(compose).toContain("NEXTAUTH_COOKIE_SECURE");
    expect(compose).toContain("MUNJIB_ENABLE_DEV_LOGIN");
    expect(web.build?.args).toMatchObject({
      NEXT_PUBLIC_SENTRY_DSN: "${NEXT_PUBLIC_SENTRY_DSN:-}",
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "${NEXT_PUBLIC_SENTRY_ENVIRONMENT:-production}",
      NEXT_PUBLIC_SENTRY_RELEASE: "${NEXT_PUBLIC_SENTRY_RELEASE:-}",
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:
        "${NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:-0.05}",
      NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE:
        "${NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE:-0}",
      NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE:
        "${NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE:-0}",
      SENTRY_RELEASE: "${SENTRY_RELEASE:-}",
    });
    expect(web.environment).toMatchObject({
      MUNJIB_ENABLE_DEV_LOGIN: "${MUNJIB_ENABLE_DEV_LOGIN:-}",
      SENTRY_DSN: "${SENTRY_DSN:-}",
      SENTRY_ENVIRONMENT: "${SENTRY_ENVIRONMENT:-production}",
      SENTRY_RELEASE: "${SENTRY_RELEASE:-}",
      SENTRY_TRACES_SAMPLE_RATE: "${SENTRY_TRACES_SAMPLE_RATE:-0.05}",
      SENTRY_RUNTIME_METRICS_ENABLED: "${SENTRY_RUNTIME_METRICS_ENABLED:-false}",
      SENTRY_RUNTIME_METRICS_INTERVAL_MS:
        "${SENTRY_RUNTIME_METRICS_INTERVAL_MS:-60000}",
      NEXT_PUBLIC_SENTRY_DSN: "${NEXT_PUBLIC_SENTRY_DSN:-}",
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "${NEXT_PUBLIC_SENTRY_ENVIRONMENT:-production}",
      NEXT_PUBLIC_SENTRY_RELEASE: "${NEXT_PUBLIC_SENTRY_RELEASE:-}",
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:
        "${NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:-0.05}",
      NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE:
        "${NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE:-0}",
      NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE:
        "${NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE:-0}",
    });
    for (const key of [
      "SENTRY_DSN",
      "SENTRY_ENVIRONMENT",
      "SENTRY_RELEASE",
      "SENTRY_TRACES_SAMPLE_RATE",
      "SENTRY_RUNTIME_METRICS_ENABLED",
      "SENTRY_RUNTIME_METRICS_INTERVAL_MS",
      "NEXT_PUBLIC_SENTRY_DSN",
      "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
      "NEXT_PUBLIC_SENTRY_RELEASE",
      "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
      "NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE",
      "NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE",
    ]) {
      expect(tools.environment).not.toHaveProperty(key);
    }
    expect(compose).toContain("MUNJIB_OLLAMA_BASE_URL");
    expect(compose).toContain("host.docker.internal:11434");
    expect(compose).toContain("MUNJIB_RAG_CHAT_MODEL");
    expect(compose).toContain("gemma4:e4b");
    expect(compose).toContain("MUNJIB_RAG_EMBED_MODEL");
    expect(compose).toContain("bge-m3");
    expect(compose).toContain("MUNJIB_RAG_EMBED_DIMENSIONS");
    expect(compose).toContain("host.docker.internal:host-gateway");
    expect(compose).toContain('"${WEB_PORT:-3000}:3000"');
    expect(compose).toContain("web_storage:/app/storage");
    expect(compose).toContain("web_storage:");
  });

  test("uses a pgvector-enabled postgres image", () => {
    const compose = read("docker-compose.yml");

    expect(compose).toContain("pgvector/pgvector:0.8.2-pg16");
  });

  test("passes RAG provider and optional Langfuse settings into the web service", () => {
    const { services } = readCompose();

    expect(services.web.environment).toMatchObject({
      MUNJIB_RAG_CHAT_PROVIDER: "${MUNJIB_RAG_CHAT_PROVIDER:-ollama}",
      MUNJIB_RAG_EMBED_PROVIDER: "${MUNJIB_RAG_EMBED_PROVIDER:-ollama}",
      MUNJIB_OLLAMA_BASE_URL:
        "${MUNJIB_OLLAMA_BASE_URL:-http://host.docker.internal:11434}",
      MUNJIB_RAG_CHAT_MODEL: "${MUNJIB_RAG_CHAT_MODEL:-gemma4:e4b}",
      MUNJIB_RAG_EMBED_MODEL: "${MUNJIB_RAG_EMBED_MODEL:-bge-m3}",
      MUNJIB_RAG_EMBED_DIMENSIONS: "${MUNJIB_RAG_EMBED_DIMENSIONS:-1024}",
      OPENAI_API_KEY: "${OPENAI_API_KEY:-}",
      MUNJIB_OPENAI_API_KEY: "${MUNJIB_OPENAI_API_KEY:-}",
      MUNJIB_OPENAI_BASE_URL: "${MUNJIB_OPENAI_BASE_URL:-}",
      MUNJIB_OPENAI_COMPATIBLE_BASE_URL:
        "${MUNJIB_OPENAI_COMPATIBLE_BASE_URL:-}",
      MUNJIB_OPENAI_COMPATIBLE_API_KEY: "${MUNJIB_OPENAI_COMPATIBLE_API_KEY:-}",
      LANGFUSE_PUBLIC_KEY: "${LANGFUSE_PUBLIC_KEY:-}",
      LANGFUSE_SECRET_KEY: "${LANGFUSE_SECRET_KEY:-}",
      LANGFUSE_HOST: "${LANGFUSE_HOST:-}",
      LANGFUSE_BASEURL: "${LANGFUSE_BASEURL:-}",
      LANGFUSE_BASE_URL: "${LANGFUSE_BASE_URL:-}",
      LANGFUSE_TRACING_ENVIRONMENT: "${LANGFUSE_TRACING_ENVIRONMENT:-production}",
      MUNJIB_LANGFUSE_ENABLED: "${MUNJIB_LANGFUSE_ENABLED:-}",
      MUNJIB_LANGFUSE_CAPTURE_MODE: "${MUNJIB_LANGFUSE_CAPTURE_MODE:-}",
      MUNJIB_LANGFUSE_CAPTURE: "${MUNJIB_LANGFUSE_CAPTURE:-metadata}",
    });
  });

  test("development override runs next dev from the dev image target", () => {
    const compose = read("docker-compose.dev.yml");

    expect(compose).toContain("WEB_DEV_IMAGE");
    expect(compose).toContain("munjib-web-dev");
    expect(compose).toContain("target: dev");
    expect(compose).toContain("pnpm run dev");
    expect(compose).toContain("DOCKER_DATABASE_URL");
    expect(compose).toContain("postgres:5432");
    expect(compose).toContain("NEXTAUTH_URL");
    expect(compose).toContain(".:/app");
    expect(compose).toContain("/app/node_modules");
    expect(compose).toContain("/app/.next");
  });

  test("Dockerfile exposes production and development targets", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toContain("FROM deps AS tools");
    expect(dockerfile).toContain("FROM deps AS runner");
    expect(dockerfile).toContain("FROM deps AS dev");
    expect(dockerfile).toContain("pnpm run build");
    expect(dockerfile).toContain("COPY --from=builder /app/public ./public");
    expect(dockerfile).toContain("COPY --from=builder /app/next.config.mjs ./next.config.mjs");
    expect(dockerfile).not.toContain("next.config.ts");
    expect(dockerfile).toContain("pnpm prune --prod");
    expect(dockerfile).toContain('CMD ["pnpm", "start"]');
    expect(dockerfile).toContain('CMD ["pnpm", "run", "dev"]');
  });

  test("Dockerfile sets Sentry build values in the builder stage before building", () => {
    const dockerfile = read("Dockerfile");
    const builderStart = dockerfile.indexOf("FROM deps AS builder");
    const toolsStart = dockerfile.indexOf("FROM deps AS tools");
    const builderStage = dockerfile.slice(builderStart, toolsStart);
    const buildStart = builderStage.indexOf("RUN pnpm run build");
    const sentryBuildLines = [
      'ARG NEXT_PUBLIC_SENTRY_DSN=""',
      'ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT="production"',
      'ARG NEXT_PUBLIC_SENTRY_RELEASE=""',
      'ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="0.05"',
      'ARG NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE="0"',
      'ARG NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE="0"',
      'ARG SENTRY_RELEASE=""',
      "ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN",
      "ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT",
      "ENV NEXT_PUBLIC_SENTRY_RELEASE=$NEXT_PUBLIC_SENTRY_RELEASE",
      "ENV NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
      "ENV NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE",
      "ENV NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE",
      "ENV SENTRY_RELEASE=$SENTRY_RELEASE",
    ];

    expect(builderStart).toBeGreaterThanOrEqual(0);
    expect(toolsStart).toBeGreaterThan(builderStart);
    expect(buildStart).toBeGreaterThanOrEqual(0);

    for (const line of sentryBuildLines) {
      const lineIndex = builderStage.indexOf(line);

      expect(builderStage).toContain(line);
      expect(lineIndex).toBeLessThan(buildStart);
    }
  });

  test("dockerignore keeps local artifacts out of image builds", () => {
    const dockerignore = read(".dockerignore");

    expect(dockerignore).toContain("node_modules");
    expect(dockerignore).toContain(".next");
    expect(dockerignore).toContain(".env");
    expect(dockerignore).toContain(".worktrees");
  });

  test("environment examples document Sentry SaaS settings without auth tokens", () => {
    const envExample = read(".env.example");
    const dockerEnvExample = read(".env.docker.example");
    const expectedKeys = [
      "SENTRY_DSN=",
      "SENTRY_ENVIRONMENT=",
      "SENTRY_RELEASE=",
      "SENTRY_TRACES_SAMPLE_RATE=",
      "SENTRY_RUNTIME_METRICS_ENABLED=",
      "SENTRY_RUNTIME_METRICS_INTERVAL_MS=",
      "NEXT_PUBLIC_SENTRY_DSN=",
      "NEXT_PUBLIC_SENTRY_ENVIRONMENT=",
      "NEXT_PUBLIC_SENTRY_RELEASE=",
      "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=",
      "NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=",
      "NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=",
    ];

    for (const key of expectedKeys) {
      expect(envExample).toContain(key);
      expect(dockerEnvExample).toContain(key);
    }

    expect(envExample).not.toContain("SENTRY_AUTH_TOKEN");
    expect(dockerEnvExample).not.toContain("SENTRY_AUTH_TOKEN");
  });

  test("environment examples document RAG provider and optional Langfuse settings", () => {
    const envExample = read(".env.example");
    const dockerEnvExample = read(".env.docker.example");
    const expectedKeys = [
      "MUNJIB_RAG_CHAT_PROVIDER=ollama",
      "MUNJIB_RAG_EMBED_PROVIDER=ollama",
      "MUNJIB_OLLAMA_BASE_URL=",
      "MUNJIB_RAG_CHAT_MODEL=gemma4:e4b",
      "MUNJIB_RAG_EMBED_MODEL=bge-m3",
      "MUNJIB_RAG_EMBED_DIMENSIONS=1024",
      "OPENAI_API_KEY=",
      "MUNJIB_OPENAI_API_KEY=",
      "MUNJIB_OPENAI_BASE_URL=",
      "MUNJIB_OPENAI_COMPATIBLE_BASE_URL=",
      "MUNJIB_OPENAI_COMPATIBLE_API_KEY=",
      "LANGFUSE_PUBLIC_KEY=",
      "LANGFUSE_SECRET_KEY=",
      "LANGFUSE_HOST=",
      "LANGFUSE_BASEURL=",
      "LANGFUSE_BASE_URL=",
      "MUNJIB_LANGFUSE_ENABLED=",
      "MUNJIB_LANGFUSE_CAPTURE_MODE=metadata",
      "MUNJIB_LANGFUSE_CAPTURE=metadata",
    ];

    for (const key of expectedKeys) {
      expect(envExample).toContain(key);
      expect(dockerEnvExample).toContain(key);
    }
    expect(envExample).toContain("LANGFUSE_TRACING_ENVIRONMENT=development");
    expect(dockerEnvExample).toContain("LANGFUSE_TRACING_ENVIRONMENT=production");
    expect(envExample).toContain("Metadata mode does not attach a Langfuse callback");
    expect(dockerEnvExample).toContain("Metadata mode does not attach a Langfuse callback");
    expect(envExample).toContain("MUNJIB_LANGFUSE_ENABLED=false disables tracing");
    expect(dockerEnvExample).toContain("MUNJIB_LANGFUSE_ENABLED=false disables tracing");
    expect(envExample).toContain("Either capture variable set to full enables full capture");
    expect(dockerEnvExample).toContain("Either capture variable set to full enables full capture");
  });
});
