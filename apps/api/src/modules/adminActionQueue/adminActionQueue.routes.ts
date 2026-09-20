import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { assignActionItem, listActionItems, resolveActionItem } from "../../lib/adminActionQueue";
import { assignActionItemSchema, listActionItemsQuerySchema, resolveActionItemSchema } from "./adminActionQueue.schema";

/**
 * Admin Action Required queue (R2 Wave 1, 20 Sep 2026) — minimal read +
 * assign/resolve endpoints only, per this wave's own scope; the real
 * dashboard screen is Wave 4's own unit (see schema.prisma's
 * `AdminActionItem` doc comment). Gated on the `dashboard` permission
 * module — "Dashboard / Action Required" is named first among Developer
 * 3's own R1 "Admin R1 Functional Areas" (§3), and every existing admin
 * role already holds `dashboard: view`. `edit` is a new grant this wave
 * adds only to `super_admin` (see adminPermissions.ts's own comment on
 * that addition) — deciding which OTHER roles should be able to
 * assign/resolve queue items is a real product/ownership question left
 * for the wave that actually builds per-role triage, not guessed at here.
 */
export const adminActionQueueRouter = Router();

adminActionQueueRouter.get(
  "/admin/action-items",
  requireAdminAuth,
  requirePermission("dashboard", "view"),
  async (req, res, next) => {
    try {
      const query = listActionItemsQuerySchema.parse(req.query);
      const items = await listActionItems(query);
      res.status(200).json({ items });
    } catch (err) {
      next(err);
    }
  },
);

adminActionQueueRouter.post(
  "/admin/action-items/:id/assign",
  requireAdminAuth,
  requirePermission("dashboard", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = assignActionItemSchema.parse(req.body);
      const item = await assignActionItem(req.params.id, req.adminUserId as string, input.adminId);
      res.status(200).json({ item });
    } catch (err) {
      next(err);
    }
  },
);

adminActionQueueRouter.post(
  "/admin/action-items/:id/resolve",
  requireAdminAuth,
  requirePermission("dashboard", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = resolveActionItemSchema.parse(req.body);
      const item = await resolveActionItem(req.params.id, req.adminUserId as string, input.resolutionNote);
      res.status(200).json({ item });
    } catch (err) {
      next(err);
    }
  },
);
