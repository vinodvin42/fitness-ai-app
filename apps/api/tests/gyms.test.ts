import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import {
  addGymLocation,
  createGym,
  getGymDetail,
  getMemberActivationSummary,
  listGyms,
  updateGymCommercial,
  updateGymStatus,
} from "../src/modules/gyms/gyms.service";
import { ApiHttpError } from "../src/middleware/errorHandler";

/**
 * Gym Partner Lite — R1 Wave 1 (added 20 Sep 2026) service-layer coverage.
 * Calls gyms.service.ts's exported functions directly (same convention as
 * adminInfluencersPayoutRace.test.ts) rather than over HTTP — this wave
 * ships no admin-web UI, so the service layer itself is the real contract
 * to verify. A genuine Promise.all concurrency test for the status-
 * transition claim lives in gymsStatusRace.test.ts, alongside this file.
 */
describe("Gym Partner Lite — create/list/detail/status/commercial", () => {
  let adminId: string;
  const createdGymIds: string[] = [];

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-gyms-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Gyms Fixture Admin",
        role: "super_admin",
        status: "active",
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.user.updateMany({ where: { gymId: { in: createdGymIds } }, data: { gymId: null } });
    await prisma.auditLog.deleteMany({ where: { actorAdminId: adminId } });
    await prisma.gymLocation.deleteMany({ where: { gymId: { in: createdGymIds } } });
    await prisma.gym.deleteMany({ where: { id: { in: createdGymIds } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("creates a Gym with a real unique invite code, locations, and an audit row", async () => {
    const suffix = uniqueSuffix();
    const gym = await createGym(adminId, {
      name: `Iron Temple Gym ${suffix}`,
      contactName: "Priya Sharma",
      contactEmail: `partner-${suffix}@irontemple.example`,
      contactPhone: "+91-9876543210",
      commissionPct: 15,
      pricingModel: "per_member_flat_fee",
      ratePerMemberCents: 0,
      locations: [
        { name: "Andheri West", address: "123 SV Road, Mumbai", equipment: "Free weights, 12 squat racks, cardio floor" },
      ],
    });
    createdGymIds.push(gym.id);

    expect(gym.status).toBe("application");
    expect(gym.commissionPct).toBe(15);
    expect(gym.pricingModel).toBe("per_member_flat_fee");
    expect(gym.ratePerMemberCents).toBe(0);
    expect(gym.ratePerMemberConfigured).toBe(false);
    expect(gym.inviteCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(gym.locations).toHaveLength(1);
    expect(gym.locations[0].name).toBe("Andheri West");

    // Real row in Postgres, not just the returned shape.
    const row = await prisma.gym.findUnique({ where: { id: gym.id } });
    expect(row).not.toBeNull();
    expect(row?.inviteCode).toBe(gym.inviteCode);

    const audit = await prisma.auditLog.findFirst({
      where: { actorAdminId: adminId, action: "gym.created", entityId: gym.id },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects two gyms colliding on the exact same invite code (DB unique constraint holds)", async () => {
    const suffix = uniqueSuffix();
    const gymA = await createGym(adminId, {
      name: `Collision Gym A ${suffix}`,
      contactName: "Test Contact",
      contactEmail: `collision-a-${suffix}@example.com`,
      commissionPct: 15,
      pricingModel: "per_member_flat_fee",
      ratePerMemberCents: 0,
    });
    createdGymIds.push(gymA.id);

    // Directly attempt to create a second Gym with the same invite code,
    // bypassing generateUniqueGymInviteCode() to prove the DB-level unique
    // constraint (not just the application-level retry loop) is real.
    await expect(
      prisma.gym.create({
        data: {
          name: `Collision Gym B ${suffix}`,
          contactName: "Test Contact",
          contactEmail: `collision-b-${suffix}@example.com`,
          inviteCode: gymA.inviteCode,
        },
      }),
    ).rejects.toThrow();
  });

  it("lists gyms filtered by status and search", async () => {
    const suffix = uniqueSuffix();
    const gym = await createGym(adminId, {
      name: `Searchable Gym ${suffix}`,
      contactName: "Contact Person",
      contactEmail: `searchable-${suffix}@example.com`,
      commissionPct: 15,
      pricingModel: "per_member_flat_fee",
      ratePerMemberCents: 0,
    });
    createdGymIds.push(gym.id);

    const byStatus = await listGyms({ status: "application" });
    expect(byStatus.gyms.some((g) => g.id === gym.id)).toBe(true);

    const bySearch = await listGyms({ search: `Searchable Gym ${suffix}` });
    expect(bySearch.gyms).toHaveLength(1);
    expect(bySearch.gyms[0].id).toBe(gym.id);
    expect(bySearch.gyms[0].locationCount).toBe(0);
    expect(bySearch.gyms[0].memberCount).toBe(0);
  });

  it("adds a location to an existing gym with a real audit row", async () => {
    const suffix = uniqueSuffix();
    const gym = await createGym(adminId, {
      name: `Multi-Location Gym ${suffix}`,
      contactName: "Contact Person",
      contactEmail: `multiloc-${suffix}@example.com`,
      commissionPct: 15,
      pricingModel: "per_member_flat_fee",
      ratePerMemberCents: 0,
    });
    createdGymIds.push(gym.id);

    const location = await addGymLocation(adminId, gym.id, {
      name: "Second Branch",
      address: "456 Ring Road, Bengaluru",
      equipment: "Squat racks, dumbbells up to 50kg",
    });
    expect(location.gymId).toBe(gym.id);

    const detail = await getGymDetail(gym.id);
    expect(detail.locations).toHaveLength(1);

    const audit = await prisma.auditLog.findFirst({
      where: { actorAdminId: adminId, action: "gym.location_added", entityId: location.id },
    });
    expect(audit).not.toBeNull();
  });

  it("transitions application -> approved -> suspended -> approved, refuses an invalid transition", async () => {
    const suffix = uniqueSuffix();
    const gym = await createGym(adminId, {
      name: `Lifecycle Gym ${suffix}`,
      contactName: "Contact Person",
      contactEmail: `lifecycle-${suffix}@example.com`,
      commissionPct: 15,
      pricingModel: "per_member_flat_fee",
      ratePerMemberCents: 0,
    });
    createdGymIds.push(gym.id);

    const approved = await updateGymStatus(adminId, gym.id, { status: "approved" });
    expect(approved.status).toBe("approved");

    await expect(updateGymStatus(adminId, gym.id, { status: "suspended", note: "Non-payment" })).resolves.toMatchObject({
      status: "suspended",
    });

    const reactivated = await updateGymStatus(adminId, gym.id, { status: "approved" });
    expect(reactivated.status).toBe("approved");

    // approved -> approved is not an allowed transition (not in its own allowedFrom list).
    await expect(updateGymStatus(adminId, gym.id, { status: "approved" })).rejects.toThrow(ApiHttpError);

    const statusAudits = await prisma.auditLog.findMany({
      where: { actorAdminId: adminId, entityId: gym.id, action: { startsWith: "gym.status_" } },
    });
    expect(statusAudits.length).toBeGreaterThanOrEqual(3);
  });

  it("updates commercial fields (commission/pricing placeholder) with a real audit row", async () => {
    const suffix = uniqueSuffix();
    const gym = await createGym(adminId, {
      name: `Commercial Gym ${suffix}`,
      contactName: "Contact Person",
      contactEmail: `commercial-${suffix}@example.com`,
      commissionPct: 15,
      pricingModel: "per_member_flat_fee",
      ratePerMemberCents: 0,
    });
    createdGymIds.push(gym.id);

    const updated = await updateGymCommercial(adminId, gym.id, {
      commissionPct: 20,
      ratePerMemberCents: 5000,
    });
    expect(updated.commissionPct).toBe(20);
    expect(updated.ratePerMemberCents).toBe(5000);
    expect(updated.ratePerMemberConfigured).toBe(true);
    expect(updated.pricingModel).toBe("per_member_flat_fee");

    const audit = await prisma.auditLog.findFirst({
      where: { actorAdminId: adminId, action: "gym.commercial_updated", entityId: gym.id },
    });
    expect(audit).not.toBeNull();
  });

  it("computes a real, honest member activation summary from User/OnboardingProfile/WorkoutSession", async () => {
    const suffix = uniqueSuffix();
    const gym = await createGym(adminId, {
      name: `Activation Gym ${suffix}`,
      contactName: "Contact Person",
      contactEmail: `activation-${suffix}@example.com`,
      commissionPct: 15,
      pricingModel: "per_member_flat_fee",
      ratePerMemberCents: 0,
    });
    createdGymIds.push(gym.id);

    const zeroSummary = await getMemberActivationSummary(gym.id);
    expect(zeroSummary).toEqual({
      gymId: gym.id,
      memberCount: 0,
      onboardingCompletedCount: 0,
      firstWorkoutCompletedCount: 0,
    });

    // Simulate the future acquisition-context-resolution wiring by setting
    // User.gymId directly (that wiring itself is explicitly out of scope
    // this wave) — proves the aggregate is real, not hardcoded to zero.
    const memberA = await prisma.user.create({
      data: {
        email: uniqueEmail("gym-member-a"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Gym Member A",
        referralCode: await generateUniqueReferralCode(),
        gymId: gym.id,
      },
    });
    const memberB = await prisma.user.create({
      data: {
        email: uniqueEmail("gym-member-b"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Gym Member B",
        referralCode: await generateUniqueReferralCode(),
        gymId: gym.id,
      },
    });

    await prisma.onboardingProfile.create({
      data: { userId: memberA.id, completedAt: new Date() },
    });

    const summary = await getMemberActivationSummary(gym.id);
    expect(summary.memberCount).toBe(2);
    expect(summary.onboardingCompletedCount).toBe(1);
    expect(summary.firstWorkoutCompletedCount).toBe(0);

    await prisma.onboardingProfile.deleteMany({ where: { userId: memberA.id } });
    await prisma.user.deleteMany({ where: { id: { in: [memberA.id, memberB.id] } } });
  });

  it("404s on an unknown gym id for detail/status/commercial/summary", async () => {
    await expect(getGymDetail("does-not-exist")).rejects.toMatchObject({ status: 404 });
    await expect(updateGymStatus(adminId, "does-not-exist", { status: "approved" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(updateGymCommercial(adminId, "does-not-exist", { commissionPct: 10 })).rejects.toMatchObject({
      status: 404,
    });
    await expect(getMemberActivationSummary("does-not-exist")).rejects.toMatchObject({ status: 404 });
  });
});
