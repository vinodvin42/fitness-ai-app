import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { requireAdminAuth, AdminAuthedRequest } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as service from "./privacyRequests.service";
import * as usersService from "../users/users.service";
import {
  createPrivacyRequestSchema,
  listPrivacyRequestsQuerySchema,
  privacyResolutionSchema,
  privacyStepSchema,
} from "./privacyRequests.schema";

export const privacyRequestsRouter = Router();

/**
 * Journey F8, both ends. The consumer side is U-M17 ("Privacy request
 * status: export preparing / ready, deletion scheduled / cancelled");
 * the admin side is A-M5 ("Privacy request detail: verify identity,
 * fulfil export, schedule deletion, confirm").
 *
 * Gated by `sensitiveData: view` on the admin side, matching the
 * existing 12.04 Privacy dashboard rather than inventing a new
 * permission key — a subject-rights queue exposes exactly the data that
 * key already governs.
 */

// ---- Consumer -------------------------------------------------------

privacyRequestsRouter.post("/users/me/privacy-requests", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = createPrivacyRequestSchema.parse(req.body);
    res.status(201).json(await service.createPrivacyRequest(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

privacyRequestsRouter.get("/users/me/privacy-requests", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await service.listMyPrivacyRequests(req.userId!));
  } catch (err) {
    next(err);
  }
});

privacyRequestsRouter.post(
  "/users/me/privacy-requests/:id/cancel",
  requireAuth,
  async (req: AuthedRequest, res, next) => {
    try {
      res.json(await service.cancelMyPrivacyRequest(req.userId!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// ---- Admin ----------------------------------------------------------

privacyRequestsRouter.get(
  "/admin/privacy-requests",
  requireAdminAuth,
  requirePermission("sensitiveData", "view"),
  async (req, res, next) => {
    try {
      const query = listPrivacyRequestsQuerySchema.parse(req.query);
      res.json(await service.listPrivacyRequests(query));
    } catch (err) {
      next(err);
    }
  },
);

privacyRequestsRouter.get(
  "/admin/privacy-requests/:id",
  requireAdminAuth,
  requirePermission("sensitiveData", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getPrivacyRequest(req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

privacyRequestsRouter.post(
  "/admin/privacy-requests/:id/verify",
  requireAdminAuth,
  requirePermission("sensitiveData", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = privacyStepSchema.parse(req.body);
      res.json(await service.verifyPrivacyRequest(req.adminUserId!, req.params.id, input.reason));
    } catch (err) {
      next(err);
    }
  },
);

privacyRequestsRouter.post(
  "/admin/privacy-requests/:id/start",
  requireAdminAuth,
  requirePermission("sensitiveData", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = privacyStepSchema.parse(req.body);
      res.json(await service.startPrivacyRequest(req.adminUserId!, req.params.id, input.reason));
    } catch (err) {
      next(err);
    }
  },
);

privacyRequestsRouter.post(
  "/admin/privacy-requests/:id/complete",
  requireAdminAuth,
  requirePermission("sensitiveData", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = privacyResolutionSchema.parse(req.body);
      // The cascade knowledge stays in users.service.ts — this module
      // must not grow a second, divergent idea of what "delete a user"
      // means (acceptance test 17).
      const result = await service.completePrivacyRequest(req.adminUserId!, req.params.id, input, (userId) =>
        usersService.hardDeleteUserForPrivacyRequest(userId),
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

privacyRequestsRouter.post(
  "/admin/privacy-requests/:id/reject",
  requireAdminAuth,
  requirePermission("sensitiveData", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = privacyResolutionSchema.parse(req.body);
      res.json(await service.rejectPrivacyRequest(req.adminUserId!, req.params.id, input));
    } catch (err) {
      next(err);
    }
  },
);
