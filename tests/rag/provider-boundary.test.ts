import { describe, expect, it } from "vitest";
import {
  createProviderBoundaryPolicy,
  parseOpaqueProviderRequest,
  sanitizeAiProviderTelemetry,
  validateProviderDestination,
} from "@/lib/rag/provider-boundary";

describe("AI provider boundary", () => {
  const policy = createProviderBoundaryPolicy({
    environment: "production",
    selections: [
      {
        selectionId: "chat-default-v1",
        provider: "openai",
        model: "gpt-5.4-mini",
        endpoint: {
          id: "openai-official-v1",
          origin: "https://api.openai.com",
          path: "/v1",
        },
      },
    ],
  });

  it("accepts only an opaque selection id and rejects client-owned provider configuration", () => {
    expect(parseOpaqueProviderRequest({ selectionId: "chat-default-v1" })).toEqual({
      selectionId: "chat-default-v1",
    });

    for (const value of [
      { provider: "openai", model: "gpt-5.4-mini" },
      { selectionId: "chat-default-v1", apiKey: "sk-not-a-client-field" },
      { selectionId: "chat-default-v1", baseUrl: "https://evil.example" },
      { selectionId: "chat-default-v1", embeddingModel: "bge-m3" },
      { selectionId: "chat-default-v1", policyBypass: true },
      { selectionId: "chat-default-v1", extra: "unknown" },
    ]) {
      expect(() => parseOpaqueProviderRequest(value)).toThrow("AI_PROVIDER_REQUEST_INVALID");
    }
  });

  it("resolves only an enabled, server-owned selection", () => {
    expect(policy.resolve("chat-default-v1")).toMatchObject({
      provider: "openai",
      model: "gpt-5.4-mini",
      endpoint: { id: "openai-official-v1" },
    });
    expect(() => policy.resolve("openai:gpt-5.4-mini")).toThrow("AI_PROVIDER_SELECTION_FORBIDDEN");
    expect(() => policy.resolve("missing")).toThrow("AI_PROVIDER_SELECTION_FORBIDDEN");

    const disabled = createProviderBoundaryPolicy({
      environment: "test",
      selections: [
        {
          selectionId: "disabled-v1",
          provider: "openai",
          model: "gpt-5.4-mini",
          enabled: false,
          endpoint: {
            id: "openai-official-v1",
            origin: "https://api.openai.com",
            path: "/v1",
          },
        },
      ],
    });
    expect(() => disabled.resolve("disabled-v1")).toThrow("AI_PROVIDER_SELECTION_FORBIDDEN");

    for (const malformed of [
      { selectionId: 123, provider: "openai", model: "gpt-5.4-mini" },
      { selectionId: "numeric-model-v1", provider: "openai", model: 123 },
    ]) {
      expect(() =>
        createProviderBoundaryPolicy({
          environment: "test",
          selections: [
            {
              ...malformed,
              endpoint: {
                id: "openai-official-v1",
                origin: "https://api.openai.com",
                path: "/v1",
              },
            } as never,
          ],
        }),
      ).toThrow("AI_PROVIDER_POLICY_INVALID");
    }

    for (const endpoint of [
      { id: "bad-origin-v1", origin: 123, path: "/v1" },
      { id: "bad-path-v1", origin: "https://api.openai.com", path: 123 },
      {
        id: "bad-loopback-v1",
        origin: "http://ollama:11434",
        path: "/api",
        allowLoopback: "yes",
      },
    ]) {
      expect(() =>
        createProviderBoundaryPolicy({
          environment: "test",
          selections: [
            {
              selectionId: "bad-endpoint-v1",
              provider: "openai",
              model: "gpt-5.4-mini",
              endpoint: endpoint as never,
            },
          ],
        }),
      ).toThrow("AI_PROVIDER_POLICY_INVALID");
    }
  });

  it("rejects credentials, alternate destinations, and production loopback/private addresses", () => {
    const endpoint = policy.resolve("chat-default-v1").endpoint;
    for (const value of [
      "https://user:pass@api.openai.com/v1",
      "https://api.openai.com:8443/v1",
      "https://api.openai.com/v1?next=https://evil.example",
      "https://api.openai.com/v1#fragment",
      "http://api.openai.com/v1",
      "https://evil.example/v1",
      "https://127.0.0.1/v1",
      "https://169.254.169.254/v1",
      "https://10.0.0.5/v1",
    ]) {
      expect(() => validateProviderDestination(value, endpoint, "production")).toThrow(
        "AI_PROVIDER_DESTINATION_FORBIDDEN",
      );
    }

    expect(validateProviderDestination("https://api.openai.com/v1", endpoint, "production")).toBe(
      "https://api.openai.com/v1",
    );

    const mappedPrivateEndpoint = {
      id: "mapped-private-v1",
      origin: "https://[::ffff:10.0.0.5]",
      path: "/v1",
    } as const;
    expect(() =>
      validateProviderDestination(
        "https://[::ffff:10.0.0.5]/v1",
        mappedPrivateEndpoint,
        "development",
      ),
    ).toThrow("AI_PROVIDER_DESTINATION_FORBIDDEN");
    for (const value of ["https://[::7f00:1]/v1", "https://[ff02::1]/v1"]) {
      expect(() => validateProviderDestination(value, { id: "ipv6-special-v1", origin: value.slice(0, value.indexOf("/v1")), path: "/v1" }, "development"))
        .toThrow("AI_PROVIDER_DESTINATION_FORBIDDEN");
    }
  });

  it("permits the fixed local endpoint only in non-production", () => {
    const local = {
      id: "ollama-internal-v1",
      origin: "http://ollama:11434",
      path: "/api",
      allowLoopback: true,
    } as const;
    expect(validateProviderDestination("http://ollama:11434/api", local, "development")).toBe(
      "http://ollama:11434/api",
    );
    expect(() => validateProviderDestination("http://localhost:11434/api", local, "production")).toThrow(
      "AI_PROVIDER_DESTINATION_FORBIDDEN",
    );
    expect(() => validateProviderDestination("http://ollama:11434/api", local, "production")).toThrow(
      "AI_PROVIDER_DESTINATION_FORBIDDEN",
    );
    expect(() =>
      validateProviderDestination("http://ollama:11434/api/", local, "development"),
    ).toThrow("AI_PROVIDER_DESTINATION_FORBIDDEN");
  });

  it("treats staging as production-like for destination security", () => {
    const local = { id: "ollama-internal-v1", origin: "http://ollama:11434", path: "/api", allowLoopback: true } as const;
    expect(() => validateProviderDestination("http://ollama:11434/api", local, "staging")).toThrow(
      "AI_PROVIDER_DESTINATION_FORBIDDEN",
    );
    expect(() => validateProviderDestination("http://api.openai.com/v1", policy.resolve("chat-default-v1").endpoint, "staging")).toThrow(
      "AI_PROVIDER_DESTINATION_FORBIDDEN",
    );
  });

  it("emits only bounded allowlisted metadata and drops content and identity fields", () => {
    expect(
      sanitizeAiProviderTelemetry({
        operation: "rag.answer",
        provider: "openai",
        model: "gpt-5.4-mini",
        policyVersion: 4,
        outcome: "success",
        latencyMs: 120,
        inputTokens: 12,
        outputTokens: 30,
        question: "secret prompt",
        prompt: "secret context",
        workspaceId: "workspace-secret",
        baseUrl: "https://api.openai.com/v1",
        headers: { authorization: "Bearer secret" },
      }),
    ).toEqual({
      operation: "rag.answer",
      provider: "openai",
      model: "gpt-5.4-mini",
      policyVersion: 4,
      outcome: "success",
      latencyMs: 120,
      inputTokens: 12,
      outputTokens: 30,
    });
  });

  it("fails closed for invalid telemetry instead of forwarding raw provider data", () => {
    expect(() =>
      sanitizeAiProviderTelemetry({
        operation: "rag.answer",
        provider: "evil-provider",
        model: "gpt-5.4-mini",
        policyVersion: 1,
        outcome: "success",
        latencyMs: 1,
      }),
    ).toThrow("AI_PROVIDER_TELEMETRY_INVALID");
    expect(() =>
      sanitizeAiProviderTelemetry({
        operation: "rag.answer",
        provider: "openai",
        model: "gpt-5.4-mini",
        policyVersion: 1,
        outcome: "success",
        latencyMs: -1,
      }),
    ).toThrow("AI_PROVIDER_TELEMETRY_INVALID");
  });
});
