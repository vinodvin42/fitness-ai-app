import { prisma } from "../db/prisma";
import { ApiHttpError } from "../middleware/errorHandler";
import { activeGstPercent, gstOnTop } from "./gst";

/**
 * Coach fees and FynroX commission (blueprint 4.2 and 4.3, Package 4).
 *
 * - FynroX places each coach in a level (`Professional.coachLevelId`) and
 *   sets a fee per level per service (`CoachLevelFee`). Coaches can't
 *   change either. A coach with no level, or a service with no fee at that
 *   level, can't be booked.
 * - Fees are before GST; GST is added on top.
 * - FynroX's commission comes from the versioned `CommissionRate` table: a
 *   per-coach override if one is in force, else the default.
 * - Fee and commission rows are never edited. The value in force at a
 *   moment is the newest non-cancelled row whose `effectiveFrom` has passed.
 * - Every Booking copies its fee, GST and commission when it is made, so a
 *   later change only reaches new bookings.
 */

/** Used only if no default CommissionRate row exists at all. */
export const FALLBACK_COMMISSION_PCT = 20;

type FeeRow = { levelId: string; serviceId: string; priceCents: number; effectiveFrom: Date; createdAt: Date };

function newer(a: FeeRow, b: FeeRow): boolean {
  const t = a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
  return t !== 0 ? t > 0 : a.createdAt.getTime() > b.createdAt.getTime();
}

/** Fees in force at `at` for every (level, service) pair asked about, keyed `levelId:serviceId`. */
export async function feesInForce(
  pairs: Array<{ levelId: string; serviceId: string }>,
  at: Date = new Date(),
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (pairs.length === 0) return result;
  const levelIds = [...new Set(pairs.map((p) => p.levelId))];
  const serviceIds = [...new Set(pairs.map((p) => p.serviceId))];
  const rows = (await prisma.coachLevelFee.findMany({
    where: { levelId: { in: levelIds }, serviceId: { in: serviceIds }, cancelledAt: null, effectiveFrom: { lte: at } },
    select: { levelId: true, serviceId: true, priceCents: true, effectiveFrom: true, createdAt: true },
  })) as FeeRow[];
  const best = new Map<string, FeeRow>();
  for (const r of rows) {
    const key = `${r.levelId}:${r.serviceId}`;
    const cur = best.get(key);
    if (!cur || newer(r, cur)) best.set(key, r);
  }
  for (const [key, r] of best) result.set(key, r.priceCents);
  return result;
}

export interface OfferingForPricing {
  id: string;
  serviceId: string;
  professionalId: string;
}

/**
 * The fee (before GST) for each offering, given each coach's level. An
 * offering missing from the result can't be booked right now.
 */
export async function offeringFees(
  offerings: OfferingForPricing[],
  levelByProfessional: Map<string, string | null>,
  at: Date = new Date(),
): Promise<Map<string, number>> {
  const pairs: Array<{ levelId: string; serviceId: string }> = [];
  for (const o of offerings) {
    const levelId = levelByProfessional.get(o.professionalId);
    if (levelId) pairs.push({ levelId, serviceId: o.serviceId });
  }
  const fees = await feesInForce(pairs, at);
  const out = new Map<string, number>();
  for (const o of offerings) {
    const levelId = levelByProfessional.get(o.professionalId);
    if (!levelId) continue;
    const fee = fees.get(`${levelId}:${o.serviceId}`);
    if (fee !== undefined) out.set(o.id, fee);
  }
  return out;
}

export interface BookingPrice {
  feeCents: number;
  gstCents: number;
  totalCents: number;
  gstPercent: number;
  coachLevelId: string;
}

/**
 * The price of booking one offering right now: the level fee plus GST.
 * 409 `fee_not_set` when the coach has no level or the level has no fee
 * for this service.
 */
export async function priceOffering(offering: OfferingForPricing): Promise<BookingPrice> {
  const professional = (await prisma.professional.findUnique({
    where: { id: offering.professionalId },
    select: { coachLevelId: true },
  })) as { coachLevelId: string | null } | null;
  const levelId = professional?.coachLevelId ?? null;
  if (!levelId) {
    throw new ApiHttpError(409, "fee_not_set", "This coach can't be booked yet — FynroX hasn't set their level");
  }
  const fees = await feesInForce([{ levelId, serviceId: offering.serviceId }]);
  const feeCents = fees.get(`${levelId}:${offering.serviceId}`);
  if (feeCents === undefined) {
    throw new ApiHttpError(409, "fee_not_set", "This service can't be booked yet — FynroX hasn't set its fee");
  }
  const gstPercent = feeCents > 0 ? await activeGstPercent() : 0;
  const gstCents = gstOnTop(feeCents, gstPercent);
  return { feeCents, gstCents, totalCents: feeCents + gstCents, gstPercent, coachLevelId: levelId };
}

type RateRow = { professionalId: string | null; pct: number | null; effectiveFrom: Date; createdAt: Date };

function newerRate(a: RateRow, b: RateRow): boolean {
  const t = a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
  return t !== 0 ? t > 0 : a.createdAt.getTime() > b.createdAt.getTime();
}

/** FynroX's commission % in force at `at` for each coach (override, else default). */
export async function commissionPctFor(professionalIds: string[], at: Date = new Date()): Promise<Map<string, number>> {
  const ids = [...new Set(professionalIds)];
  const rows = (await prisma.commissionRate.findMany({
    where: {
      cancelledAt: null,
      effectiveFrom: { lte: at },
      OR: [{ professionalId: null }, ...(ids.length > 0 ? [{ professionalId: { in: ids } }] : [])],
    },
    select: { professionalId: true, pct: true, effectiveFrom: true, createdAt: true },
  })) as RateRow[];
  let defaultRow: RateRow | null = null;
  const overrides = new Map<string, RateRow>();
  for (const r of rows) {
    if (r.professionalId === null) {
      if (!defaultRow || newerRate(r, defaultRow)) defaultRow = r;
    } else {
      const cur = overrides.get(r.professionalId);
      if (!cur || newerRate(r, cur)) overrides.set(r.professionalId, r);
    }
  }
  const defaultPct = defaultRow?.pct ?? FALLBACK_COMMISSION_PCT;
  const out = new Map<string, number>();
  for (const id of ids) {
    const o = overrides.get(id);
    out.set(id, o && o.pct !== null ? o.pct : defaultPct);
  }
  return out;
}

/** FynroX's default commission % in force at `at`. */
export async function defaultCommissionPct(at: Date = new Date()): Promise<number> {
  const row = (await prisma.commissionRate.findFirst({
    where: { professionalId: null, cancelledAt: null, effectiveFrom: { lte: at } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    select: { pct: true },
  })) as { pct: number | null } | null;
  return row?.pct ?? FALLBACK_COMMISSION_PCT;
}

/** Commission on an amount, rounded to the paisa. */
export function commissionCents(amountCents: number, pct: number): number {
  return Math.round((amountCents * pct) / 100);
}
