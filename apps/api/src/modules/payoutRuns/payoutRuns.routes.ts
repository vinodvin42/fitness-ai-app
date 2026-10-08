import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth, AdminAuthedRequest } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { MIN_REASON_LENGTH } from "../../lib/highImpactAction";
import * as service from "./payoutRuns.service";

export const payoutRunsRouter = Router();

const kindSchema = z.enum(["professional_earning", "creator_commission"]);

const createRunSchema = z.object({
  kind: kindSchema,
  reason: z.string().trim().min(MIN_REASON_LENGTH).max(300),
  confirmation: z.string().trim(),
  note: z.string().trim().max(500).optional(),
});

const settleSchema = z.object({
  reason: z.string().trim().min(MIN_REASON_LENGTH).max(300),
  failedIds: z.array(z.string().uuid()).max(500).optional(),
  failureReason: z.string().trim().max(300).optional(),
});

const approveSchema = z.object({
  reason: z.string().trim().min(MIN_REASON_LENGTH).max(300),
});

/**
 * A-M3. Gated by `commerce: approve` — the same module the existing
 * refund and settlement actions use, since this is the same class of
 * action on the same ledgers.
 */

payoutRunsRouter.get(
  "/admin/payout-runs/preview",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.previewPayoutRun(kindSchema.parse(req.query.kind)));
    } catch (err) {
      next(err);
    }
  },
);

payoutRunsRouter.get(
  "/admin/payout-runs",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const kind = req.query.kind ? kindSchema.parse(req.query.kind) : undefined;
      res.json(await service.listPayoutRuns(kind));
    } catch (err) {
      next(err);
    }
  },
);

payoutRunsRouter.post(
  "/admin/payout-runs",
  requireAdminAuth,
  requirePermission("commerce", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = createRunSchema.parse(req.body);
      res.status(201).json(await service.createPayoutRun(req.adminUserId!, input.kind, input));
    } catch (err) {
      next(err);
    }
  },
);

payoutRunsRouter.post(
  "/admin/payout-runs/:id/settle",
  requireAdminAuth,
  requirePermission("commerce", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = settleSchema.parse(req.body);
      res.json(await service.settlePayoutRun(req.adminUserId!, req.params.id, input));
    } catch (err) {
      next(err);
    }
  },
);

payoutRunsRouter.post(
  "/admin/settlements/:id/approve",
  requireAdminAuth,
  requirePermission("commerce", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = approveSchema.parse(req.body);
      res.json(await service.approveEarning(req.adminUserId!, req.params.id, input.reason));
    } catch (err) {
      next(err);
    }
  },
);
