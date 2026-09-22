import { Router } from "express";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import * as service from "./adminSearch.service";
import { adminSearchQuerySchema } from "./adminSearch.schema";

/**
 * Global cross-entity admin search — R1 Wave 6 (22 Sep 2026). See
 * adminSearch.service.ts's own doc comment for the full scope. Deliberately
 * no `requirePermission(...)` route guard here (unlike every other admin
 * module) — which entity types get searched is a per-type decision made
 * inside `globalSearch()` via `hasPermission()`, since a single search
 * spans four different modules' permission grants at once. Any admin with a
 * valid session can call this endpoint; a role with none of
 * users/professionals/gyms/growth `view` simply always gets `results: []`,
 * the same honest empty state the UI already needs for "no matches".
 */
export const adminSearchRouter = Router();

adminSearchRouter.get("/admin/search", requireAdminAuth, async (req: AdminAuthedRequest, res, next) => {
  try {
    const query = adminSearchQuerySchema.parse(req.query);
    res.status(200).json(await service.globalSearch(req.adminRole, query));
  } catch (err) {
    next(err);
  }
});
