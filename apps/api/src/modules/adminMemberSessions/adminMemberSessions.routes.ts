import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { getMemberSessions } from "./adminMemberSessions.service";

/**
 * GET /admin/users/:id/sessions — the member's coach bookings and session
 * credits (read-only). Same gate as the user profile itself (`users: view`).
 */
export const adminMemberSessionsRouter = Router();

adminMemberSessionsRouter.get(
  "/admin/users/:id/sessions",
  requireAdminAuth,
  requirePermission("users", "view"),
  async (req, res, next) => {
    try {
      res.status(200).json(await getMemberSessions(req.params.id));
    } catch (err) {
      next(err);
    }
  },
);
