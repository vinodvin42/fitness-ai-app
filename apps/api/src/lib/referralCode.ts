import crypto from "node:crypto";
import { prisma } from "../db/prisma";

// §O "Refer & Invite" — no 0/O or 1/I, so a code read aloud or hand-typed
// isn't ambiguous.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function randomCode(): string {
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
 */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const existing = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique referral code after 5 attempts");
}
