import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { createGym, updateGymStatus } from "../src/modules/gyms/gyms.service";

/**
 * Real concurrency test for gyms.service.ts's updateGymStatus() —
 * confirms the `updateMany`-with-a-status-filter claim (same discipline as
 * adminInfluencers.service.ts's markPayoutPaid() / payments.service.ts's
 * activatePayment()) genuinely lets exactly one of two concurrent status-
 * transition attempts win the same Gym row, rather than both silently
 * succeeding (which would let a Gym's approved/suspended history and its
 * audit trail disagree about what actually happened).
 */
describe("Gym status transition race: concurrent approve calls must not both win", () => {
  let adminId: string;
  let gymId: string;

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-gym-status-race-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Gym Status Race Fixture Admin",
        role: "super_admin",
        status: "active",
      },
    });
    adminId = admin.id;

    const gym = await createGym(adminId, {
      name: `Status Race Gym ${suffix}`,
      contactName: "Contact Person",
      contactEmail: `status-race-${suffix}@example.com`,
      commissionPct: 15,
      pricingModel: "per_member_flat_fee",
      ratePerMemberCents: 0,
    });
    gymId = gym.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorAdminId: adminId } });
    await prisma.gym.deleteMany({ where: { id: gymId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("lets exactly one of two concurrent application->approved calls succeed", async () => {
    const results = await Promise.allSettled([
      updateGymStatus(adminId, gymId, { status: "approved" }),
      updateGymStatus(adminId, gymId, { status: "approved" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const gym = await prisma.gym.findUnique({ where: { id: gymId } });
    expect(gym?.status).toBe("approved");

    // Exactly one gym.status_approved audit row, not two — proves the
    // loser genuinely never wrote anything, rather than both callers
    // racing past the guard and each logging their own audit entry.
    const statusAudits = await prisma.auditLog.findMany({
      where: { actorAdminId: adminId, entityId: gymId, action: "gym.status_approved" },
    });
    expect(statusAudits).toHaveLength(1);
  });
});
