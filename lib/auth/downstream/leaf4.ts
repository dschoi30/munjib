import {
  stripAmbientTokenMedia,
  zeroAmbientSessionImage,
} from "@/lib/auth/session-media-zero";

export const leaf4SessionMediaSlotVersion = 0;

export type Leaf4AuthUserOutput = {
  id: string;
  email: string;
  name: string;
  image: null;
};

/**
 * Construct an identity-only Auth.js user DTO. Provider and adapter media are
 * deliberately not accepted as input, so they cannot cross this boundary.
 */
export function leaf4AuthUserOutput(input: {
  id: string;
  email: string;
  name: string;
}): Leaf4AuthUserOutput {
  return {
    id: input.id,
    email: input.email,
    name: input.name,
    image: zeroAmbientSessionImage(undefined),
  };
}

/** Remove ambient media from copied Auth.js token/session values. */
export function leaf4SessionMediaHook(input: {
  token?: Record<string, unknown>;
  ambientImage?: unknown;
}) {
  return {
    token: input.token ? stripAmbientTokenMedia(input.token) : undefined,
    ambientImage: zeroAmbientSessionImage(input.ambientImage),
  };
}

export const leaf4AuthHooks = Object.freeze({
  reduceSessionImage() {
    return null;
  },
});
