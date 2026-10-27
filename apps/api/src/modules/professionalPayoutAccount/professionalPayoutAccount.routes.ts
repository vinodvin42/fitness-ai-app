import { Router } from "express";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { requireAdminAuth, AdminAuthedRequest } from "../../middleware/adminAuth";
import { hasPermission, requirePermission } from "../../middleware/adminPermissions";
import { ApiHttpError } from "../../middleware/errorHandler";
import { isPayoutCryptoConfigured } from "./payoutCrypto";
import { revealPayoutAccountSchema, savePayoutAccountSchema, verifyPayoutAccountSchema } from "./professionalPayoutAccount.schema";
import * as service from "./professionalPayoutAccount.service";

export const professionalPayoutAccountRouter = Router();

// ---- Coach: their own payout details (27 Oct 2026). See the service. ------

professionalPayoutAccountRouter.get(
  "/professionals/me/payout-account",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.status(200).json(await service.getMyPayoutAccount(req.professionalId as string));
    } catch (err) {
      next(err);
    }
  },
);

professionalPayoutAccountRouter.put(
  "/professionals/me/payout-account",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      // Refuse before reading the body: without the key nothing could be stored safely.
      if (!isPayoutCryptoConfigured()) throw service.payoutDetailsUnavailable();
      const input = savePayoutAccountSchema.parse(req.body);
      res.status(200).json(await service.saveMyPayoutAccount(req.professionalId as string, input));
    } catch (err) {
      next(err);
    }
  },
);

// ---- Admin -----------------------------------------------------------------

// Masked view, on the professional's profile page.
professionalPayoutAccountRouter.get(
  "/admin/professionals/:id/payout-account",
  requireAdminAuth,
  requirePermission("professionals", "view"),
  async (req, res, next) => {
    try {
      res.status(200).json(await service.getPayoutAccountForAdmin(String(req.params.id)));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * The full details, for paying the coach. Needs `commerce: approve`, the same
 * grant as creating and settling payout runs (payoutRuns.routes.ts), plus a
 * written reason that goes to the audit log.
 *
 * Guarded as a READ (`commerce: view`, which also re-checks the admin's live
 * role) with the `approve` grant checked here, NOT as `requirePermission(
 * "commerce", "approve")`: that would route a non-Super-Admin's reveal through
 * maker-checker, and replaying an approved request stores its response —
 * the plaintext — on the ApprovalRequest row.
 */
professionalPayoutAccountRouter.post(
  "/admin/professionals/:id/payout-account/reveal",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      if (!hasPermission(req.adminRole, "commerce", "approve")) {
        throw new ApiHttpError(403, "forbidden", `Your role (${req.adminRole}) can't see full payout details`);
      }
      const { reason } = revealPayoutAccountSchema.parse(req.body);
      const details = await service.revealPayoutAccount(req.adminUserId as string, String(req.params.id), reason);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(details);
    } catch (err) {
      next(err);
    }
  },
);

// Verify or reject: decides where a coach's money goes, so it is gated like a
// payout run (`commerce: approve`) and goes through maker-checker for anyone
// but the Super Admin.
professionalPayoutAccountRouter.post(
  "/admin/professionals/:id/payout-account/verify",
  requireAdminAuth,
  requirePermission("commerce", "approve"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = verifyPayoutAccountSchema.parse(req.body);
      res.status(200).json(await service.verifyPayoutAccount(req.adminUserId as string, String(req.params.id), input));
    } catch (err) {
      next(err);
    }
  },
);
