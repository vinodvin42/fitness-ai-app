import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { subscribeSchema } from "./subscriptions.schema";
import * as subscriptionsService from "./subscriptions.service";

export const subscriptionsRouter = Router();

subscriptionsRouter.get("/subscription-plans", requireAuth, async (_req, res, next) => {
  try {
    res.json({ items: await subscriptionsService.listPlans() });
  } catch (err) {
    next(err);
  }
});

subscriptionsRouter.get("/subscriptions/me", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const subscription = await subscriptionsService.getCurrentSubscription(req.userId!);
    res.json({ subscription });
  } catch (err) {
    next(err);
  }
});

subscriptionsRouter.get("/subscriptions/history", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await subscriptionsService.listSubscriptionHistory(req.userId!) });
  } catch (err) {
    next(err);
  }
});

subscriptionsRouter.post("/subscriptions", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = subscribeSchema.parse(req.body);
    const subscription = await subscriptionsService.subscribe(req.userId!, input);
    res.status(201).json(subscription);
  } catch (err) {
    next(err);
  }
});

subscriptionsRouter.post("/subscriptions/cancel", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await subscriptionsService.cancelSubscription(req.userId!));
  } catch (err) {
    next(err);
  }
});
