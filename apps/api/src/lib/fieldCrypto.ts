import crypto from "node:crypto";
import { env } from "../config/env";

/**
 * Application-level encryption for sensitive fields at rest.
 *
 * Spec §10, "Health data (decision #3)": "Stored encrypted, separate
 * consent record, never exposed to gyms, creators or unrelated staff
 * roles." The consent record and the access rules were already real;
 * the encryption was not — `medicalConditions` and `injuries` were
 * plain text columns, readable by anything with a database connection,
 * in every backup, and in any query a support engineer happened to run.
 *
 * Generalised from `lib/twoFactor.ts`, which has used exactly this
 * scheme for TOTP secrets since August. Same algorithm, same key
 * material, same stored format — deliberately not a second scheme, so
 * there is one thing to review and one key to rotate.
 *
 * What this protects against: a leaked database dump, a stolen backup, a
 * misdirected query result. What it does NOT protect against: a
 * compromised API process, which holds the key by necessity. That limit
 * is inherent to application-level field encryption and is worth stating
 * rather than implying otherwise.
 */
const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  // Reuses TWO_FACTOR_ENCRYPTION_KEY rather than introducing a second
  // required secret. A deployment already cannot boot without it, so
  // health-data encryption inherits that guarantee instead of adding a
  // new way to be silently unconfigured.
  return Buffer.from(env.TWO_FACTOR_ENCRYPTION_KEY, "hex");
}

/** `iv:authTag:ciphertext`, all hex — the format twoFactor.ts established. */
export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptField(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Encrypts a list of strings as ONE blob rather than element by element.
 *
 * Per-element encryption would leak the length of the list — "this user
 * declared four conditions" is itself health information — and, because
 * GCM with a fresh IV is not deterministic but the count is, would let
 * anyone with table access rank users by how much they reported.
 * A single blob leaks only "some" versus "none", and the `null`/`[]`
 * distinction below keeps even that honest.
 */
export function encryptStringList(values: readonly string[]): string | null {
  if (values.length === 0) return null;
  return encryptField(JSON.stringify(values));
}

/**
 * Returns `[]` for a missing value, so a caller never has to distinguish
 * "not set" from "declared nothing" at every site — both mean the user
 * reported nothing.
 *
 * A value that fails to decrypt throws rather than returning `[]`. That
 * is deliberate: silently treating undecryptable health data as "no
 * conditions" would hand a plan generator a clean bill of health for
 * someone who declared a heart condition. Failing loudly is the safe
 * direction for this particular field.
 */
export function decryptStringList(stored: string | null | undefined): string[] {
  if (stored == null || stored === "") return [];
  const parsed: unknown = JSON.parse(decryptField(stored));
  if (!Array.isArray(parsed)) {
    throw new Error("Decrypted health field was not a list");
  }
  return parsed.map(String);
}

/**
 * Reads a health field that may be encrypted, plaintext, or both during
 * the backfill window.
 *
 * Encrypted wins when present. The plaintext fallback exists only so a
 * deployment can run the new code before the backfill has finished; once
 * `scripts/backfillHealthEncryption.ts` has run everywhere, the
 * plaintext columns are always empty and can be dropped.
 */
export function readHealthList(row: { encrypted: string | null; plaintext: readonly string[] }): string[] {
  if (row.encrypted) return decryptStringList(row.encrypted);
  return [...row.plaintext];
}
