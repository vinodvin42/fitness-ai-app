import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { profilePhotoSchema } from "../users/users.schema";
import * as professionalPhotoService from "./professionalPhoto.service";

/** Professional profile photo (25 Oct 2026); see professionalPhoto.service.ts. `photo` is null when none is set. */
export const professionalPhotoRouter = Router();

professionalPhotoRouter.get("/professionals/me/photo", requireProfessionalAuth, async (req: ProfessionalAuthedRequest, res, next) => {
  try {
    res.json({ photo: await professionalPhotoService.getMyPhoto(req.professionalId as string) });
  } catch (err) {
    next(err);
  }
});

professionalPhotoRouter.put("/professionals/me/photo", requireProfessionalAuth, writeRateLimit, async (req: ProfessionalAuthedRequest, res, next) => {
  try {
    const input = profilePhotoSchema.parse(req.body);
    res.json({ photo: await professionalPhotoService.setMyPhoto(req.professionalId as string, input) });
  } catch (err) {
    next(err);
  }
});

professionalPhotoRouter.delete("/professionals/me/photo", requireProfessionalAuth, writeRateLimit, async (req: ProfessionalAuthedRequest, res, next) => {
  try {
    await professionalPhotoService.deleteMyPhoto(req.professionalId as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Members see an active professional's photo on their profile and in Find a professional.
professionalPhotoRouter.get("/coaching/professionals/:id/photo", requireAuth, async (req, res, next) => {
  try {
    res.json({ photo: await professionalPhotoService.getProfessionalPhoto(req.params.id) });
  } catch (err) {
    next(err);
  }
});
