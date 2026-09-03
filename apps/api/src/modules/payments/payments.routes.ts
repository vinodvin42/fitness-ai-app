import { NextFunction, Request, Response, Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { createOrderSchema, verifyPaymentSchema } from "./payments.schema";
import * as paymentsService from "./payments.service";
import { writeRateLimit } from "../../middleware/rateLimit";

export const paymentsRouter = Router();

paymentsRouter.post("/payments/razorpay/orders", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = createOrderSchema.parse(req.body);
    res.status(201).json(await paymentsService.createOrder(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

paymentsRouter.post("/payments/razorpay/verify", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = verifyPaymentSchema.parse(req.body);
    res.json(await paymentsService.verifyPayment(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

/**
 * Mounted separately in app.ts (with express.raw(), before the global
 * express.json() middleware, and with no requireAuth — Razorpay calls
 * this server-to-server, authenticated by the HMAC signature header, not
 * a user's bearer token) rather than on `paymentsRouter` above, since
 * every other route on that router needs the app's normal parsed-JSON
 * body. See payments.service.ts's handleWebhook() for why the raw body
 * matters.
 */
export async function razorpayWebhookHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await paymentsService.handleWebhook(req.body, req.header("X-Razorpay-Signature"));
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}
