// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_MODEL_SETTING_EVENT,
  INVALID_CHAT_MODEL_ERROR,
  RAG_CHAT_MODEL_PRESETS,
  readStoredChatModel,
  resetStoredChatModel,
  subscribeToStoredChatModelChanges,
  validateChatModelId,
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
        { id: "openrouter/fusion", label: "OpenRouter Fusion" },
        { id: "moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code" },
        { id: "qwen/qwen3.7-plus", label: "Qwen3.7 Plus" },
      ],
    );
    for (const preset of RAG_CHAT_MODEL_PRESETS) {
      expect(validateChatModelId(preset.id)).toEqual({ ok: true, value: preset.id });
      expect(preset.label.length).toBeGreaterThan(0);
    }
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
    expect(validateChatModelId("openrouter/fusion", "ollama")).toEqual({
      ok: false,
      error: INVALID_CHAT_MODEL_ERROR,
    });
    expect(validateChatModelId("myuser/mymodel", "ollama")).toEqual({
      ok: true,
      value: "myuser/mymodel",
    });
    expect(validateChatModelId("gemma4:e4b", "ollama")).toEqual({
      ok: true,
      value: "gemma4:e4b",
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

  it("ignores provider-incompatible setting events", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToStoredChatModelChanges(handler, { chatProvider: "ollama" });

    writeStoredChatModel("company-handbook", "openrouter/fusion", "openai-compatible");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "munjib:rag-chat-model:company-handbook",
        newValue: "qwen/qwen3.7-plus",
      }),
    );

    expect(handler).not.toHaveBeenCalled();

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
