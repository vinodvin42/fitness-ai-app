import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import * as learnService from "./learn.service";

// 05.04 Educational Content (Oct 2026) — the app's Learn library. See
// learn.service.ts.
export const learnRouter = Router();

const listQuerySchema = z.object({
  topic: z.enum(learnService.ARTICLE_TOPICS).optional(),
});

learnRouter.get("/learn/articles", requireAuth, async (req, res, next) => {
  try {
    res.json(await learnService.listArticles(listQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
});

learnRouter.get("/learn/articles/:slug", requireAuth, async (req, res, next) => {
  try {
    res.json(await learnService.getArticle(req.params.slug));
  } catch (err) {
    next(err);
  }
});
