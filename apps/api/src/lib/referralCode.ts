import crypto from "node:crypto";
import { USER_REFERRAL_CODE_PREFIX, normalizeReferralCode } from "@fitness-ai-app/config";
import { prisma } from "../db/prisma";

// §O "Refer & Invite" — no 0/O or 1/I, so a code read aloud or hand-typed
// isn't ambiguous.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function randomBody(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

/**
 * Generates a `User.referralCode` unique across the whole table. Collision
 * odds at 8 chars over a 32-symbol alphabet are astronomically small
 * (32^8 ≈ 1.1 trillion combinations) — the retry loop exists for
 * correctness, not because collisions are expected in practice.
 *
 * QA defect Q12 ("User and creator referral codes look alike") is fixed
 * here: every user code now carries the `FX-` prefix, so a support agent
 * or an API caller can tell a user code from a creator code by shape
 * alone. Creator codes stay plain and are deliberately NOT given a
 * prefix — the handoff says "creator codes stay plain".
 *
 * Existing codes are not rewritten. `resolveReferralCode` in
 * referrals.service.ts accepts both shapes, so a code printed on old
 * collateral keeps working; only newly-issued codes carry the prefix.
 */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `${USER_REFERRAL_CODE_PREFIX}${randomBody()}`;
    const existing = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique referral code after 5 attempts");
}

/**
 * Looks up a user by referral code, tolerating the `FX-` prefix being
 * present, absent, or lower-cased. A user reading a code aloud from a
 * video or pasting it from a message should not have to reproduce the
 * prefix exactly — U-M12 ("Have a code?" in onboarding) accepts either
 * a user code or a creator code in one field, so the lookup has to be
 * forgiving about shape without being ambiguous about identity.
 */
export async function findUserByReferralCode(rawCode: string) {
  const normalized = normalizeReferralCode(rawCode);
  if (!normalized) return null;

  const candidates = normalized.startsWith(USER_REFERRAL_CODE_PREFIX)
    ? [normalized, normalized.slice(USER_REFERRAL_CODE_PREFIX.length)]
    : [normalized, `${USER_REFERRAL_CODE_PREFIX}${normalized}`];

  for (const code of candidates) {
    const user = await prisma.user.findUnique({ where: { referralCode: code } });
    if (user) return user;
  }
  return null;
}
