import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { upsertRecoverySchema } from "./recovery.schema";
import * as recoveryService from "./recovery.service";

/**
 * Recovery & Devices — manual-entry stopgap (added 31 Aug 2026). Consumer-
 * authed. See recovery.service.ts's doc comment.
 */
export const recoveryRouter = Router();

recoveryRouter.get("/recovery", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await recoveryService.listRecovery(req.userId!));
  } catch (err) {
    next(err);
  }
});

recoveryRouter.put("/recovery", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = upsertRecoverySchema.parse(req.body);
    res.status(200).json(await recoveryService.upsertRecovery(req.userId!, input));
  } catch (err) {
    next(err);
  }
});
