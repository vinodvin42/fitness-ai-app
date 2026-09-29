import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import * as service from "./checkout.service";

export const checkoutRouter = Router();

const quoteQuerySchema = z.object({
  purpose: z.enum(["subscription", "program_purchase"]),
  referenceId: z.string().trim().min(1),
  /** "Have a code?" — a user code (FX-…) or a creator/promo code. */
  code: z.string().trim().max(64).optional(),
});

/**
 * U-M1's data source. A GET, because it writes nothing: an abandoned
 * checkout must not leave a payment row behind, or the funnel cannot
 * tell abandonment from failure.
 */
checkoutRouter.get("/checkout/quote", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = quoteQuerySchema.parse(req.query);
    res.json(await service.getCheckoutQuote(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

/** U-M22 — purchase history with refund status. */
checkoutRouter.get("/checkout/purchases", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await service.listPurchaseHistory(req.userId!));
  } catch (err) {
    next(err);
  }
});
