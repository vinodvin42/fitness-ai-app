import crypto from "node:crypto";
import { generateSecret as generateOtpSecret, generateURI, verify as verifyOtp } from "otplib";
import QRCode from "qrcode";
import { env } from "../config/env";
import { BRAND_NAME } from "@fitness-ai-app/config";

/**
 * Two-Factor Authentication (25 Aug 2026, Phase 4, closes gap §17) — TOTP
 * (RFC 6238), the same standard Google Authenticator/Authy/1Password
 * implement, verified entirely server-side against a shared secret. This
 * is a deliberate correction of gap §17's older framing ("needs an
 * SMS/TOTP provider decision"): SMS 2FA genuinely needs a third-party
 * gateway account (Twilio or similar — the same real blocker as gap §9's
 * phone+OTP), but TOTP needs no external service or business decision at
 * all. It's pure cryptography — a shared secret plus the current time
 * produces the same 6-digit code on the user's authenticator app and on
 * this server, no message ever has to be sent anywhere. That's what makes
 * it the genuinely unblocked half of gap §17, same category as Reminders
 * being the one genuinely unblocked slice of its own phase.
 *
 * `User.twoFactorSecret` is stored ENCRYPTED, not hashed — unlike a
 * password, the server has to read the real secret back on every login
 * to compute the expected code, so it can't be one-way hashed. Encryption
 * key comes from `TWO_FACTOR_ENCRYPTION_KEY`, a required env var (see
 * config/env.ts) validated to be exactly 32 raw bytes (64 hex chars) —
 * AES-256-GCM's key size — generated the same way as this app's JWT
 * secrets (`openssl rand -hex 32`), just with a fixed length AES
 * actually requires rather than "at least 16 chars."
 */

const ISSUER = BRAND_NAME;
const ALGORITHM = "aes-256-gcm";
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // same no-0/O-1/I alphabet as referralCode.ts
const RECOVERY_CODE_LENGTH = 10;
const RECOVERY_CODE_COUNT = 10;

function encryptionKey(): Buffer {
  return Buffer.from(env.TWO_FACTOR_ENCRYPTION_KEY, "hex");
}

/** A fresh base32 TOTP secret — one per enrollment attempt, not reused across users. */
export function generateTotpSecret(): string {
  return generateOtpSecret();
}

/** `otpauth://totp/...` URI an authenticator app scans via QR (or accepts as manual text). */
export function buildOtpauthUrl(accountEmail: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: accountEmail, secret });
}

/** Renders the otpauth URL as a scannable QR code, returned as a data: URI PNG — no client-side QR library needed. */
export function generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

/** True if `code` is a currently-valid TOTP for `secret` (otplib's default epoch tolerance, enough to absorb minor clock drift). */
export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  try {
    const result = await verifyOtp({ secret, token: code });
    return result.valid;
  } catch {
    // otplib throws on a malformed token (non-numeric, wrong length) rather
    // than returning false — treat that the same as "incorrect code".
    return false;
  }
}

/**
 * Ten single-use backup codes, returned in plaintext ONCE — the caller
 * (users.service.ts's enableTwoFactor) bcrypt-hashes each before storing,
 * same as a password, and shows the plaintext list to the user exactly
 * once in the API response. Losing them means losing the recovery path,
 * same tradeoff every authenticator-app-based 2FA implementation makes.
 */
export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    let code = "";
    for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
      code += RECOVERY_CODE_ALPHABET[crypto.randomInt(RECOVERY_CODE_ALPHABET.length)];
    }
    codes.push(code);
  }
  return codes;
}

/** AES-256-GCM encrypt, storage format `iv:authTag:ciphertext` (all hex) in one string column. */
export function encryptSecret(plainSecret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}
