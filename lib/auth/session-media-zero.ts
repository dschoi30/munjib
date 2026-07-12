/**
 * Ambient profile/provider media is never a renderable session value.
 *
 * Keep this helper total and deliberately boring: callers can pass any value,
 * including malformed adapter data, and the result is always the same null
 * sentinel.  This makes it impossible for a future callback to accidentally
 * re-introduce an avatar URL by branching on its shape.
 */
export function zeroAmbientSessionImage(_candidate: unknown): null {
  return null;
}
/**
 * Remove media fields from a copied JWT token without mutating the token that
 * Auth.js handed us.  `picture` is the OAuth/Auth.js spelling and `image` is
 * the adapter spelling; both are ambient media and must not cross the token
 * boundary.
 */
export function stripAmbientTokenMedia<T extends Record<string, unknown>>(token: T): T {
  const copy = { ...token } as T & { picture?: unknown; image?: unknown };
  delete copy.picture;
  delete copy.image;
  return copy;
}
