import { CURRENT_EMBEDDING_INDEX, type RagProvider } from "@/lib/rag/model-config";

export const EMBEDDING_PROFILE_DIMENSIONS = 1024 as const;
export const EMBEDDING_PROFILE_ID_VERSION = 1 as const;

export type EmbeddingProfileCostTier = "local" | "low" | "standard";

export type EmbeddingProfile = Readonly<{
  profileId: string;
  provider: RagProvider;
  model: string;
  dimensions: typeof EMBEDDING_PROFILE_DIMENSIONS;
  indexId: string;
  label: string;
  costTier: EmbeddingProfileCostTier;
  enabledByDefault: boolean;
}>;

export type EmbeddingProfileIdentity = Readonly<{
  provider: RagProvider;
  model: string;
  dimensions: number;
}>;

export const EMBEDDING_REGISTRY_ERROR_CODES = {
  INVALID_PROFILE: "RAG_EMBEDDING_PROFILE_INVALID",
  UNSUPPORTED_DIMENSIONS: "RAG_EMBEDDING_DIMENSIONS_UNSUPPORTED",
} as const;

/**
 * The only profile currently registered is the existing live index. Keep the
 * legacy index id stable until a later, explicitly authorized migration owns
 * the profile switch.
 */
export const CURRENT_EMBEDDING_PROFILE: EmbeddingProfile = Object.freeze({
  profileId: "v1:ollama:bge-m3:1024",
  provider: CURRENT_EMBEDDING_INDEX.provider,
  model: CURRENT_EMBEDDING_INDEX.model,
  dimensions: CURRENT_EMBEDDING_INDEX.dimensions,
  indexId: CURRENT_EMBEDDING_INDEX.indexId,
  label: "Ollama bge-m3 (1024 dimensions)",
  costTier: "local",
  enabledByDefault: true,
});

/**
 * Registry metadata is intentionally side-effect free. Provider availability
 * and credentials are supplied by the caller and never read here.
 */
export const EMBEDDING_PROFILE_REGISTRY: readonly EmbeddingProfile[] = Object.freeze([
  CURRENT_EMBEDDING_PROFILE,
]);

export function buildEmbeddingProfileId(identity: EmbeddingProfileIdentity): string {
  const provider = normalizeProvider(identity.provider);
  const model = normalizeModel(identity.model);
  validateDimensions(identity.dimensions);

  return `v${EMBEDDING_PROFILE_ID_VERSION}:${provider}:${encodeURIComponent(model)}:${EMBEDDING_PROFILE_DIMENSIONS}`;
}

export function findEmbeddingProfile(profileId: string): EmbeddingProfile | undefined {
  if (typeof profileId !== "string") {
    return undefined;
  }

  const normalizedId = profileId.trim();
  return EMBEDDING_PROFILE_REGISTRY.find((profile) => profile.profileId === normalizedId);
}

export function findEmbeddingProfileByIdentity(
  identity: EmbeddingProfileIdentity,
): EmbeddingProfile | undefined {
  try {
    return findEmbeddingProfile(buildEmbeddingProfileId(identity));
  } catch {
    return undefined;
  }
}

export function listEmbeddingProfiles(
  providerAvailability?: Partial<Record<RagProvider, boolean>>,
): readonly EmbeddingProfile[] {
  if (!providerAvailability) {
    return EMBEDDING_PROFILE_REGISTRY;
  }

  return EMBEDDING_PROFILE_REGISTRY.filter(
    (profile) => providerAvailability[profile.provider] === true,
  );
}

function normalizeProvider(provider: RagProvider): RagProvider {
  const normalized = String(provider).trim().toLowerCase();
  if (
    normalized !== "ollama" &&
    normalized !== "openai" &&
    normalized !== "openai-compatible"
  ) {
    throw new Error(EMBEDDING_REGISTRY_ERROR_CODES.INVALID_PROFILE);
  }
  return normalized;
}

function normalizeModel(model: string): string {
  if (typeof model !== "string") {
    throw new Error(EMBEDDING_REGISTRY_ERROR_CODES.INVALID_PROFILE);
  }

  const normalized = model.trim();
  if (!normalized) {
    throw new Error(EMBEDDING_REGISTRY_ERROR_CODES.INVALID_PROFILE);
  }
  return normalized;
}

function validateDimensions(dimensions: number): void {
  if (!Number.isInteger(dimensions) || dimensions !== EMBEDDING_PROFILE_DIMENSIONS) {
    throw new Error(EMBEDDING_REGISTRY_ERROR_CODES.UNSUPPORTED_DIMENSIONS);
  }
}
