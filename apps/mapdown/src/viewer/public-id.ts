/**
 * The shape of a published map's public id, in one place.
 *
 * It is produced by `randomToken(16)` in `functions/_shared/crypto.ts`, which is
 * **base64url** — `[A-Za-z0-9_-]`, 22 characters for 16 bytes — not hexadecimal. Two client-side
 * checks originally assumed hex, and because both fail *silently* (the viewer simply never
 * mounts, the import route simply reports a bad link), the published page fell back to its
 * static image and Copy refused every real link. Neither surface errored; they just quietly did
 * the safe thing. That is why the generator and this pattern are now asserted to agree in
 * `functions/_shared/cloud-contract.test.ts`, rather than each being reasoned about alone.
 *
 * The pattern is still narrow enough for its real purpose: it is the alphabet of base64url and
 * nothing else, so a value that passes cannot carry `/`, `.`, `%` or whitespace into a URL or an
 * API path. Authorization is not its job — the server treats an unknown id and a revoked one
 * identically (D-30).
 */
export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isPublicId(value: string): boolean {
  return PUBLIC_ID_PATTERN.test(value);
}

/** The published-map id in `/p/{id}` (with or without a trailing slash), or `null`. */
export function publicIdFromPathname(pathname: string): string | null {
  const match = /^\/p\/([^/]+)\/?$/.exec(pathname);
  const id = match?.[1];
  return id && isPublicId(id) ? id : null;
}
