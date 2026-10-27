import crypto from "node:crypto";
import { env } from "../../config/env";

/**
 * Encryption at rest for coach payout details (27 Oct 2026): the bank
 * account number, IFSC and UPI ID.
 *
 * Same scheme as lib/twoFactor.ts and lib/fieldCrypto.ts — AES-256-GCM, a
 * fresh 12-byte IV per value, stored as `iv:authTag:ciphertext` in hex — but
 * under its own key, PAYOUT_DETAILS_ENCRYPTION_KEY, so the key that decides
 * where money goes can be rotated or withheld without touching 2FA or health
 * data. The key is optional (config/env.ts): without it nothing can be
 * encrypted or decrypted, so the API refuses writes and serves masked data
 * only. It is read at call time, not captured at import.
 *
 * Each value is bound to its row and field with GCM additional data
 * (`payout:<professionalId>:<field>`), so a ciphertext copied from one
 * coach's row into another's (or from the IFSC column into the account
 * number column) fails to decrypt instead of quietly redirecting a payout.
 *
 * Same limit as fieldCrypto.ts: this protects a leaked dump or backup, not a
 * compromised API process, which holds the key by necessity.
 */
const ALGORITHM = "aes-256-gcm";

export type PayoutField = "accountNumber" | "ifsc" | "upiId";

function encryptionKey(): Buffer | null {
  const hex = env.PAYOUT_DETAILS_ENCRYPTION_KEY;
  return hex ? Buffer.from(hex, "hex") : null;
}

export function isPayoutCryptoConfigured(): boolean {
  return encryptionKey() !== null;
}

function requireKey(): Buffer {
  const key = encryptionKey();
  if (!key) throw new Error("PAYOUT_DETAILS_ENCRYPTION_KEY is not configured");
  return key;
}

function aad(professionalId: string, field: PayoutField): Buffer {
  return Buffer.from(`payout:${professionalId}:${field}`, "utf8");
}

export function encryptPayoutField(professionalId: string, field: PayoutField, plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, requireKey(), iv);
  cipher.setAAD(aad(professionalId, field));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/** Throws when the key is missing, wrong, or the value was tampered with or moved. */
export function decryptPayoutField(professionalId: string, field: PayoutField, stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  const decipher = crypto.createDecipheriv(ALGORITHM, requireKey(), Buffer.from(ivHex, "hex"));
  decipher.setAAD(aad(professionalId, field));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]).toString("utf8");
}

/** "XXXXXX1234" — a fixed number of X's, so the mask doesn't give away the account number's length. */
export function maskAccountNumber(accountNumber: string): string {
  return `XXXXXX${accountNumber.slice(-4)}`;
}

/** "ra***@okhdfc": the first two characters of the handle (one if it's short), then the bank's handle. */
export function maskUpiId(upiId: string): string {
  const at = upiId.lastIndexOf("@");
  const name = upiId.slice(0, at);
  const bank = upiId.slice(at + 1);
  const keep = name.length > 3 ? 2 : 1;
  return `${name.slice(0, keep)}***@${bank}`;
}
