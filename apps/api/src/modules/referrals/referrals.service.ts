import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { findUserByReferralCode } from "../../lib/referralCode";

/**
 * §O "Refer & Invite" (docs/mobile/03-screen-inventory.md) — real
 * signup-attribution tracking.
 *
 * **31 Aug 2026: the reward half is now built.** The open product decision
 * ("what a referral reward actually is") was made: **one month of
 * subscription credit to the referrer** when their referee first subscribes
 * to a PAID plan. See `grantReferralRewardIfEligible` below and the
 * `ReferralReward` model's own doc comment. The credit accrues on
 * `User.referralCreditMonths` (a real integer balance) and each grant is a
 * `ReferralReward` row, so the mobile screen shows a real earned-rewards
 * history, not just a running number.
 */

/**
 * Called from auth.service.ts's signup(), after the new user row exists.
 * A code that doesn't match any user is silently ignored — a bad or
 * mistyped referral code shouldn't block signup, and this endpoint isn't
 * reachable pre-auth anyway, so there's no separate "invalid code" error
 * surface to design for.
 */
export async function redeemReferralCode(newUserId: string, rawCode: string) {
  // Q12: user codes now carry an `FX-` prefix, but codes issued before
  // that change do not, and a user typing one in rarely reproduces it
  // exactly. `findUserByReferralCode` accepts either shape, so an old
  // code on printed collateral and a new prefixed one both resolve.
  const referrer = await findUserByReferralCode(rawCode);
  if (!referrer) return;

  const referral = await prisma.referral.create({ data: { referrerId: referrer.id, refereeId: newUserId } });

  await recordAudit({
    actorId: newUserId,
    action: "referral.redeemed",
    entityType: "Referral",
    entityId: referral.id,
    metadata: { referrerId: referrer.id },
  });
}

export async function getMyReferralSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true, referralCreditMonths: true },
  });
  if (!user) {
    throw new ApiHttpError(404, "user_not_found", "User not found");
  }

  const [referredSignups, rewardsEarned] = await Promise.all([
    prisma.referral.count({ where: { referrerId: userId } }),
    prisma.referralReward.count({ where: { referrerId: userId, status: "granted" } }),
  ]);

  return {
    code: user.referralCode,
    referredSignups,
    // §O reward (31 Aug 2026): real earned-credit balance + count of grants.
    creditMonths: user.referralCreditMonths,
    rewardsEarned,
  };
}

/**
 * Grant the referrer one month of subscription credit when their referee
 * first subscribes to a paid plan. Called from subscriptions.service.ts's
 * subscribe() at paid-plan activation. Idempotent: the unique on
 * ReferralReward.referralId means a given referral can only ever grant once,
 * so re-subscribing never double-credits.
 */
export async function grantReferralRewardIfEligible(refereeUserId: string) {
  const referral = await prisma.referral.findUnique({
    where: { refereeId: refereeUserId },
    include: { reward: { select: { id: true } } },
  });
  const rel = referral as { id: string; referrerId: string; reward: { id: string } | null } | null;
  if (!rel || rel.reward) return; // not referred, or already rewarded

  const now = new Date();
  const reward = await prisma.referralReward.create({
    data: {
      referralId: rel.id,
      referrerId: rel.referrerId,
      creditMonths: 1,
      status: "granted",
      grantedAt: now,
    },
  });
  await prisma.user.update({
    where: { id: rel.referrerId },
    data: { referralCreditMonths: { increment: 1 } },
  });

  await recordAudit({
    actorId: refereeUserId,
    action: "referral_reward.granted",
    entityType: "ReferralReward",
    entityId: reward.id,
    metadata: { referrerId: rel.referrerId, creditMonths: 1 },
  });
}
