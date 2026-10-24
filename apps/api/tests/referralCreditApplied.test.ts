import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { subscribe } from "../src/modules/subscriptions/subscriptions.service";
import { applyReferralCredit } from "../src/modules/referrals/referrals.service";

/**
 * Referral credit is spent (24 Oct 2026): the app promises "1 month of
 * credit" when a friend starts a paid plan. Each credit month moves the
 * referrer's paid plan end date one month later; on Basic it waits until a
 * paid plan starts.
 *
 * Rate limits: 3 consumer signups.
 */
describe("Referral credit applied to the paid plan", () => {
  const app = buildApp();
  const users: string[] = [];
  let planId: string;
  const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  const plusMonths = (d: Date, n: number) => {
    const x = new Date(d.getTime());
    x.setMonth(x.getMonth() + n);
    return x;
  };
  const signup = async (tag: string, referralCode?: string) => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail(tag), password: "SomePassword1!", fullName: `Ref ${tag}`, ...(referralCode ? { referralCode } : {}) });
    users.push(res.body.user.id);
    return res.body.user as { id: string; referralCode: string };
  };

  beforeAll(async () => {
    planId = (await prisma.subscriptionPlan.create({ data: { name: `Prime ${uniqueSuffix()}`, tier: "prime", billingCycle: "monthly", priceCents: 29900 } })).id;
  });
  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it("R1 a referrer on a paid plan gets their end date moved a month when the friend pays", async () => {
    const referrer = await signup("ref-paid");
    const renewsAt = days(10);
    const sub = await prisma.subscription.create({ data: { userId: referrer.id, planId, status: "active", renewsAt, priceCents: 29900 } });
    const code = (await prisma.user.findUniqueOrThrow({ where: { id: referrer.id } })).referralCode as string;
    const friend = await signup("ref-friend", code);

    await subscribe(friend.id, { planId }, { verifiedPayment: true, paidPriceCents: 29900 });

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.renewsAt?.getTime()).toBe(plusMonths(renewsAt, 1).getTime());
    expect((await prisma.user.findUniqueOrThrow({ where: { id: referrer.id } })).referralCreditMonths).toBe(0);
    const audit = await prisma.auditLog.findFirst({ where: { entityId: sub.id, action: "referral_credit.applied" } });
    expect(audit).not.toBeNull();
  });

  it("R2 on Basic the credit waits, then is spent when a paid plan starts", async () => {
    const member = await signup("ref-basic");
    await prisma.user.update({ where: { id: member.id }, data: { referralCreditMonths: 1 } });
    expect(await applyReferralCredit(member.id)).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).referralCreditMonths).toBe(1);

    const before = Date.now();
    const sub = await subscribe(member.id, { planId }, { verifiedPayment: true, paidPriceCents: 29900 });
    // A month for the payment plus a month of credit.
    const twoMonths = plusMonths(new Date(before), 2).getTime();
    expect(Math.abs((sub.renewsAt as Date).getTime() - twoMonths)).toBeLessThan(60_000);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).referralCreditMonths).toBe(0);
  });

  it("R3 a lapsed paid plan is not extended; nothing is spent twice", async () => {
    const member = users[2];
    await prisma.subscription.updateMany({ where: { userId: member }, data: { renewsAt: days(-1) } });
    await prisma.user.update({ where: { id: member }, data: { referralCreditMonths: 2 } });
    expect(await applyReferralCredit(member)).toBe(0);
    await prisma.subscription.updateMany({ where: { userId: member }, data: { renewsAt: days(5) } });
    const [a, b] = await Promise.all([applyReferralCredit(member), applyReferralCredit(member)]);
    expect(a + b).toBe(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member } })).referralCreditMonths).toBe(0);
  });
});
