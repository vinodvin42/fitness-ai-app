import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { commissionPctFor, defaultCommissionPct, feesInForce } from "../../lib/coachFees";
import { activeGstPercent } from "../../lib/gst";
import { indiaDate, parseEffectiveFrom } from "../../lib/indiaTime";
import type {
  AssignCoachLevelInput,
  CreateLevelInput,
  CreateServiceInput,
  SetCoachCommissionInput,
  SetDefaultCommissionInput,
  SetLevelFeeInput,
  UpdateLevelInput,
  UpdateServiceInput,
} from "./adminCoachLevels.schema";

/**
 * Coach levels and fees (blueprint 4.3, Package 4).
 *
 * - FynroX places each coach in a level and sets a fee per level per
 *   service. Coaches can never set or change either.
 * - Fees and commission rates are versioned rows with a start date; nothing
 *   is edited in place. A change only reaches new bookings, because each
 *   Booking copies its fee and commission when it is made.
 * - Start dates can't be in the past (a minute's grace for "now").
 * - Every route runs for the Super Admin directly; anyone else's call
 *   becomes an approval request (commerce / professionals edit, D21).
 */

const PAST_GRACE_MS = 60 * 1000;

function startDate(value: string | undefined): Date {
  const now = new Date();
  if (!value) return now;
  // Today's date (India time) means "from now".
  if (value === indiaDate(now)) return now;
  const date = parseEffectiveFrom(value);
  if (date.getTime() < now.getTime() - PAST_GRACE_MS) {
    throw new ApiHttpError(422, "start_in_past", "The start date can't be in the past");
  }
  return date;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "service";
}

type LevelRow = { id: string; name: string; rank: number; description: string | null; isActive: boolean; _count: { professionals: number } };
type ServiceRow = { id: string; key: string; label: string; serviceType: string | null; durationMinutes: number; isActive: boolean };
type FeeRow = { id: string; levelId: string; serviceId: string; priceCents: number; effectiveFrom: Date; reason: string | null };
type RateRow = { id: string; professionalId: string | null; pct: number | null; effectiveFrom: Date; reason: string | null };

/** Everything the Coach levels screen shows. */
export async function getCoachPricing() {
  const now = new Date();
  const [levels, services, upcomingFees, upcomingRates, coaches, gstPercent, defaultPct] = await Promise.all([
    prisma.coachLevel.findMany({ orderBy: { rank: "asc" }, include: { _count: { select: { professionals: true } } } }),
    prisma.coachService.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] }),
    prisma.coachLevelFee.findMany({
      where: { cancelledAt: null, effectiveFrom: { gt: now } },
      orderBy: { effectiveFrom: "asc" },
    }),
    prisma.commissionRate.findMany({
      where: { cancelledAt: null, effectiveFrom: { gt: now } },
      orderBy: { effectiveFrom: "asc" },
    }),
    prisma.professional.findMany({
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        status: true,
        lifecycleStatus: true,
        coachLevelId: true,
        credentials: { select: { serviceType: true, status: true } },
      },
    }),
    activeGstPercent(),
    defaultCommissionPct(now),
  ]);

  const levelRows = levels as LevelRow[];
  const serviceRows = services as ServiceRow[];
  const pairs = levelRows.flatMap((l) => serviceRows.map((s) => ({ levelId: l.id, serviceId: s.id })));
  const current = await feesInForce(pairs, now);
  const coachRows = coaches as Array<{
    id: string;
    fullName: string;
    status: string;
    lifecycleStatus: string;
    coachLevelId: string | null;
    credentials: Array<{ serviceType: string; status: string }>;
  }>;
  const coachRates = await commissionPctFor(coachRows.map((c) => c.id), now);
  const overrides = (await prisma.commissionRate.findMany({
    where: { professionalId: { not: null }, cancelledAt: null, effectiveFrom: { lte: now } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    select: { professionalId: true, pct: true },
  })) as Array<{ professionalId: string; pct: number | null }>;
  const hasOverride = new Set<string>();
  const seen = new Set<string>();
  for (const o of overrides) {
    if (seen.has(o.professionalId)) continue;
    seen.add(o.professionalId);
    if (o.pct !== null) hasOverride.add(o.professionalId);
  }

  return {
    gstPercent,
    commission: {
      defaultPct,
      scheduled: (upcomingRates as RateRow[])
        .filter((r) => r.professionalId === null)
        .map((r) => ({ id: r.id, pct: r.pct, effectiveFrom: r.effectiveFrom, reason: r.reason })),
    },
    services: serviceRows.map((s) => ({
      id: s.id,
      key: s.key,
      label: s.label,
      serviceType: s.serviceType,
      durationMinutes: s.durationMinutes,
      isActive: s.isActive,
    })),
    levels: levelRows.map((l) => ({
      id: l.id,
      name: l.name,
      rank: l.rank,
      description: l.description,
      isActive: l.isActive,
      coachCount: l._count.professionals,
      fees: serviceRows.map((s) => ({
        serviceId: s.id,
        // Fee before GST in force today (null = not set, can't be booked).
        priceCents: current.get(`${l.id}:${s.id}`) ?? null,
        scheduled: (upcomingFees as FeeRow[])
          .filter((f) => f.levelId === l.id && f.serviceId === s.id)
          .map((f) => ({ id: f.id, priceCents: f.priceCents, effectiveFrom: f.effectiveFrom, reason: f.reason })),
      })),
    })),
    coaches: coachRows.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      status: c.status,
      lifecycleStatus: c.lifecycleStatus,
      coachLevelId: c.coachLevelId,
      verifiedServices: c.credentials.filter((x) => x.status === "verified").map((x) => x.serviceType),
      commissionPct: coachRates.get(c.id) ?? defaultPct,
      hasCommissionOverride: hasOverride.has(c.id),
      scheduledCommission: (upcomingRates as RateRow[])
        .filter((r) => r.professionalId === c.id)
        .map((r) => ({ id: r.id, pct: r.pct, effectiveFrom: r.effectiveFrom, reason: r.reason })),
    })),
  };
}

// ---- Levels ---------------------------------------------------------------

async function createLevelRow(input: CreateLevelInput) {
  // `rank` is unique; two levels created at the same moment can pick the
  // same next rank, so retry a couple of times on a rank clash.
  for (let attempt = 0; ; attempt += 1) {
    const top = (await prisma.coachLevel.findFirst({ orderBy: { rank: "desc" }, select: { rank: true } })) as { rank: number } | null;
    try {
      return await prisma.coachLevel.create({
        data: { name: input.name, description: input.description ?? null, rank: (top?.rank ?? 0) + 1 },
      });
    } catch (err) {
      const e = err as { code?: string; meta?: { target?: string[] | string } };
      const target = Array.isArray(e.meta?.target) ? e.meta?.target.join(",") : String(e.meta?.target ?? "");
      if (e.code === "P2002" && target.includes("rank") && attempt < 3) continue;
      throw err;
    }
  }
}

export async function createLevel(adminId: string, input: CreateLevelInput) {
  try {
    const level = await createLevelRow(input);
    await recordAudit({
      actorAdminId: adminId,
      action: "coach_level.created",
      entityType: "CoachLevel",
      entityId: level.id,
      stateAfter: { name: level.name, rank: level.rank },
    });
    return level;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new ApiHttpError(409, "level_exists", "A level with that name already exists");
    }
    throw err;
  }
}

export async function updateLevel(adminId: string, levelId: string, input: UpdateLevelInput) {
  const before = (await prisma.coachLevel.findUnique({ where: { id: levelId } })) as
    | { id: string; name: string; description: string | null; isActive: boolean }
    | null;
  if (!before) throw new ApiHttpError(404, "level_not_found", "Coach level not found");
  if (input.isActive === false && before.isActive) {
    const inUse = await prisma.professional.count({ where: { coachLevelId: levelId } });
    if (inUse > 0) {
      throw new ApiHttpError(409, "level_in_use", "Move the coaches in this level to another level first");
    }
  }
  try {
    const level = await prisma.coachLevel.update({
      where: { id: levelId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    await recordAudit({
      actorAdminId: adminId,
      action: "coach_level.updated",
      entityType: "CoachLevel",
      entityId: levelId,
      stateBefore: { name: before.name, description: before.description, isActive: before.isActive },
      stateAfter: { name: level.name, description: level.description, isActive: level.isActive },
    });
    return level;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new ApiHttpError(409, "level_exists", "A level with that name already exists");
    }
    throw err;
  }
}

// ---- Services -------------------------------------------------------------

export async function createService(adminId: string, input: CreateServiceInput) {
  const base = slug(input.label);
  let key = base;
  for (let i = 2; await prisma.coachService.findUnique({ where: { key } }); i += 1) key = `${base}-${i}`;
  const service = await prisma.coachService.create({
    data: { key, label: input.label, serviceType: input.serviceType, durationMinutes: input.durationMinutes },
  });
  await recordAudit({
    actorAdminId: adminId,
    action: "coach_service.created",
    entityType: "CoachService",
    entityId: service.id,
    stateAfter: { label: service.label, serviceType: service.serviceType, durationMinutes: service.durationMinutes },
  });
  // Coaches already in a level who can deliver it get it as an offering.
  const coaches = (await prisma.professional.findMany({ where: { coachLevelId: { not: null } }, select: { id: true } })) as Array<{
    id: string;
  }>;
  for (const c of coaches) await syncCoachOfferings(c.id);
  return service;
}

export async function updateService(adminId: string, serviceId: string, input: UpdateServiceInput) {
  const before = (await prisma.coachService.findUnique({ where: { id: serviceId } })) as ServiceRow | null;
  if (!before) throw new ApiHttpError(404, "service_not_found", "Coach service not found");
  const service = await prisma.coachService.update({
    where: { id: serviceId },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  // Coach offerings mirror the service (bookings already made keep their
  // own copied duration). Switching off turns every offering off;
  // switching back on only turns on coaches still verified for it.
  await prisma.professionalServiceOffering.updateMany({
    where: { serviceId },
    data: {
      label: service.label,
      durationMinutes: service.durationMinutes,
      ...(input.isActive === false ? { isActive: false } : {}),
    },
  });
  if (input.isActive === true) {
    const offerings = (await prisma.professionalServiceOffering.findMany({
      where: { serviceId },
      select: { id: true, professional: { select: { credentials: { select: { serviceType: true, status: true } } } } },
    })) as Array<{ id: string; professional: { credentials: Array<{ serviceType: string; status: string }> } }>;
    const eligible = offerings
      .filter((o) => {
        const verified = new Set(o.professional.credentials.filter((c) => c.status === "verified").map((c) => c.serviceType));
        return before.serviceType ? verified.has(before.serviceType) : verified.has("fitness") && verified.has("nutrition");
      })
      .map((o) => o.id);
    if (eligible.length > 0) {
      await prisma.professionalServiceOffering.updateMany({ where: { id: { in: eligible } }, data: { isActive: true } });
    }
    const placed = (await prisma.professional.findMany({ where: { coachLevelId: { not: null } }, select: { id: true } })) as Array<{
      id: string;
    }>;
    for (const c of placed) await syncCoachOfferings(c.id);
  }
  await recordAudit({
    actorAdminId: adminId,
    action: "coach_service.updated",
    entityType: "CoachService",
    entityId: serviceId,
    stateBefore: { label: before.label, durationMinutes: before.durationMinutes, isActive: before.isActive },
    stateAfter: { label: service.label, durationMinutes: service.durationMinutes, isActive: service.isActive },
  });
  return service;
}

// ---- Fees -----------------------------------------------------------------

/**
 * A new fee for one level and one service, from a start date (default now).
 * Only new bookings get it; existing bookings keep their copied fee.
 */
export async function setLevelFee(adminId: string, levelId: string, input: SetLevelFeeInput) {
  const [level, service] = await Promise.all([
    prisma.coachLevel.findUnique({ where: { id: levelId }, select: { id: true, name: true } }),
    prisma.coachService.findUnique({ where: { id: input.serviceId }, select: { id: true, label: true } }),
  ]);
  if (!level) throw new ApiHttpError(404, "level_not_found", "Coach level not found");
  if (!service) throw new ApiHttpError(404, "service_not_found", "Coach service not found");
  const effectiveFrom = startDate(input.effectiveFrom);
  const before = (await feesInForce([{ levelId, serviceId: input.serviceId }])).get(`${levelId}:${input.serviceId}`) ?? null;

  const fee = await prisma.coachLevelFee.create({
    data: {
      levelId,
      serviceId: input.serviceId,
      priceCents: input.priceCents,
      effectiveFrom,
      reason: input.reason,
      createdByAdminId: adminId,
    },
  });
  await recordAudit({
    actorAdminId: adminId,
    action: "coach_fee.set",
    entityType: "CoachLevelFee",
    entityId: fee.id,
    stateBefore: { priceCents: before },
    stateAfter: { priceCents: fee.priceCents, effectiveFrom: fee.effectiveFrom.toISOString() },
    metadata: { levelId, levelName: (level as { name: string }).name, serviceId: input.serviceId, appliesTo: "new bookings only" },
  });
  return fee;
}

/** Cancel a fee that hasn't started yet. */
export async function cancelLevelFee(adminId: string, feeId: string) {
  const now = new Date();
  const result = await prisma.coachLevelFee.updateMany({
    where: { id: feeId, cancelledAt: null, effectiveFrom: { gt: now } },
    data: { cancelledAt: now },
  });
  if (result.count === 0) {
    const exists = await prisma.coachLevelFee.findUnique({ where: { id: feeId }, select: { id: true } });
    if (!exists) throw new ApiHttpError(404, "fee_not_found", "Fee not found");
    throw new ApiHttpError(409, "fee_already_started", "Only a fee that hasn't started yet can be cancelled");
  }
  await recordAudit({ actorAdminId: adminId, action: "coach_fee.cancelled", entityType: "CoachLevelFee", entityId: feeId });
  return { id: feeId, cancelledAt: now };
}

// ---- Commission -------------------------------------------------------------

/** FynroX's default commission % from a start date (new bookings only). */
export async function setDefaultCommission(adminId: string, input: SetDefaultCommissionInput) {
  const effectiveFrom = startDate(input.effectiveFrom);
  const before = await defaultCommissionPct();
  const rate = await prisma.commissionRate.create({
    data: { professionalId: null, pct: input.pct, effectiveFrom, reason: input.reason, createdByAdminId: adminId },
  });
  await recordAudit({
    actorAdminId: adminId,
    action: "commission.default_set",
    entityType: "CommissionRate",
    entityId: rate.id,
    stateBefore: { pct: before },
    stateAfter: { pct: input.pct, effectiveFrom: effectiveFrom.toISOString() },
    metadata: { appliesTo: "new bookings only" },
  });
  return rate;
}

/** One coach's own commission % (or back to the default with `pct: null`). */
export async function setCoachCommission(adminId: string, professionalId: string, input: SetCoachCommissionInput) {
  const professional = await prisma.professional.findUnique({ where: { id: professionalId }, select: { id: true } });
  if (!professional) throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  const effectiveFrom = startDate(input.effectiveFrom);
  const before = (await commissionPctFor([professionalId])).get(professionalId);
  const rate = await prisma.commissionRate.create({
    data: { professionalId, pct: input.pct, effectiveFrom, reason: input.reason, createdByAdminId: adminId },
  });
  await recordAudit({
    actorAdminId: adminId,
    action: "coach.commission_updated",
    entityType: "Professional",
    entityId: professionalId,
    stateBefore: { commissionPct: before },
    stateAfter: { commissionPct: input.pct ?? "default", effectiveFrom: effectiveFrom.toISOString() },
    metadata: { commissionRateId: rate.id, appliesTo: "new bookings only" },
  });
  return rate;
}

/** Cancel a commission rate that hasn't started yet. */
export async function cancelCommissionRate(adminId: string, rateId: string) {
  const now = new Date();
  const result = await prisma.commissionRate.updateMany({
    where: { id: rateId, cancelledAt: null, effectiveFrom: { gt: now } },
    data: { cancelledAt: now },
  });
  if (result.count === 0) {
    const exists = await prisma.commissionRate.findUnique({ where: { id: rateId }, select: { id: true } });
    if (!exists) throw new ApiHttpError(404, "rate_not_found", "Commission rate not found");
    throw new ApiHttpError(409, "rate_already_started", "Only a rate that hasn't started yet can be cancelled");
  }
  await recordAudit({ actorAdminId: adminId, action: "commission.cancelled", entityType: "CommissionRate", entityId: rateId });
  return { id: rateId, cancelledAt: now };
}

// ---- Coach placement ---------------------------------------------------------

/**
 * Place a coach in a level (or take them out). Their bookable offerings
 * are created for every active service they're verified for. Bookings
 * already made keep their copied fee.
 */
export async function assignCoachLevel(adminId: string, professionalId: string, input: AssignCoachLevelInput) {
  const professional = (await prisma.professional.findUnique({
    where: { id: professionalId },
    select: { id: true, coachLevelId: true },
  })) as { id: string; coachLevelId: string | null } | null;
  if (!professional) throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  if (input.coachLevelId) {
    const level = (await prisma.coachLevel.findUnique({ where: { id: input.coachLevelId }, select: { isActive: true } })) as
      | { isActive: boolean }
      | null;
    if (!level) throw new ApiHttpError(404, "level_not_found", "Coach level not found");
    if (!level.isActive) throw new ApiHttpError(409, "level_inactive", "That level is switched off");
  }
  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: { coachLevelId: input.coachLevelId },
    select: { id: true, coachLevelId: true },
  });
  if (input.coachLevelId) await syncCoachOfferings(professionalId);
  await recordAudit({
    actorAdminId: adminId,
    action: "coach.level_assigned",
    entityType: "Professional",
    entityId: professionalId,
    stateBefore: { coachLevelId: professional.coachLevelId },
    stateAfter: { coachLevelId: input.coachLevelId },
  });
  return updated;
}

/**
 * Make sure a coach has an offering for every active FynroX service they
 * can deliver: single-service ones for each verified service type, and the
 * combined one when both are verified. Never removes or reprices anything
 * (prices come from the level fee). Safe to call any time.
 */
export async function syncCoachOfferings(professionalId: string): Promise<number> {
  // One transaction with the coach's row locked, so two syncs running at
  // once (placing a coach while a credential is verified) can't both
  // create the same offering.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "professionals" WHERE "id" = ${professionalId} FOR UPDATE`;
    const professional = (await tx.professional.findUnique({
      where: { id: professionalId },
      select: { coachLevelId: true, credentials: { select: { serviceType: true, status: true } } },
    })) as { coachLevelId: string | null; credentials: Array<{ serviceType: string; status: string }> } | null;
    if (!professional?.coachLevelId) return 0;
    const verified = new Set(professional.credentials.filter((c) => c.status === "verified").map((c) => c.serviceType));
    if (verified.size === 0) return 0;
    const [services, existing] = await Promise.all([
      tx.coachService.findMany({ where: { isActive: true } }),
      tx.professionalServiceOffering.findMany({ where: { professionalId }, select: { serviceId: true } }),
    ]);
    const have = new Set((existing as Array<{ serviceId: string }>).map((o) => o.serviceId));
    let created = 0;
    for (const s of services as ServiceRow[]) {
      const canDeliver = s.serviceType ? verified.has(s.serviceType) : verified.has("fitness") && verified.has("nutrition");
      if (!canDeliver || have.has(s.id)) continue;
      await tx.professionalServiceOffering.create({
        data: {
          professionalId,
          serviceId: s.id,
          serviceType: s.serviceType as "fitness" | "nutrition" | null,
          label: s.label,
          durationMinutes: s.durationMinutes,
          isActive: true,
        },
      });
      created += 1;
    }
    return created;
  });
}
