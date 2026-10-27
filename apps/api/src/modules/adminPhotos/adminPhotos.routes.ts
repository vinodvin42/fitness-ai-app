import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as adminPhotosService from "./adminPhotos.service";

/**
 * Admin console profile photos (owner decision, 27 Oct 2026); see adminPhotos.service.ts.
 * `photo` is null when none is set. The console keys its cache by the list's `photoUpdatedAt`,
 * so a short private cache is safe.
 */
export const adminPhotosRouter = Router();

const CACHE_CONTROL = "private, max-age=300";

adminPhotosRouter.get("/admin/users/:id/photo", requireAdminAuth, requirePermission("users", "view"), async (req, res, next) => {
  try {
    const photo = await adminPhotosService.getUserPhoto(req.params.id);
    res.set("Cache-Control", CACHE_CONTROL).json({ photo });
  } catch (err) {
    next(err);
  }
});

adminPhotosRouter.get(
  "/admin/professionals/:id/photo",
  requireAdminAuth,
  requirePermission("professionals", "view"),
  async (req, res, next) => {
    try {
      const photo = await adminPhotosService.getProfessionalPhoto(req.params.id);
      res.set("Cache-Control", CACHE_CONTROL).json({ photo });
    } catch (err) {
      next(err);
    }
  },
);
