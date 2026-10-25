import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { healthReadingSchema, healthspanAnswersSchema, readingsQuerySchema, trendsQuerySchema } from "./healthspan.schema";
import * as healthspanService from "./healthspan.service";

/** Healthspan (25 Oct 2026): fitness age, heart age, BP / VO2max readings, 12-month trends. Consumer-authed. */
export const healthspanRouter = Router();

healthspanRouter.get("/healthspan", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await healthspanService.getHealthspan(req.userId!));
  } catch (err) {
    next(err);
  }
});

healthspanRouter.put("/healthspan/answers", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = healthspanAnswersSchema.parse(req.body);
    res.json(await healthspanService.updateAnswers(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

healthspanRouter.get("/healthspan/readings", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { kind } = readingsQuerySchema.parse(req.query);
    res.json(await healthspanService.listReadings(req.userId!, kind));
  } catch (err) {
    next(err);
  }
});

healthspanRouter.post("/healthspan/readings", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = healthReadingSchema.parse(req.body);
    res.status(201).json(await healthspanService.addReading(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

healthspanRouter.get("/healthspan/trends", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { months } = trendsQuerySchema.parse(req.query);
    res.json(await healthspanService.getLongTermTrends(req.userId!, months));
  } catch (err) {
    next(err);
  }
});
