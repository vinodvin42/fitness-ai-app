import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth, AdminAuthedRequest } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { writeRateLimit } from "../../middleware/rateLimit";
import {
  createApplicationSchema,
  listApplicationsQuery,
  updateApplicationSchema,
} from "./publicApplications.schema";
import * as service from "./publicApplications.service";

export const publicApplicationsRouter = Router();

/**
 * Spec §8 — the endpoint behind the Public Website's Early Access,
 * partner application and contact forms.
 *
 * Unauthenticated by design (nobody has an account yet, which is the
 * point of the form) and therefore rate-limited: an open write endpoint
 * with an email column is a spam target, and `writeRateLimit` is the
 * same limiter the other unauthenticated writes already use. It now
 * shares a Redis store when one is configured, so the limit is real
 * behind more than one instance — see lib/redis.ts.
 *
 * The response's `outcome` is what drives the four states the spec names
 * for these forms. `already_registered` is deliberately a 200, not a
 * 409: from the visitor's side "you're already on the list" is the
 * outcome they wanted, and an error would just teach them to submit
 * again with a different address.
 */
publicApplicationsRouter.post("/public/applications", writeRateLimit, async (req, res, next) => {
  try {
    const input = createApplicationSchema.parse(req.body);
    const result = await service.createApplication(input);

    if (result.outcome === "already_registered") {
      return res.status(200).json({
        outcome: "already_registered",
        since: result.since,
      });
    }

    return res.status(201).json({ outcome: "created", id: result.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      // Field-level messages, so the form can mark the offending input
      // rather than showing one generic banner — including the consent
      // checkbox, which is the one failure a visitor can actually fix.
      return res.status(400).json({
        error: {
          code: "validation_error",
          message: "Please check the highlighted fields",
          fields: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
    }
    next(err);
  }
});

/**
 * The admin side. A form that writes to a table nobody can read is only
 * marginally better than the `mailto:` it replaced, so the queue is
 * readable and workable from the start.
 *
 * Gated by `growth` rather than `users`: these are leads and partner
 * applications, not accounts, and the marketing/growth roles are the
 * ones expected to work them.
 */
publicApplicationsRouter.get(
  "/admin/applications",
  requireAdminAuth,
  requirePermission("growth", "view"),
  async (req, res, next) => {
    try {
      const query = listApplicationsQuery.parse(req.query);
      res.status(200).json(await service.listApplications(query));
    } catch (err) {
      next(err);
    }
  },
);

publicApplicationsRouter.patch(
  "/admin/applications/:id",
  requireAdminAuth,
  requirePermission("growth", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = updateApplicationSchema.parse(req.body);
      res.status(200).json(await service.updateApplication(req.params.id, req.adminUserId!, input));
    } catch (err) {
      next(err);
    }
  },
);
