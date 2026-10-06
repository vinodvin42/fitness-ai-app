import { createHash, randomBytes } from "crypto";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { trackEvent } from "../../lib/analytics";
import { isEmailConfigured, sendEmail } from "../../lib/mailer";

/**
 * Minimal guardian approval for under-18 users (Figma onboarding 11). The
 * API emails the guardian a single-use, expiring link to an API-served HTML
 * page. Only a SHA-256 hash of the token is stored; a resend replaces the
 * hash (invalidating the old link); deciding keeps the hash but flips the
 * status so a re-used link reports "already used".
 */

export const GUARDIAN_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashGuardianToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function issueGuardianToken(now: Date = new Date()) {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashGuardianToken(token), expiresAt: new Date(now.getTime() + GUARDIAN_TOKEN_TTL_MS) };
}

export function guardianApprovalLink(token: string): string {
  const base = (env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, "");
  return `${base}/guardian-review/approve?token=${token}`;
}

export async function sendGuardianReviewEmail(args: { to: string; childName: string; token: string; expiresAt: Date }) {
  const link = guardianApprovalLink(args.token);
  if (!isEmailConfigured()) {
    // Dev fallback: SMTP isn't configured, so surface the link in the server log.
    if (env.NODE_ENV !== "production") console.info(`[guardian-review] approval link for ${args.to}: ${link}`);
    return;
  }
  try {
    await sendEmail({
      to: args.to,
      subject: "Guardian authorization requested for a 23PrimeFit account",
      text: `Hello,

${args.childName} is setting up a 23PrimeFit fitness account and told us they are under 18. Before any health questions, fitness profiling or personalized plans run, we need a parent or guardian to review and authorize this.

Review and decide here (single use, valid until ${args.expiresAt.toUTCString()}):
${link}

If you were not expecting this, you can ignore this email and nothing will be enabled.`,
    });
  } catch {
    // Best-effort — never fail the submission over SMTP; the user can resend.
  }
}

export type GuardianLookup =
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "already_decided"; status: "approved" | "declined" }
  | { kind: "ok"; userId: string; childName: string };

export async function lookupGuardianToken(token: string, now: Date = new Date()): Promise<GuardianLookup> {
  if (!/^[a-f0-9]{64}$/.test(token)) return { kind: "invalid" };
  const review = await prisma.guardianReview.findUnique({
    where: { tokenHash: hashGuardianToken(token) },
    include: { user: { select: { fullName: true } } },
  });
  if (!review) return { kind: "invalid" };
  if (review.status !== "pending") return { kind: "already_decided", status: review.status };
  if (!review.tokenExpiresAt || review.tokenExpiresAt.getTime() <= now.getTime()) return { kind: "expired" };
  return { kind: "ok", userId: review.userId, childName: review.user.fullName };
}

/** Applies the guardian's decision. The conditional update makes the token single-use even under concurrent submits. */
export async function decideGuardianReview(token: string, decision: "approved" | "declined", now: Date = new Date()): Promise<GuardianLookup> {
  const found = await lookupGuardianToken(token, now);
  if (found.kind !== "ok") return found;
  const result = await prisma.guardianReview.updateMany({
    where: { userId: found.userId, tokenHash: hashGuardianToken(token), status: "pending" },
    data: { status: decision, decidedAt: now },
  });
  if (result.count === 0) return { kind: "already_decided", status: decision };
  await recordAudit({
    actorId: null,
    action: decision === "approved" ? "guardian_review.approved" : "guardian_review.declined",
    entityType: "GuardianReview",
    entityId: found.userId,
  });
  await trackEvent(found.userId, "guardian_review.decided", {}, { metadata: { decision } });
  return found;
}
