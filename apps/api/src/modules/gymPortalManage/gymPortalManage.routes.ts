import { Router } from "express";
import { GymAuthedRequest, requireGymAuth } from "../../middleware/gymAuth";
import {
  createAnnouncementSchema,
  createEquipmentSchema,
  createTimingSchema,
  idParamSchema,
  listHelpRequestsQuerySchema,
  updateEquipmentSchema,
  updateHelpRequestSchema,
  updateTimingSchema,
} from "./gymPortalManage.schema";
import * as service from "./gymPortalManage.service";

/** Gym-staff routes behind requireGymAuth. The gym is always req.gymId, never a client-supplied id. */
export const gymPortalManageRouter = Router();

type Handler = (req: GymAuthedRequest) => Promise<{ status?: number; body: unknown }>;
const wrap =
  (fn: Handler) =>
  async (req: GymAuthedRequest, res: import("express").Response, next: import("express").NextFunction) => {
    try {
      const out = await fn(req);
      res.status(out.status ?? 200).json(out.body);
    } catch (err) {
      next(err);
    }
  };
const gid = (req: GymAuthedRequest) => req.gymId as string;
const pid = (req: GymAuthedRequest) => idParamSchema.parse(req.params).id;

gymPortalManageRouter.get("/gym-portal/timings", requireGymAuth, wrap(async (req) => ({ body: { items: await service.listTimings(gid(req)) } })));
gymPortalManageRouter.post("/gym-portal/timings", requireGymAuth, wrap(async (req) => ({
  status: 201,
  body: { timing: await service.createTiming(gid(req), createTimingSchema.parse(req.body)) },
})));
gymPortalManageRouter.patch("/gym-portal/timings/:id", requireGymAuth, wrap(async (req) => ({
  body: { timing: await service.updateTiming(gid(req), pid(req), updateTimingSchema.parse(req.body)) },
})));
gymPortalManageRouter.delete("/gym-portal/timings/:id", requireGymAuth, wrap(async (req) => ({ body: await service.deleteTiming(gid(req), pid(req)) })));

gymPortalManageRouter.get("/gym-portal/equipment", requireGymAuth, wrap(async (req) => ({ body: { items: await service.listEquipment(gid(req)) } })));
gymPortalManageRouter.post("/gym-portal/equipment", requireGymAuth, wrap(async (req) => ({
  status: 201,
  body: { equipment: await service.createEquipment(gid(req), createEquipmentSchema.parse(req.body)) },
})));
gymPortalManageRouter.patch("/gym-portal/equipment/:id", requireGymAuth, wrap(async (req) => ({
  body: { equipment: await service.updateEquipment(gid(req), pid(req), updateEquipmentSchema.parse(req.body)) },
})));
gymPortalManageRouter.delete("/gym-portal/equipment/:id", requireGymAuth, wrap(async (req) => ({ body: await service.deleteEquipment(gid(req), pid(req)) })));

gymPortalManageRouter.get("/gym-portal/announcements", requireGymAuth, wrap(async (req) => ({ body: { items: await service.listAnnouncements(gid(req)) } })));
gymPortalManageRouter.post("/gym-portal/announcements", requireGymAuth, wrap(async (req) => ({
  status: 201,
  body: { announcement: await service.createAnnouncement(gid(req), createAnnouncementSchema.parse(req.body)) },
})));
gymPortalManageRouter.delete("/gym-portal/announcements/:id", requireGymAuth, wrap(async (req) => ({ body: await service.deleteAnnouncement(gid(req), pid(req)) })));

gymPortalManageRouter.get("/gym-portal/help-requests", requireGymAuth, wrap(async (req) => {
  const q = listHelpRequestsQuerySchema.parse(req.query);
  return { body: { items: await service.listHelpRequests(gid(req), q.status) } };
}));
gymPortalManageRouter.patch("/gym-portal/help-requests/:id", requireGymAuth, wrap(async (req) => {
  const input = updateHelpRequestSchema.parse(req.body);
  return { body: { request: await service.updateHelpRequestStatus(gid(req), pid(req), input.status) } };
}));
