import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { validateCouponSchema } from "./coupons.schema";
import * as couponsService from "./coupons.service";

/**
 * Coupons — consumer validate endpoint (added 31 Aug 2026). Redemption
 * itself isn't a route — it happens server-side at payment capture (see
 * coupons.service.ts). This just powers the mobile checkout's "apply code"
 * preview.
 */
export const couponsRouter = Router();

couponsRouter.post("/coupons/validate", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = validateCouponSchema.parse(req.body);
    res.status(200).json(await couponsService.validateCoupon(req.userId!, input.code, input.amountCents));
  } catch (err) {
    next(err);
  }
});
