// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_MODEL_SETTING_EVENT,
  INCOMPATIBLE_CHAT_MODEL_PROVIDER_ERROR,
  INVALID_CHAT_MODEL_ERROR,
  RAG_CHAT_PROVIDER_RESET_DEFAULTS,
  RAG_CHAT_MODEL_PRESETS,
  addStoredCustomChatModel,
  getRagChatModelPresets,
  getRagChatProviderResetDefault,
  readStoredChatModelSetting,
  readStoredCustomChatModels,
  readStoredChatModel,
  resetStoredChatModel,
  subscribeToStoredChatModelChanges,
  validateChatModelId,
  validateChatModelSetting,
  writeStoredChatModelSetting,
  writeStoredChatModel,
} from "@/lib/rag/client-model-settings";

describe("client RAG chat model settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defines static presets that are valid model ids", () => {
    expect(RAG_CHAT_MODEL_PRESETS).toEqual(
      [
        { id: "openrouter/fusion", label: "OpenRouter Fusion", chatProvider: "openai-compatible" },
        { id: "moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code", chatProvider: "openai-compatible" },
        { id: "qwen/qwen3.7-plus", label: "Qwen3.7 Plus", chatProvider: "openai-compatible" },
        { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B IT Free", chatProvider: "openai-compatible" },
        { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B A4B IT Free", chatProvider: "openai-compatible" },
        { id: "openai/gpt-oss-20b:free", label: "GPT OSS 20B Free", chatProvider: "openai-compatible" },
        { id: "openai/gpt-oss-120b:free", label: "GPT OSS 120B Free", chatProvider: "openai-compatible" },
        { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", chatProvider: "openai" },
        { id: "gpt-5.4", label: "GPT-5.4", chatProvider: "openai" },
        { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", chatProvider: "openai" },
        { id: "gemma4:e4b", label: "Gemma4 E4B", chatProvider: "ollama" },
      ],
    );
    for (const preset of RAG_CHAT_MODEL_PRESETS) {
      expect(validateChatModelSetting({
        chatProvider: preset.chatProvider,
        chatModel: preset.id,
      })).toEqual({
        ok: true,
        value: { chatProvider: preset.chatProvider, chatModel: preset.id },
      });
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it("returns presets and reset defaults by provider", () => {
    expect(getRagChatModelPresets("openai-compatible").map((preset) => preset.id)).toEqual([
      "openrouter/fusion",
      "moonshotai/kimi-k2.7-code",
      "qwen/qwen3.7-plus",
      "google/gemma-4-31b-it:free",
      "google/gemma-4-26b-a4b-it:free",
      "openai/gpt-oss-20b:free",
      "openai/gpt-oss-120b:free",
    ]);
    expect(getRagChatModelPresets("openai").map((preset) => preset.id)).toEqual([
      "gpt-5.4-mini",
      "gpt-5.4",
      "gpt-4.1-mini",
    ]);
    expect(getRagChatModelPresets("ollama").map((preset) => preset.id)).toEqual([
      "gemma4:e4b",
    ]);
    expect(RAG_CHAT_PROVIDER_RESET_DEFAULTS).toEqual({
      ollama: { chatProvider: "ollama", chatModel: "gemma4:e4b" },
      openai: { chatProvider: "openai", chatModel: "gpt-5.4-mini" },
      "openai-compatible": {
        chatProvider: "openai-compatible",
        chatModel: "google/gemma-4-31b-it:free",
      },
    });
    expect(getRagChatProviderResetDefault("openai")).toEqual({
      chatProvider: "openai",
      chatModel: "gpt-5.4-mini",
    });
  });

  it("validates and normalizes chat model ids", () => {
    expect(validateChatModelId(" openrouter/fusion ")).toEqual({
      ok: true,
      value: "openrouter/fusion",
    });
    expect(validateChatModelId("moonshotai/kimi-k2.7-code")).toEqual({
      ok: true,
      value: "moonshotai/kimi-k2.7-code",
    });
    expect(validateChatModelId("a".repeat(160))).toEqual({
      ok: true,
      value: "a".repeat(160),
    });
    expect(validateChatModelId("provider/model.name_tag:version-1")).toEqual({
      ok: true,
      value: "provider/model.name_tag:version-1",
    });
    expect(validateChatModelId("google/gemma-4-31b-it:free", "openai-compatible")).toEqual({
      ok: true,
      value: "google/gemma-4-31b-it:free",
    });
    expect(validateChatModelId("openrouter/fusion", "ollama")).toEqual({
      ok: false,
      error: INCOMPATIBLE_CHAT_MODEL_PROVIDER_ERROR,
    });
    expect(validateChatModelId("google/gemma-4-31b-it:free", "ollama")).toEqual({
      ok: false,
      error: INCOMPATIBLE_CHAT_MODEL_PROVIDER_ERROR,
    });
    expect(validateChatModelId("openai/gpt-oss-20b:free", "ollama")).toEqual({
      ok: false,
      error: INCOMPATIBLE_CHAT_MODEL_PROVIDER_ERROR,
    });
    expect(validateChatModelId("myuser/mymodel", "ollama")).toEqual({
      ok: true,
      value: "myuser/mymodel",
    });
    expect(validateChatModelId("gemma4:e4b", "ollama")).toEqual({
      ok: true,
      value: "gemma4:e4b",
    });
    expect(validateChatModelId("gpt-5.4-mini", "openai")).toEqual({
      ok: true,
      value: "gpt-5.4-mini",
    });
    expect(validateChatModelId("gpt-4.1-mini", "openai")).toEqual({
      ok: true,
      value: "gpt-4.1-mini",
    });
    expect(validateChatModelId("openai/gpt-oss-20b:free", "openai")).toEqual({
      ok: false,
      error: INCOMPATIBLE_CHAT_MODEL_PROVIDER_ERROR,
    });
    expect(validateChatModelId(42)).toEqual({
      ok: false,
      error: INVALID_CHAT_MODEL_ERROR,
    });
    expect(validateChatModelId("")).toEqual({ ok: false, error: INVALID_CHAT_MODEL_ERROR });
    expect(validateChatModelId("bad model")).toEqual({
      ok: false,
      error: INVALID_CHAT_MODEL_ERROR,
    });
    expect(validateChatModelId("-bad-prefix")).toEqual({
      ok: false,
      error: INVALID_CHAT_MODEL_ERROR,
    });
    expect(validateChatModelId("a".repeat(161))).toEqual({
      ok: false,
      error: INVALID_CHAT_MODEL_ERROR,
    });
  });

  it("stores model ids per workspace", () => {
    expect(writeStoredChatModel("company-handbook", "openrouter/fusion")).toEqual({
      ok: true,
      value: "openrouter/fusion",
      stored: true,
    });
    expect(writeStoredChatModel("research", "qwen/qwen3.7-plus")).toEqual({
      ok: true,
      value: "qwen/qwen3.7-plus",
      stored: true,
    });

    expect(readStoredChatModel("company-handbook")).toBe("openrouter/fusion");
    expect(readStoredChatModel("research")).toBe("qwen/qwen3.7-plus");
  });

  it("stores provider-aware model settings per workspace", () => {
    expect(writeStoredChatModelSetting("company-handbook", {
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    })).toEqual({
      ok: true,
      value: {
        chatProvider: "openai-compatible",
        chatModel: "google/gemma-4-31b-it:free",
      },
      stored: true,
    });

    expect(readStoredChatModelSetting("company-handbook")).toEqual({
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    });
    expect(readStoredChatModel("company-handbook")).toBe("google/gemma-4-31b-it:free");
  });

  it("reads legacy string model storage with the supplied provider", () => {
    window.localStorage.setItem(
      "munjib:rag-chat-model:company-handbook",
      "moonshotai/kimi-k2.7-code",
    );

    expect(readStoredChatModelSetting("company-handbook", "openai-compatible")).toEqual({
      chatProvider: "openai-compatible",
      chatModel: "moonshotai/kimi-k2.7-code",
    });
  });

  it("stores custom model registrations per workspace", () => {
    expect(addStoredCustomChatModel("company-handbook", {
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    })).toBe(true);
    expect(addStoredCustomChatModel("company-handbook", {
      chatProvider: "openai-compatible",
      chatModel: "google/gemma-4-31b-it:free",
    })).toBe(true);
    expect(addStoredCustomChatModel("company-handbook", {
      chatProvider: "ollama",
      chatModel: "myuser/mymodel",
    })).toBe(true);

    expect(readStoredCustomChatModels("company-handbook")).toEqual([
      {
        chatProvider: "ollama",
        chatModel: "myuser/mymodel",
      },
      {
        chatProvider: "openai-compatible",
        chatModel: "google/gemma-4-31b-it:free",
      },
    ]);
    expect(readStoredCustomChatModels("research")).toEqual([]);
  });

  it("ignores provider-incompatible stored values", () => {
    window.localStorage.setItem(
      "munjib:rag-chat-model:company-handbook",
      "moonshotai/kimi-k2.7-code",
    );

    expect(readStoredChatModel("company-handbook", "ollama")).toBeNull();
    expect(window.localStorage.getItem("munjib:rag-chat-model:company-handbook")).toBe(
      "moonshotai/kimi-k2.7-code",
    );
  });

  it("removes corrupted stored values", () => {
    window.localStorage.setItem("munjib:rag-chat-model:company-handbook", "bad model");

    expect(readStoredChatModel("company-handbook")).toBeNull();
    expect(window.localStorage.getItem("munjib:rag-chat-model:company-handbook")).toBeNull();
  });

  it("resets stored model ids", () => {
    writeStoredChatModel("company-handbook", "openrouter/fusion");

    expect(resetStoredChatModel("company-handbook")).toBe(true);

    expect(readStoredChatModel("company-handbook")).toBeNull();
  });

  it("emits a browser event when settings change", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToStoredChatModelChanges(handler);

    writeStoredChatModel("company-handbook", "openrouter/fusion");
    resetStoredChatModel("company-handbook");

    expect(handler).toHaveBeenNthCalledWith(1, {
      workspaceSlug: "company-handbook",
      chatModel: "openrouter/fusion",
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      workspaceSlug: "company-handbook",
      chatModel: null,
    });

    unsubscribe();
    window.dispatchEvent(new CustomEvent(CHAT_MODEL_SETTING_EVENT));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("ignores malformed setting events", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToStoredChatModelChanges(handler);

    window.dispatchEvent(new CustomEvent(CHAT_MODEL_SETTING_EVENT));
    window.dispatchEvent(new CustomEvent(CHAT_MODEL_SETTING_EVENT, { detail: null }));
    window.dispatchEvent(
      new CustomEvent(CHAT_MODEL_SETTING_EVENT, {
        detail: { workspaceSlug: 123, chatModel: "openrouter/fusion" },
      }),
    );
    window.dispatchEvent(
      new CustomEvent(CHAT_MODEL_SETTING_EVENT, {
        detail: { workspaceSlug: "company-handbook", chatModel: "bad model" },
      }),
    );
    window.dispatchEvent(
      new CustomEvent(CHAT_MODEL_SETTING_EVENT, {
        detail: { workspaceSlug: "company-handbook", chatModel: undefined },
      }),
    );

    expect(handler).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("does not emit write events when storage persistence fails", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToStoredChatModelChanges(handler);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("setItem failed");
    });

    expect(writeStoredChatModel("company-handbook", "openrouter/fusion")).toEqual({
      ok: true,
      value: "openrouter/fusion",
      stored: false,
    });

    expect(handler).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("does not emit reset events when storage removal fails", () => {
    window.localStorage.setItem("munjib:rag-chat-model:company-handbook", "openrouter/fusion");
    const handler = vi.fn();
    const unsubscribe = subscribeToStoredChatModelChanges(handler);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("removeItem failed");
    });

    expect(resetStoredChatModel("company-handbook")).toBe(false);

    expect(handler).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("munjib:rag-chat-model:company-handbook")).toBe(
      "openrouter/fusion",
    );

    unsubscribe();
  });

  it("returns null when storage reads fail", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("getItem failed");
    });

    expect(readStoredChatModel("company-handbook")).toBeNull();
  });

  it("accepts provider-aware setting events when the selected provider differs from the default", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToStoredChatModelChanges(handler, { chatProvider: "ollama" });

    writeStoredChatModel("company-handbook", "openrouter/fusion", "openai-compatible");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "munjib:rag-chat-model:company-handbook",
        newValue: "qwen/qwen3.7-plus",
      }),
    );

    expect(handler).toHaveBeenNthCalledWith(1, {
      workspaceSlug: "company-handbook",
      chatProvider: "openai-compatible",
      chatModel: "qwen/qwen3.7-plus",
    });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("subscribes to cross-tab storage changes", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToStoredChatModelChanges(handler);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "munjib:rag-chat-model:company-handbook",
        newValue: "qwen/qwen3.7-plus",
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "munjib:rag-chat-model:company-handbook",
        newValue: null,
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "munjib:rag-chat-model:research",
        newValue: "bad model",
      }),
    );

    expect(handler).toHaveBeenNthCalledWith(1, {
      workspaceSlug: "company-handbook",
      chatProvider: "openai-compatible",
      chatModel: "qwen/qwen3.7-plus",
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      workspaceSlug: "company-handbook",
      chatModel: null,
    });
    expect(handler).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
