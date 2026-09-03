import { Router } from "express";
import { requireAdminAuth, AdminAuthedRequest } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import {
  escalateSupportTicketSchema,
  listEscalationsQuerySchema,
  listSupportTicketsQuerySchema,
  resolveEscalationSchema,
  updateSupportTicketSchema,
} from "./adminSupport.schema";
import * as adminSupportService from "./adminSupport.service";

export const adminSupportRouter = Router();

adminSupportRouter.get(
  "/admin/support-tickets",
  requireAdminAuth,
  requirePermission("support", "view"),
  async (req, res, next) => {
    try {
      const query = listSupportTicketsQuerySchema.parse(req.query);
      const result = await adminSupportService.listSupportTickets(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminSupportRouter.get(
  "/admin/support-tickets/:id",
  requireAdminAuth,
  requirePermission("support", "view"),
  async (req, res, next) => {
    try {
      const result = await adminSupportService.getSupportTicketDetail(req.params.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminSupportRouter.patch(
  "/admin/support-tickets/:id",
  requireAdminAuth,
  requirePermission("support", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = updateSupportTicketSchema.parse(req.body);
      const ticket = await adminSupportService.updateSupportTicket(req.adminUserId as string, req.params.id, input);
      res.status(200).json({ ticket });
    } catch (err) {
      next(err);
    }
  },
);

// ---- 08.02 Escalations (added 25 Aug 2026) — see adminSupport.service.ts's
// top comment for why this shipped and 08.03/08.04 didn't. "escalate" is
// gated by "support":"edit" (same as re-triage above) rather than
// "approve" — the `support` module's real, doc-sourced permission matrix
// (adminPermissions.ts) never grants an `approve` action on it, unlike
// `programs`/`professionals`/`commerce`/`admin`/`sensitiveData`.

adminSupportRouter.post(
  "/admin/support-tickets/:id/escalate",
  requireAdminAuth,
  requirePermission("support", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = escalateSupportTicketSchema.parse(req.body);
      const escalation = await adminSupportService.escalateSupportTicket(
        req.adminUserId as string,
        req.params.id,
        input,
      );
      res.status(201).json({ escalation });
    } catch (err) {
      next(err);
    }
  },
);

adminSupportRouter.get(
  "/admin/escalations",
  requireAdminAuth,
  requirePermission("support", "view"),
  async (req, res, next) => {
    try {
      const query = listEscalationsQuerySchema.parse(req.query);
      const result = await adminSupportService.listEscalations(query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

adminSupportRouter.post(
  "/admin/escalations/:id/resolve",
  requireAdminAuth,
  requirePermission("support", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = resolveEscalationSchema.parse(req.body);
      const escalation = await adminSupportService.resolveEscalation(req.adminUserId as string, req.params.id, input);
      res.status(200).json({ escalation });
    } catch (err) {
      next(err);
    }
  },
);
