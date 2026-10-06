import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { calendarQuerySchema, summaryQuerySchema, updateMealLogSchema } from "./nutritionDays.schema";
import * as nutritionDaysService from "./nutritionDays.service";

export const nutritionDaysRouter = Router();

nutritionDaysRouter.patch("/meal-logs/:id", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = updateMealLogSchema.parse(req.body);
    res.json(await nutritionDaysService.updateMealLog(req.userId!, req.params.id, input));
  } catch (err) {
    next(err);
  }
});

nutritionDaysRouter.delete("/meal-logs/:id", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await nutritionDaysService.deleteMealLog(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});

nutritionDaysRouter.get("/nutrition/summary", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const query = summaryQuerySchema.parse(req.query);
    res.json(await nutritionDaysService.getDaySummary(req.userId!, query));
  } catch (err) {
    next(err);
  }
});

nutritionDaysRouter.get("/nutrition/calendar", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const query = calendarQuerySchema.parse(req.query);
    res.json(await nutritionDaysService.getMonthCalendar(req.userId!, query));
  } catch (err) {
    next(err);
  }
});
