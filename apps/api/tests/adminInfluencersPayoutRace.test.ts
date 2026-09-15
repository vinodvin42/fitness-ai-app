import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { markPayoutPaid } from "../src/modules/adminInfluencers/adminInfluencers.service";

/**
 * Regression test for a real concurrency bug in adminInfluencers.service.ts's
 * markPayoutPaid(): the same read-then-write race already found and fixed in
 * payments.service.ts's activatePayment() and nutrition.service.ts's
 * confirmFoodEstimate() (see this repo's commit history). The old guard
 * (`if (p.status === "paid") throw` followed by an unconditional
 * `prisma.influencerPayout.update(...)` and `prisma.expense.create(...)`)
 * read each caller's own already-fetched, possibly-stale snapshot — so two
 * concurrent calls (an admin double-clicking "Mark Paid", or two admin tabs
 * open on the same row) could both pass the guard and both create a real
 * Expense row for the same payout, double-counting it in every Finance
 * aggregate that sums Expense (Dashboard KPIs, Payables, the revenue
 * waterfall). InfluencerPayout carries no unique constraint of its own to
 * fall back on (unlike CoachSettlement's (professionalId, periodStart)).
 *
 * Fixed by making the paid-status transition itself atomic (`updateMany`
 * with a `status: { not: "paid" }` filter, proceeding only when the call's
 * own update actually affected a row). This test drives two concurrent
 * markPayoutPaid() calls against one InfluencerPayout row and asserts
 * exactly one Expense row results, and exactly one call succeeds.
 */
describe("Influencer payout mark-paid race: concurrent calls must not double-record", () => {
  let adminId: string;
  let influencerId: string;
  let payoutId: string;

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-payout-race-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Payout Race Fixture Admin",
        role: "finance",
        status: "active",
      },
    });
    adminId = admin.id;

    const influencer = await prisma.influencer.create({
      data: { name: `Payout Race Fixture Influencer ${suffix}`, commissionPct: 10 },
    });
    influencerId = influencer.id;

    const payout = await prisma.influencerPayout.create({
      data: { influencerId, amountCents: 500000, periodLabel: `Race Test ${suffix}` },
    });
    payoutId = payout.id;
  });

  afterAll(async () => {
    await prisma.expense.deleteMany({ where: { recordedByAdminId: adminId } });
    await prisma.influencerPayout.deleteMany({ where: { influencerId } });
    await prisma.influencer.deleteMany({ where: { id: influencerId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("records exactly one Expense when two markPayoutPaid calls race for the same payout", async () => {
    const results = await Promise.allSettled([
      markPayoutPaid(adminId, payoutId),
      markPayoutPaid(adminId, payoutId),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    // Exactly one caller should win the atomic claim; the other must see a
    // real 409, not silently succeed and not double-charge the ledger.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const payout = await prisma.influencerPayout.findUnique({ where: { id: payoutId } });
    expect(payout?.status).toBe("paid");

    const expenses = await prisma.expense.findMany({
      where: { category: "influencer_payout", recordedByAdminId: adminId },
    });
    expect(expenses).toHaveLength(1);
    expect(expenses[0].amountCents).toBe(500000);
  });
});
