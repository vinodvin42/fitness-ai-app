import { Router } from "express";
import { gymLoginSchema } from "./gymAuth.schema";
import * as gymAuthService from "./gymAuth.service";
import { requireGymAuth, GymAuthedRequest } from "../../middleware/gymAuth";
import { authRateLimit } from "../../middleware/rateLimit";

export const gymAuthRouter = Router();

/**
 * Gym Partner Lite portal (R2 Wave 5, 21 Sep 2026) — real JWT-based login
 * for a Gym's own staff/point-of-contact, mirroring professionalAuth
 * .routes.ts's login/`/me` shape (login-only — no signup/refresh/logout,
 * see gymAuth.service.ts's own doc comment).
 */

gymAuthRouter.post("/gym-portal/auth/login", authRateLimit, async (req, res, next) => {
  try {
    const input = gymLoginSchema.parse(req.body);
    const { gym, token, tokenExpiresAt } = await gymAuthService.gymLogin(input);
    res.status(200).json({ gym: gymAuthService.toPublicGym(gym), token, tokenExpiresAt });
  } catch (err) {
    next(err);
  }
});

gymAuthRouter.get("/gym-portal/auth/me", requireGymAuth, async (req: GymAuthedRequest, res, next) => {
  try {
    const gym = await gymAuthService.getGymAuthById(req.gymId as string);
    res.status(200).json({ gym: gymAuthService.toPublicGym(gym) });
  } catch (err) {
    next(err);
  }
});
