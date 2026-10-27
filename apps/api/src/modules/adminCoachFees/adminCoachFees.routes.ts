import { Router } from "express";
import { requireAdminAuth, AdminAuthedRequest } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { getMyLevel } from "../professionalDashboard/professionalDashboard.service";

/**
 * One coach's level and fee structure for the admin profile (27 Oct 2026,
 * owner: "there is no fee structure of coach in admin"). The same view the
 * coach sees on Earnings (getMyLevel): level, each service's fee, the
 * scheduled change, commission and GST. Read-only; levels, fees and
 * commission are still changed under Commerce > Coach levels.
 */
export const adminCoachFeesRouter = Router();

adminCoachFeesRouter.get(
  "/admin/professionals/:id/fees",
  requireAdminAuth,
  requirePermission("professionals", "view"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const id = String(req.params.id);
      const exists = await prisma.professional.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new ApiHttpError(404, "not_found", "Professional not found");
      res.status(200).json(await getMyLevel(id));
    } catch (err) {
      next(err);
    }
  },
);
