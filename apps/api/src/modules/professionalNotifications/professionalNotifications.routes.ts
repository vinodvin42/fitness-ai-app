import { Router } from "express";
import { z } from "zod";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import * as service from "./professionalNotifications.service";

export const professionalNotificationsRouter = Router();

const listQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// The coach inbox (26 Oct 2026). See professionalNotifications.service.ts.
professionalNotificationsRouter.get(
  "/professionals/me/notifications",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);
      res.status(200).json(await service.listNotifications(req.professionalId as string, query));
    } catch (err) {
      next(err);
    }
  },
);

professionalNotificationsRouter.post(
  "/professionals/me/notifications/read-all",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.status(200).json(await service.markAllRead(req.professionalId as string));
    } catch (err) {
      next(err);
    }
  },
);

professionalNotificationsRouter.post(
  "/professionals/me/notifications/:id/read",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.status(200).json(await service.markRead(req.professionalId as string, String(req.params.id)));
    } catch (err) {
      next(err);
    }
  },
);
