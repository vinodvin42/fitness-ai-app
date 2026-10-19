import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import * as helpService from "./help.service";
import { getGrievanceOfficer } from "../../config/grievanceOfficer";

export const helpRouter = Router();

const listQuerySchema = z.object({
  category: z.enum(helpService.HELP_CATEGORIES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

helpRouter.get("/help/categories", requireAuth, async (_req, res, next) => {
  try {
    res.json(await helpService.listCategories());
  } catch (err) {
    next(err);
  }
});

helpRouter.get("/help/articles", requireAuth, async (req, res, next) => {
  try {
    res.json(await helpService.listArticles(listQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
});

helpRouter.get("/help/articles/:slug", requireAuth, async (req, res, next) => {
  try {
    res.json(await helpService.getArticle(req.params.slug));
  } catch (err) {
    next(err);
  }
});

// 08.03 Complaints (Oct 2026): the grievance officer's details, which must
// be shown on the platform (config/grievanceOfficer.ts). Public, like any
// contact detail; fields are null until the owner supplies them.
helpRouter.get("/help/grievance-officer", (_req, res) => {
  res.json(getGrievanceOfficer());
});
