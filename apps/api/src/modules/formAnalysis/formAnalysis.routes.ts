import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { createFormAnalysisSchema, reviewFormAnalysisSchema } from "./formAnalysis.schema";
import * as formAnalysisService from "./formAnalysis.service";

export const formAnalysisRouter = Router();

formAnalysisRouter.post("/form-analysis", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = createFormAnalysisSchema.parse(req.body);
    res.status(201).json(await formAnalysisService.createSubmission(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

formAnalysisRouter.get("/form-analysis", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await formAnalysisService.listSubmissions(req.userId!));
  } catch (err) {
    next(err);
  }
});

formAnalysisRouter.get("/form-analysis/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await formAnalysisService.getSubmission(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});

formAnalysisRouter.get(
  "/professionals/me/form-analysis",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.json(await formAnalysisService.listForProfessional(req.professionalId as string));
    } catch (err) {
      next(err);
    }
  },
);

formAnalysisRouter.get(
  "/professionals/me/form-analysis/:id",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.json(await formAnalysisService.getForProfessional(req.professionalId as string, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

formAnalysisRouter.post(
  "/professionals/me/form-analysis/:id/review",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = reviewFormAnalysisSchema.parse(req.body);
      res.json(await formAnalysisService.reviewSubmission(req.professionalId as string, req.params.id, input.coachNote));
    } catch (err) {
      next(err);
    }
  },
);
