import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { linkPartnerCodeSchema } from "./userPartner.schema";
import * as userPartnerService from "./userPartner.service";

// Mounted under /users (see app.ts) next to usersRouter.
export const userPartnerRouter = Router();

userPartnerRouter.get("/me/partner", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await userPartnerService.getPartner(req.userId!));
  } catch (err) {
    next(err);
  }
});

userPartnerRouter.post("/me/partner-code", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = linkPartnerCodeSchema.parse(req.body);
    res.status(201).json(await userPartnerService.linkPartnerCode(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

userPartnerRouter.delete("/me/partner-code", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await userPartnerService.removePartnerCode(req.userId!));
  } catch (err) {
    next(err);
  }
});
