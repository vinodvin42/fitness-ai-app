import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { listProfessionalRatings, listRelationshipChatBlocks } from "./adminCoachingReads.service";

/** Read-only admin views; see adminCoachingReads.service.ts. */
export const adminCoachingReadsRouter = Router();

// A coach's session ratings (Professional Profile → Reviews tab).
adminCoachingReadsRouter.get(
  "/admin/professionals/:id/ratings",
  requireAdminAuth,
  requirePermission("professionals", "view"),
  async (req, res, next) => {
    try {
      res.status(200).json(await listProfessionalRatings(req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// Chat blocks between the relationship's member and coach (Relationship Detail).
adminCoachingReadsRouter.get(
  "/admin/relationships/:id/chat-blocks",
  requireAdminAuth,
  requirePermission("relationships", "view"),
  async (req, res, next) => {
    try {
      res.status(200).json(await listRelationshipChatBlocks(req.params.id));
    } catch (err) {
      next(err);
    }
  },
);
