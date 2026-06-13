type StartedOtelSdk = {
  start: () => void;
  shutdown?: () => Promise<void>;
};

type NodeSdkConstructor = new (config: { spanProcessors: unknown[] }) => StartedOtelSdk;

type LangfuseSpanProcessorConstructor = new (config: {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
  environment?: string;
}) => unknown;

type LangfuseOtelModules = {
  NodeSDK: NodeSdkConstructor;
  LangfuseSpanProcessor: LangfuseSpanProcessorConstructor;
};

type LangfuseOtelState = {
  sdk?: StartedOtelSdk;
  startPromise?: Promise<LangfuseOtelResult>;
};

type LangfuseOtelEnv = Record<string, string | undefined>;

type LangfuseOtelOptions = {
  env?: LangfuseOtelEnv;
  loadModules?: () => Promise<LangfuseOtelModules>;
  logger?: Pick<Console, "error">;
  state?: LangfuseOtelState;
};

export type LangfuseOtelResult =
  | { started: true; reason: "started" }
  | {
      started: false;
      reason:
        | "already-started"
        | "disabled"
        | "metadata-capture"
        | "missing-credentials"
        | "not-nodejs"
        | "failed";
    };

const STATE_SYMBOL = Symbol.for("munjib.langfuseOtel");

export async function initializeLangfuseOtel(
  options: LangfuseOtelOptions = {},
): Promise<LangfuseOtelResult> {
  const env = options.env ?? process.env;
  const state = options.state ?? getGlobalState();
  const logger = options.logger ?? console;

  if ((env.NEXT_RUNTIME ?? process.env.NEXT_RUNTIME) !== "nodejs") {
    return { started: false, reason: "not-nodejs" };
  }
  if (readBooleanEnv(env, "MUNJIB_LANGFUSE_ENABLED") === false) {
    return { started: false, reason: "disabled" };
  }
  if (readCaptureMode(env) !== "full") {
    return { started: false, reason: "metadata-capture" };
  }
  const credentials = readCredentials(env);
  if (!credentials) {
    return { started: false, reason: "missing-credentials" };
  }
  if (state.sdk) {
    return { started: false, reason: "already-started" };
  }
  if (state.startPromise) {
    return state.startPromise;
  }

  state.startPromise = startLangfuseOtel({
    credentials,
    environment: readOptionalEnv(env, "LANGFUSE_TRACING_ENVIRONMENT"),
    loadModules: options.loadModules ?? loadLangfuseOtelModules,
    logger,
    state,
  });
  return state.startPromise;
}

async function startLangfuseOtel({
  credentials,
  environment,
  loadModules,
  logger,
  state,
}: {
  credentials: { publicKey: string; secretKey: string; baseUrl?: string };
  environment?: string;
  loadModules: () => Promise<LangfuseOtelModules>;
  logger: Pick<Console, "error">;
  state: LangfuseOtelState;
}): Promise<LangfuseOtelResult> {
  try {
    const { NodeSDK, LangfuseSpanProcessor } = await loadModules();
    const spanProcessor = new LangfuseSpanProcessor({
      ...credentials,
      ...(environment ? { environment } : {}),
    });
    const sdk = new NodeSDK({ spanProcessors: [spanProcessor] });
    sdk.start();
    state.sdk = sdk;
    return { started: true, reason: "started" };
  } catch (error) {
    state.startPromise = undefined;
    logger.error("Langfuse OpenTelemetry startup failed:", error);
    return { started: false, reason: "failed" };
  }
}

async function loadLangfuseOtelModules(): Promise<LangfuseOtelModules> {
  const [nodeSdkModule, langfuseOtelModule] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@langfuse/otel"),
  ]);
  return {
    NodeSDK: nodeSdkModule.NodeSDK as NodeSdkConstructor,
    LangfuseSpanProcessor:
      langfuseOtelModule.LangfuseSpanProcessor as LangfuseSpanProcessorConstructor,
  };
}

function readCredentials(
  env: LangfuseOtelEnv,
): { publicKey: string; secretKey: string; baseUrl?: string } | undefined {
  const publicKey = readOptionalEnv(env, "LANGFUSE_PUBLIC_KEY");
  const secretKey = readOptionalEnv(env, "LANGFUSE_SECRET_KEY");
  if (!publicKey || !secretKey) {
    return undefined;
  }
  const baseUrl =
    readOptionalEnv(env, "LANGFUSE_BASEURL") ??
    readOptionalEnv(env, "LANGFUSE_BASE_URL") ??
    readOptionalEnv(env, "LANGFUSE_HOST");
  return {
    publicKey,
    secretKey,
    ...(baseUrl ? { baseUrl } : {}),
  };
}

function readCaptureMode(env: LangfuseOtelEnv): "metadata" | "full" {
  const value =
    readOptionalEnv(env, "MUNJIB_LANGFUSE_CAPTURE_MODE") ??
    readOptionalEnv(env, "MUNJIB_LANGFUSE_CAPTURE");
  return value?.toLowerCase() === "full" ? "full" : "metadata";
}

function readBooleanEnv(env: LangfuseOtelEnv, name: string): boolean | undefined {
  const value = readOptionalEnv(env, name)?.toLowerCase();
  if (!value) {
    return undefined;
  }
  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }
  return undefined;
}

function readOptionalEnv(env: LangfuseOtelEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function getGlobalState(): LangfuseOtelState {
  const globalWithState = globalThis as typeof globalThis & {
    [STATE_SYMBOL]?: LangfuseOtelState;
  };
  globalWithState[STATE_SYMBOL] ??= {};
  return globalWithState[STATE_SYMBOL];
}
