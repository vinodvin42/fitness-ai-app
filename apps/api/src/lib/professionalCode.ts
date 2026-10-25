import { createHash } from "node:crypto";

/** Crockford base32: no I, L, O or U, so the ID reads back without mix-ups. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A professional's short public ID, shown on their profile (owner, 25 Oct 2026: "give them id"), for
 * example `FXP-7K3M-9Q2D`. Derived from their account id (40 bits of a SHA-256), so it never changes,
 * needs no column and doesn't reveal how many professionals there are. It's a reference to quote, not
 * a secret, and not used to look anything up.
 */
export function professionalPublicId(id: string): string {
  let n = createHash("sha256").update(`fynrox-professional:${id}`).digest().readUIntBE(0, 5);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code = ALPHABET[n % 32] + code;
    n = Math.floor(n / 32);
  }
  return `FXP-${code.slice(0, 4)}-${code.slice(4)}`;
}
