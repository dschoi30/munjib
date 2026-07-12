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
 * Build the small Auth.js user DTO without copying adapter/provider media.
 * The input intentionally contains only identity fields, so a provider
 * profile or historical database object cannot be spread into the response.
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
/**
 * Reserved downstream hook for the protected auth config.  It strips token
 * media and returns a null ambient image candidate; it never consumes or
 * copies provider profile/database media.
 */
export function leaf4SessionMediaHook(input: {
  token?: Record<string, unknown>;
  ambientImage?: unknown;
}) {
  return {
    token: input.token ? stripAmbientTokenMedia(input.token) : undefined,
    ambientImage: zeroAmbientSessionImage(input.ambientImage),
  };
}
