import { NextFunction, Request, Response, Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { createOrderSchema, verifyPaymentSchema } from "./payments.schema";
import * as paymentsService from "./payments.service";
import { writeRateLimit } from "../../middleware/rateLimit";
import { paymentProvider, providerStatus } from "../../providers";

export const paymentsRouter = Router();

/**
 * Go-live hardening (3 Sep 2026) — the pilot decision to launch with
 * payments parked (RAZORPAY_KEY_ID/SECRET unset) means every purchase
 * attempt below already 503s cleanly rather than crashing, but until now
 * the mobile client had no way to know that *before* a tester tapped
 * Subscribe/Purchase — see DEPLOY-RUNBOOK.md's pilot section, which
 * flagged exactly this as "will look broken for a moment... not hidden."
 * No auth required — this is a non-sensitive boolean feature flag, not
 * payment data, and screens need it before/without a purchase attempt.
 */
paymentsRouter.get("/payments/config", (_req, res) => {
  // Now reports WHICH provider as well as whether it is configured —
  // a client showing a payment sheet needs to know it is talking to
  // the mock, and a QA run that silently used the mock is a false pass.
  res.json({ configured: paymentProvider.isConfigured(), provider: paymentProvider.name, providers: providerStatus() });
});

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
 * U6 Premium entitlement (15 Sep 2026, §9 / BR-COM-011) — lets a screen
 * read a specific Payment's real activation state (see
 * payments.service.ts's getPaymentForUser doc comment) instead of only
 * trusting the one-shot result a /verify call returned at the moment it
 * happened. No write rate limit — this is a read, polled by a recoverable-
 * state screen while activation finishes or is retried.
 */
paymentsRouter.get("/payments/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await paymentsService.getPaymentForUser(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});

/**
 * U6 Premium entitlement — re-runs a previously-failed entitlement grant
 * for a payment that was already captured (see payments.service.ts's
 * retryActivation doc comment). Never re-charges; only re-attempts the
 * DB-side subscribe()/purchaseProgram() call.
 */
paymentsRouter.post(
  "/payments/:id/retry-activation",
  requireAuth,
  writeRateLimit,
  async (req: AuthedRequest, res, next) => {
    try {
      res.json(await paymentsService.retryActivation(req.userId!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

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
