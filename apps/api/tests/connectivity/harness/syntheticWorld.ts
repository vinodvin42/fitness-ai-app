/**
 * Connectivity harness — synthetic accounts (16 Oct 2026).
 *
 * Test seeding only. This file never imports src/lib/seedDatabase.ts and
 * never touches the real plans (basic/pro/elite), the scheduled price
 * change, the migration's coach levels/fees, or the default commission.
 * Every business value here is a TEST-ONLY fixture value, labelled in its
 * name, and none is a proposal for a real price, fee or commission.
 *
 * No real people, health information or photos: names are "TEST-ONLY ...",
 * emails use the reserved .invalid top-level domain (never deliverable).
 *
 * The accounts (and why each exists):
 *   userA, userB      — two users for ownership/isolation checks (A, C, D, F)
 *   coachA            — coach with an explicitly assigned TEST-ONLY level (C)
 *   coachB            — second coach: must NOT see or act on coachA's work (C)
 *   adminOperations   — minimum role for applications + guidance queue (B, C)
 *   adminSupport      — admin WITHOUT growth access, for the refusal check (B)
 *   adminFinance      — minimum role that can raise a refund (F; maker)
 *   adminSuper        — the only role that approves a finance request (F; checker)
 *   gymA, gymB        — a gym and a separate gym for isolation checks (D)
 *   creator           — influencer + campaign with a synthetic link code (E)
 *   plan              — TEST-ONLY paid plan, ₹1/month, for payment journeys (E, F)
 * A third user for E is created during that journey by signing up with the
 * creator's code, because attribution only happens at signup.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { RESULTS_DIR } from "./evidence";

export const WORLD_FILE = path.join(RESULTS_DIR, "world.json");
export const EMAIL_DOMAIN = "fynrox-connectivity.invalid";

export interface WorldAccount {
  id: string;
  email: string;
}

export interface SyntheticWorld {
  runId: string;
  createdAt: string;
  label: "TEST-ONLY synthetic data";
  userA: WorldAccount;
  userB: WorldAccount;
  coachLevel: { id: string; name: string };
  coachService: { id: string; key: string };
  coachA: WorldAccount & { offeringId: string };
  coachB: WorldAccount;
  adminOperations: WorldAccount;
  adminSupport: WorldAccount;
  adminFinance: WorldAccount;
  adminSuper: WorldAccount;
  gymA: WorldAccount & { inviteCode: string; locationId: string };
  gymB: WorldAccount & { inviteCode: string; locationId: string };
  creator: WorldAccount & { campaignId: string; linkCode: string; commissionPct: number };
  plan: { id: string; priceCents: number };
}

/**
 * The synthetic password for every account in this run. It comes from the
 * environment (FYNROX_SYNTHETIC_PASSWORD, a test-only value the runner
 * generates per run) so it is never written to world.json or any log.
 */
export function syntheticPassword(): string {
  const value = process.env.FYNROX_SYNTHETIC_PASSWORD;
  if (!value || !value.startsWith("test-only-")) {
    throw new Error("FYNROX_SYNTHETIC_PASSWORD must be set to a test-only value for the connectivity harness.");
  }
  return value;
}

export async function seedSyntheticWorld(
  prisma: PrismaClient,
  deps: { hashPassword: (pw: string) => Promise<string>; generateUniqueReferralCode: () => Promise<string> },
): Promise<SyntheticWorld> {
  const runId = `${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
  const password = syntheticPassword();
  const passwordHash = await deps.hashPassword(password);
  const email = (who: string) => `${who}.${runId}@${EMAIL_DOMAIN}`;
  const code = (prefix: string) => `${prefix}${runId}`.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);

  const user = async (who: string, name: string) => {
    const u = await prisma.user.create({
      data: { email: email(who), passwordHash, fullName: name, referralCode: await deps.generateUniqueReferralCode() },
    });
    return { id: u.id, email: u.email };
  };
  const admin = async (who: string, role: "operations" | "support" | "finance" | "super_admin") => {
    const a = await prisma.adminUser.create({
      data: { email: email(who), passwordHash, fullName: `TEST-ONLY Admin (${role})`, role, status: "active" },
    });
    return { id: a.id, email: a.email };
  };

  const userA = await user("user-a", "TEST-ONLY User A");
  const userB = await user("user-b", "TEST-ONLY User B");

  // Coach level, service and fee: fixture values only. Fee 0 so the
  // marketplace booking path can complete without a payment.
  const coachLevel = await prisma.coachLevel.create({
    data: {
      name: `TEST-ONLY level ${runId}`,
      rank: 900_000_000 + crypto.randomInt(0, 99_999_999),
      description: "TEST-ONLY fixture level for the connectivity harness. Not a real coach level.",
    },
  });
  const coachService = await prisma.coachService.create({
    data: { key: `tst-svc-${runId}`, label: "TEST-ONLY fitness session", serviceType: "fitness", durationMinutes: 45 },
  });
  await prisma.coachLevelFee.create({
    data: {
      levelId: coachLevel.id,
      serviceId: coachService.id,
      priceCents: 0,
      effectiveFrom: new Date(Date.now() - 60_000),
      reason: "TEST-ONLY fixture fee (0) for the connectivity harness",
    },
  });

  const coachARow = await prisma.professional.create({
    data: {
      email: email("coach-a"),
      passwordHash,
      fullName: "TEST-ONLY Coach A",
      status: "active",
      lifecycleStatus: "available",
      coachLevelId: coachLevel.id, // explicitly assigned level
    },
  });
  const offering = await prisma.professionalServiceOffering.create({
    data: {
      professionalId: coachARow.id,
      serviceId: coachService.id,
      serviceType: "fitness",
      label: "TEST-ONLY fitness session",
      durationMinutes: 45,
      isActive: true,
    },
  });
  const coachBRow = await prisma.professional.create({
    data: { email: email("coach-b"), passwordHash, fullName: "TEST-ONLY Coach B", status: "active", lifecycleStatus: "available" },
  });

  const adminOperations = await admin("admin-operations", "operations");
  const adminSupport = await admin("admin-support", "support");
  const adminFinance = await admin("admin-finance", "finance");
  const adminSuper = await admin("admin-super", "super_admin");

  const gym = async (who: string, name: string, prefix: string) => {
    const g = await prisma.gym.create({
      data: {
        name,
        contactName: "TEST-ONLY Staff",
        contactEmail: email(who),
        inviteCode: code(prefix),
        status: "approved",
        gymPasswordHash: passwordHash,
        commissionPct: 0, // TEST-ONLY: not a proposed gym commission
      },
    });
    const loc = await prisma.gymLocation.create({
      data: { gymId: g.id, name: `${name} — main floor`, address: "TEST-ONLY address", equipment: "TEST-ONLY: 2 benches" },
    });
    return { id: g.id, email: g.contactEmail, inviteCode: g.inviteCode, locationId: loc.id };
  };
  const gymA = await gym("gym-a", "TEST-ONLY Gym A", "TSTA");
  const gymB = await gym("gym-b", "TEST-ONLY Gym B", "TSTB");

  const creatorCommissionPct = 10; // TEST-ONLY fixture rate, not a proposed commission
  const influencer = await prisma.influencer.create({
    data: {
      name: "TEST-ONLY Creator",
      email: email("creator"),
      passwordHash,
      commissionPct: creatorCommissionPct,
      status: "active",
      notes: "TEST-ONLY connectivity-harness fixture",
    },
  });
  // Reference row keyed by channel; created only if the migrated database lacks it.
  const source = await prisma.acquisitionSource.upsert({
    where: { channel: "influencer" },
    update: {},
    create: { channel: "influencer", label: "Creator" },
  });
  const linkCode = `tst-creator-${runId}`;
  const campaign = await prisma.campaign.create({
    data: { sourceId: source.id, name: "TEST-ONLY creator campaign", linkCode, influencerId: influencer.id, status: "active" },
  });

  const plan = await prisma.subscriptionPlan.create({
    data: {
      id: `tst-plan-${runId}`,
      tier: "grow",
      name: "TEST-ONLY paid plan (₹1, not a real price)",
      priceCents: 100,
      billingCycle: "monthly",
      isActive: true,
    },
  });

  return {
    runId,
    createdAt: new Date().toISOString(),
    label: "TEST-ONLY synthetic data",
    userA,
    userB,
    coachLevel: { id: coachLevel.id, name: coachLevel.name },
    coachService: { id: coachService.id, key: coachService.key },
    coachA: { id: coachARow.id, email: coachARow.email, offeringId: offering.id },
    coachB: { id: coachBRow.id, email: coachBRow.email },
    adminOperations,
    adminSupport,
    adminFinance,
    adminSuper,
    gymA,
    gymB,
    creator: { id: influencer.id, email: influencer.email!, campaignId: campaign.id, linkCode, commissionPct: creatorCommissionPct },
    plan: { id: plan.id, priceCents: plan.priceCents },
  };
}

export function writeWorld(world: SyntheticWorld): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(WORLD_FILE, JSON.stringify(world, null, 2));
}

export function loadWorld(): SyntheticWorld {
  if (!fs.existsSync(WORLD_FILE)) {
    throw new Error(`No synthetic world at ${WORLD_FILE}. Run the journeys through vitest.connectivity.config.mts (its globalSetup seeds it).`);
  }
  return JSON.parse(fs.readFileSync(WORLD_FILE, "utf8")) as SyntheticWorld;
}
