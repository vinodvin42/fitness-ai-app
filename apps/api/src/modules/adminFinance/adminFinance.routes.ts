import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import * as adminFinanceService from "./adminFinance.service";
import {
  createExpenseSchema,
  financeDateRangeQuerySchema,
  listExpensesQuerySchema,
  listInvoicesQuerySchema,
  upsertTaxConfigSchema,
} from "./adminFinance.schema";

// No new AdminModule permission key — every route below reuses the
// existing "commerce" scope, matching the `finance` role's real,
// design-sourced scope (docs/admin/05-roles-permissions.md collapses
// Finance into Commerce as one governance scope). See
// adminFinance.service.ts's top comment for the full module scope.
export const adminFinanceRouter = Router();

adminFinanceRouter.get(
  "/admin/finance/dashboard",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const query = financeDateRangeQuerySchema.parse(req.query);
      res.status(200).json(await adminFinanceService.getFinanceDashboard(query));
    } catch (err) {
      next(err);
    }
  },
);

adminFinanceRouter.get(
  "/admin/finance/revenue",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const query = financeDateRangeQuerySchema.parse(req.query);
      res.status(200).json(await adminFinanceService.listRevenue(query));
    } catch (err) {
      next(err);
    }
  },
);

adminFinanceRouter.get(
  "/admin/finance/expenses",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const query = listExpensesQuerySchema.parse(req.query);
      res.status(200).json(await adminFinanceService.listExpenses(query));
    } catch (err) {
      next(err);
    }
  },
);

adminFinanceRouter.post(
  "/admin/finance/expenses",
  requireAdminAuth,
  requirePermission("commerce", "create"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = createExpenseSchema.parse(req.body);
      const expense = await adminFinanceService.createExpense(req.adminUserId as string, input);
      res.status(201).json({ expense });
    } catch (err) {
      next(err);
    }
  },
);

adminFinanceRouter.post(
  "/admin/finance/expenses/:id/mark-paid",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const expense = await adminFinanceService.markExpensePaid(req.adminUserId as string, req.params.id);
      res.status(200).json({ expense });
    } catch (err) {
      next(err);
    }
  },
);

adminFinanceRouter.get(
  "/admin/finance/invoices",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const query = listInvoicesQuerySchema.parse(req.query);
      res.status(200).json(await adminFinanceService.listInvoices(query));
    } catch (err) {
      next(err);
    }
  },
);

adminFinanceRouter.get(
  "/admin/finance/receivables-payables",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (_req, res, next) => {
    try {
      res.status(200).json(await adminFinanceService.listReceivablesPayables());
    } catch (err) {
      next(err);
    }
  },
);

adminFinanceRouter.get(
  "/admin/finance/tax-configs",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (_req, res, next) => {
    try {
      res.status(200).json(await adminFinanceService.listTaxConfigs());
    } catch (err) {
      next(err);
    }
  },
);

adminFinanceRouter.post(
  "/admin/finance/tax-configs",
  requireAdminAuth,
  requirePermission("commerce", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = upsertTaxConfigSchema.parse(req.body);
      const taxConfig = await adminFinanceService.upsertTaxConfig(req.adminUserId as string, input);
      res.status(200).json({ taxConfig });
    } catch (err) {
      next(err);
    }
  },
);

adminFinanceRouter.get(
  "/admin/finance/revenue-waterfall",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const query = financeDateRangeQuerySchema.parse(req.query);
      res.status(200).json(await adminFinanceService.getRevenueWaterfall(query));
    } catch (err) {
      next(err);
    }
  },
);

adminFinanceRouter.get(
  "/admin/finance/reports",
  requireAdminAuth,
  requirePermission("commerce", "view"),
  async (req, res, next) => {
    try {
      const query = financeDateRangeQuerySchema.parse(req.query);
      res.status(200).json(await adminFinanceService.financialReports(query));
    } catch (err) {
      next(err);
    }
  },
);
