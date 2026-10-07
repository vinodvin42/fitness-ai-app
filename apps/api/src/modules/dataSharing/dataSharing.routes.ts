import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import * as service from "./dataSharing.service";

export const dataSharingRouter = Router();

const updateSharingSchema = z
  .object({
    steps: z.boolean().optional(),
    foodLogs: z.boolean().optional(),
    sleepRecovery: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field is required" });

dataSharingRouter.get("/coaching/sharing", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await service.listSharing(req.userId!));
  } catch (err) {
    next(err);
  }
});

dataSharingRouter.get("/coaching/professionals/:id/sharing", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await service.getSharing(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});

dataSharingRouter.patch("/coaching/professionals/:id/sharing", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = updateSharingSchema.parse(req.body);
    res.json(await service.updateSharing(req.userId!, req.params.id, input));
  } catch (err) {
    next(err);
  }
});
