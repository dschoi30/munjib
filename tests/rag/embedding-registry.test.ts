import { describe, expect, it } from "vitest";
import { CURRENT_EMBEDDING_INDEX } from "@/lib/rag/model-config";
import {
  CURRENT_EMBEDDING_PROFILE,
  EMBEDDING_PROFILE_DIMENSIONS,
  EMBEDDING_PROFILE_REGISTRY,
  EMBEDDING_REGISTRY_ERROR_CODES,
  buildEmbeddingProfileId,
  findEmbeddingProfile,
  findEmbeddingProfileByIdentity,
  listEmbeddingProfiles,
} from "@/lib/rag/embedding-registry";

describe("embedding profile registry", () => {
  it("describes the current index without changing its legacy identity", () => {
    expect(CURRENT_EMBEDDING_PROFILE).toMatchObject({
      provider: CURRENT_EMBEDDING_INDEX.provider,
      model: CURRENT_EMBEDDING_INDEX.model,
      dimensions: CURRENT_EMBEDDING_INDEX.dimensions,
      indexId: CURRENT_EMBEDDING_INDEX.indexId,
      profileId: "v1:ollama:bge-m3:1024",
      costTier: "local",
      enabledByDefault: true,
    });
    expect(CURRENT_EMBEDDING_PROFILE).not.toHaveProperty("apiKey");
    expect(CURRENT_EMBEDDING_PROFILE).not.toHaveProperty("baseUrl");
    expect(EMBEDDING_PROFILE_REGISTRY).toEqual([CURRENT_EMBEDDING_PROFILE]);
  });

  it("builds a deterministic versioned id from a profile identity", () => {
    expect(
      buildEmbeddingProfileId({
        provider: "ollama",
        model: " bge-m3 ",
        dimensions: EMBEDDING_PROFILE_DIMENSIONS,
      }),
    ).toBe("v1:ollama:bge-m3:1024");
    expect(
      buildEmbeddingProfileId({
        provider: "openai-compatible",
        model: "text-embedding-3-small:1024",
        dimensions: EMBEDDING_PROFILE_DIMENSIONS,
      }),
    ).toBe("v1:openai-compatible:text-embedding-3-small%3A1024:1024");
  });

  it.each([
    [768, EMBEDDING_REGISTRY_ERROR_CODES.UNSUPPORTED_DIMENSIONS],
    [1536, EMBEDDING_REGISTRY_ERROR_CODES.UNSUPPORTED_DIMENSIONS],
    [0, EMBEDDING_REGISTRY_ERROR_CODES.UNSUPPORTED_DIMENSIONS],
  ])("rejects unsupported embedding dimensions (%s)", (dimensions, errorCode) => {
    expect(() =>
      buildEmbeddingProfileId({
        provider: "ollama",
        model: "future-model",
        dimensions,
      }),
    ).toThrow(errorCode);
  });

  it("rejects an empty model id before a future profile can be registered", () => {
    expect(() =>
      buildEmbeddingProfileId({
        provider: "ollama",
        model: "  ",
        dimensions: EMBEDDING_PROFILE_DIMENSIONS,
      }),
    ).toThrow(EMBEDDING_REGISTRY_ERROR_CODES.INVALID_PROFILE);
  });

  it("looks up profiles by versioned id or exact embedding identity", () => {
    expect(findEmbeddingProfile(CURRENT_EMBEDDING_PROFILE.profileId)).toBe(
      CURRENT_EMBEDDING_PROFILE,
    );
    expect(
      findEmbeddingProfileByIdentity({
        provider: "ollama",
        model: "bge-m3",
        dimensions: 1024,
      }),
    ).toBe(CURRENT_EMBEDDING_PROFILE);
    expect(
      findEmbeddingProfileByIdentity({
        provider: "ollama",
        model: "bge-m3",
        dimensions: 768,
      }),
    ).toBeUndefined();
  });

  it("filters registry metadata using caller-supplied provider availability", () => {
    expect(listEmbeddingProfiles()).toEqual([CURRENT_EMBEDDING_PROFILE]);
    expect(listEmbeddingProfiles({ ollama: true })).toEqual([CURRENT_EMBEDDING_PROFILE]);
    expect(listEmbeddingProfiles({ ollama: false })).toEqual([]);
  });
});
