import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import * as programPurchasesService from "./programPurchases.service";

export const programPurchasesRouter = Router();

// Registered before programsRouter's "/programs/:id" in app.ts — otherwise
// Express would match "mine" as the :id param.
programPurchasesRouter.get("/programs/mine", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await programPurchasesService.listMyPrograms(req.userId!) });
  } catch (err) {
    next(err);
  }
});

programPurchasesRouter.post("/programs/:id/purchase", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const purchase = await programPurchasesService.purchaseProgram(req.userId!, req.params.id);
    res.status(201).json(purchase);
  } catch (err) {
    next(err);
  }
});

// Backs both Program Progress and Program Completion on the client — same
// data, `status` decides which UI to show.
programPurchasesRouter.get("/programs/:id/progress", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await programPurchasesService.getProgramProgress(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});
