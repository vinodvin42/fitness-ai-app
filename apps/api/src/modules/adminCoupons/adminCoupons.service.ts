import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { normalizeCode } from "../coupons/coupons.service";
import { CreateCouponInput, ListCouponsQuery, UpdateCouponInput } from "./adminCoupons.schema";

/**
 * Module 06.05 — Coupons (docs/admin/03-screen-inventory.md), added 31 Aug
 * 2026 — the discount-code half of Pricing that adminPlans.service.ts
 * flagged as "no Coupon entity exists anywhere". Now it does: real admin
 * CRUD over the `Coupon` model, applied at checkout by the consumer
 * `coupons` module. Deactivating (not deleting) preserves the redemption
 * history — same "no delete, reversible archive" reasoning adminPlans uses
 * for SubscriptionPlan.
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

type CouponRow = {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  maxRedemptions: number | null;
  timesRedeemed: number;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toItem(c: CouponRow) {
  return {
    id: c.id,
    code: c.code,
    description: c.description,
    discountType: c.discountType,
    discountValue: c.discountValue,
    maxRedemptions: c.maxRedemptions,
    timesRedeemed: c.timesRedeemed,
    isActive: c.isActive,
    expiresAt: c.expiresAt,
    createdAt: c.createdAt,
  };
}

export async function listCoupons(query: ListCouponsQuery) {
  const rows = (await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } })) as CouponRow[];
  const filtered = rows.filter((r) =>
    query.status ? (query.status === "active") === r.isActive : true,
  );
  return {
    coupons: filtered.map(toItem),
    counts: {
      total: rows.length,
      active: rows.filter((r) => r.isActive).length,
      totalRedemptions: rows.reduce((s, r) => s + r.timesRedeemed, 0),
    },
  };
}

async function getCouponOrThrow(id: string): Promise<CouponRow> {
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) throw new ApiHttpError(404, "coupon_not_found", "Coupon not found");
  return coupon as CouponRow;
}

export async function createCoupon(actorAdminId: string, input: CreateCouponInput) {
  const code = normalizeCode(input.code);
  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) {
    throw new ApiHttpError(409, "code_taken", "A coupon with this code already exists");
  }
  if (input.discountType === "percent" && input.discountValue > 100) {
    throw new ApiHttpError(422, "invalid_percent", "A percentage discount can't exceed 100");
  }

  const coupon = await prisma.coupon.create({
    data: {
      code,
      description: input.description ?? null,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxRedemptions: input.maxRedemptions ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  await recordAudit({
    actorAdminId,
    action: "coupon.create",
    entityType: "Coupon",
    entityId: coupon.id,
    metadata: { code, discountType: input.discountType, discountValue: input.discountValue },
  });
  return toItem(coupon as CouponRow);
}

export async function updateCoupon(actorAdminId: string, id: string, input: UpdateCouponInput) {
  const existing = await getCouponOrThrow(id);
  const discountType = input.discountType ?? existing.discountType;
  const discountValue = input.discountValue ?? existing.discountValue;
  if (discountType === "percent" && discountValue > 100) {
    throw new ApiHttpError(422, "invalid_percent", "A percentage discount can't exceed 100");
  }

  const coupon = await prisma.coupon.update({
    where: { id },
    data: {
      description: input.description,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxRedemptions: input.maxRedemptions,
      isActive: input.isActive,
      expiresAt: input.expiresAt === undefined ? undefined : input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  await recordAudit({
    actorAdminId,
    action: "coupon.update",
    entityType: "Coupon",
    entityId: id,
    metadata: { ...input },
  });
  return toItem(coupon as CouponRow);
}
