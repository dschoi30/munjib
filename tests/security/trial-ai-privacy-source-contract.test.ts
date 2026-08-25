import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  serializeTrialVisitorCookie,
  TRIAL_VISITOR_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/auth/trial-visitor";
import { resolveTrialLoginEnabled } from "@/lib/auth/config";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const forbiddenPrivatePayloadNames = [
  "rawIp",
  "ipAddress",
  "visitorToken",
  "question",
  "prompt",
  "context",
  "answer",
  "challengeToken",
] as const;

function tableBody(migration: string, tableName: string) {
  const match = new RegExp(`CREATE TABLE "${tableName}" \\(([\\s\\S]*?)\\n\\);`).exec(migration);
  if (!match) throw new Error(`missing table ${tableName}`);
  return match[1];
}

function hasForbiddenPrivatePayload(source: string) {
  return forbiddenPrivatePayloadNames.some((name) =>
    new RegExp(`"${name}"\\s+(?:TEXT|VARCHAR|BYTEA|JSONB?)`, "i").test(source),
  );
}

function trialProjectionIsOpaque(source: string) {
  const start = source.indexOf("export type TrialEntitlementResult");
  const end = source.indexOf("type TrialEntitlementDependencies", start);
  if (start < 0 || end < 0) return false;
  const projection = source.slice(start, end);
  return !/(?:visitor|network)(?:Id|Digest|Subject)|capabilityId|token\s*:/i.test(projection);
}

function trialTelemetryIsSanitized(source: string) {
  const start = source.indexOf("export type CaptureTrialAiFailureInput");
  const end = source.indexOf("export function captureHandledAiUnavailable", start);
  const functionStart = source.indexOf("export function captureTrialAiFailure", end);
  if (start < 0 || end < 0 || functionStart < 0) return false;
  const contract = source.slice(start, end);
  const implementation = source.slice(functionStart);
  return (
    /surface:\s*"ask_document"\s*\|\s*"workspace_chat"/.test(contract) &&
    /resultCode:\s*"AI_UNAVAILABLE"/.test(contract) &&
    /remaining:\s*0\s*\|\s*1\s*\|\s*2/.test(contract) &&
    /anonymous_trial:\s*true/.test(implementation) &&
    /remaining_bucket:/.test(implementation) &&
    !/(question|prompt|context|answer|challenge|visitor|network|workspaceSlug)\s*:/i.test(contract)
  );
}

function rejectsTrialModelOverrides(route: string) {
  return (
    /admissionActor\.kind\s*===\s*"anonymous-trial"/.test(route) &&
    /\(hasChatProvider\s*\|\|\s*hasChatModel\)/.test(route) &&
    /return NextResponse\.json\([\s\S]*?(?:TRIAL_AI_MODEL_OVERRIDE_NOT_ALLOWED|INVALID_CHAT_MODEL_ERROR)[\s\S]*?status:\s*400/.test(
      route,
    )
  );
}

describe("anonymous Trial AI privacy source contract", () => {
  it("persists only pseudonymous visitor/network digests and usage metadata", () => {
    const migration = read(
      "prisma/migrations/20260825010000_anonymous_trial_ai_admission/migration.sql",
    );
    const schema = read("prisma/schema.prisma");
    const visitor = tableBody(migration, "TrialAiVisitorDailyUsage");
    const network = tableBody(migration, "TrialAiNetworkDailyUsage");
    const lease = tableBody(migration, "TrialAiAdmissionLease");
    const trialStorage = [visitor, network, lease].join("\n");

    expect(visitor).toMatch(/"visitorDigest" TEXT NOT NULL/);
    expect(network).toMatch(/"networkDigest" TEXT NOT NULL/);
    expect(lease).toMatch(/"visitorDigest" TEXT NOT NULL/);
    expect(hasForbiddenPrivatePayload(trialStorage)).toBe(false);
    expect(schema).toMatch(/model TrialAiVisitorDailyUsage[\s\S]*?visitorDigest\s+String/);
    expect(schema).toMatch(/model TrialAiNetworkDailyUsage[\s\S]*?networkDigest\s+String/);

    const rawIpMutation = `${trialStorage}\n"rawIp" TEXT NOT NULL`;
    const promptMutation = `${trialStorage}\n"prompt" JSONB NOT NULL`;
    expect(hasForbiddenPrivatePayload(rawIpMutation)).toBe(true);
    expect(hasForbiddenPrivatePayload(promptMutation)).toBe(true);
  });

  it("keeps entitlement JSON opaque and issues a bounded hardened cookie", () => {
    const entitlement = read("lib/auth/trial-entitlement.ts");
    expect(trialProjectionIsOpaque(entitlement)).toBe(true);
    expect(
      trialProjectionIsOpaque(
        entitlement.replace("setCookie?: string;", "visitorDigest: string; setCookie?: string;"),
      ),
    ).toBe(false);

    const cookie = serializeTrialVisitorCookie(`${"A".repeat(43)}.${"B".repeat(43)}`);
    expect(cookie).toContain("; HttpOnly");
    expect(cookie).toContain("; SameSite=Lax");
    expect(cookie).toContain("; Secure");
    expect(TRIAL_VISITOR_COOKIE_MAX_AGE_SECONDS).toBeGreaterThan(0);
    expect(TRIAL_VISITOR_COOKIE_MAX_AGE_SECONDS).toBeLessThanOrEqual(180 * 24 * 60 * 60);
  });

  it("forces Ask AI metadata-only capture for Trial", () => {
    const ask = read("lib/rag/ask.ts");
    expect(ask).toMatch(
      /captureMode:\s*prepared\.privacyMode\s*===\s*"anonymous-trial"\s*\?\s*"metadata"/,
    );
    expect(
      ask.replace(
        /prepared\.privacyMode\s*===\s*"anonymous-trial"\s*\?\s*"metadata"/,
        'prepared.privacyMode === "anonymous-trial" ? "full"',
      ),
    ).not.toMatch(
      /captureMode:\s*prepared\.privacyMode\s*===\s*"anonymous-trial"\s*\?\s*"metadata"/,
    );
  });

  it("keeps Workspace AI Trial requests stateless and outside chat persistence", () => {
    const workspaceChat = read("lib/rag/workspace-chat.ts");
    const statelessReturn = workspaceChat.indexOf('if (prepared.kind === "stateless-trial")');
    const sendFunctionEnd = workspaceChat.indexOf(
      "function throwIfWorkspaceChatStreamAborted",
      statelessReturn,
    );
    expect(statelessReturn).toBeGreaterThan(0);
    expect(sendFunctionEnd).toBeGreaterThan(statelessReturn);
    const statelessBranch = workspaceChat.slice(statelessReturn, sendFunctionEnd);
    expect(statelessBranch).not.toMatch(/aiChat(?:Thread|Message)|prisma\./);
    expect(statelessBranch).toMatch(/return transientWorkspaceChatAnswer\(prepared, answer\)/);
    expect(workspaceChat).toMatch(
      /privacySafeLogging:\s*prepared\.kind\s*===\s*"stateless-trial"/,
    );

    const persistenceMutation = statelessBranch.replace(
      "return transientWorkspaceChatAnswer(prepared, answer);",
      "await prisma.aiChatMessage.create({ data: {} });\n    return transientWorkspaceChatAnswer(prepared, answer);",
    );
    expect(persistenceMutation).toMatch(/aiChatMessage|prisma\./);
  });

  it("limits Trial failure telemetry to coarse allowlisted dimensions", () => {
    const telemetry = read("lib/observability/ai-unavailable.ts");
    expect(trialTelemetryIsSanitized(telemetry)).toBe(true);
    expect(
      trialTelemetryIsSanitized(
        telemetry.replace(
          'resultCode: "AI_UNAVAILABLE";',
          'resultCode: "AI_UNAVAILABLE"; question: string;',
        ),
      ),
    ).toBe(false);
  });

  it("rejects Trial model overrides on both AI surfaces", () => {
    const askRoute = read(
      "app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts",
    );
    const workspaceRoute = read(
      "app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts",
    );
    expect(rejectsTrialModelOverrides(askRoute)).toBe(true);
    expect(rejectsTrialModelOverrides(workspaceRoute)).toBe(true);
    expect(
      rejectsTrialModelOverrides(
        askRoute.replace('actor.admissionActor.kind === "anonymous-trial"', "false"),
      ),
    ).toBe(false);
  });

  it("removes the legacy shared provider and keeps production Trial opt-in fail-closed", () => {
    const authConfig = read("lib/auth/config.ts");
    const compose = read("docker-compose.yml");
    const capability = read("lib/auth/trial-entitlement.ts");

    expect(authConfig).not.toMatch(/id:\s*["']trial["']/);
    expect(authConfig).not.toMatch(/local-only-fixture-2@munjib\.com/);
    expect(resolveTrialLoginEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(resolveTrialLoginEnabled({ MUNJIB_ANONYMOUS_TRIAL_ENABLED: "TRUE" })).toBe(false);
    expect(compose).not.toMatch(/MUNJIB_ANONYMOUS_TRIAL_ENABLED\s*:/);
    expect(capability).toMatch(
      /if\s*\(!exactEnabled\(env\.MUNJIB_ANONYMOUS_TRIAL_ENABLED\)\)\s*return null/,
    );
  });
});
